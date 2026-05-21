## Why

在較矮的視窗（如 ~600px 高度的筆電瀏覽器）下，首頁 Hero 的右上「浮球」會被 `SiteNavbar` (56px) + `TocBar` (~56px) 合計 112px 的 fixed 導航條覆蓋；`/tour` 路由的 stage 主視覺與 SiteNavbar (56px) 之間也缺少 buffer，會在矮視窗下造成 stage 標題接近被遮的不適感。同時兩條 fixed 導覽列各自有 border 與半透明背景，在透明態切到 solid 全白態時對比過強，整體缺乏視覺一致性。

此次修正讓所有路由的視覺主體都從 navbar 底部起算，並把 navbar 兩層配色做和諧化處理。

## What Changes

- 首頁（`/`）Hero：浮球與主內容的活動區域 SHALL 從 `SiteNavbar + TocBar` 下方起算，矮視窗下浮球不再被遮
- `/tour` 路由：`<main>` 與 6 個 stage 的視覺中心 SHALL 避開 `SiteNavbar` 高度，stage 內容在矮視窗下不再貼近被遮邊界
- `SiteNavbar`：兩態（透明 / solid）配色與 `TocBar` 在首頁的視覺權重重新校準，讓兩條 nav 在首頁堆疊時看起來像一個一致的頂部區塊，而非兩條彼此搶眼的橫條
- `TocBar`：與 `SiteNavbar` 的 border、背景色階序統一（去除 `TocBar` 底部 border 的視覺切割線，由背景階序自然分層）
- **不變**：navbar / TocBar 的高度（h-14）、z-index 階層（110 / 100）、scroll-spy 與 view transition 行為皆維持

## Capabilities

### New Capabilities

無——本次純粹修改既有 capability 的視覺與佈局要求。

### Modified Capabilities

- `site-navbar`：兩態（透明 / solid）配色描述更新，並新增「與 TocBar 在首頁堆疊時的視覺一致性」要求
- `pickleball-guide-page`：Hero 區域內 absolute 元素（浮球）與主內容容器 SHALL 落在 `SiteNavbar + TocBar` 高度之下；目前 `top-[15%]` 相對 `min-h-screen` 的定位 SHALL 改為相對「nav 之下的可用區」起算
- `tour-experience`：`<main>` 的可視高度（snap container）SHALL 為 `100vh − SiteNavbar height`；stage 維持 100% main 高度（snap 對齊不變）

## Impact

- 受影響檔案：
  - `components/guide/Hero.tsx`（浮球、主內容定位）
  - `components/guide/TocBar.tsx`（border / 背景配色）
  - `components/layout/SiteNavbar.tsx`（兩態配色）
  - `components/tour/TourShell.tsx`（main 高度 / top offset）
  - 可能需調整：`components/tour/stages/*.tsx` 內以 `h-full` 自適應的元素（多數已 `h-full` 故不需）
- 配置變數：可考慮以 Tailwind arbitrary value 或 CSS variable 統一管理 `--site-nav-height` / `--toc-bar-height`，由 design.md 決定
- 測試影響：
  - 既有 E2E（`tests/e2e/specs/`）若有以絕對 y 座標斷言之處需檢視；以 `data-testid` 斷言者不受影響
  - 既有 `pickleball-guide-page` spec 中「TocBar 位置（有 SiteNavbar 時）」、「Navbar 樣式」相關 scenario 需 delta 更新
- 風險：浮球位置改動需確保「進入完整體驗 → CTA」與「主標題」的視覺重心仍維持
