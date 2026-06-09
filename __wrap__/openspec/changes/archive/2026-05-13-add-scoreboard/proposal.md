## Why

匹克球指南目前只有靜態內容頁（`/`）與互動體驗頁（`/tour`），缺乏跨頁全域導航與實用工具。打球現場的使用者需要一個能在手機快速計分的工具，且在手機橫向與直向都能流暢操作。

## What Changes

- **新增全域 SiteNavbar**（`components/layout/SiteNavbar.tsx`）：fixed top header，整合至 root layout，提供「首頁 / 完整體驗 / 計分板」三個路由連結並搭配 view transition。
- **新增 `/scoreboard` 路由**（`app/scoreboard/page.tsx`）：匹克球 Traditional side-out 計分器頁面，橫式左右排、直式上下排 RWD。
- **Pickleball Traditional 計分邏輯**（`lib/scoreboard/`）：純函式 rules + useReducer reducer，支援單打與雙打（含 0-0-2 起手規則）、到 11 分贏 2 分。
- **UI 元件組**（`components/scoreboard/`）：TeamPanel、ScoreboardSetup、ActionBar、ServeIndicator、OrientationHint、GameOverDialog、Scoreboard 主容器。
- **localStorage 持久化**（`hooks/useScoreboardStore`）：zod schema 驗證、StrictMode-safe 競態修正。
- **全螢幕模式**（`hooks/useFullscreen`）：useSyncExternalStore SSR-safe，iOS Safari 降級隱藏。
- **Undo 機制**：事件流 replay，可一路退回開賽起手。
- **Side-out / 換發球員 toast 視覺回饋**：CSS keyframe 動畫，key counter 強制重播。
- **TocBar top 偏移調整**：`top-0` → `top-14`，避免被 SiteNavbar 覆蓋。

## Capabilities

### New Capabilities

- `site-navbar`: 全域導航列，fixed top，雙態樣式（首頁 Hero 透明 / 其餘頁面白底），支援 view transition 路由切換。
- `scoreboard`: 匹克球 Traditional 計分器，含規則邏輯、RWD UI、localStorage 持久化、Undo、全螢幕、視覺回饋 toast。

### Modified Capabilities

- `pickleball-guide-page`: TocBar `top-0` 改為 `top-14` 以讓出 SiteNavbar 空間。
