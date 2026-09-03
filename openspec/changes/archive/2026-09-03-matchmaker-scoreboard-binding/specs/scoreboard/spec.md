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

**向後相容策略**：往 `ScoreboardStateSchema` 新增欄位時 MUST 以 zod `.default()` 提供預設值，使既有的 v1 資料在缺少該欄位時被補值而非判定為損壞；SHALL NOT 因新增欄位而 bump storage key —— 兩種做法都會讓已在進行中的比賽在使用者重整頁面時分數歸零，而「清除損壞資料」的既有機制會讓這件事**靜默發生**（`safeParse` 失敗 → `removeItem` → 回 null → 以初始 state 起手），使用者只會看到分數消失，沒有任何錯誤提示。本次新增的 `matchId` 欄位 MUST 為 `z.string().nullable().default(null)`，使本次變更前寫入 `scoreboard:current:v1` 的資料被補為 `null`（即獨立計分板）而非判定為損壞。

實作位於 `nextjs-pickball/lib/scoreboard/storage.ts`（依 `matchId` 分派的唯一對外入口）與 `nextjs-pickball/lib/scoreboard/match-slots.ts`（分槽 key 的 schema、逐筆降級與批次清除），驗收錨點為 `nextjs-pickball/lib/scoreboard/storage.test.ts` 與 `nextjs-pickball/lib/scoreboard/match-slots.test.ts`。

#### Scenario: 分數自動保存

- **WHEN** 使用者更新分數（dispatch RALLY_WON / UNDO / RESET）且 `matchId === null`
- **THEN** 當前 state 寫入 `localStorage["scoreboard:current:v1"]`（zod 驗證後序列化），保存內容含分數、發球狀態、history、`mode`、`firstServer`（起手方設定，UNDO replay 必要）、`targetScore` 與 `matchId`
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

---

### Requirement: 賽前設定與階段鎖定

系統 SHALL 於 `status === "setup"` 期間允許調整比賽形式（`mode`：單打／雙打）、先發球方（`firstServer`）與目標分數（`targetScore`：11／15／21），並 MUST 在 `playing` 與 `finished` 階段忽略這三個 action。

`mode` 與 `firstServer` 中途變更會使 `serverNumber` 與發球權推導失去基準，已累積的分數隨之失去意義；`targetScore` 中途變更雖不影響既有分數的有效性，仍 MUST 一併鎖定 —— 三項設定行為一致可避免使用者建立「有些設定改得動」的錯誤心智模型，並使 `finished → playing` 的反向狀態轉換不必存在（11 分制已判勝後改為 15 分制是否要讓比賽復活，是本規格刻意不引入的複雜度）。比賽中變更分制的唯一路徑為經二次確認的重置。

**綁定對戰場次時目標分數額外鎖定**：`matchId !== null` 時，系統 MUST 在**所有階段**（含 `setup`）忽略 `SET_TARGET_SCORE`。目標分數為每輪設定、同一輪所有場地共用（`prd.md` 6.3.1），若允許單一場地在 setup 階段改掉分制，同一輪的三個場地會打不同分制，回填後的歷史紀錄也會失去可比性。`mode` 同樣由該輪的對戰方式決定，UI MUST NOT 提供切換入口；`firstServer` 仍 SHALL 於 `setup` 階段可調整——先發球方是每場現場決定的事，且不影響回填的比分。

`matchId` MUST 隨 `mode`、`firstServer`、`targetScore` 一併被視為「重建初始狀態時要原樣帶入」的欄位：UNDO 以「重建初始 state 後 replay」實作（見「Undo 機制」Requirement），RESET 亦重建初始 state，兩者若未帶入 `matchId`，狀態會在使用者按下 Undo 或重置的瞬間**靜默脫離綁定**並改寫獨立槽 `scoreboard:current:v1`，同時汙染獨立計分板的進度。

UI MUST 以原生 `disabled` 屬性表達鎖定狀態（`nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx` 的 `disabled={locked}`），三個控制項 MUST 各有 `aria-label`（「比賽形式」、「先發球方」與「目標分數」）。綁定模式下目標分數 MUST 改以**唯讀文字**呈現（形如「本輪 15 分制」）而非 disabled 的 radiogroup，SHALL NOT 只把 radiogroup 設為 disabled —— disabled 的互動控制項仍向使用者暗示「這裡本來可以改」，而綁定模式下它永遠不會解鎖，唯讀文字才是誠實的表達，且少三顆按鈕可讓出高度預算給「返回對戰」入口（見「對戰場次綁定與失效處理」Requirement）。

目標分數 MUST 以 `role="radiogroup"` + 三顆 `role="radio"`（帶 `aria-checked`）表達 —— 三個分制為互斥單選，此語意使讀屏能告知「三選一」而非三個獨立開關。該群組 MUST 實作 WAI-ARIA APG 的 radio group 鍵盤模式：roving tabindex（僅選中項 `tabIndex=0`，使 Tab 進入群組即落在選中項、再按 Tab 離開整組）、方向鍵移動即選取並循環。索引計算 MUST 抽為純函式（`nextjs-pickball/lib/scoreboard/radio-navigation.ts`）並於該層 TDD，SHALL NOT 只寫在元件內 —— 依專案分層規範，元件的行為邏輯須下放到可單元測試的層級。此段僅適用於**未綁定**（`matchId === null`）的獨立計分板。

比賽形式與先發球方的下拉選單 MUST 以 `position="popper"` 展開（`SelectContent` 的 prop），SHALL NOT 使用 shadcn 的預設值 `"item-aligned"` —— 後者會移動面板使**目前選中項**對齊觸發器，當選中的是第二個選項時面板整體上移約一格，而設定列緊貼 navbar 下方（觸發器 top 約 67px、navbar bottom 為 56px，僅 11px 間隙），面板上緣因此落入 navbar 範圍、第一個選項被遮掉一半。`popper` 固定在觸發器下方展開並自帶碰撞偵測，選中項不再影響面板位置。

此約束 MUST 於使用端（`ScoreboardSetup.tsx`）傳入，SHALL NOT 修改 `nextjs-pickball/components/ui/select.tsx` —— 該檔為 shadcn 原生元件，專案慣例為不自行修改其結構、更新走 shadcn CLI，且改動預設值會波及全站所有 Select。

重置（RESET）MUST 保留 `mode`、`firstServer`、`targetScore` 與 `matchId`、清空分數與 history、將 `status` 回到 `setup`，且 MUST 經二次確認才執行 —— 誤觸重置會讓整場比賽的分數消失且無法 Undo。

UNDO 同樣 MUST 保留 `targetScore` 與 `matchId`：`UNDO` 以「重建初始 state 後 replay」實作（見「Undo 機制」Requirement），重建時若未帶入 `targetScore`，目標分數會靜默退回 11，使 15／21 分制的比賽在 Undo 後可能立即誤判為結束。此失效路徑僅在使用者按下 Undo 時顯現，正常計分完全正常，MUST 有獨立測試覆蓋。

#### Scenario: setup 階段可切換比賽形式

- **GIVEN** `status === "setup"` 且 `matchId === null`
- **WHEN** dispatch SET_MODE 切換為 singles
- **THEN** `mode` 更新，且 `serverNumber` 設為 1、`isFirstService` 設為 false（單打無 #2 發球員），`targetScore` 與 `matchId` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false」

#### Scenario: setup 階段可切換先發球方

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_FIRST_SERVER
- **THEN** `firstServer` 更新，`mode`、`targetScore` 與 `matchId` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 firstServer」

#### Scenario: setup 階段可切換目標分數

- **GIVEN** `status === "setup"` 且 `matchId === null`
- **WHEN** dispatch SET_TARGET_SCORE 切換為 15
- **THEN** `targetScore` 變為 15，`mode` 與 `firstServer` 維持不變，分數維持 0-0
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 targetScore 且保留 mode 與 firstServer」

#### Scenario: 綁定對戰場次時 setup 階段仍不得變更目標分數

- **GIVEN** `matchId === "m1"`、`targetScore === 15` 且 `status === "setup"`
- **WHEN** dispatch SET_TARGET_SCORE 切換為 11
- **THEN** state 完全不變（`targetScore` 仍為 15）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「綁定場次時 setup 階段 ignore SET_TARGET_SCORE」

#### Scenario: 綁定模式的目標分數以唯讀文字呈現

- **GIVEN** 以 `/scoreboard?match=<有效 matchId>` 開啟且該輪為 15 分制
- **WHEN** 檢視設定列
- **THEN** 設定列顯示「本輪 15 分制」唯讀文字，`role="radiogroup"` 的目標分數群組 SHALL NOT 存在，比賽形式的下拉選單亦 SHALL NOT 存在
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「綁定模式設定列以唯讀文字顯示目標分數且無比賽形式下拉」

#### Scenario: 下拉選單不得被 navbar 遮擋

- **GIVEN** 目前選中的是下拉選單的**第二個**選項（如比賽形式選「單打」、先發球方選「先發：對方」）
- **WHEN** 再次展開該下拉選單
- **THEN** 面板的上緣 MUST 不小於 navbar 的下緣，所有選項完整可見
- **理由**：「可互動」不等於「可見」。面板被遮住一半時選項仍可點擊，Playwright 的 `.click()` 也會照常通過（它只在 pointer events 真被攔截時失敗），因此功能測試對此類缺陷完全無感 —— 本 change 之前的 80 個 E2E 全數通過卻沒抓到。驗收 MUST 直接比較幾何座標，SHALL NOT 以「點得到」作為通過條件
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「下拉選單展開時不被 navbar 遮擋」

#### Scenario: 比賽進行中鎖定設定

- **GIVEN** `status === "playing"`
- **WHEN** dispatch SET_MODE、SET_FIRST_SERVER 或 SET_TARGET_SCORE
- **THEN** state 完全不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「playing 階段 ignore SET_MODE」、「playing 階段 ignore SET_FIRST_SERVER」與「playing 階段 ignore SET_TARGET_SCORE」

#### Scenario: 比賽結束後仍鎖定設定

- **GIVEN** `status === "finished"`
- **WHEN** dispatch SET_MODE、SET_FIRST_SERVER 或 SET_TARGET_SCORE
- **THEN** state 完全不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「finished 階段 ignore SET_MODE」、「finished 階段 ignore SET_FIRST_SERVER」與「finished 階段 ignore SET_TARGET_SCORE」

#### Scenario: UNDO 保留目標分數

- **GIVEN** `targetScore === 21`、比賽進行中且 `history.length > 0`
- **WHEN** dispatch UNDO
- **THEN** replay 後的 state 之 `targetScore` 仍為 21（SHALL NOT 退回 11），`status` 不因此誤判為 `finished`
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 後保留 targetScore，不退回預設 11」

#### Scenario: UNDO 與 RESET 保留 matchId

- **GIVEN** `matchId === "m1"`、比賽進行中且 `history.length > 0`
- **WHEN** dispatch UNDO，接著 dispatch RESET
- **THEN** 兩次的結果 state 之 `matchId` 皆為 `"m1"`（SHALL NOT 退回 `null`）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 與 RESET 後保留 matchId，不退回 null」

#### Scenario: 重置需二次確認且解除鎖定

- **GIVEN** 比賽進行中，設定控制項為 disabled
- **WHEN** 使用者按下「重置」
- **THEN** 先顯示標題為「確定要重置比賽？」的 AlertDialog；確認後分數與 history 清空、`status` 回到 `setup`、三個設定控制項恢復 enabled，且 `mode`、`firstServer` 與 `targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「RESET 保留 mode、firstServer 與 targetScore，清空分數與 history、status 回 setup」；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「重置含二次確認；確認後 mode toggle 解鎖（enabled）」

#### Scenario: 目標分數群組支援方向鍵導覽與 roving tabindex

- **GIVEN** `status === "setup"`、`matchId === null`、目前選中 11 分制
- **WHEN** 焦點位於目標分數群組並按下 ArrowRight 或 ArrowDown
- **THEN** 選取移至 15 分制、焦點同步移到該按鈕；再按兩次依序到 21 並循環回 11。ArrowLeft／ArrowUp 反向循環；Home／End 跳至首／末項
- **AND** 任一時刻僅選中項的 `tabIndex` 為 0，其餘為 -1
- **驗收**：`nextjs-pickball/lib/scoreboard/radio-navigation.test.ts`（索引計算的純函式層）；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「目標分數 radiogroup 支援方向鍵導覽與 roving tabindex」

#### Scenario: 比賽中方向鍵不得變更目標分數

- **GIVEN** `status === "playing"`（三個控制項皆為 disabled）
- **WHEN** 於目標分數群組按下任一方向鍵
- **THEN** 選取不變 —— 按鈕雖為原生 `disabled`，但 `onKeyDown` 掛在群組容器上仍會收到事件，實作 MUST 自行 guard `locked` 狀態
- **驗收**：同上 E2E test 的後段

#### Scenario: 目標分數控制項於比賽中為 disabled

- **GIVEN** 比賽已開始（`status === "playing"`）且 `matchId === null`
- **WHEN** 檢視設定列
- **THEN** 「目標分數」控制項與其餘兩項同為原生 `disabled`，使用者無法變更分制
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「比賽開始後三個賽前設定控制項皆為 disabled」

## ADDED Requirements

### Requirement: 對戰場次綁定與失效處理

系統 SHALL 支援以 URL search parameter `?match=<matchId>` 開啟綁定特定對戰場次的計分板；未帶該參數時 `/scoreboard` MUST 維持既有的獨立計分板行為，SHALL NOT 因本功能而改變任何既有互動。

`matchId` MUST 由頁面（server component）自 `searchParams` 讀出後以 prop 傳入計分板元件，SHALL NOT 於 client 端以 `useSearchParams()` 取得 —— prop 注入使綁定值可在單元測試直接餵入而不需 mock `next/navigation`，也不必為靜態預渲染補 Suspense 邊界（見 design Decision 3）。

**綁定的建立**：計分板 SHALL NOT 自行讀取回合資料（`matchmaker:round:v1`）來推導目標分數或場次是否存在。該場次的初始狀態（`mode`、`targetScore`、`matchId`）MUST 由對戰頁在導向前寫入分槽（seed，見 `match-stage` capability）。因此對計分板而言：

> **該 `matchId` 在 `scoreboard:matches:v1` 有條目 ⟺ 綁定有效。**

此等價關係 MUST 由「重排本輪或重置名單時清除對應計分板進度」維持（見 `round-lifecycle` capability）。採此不變式而非反查回合資料，是為了不讓 `scoreboard` capability 反向相依於 matchmaker 的回合模型——該相依會使回合 schema 的任何調整都波及獨立計分板（見 design Decision 2）。

**失效處理**（`prd.md` §11「由計分板返回時該場次已被刪除或該輪已重設」）：以 `?match=<matchId>` 開啟但該 `matchId` 無對應條目時，系統 MUST 顯示繁體中文說明，指出可能原因（該輪已重設或該場次已被刪除）並提供兩個出口：「回到對戰頁」與「改用獨立計分板」。訊息 SHALL NOT 顯示技術錯誤碼、SHALL NOT 顯示空白畫面，也 SHALL NOT 靜默退回獨立計分板——靜默退回會讓使用者以為自己仍在計那一場，最後把分數計在無人接收的獨立槽裡。

失效狀態下系統 SHALL NOT 建立該 `matchId` 的新條目，亦 SHALL NOT 寫入 `scoreboard:current:v1`；使用者選擇「改用獨立計分板」後 MUST 導向不帶參數的 `/scoreboard`，此後才恢復獨立槽的讀寫。

**返回動線**：綁定模式的設定列 MUST 提供「返回對戰」入口導回對戰頁，並 MUST 顯示該場的場地標示（形如「場地 3」），使多場地並行時使用者能確認自己正在計哪一場。專注模式不渲染設定列（見「專注模式」Requirement），此時返回入口與場地標示一併隱藏為**預期行為**——目標分數仍由隊伍面板名稱行呈現（見「目標分數可見性」Requirement），退出專注模式即可返回。

綁定模式 SHALL NOT 改變 Undo、全螢幕、專注模式與計分規則的任何行為。

實作位於 `nextjs-pickball/app/scoreboard/page.tsx`（讀 `searchParams`）、`nextjs-pickball/components/scoreboard/Scoreboard.tsx`、`nextjs-pickball/components/scoreboard/MatchBindingNotice.tsx` 與 `nextjs-pickball/hooks/useScoreboardStore.ts`。

#### Scenario: 綁定模式讀寫對應場次的槽

- **GIVEN** `scoreboard:matches:v1` 內存在 `m1` 的條目（15 分制、進行中）
- **WHEN** 以 `matchId = "m1"` 呼叫 `useScoreboardStore` 並在 mount 後計一分
- **THEN** hydrate 後的 state 為 `m1` 的既有進度、`matchId` 為 `"m1"`、綁定狀態為 `bound`，且計分後只有 `m1` 的條目被更新，`scoreboard:current:v1` 不被寫入
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「帶 matchId 時 hydrate 自對應槽且只寫回該槽」

#### Scenario: 未帶 matchId 時維持獨立計分板

- **GIVEN** `scoreboard:current:v1` 有合法的既有進度
- **WHEN** 不帶 `matchId` 呼叫 `useScoreboardStore`
- **THEN** hydrate 後的 state 為該進度、`matchId` 為 `null`、綁定狀態為 `standalone`，`scoreboard:matches:v1` 不被讀取也不被寫入
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「未帶 matchId 時沿用獨立槽且不觸碰分槽 key」

#### Scenario: 場次已失效時回報 missing 且不寫入任何槽

- **GIVEN** `scoreboard:matches:v1` 內不存在 `gone` 這個 matchId
- **WHEN** 以 `matchId = "gone"` 呼叫 `useScoreboardStore`
- **THEN** 綁定狀態為 `missing`，`scoreboard:matches:v1` 不新增條目，`scoreboard:current:v1` 亦不被寫入
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「matchId 無對應槽時回報 missing 且不建立新條目」

#### Scenario: 失效時顯示繁體中文說明與兩個出口

- **WHEN** 使用者開啟 `/scoreboard?match=gone`（該場次已被刪除或該輪已重設）
- **THEN** 畫面顯示繁體中文說明，內容指出可能原因並提供「回到對戰頁」與「改用獨立計分板」兩個按鈕，畫面中不出現任何技術錯誤碼或堆疊訊息
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「場次失效時顯示繁中說明與兩個出口且不顯示技術錯誤碼」

#### Scenario: 選擇改用獨立計分板

- **GIVEN** 正處於場次失效的畫面
- **WHEN** 使用者按下「改用獨立計分板」
- **THEN** 導向不帶參數的 `/scoreboard`，計分板恢復可操作並讀寫 `scoreboard:current:v1`
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「失效畫面可切換為獨立計分板並恢復計分」

#### Scenario: 綁定模式顯示場地標示與返回入口

- **GIVEN** 以 `/scoreboard?match=<場地 3 的 matchId>` 開啟
- **WHEN** 檢視設定列
- **THEN** 顯示「場地 3」標示與「返回對戰」按鈕；按下後回到對戰頁
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「綁定模式顯示場地標示且返回對戰可回到對戰頁」

#### Scenario: 綁定模式下多 viewport 仍零捲動

- **GIVEN** viewport 為 390x844（手機直向）、844x390（手機橫向）、768x1024（平板直向）或 1024x600（桌機臨界）之一
- **WHEN** 開啟 `/scoreboard?match=<有效 matchId>`
- **THEN** `document.scrollingElement.scrollHeight <= clientHeight + 1`，且兩顆「贏這球+」與「撤銷上一分」「重置比賽」按鈕的 boundingBox 完整落在 viewport 內
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「綁定模式多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」
