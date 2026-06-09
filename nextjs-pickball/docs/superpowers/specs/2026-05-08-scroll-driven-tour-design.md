# Scroll-Driven Tour 設計文件

- 日期：2026-05-08
- 分支：`feature/scroll-driven-tour`
- 目標讀者：實作者（後續 writing-plans 會以此為輸入）

## 1. 目標與範圍

在現有匹克球指南單頁（`/`）之上，加入兩塊高動畫密度的展示，定位為個人作品集亮點，
重點練習動畫與互動體驗（CSS scroll-timeline、motion `useScroll`、React 19 `<ViewTransition>`）。

### 範圍內

- **Hero scroll-driven 重做**：將 `components/guide/Hero.tsx` 的 `staggerChildren` 入場動畫升級為
  scroll-driven sequence，0–100vh 之間依捲動進度推進主標題、透視場地、統計、CTA 出現節奏。
- **新 sub-route `/tour`**：6 個全螢幕 stage，每段一條 scroll-driven 動畫，呈現匹克球場地、玩家成長、
  兩跳規則、廚房違規、球拍材質、收束 CTA。
- **`/` ↔ `/tour` 路由動畫**：以 React 19 `<ViewTransition>` + `addTransitionType('forward'|'back')`
  做方向性過場。
- **fallback 機制**：CSS scroll-timeline 不支援時退回 motion `useScroll`／`useTransform`。
- **`prefers-reduced-motion` 支援**：開啟時關閉所有 scroll-driven 動畫，僅保留靜態內容與 scroll-snap。

### 範圍外

- 既有 11 個 section（CourtSection ~ StarterSection）的版面與互動皆不更動。
- 不引入新動畫套件（不使用 GSAP；既有 `motion` 已足）。
- 無使用者帳號、後端、DB、UGC、留言、評論。
- 無 i18n、無 A/B 測試、無客製化 OG 動圖。
- mobile 不做特化動畫，以靜態淡入呈現（避免 scroll-timeline 在 mobile Safari 的相容問題）。

## 2. `/tour` 6 個 stage 腳本

每個 stage 為 100vh 高的 scroll container，scroll-snap-align: start 強制停靠。

| # | Stage 標題 | 動畫主題 | scroll 進度 0→1 內變化 |
|---|---|---|---|
| 1 | 「比網球更小，但同樣激烈」 | 球場大小對比 | 視窗中央先出現網球場 SVG，捲動時球場縮小至 1/4 並重疊出匹克球場輪廓；旁邊計數器 `260㎡ → 81㎡` 跑數字 |
| 2 | 「14 萬人正在打」 | 台灣玩家成長曲線 | 折線圖從 2020 一路畫到 2025，y 軸隨進度 tween；右側人形圖示同步增加 |
| 3 | 「兩跳規則，最關鍵的一條」 | 球的軌跡演示 | 側視 SVG：發球 → 球落地一次 → 對方接 → 落地一次 → 才開始截擊；scroll 控制小球的 x/y 位置與軌跡虛線 dashoffset |
| 4 | 「廚房：腳一進去就犯規」 | 俯視場地 + 紅區 | 俯視場地，scroll 時廚房紅區從淡入到完整高亮；腳印 SVG 從後場走入廚房，越線時觸發紅色閃爍 |
| 5 | 「球拍材質光譜」 | 三種材質卡片橫向推移 | scroll 推進時三張卡片（玻纖／碳纖／凱夫拉）水平 horizontal pin 推移，每張高亮時其雷達圖數值補間 |
| 6 | 「準備好開始了嗎？」 | CTA 收束 | scroll 末段：球員 SVG 收拍敬禮、文字浮現「回到完整指南」按鈕（用 `<ViewTransition>` 回 `/`） |

### 共通互動

- **scroll-snap**：`scroll-snap-type: y mandatory`，每個 stage `scroll-snap-align: start`。
- **Skip 按鈕**：右下角 fixed「跳過 →」按鈕，點擊 `router.push('/#court')` 並觸發 `back` view transition。
- **進度條**：左側 fixed 細直條，6 格，依當前 stage 高亮，`aria-valuenow` 同步更新。
- **reduced motion**：所有 scroll-driven 動畫關閉，僅保留靜態定格內容；scroll-snap 仍保留以利使用者控制節奏。

### 文案存放方式

stage 內的標題、描述、文案直接寫在對應 `components/tour/stages/*.tsx` 元件中（不抽出至 `data/tour/stages.ts`）。
唯一例外是 stage 2 的年度玩家數據，因為是純數值資料，集中在 `data/tour/playerGrowth.ts`。

## 3. 目錄與檔案結構

```
app/
├── page.tsx                          # 既有；末段加「進入完整體驗 →」CTA
├── tour/
│   └── page.tsx                      # 新增；組合 6 個 Stage 與導覽列
└── globals.css                       # 既有；新增 scroll-timeline keyframes 與 utility

components/
├── guide/
│   └── Hero.tsx                      # 既有；改為 scroll-driven 版（保留動畫初值 fallback）
└── tour/                             # 新增；與 components/guide/ 平行
    ├── TourStage.tsx                 # 共用 stage 容器（含 scroll-snap、a11y、進度回報）
    ├── stages/
    │   ├── CourtSizeStage.tsx        # § 2 #1
    │   ├── PlayerGrowthStage.tsx     # #2
    │   ├── TwoBounceStage.tsx        # #3
    │   ├── KitchenViolationStage.tsx # #4
    │   ├── MaterialsSpectrumStage.tsx# #5
    │   └── ClosingStage.tsx          # #6
    ├── TourProgressRail.tsx          # 左側 n/6 進度直條
    ├── TourSkipButton.tsx            # 右下角「跳過 →」
    └── shared/
        └── ScrollTimelineProvider.tsx# scroll-timeline 偵測 + fallback context

hooks/
├── useScrollLinkedProgress.ts        # 新增；motion useScroll 包裝（fallback 用）
├── useScrollLinkedProgress.test.ts   # 新增
├── useReducedMotion.ts               # 新增；prefers-reduced-motion 偵測
└── useReducedMotion.test.ts          # 新增

data/
└── tour/                             # 新增
    └── playerGrowth.ts               # stage 2 的年度玩家數據（純數值）

lib/
├── scrollTimeline.ts                 # 新增；CSS.supports 偵測 + helper
└── scrollTimeline.test.ts            # 新增

tests/e2e/specs/
└── tour.spec.ts                      # 新增
```

### 結構決策

- **`components/tour/` 與 `components/guide/` 平行**：tour 是新功能模組，與既有指南分離，避免互相影響；
  將來若要拆 standalone library 或刪除也容易。
- **`TourStage` 是 layout container**（負責 100vh、scroll-snap、a11y label、註冊到 progress rail），
  `stages/` 下是內容元件——關注點分離。
- **`ScrollTimelineProvider` 在 `/tour` 根節點掛一次**，全 tour 共享決策結果，
  避免每個 stage 自行偵測造成 race condition。
- **stages 文案內聯**：與 `components/guide/` 各 section 內聯文案的習慣一致。
- **唯一外抽資料 `playerGrowth.ts`**：純數字陣列，用於折線圖計算；放在 stage 元件內會干擾元件可讀性。

## 4. scroll-timeline 與 fallback 策略

### 偵測

```ts
// lib/scrollTimeline.ts
export function supportsScrollTimeline(): boolean {
  return typeof CSS !== "undefined"
    && CSS.supports("animation-timeline: scroll()")
    && CSS.supports("animation-range: entry 0% exit 100%");
}
```

於 `ScrollTimelineProvider` 初次掛載時偵測一次，存入 React context；子元件以
`useScrollTimelineSupport()` 讀取。

### 路徑 A：CSS scroll-timeline（Chrome 115+、Edge、Firefox 142+）

- 在 `app/globals.css` 新增 keyframes（如 `@keyframes stage-fade`、`@keyframes stage-pin`）。
- Stage 元件套 utility class（在 `globals.css` 內以 `@utility` 自訂）：

  ```css
  @utility animation-timeline-view {
    animation-timeline: view();
  }
  @utility animation-range-cover {
    animation-range: cover 0% cover 100%;
  }
  ```

- 完全 GPU、零 JS 控制、最佳效能。

### 路徑 B：motion `useScroll` fallback（Safari、舊瀏覽器）

- `useScrollLinkedProgress(ref)` 包裝 `useScroll({ target, offset: ["start end", "end start"] })`，
  回傳 `MotionValue<number>`（0→1）。
- Stage 元件以 `useTransform(progress, [0, 1], [...])` 把進度映射到 opacity / x / y / scale，
  套到 `<motion.div style={{ ... }}>`。

### 統一抽象

每個 stage 透過 hook `useStageProgress(ref)` 取得進度：

- 支援 scroll-timeline → 回傳 `null`（CSS 自跑，元件不需要 motion value）
- 不支援 → 回傳 `MotionValue<number>`

Stage 元件依此分支：

```tsx
const progress = useStageProgress(stageRef);
return progress
  ? <motion.div style={{ opacity: useTransform(progress, [0, 0.3], [0, 1]) }}>…</motion.div>
  : <div className="animate-stage-fade animation-timeline-view animation-range-cover">…</div>;
```

### Reduced motion 處理

`useReducedMotion()` 監聽 `(prefers-reduced-motion: reduce)`：

- 為 true 時：`useStageProgress` 回 `null` 且 stage 不再套 CSS scroll-timeline class，
  全部 stage 退化為靜態內容。
- progress rail 仍正常顯示，Skip 按鈕仍可用。

### 效能要點

- 所有 SVG 動畫只動 `transform` / `opacity`（避免 layout thrash）。
- 大型 SVG（場地俯視、折線圖）只在 stage 進入 viewport 時才加 `will-change: transform`，由 IntersectionObserver 控。
- `/tour` 頁面 client-side 即可，不需 `dynamic = 'force-dynamic'`。

## 5. 路由整合、CTA、SEO

### 路由與 ViewTransition

- 新增 `app/tour/page.tsx`，既有 `/` 不變。
- 使用 React 19 `<ViewTransition>` 包住 `app/layout.tsx` 的 `<main>`：
  - `/` → `/tour`：透過按鈕 onClick `addTransitionType('forward')` 觸發，整個視窗從右側滑入。
  - `/tour` → `/`：ClosingStage 的「回到完整指南」按鈕或 Skip 按鈕觸發 `addTransitionType('back')`，從左側滑入。
- shared element 暫不做（兩頁差異太大），路由滑動過場已足夠強。

### 首頁 CTA

於 Hero scroll-driven sequence 結束後（原 Hero 末端、TocBar 之前）插入：

```
┌─────────────────────────────────────┐
│  想用「動」的方式快速看完？          │
│  [ 進入完整體驗 → ]                  │
└─────────────────────────────────────┘
```

點擊：`addTransitionType('forward')` → `router.push('/tour')`。

### 新 Hero 行為（細節）

| scroll 進度（0vh → 100vh） | 視覺變化 |
|---|---|
| 0% | 主標題置中、badge 在上、浮球漂浮（保留現有效果） |
| 0–30% | 主標題開始往上推、字體微縮 |
| 30–60% | 透視場地進入、tilt 角度從 70° 補到 55°（最終定格樣式） |
| 60–90% | 三項統計從底部浮現 |
| 90–100% | 「進入完整體驗 →」CTA 浮現 |

既有 motion `staggerChildren` 邏輯保留作為 reduced-motion fallback；scroll-timeline 僅在能用時接管。

### Metadata

- `app/tour/page.tsx`：

  ```ts
  export const metadata = {
    title: "匹克球新手完全入門 · 互動體驗 | 匹克球指南",
    description: "用捲動的方式快速看完匹克球規則與器材重點，6 個互動場景帶你 5 分鐘上手",
  };
  ```

- 不在首頁加 `alternates`（內容不同）。
- 兩頁皆對搜尋引擎開放索引；`/tour` 在 sitemap 不給高 priority。

### 不做

- 不做 server-side scroll position 還原（`/tour` 進入永遠從 stage 1）。
- 不做客製化 OG 動圖。
- 不做 `/tour` SVG 預載。

## 6. 測試策略

### TDD 模組（依 `openspec/config.yaml` 規則）

| 模組 | 測試檔 | 關鍵 case |
|---|---|---|
| `lib/scrollTimeline.ts` | `lib/scrollTimeline.test.ts` | `supportsScrollTimeline` 在 `CSS.supports` mock 為 true/false 時回傳對應值 |
| `hooks/useScrollLinkedProgress.ts` | `hooks/useScrollLinkedProgress.test.ts` | 給定 ref，回傳 motion value；offset 預設正確；卸載時 unsubscribe |
| `hooks/useReducedMotion.ts` | `hooks/useReducedMotion.test.ts` | matchMedia 為 reduce 時回 true、change 事件監聽、卸載時 removeEventListener |
| `data/tour/playerGrowth.ts` | `data/tour/playerGrowth.test.ts` | 至少 6 筆年度資料、年份遞增、人數遞增、無重複 |

### 例外層（不強制 TDD）但補 E2E

| 區塊 | 驗收方式 |
|---|---|
| `app/tour/page.tsx` | E2E：載入後可見 stage 1、捲動到底可見 ClosingStage、Skip 按鈕跳回 `/#court` |
| `components/tour/stages/*` | 視覺驗收 + E2E 標題出現 |
| `components/guide/Hero.tsx` 改造 | 既有 unit test 不破壞；E2E：reduced-motion 啟用時 Hero scroll 動畫關閉 |
| `app/globals.css` keyframes 與 utility | 純 CSS，不必 unit test；視覺驗收 |

### Playwright E2E（`tests/e2e/specs/tour.spec.ts`）

- 首頁有「進入完整體驗 →」按鈕
- 點擊後 URL 變為 `/tour`
- `/tour` 載入後第一眼可見 Stage 1 標題
- 捲動到 90% 後可見 ClosingStage 與返回按鈕
- Skip 按鈕點擊後回到 `/#court` 並滾到 court section
- `prefers-reduced-motion` 啟用時，Hero 與 Tour 動畫關閉但內容仍可達

### OpenSpec 對齊

- 建立新 spec：`openspec/specs/tour-experience/spec.md`
  - `Purpose`：定義 `/tour` 互動體驗路由與 Hero scroll-driven 重做
  - `Requirements`：路由 `/tour` 包含 6 個 stage、scroll-timeline 偵測與 fallback、
    reduced-motion 降級、首頁 CTA 串接、Hero 既有行為向下相容
  - `Scenarios`：每條 requirement 配 Given/When/Then，行為邏輯類附對應 Vitest 檔
- 不修改現有 `pickleball-guide-page` spec（這是新功能、非修改既有頁面行為）。

## 7. 漸進實作順序（writing-plans 輸入）

1. `lib/scrollTimeline.ts` + 測試（紅 → 綠 → refactor）
2. `hooks/useReducedMotion.ts` + 測試
3. `hooks/useScrollLinkedProgress.ts` + 測試
4. `data/tour/playerGrowth.ts` + 測試
5. `components/tour/shared/ScrollTimelineProvider.tsx`
6. `components/tour/TourStage.tsx`（layout container）
7. 6 個 stage 元件（依 § 2 順序）
8. `TourProgressRail` + `TourSkipButton`
9. `app/tour/page.tsx` 組裝
10. `<ViewTransition>` 接 `/` ↔ `/tour`
11. `app/globals.css` 新增 keyframes 與 utility
12. `components/guide/Hero.tsx` 改造（最後做，因為依賴 hooks）
13. 首頁 `app/page.tsx` 加 CTA
14. Playwright E2E (`tests/e2e/specs/tour.spec.ts`)
15. 寫 OpenSpec spec、archive change

## 8. 風險與假設

- **scroll-timeline 在 mobile Safari 不支援**（截至 2026-05）：行動裝置全走 fallback；
  若 fallback 在低階機效能差，會以 `useReducedMotion` 強制定格作為兜底。
- **React 19 `<ViewTransition>` 在 Next.js 16 App Router 的整合**：依 `vercel-react-view-transitions`
  skill 提供的 API 為準；若整合需 `experimental` flag，會在 task 10 評估後決定是否降級為 motion 手刻過場。
- **既有 Hero 測試不可破壞**：Hero 既有 `staggerChildren` 行為作為 reduced-motion fallback 保留，
  scroll-timeline 增量加入。改造後既有 E2E（如有）需通過。
- 所有動畫只用 `transform` 與 `opacity`，不引入 layout-affecting 屬性。

## 9. Implementation Changelog（實作後對齊）

本節記錄實作期間因技術限制或實際使用體驗而對原設計的偏離。本檔以上各節保留為設計時間點快照，
真實的 capability 描述以 `openspec/specs/tour-experience/spec.md` 為準。

### 9.1 Stage 動畫機制：scroll-driven → IntersectionObserver 一次性進場

- **原設計**（§4）：CSS scroll-timeline（路徑 A） + motion `useScroll` fallback（路徑 B），由 stage 內 `useStageProgress(ref)` 統一抽象
- **實作**：`useEnterAnimationProgress` hook，元素進入 viewport 時用 `IntersectionObserver` 觸發 motion `animate(progress, 1, ...)` 一次性 0→1 動畫
- **原因**：
  - `/tour` 用 `snap-mandatory`，使用者只能停在每個 stage 的 snap 起點，沒有「捲動進度中間態」可看，scroll-driven 動畫使用者實際看不到中間值
  - motion `useScroll` 在 main 內部 scroll container 雖可讀進度，但 stage 1 一進入頁面就在 snap 終點（progress=1）、動畫已完成，counter 直接顯示 81（看不到 260→81 的跑數效果）
  - 改 IntersectionObserver 後每次 snap 進入新 stage 都會重頭播放完整動畫，視覺敘事更直觀
- **影響**：`useStageProgress` 不再依 `useScrollTimelineSupport()` 分支；CSS scroll-timeline 偵測（`supportsScrollTimeline`）、`useScrollLinkedProgress`、`stage-fade` / `stage-pin` keyframes 與 `animation-timeline-view` / `animation-range-cover` utility 仍存在於 codebase（測試保留），但不被 stage 元件使用

### 9.2 `useScrollLinkedProgress` 預設 offset 調整

- **原設計**：`offset: ["start end", "end start"]`（範圍 = stage 高度 + viewport = 200vh，progress 0=stage 即將進入、progress 1=stage 完全離開）
- **實作**：`offset: ["start end", "start start"]`（範圍 = viewport 高度 = 100vh，progress 0=stage 即將進入、progress 1=stage 完全 snap 進入）
- **原因**：搭配 snap-mandatory 設計，動畫應在「stage 進場 transition 期間」發生、停留時看到終點狀態。原 offset 讓進入頁面時 progress 已 = 0.5，counter 等元件起始值錯位
- **影響**：因 9.1 改用 IntersectionObserver，`useScrollLinkedProgress` 雖保留 hook 與 test，但 stage 元件已不使用；offset 調整對未來 scroll-driven 場景仍有價值

### 9.3 Hero scroll-driven → staggerChildren 全部載入

- **原設計**（§5「新 Hero 行為」）：scroll 進度 0–100% 推進主標題上推 / 統計浮現 / CTA 在 90% 浮現
- **實作**：移除 scroll-driven 套用，Hero 只用 motion `staggerChildren` 變體於頁面載入時依序帶出 5 個元素（badge / 主標題 / 副標 / 統計 / CTA），CTA 永遠可見
- **原因**：
  - Hero 的 scroll progress 計算與「CTA 在視窗中的時機」對不上——CTA 元素在 motion.div 中央，當 progress 進入 0.85 區間時 CTA 已被捲出視窗，使用者永遠看不到 CTA fade-in
  - 嘗試調整 offset 範圍仍無法兼顧 stage 1 (progress=0.5 已是停留點) 與 CTA 可見時機
  - 簡化為 staggerChildren 後使用者一進入頁面看到完整 Hero，CTA 立即可點，導入體驗更直接
- **影響**：Hero 不再需要 `useScrollLinkedProgress` / `useScrollTimelineSupport`；`HeroTourCta` 元件改寫為純按鈕（不再帶獨立 section 樣式）內嵌於 Hero 主內容末段

### 9.4 Stage 4 標題糾錯

- **原設計**（§2 表格）：「廚房：腳一進去就犯規」
- **實作**：「廚房：絕對不能截擊」
- **原因**：原標題對匹克球規則理解有誤——進入廚房本身合法，違規條件是「在廚房內凌空截擊（球未落地就回擊）」。標題糾正後敘事改為「站在廚房內 → 球飛入 → 截擊瞬間紅閃 + ✕ 警示」

### 9.5 Stage 5 動畫：水平 pin + 雷達圖 → grid 並列 + stagger fadeUp

- **原設計**（§2 表格）：scroll 推進時三張卡片水平 horizontal pin 推移、每張高亮時其雷達圖數值補間
- **實作**：grid-cols-3（mobile grid-cols-1）三張卡片並列，依 progress 區間 stagger fadeUp 進場
- **原因**：
  - 原 `motion.div w-[300%]` 配 flex `items-center` 的 layout 在實機顯示卡片置中錯位，且 `transform: -66.66%` 推完後三張卡片全飛到 viewport 外左邊
  - snap-mandatory 下水平推移使用者看不到中間態，並列展示三種材質反而更直觀
  - 雷達圖未實作（spec 提及但實作版選擇用色彩標籤強調差異）

### 9.6 motion `pathLength` 對 polyline / 帶 strokeDasharray 的 path 視覺 bug

- **原設計**：Stage 2 折線、Stage 3 軌跡用 motion `pathLength` 0→1 動畫畫出
- **實作**：改用 motion opacity fade-in
- **原因**：motion 12 處理 `pathLength` 動畫時把 `stroke-dasharray` 設為 `"1px, 1px"`，導致 stroke 整段變成不可見的微小虛線；改 opacity fade-in 後折線/軌跡清楚顯示，stage 3 也保留原本的 `strokeDasharray="6 6"` 虛線視覺

### 9.7 ScrollTimelineProvider 改用 `useSyncExternalStore`

- **原設計**：`useState` lazy initializer 同步呼叫 `supportsScrollTimeline()`
- **實作**：`useSyncExternalStore`（`getServerSnapshot` 永遠 false、`getClientSnapshot` 為實際偵測）
- **原因**：lazy initializer 在 client first render 立即讀真實值，與 server 端 false 結果不一致，造成 hydration mismatch（stage 元件 className 與 Counter 文字 server/client 不同）。useSyncExternalStore 自動處理 hydration 階段使用 server snapshot

### 9.8 Stage 5 / Stage 1 / Stage 4 mobile 視覺修正

- Stage 5 mobile 卡片總高超出 100vh 被截斷 → `max-md:h-[120px]` 縮小
- Stage 1 計數器 row 在 mobile 撞到 Skip 按鈕 → `max-md:flex-col` 折兩行、`→` 旋轉 90° 變 `↓`
- Stage 4 腳印太小看不到 → 放大 `rx=8/ry=14`，與球和 ✕ 警示重新對齊在 SVG 中央

### 9.9 後續補 spec 缺項

- Stage 2 右側 14 個小人圖示（每個 = 1 萬人）依序 fade in
- Stage 6 球員 SVG 收拍敬禮（手臂以肩膀為原點旋轉 60°→30°→-30°）

### 9.10 Code review 後修補（reviewer Critical + Important）

- **Reduced-motion 內容消失修復（C1/C2/C3）**：6 個 stage 的 `useMotionValue(0)` fallback 改為 `useMotionValue(1)`，reduced-motion 使用者直接看到動畫終點狀態（counter=81、CTA opacity=1、紅閃 0.55 等）而非空白起點。E2E 對應更新 STAGE_ARIAS Stage 4 label 與每 stage 內 inner content 斷言
- **`useReducedMotion` 改 `useSyncExternalStore`（I1）**：與 `ScrollTimelineProvider` 對稱，避免 lazy initializer 在 client first render 立即讀真實值造成的 hydration mismatch
- **Dead code 清理（I2）**：刪除 `lib/scrollTimeline.ts`、`hooks/useScrollLinkedProgress.ts`、`@keyframes stage-fade/stage-pin`、四個對應 `@utility`，與 `ScrollTimelineProvider` 內 `supportsScrollTimeline` 偵測邏輯與 `useScrollTimelineSupport` export。Provider 簡化為僅提供 `containerRef` context，新增 `useTourScrollContainer()` 給 `TourProgressRail` 使用
- **`TourProgressRail` observer root 對齊 main scroll container（I3）**：透過 `useTourScrollContainer()` 取得 ref，與 `useStageProgress` 一致，避免 layout 改動時偵測失準。並合併為單一 observer + 多 target 取代原 6 個獨立 observer
- **`HeroTourCta` 改用 `<Link transitionTypes>`（I4）**：採 Next.js 16 推薦的 view transition 入口，享受 prefetch 與 no-JS fallback；`ClosingStage`「回到完整指南」與 `TourSkipButton` 維持 imperative `router.push`（離開頁面、prefetch 收益低）
- **Person component prop 命名（M3）**：`index` 改名 `order` 並移除重複的位置參數
