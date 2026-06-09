# tour-experience Specification

## Purpose

定義 `/tour` 互動體驗路由：6 段 100vh stage 的 scroll-snap 沉浸式介紹，每段在使用者進入 viewport 時觸發一次性進場動畫，搭配 `/` ↔ `/tour` 之 React 19 `<ViewTransition>` 方向性過場。本 capability 也包含 `/` 首頁的「進入完整體驗 →」CTA、`prefers-reduced-motion` 全域降級，以及配合 stage 動畫所需的 helper hook 與資料模組。

> **實作注意**：原始 design doc（`docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md`）規劃為「CSS scroll-timeline + motion useScroll fallback」雙路徑、Hero scroll-driven 升級。實作期間因 hydration mismatch、snap-mandatory 下無捲動進度中間態等實際限制，已調整為「IntersectionObserver 進場動畫」單一路徑、Hero 改為 staggerChildren 直接全部載入。詳見 design doc 末尾 Implementation Changelog。

## Requirements

### Requirement: `/tour` 路由提供 6 段 scroll-snap 體驗

系統 SHALL 在 `/tour` 路由依序渲染 6 個 stage：CourtSize、PlayerGrowth、TwoBounce、KitchenViolation、MaterialsSpectrum、Closing。每個 stage SHALL 為 100vh 高度的 scroll container，並套用 `scroll-snap-align: start` 強制停靠；外層 main element SHALL 套用 `scroll-snap-type: y mandatory` 與 `overflow-y-scroll`，作為內部 scroll container。

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

### Requirement: Stage 進場動畫由 IntersectionObserver 觸發

系統 SHALL 提供 `hooks/useEnterAnimationProgress.ts`：以 `IntersectionObserver`（root 接受可選 RefObject，預設為 viewport）監聽目標元素，當 `intersectionRatio >= amount`（預設 0.5）時將 `motion useMotionValue` 從 0 動畫到 1（預設 duration 1.5s、ease easeOut）；`once=true`（預設）時觸發後立即 disconnect observer。

`hooks/useStageProgress.ts`（位於 `components/tour/shared/ScrollTimelineProvider.tsx`）SHALL 整合 `useReducedMotion()` 與 `useEnterAnimationProgress(target, { root: containerRef })`：當 `useReducedMotion()` 為 true 時 SHALL 回傳 `null`，stage 元件以 `useMotionValue(1)` fallback 配 `useTransform` 直接呈現動畫終點狀態；其餘情境 SHALL 回傳由 IntersectionObserver 驅動的 `MotionValue<number>`，stage 元件以 `useTransform` 將進度映射到 opacity / scale / x / y 等視覺屬性。

`<ScrollTimelineProvider>` SHALL 接受可選 `containerRef` prop（內部 scroll container 的 ref），透過 React context 傳遞給 `useStageProgress` 與 `TourProgressRail`，使 IntersectionObserver 能以該 container 為 root 正確偵測 stage 進入。`useTourScrollContainer()` SHALL 暴露給內部子元件用於取得該 ref。

#### Scenario: useEnterAnimationProgress 元素進入 viewport 後啟動 0→1 motion 動畫

- **GIVEN** 元件以 ref 呼叫 `useEnterAnimationProgress(ref)` 並掛載至已連接 DOM 的元素
- **WHEN** IntersectionObserver callback 收到 `isIntersecting && intersectionRatio >= amount`
- **THEN** motion `animate` 被呼叫，將回傳之 `MotionValue<number>` 從 0 跑到 1
- **TEST** `hooks/useEnterAnimationProgress.test.ts` 中 `it('元素進入 viewport 後啟動 0→1 motion 動畫')`

#### Scenario: useEnterAnimationProgress 卸載時 disconnect observer

- **GIVEN** 元件已掛載 `useEnterAnimationProgress(ref)`
- **WHEN** 元件卸載
- **THEN** 內部 IntersectionObserver 被 disconnect，無 leak
- **TEST** `hooks/useEnterAnimationProgress.test.ts` 中 `it('卸載時 disconnect observer')`

### Requirement: `prefers-reduced-motion` 全域降級

系統 SHALL 提供 `hooks/useReducedMotion.ts`：監聽 `(prefers-reduced-motion: reduce)` media query，回傳目前值；media query 變動時 SHALL 觸發 React 重新渲染；元件卸載時 SHALL 移除事件監聽。

當 `useReducedMotion()` 為 true 時，`useStageProgress` SHALL 回傳 `null`；stage 元件 SHALL 以 `useMotionValue(1)` fallback 配 `useTransform` 直接呈現動畫終點狀態（counter=81、廚房紅區 0.85、CTA opacity=1 等），確保使用者看到完整內容而非空白起點。`scroll-snap` 與 progress rail SHALL 保留以利使用者控制節奏與感知位置。

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

### Requirement: Hero 入場動畫直接顯示全部內容

系統 SHALL 在 `components/guide/Hero.tsx` 以 motion `staggerChildren` 變體於頁面載入時依序帶出全部內容（badge / 主標題 / 副標 / 三項統計 / CTA），不依賴 scroll 進度控制顯示時機。所有元素 SHALL 於頁面載入後 1 秒內全部進場完成、永遠可見。

新增之入場動畫 SHALL NOT 違反既有 `pickleball-guide-page` 規格之 Hero 既有要求（badge、主標題、三項統計仍須於頁面載入後可見）。

> 原 design 規劃 Hero 為 scroll-driven（progress 約 90% 浮現 CTA），實作期間因 motion `useScroll` 在內部 scroll container 的 progress 計算與 CTA 在 viewport 中的時機難以對齊（CTA 永遠看不到），已簡化為直接 staggerChildren 全部載入。詳見 design doc 末尾 Implementation Changelog 第 3 項。

#### Scenario: 載入 `/` 後 Hero 全部內容可見

- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成、stagger 入場動畫播完（約 1 秒內）
- **THEN** 視窗內可見 badge「2025 完全入門指南」、主標題「匹克球新手完全入門」、副標、三項統計、與「進入完整體驗 →」CTA

#### Scenario: reduced motion 下 Hero 行為向下相容

- **GIVEN** 使用者瀏覽器 `prefers-reduced-motion: reduce` 啟用
- **WHEN** 使用者開啟 `/`
- **THEN** Hero 顯示 badge、主標題與三項統計（與既有 `pickleball-guide-page` 規格一致）

### Requirement: 首頁 CTA 串接並觸發方向性過場

系統 SHALL 於 `components/guide/Hero.tsx` 內部主內容區塊末段（三項統計之後）渲染「進入完整體驗 →」按鈕（`HeroTourCta` 元件）。`HeroTourCta` SHALL 使用 Next.js `<Link href="/tour" transitionTypes={["nav-forward"]}>` 配 shadcn `Button asChild` 形式，享受 prefetch 與 no-JS fallback；Next.js 16 router 內部會於 view transition 期間呼叫 React 的 `addTransitionType`。

`/tour` 內之 ClosingStage「回到完整指南」按鈕與 `TourSkipButton` 點擊 SHALL 呼叫 `router.push(href, { transitionTypes: ['nav-back'] })` 並導航回 `/`（Skip 目標為 `/#court`，額外 scroll 至 `#court`）。這兩個入口為 imperative，因為它們在點擊瞬間即離開頁面，prefetch 收益低。

`app/layout.tsx` 之主內容 SHALL 由 React 19 `<ViewTransition>` 包覆，透過 CSS 對 `nav-forward` 與 `nav-back` 兩 transition type 套用不同方向滑入動畫。專案 SHALL 於 `next.config.ts` 啟用 `experimental.viewTransition: true`。

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
