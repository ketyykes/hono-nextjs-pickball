## Why

現有匹克球指南為純靜態長頁，內容完整但缺乏作品集所需的視覺亮點與互動深度。為了把專案升級成個人作品集級別的展示，需要在不破壞既有 11 個 section 的前提下，加入一條高動畫密度的「捲動敘事」體驗，作為練習 CSS scroll-timeline、motion `useScroll`、React 19 `<ViewTransition>` 的場景。

## What Changes

- 新增 `/tour` 路由，內含 6 個全螢幕 scroll-driven stage（場地對比 / 玩家成長 / 兩跳規則 / 廚房違規 / 球拍材質 / 收束 CTA），每段以 100vh 高度 + scroll-snap 串接。
- 將既有 `components/guide/Hero.tsx` 由 `staggerChildren` 入場動畫升級為 scroll-driven sequence；既有 `staggerChildren` 邏輯保留作為 `prefers-reduced-motion` fallback。
- 新增首頁 `app/page.tsx` 的「進入完整體驗 →」CTA，串接 `/` ↔ `/tour` 雙向導覽。
- 新增雙路徑動畫策略：CSS scroll-timeline（Chrome/Edge/Firefox）為主，motion `useScroll`/`useTransform` 為 fallback；以 `lib/scrollTimeline.ts` 一次性偵測。
- 新增 `prefers-reduced-motion` 全域降級：開啟時關閉所有 scroll-driven 動畫，保留 scroll-snap 與內容可達性。
- 新增 React 19 `<ViewTransition>` 包覆 `app/layout.tsx` 的主內容，搭配 `addTransitionType('forward'|'back')` 為 `/` ↔ `/tour` 提供方向性過場。

## Capabilities

### New Capabilities

- `tour-experience`: 定義 `/tour` 路由的 6 段 scroll-driven 體驗、Hero scroll-driven 重做、`/` ↔ `/tour` 路由動畫、scroll-timeline 偵測與 fallback、reduced-motion 降級。

### Modified Capabilities

（無——本變更不修改 `pickleball-guide-page` 既有要求；Hero 改造為「向下相容的能力擴增」，既有靜態行為作為 fallback 保留，不違反現行 spec。）

## Impact

- **新增程式檔**：
  - `app/tour/page.tsx`
  - `components/tour/{TourStage,TourProgressRail,TourSkipButton}.tsx`
  - `components/tour/stages/{CourtSize,PlayerGrowth,TwoBounce,KitchenViolation,MaterialsSpectrum,Closing}Stage.tsx`
  - `components/tour/shared/ScrollTimelineProvider.tsx`
  - `hooks/{useScrollLinkedProgress,useReducedMotion}.ts`(+ `.test.ts`)
  - `lib/scrollTimeline.ts`(+ `.test.ts`)
  - `data/tour/playerGrowth.ts`(+ `.test.ts`)
  - `tests/e2e/specs/tour.spec.ts`
- **修改既有檔**：
  - `app/page.tsx`（加 CTA）
  - `app/layout.tsx`（包 `<ViewTransition>`）
  - `app/globals.css`（新增 scroll-timeline keyframes 與 utility）
  - `components/guide/Hero.tsx`（scroll-driven 升級，向下相容 fallback）
- **依賴**：不新增 npm 套件；沿用既有 `motion`、Next.js 16、React 19。
- **效能**：所有動畫只動 `transform` 與 `opacity`；`will-change` 只在 stage 進入 viewport 時加上。
- **a11y**：`prefers-reduced-motion` 啟用時 stage 退化為靜態內容，導覽與內容仍可達。
- **SEO**：`/tour` metadata 獨立設定；對搜尋引擎開放索引但 sitemap 不給高 priority。
- **無後端／DB／使用者帳號**。
