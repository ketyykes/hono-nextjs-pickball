## MODIFIED Requirements

### Requirement: 計分規則 — Traditional Side-Out

系統 SHALL 依 2026 USA Pickleball 官方 Traditional（side-out）規則計分：僅發球方可得分；比賽到 11 分，需贏 2 分（延長賽持續到差距 ≥ 2）。

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

- **WHEN** 任一方分數 ≥ 11 且差距 ≥ 2
- **THEN** `status` 變 `"finished"`，GameOverDialog 自動開啟顯示勝方與比分
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「達到勝利條件時 → status=finished, winner 設定」

#### Scenario: 結束後不再接受計分

- **WHEN** `status === "finished"` 時再 dispatch RALLY_WON
- **THEN** state 不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「finished 後 RALLY_WON 被 ignore」

---

### Requirement: Undo 機制

系統 SHALL 提供 Undo 以撤銷上一分，且 MUST 以「重建初始 state 後 replay `history.slice(0,-1)`」實作，SHALL NOT 使用反向運算 —— 因為 side-out 與 serverNumber 的轉移不可逆推。

`history` 為空時 Undo 按鈕 MUST 停用。實作位於 `nextjs-pickball/lib/scoreboard/reducer.ts` 與 `nextjs-pickball/components/scoreboard/ActionBar.tsx`。

#### Scenario: Undo 上一分

- **WHEN** 使用者按下「Undo」且 history.length > 0
- **THEN** 以 `createInitialState({mode, firstServer})` 重建初始 state，replay `history.slice(0,-1)` 還原上一步
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 後 state 等於少做一次 RALLY_WON 的結果」

#### Scenario: Undo 後回到開賽狀態

- **WHEN** 使用者按下「Undo」且 history.length === 1（只打過一球）
- **THEN** 分數回到 0-0，status 回到 `"setup"`，Undo 按鈕停用
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 退到開賽時 status 回到 setup」

#### Scenario: 空 history 不能 Undo

- **WHEN** history.length === 0
- **THEN** state 不變；Undo 按鈕以原生 `disabled` 屬性停用（`ActionBar.tsx` 的 `disabled={!canUndo}`，非 `aria-disabled`）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「空 history 時 UNDO 不變 state」

---

### Requirement: localStorage 持久化

系統 SHALL 於每次 state 變更後將計分狀態寫入 `localStorage["scoreboard:current:v1"]`，並 SHALL 於頁面 mount 後還原。寫入前與讀取後 MUST 經 zod schema 驗證；驗證失敗 MUST 清除該 key 並以 `createInitialState()` 起手，SHALL NOT 讓損壞資料使頁面崩潰。

實作位於 `nextjs-pickball/lib/scoreboard/storage.ts`，驗收錨點為 `nextjs-pickball/lib/scoreboard/storage.test.ts`。

#### Scenario: 分數自動保存

- **WHEN** 使用者更新分數（dispatch RALLY_WON / UNDO / RESET）
- **THEN** 當前 state 寫入 `localStorage["scoreboard:current:v1"]`（zod 驗證後序列化），保存內容含分數、發球狀態、history、`mode`、`firstServer`（起手方設定，UNDO replay 必要）

#### Scenario: 頁面重整回復

- **WHEN** 使用者重整頁面，localStorage 有合法的 state
- **THEN** 頁面 mount 後 dispatch HYDRATE，恢復分數與發球狀態
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「localStorage 持久化：reload 後分數保留」

#### Scenario: 損壞資料 fallback

- **WHEN** localStorage 資料無法通過 zod schema 驗證
- **THEN** 清除 key，以 `createInitialState()` 起手，console.warn 記錄錯誤

---

### Requirement: RWD 排版

系統 SHALL 依 `(orientation: landscape)` 切換兩種排版：橫式時兩隊面板左右並排，直式時上下排並顯示「建議橫向使用」提示橫幅。該橫幅 MUST 可關閉，且關閉狀態 MUST 存於 `sessionStorage`（分頁存活期間有效），SHALL NOT 使用 localStorage —— 換裝置方向的偏好不應跨分頁持久保留。

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

---

### Requirement: 全螢幕模式

系統 SHALL 在瀏覽器支援 Fullscreen API 時提供全螢幕切換按鈕，並 SHALL 在 `document.fullscreenEnabled === false` 時隱藏該按鈕，SHALL NOT 顯示一個按下去沒有反應的控制項。

實作位於 `nextjs-pickball/hooks/useFullscreen.ts` 與 `nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx`。

#### Scenario: 全螢幕切換

- **WHEN** 使用者點擊全螢幕按鈕，且瀏覽器支援 Fullscreen API
- **THEN** 呼叫 `document.documentElement.requestFullscreen()`，按鈕圖示切換為 Minimize，`aria-label` 由「進入全螢幕」變為「退出全螢幕」

#### Scenario: 不支援 Fullscreen API

- **WHEN** `document.fullscreenEnabled === false`（如 iOS Safari）
- **THEN** 全螢幕按鈕不顯示（隱藏）

---

### Requirement: 視覺回饋 Toast

系統 SHALL 僅在「分數未變但發球狀態改變」時顯示 toast，SHALL NOT 在得分時顯示 —— 分數大字本身已是足夠的視覺回饋，額外 toast 會造成資訊重複。

#### Scenario: Side-out toast

- **WHEN** RALLY_WON 後 servingTeam 換邊（分數不變）
- **THEN** 頂部顯示「Side Out · 換 X 發球」toast，1.6s 滑入停留滑出後消失

#### Scenario: 換發球員 toast

- **WHEN** RALLY_WON 後 serverNumber 1→2（同隊換人，分數不變）
- **THEN** 頂部顯示「換發球員 #2」toast，1.6s 後消失

#### Scenario: 得分不顯示 toast

- **WHEN** RALLY_WON 後分數有變動
- **THEN** 不顯示 toast

---

### Requirement: 按鈕版面穩定性

發球指示（ServeIndicator）SHALL 永遠佔據版面空間，非發球方 MUST 以 `invisible` 隱藏而非條件式不渲染，使「贏這球+」按鈕在發球權轉移時 SHALL NOT 上下跳動。

計分板是比賽中快速連點的介面，按鈕位移會直接造成誤觸，因此版面穩定性視為功能需求而非美觀偏好。

#### Scenario: 發球指示切換不引起版面位移

- **GIVEN** 計分板正在進行
- **WHEN** 發球權在兩隊之間切換（ServeIndicator 顯示/隱藏）
- **THEN** 「贏這球+」按鈕位置不上下跳動（indicator 永遠佔位，非發球方用 invisible 隱藏）

## ADDED Requirements

### Requirement: 賽前設定與階段鎖定

系統 SHALL 於 `status === "setup"` 期間允許調整比賽形式（`mode`：單打／雙打）與先發球方（`firstServer`），並 MUST 在 `playing` 與 `finished` 階段忽略這兩個 action，避免比賽中途改變規則造成分數失去意義。

UI MUST 以原生 `disabled` 屬性表達鎖定狀態（`nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx` 的 `disabled={locked}`），兩個控制項 MUST 各有 `aria-label`（「比賽形式」與「先發球方」）。

重置（RESET）MUST 保留 `mode` 與 `firstServer`、清空分數與 history、將 `status` 回到 `setup`，且 MUST 經二次確認才執行 —— 誤觸重置會讓整場比賽的分數消失且無法 Undo。

#### Scenario: setup 階段可切換比賽形式

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_MODE 切換為 singles
- **THEN** `mode` 更新，且 `serverNumber` 設為 1、`isFirstService` 設為 false（單打無 #2 發球員）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false」

#### Scenario: setup 階段可切換先發球方

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_FIRST_SERVER
- **THEN** `firstServer` 更新
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 firstServer」

#### Scenario: 比賽進行中鎖定設定

- **GIVEN** `status === "playing"`
- **WHEN** dispatch SET_MODE 或 SET_FIRST_SERVER
- **THEN** state 完全不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「playing 階段 ignore SET_MODE」與「playing 階段 ignore SET_FIRST_SERVER」

#### Scenario: 比賽結束後仍鎖定設定

- **GIVEN** `status === "finished"`
- **WHEN** dispatch SET_MODE 或 SET_FIRST_SERVER
- **THEN** state 完全不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「finished 階段 ignore SET_MODE」與「finished 階段 ignore SET_FIRST_SERVER」

#### Scenario: 重置需二次確認且解除鎖定

- **GIVEN** 比賽進行中，設定控制項為 disabled
- **WHEN** 使用者按下「重置」
- **THEN** 先顯示標題為「確定要重置比賽？」的 AlertDialog；確認後分數與 history 清空、`status` 回到 `setup`、設定控制項恢復 enabled，且 `mode` 與 `firstServer` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「RESET 保留 mode 與 firstServer，清空分數與 history、status 回 setup」；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「重置含二次確認；確認後 mode toggle 解鎖（enabled）」
