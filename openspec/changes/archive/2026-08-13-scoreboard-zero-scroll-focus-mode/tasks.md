## 1. useFocusMode hook（行為邏輯，TDD 三步）

- [x] 1.1 新增失敗測試 `nextjs-pickball/hooks/useFocusMode.test.ts`，涵蓋 4 個 it：「toggleFocusMode 切換 focusMode 並同步 documentElement 的 sb-focus class」「isFullscreen 由 true 變 false 時自動退出 focus mode」「isFullscreen 恆為 false（不支援裝置）時不會誤退 focus mode」「unmount 時移除 sb-focus class」；於 repo root 執行 `pnpm --filter ./nextjs-pickball test --run hooks/useFocusMode.test.ts` 實際看到紅燈
- [x] 1.2 最小實作 `nextjs-pickball/hooks/useFocusMode.ts`（`useFocusMode({ isFullscreen })` → `{ focusMode, toggleFocusMode }`；prev-fullscreen 追蹤、`sb-focus` class 副作用與 unmount cleanup）至同指令全綠
- [x] 1.3 refactor：檢視實作，無壞味道則註記 skipped

## 2. 零捲動版面（例外層：純樣式 class 改動，以量測腳本＋E2E 驗收）

- [x] 2.1 `nextjs-pickball/components/scoreboard/Scoreboard.tsx`：外層 `min-h-screen pt-14` 改 `h-dvh overflow-hidden pt-(--site-nav-h)`，中間 TeamPanel wrapper 補 `min-h-0`；註解明示「頁面鎖高不可長高」約束
- [x] 2.2 `nextjs-pickball/components/scoreboard/TeamPanel.tsx`：根節點加 `@container-size min-h-0 min-w-0`，分數字級改 cqh/cqw + `clamp()`（移除 `text-[10rem] md:text-[14rem]`），`gap-6`/`p-6` 流體化；註解明示 tailwindcss >= 4.3 依賴
- [x] 2.3 以 headless Playwright 量測腳本驗收：7 組 viewport（1440x900、1366x768、1280x672、1024x600、844x390、390x844、768x1024）全部 `overflowPx === 0`，並截圖目視分數無疊字／裁切；未達標則迭代 clamp/cq 參數後重量

## 3. 專注模式接線（呈現層，以 E2E 驗收）

- [x] 3.1 `nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx`：按鈕永遠渲染（移除 `fullscreenSupported &&`）、aria-label 改「進入專注模式」／「退出專注模式」、`aria-pressed` 綁 focus 狀態；prop 語意由 onToggleFullscreen 改 onToggleFocus
- [x] 3.2 `nextjs-pickball/components/scoreboard/ActionBar.tsx`：新增 `focusMode` prop，focus 時浮動縮小版（fixed bottom、rounded-full、backdrop-blur），按鈕 role/name 不變
- [x] 3.3 `nextjs-pickball/components/scoreboard/Scoreboard.tsx`：整合 `useFocusMode` 與 `useFullscreen`（toggle handler 於 isSupported 時附帶 fullscreen toggle）；focus 時不渲染設定列、渲染 fixed 浮動退出鈕、外層 `pt-0`
- [x] 3.4 `nextjs-pickball/components/layout/SiteNavbar.tsx`：header className 追加 `[.sb-focus_&]:hidden`，零邏輯改動
- [x] 3.5 focus mode 下以量測腳本確認浮動 ActionBar 與「贏這球+」按鈕 boundingBox 不相交（矮視窗 844x390）；重疊則改為只縮 padding 不浮動

## 4. E2E 與整體驗證

- [x] 4.1 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts` 新增 test「多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」（390x844、844x390、768x1024、1024x600 四組斷言 `scrollHeight <= clientHeight + 1` ＋按鈕 boundingBox 在 viewport 內）
- [x] 4.2 同檔新增 test「專注模式：進入後隱藏 navbar 與設定列、退出後恢復」（斷言 DOM 狀態，不依賴真的進 fullscreen）
- [x] 4.3 執行 scoreboard 相關 E2E（`pnpm --filter ./nextjs-pickball test:e2e -- scoreboard`，至少 chromium project）確認新舊測試全綠；既有 6 條不需改動即應通過
- [x] 4.4 `pnpm lint`、`pnpm typecheck`、`pnpm test:web --run` 全綠
