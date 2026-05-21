## MODIFIED Requirements

### Requirement: `/tour` 路由提供 6 段 scroll-snap 體驗

系統 SHALL 在 `/tour` 路由依序渲染 6 個 stage：CourtSize、PlayerGrowth、TwoBounce、KitchenViolation、MaterialsSpectrum、Closing。外層 `<main>` element SHALL 套用 `scroll-snap-type: y mandatory`、`overflow-y-scroll`，作為內部 scroll container，且其高度 SHALL 為 `calc(100vh - var(--site-nav-h))`、`margin-top: var(--site-nav-h)`，使可視 snap 區完全位於 `SiteNavbar` 下方、避免 stage 標題與主圖被 fixed navbar 遮擋。每個 stage SHALL 為 `h-full`（即 main 可視高度）的 scroll container，並套用 `scroll-snap-align: start` 強制停靠；stage 內以 `flex items-center justify-center` 維持垂直置中。

#### Scenario: 訪問 `/tour` 可見第一個 stage 標題

- **GIVEN** 使用者開啟 `/tour`
- **WHEN** 頁面載入完成
- **THEN** 視窗內可見 stage 1「比網球更小，但同樣激烈」標題，且該標題未被 SiteNavbar 遮擋（`getBoundingClientRect().top` 大於等於 56px）

#### Scenario: 6 個 stage 皆掛載於 DOM

- **GIVEN** 使用者開啟 `/tour`
- **WHEN** DOM 解析完成
- **THEN** 存在以 `data-stage-id` 標示的 6 個 stage 容器，依序為 `court-size`、`player-growth`、`two-bounce`、`kitchen-violation`、`materials-spectrum`、`closing`

#### Scenario: 捲動到底可見 ClosingStage 與返回按鈕

- **GIVEN** 使用者已捲動 `/tour` 至最後一個 stage
- **WHEN** ClosingStage 進入視窗
- **THEN** 視窗內可見「準備好開始了嗎？」標題與「回到完整指南」按鈕

#### Scenario: main 縮短後 IntersectionObserver 仍以 mainRef 為 root

- **WHEN** 檢查 `components/tour/TourShell.tsx` 與 `components/tour/TourProgressRail.tsx`
- **THEN** `<ScrollTimelineProvider>` 接收 `containerRef={mainRef}`；`TourProgressRail` 透過 `useTourScrollContainer()` 取得同一個 ref 作為 observer root（與既有實作一致，僅 main 容器尺寸改變）

#### Scenario: 對應 E2E 驗收

- **WHEN** 執行 `pnpm test:e2e -- tests/e2e/specs/tour.spec.ts`
- **THEN** 上述情境之 Playwright 測試案例全數通過
