## ADDED Requirements

### Requirement: `/tour` 路由提供 6 段 scroll-driven 體驗

系統 SHALL 在 `/tour` 路由依序渲染 6 個 stage：CourtSize、PlayerGrowth、TwoBounce、KitchenViolation、MaterialsSpectrum、Closing。每個 stage SHALL 為 100vh 高度的 scroll container，並套用 `scroll-snap-align: start` 強制停靠；外層 SHALL 套用 `scroll-snap-type: y mandatory`。

#### Scenario: 訪問 `/tour` 可見第一個 stage 標題

- **GIVEN** 使用者開啟 `/tour`
- **WHEN** 頁面載入完成
- **THEN** 視窗內可見 stage 1「比網球更小，但同樣激烈」標題

#### Scenario: 6 個 stage 皆掛載於 DOM

- **GIVEN** 使用者開啟 `/tour`
- **WHEN** DOM 解析完成
- **THEN** 存在以 `data-stage-id` 標示的 6 個 stage 容器，依序為 `court-size`、`player-growth`、`two-bounce`、`kitchen-violation`、`materials-spectrum`、`closing`

#### Scenario: 捲動到底可見 ClosingStage 與返回按鈕

- **GIVEN** 使用者已捲動 `/tour` 至最後一個 stage
- **WHEN** ClosingStage 進入視窗
- **THEN** 視窗內可見「準備好開始了嗎？」標題與「回到完整指南」按鈕

#### Scenario: 對應 E2E 驗收

- **WHEN** 執行 `pnpm test:e2e -- tests/e2e/specs/tour.spec.ts`
- **THEN** 上述三條情境之 Playwright 測試案例全數通過

### Requirement: 雙路徑 scroll-driven 動畫策略

系統 SHALL 提供 `lib/scrollTimeline.ts` 之 `supportsScrollTimeline()` 函式偵測 CSS scroll-timeline 支援；偵測同時 `CSS.supports('animation-timeline: scroll()')` 與 `CSS.supports('animation-range: entry 0% exit 100%')` 兩條件，皆為 true 時 SHALL 回傳 true，否則回傳 false。當 `CSS` 物件不存在（非瀏覽器環境）時 SHALL 回傳 false。

`<ScrollTimelineProvider>` SHALL 於初次掛載時呼叫一次該函式，並透過 React context 將結果向下傳遞；子元件 SHALL 透過 `useScrollTimelineSupport()` 讀取，不得自行重新偵測。

`hooks/useScrollLinkedProgress.ts` SHALL 包裝 motion `useScroll`，接受 ref，預設 `offset: ["start end", "end start"]`，回傳 `MotionValue<number>`；元件卸載時 SHALL 取消訂閱。

`hooks/useStageProgress.ts`（或同等抽象）SHALL 在 scroll-timeline 支援為 true 時回傳 `null`、為 false 時回傳 `useScrollLinkedProgress(ref)`，讓 stage 元件依此分支渲染 CSS 驅動或 motion 驅動的版本。

#### Scenario: scroll-timeline 偵測在支援環境回傳 true

- **GIVEN** 測試環境 mock `CSS.supports` 對 `animation-timeline: scroll()` 與 `animation-range: entry 0% exit 100%` 皆回傳 true
- **WHEN** 呼叫 `supportsScrollTimeline()`
- **THEN** 回傳 true
- **TEST** `lib/scrollTimeline.test.ts` 中 `it('在 CSS.supports 兩條件皆為 true 時回傳 true')`

#### Scenario: scroll-timeline 偵測在不支援環境回傳 false

- **GIVEN** 測試環境 mock `CSS.supports` 對任一條件回傳 false
- **WHEN** 呼叫 `supportsScrollTimeline()`
- **THEN** 回傳 false
- **TEST** `lib/scrollTimeline.test.ts` 中 `it('在 CSS.supports 任一條件為 false 時回傳 false')`

#### Scenario: scroll-timeline 偵測在無 CSS 物件時回傳 false

- **GIVEN** 測試環境讓 `globalThis.CSS` 為 undefined
- **WHEN** 呼叫 `supportsScrollTimeline()`
- **THEN** 回傳 false 且不拋例外
- **TEST** `lib/scrollTimeline.test.ts` 中 `it('在 CSS 物件不存在時回傳 false 不拋例外')`

#### Scenario: useScrollLinkedProgress 回傳 motion value 並於卸載時 unsubscribe

- **GIVEN** 元件以 ref 呼叫 `useScrollLinkedProgress(ref)`
- **WHEN** 元件渲染完成
- **THEN** hook 回傳之 `MotionValue<number>` 可被讀取
- **AND WHEN** 元件卸載
- **THEN** 內部訂閱被取消，無 memory leak
- **TEST** `hooks/useScrollLinkedProgress.test.ts` 中 `it('回傳 motion value 並於卸載時 unsubscribe')`

### Requirement: `prefers-reduced-motion` 全域降級

系統 SHALL 提供 `hooks/useReducedMotion.ts`：監聽 `(prefers-reduced-motion: reduce)` media query，回傳目前值；media query 變動時 SHALL 觸發 React 重新渲染；元件卸載時 SHALL 移除事件監聽。

當 `useReducedMotion()` 為 true 時，所有 stage 元件 SHALL NOT 套用 scroll-timeline class、且 `useStageProgress` SHALL 回 `null`，實際呈現為靜態定格內容。`scroll-snap` 與 progress rail SHALL 保留以利使用者控制節奏與感知位置。

Hero 元件在 `useReducedMotion()` 為 true 時 SHALL 退化為既有 motion `staggerChildren` 入場行為（不啟動 scroll-driven 邏輯），確保既有 `pickleball-guide-page` 規格行為向下相容。

#### Scenario: useReducedMotion 在 reduce 設定時回 true

- **GIVEN** 測試環境 mock `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 為 true
- **WHEN** 呼叫 `useReducedMotion()`
- **THEN** 回傳 true
- **TEST** `hooks/useReducedMotion.test.ts` 中 `it('在 prefers-reduced-motion: reduce 啟用時回傳 true')`

#### Scenario: useReducedMotion 在偏好變動時更新

- **GIVEN** 元件已掛載 `useReducedMotion()`
- **WHEN** matchMedia 之 change 事件觸發、值改為 true
- **THEN** hook 回傳值更新為 true 並造成 re-render
- **TEST** `hooks/useReducedMotion.test.ts` 中 `it('於 matchMedia change 事件後回傳新值')`

#### Scenario: useReducedMotion 卸載時移除監聽

- **GIVEN** 元件掛載 `useReducedMotion()` 並註冊 listener
- **WHEN** 元件卸載
- **THEN** matchMedia 之 `removeEventListener` 被呼叫
- **TEST** `hooks/useReducedMotion.test.ts` 中 `it('卸載時移除 matchMedia 監聽')`

#### Scenario: reduced motion 下 `/tour` 仍可訪問所有 stage 內容

- **GIVEN** 使用者瀏覽器 `prefers-reduced-motion: reduce` 設定為啟用
- **WHEN** 使用者開啟 `/tour` 並捲動
- **THEN** 6 個 stage 之內容文字皆可讀取，scroll-snap 仍生效，progress rail 仍正常更新

### Requirement: Hero 升級為 scroll-driven 並保留向下相容

系統 SHALL 將 `components/guide/Hero.tsx` 升級為 scroll-driven：當 `useReducedMotion()` 為 false 且 `useScrollTimelineSupport()` 為 true 時，Hero 之主標題、透視場地、統計區、CTA SHALL 依 0–100vh 之 scroll 進度推進顯示；當 scroll-timeline 不支援時，SHALL 改用 `useScrollLinkedProgress` 之 motion 進度驅動同樣視覺；當 `useReducedMotion()` 為 true 時，SHALL 退化為既有 motion `staggerChildren` 入場行為。

新增之 scroll-driven 行為 SHALL NOT 違反既有 `pickleball-guide-page` 規格之 Hero 既有要求（badge、主標題、三項統計仍須於頁面載入後可見）。

#### Scenario: 一般環境下 Hero 出現 scroll-driven CTA

- **GIVEN** 使用者瀏覽器支援 scroll-timeline 且 `prefers-reduced-motion` 未啟用
- **WHEN** 使用者捲動至 Hero scroll 進度約 90%
- **THEN** 「進入完整體驗 →」CTA 按鈕浮現於 Hero 末段

#### Scenario: reduced motion 下 Hero 行為向下相容

- **GIVEN** 使用者瀏覽器 `prefers-reduced-motion: reduce` 啟用
- **WHEN** 使用者開啟 `/`
- **THEN** Hero 顯示 badge、主標題與三項統計（與既有 `pickleball-guide-page` 規格一致），不啟動 scroll-driven 邏輯

### Requirement: 首頁 CTA 串接並觸發方向性過場

系統 SHALL 於 `app/page.tsx` 的 Hero 結束位置（TocBar 之前）渲染「進入完整體驗 →」按鈕；按鈕點擊 SHALL 呼叫 `router.push('/tour', { transitionTypes: ['nav-forward'] })` 並導航至 `/tour`（Next.js 16 router 內部會於 view transition 期間呼叫 React 的 `addTransitionType`）。`/tour` 內之 ClosingStage「回到完整指南」按鈕與 `TourSkipButton` 點擊 SHALL 呼叫 `router.push(href, { transitionTypes: ['nav-back'] })` 並導航回 `/`（Skip 目標為 `/#court`，額外 scroll 至 `#court`）。

`app/layout.tsx` 之主內容 SHALL 由 React 19 `<ViewTransition>` 包覆，透過 CSS 對 `nav-forward` 與 `nav-back` 兩 transition type 套用不同方向滑入動畫。

#### Scenario: 首頁 CTA 點擊後導向 `/tour`

- **GIVEN** 使用者位於 `/`
- **WHEN** 使用者點擊「進入完整體驗 →」按鈕
- **THEN** URL 變為 `/tour`，且過場動畫由右側滑入

#### Scenario: ClosingStage 返回按鈕導回 `/`

- **GIVEN** 使用者位於 `/tour` 並捲動至 ClosingStage
- **WHEN** 使用者點擊「回到完整指南」按鈕
- **THEN** URL 變為 `/`，過場動畫由左側滑入

#### Scenario: Skip 按鈕導向 `/#court`

- **GIVEN** 使用者位於 `/tour`
- **WHEN** 使用者點擊右下角「跳過 →」按鈕
- **THEN** URL 變為 `/#court`，且頁面捲動位置位於 court section

### Requirement: `/tour` 之 metadata

系統 SHALL 為 `app/tour/page.tsx` 提供獨立 metadata：title 為「匹克球新手完全入門 · 互動體驗 | 匹克球指南」、description 為「用捲動的方式快速看完匹克球規則與器材重點，6 個互動場景帶你 5 分鐘上手」。對搜尋引擎開放索引；sitemap 不給高 priority。

#### Scenario: `/tour` head 中 title 與 description 設定正確

- **GIVEN** 完成實作
- **WHEN** 訪問 `/tour` 並檢查 document head
- **THEN** title 含「匹克球新手完全入門 · 互動體驗」、meta description 為上述定義之文字

### Requirement: stage 2 玩家成長資料純資料化

系統 SHALL 將 PlayerGrowthStage 折線圖所需之台灣匹克球玩家年度資料抽出為 `data/tour/playerGrowth.ts`：資料 SHALL 為 `readonly` 陣列，每筆含 `year`（西元年）、`players`（人數）兩欄；至少包含 6 筆年度（2020–2025），年份遞增不重複，人數遞增。

#### Scenario: playerGrowth 資料形狀正確

- **GIVEN** 已建立 `data/tour/playerGrowth.ts`
- **WHEN** 執行對應 Vitest
- **THEN** 匯出之常數為 readonly array、長度 ≥ 6、年份從 2020 起遞增不重複、`players` 數值遞增
- **TEST** `data/tour/playerGrowth.test.ts` 中 `it('提供至少 6 筆年度資料且年份與人數均遞增')`
