## ADDED Requirements

### Requirement: 目標分數可見性

系統 SHALL 在每個隊伍面板的名稱行同時顯示當前目標分數（形如「我方 · 15 分制」），SHALL NOT 僅依賴設定列呈現目標分數 —— 專注模式不渲染 `ScoreboardSetup`（見「專注模式」Requirement），若分制只出現在設定列，使用者進入專注模式後將無從判斷比賽何時結束（例如 21 分制打到 11-9 未結束時會誤以為程式故障）。

顯示位置 MUST 為既有的名稱行（`nextjs-pickball/components/scoreboard/TeamPanel.tsx` 的 label 節點），SHALL NOT 新增獨立的列或區塊 —— 頁面為 `h-dvh` + `overflow-hidden` 鎖高，新增節點會壓縮分數面板的高度預算，且溢出時的失敗模式是靜默裁切而非出現捲軸。

#### Scenario: 名稱行顯示目標分數

- **GIVEN** `targetScore === 15`
- **WHEN** 檢視任一隊伍面板
- **THEN** 名稱行呈現「我方 · 15 分制」／「對方 · 15 分制」

#### Scenario: 專注模式下目標分數仍可見

- **GIVEN** `targetScore === 21` 且已進入專注模式（設定列未渲染）
- **WHEN** 檢視計分板
- **THEN** 兩個隊伍面板的名稱行仍顯示「· 21 分制」
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「專注模式下隊伍面板仍顯示目標分數」

---

## MODIFIED Requirements

### Requirement: 計分規則 — Traditional Side-Out

系統 SHALL 依 2026 USA Pickleball 官方 Traditional（side-out）規則計分：僅發球方可得分；比賽到**使用者設定的目標分數**（`targetScore`，可選 11／15／21，預設 11），需贏 2 分（延長賽持續到差距 ≥ 2）。三種分制的延長賽規則一致，且 SHALL NOT 設定分數上限（cap）—— 官方規則的 11／15／21 分制皆為 win by 2 且無 cap。

勝利判定 `isGameWon(scores, targetScore)` 的第二個參數 MUST 為必填，SHALL NOT 提供預設值 —— 給定預設值會讓任何漏傳的呼叫點靜默退回 11 分制，且既有測試會直接通過而失去 TDD 紅燈。

實作位於 `nextjs-pickball/lib/scoreboard/rules.ts` 與 `nextjs-pickball/lib/scoreboard/reducer.ts`；驗收錨點為 `nextjs-pickball/lib/scoreboard/rules.test.ts` 與 `nextjs-pickball/lib/scoreboard/reducer.test.ts`。

#### Scenario: 發球方得分

- **WHEN** 使用者按下「贏這球+」且當前發球方與按鈕對應隊伍相同
- **THEN** 該隊分數 +1，發球權不變，`history` push 一筆 RALLY_WON

#### Scenario: 接發方贏球 — 單打 side-out

- **WHEN** 單打模式，使用者按下接發方的「贏這球+」
- **THEN** 分數不變，發球權移交給接發方（side-out）

#### Scenario: 接發方贏球 — 雙打 server #1 失球

- **WHEN** 雙打，目前發球員為 #1，接發方贏球
- **THEN** 發球權不轉移，同隊改由 #2 接手發球（serverNumber 1→2）

#### Scenario: 接發方贏球 — 雙打 server #2 失球

- **WHEN** 雙打，目前發球員為 #2，接發方贏球
- **THEN** side-out，對方獲得發球權，serverNumber 重置為 1

#### Scenario: 0-0-2 起手規則

- **WHEN** 雙打比賽開始（isFirstServiceOfGame=true，serverNumber=2），開賽方失球
- **THEN** 直接 side-out，不給該隊 #1 機會（isFirstServiceOfGame 變 false）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「預設為雙打、我方先發、0-0-2 起手」

#### Scenario: 發球位置推導

- **GIVEN** 發球方當局得分為 N
- **WHEN** 顯示發球指示
- **THEN** N 為偶數 → 從右場發（right）；N 為奇數 → 從左場發（left）

#### Scenario: 首球由 setup 轉入 playing

- **WHEN** `status === "setup"` 時發生第一次 RALLY_WON
- **THEN** `status` 變 `"playing"` 並記錄第一筆 history
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「首次 RALLY_WON 從 setup → playing 並記錄 history」

#### Scenario: 勝利條件

- **WHEN** 任一方分數 ≥ `targetScore` 且差距 ≥ 2
- **THEN** `status` 變 `"finished"`，GameOverDialog 自動開啟顯示勝方與比分
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「達到勝利條件時 → status=finished, winner 設定」

#### Scenario: 15 分制與 21 分制的勝利判定

- **GIVEN** `targetScore` 為 15 或 21
- **WHEN** 呼叫 `isGameWon({ us, them }, targetScore)`
- **THEN** 15 分制下 `{us:15, them:13}` → 我方勝、`{us:15, them:14}` → 未勝（延長）、`{us:16, them:14}` → 我方勝；21 分制下 `{us:21, them:19}` → 我方勝、`{us:21, them:20}` → 未勝
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「15 分制：達 15 且差距 ≥ 2 → 勝，差距 1 → 延長」與「21 分制：達 21 且差距 ≥ 2 → 勝，差距 1 → 延長」

#### Scenario: 未達目標分數不判勝

- **GIVEN** `targetScore` 為 15
- **WHEN** 比分達到 11-0
- **THEN** `isGameWon` 回傳未勝，`status` 維持 `"playing"`，GameOverDialog 不開啟
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「15 分制：11-0 尚未達標 → 未贏」；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「15 分制下連贏 11 球不觸發 GameOverDialog」

#### Scenario: 結束後不再接受計分

- **WHEN** `status === "finished"` 時再 dispatch RALLY_WON
- **THEN** state 不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「finished 後 RALLY_WON 被 ignore」

---

### Requirement: localStorage 持久化

系統 SHALL 於每次 state 變更後將計分狀態寫入 `localStorage["scoreboard:current:v1"]`，並 SHALL 於頁面 mount 後還原。寫入前與讀取後 MUST 經 zod schema 驗證；驗證失敗 MUST 清除該 key 並以 `createInitialState()` 起手，SHALL NOT 讓損壞資料使頁面崩潰。

**向後相容策略**：往 `ScoreboardStateSchema` 新增欄位時 MUST 以 zod `.default()` 提供預設值，使既有的 v1 資料在缺少該欄位時被補值而非判定為損壞；SHALL NOT 因新增欄位而 bump storage key —— 兩種做法都會讓已在進行中的比賽在使用者重整頁面時分數歸零，而「清除損壞資料」的既有機制會讓這件事**靜默發生**（`safeParse` 失敗 → `removeItem` → 回 null → 以初始 state 起手），使用者只會看到分數消失，沒有任何錯誤提示。

實作位於 `nextjs-pickball/lib/scoreboard/storage.ts`，驗收錨點為 `nextjs-pickball/lib/scoreboard/storage.test.ts`。

#### Scenario: 分數自動保存

- **WHEN** 使用者更新分數（dispatch RALLY_WON / UNDO / RESET）
- **THEN** 當前 state 寫入 `localStorage["scoreboard:current:v1"]`（zod 驗證後序列化），保存內容含分數、發球狀態、history、`mode`、`firstServer`（起手方設定，UNDO replay 必要）與 `targetScore`

#### Scenario: 頁面重整回復

- **WHEN** 使用者重整頁面，localStorage 有合法的 state
- **THEN** 頁面 mount 後 dispatch HYDRATE，恢復分數、發球狀態與目標分數
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「localStorage 持久化：reload 後分數保留」

#### Scenario: 舊版資料缺少 targetScore 時補預設值

- **GIVEN** `localStorage["scoreboard:current:v1"]` 存有本次變更前寫入的資料（不含 `targetScore` 欄位）且其餘欄位合法
- **WHEN** 呼叫 `readScoreboard()`
- **THEN** 回傳的 state 之 `targetScore` 為 `11`，該 key SHALL NOT 被清除，比賽的分數與 history 完整保留
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「舊版資料缺 targetScore 時補為 11 且不清除 key」

#### Scenario: 損壞資料 fallback

- **WHEN** localStorage 資料無法通過 zod schema 驗證
- **THEN** 清除 key，以 `createInitialState()` 起手，console.warn 記錄錯誤

---

### Requirement: RWD 排版

系統 SHALL 依 `(orientation: landscape)` 切換兩種排版：橫式時兩隊面板左右並排，直式時上下排並顯示「建議橫向使用」提示橫幅。該橫幅 MUST 可關閉，且關閉狀態 MUST 存於 `sessionStorage`（分頁存活期間有效），SHALL NOT 使用 localStorage —— 換裝置方向的偏好不應跨分頁持久保留。

版面 SHALL 鎖定於視口高度且零垂直捲動：外層容器 MUST 使用 `h-dvh` + `overflow-hidden`（SHALL NOT 使用 `min-h-screen`／100vh —— 行動瀏覽器工具列展開時 100vh 大於可視高度），flex 鏈 MUST 補 `min-h-0` 使子項可收縮。手機直向、手機橫向、平板直向與桌機（含 1024x600 臨界尺寸）MUST 滿足 `scrollHeight <= clientHeight + 1`（容許 1px 次像素誤差），且「贏這球+」與 Undo／重置按鈕的 boundingBox MUST 完整落在 viewport 內（水平與垂直兩軸皆須檢查） —— `overflow-hidden` 使排版錯誤的失敗模式從「可捲動」變成「內容被裁切」，此驗收是唯一防線。

設定列（`ScoreboardSetup`）在窄視口下 MAY 折行為多列：三個控制項加上專注模式按鈕於 390px 寬視口無法單列容納，此折行為**預期行為而非缺陷**。折行後設定列高度增加，MUST 由上述多 viewport 零捲動驗收確認分數面板仍完整可見；SHALL NOT 為避免折行而縮減橫向（主要使用姿勢）的控制項可讀性。

分數字級 SHALL 隨面板實際可用高度流體縮放：每個 TeamPanel MUST 為 size container（`@container-size`，需 tailwindcss >= 4.3），分數字級 MUST 以容器查詢單位（cqh/cqw）搭配 `clamp()` 表達，`gap`／`padding` 同步流體化；SHALL NOT 以寬度斷點決定字級（如 `md:text-[14rem]` —— 平板直向與橫向手機以寬度誤中大字級正是溢出根因）。

實作位於 `nextjs-pickball/hooks/useOrientation.ts` 與 `nextjs-pickball/components/scoreboard/`。

#### Scenario: 橫式排版（landscape）

- **WHEN** `window.matchMedia("(orientation: landscape)").matches === true`
- **THEN** 兩隊面板左右並排（flex-row），分數大字，發球指示顯示

#### Scenario: 直式排版（portrait）

- **WHEN** `window.matchMedia("(orientation: landscape)").matches === false`
- **THEN** 兩隊面板上下排（flex-col），上方顯示「建議橫向使用」提示橫幅
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「直式 viewport 顯示「💡 建議橫向使用」提示橫幅」

#### Scenario: 提示橫幅可關閉

- **WHEN** 使用者按下提示橫幅的 ✕ 關閉按鈕
- **THEN** 橫幅消失，`sessionStorage["scoreboard:hint-dismissed"]` 設為 "1"；分頁存活期間不再顯示

#### Scenario: 多 viewport 零捲動

- **GIVEN** viewport 為 390x844（手機直向）、844x390（手機橫向）、768x1024（平板直向）或 1024x600（桌機臨界）之一
- **WHEN** 開啟 `/scoreboard`
- **THEN** `document.scrollingElement.scrollHeight <= clientHeight + 1`（容許次像素誤差），且「贏這球+」（兩顆）與「撤銷上一分」「重置比賽」按鈕的 boundingBox 完整落在 viewport 內
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」

#### Scenario: 設定列折行不破壞零捲動

- **GIVEN** viewport 為 390x844（手機直向），設定列因三個控制項而折為兩列
- **WHEN** 開啟 `/scoreboard`
- **THEN** 仍滿足零捲動驗收，且兩顆「贏這球+」與 Undo／重置按鈕的 boundingBox 完整落在 viewport 內
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」（既有 test 涵蓋，本情境為其在三控制項下的再確認）

#### Scenario: 分數字級隨面板高度縮放而非寬度斷點

- **GIVEN** TeamPanel 的可用高度因 orientation 切換、提示橫幅顯示／關閉而改變
- **WHEN** 檢視分數數字的字級來源
- **THEN** TeamPanel 根節點帶 `@container-size`，分數字級以 cqh/cqw + `clamp()` 表達；程式碼中不存在以寬度斷點（`md:` 等）指定分數字級的 class

---

### Requirement: 賽前設定與階段鎖定

系統 SHALL 於 `status === "setup"` 期間允許調整比賽形式（`mode`：單打／雙打）、先發球方（`firstServer`）與目標分數（`targetScore`：11／15／21），並 MUST 在 `playing` 與 `finished` 階段忽略這三個 action。

`mode` 與 `firstServer` 中途變更會使 `serverNumber` 與發球權推導失去基準，已累積的分數隨之失去意義；`targetScore` 中途變更雖不影響既有分數的有效性，仍 MUST 一併鎖定 —— 三項設定行為一致可避免使用者建立「有些設定改得動」的錯誤心智模型，並使 `finished → playing` 的反向狀態轉換不必存在（11 分制已判勝後改為 15 分制是否要讓比賽復活，是本規格刻意不引入的複雜度）。比賽中變更分制的唯一路徑為經二次確認的重置。

UI MUST 以原生 `disabled` 屬性表達鎖定狀態（`nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx` 的 `disabled={locked}`），三個控制項 MUST 各有 `aria-label`（「比賽形式」、「先發球方」與「目標分數」）。

重置（RESET）MUST 保留 `mode`、`firstServer` 與 `targetScore`、清空分數與 history、將 `status` 回到 `setup`，且 MUST 經二次確認才執行 —— 誤觸重置會讓整場比賽的分數消失且無法 Undo。

UNDO 同樣 MUST 保留 `targetScore`：`UNDO` 以「重建初始 state 後 replay」實作（見「Undo 機制」Requirement），重建時若未帶入 `targetScore`，目標分數會靜默退回 11，使 15／21 分制的比賽在 Undo 後可能立即誤判為結束。此失效路徑僅在使用者按下 Undo 時顯現，正常計分完全正常，MUST 有獨立測試覆蓋。

#### Scenario: setup 階段可切換比賽形式

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_MODE 切換為 singles
- **THEN** `mode` 更新，且 `serverNumber` 設為 1、`isFirstService` 設為 false（單打無 #2 發球員），`targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false」

#### Scenario: setup 階段可切換先發球方

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_FIRST_SERVER
- **THEN** `firstServer` 更新，`mode` 與 `targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 firstServer」

#### Scenario: setup 階段可切換目標分數

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_TARGET_SCORE 切換為 15
- **THEN** `targetScore` 變為 15，`mode` 與 `firstServer` 維持不變，分數維持 0-0
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 targetScore 且保留 mode 與 firstServer」

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

#### Scenario: 重置需二次確認且解除鎖定

- **GIVEN** 比賽進行中，設定控制項為 disabled
- **WHEN** 使用者按下「重置」
- **THEN** 先顯示標題為「確定要重置比賽？」的 AlertDialog；確認後分數與 history 清空、`status` 回到 `setup`、三個設定控制項恢復 enabled，且 `mode`、`firstServer` 與 `targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「RESET 保留 mode、firstServer 與 targetScore，清空分數與 history、status 回 setup」；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「重置含二次確認；確認後 mode toggle 解鎖（enabled）」

#### Scenario: 目標分數控制項於比賽中為 disabled

- **GIVEN** 比賽已開始（`status === "playing"`）
- **WHEN** 檢視設定列
- **THEN** 「目標分數」控制項與其餘兩項同為原生 `disabled`，使用者無法變更分制
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「比賽開始後三個賽前設定控制項皆為 disabled」
