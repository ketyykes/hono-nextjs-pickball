## Why

實測（headless Playwright，7 組 viewport）顯示 `/scoreboard` 在手機橫向 844x390 溢出 212px、手機直向 390x844 溢出 108px、平板直向 768x1024 溢出 56px——版面所有尺寸只跟「寬度斷點」走、完全不隨視窗高度縮放：固定 chrome 共 178px（navbar 56 + 設定列 61 + ActionBar 61），TeamPanel 最小內容高 424px（landscape，`md:text-[14rem]` = 224px 字級）／360px（portrait），直向另有 OrientationHint 橫幅 53px，堆疊起來超過視口就得捲動。全螢幕鈕只移除瀏覽器外框、不改內容高度，按了照樣捲；且 iPhone Safari 不支援 Fullscreen API，按鈕整顆不渲染。計分板是場邊邊打邊按的工具頁，捲動與缺席的全螢幕入口都直接傷害可用性。

## What Changes

- **版面鎖高（零捲動）**：Scoreboard 外層由 `min-h-screen`（100vh，行動瀏覽器工具列展開時大於可視高）改為 `h-dvh` + `overflow-hidden`，flex 鏈補 `min-h-0`；驗收標準為手機直向 390x844、手機橫向 844x390、平板直向 768x1024、桌機各尺寸皆 `scrollHeight <= clientHeight`
- **分數字級流體化**：TeamPanel 設為 size container（Tailwind 4.3 `@container-size`），分數字級由固定 `text-[10rem] md:text-[14rem]` 改為 cqh/cqw 容器單位 + `clamp()`，`gap-6`/`p-6` 同步流體化；移除以寬度斷點決定字級的做法（平板直向誤中 `md:` 是溢出主因之一）
- **BREAKING（規格層）**：「全螢幕模式」Requirement 改為「專注模式」——按鈕永遠顯示（不再於 `fullscreenEnabled === false` 時隱藏），點擊切換 focus mode：隱藏 SiteNavbar 與設定列、ActionBar 改浮動縮小版、另設浮動退出鈕；瀏覽器支援 Fullscreen API 時附帶 `requestFullscreen()` 作 progressive enhancement；Esc／系統手勢退出 fullscreen 時同步退出 focus mode；不採 `status` 自動觸發（localStorage 恢復會讓使用者一進頁 navbar 就消失）
- SiteNavbar 新增專注模式隱藏 variant（`html.sb-focus` 時 `display:none`），跨樹通訊走 `documentElement` class，`app/layout.tsx` 零改動
- 行為邏輯抽為 `useFocusMode` hook（TDD）；新增 E2E：多 viewport 防捲動斷言與 focus mode 進出測試

## Capabilities

### New Capabilities

（無——本次全部是既有 capability 的 requirement 變更）

### Modified Capabilities

- `scoreboard`：「RWD 排版」新增零捲動 requirement（`h-dvh` 鎖高＋容器單位流體字級，三類裝置不得出現垂直捲動）；「全螢幕模式」Requirement 整個改寫為「專注模式」（按鈕永遠顯示、focus layout、fullscreen 降為 progressive enhancement）
- `site-navbar`：新增「專注模式下隱藏」requirement（`html.sb-focus` → navbar hidden；由 scoreboard 頁掛載／清除該 class）

## Impact

- `nextjs-pickball/components/scoreboard/Scoreboard.tsx`、`TeamPanel.tsx`、`ScoreboardSetup.tsx`、`ActionBar.tsx`（layout class 與 focus mode 條件渲染）
- `nextjs-pickball/components/layout/SiteNavbar.tsx`（僅加一個 `[.sb-focus_&]:hidden` class variant，無邏輯改動）
- `nextjs-pickball/hooks/useFocusMode.ts`（新增，行為邏輯，TDD）＋ `useFocusMode.test.ts`；`useFullscreen.ts` 零改動
- `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`（新增防捲動與 focus mode 測試；既有 6 條測試在手動觸發設計下不需改動）
- 無後端改動、無新依賴；`@container-size` 需 tailwindcss >= 4.3（本專案實裝 4.3.0，node_modules 已確認）
- 風險轉移：`overflow-hidden` + `contain: size` 把「算錯」的失敗模式從可捲動變成裁切／疊字，必須以防捲動 E2E 與 headless Playwright 量測把關
