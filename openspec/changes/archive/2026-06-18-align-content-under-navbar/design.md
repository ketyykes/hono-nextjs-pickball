## Context

目前全站 fixed 導覽列高度與堆疊：

| 元件 | 高度 | top | z-index | 出現於 |
|---|---|---|---|---|
| `SiteNavbar` | 56px (`h-14`) | `top-0` | `z-110` | 全部路由 |
| `TocBar` | ~56px（py-4 + 字級） | `top-14` | `z-100` | 僅 `/`（首頁） |

合計覆蓋：首頁 **上方 112px**、`/tour` **上方 56px**。

主要 layout 行為：

- `nextjs-pickball/app/page.tsx`：`<Hero />` 用 `min-h-screen flex items-center`；浮球用 `absolute top-[15%]`（相對 hero 區塊）→ 視窗越矮，浮球絕對 y 越小，最終鑽到 nav 之下
- `nextjs-pickball/app/tour/page.tsx` → `TourShell`：`<main h-screen overflow-y-scroll snap-y snap-mandatory>`；每個 `TourStage` 為 `h-screen flex items-center` → SiteNavbar 直接蓋在 main 上方
- 既有 specs 中，`pickleball-guide-page` 已明確要求 TocBar 以 `top-14` 跟 SiteNavbar 對齊；本次改動將進一步要求**內容區也避開兩條 nav 的合計高度**

navbar 顏色現狀：

- 兩條 nav 的透明態都用 `bg-slate-900/20 backdrop-blur-sm`、各自有 `border-b`
- 在 hero 上看是「兩條獨立橫條」，視覺上 border 切割明顯
- solid 態 `bg-background/90`（純白）→ 從深色 hero 切到亮白對比過強

## Goals / Non-Goals

**Goals:**

- 矮視窗（含 600px 高的筆電瀏覽器）下，首頁 Hero 的浮球、`/tour` stage 的標題與主圖都不被 fixed nav 遮擋
- 兩條 nav 在首頁堆疊時視覺上像一個區塊（移除中間的視覺切割線）
- solid 態的對比降低、保留可讀性
- 改動最小、不引入新依賴、不改變既有 z-index 階層與 view transition 行為

**Non-Goals:**

- 不重新設計 TocBar 的功能（scroll-spy、橫向 scroll、active 樣式維持）
- 不改 navbar 的高度（h-14）、字級、字型
- 不在 `/tour` 加 TocBar，也不在 `/quiz` / `/scoreboard` 加 TocBar
- 不引入 dvh / svh 等視口動態單位（改動範圍超出本次目的）

## Decisions

### D1：以「navbar 偏移層」概念重構 layout，而非個別擠 padding

**Decision**：在 `nextjs-pickball/app/globals.css` 的 `:root` 引入兩條 CSS variable

```css
:root {
  --site-nav-h: 3.5rem;   /* 56px，對應 h-14 */
  --toc-bar-h: 3.5rem;    /* 56px，對應 TocBar py-4 + 字級換算 */
}
```

並提供 utility class `.pt-nav`、`.pt-nav-and-toc` 或直接以 Tailwind arbitrary value（`pt-[var(--site-nav-h)]`）套用。

**Alternatives considered**：

| 方案 | 評估 |
|---|---|
| **A. 直接寫死 `pt-14` / `pt-28`** | 改動最小，但 56 / 112 散落各處難維護；TocBar 若改高度多處要同步修 |
| **B. CSS variable + Tailwind arbitrary**（選用） | 一處定義、各檔取用；之後若調高度只動變數 |
| **C. 用 Tailwind theme extend 定義 `spacing.nav`** | 需動 `tailwind.config`，本專案 Tailwind v4 走 CSS-first，與 `@theme inline` 風格不一致 |

**Rationale**：本專案 globals.css 已用 `@theme inline` 集中管理色票，引兩條 layout 變數一致；arbitrary value 可在 Tailwind class 內直接讀取。

---

### D2：Hero 改用「nav 偏移容器」承載浮球與主內容

**Decision**：將 Hero 改為兩層結構：

```tsx
<section className="relative min-h-screen overflow-hidden bg-slate-900">
  {/* 背景光暈仍鋪滿整個 section（含 nav 區，從上方就帶 ambiance） */}
  <div aria-hidden className="absolute inset-0 ..." />

  {/* nav 偏移層：浮球與主內容都掛在這層內 */}
  <div className="relative flex min-h-screen flex-col items-center justify-center pt-[calc(var(--site-nav-h)+var(--toc-bar-h))]">
    {/* 浮球：絕對定位相對此層而非 section，top-[15%] 改為「nav 之下的 15%」*/}
    <div className="absolute top-[15%] right-[12%] ..." />
    {/* 主內容 motion.div ... */}
  </div>

  {/* scroll indicator：仍在 section bottom，不受 nav 偏移影響 */}
</section>
```

**Rationale**：背景光暈鋪滿整個 viewport 維持深色背景延伸到 nav 之下（讓透明 nav 有底色），但所有「主視覺元素」起算點都在 nav 之下。

**Trade-off**：主內容垂直中心會略微下移（112px / 2 ≈ 56px 偏離原始幾何中心），但實測在 hero 視覺感受上反而更平衡（原本主標題其實偏上）。如果視覺上發現過於下沉，再以 `pb-` 或 inner `pt-0` 微調。

**Implementation correction**（視覺驗收後補）：偏移層的 `pt-[calc(var(--site-nav-h)+var(--toc-bar-h))]` 只影響 **flow children**（即主內容 motion.div），對 **absolute children**（浮球）無效——CSS 規範：absolute 子元素的 `top: %` 是相對 containing block 的 padding-box 頂端起算，padding 區域被算進「可用範圍」。因此浮球的 top 必須明確含 nav offset：

```tsx
className="absolute top-[calc(var(--site-nav-h)+var(--toc-bar-h)+15%)] right-[12%] ... max-md:top-[calc(var(--site-nav-h)+var(--toc-bar-h)+10%)] ..."
```

主內容 motion.div 維持由偏移層 `pt-[...]` + `flex flex-col items-center justify-center` 處理（flow child 受 padding 影響）。

---

### D3：`/tour` 的 `<main>` 從 100vh 縮為「100vh − navbar」

**Decision**：

```tsx
<main
  ref={mainRef}
  style={{
    height: "calc(100dvh - var(--site-nav-h))",
    marginTop: "var(--site-nav-h)",
  }}
  className="relative snap-y snap-mandatory overflow-y-scroll bg-slate-900 text-white"
>
```

stage 改用 `h-full` 讓 stage 自動 = main 的可視高度，避免 stage 超出 main 造成 snap 點偏移。

**Inline style 而非 Tailwind arbitrary value**：原本嘗試 `h-[calc(100vh-var(--site-nav-h))]` 與 `mt-[var(--site-nav-h)]`，視覺驗收實測在 Next.js 16 dev pipeline 下沒有把 main 推到 SiteNavbar 下方（stage 標題被白色 solid navbar 覆蓋）。雖然 Tailwind v4 官方範例支援這類寫法，但在這個專案的實際 build path 上不穩——改用 inline style 100% 確保 `var()` 解析與 `calc()` 運算都被瀏覽器正確處理。同時以 `100dvh` 取代 `100vh` 處理行動瀏覽器位址列收合造成的高度跳動。

**Alternatives considered**：

| 方案 | 評估 |
|---|---|
| **a. main 用 `pt-14`、stage 仍 `h-screen`** | stage 會超出 main 視窗範圍（總高 = 56 + 100vh × 6），snap 點與內容位置不再對齊 viewport |
| **b. main `h-[calc(100vh-56px)] mt-14`、stage `h-full`**（選用） | snap container 縮短但 stage 完全填滿；視覺中心自然落在 nav 之下 |
| **c. SiteNavbar 在 `/tour` 改為非 fixed** | 動到全站 navbar 的核心契約，影響 view transition 與其他路由 |

**Rationale**：方案 b 的縮短策略對 IntersectionObserver `root={mainRef}` 友好（既有 `useStageProgress` 已基於 mainRef，無需改 hook 邏輯）。

---

### D4：navbar 顏色和諧化

**Decision**：

**(1) 透明態**

- `SiteNavbar` 透明態：`bg-slate-900/20 backdrop-blur-sm border-b border-white/10` → 維持背景，**border 改為 `border-white/5`**（降低切割感）
- `TocBar` 透明態：`bg-slate-900/20 backdrop-blur-sm` → 改為 **無 border-b**、改用 `bg-slate-900/30`（比 SiteNavbar 稍深半階，自然形成階序）

兩條 nav 從上到下：`slate-900/20`（淺）→ `slate-900/30`（深），形成自然漸層而非兩條獨立橫條。

**(2) Solid 態**

- `SiteNavbar` solid 態：`bg-background/90 shadow-sm backdrop-blur` → 改為 `bg-background/85 shadow-sm backdrop-blur-md`（略降低不透明度、模糊加重，避免「純白板子」感）
- `TocBar` solid 態：維持 `bg-background/90 shadow-md backdrop-blur`，但因 SiteNavbar shadow 已含，TocBar shadow 改 `shadow-sm` 即可

**(3) hover / active 仍維持 lime-400 強調**——這是專案視覺辨識，不動

**Rationale**：透明態用「同色系不同 alpha」做階序比兩條獨立 border 自然；solid 態用 `bg-background/85` 留下背景的視覺呼吸，避免從深色 hero 突然全白的 jarring。

**Alternatives considered**：

| 方案 | 評估 |
|---|---|
| **完全融合**（兩條合一） | 需重構 TocBar 為 SiteNavbar 的 children；牽涉 z-index 與 view transition 哪邊掛載，太大改動 |
| **同 alpha 不同 hue**（如 slate + neutral） | 在深色 hero 上難拉開差異，反而更糊 |
| **同色系不同 alpha**（選用） | 視覺自然、改動小 |

---

### D5：不引入新測試，僅以視覺驗收 + E2E smoke 確認

**Decision**：本次改動全部落在「樣式 / 入口 layout / 元件容器 className」三個免 TDD 例外類別。不新增 Vitest 測試。

- 既有 `nextjs-pickball/tests/e2e/specs/` 若使用 `toBeVisible()` 或 `data-testid` 斷言（而非絕對 y 座標），不受影響
- 改動完成後執行 `pnpm dev` 在 600px / 800px / 1080px 三種高度視窗肉眼驗收
- 視需要在 `nextjs-pickball/tests/e2e/specs/` 補一條 smoke test：「浮球的 `getBoundingClientRect().top` 不小於 nav 合計高度」——若 user 要求再補

## Risks / Trade-offs

- **Hero 主標題視覺中心下移** → 改動後在 1080p 上實測；若視覺上偏低，於 nav 偏移層加 `pb-[var(--site-nav-h)]` 平衡
- **`/tour` main 縮短後總可捲距離變短** → 不影響：snap 行為依然 6 段；TourProgressRail 與 useStageProgress 都以 mainRef 為 root，自動跟隨
- **CSS variable 在 Tailwind v4 內取用語法** → 用 arbitrary value `pt-[var(--site-nav-h)]`，Tailwind v4 完全支援
- **既有 `pickleball-guide-page` spec 中與 SiteNavbar 樣式相關的 scenario** → 需要 delta 改寫對應 scenario 用詞（描述新顏色階序），避免規格與實作脫鉤
- **navbar 顏色和諧化是主觀判斷** → design 內已給出明確 className，user 視覺驗收後若不滿意可在 tasks 階段微調而不必重開 change

## Migration Plan

1. 先改 `globals.css` 加入兩條 layout variable
2. 改 `SiteNavbar` / `TocBar` className（顏色和諧化）
3. 改 `Hero.tsx` 加 nav 偏移層
4. 改 `TourShell.tsx` 縮 main 高度、stage 用 `h-full`
5. 視覺驗收（600 / 800 / 1080 三種高度）
6. 對 E2E 跑一次 `pnpm test:e2e`，確認 selector 沒因 DOM 結構增層而失效

**Rollback**：以單一 commit 完成，rollback 用 `git revert`。
