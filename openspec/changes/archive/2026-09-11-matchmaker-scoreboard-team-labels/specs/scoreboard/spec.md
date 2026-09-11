# Specification: scoreboard

## ADDED Requirements

### Requirement: 綁定場次的隊伍標示

以 `?match=<matchId>` 開啟且綁定有效（`bindingStatus === "bound"`）時，兩隊面板 SHALL 顯示該隊球員的姓名與雙色漸層色塊：單打每隊 1 筆、雙打每隊 2 筆，資料來源為對戰頁在建立 seed 時寫入 `state.teamPlayers` 的球員顯示資訊（見 `match-stage` capability 的「場地區塊的計分板入口」Requirement）。

`teamPlayers` 為 `null` 時（獨立 `/scoreboard`，或本次變更前已建立的舊版計分板槽）MUST 維持既有的「我方」／「對方」純文字呈現，SHALL NOT 因本 Requirement 而改變任何既有互動——這是為既有的獨立計分板使用者與已在使用中的綁定場次保留的向後相容路徑，也是本 Requirement 唯一涉及的行為分歧點。

計分板 SHALL NOT 自行計算球員姓名色塊的前景文字色，MUST 直接採用 `teamPlayers` 內已算好的 `foreground` 欄位——`scoreboard` capability 不得 import `lib/matchmaker/`（`matchmaker-scoreboard-binding` design Decision 2 的單向相依）。若計分板自行判斷亮度，日後 `pickTextColor` 的公式調整將只影響對戰頁而不影響計分板，兩處的文字可讀性會逐漸分歧。

`teamPlayers` 為 seed 建立當下的**快照**：球員之後改名或改色不會回頭同步既有分槽內容，需等該場次重新走一次「進入計分板」的 seed 建立流程才會更新（且該流程 SHALL NOT 覆蓋既有進度，見 `match-stage` capability 的「已有進度時再次進入不覆蓋」Scenario，因此進行中的場次即使重新進入也不會更新已顯示的姓名色塊）。此為刻意接受的限制：與 `match-history` capability「姓名快照優先於即時查表」的既有設計精神一致（球員被刪除或改名後，快照仍需完整呈現當時狀態），但兩者各自獨立實作、不共用 schema。

`teamPlayers` MUST 隨 `mode`、`firstServer`、`targetScore`、`matchId`、`courtNumber` 一併被視為「重建初始狀態時要原樣帶入」的欄位：UNDO 以「重建初始 state 後 replay」實作（見「Undo 機制」Requirement），RESET 亦重建初始狀態，兩者若未帶入 `teamPlayers`，球員姓名色塊會在使用者按下 Undo 或重置的瞬間**靜默消失**，此失效路徑僅在使用者操作 Undo／重置時顯現，正常計分完全正常，MUST 有獨立測試覆蓋。

顯示位置 MUST 為 `nextjs-pickball/components/scoreboard/TeamPanel.tsx` 既有的名稱行，SHALL NOT 新增獨立的列或區塊——理由與「目標分數可見性」Requirement 相同：頁面為 `h-dvh` + `overflow-hidden` 鎖高，新增節點會壓縮分數面板的高度預算，且溢出時的失敗模式是靜默裁切而非出現捲軸。加入球員姓名色塊後，多 viewport 零捲動的既有驗收基準（見「RWD 排版」Requirement）MUST 於綁定模式下重新確認仍然成立。

姓名色塊 MUST 顯示姓名文字，SHALL NOT 只呈現色塊而無文字——色彩不得作為唯一資訊來源（`prd.md` 12.5）。

實作位於 `nextjs-pickball/lib/scoreboard/types.ts`（`teamPlayers` 欄位與其型別）、`nextjs-pickball/lib/scoreboard/reducer.ts`（UNDO／RESET／HYDRATE 保留）與 `nextjs-pickball/components/scoreboard/TeamPanel.tsx`（既有名稱行的渲染）；seed 的建立邏輯屬 `match-stage` capability。

#### Scenario: 綁定模式兩隊面板顯示球員姓名色塊

- **GIVEN** 由對戰頁的「進入計分板」入口進入某場雙打對戰的計分板
- **WHEN** 檢視兩隊面板的名稱行
- **THEN** 每隊面板顯示該隊兩位球員的姓名，且各自帶有以其 `colorFrom`／`colorTo` 為漸層背景、`foreground` 為文字色的色塊
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「由對戰頁進入時面板顯示球員姓名」

#### Scenario: UNDO 與 RESET 保留 teamPlayers

- **GIVEN** `teamPlayers` 不為 `null`、比賽進行中且 `history.length > 0`
- **WHEN** dispatch UNDO，接著 dispatch RESET
- **THEN** 兩次的結果 state 之 `teamPlayers` 皆與原值相同（SHALL NOT 退回 `null`）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 與 RESET 後保留 teamPlayers，不退回 null」

#### Scenario: HYDRATE 保留 teamPlayers

- **GIVEN** localStorage 中儲存的 state 含非 `null` 的 `teamPlayers`
- **WHEN** 頁面重整後 dispatch HYDRATE
- **THEN** 還原後的 state 之 `teamPlayers` 與儲存值相同
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「HYDRATE 原樣保留帶入的 teamPlayers」

#### Scenario: 綁定模式含球員姓名色塊時多 viewport 仍零捲動

- **GIVEN** viewport 為 390x844（手機直向）、844x390（手機橫向）、768x1024（平板直向）或 1024x600（桌機臨界）之一
- **WHEN** 以帶球員姓名色塊的雙打對戰開啟 `/scoreboard?match=<有效 matchId>`
- **THEN** `document.scrollingElement.scrollHeight <= clientHeight + 1`，且兩顆「贏這球+」與「撤銷上一分」「重置比賽」按鈕的 boundingBox 完整落在 viewport 內
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「綁定模式含球員姓名色塊時多 viewport 仍零捲動」

## MODIFIED Requirements

### Requirement: localStorage 持久化

系統 SHALL 於每次 state 變更後把計分狀態寫入 localStorage，並 SHALL 於頁面 mount 後還原。寫入的**槽位**由 state 的 `matchId` 決定：

| `matchId` | 槽位 | 用途 |
|---|---|---|
| `null` | `localStorage["scoreboard:current:v1"]`（單一物件） | 獨立使用 `/scoreboard`，行為與本次變更前逐字相同 |
| 非 `null` | `localStorage["scoreboard:matches:v1"]` 內以 `matchId` 為鍵的條目 | 由對戰場次進入的計分板，一場一槽 |

分槽是**必要**而非最佳化：現行單一場次的設計下，主持人開多個場地並依序進入計分板時，後一場的第一球會覆蓋前一場的進度，且既有的「損壞資料 fallback」機制會讓覆蓋**靜默發生**——使用者只看到分數消失，沒有任何錯誤提示（`prd.md` 6.3.1、13.4）。

寫入的槽位 MUST 由 `state.matchId` 推導，SHALL NOT 由呼叫端另外傳入槽位參數——兩個真實來源會讓「寫錯槽」成為可能的失效模式，而該失效同樣是靜默的。

寫入前與讀取後 MUST 經 zod schema 驗證。`scoreboard:current:v1` 驗證失敗 MUST 清除該 key 並以 `createInitialState()` 起手，SHALL NOT 讓損壞資料使頁面崩潰。`scoreboard:matches:v1` MUST **逐筆降級**：整份不是合法 JSON 或不是物件時清除整個 key；能解析為物件時，僅丟棄無法通過 `ScoreboardStateSchema` 的條目並以 `console.warn` 記錄被丟棄的筆數，其餘場地的進度 MUST 保留——一個場地的損壞資料 SHALL NOT 連坐清空其他正在進行中的場地。

**向後相容策略**：往 `ScoreboardStateSchema` 新增欄位時 MUST 以 zod `.default()` 提供預設值，使既有的 v1 資料在缺少該欄位時被補值而非判定為損壞；SHALL NOT 因新增欄位而 bump storage key —— 兩種做法都會讓已在進行中的比賽在使用者重整頁面時分數歸零，而「清除損壞資料」的既有機制會讓這件事**靜默發生**（`safeParse` 失敗 → `removeItem` → 回 null → 以初始 state 起手），使用者只會看到分數消失，沒有任何錯誤提示。本次新增的 `matchId` 欄位 MUST 為 `z.string().nullable().default(null)`，使本次變更前寫入 `scoreboard:current:v1` 的資料被補為 `null`（即獨立計分板）而非判定為損壞。本次變更新增的 `teamPlayers` 欄位比照 `matchId`／`courtNumber` 的既有先例，同為 `.nullable().default(null)`，使本次變更前寫入的資料與獨立計分板皆被補為 `null`（不顯示球員姓名色塊）而非判定為損壞。

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
