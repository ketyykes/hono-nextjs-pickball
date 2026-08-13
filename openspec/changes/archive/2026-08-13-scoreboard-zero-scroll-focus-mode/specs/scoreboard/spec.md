## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: 全螢幕模式

**Reason**：全螢幕只移除瀏覽器外框、不改頁面內容的固定高度，實測按了照樣捲動；且 iPhone Safari 不支援 Fullscreen API 時按鈕整顆不渲染，最主要的目標裝置反而沒有任何沉浸入口。由「專注模式」Requirement 取代。

**Migration**：`useFullscreen.ts` 保留不動；`ScoreboardSetup` 的全螢幕鈕升級為專注模式鈕（永遠顯示），Fullscreen API 降為專注模式的 progressive enhancement（見 ADDED「專注模式」）。

---

## ADDED Requirements

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
