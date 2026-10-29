## MODIFIED Requirements

### Requirement: 本機模式的 localStorage 持久化

系統 SHALL 於每次 state 變更後把計分狀態寫入 localStorage，並 SHALL 於頁面 mount 後還原。寫入的**槽位**由 state 的 `matchId` 決定：

| `matchId` | 槽位 | 用途 |
|---|---|---|
| `null` | `localStorage["scoreboard:current:v1"]`（單一物件） | 獨立使用 `/scoreboard`，行為與本次變更前逐字相同 |
| 非 `null` | `localStorage["scoreboard:matches:v1"]` 內以 `matchId` 為鍵的條目 | 由對戰場次進入的計分板，一場一槽 |

分槽是**必要**而非最佳化：現行單一場次的設計下，主持人開多個場地並依序進入計分板時，後一場的第一球會覆蓋前一場的進度，且既有的「損壞資料 fallback」機制會讓覆蓋**靜默發生**——使用者只看到分數消失，沒有任何錯誤提示（`prd.md` 6.3.1、13.4）。

寫入的槽位 MUST 由 `state.matchId` 推導，SHALL NOT 由呼叫端另外傳入槽位參數——兩個真實來源會讓「寫錯槽」成為可能的失效模式，而該失效同樣是靜默的。

寫入前與讀取後 MUST 經 zod schema 驗證。`scoreboard:current:v1` 驗證失敗 MUST 清除該 key 並以 `createInitialState()` 起手，SHALL NOT 讓損壞資料使頁面崩潰。`scoreboard:matches:v1` MUST **逐筆降級**：整份不是合法 JSON 或不是物件時清除整個 key；能解析為物件時，僅丟棄無法通過 `ScoreboardStateSchema` 的條目並以 `console.warn` 記錄被丟棄的筆數，其餘場地的進度 MUST 保留——一個場地的損壞資料 SHALL NOT 連坐清空其他正在進行中的場地。

**向後相容策略**：往 `ScoreboardStateSchema` 新增欄位時 MUST 以 zod `.default()` 提供預設值，使既有的 v1 資料在缺少該欄位時被補值而非判定為損壞；SHALL NOT 因新增欄位而 bump storage key —— 兩種做法都會讓已在進行中的比賽在使用者重整頁面時分數歸零，而「清除損壞資料」的既有機制會讓這件事**靜默發生**（`safeParse` 失敗 → `removeItem` → 回 null → 以初始 state 起手），使用者只會看到分數消失，沒有任何錯誤提示。本次新增的 `matchId` 欄位 MUST 為 `z.string().nullable().default(null)`，使本次變更前寫入 `scoreboard:current:v1` 的資料被補為 `null`（即獨立計分板）而非判定為損壞。本次變更新增的 `teamPlayers` 欄位比照 `matchId`／`courtNumber` 的既有先例，同為 `.nullable().default(null)`，使本次變更前寫入的資料與獨立計分板皆被補為 `null`（不顯示球員姓名色塊）而非判定為損壞。

**儲存模式**（`user-data-sync`「前端依 session 選擇儲存模式」）：本 Requirement 只規範**本機模式**的行為。
雲端模式（已登入）下，不論 `matchId` 是否為 `null`，計分狀態皆改由「登入時獨立計分板以雲端為準」Requirement 規範：使用者操作（dispatch）SHALL NOT 改變
`localStorage["scoreboard:current:v1"]` 與 `localStorage["scoreboard:matches:v1"]` 的內容——兩個 key 保留的是訪客時期的資料（作為本機資料匯入雲端的來源），雲端模式把比分寫進它們會讓登出後的訪客看到登入時的比賽。
選擇器仍會掛載本機實作（hooks 不可條件式呼叫），因此 mount 時本機實作仍依本 Requirement 讀取這兩個 key：損壞資料照既有規則清除或逐筆降級，讀到的合法狀態可能以相同內容重新序列化寫回；這些讀寫不改變使用者可見的訪客資料。
場次分槽的生命週期與對戰回合綁定（建立、自動送出、鎖定目標分數、清除），分槽 MUST 與回合留在同一個儲存位置：本機模式皆在 LocalStorage，雲端模式皆在後端（`round-lifecycle`「回合與送出比分的雲端 API」）。

實作位於 `nextjs-pickball/lib/scoreboard/storage.ts`（依 `matchId` 分派的唯一對外入口）與 `nextjs-pickball/lib/scoreboard/match-slots.ts`（分槽 key 的 schema、逐筆降級與批次清除），驗收錨點為 `nextjs-pickball/lib/scoreboard/storage.test.ts` 與 `nextjs-pickball/lib/scoreboard/match-slots.test.ts`。

#### Scenario: 分數自動保存

- **WHEN** 使用者更新分數（dispatch RALLY_WON / UNDO / RESET）且 `matchId === null`
- **THEN** 當前 state 寫入 `localStorage["scoreboard:current:v1"]`（zod 驗證後序列化），保存內容含分數、發球狀態、history、`mode`、`firstServer`（起手方設定，UNDO replay 必要）、`targetScore`、`matchId` 與 `teamPlayers`
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「write 後 read 可取回相同 state」

#### Scenario: 頁面重整回復

- **WHEN** 使用者重整頁面，localStorage 有合法的 state
- **THEN** 頁面 mount 後 dispatch HYDRATE，恢復分數、發球狀態與目標分數
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「localStorage 持久化：reload 後分數保留」

#### Scenario: 舊版資料缺少 targetScore 時補預設值

- **GIVEN** `localStorage["scoreboard:current:v1"]` 存有本次變更前寫入的資料（不含 `targetScore` 欄位）且其餘欄位合法
- **WHEN** 呼叫 `readScoreboard()`
- **THEN** 回傳的 state 之 `targetScore` 為 `11`，該 key SHALL NOT 被清除，比賽的分數與 history 完整保留
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「舊版資料缺 targetScore 時補為 11 且不清除 key」

#### Scenario: 舊版資料缺少 matchId 時補為 null

- **GIVEN** `localStorage["scoreboard:current:v1"]` 存有本次變更前寫入的資料（不含 `matchId` 欄位）且其餘欄位合法
- **WHEN** 呼叫 `readScoreboard()`
- **THEN** 回傳的 state 之 `matchId` 為 `null`（即獨立計分板），該 key SHALL NOT 被清除，比賽的分數與 history 完整保留
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「舊版資料缺 matchId 時補為 null 且不清除 key」

#### Scenario: 舊版資料缺少 teamPlayers 時補為 null

- **GIVEN** `localStorage["scoreboard:matches:v1"]` 內某條目為本次變更前寫入的資料（不含 `teamPlayers` 欄位）且其餘欄位合法
- **WHEN** 呼叫讀取全部槽位的函式
- **THEN** 該條目的 `teamPlayers` 為 `null`（維持我方／對方純文字呈現），不因缺少此欄位被判為損壞而丟棄
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「舊版資料缺 teamPlayers 時補為 null 且不清除該筆」

#### Scenario: 損壞資料 fallback

- **WHEN** `scoreboard:current:v1` 的資料無法通過 zod schema 驗證
- **THEN** 清除 key，以 `createInitialState()` 起手，console.warn 記錄錯誤
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「資料為非 JSON 時 read 回 null 並清 key，且 warn」與「資料 schema 不合法時 read 回 null 並清 key，且 warn」

#### Scenario: 多場地各自存槽互不覆蓋

- **GIVEN** 兩個 `matchId`（`m1`、`m2`）各自有進行中的計分狀態
- **WHEN** 對 `m2` 寫入新的 state
- **THEN** `scoreboard:matches:v1` 內 `m1` 的條目分數、history 與 `targetScore` 完全不變，`scoreboard:current:v1` 亦不被寫入
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「寫入某場次的槽不影響其他場次與獨立槽」

#### Scenario: 分槽逐筆降級

- **GIVEN** `scoreboard:matches:v1` 為合法 JSON 物件，其中 `m1` 的條目缺少必要欄位、`m2` 的條目合法
- **WHEN** 呼叫讀取全部槽位的函式
- **THEN** 回傳只含 `m2` 的條目、`droppedCount` 為 1，並 console.warn 記錄；`m2` 的進度 SHALL NOT 被清除
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「單筆損壞只丟該筆並回報 droppedCount，其餘場次保留」

#### Scenario: 整份分槽資料非 JSON 時清除整個 key

- **GIVEN** `scoreboard:matches:v1` 的內容不是合法 JSON（或解析後不是物件）
- **WHEN** 呼叫讀取全部槽位的函式
- **THEN** 移除該 key、回傳空的槽位集合並 console.warn；`scoreboard:current:v1` SHALL NOT 被連帶清除
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「整份非 JSON 時清除分槽 key 且不動獨立槽」

#### Scenario: 批次清除指定場次的槽

- **GIVEN** `scoreboard:matches:v1` 內有 `m1`、`m2`、`m3` 三個條目
- **WHEN** 以 `["m1", "m3"]` 呼叫批次清除
- **THEN** 只剩 `m2` 的條目；清除不存在的 `matchId` SHALL NOT 拋錯
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「批次清除只移除指定場次且忽略不存在的 id」

#### Scenario: 登入且未綁定場次時不寫入本機獨立槽

- **GIVEN** session 為已登入（mock `useSession`），且雲端 GET 回 `{ data: null, version: 0 }`
- **WHEN** `useScoreboardStore(null)` dispatch `RALLY_WON`
- **THEN** `localStorage["scoreboard:current:v1"]` 不存在（未被寫入）
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「雲端模式下 dispatch 不寫入 scoreboard:current:v1」

#### Scenario: 登入且帶 matchId 時不寫入本機分槽

- **GIVEN** session 為已登入（mock `useSession`），`GET /api/matchmaker/slots/m1` 回 `m1` 的分槽（version 1）
- **WHEN** `useScoreboardStore("m1")` mount 並 dispatch `RALLY_WON`
- **THEN** `localStorage["scoreboard:matches:v1"]` 不存在（未被寫入）；送出 `PUT /api/matchmaker/slots/m1`
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「已登入且帶 matchId 時改用雲端分槽且不寫入 scoreboard:matches:v1」
