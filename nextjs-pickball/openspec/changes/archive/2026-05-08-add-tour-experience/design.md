## Context

匹克球指南目前以 `app/page.tsx` 為單一進入點，組合 11 個 section。動畫僅由 motion `staggerChildren` 與少數 keyframes utility 實作，無 scroll-driven 互動。完整設計細節（含 stage 腳本、目錄結構、效能要點）已於 `docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md` 留存，本檔僅提煉技術決策、風險與遷移策略。

關鍵限制：

- Next.js 16 App Router、React 19、Tailwind v4、`motion` 已就緒；不允許新增動畫套件。
- 既有 OpenSpec capability `pickleball-guide-page` 不得改動（Hero 改造需向下相容）。
- 行為邏輯模組（hooks／lib／data）採 TDD；樣式、入口、E2E 屬例外層。
- mobile Safari 不支援 CSS scroll-timeline，必須具備 fallback。

## Goals / Non-Goals

**Goals:**

- 在 `/tour` 提供 6 段 scroll-driven 沉浸體驗，作為作品集動畫亮點。
- Hero 升級為 scroll-driven 主動畫，既有 motion 行為作 reduced-motion fallback。
- `/` ↔ `/tour` 之間以 React 19 `<ViewTransition>` 與 `addTransitionType` 提供方向性過場。
- 雙路徑動畫策略：CSS scroll-timeline 為主、motion `useScroll` 為 fallback；判斷一次後全頁共享。
- 完整支援 `prefers-reduced-motion`：開啟時關閉所有 scroll-driven 動畫，不影響可達性。

**Non-Goals:**

- 不修改既有 11 個 section 的版面、資料或互動。
- 不引入新動畫套件（GSAP、Lottie 等）。
- 不做使用者帳號、後端、DB、UGC、留言。
- 不做 i18n、A/B 測試、客製化 OG 動圖。
- 不做 mobile 專屬動畫腳本（mobile 一律走 fallback 或 reduced-motion 定格）。
- 不做 `/` ↔ `/tour` 的 shared element morph（兩頁差異太大，純滑動過場已足夠）。

## Decisions

### 1. 雙路徑動畫策略：CSS scroll-timeline 為主，motion `useScroll` 為 fallback

**選擇**：以 `lib/scrollTimeline.ts` 偵測 `CSS.supports('animation-timeline: scroll()')` 與 `animation-range`，於 `<ScrollTimelineProvider>` 一次性決定，全頁共享 context。stage 元件透過 `useStageProgress(ref)` 取得進度：支援者回 `null`（CSS 自跑），不支援者回 `MotionValue<number>`。

**理由**：

- CSS scroll-timeline 由瀏覽器原生跑，零 JS 控制成本，效能最佳。
- mobile Safari 與舊瀏覽器仍需要 fallback；motion `useScroll` 已在專案內、零新依賴。
- 「偵測一次、全頁共享」避免每個 stage 各自呼叫 `CSS.supports` 造成的閃爍與不一致。

**替代方案**：

- 全程用 motion `useScroll`：穩定、相容性最好，但放棄練 CSS scroll-timeline 的目的。
- 用 GSAP ScrollTrigger：能力最強，但新增大型依賴與既有 motion 衝突。

### 2. `components/tour/` 與 `components/guide/` 平行而非巢狀

**選擇**：新增 `components/tour/` 為平行於 `components/guide/` 的模組目錄；stage 內容文案直接寫在元件內，不抽 `data/tour/stages.ts`；唯一例外是 stage 2 的年度玩家數據集中於 `data/tour/playerGrowth.ts`。

**理由**：

- tour 是新功能模組，與既有指南分離，避免互相影響、便於將來獨立演進或刪除。
- 文案內聯與既有 `components/guide/` 的習慣一致，降低資料／視圖跳檔。
- 純數值資料（折線圖年度數據）抽出便於 TDD 與重用。

**替代方案**：

- 把 tour 放在 `components/guide/tour/` 之下：強耦合既有指南、命名語意混淆。
- 全部抽 data：與既有風格不一致、每加一句文案就要跳檔，作品集型專案不必要。

### 3. Hero scroll-driven 升級採「向下相容」而非取代

**選擇**：保留既有 `staggerChildren` 入場動畫作為 `prefers-reduced-motion` fallback；scroll-timeline 僅在 `useReducedMotion()` 為 false 且 `supportsScrollTimeline()` 為 true 時接管。

**理由**：

- 既有 OpenSpec `pickleball-guide-page` 對 Hero 行為有 spec；若改寫成只有 scroll-driven 會違反規格。
- a11y 要求：reduced-motion 開啟時必須有靜態替代，順手沿用既有實作。
- 風險最小：scroll-driven 是「增量加上」，舊行為仍可由測試與規格驗證。

**替代方案**：

- 直接改寫成 scroll-driven only：違反既有 spec、a11y 倒退。
- 兩套元件 (`HeroLegacy` + `HeroScrollDriven`) 切換：分支邏輯重複、維護成本高。

### 4. `<ViewTransition>` 採 React 19 + Next.js 16 整合，不做 shared element

**選擇**：在 `app/layout.tsx` 包覆主內容；首頁 CTA 與 Skip 按鈕在點擊時呼叫 `addTransitionType('forward'|'back')`，讓 CSS 依 type 套不同滑入方向。`/` ↔ `/tour` 兩頁差異過大，不做 shared element morph。

**理由**：

- React 19 `<ViewTransition>` 已穩定，是作品集練習的目標技術。
- 方向性過場用 `addTransitionType` 即可達成，不需 manual key 控制。
- shared element 在兩頁佈局差異大時收益低、實作複雜，與作品集「亮點」目標不成正比。

**替代方案**：

- motion 手刻 page transition：練不到 `<ViewTransition>`，且 Next.js App Router 整合手刻較繁瑣。
- 加 shared element morph：練更深，但需要重構兩頁找出真正可 morph 的元素，超出本次範圍。

### 5. TDD 邊界

- **必 TDD（行為邏輯）**：`lib/scrollTimeline.ts`、`hooks/useScrollLinkedProgress.ts`、`hooks/useReducedMotion.ts`、`data/tour/playerGrowth.ts`。
- **不必 TDD（例外層）**：`app/tour/page.tsx`、`app/page.tsx`、`app/layout.tsx`、`app/globals.css`、`components/tour/**`、`components/guide/Hero.tsx`（純展示）。例外層以 Playwright E2E 驗收。
- 例外層 task 雖不寫 unit test，但仍需在 `tasks.md` 指定具體驗收方式（E2E 路徑、視覺驗收項目）。

## Risks / Trade-offs

- [scroll-timeline 在 mobile Safari 不支援] → 行動裝置一律走 motion fallback；偵測在 `<ScrollTimelineProvider>` 一次完成，stage 元件只看 context。
- [CSS scroll-timeline 在 Firefox 142 才正式支援] → 偵測本身會自動降級，無需特殊處理；測試需 mock `CSS.supports` 兩種回傳。
- [React 19 `<ViewTransition>` 在 Next.js 16 App Router 整合可能需 experimental flag] → 在 task 10 整合時先驗證；若需 flag 但風險過高，降級為 motion 手刻過場（不影響其他 stage 動畫）。
- [既有 Hero 規格不可破壞] → 既有 motion `staggerChildren` 作為 reduced-motion fallback 保留；改造後既有 unit/E2E 測試需通過。
- [scroll-snap 在低階機可能造成捲動卡頓] → 開發中以實機驗證；若卡頓則退回非強制 snap（`scroll-snap-type: y proximity`）。
- [stage SVG 動畫在低階機效能不佳] → 一律只動 `transform`／`opacity`；`will-change` 由 IntersectionObserver 控制，不長期掛上。
- [shared element 不做] 接受作為作品集深度的一個取捨；後續若有需求可獨立另案。

## Migration Plan

- 屬純新增 + 既有檔向下相容修改，無資料遷移、無 API 變動。
- Rollback：刪除 `components/tour/`、`app/tour/`、`hooks/useScroll*`、`hooks/useReducedMotion*`、`lib/scrollTimeline*`、`data/tour/`，並還原 `app/page.tsx`、`app/layout.tsx`、`app/globals.css`、`components/guide/Hero.tsx` 即可。
- 部署順序與一般 PR 相同；不需 feature flag。

## Open Questions

- React 19 `<ViewTransition>` 在 Next.js 16 App Router 是否需 `experimental.viewTransition` flag？task 10 開始整合時需以 `vercel-react-view-transitions` skill 驗證實際 API；若需要 flag 且穩定性低，task 10 將降級為 motion 手刻過場並在 spec 標註。
