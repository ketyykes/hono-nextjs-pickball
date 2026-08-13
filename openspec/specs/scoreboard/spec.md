## Purpose

定義匹克球計分板功能（`/scoreboard`）的完整規格，包含計分規則、Undo 機制、持久化、RWD 排版、專注模式、視覺回饋 Toast 與版面穩定性。

本頁為場邊實際計分用的工具頁：使用者多半以手機橫放、在比賽空檔快速連點操作。
因此除了 2026 USA Pickleball Traditional（side-out）規則的正確性之外，
誤觸防護（版面穩定、重置二次確認）、狀態不遺失（localStorage 持久化）
與賽前設定的階段鎖定，同樣視為功能需求而非體驗優化。
## Requirements
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

版面 SHALL 鎖定於視口高度且零垂直捲動：外層容器 MUST 使用 `h-dvh` + `overflow-hidden`（SHALL NOT 使用 `min-h-screen`／100vh —— 行動瀏覽器工具列展開時 100vh 大於可視高度），flex 鏈 MUST 補 `min-h-0` 使子項可收縮。手機直向、手機橫向、平板直向與桌機（含 1024x600 臨界尺寸）MUST 滿足 `scrollHeight <= clientHeight + 1`（容許 1px 次像素誤差），且「贏這球+」與 Undo／重置按鈕的 boundingBox MUST 完整落在 viewport 內（水平與垂直兩軸皆須檢查） —— `overflow-hidden` 使排版錯誤的失敗模式從「可捲動」變成「內容被裁切」，此驗收是唯一防線。

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

#### Scenario: 分數字級隨面板高度縮放而非寬度斷點

- **GIVEN** TeamPanel 的可用高度因 orientation 切換、提示橫幅顯示／關閉而改變
- **WHEN** 檢視分數數字的字級來源
- **THEN** TeamPanel 根節點帶 `@container-size`，分數字級以 cqh/cqw + `clamp()` 表達；程式碼中不存在以寬度斷點（`md:` 等）指定分數字級的 class

---

### Requirement: 專注模式

系統 SHALL 提供手動切換的「專注模式」：設定列右側按鈕 MUST 永遠渲染（SHALL NOT 因 `document.fullscreenEnabled === false` 而隱藏），`aria-label` 為「進入專注模式」／「退出專注模式」、`aria-pressed` 反映當前狀態。

進入專注模式時：系統 MUST 於 `document.documentElement` 掛上 `sb-focus` class（SiteNavbar 據此隱藏，見 site-navbar capability）、不渲染 ScoreboardSetup 設定列、改渲染一顆 fixed 浮動退出鈕、ActionBar 收為浮動縮小版（按鈕 role 與 name 不變）、外層容器頂部 padding 歸零。SHALL NOT 以「整頁 fixed 高 z-index 覆蓋 navbar」實作 —— 重置確認 AlertDialog 與 GameOverDialog 為 portal 至 body 的 z-50，會被蓋死。

瀏覽器支援 Fullscreen API（`fullscreenEnabled === true`）時，切換專注模式 MUST 附帶呼叫 `requestFullscreen()`／`exitFullscreen()` 作 progressive enhancement；不支援時只切換版面。使用者以 Esc／系統手勢退出全螢幕（`isFullscreen` 由 true 變 false）時系統 MUST 同步退出專注模式；判定 MUST 以「前值為 true」為條件，SHALL NOT 在 `isFullscreen` 恆為 false 的裝置（如 iPhone Safari）誤退。

專注模式 SHALL NOT 依 `status` 自動觸發 —— localStorage 恢復（HYDRATE 後 status=playing）會讓使用者一進頁 navbar 就消失。

行為邏輯 MUST 抽為 `nextjs-pickball/hooks/useFocusMode.ts`（`useFocusMode({ isFullscreen })` → `{ focusMode, toggleFocusMode }`），`sb-focus` 為全域副作用，unmount 時 MUST 清除。

#### Scenario: 專注模式按鈕永遠顯示

- **GIVEN** `document.fullscreenEnabled === false`（如 iPhone Safari）
- **WHEN** 開啟 `/scoreboard`
- **THEN** 設定列右側仍顯示「進入專注模式」按鈕；點擊後進入專注模式（僅版面切換，不呼叫 Fullscreen API）

#### Scenario: 切換 focus state 並同步 sb-focus class

- **WHEN** 呼叫 `toggleFocusMode()`
- **THEN** `focusMode` 反轉，且 `document.documentElement.classList` 同步含有／移除 `sb-focus`
- **驗收**：`nextjs-pickball/hooks/useFocusMode.test.ts`，it 名稱「toggleFocusMode 切換 focusMode 並同步 documentElement 的 sb-focus class」

#### Scenario: 退出全螢幕同步退出專注模式

- **GIVEN** `focusMode === true` 且 `isFullscreen === true`
- **WHEN** `isFullscreen` 變為 false（Esc／系統手勢）
- **THEN** `focusMode` 自動變為 false，`sb-focus` class 移除
- **驗收**：`nextjs-pickball/hooks/useFocusMode.test.ts`，it 名稱「isFullscreen 由 true 變 false 時自動退出 focus mode」

#### Scenario: 不支援全螢幕的裝置不誤退

- **GIVEN** `isFullscreen` 自始至終為 false（裝置不支援 Fullscreen API）
- **WHEN** 呼叫 `toggleFocusMode()` 進入專注模式後經歷多次 re-render
- **THEN** `focusMode` 維持 true，不被誤退
- **驗收**：`nextjs-pickball/hooks/useFocusMode.test.ts`，it 名稱「isFullscreen 恆為 false（不支援裝置）時不會誤退 focus mode」

#### Scenario: unmount 清除全域 class

- **GIVEN** `focusMode === true`（`sb-focus` 已掛上）
- **WHEN** 元件 unmount（如導航離開 `/scoreboard`）
- **THEN** `document.documentElement.classList` 不含 `sb-focus`
- **驗收**：`nextjs-pickball/hooks/useFocusMode.test.ts`，it 名稱「unmount 時移除 sb-focus class」

#### Scenario: E2E 專注模式進出

- **WHEN** 點擊「進入專注模式」
- **THEN** navbar 連結與「比賽形式」combobox 皆 hidden、浮動的「退出專注模式」鈕 visible；點擊退出鈕後 navbar 與設定列恢復 visible
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「專注模式：進入後隱藏 navbar 與設定列、退出後恢復」

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

### Requirement: `/scoreboard` 之 metadata

系統 SHALL 為 `nextjs-pickball/app/scoreboard/page.tsx` 提供獨立 metadata：title 為「計分板 | 匹克球指南」、description 為「支援單打與雙打的匹克球 Traditional 計分器」。

`/scoreboard` 為公開內容頁，SHALL 對搜尋引擎開放索引，SHALL NOT 設定 `robots.index: false` —— noindex 只適用於 `/health` 這類內部診斷路由（見 `api-connectivity` capability）。

#### Scenario: `/scoreboard` 匯出 metadata 且開放索引

- **WHEN** 檢查 `nextjs-pickball/app/scoreboard/page.tsx` 的模組匯出
- **THEN** 存在 `export const metadata`，title 與 description 如上；未設定 `robots.index: false`

