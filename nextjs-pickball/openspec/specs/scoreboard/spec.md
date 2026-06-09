## Purpose

定義匹克球計分板功能（`/scoreboard`）的完整規格，包含計分規則、Undo 機制、持久化、RWD 排版、全螢幕模式、視覺回饋 Toast 與版面穩定性。

## Requirements

### Requirement: 計分規則 — Traditional Side-Out

依 2026 USA Pickleball 官方 Traditional（side-out）規則：僅發球方可得分；比賽到 11 分，需贏 2 分（延長賽持續到差距 ≥ 2）。

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

#### Scenario: 發球位置推導

- **GIVEN** 發球方當局得分為 N
- **WHEN** 顯示發球指示
- **THEN** N 為偶數 → 從右場發（right）；N 為奇數 → 從左場發（left）

#### Scenario: 勝利條件

- **WHEN** 任一方分數 ≥ 11 且差距 ≥ 2
- **THEN** `status` 變 `"finished"`，GameOverDialog 自動開啟顯示勝方與比分

---

### Requirement: Undo 機制

#### Scenario: Undo 上一分

- **WHEN** 使用者按下「Undo」且 history.length > 0
- **THEN** 以 `createInitialState({mode, firstServer})` 重建初始 state，replay `history.slice(0,-1)` 還原上一步

#### Scenario: Undo 後回到開賽狀態

- **WHEN** 使用者按下「Undo」且 history.length === 1（只打過一球）
- **THEN** 分數回到 0-0，status 回到 `"setup"`，Undo 按鈕 disabled

#### Scenario: 空 history 不能 Undo

- **WHEN** history.length === 0
- **THEN** Undo 按鈕 disabled（`aria-disabled`）

---

### Requirement: localStorage 持久化

#### Scenario: 分數自動保存

- **WHEN** 使用者更新分數（dispatch RALLY_WON / UNDO / RESET）
- **THEN** 當前 state 寫入 `localStorage["scoreboard:current:v1"]`（zod 驗證後序列化），保存內容含分數、發球狀態、history、`mode`、`firstServer`（起手方設定，UNDO replay 必要）

#### Scenario: 頁面重整回復

- **WHEN** 使用者重整頁面，localStorage 有合法的 state
- **THEN** 頁面 mount 後 dispatch HYDRATE，恢復分數與發球狀態

#### Scenario: 損壞資料 fallback

- **WHEN** localStorage 資料無法通過 zod schema 驗證
- **THEN** 清除 key，以 `createInitialState()` 起手，console.warn 記錄錯誤

---

### Requirement: RWD 排版

#### Scenario: 橫式排版（landscape）

- **WHEN** `window.matchMedia("(orientation: landscape)").matches === true`
- **THEN** 兩隊面板左右並排（flex-row），分數大字，發球指示顯示

#### Scenario: 直式排版（portrait）

- **WHEN** `window.matchMedia("(orientation: landscape)").matches === false`
- **THEN** 兩隊面板上下排（flex-col），上方顯示「建議橫向使用」提示橫幅

#### Scenario: 提示橫幅可關閉

- **WHEN** 使用者按下提示橫幅的 ✕ 關閉按鈕
- **THEN** 橫幅消失，`sessionStorage["scoreboard:hint-dismissed"]` 設為 "1"；分頁存活期間不再顯示

---

### Requirement: 全螢幕模式

#### Scenario: 全螢幕切換

- **WHEN** 使用者點擊全螢幕按鈕，且瀏覽器支援 Fullscreen API
- **THEN** 呼叫 `document.documentElement.requestFullscreen()`，按鈕圖示切換為 Minimize

#### Scenario: 不支援 Fullscreen API

- **WHEN** `document.fullscreenEnabled === false`（如 iOS Safari）
- **THEN** 全螢幕按鈕不顯示（隱藏）

---

### Requirement: 視覺回饋 Toast

#### Scenario: Side-out toast

- **WHEN** RALLY_WON 後 servingTeam 換邊（分數不變）
- **THEN** 頂部顯示「Side Out · 換 X 發球」toast，1.6s 滑入停留滑出後消失

#### Scenario: 換發球員 toast

- **WHEN** RALLY_WON 後 serverNumber 1→2（同隊換人，分數不變）
- **THEN** 頂部顯示「換發球員 #2」toast，1.6s 後消失

#### Scenario: 得分不顯示 toast

- **WHEN** RALLY_WON 後分數有變動
- **THEN** 不顯示 toast（分數大字的視覺變化已足夠）

---

### Requirement: 按鈕版面穩定性

#### Scenario: 發球指示切換不引起版面位移

- **GIVEN** 計分板正在進行
- **WHEN** 發球權在兩隊之間切換（ServeIndicator 顯示/隱藏）
- **THEN** 「贏這球+」按鈕位置不上下跳動（indicator 永遠佔位，非發球方用 invisible 隱藏）
