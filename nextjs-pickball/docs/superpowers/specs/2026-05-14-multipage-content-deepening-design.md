# 多頁式內容深化改造（Multi-page Content Deepening）— 設計文件

- **日期**：2026-05-14
- **作者**：danny + Claude（brainstorming session）
- **狀態**：草案 → 待使用者最終審閱
- **OpenSpec 對應**：本設計將拆為 3 個獨立 change（Phase A / B / C）

---

## 1. 背景與動機

目前 `nextjs-pickball` 是單頁式指南（`app/page.tsx` 串接 11 個 Section），規則與球拍內容並列於同一頁，深化新內容（例如互動式場地、進階戰術、規則動畫）已沒有合理空間，且台灣球拍市場價格資料易過時、亦有商業敏感度疑慮。

本次改造目標：

- 將指南改造為**多頁式、按學習階段分主題**的網站
- 球拍 / 市場價格全面改為**低 / 中 / 高分級 Badge**，不顯示實際價格
- 既有 `/quiz`、`/scoreboard`、`/tour` 三個互動功能保留 URL，並集中入口
- 補上「互動式場地圖、規則動畫、規則搜尋、進階戰術」四項內容深化元素
- 對任何匹克球規則 / 戰術 / 器材**不確定的內容，實作前先 WebSearch 驗證**

## 2. 目標 / 非目標

### 目標

- 五大主題分頁：`/learn`、`/rules`、`/equipment`、`/skills`、`/play`
- Landing (`/`) 改為多頁式入口，保留現有 Hero 視覺感，下方加三張主題卡 CTA
- 價格資料 schema 抽出 `priceTier: 'low' | 'mid' | 'high'`，UI 一律顯示 Badge
- 既有 `/quiz`、`/scoreboard`、`/tour` URL 不動，`/play` 為集中入口 hub
- 既有 `#court`、`#serve`…等舊 hash 深連結用 client-side redirect 兼容
- 分 3 個 OpenSpec change 釋出（Phase A / B / C），各自可獨立上線與 rollback

### 非目標

- 不重寫既有 Section 文案；以「重新組合 + 摘錄 + 補章節」為主
- 不引入後端 / DB（資料仍存在 `data/guide/*.ts` 純 TS 模組）
- 不做使用者帳號 / 登入系統
- 不在本次納入「找球場」、「教練 / 賽事媒合」等跨子系統功能
- 不引入 i18n（仍只支援 zh-Hant）

## 3. 資訊架構

### 路由全貌

```
/                  Landing（保留 Hero 動畫感 + 主題入口卡 + 結語）
/learn             新手必讀（場地、計分、發球、廚房、新手 FAQ）
/rules             規則速查（完整規則 + 犯規清單 + Phase B 加搜尋）
/equipment         球拍選購（材質、規格、品牌、市場分級、新手推薦）
/skills            進階戰術（Phase C 才上線；之前回應 404 或「即將推出」）
/play              互動工具 Hub（推薦學習路徑 + 三個工具入口卡）

/quiz              既有功能，URL 保留
/scoreboard        既有功能，URL 保留
/tour              既有功能，URL 保留
```

### 全站導覽

- 新增 `SiteNavbar`（取代既有 `TocBar` 在新分頁中的角色）
  - 桌機：sticky top，橫式 menu 列出五大主題
  - 行動：sticky top，漢堡選單抽屜
  - 現址項目高亮（依 `usePathname()`）
- 既有 `TocBar`（scrollSpy 錨點導覽）保留，但只在「長頁主題頁」（`/rules`、`/equipment`）內使用，作為頁內目錄
  - z-index / top offset 需與 `SiteNavbar` 共存，避免 sticky 互相疊壓
- Footer 補上五大主題的 sitemap 連結

### 11 個既有 Section 重新安置 mapping

| 既有 Section | 既有路由 | 新位置 | 處理方式 |
| --- | --- | --- | --- |
| `Hero` | `/` | `/` Landing | 文案調為多頁式導引；CTA 改為連結 `/learn`、`/equipment`、`/play` |
| `CourtSection` | `/#court` | `/learn`（精簡）+ `/rules`（完整 + Phase B 互動場地） | 基礎資訊放 `/learn`；條文細節 + Phase B 互動 SVG 場地放 `/rules` |
| `ServeSection` | `/#serve` | `/learn`（基礎）+ `/rules`（完整 + Phase B 發球軌跡動畫） | 同上分層 |
| `ScoringSection` | `/#scoring` | `/learn` | 一次說清楚，含 2026 USAP rulebook 補強 |
| `FoulsSection` | `/#fouls` | `/rules` | 規則速查與犯規清單合併 |
| `KitchenSection` | `/#kitchen` | `/learn`（簡介）+ `/rules`（迷思 + Phase B 違例動畫） | 同上分層 |
| `MaterialsSection` | `/#materials` | `/equipment` | 維持 |
| `SpecsSection` | `/#specs` | `/equipment` | 維持 |
| `BrandsSection` | `/#brands` | `/equipment` | 價格欄改為 `<Badge>` 低/中/高 |
| `TwMarketSection` | `/#tw-market` | `/equipment` | 改名「市場價格分級」；表格全面 Badge 化 |
| `StarterSection` | `/#starter` | `/equipment` | 推薦清單同樣 Badge 化 |
| `Conclusion` | `/`（底部） | `/`（Landing 底部） | 變成 Landing 結語 |

> **新章節**：`/learn` 新增「新手 FAQ」、`/skills` 整個是新章節（Phase C）。

## 4. 三階段釋出計畫

### Phase A — 架構重構 + 主題頁 + 價格分級（OpenSpec change 1）

- 路由拆出 `/learn`、`/rules`、`/equipment`、`/play`、`/skills`（最後一個只放佔位「即將推出」）
- `SiteNavbar` 元件、Landing 改造、Footer sitemap
- 11 個既有 Section 依照上表搬移；不重寫文案
- 價格分級資料模型實作（見 §5）
- Landing 與所有非 `/play` 主題頁可上線；`/skills` 顯示佔位卡
- `/play` Hub 顯示三張既有工具入口卡（`/quiz`、`/scoreboard`、`/tour`）
- 既有 `#court`、`#serve`、`#scoring`、`#fouls`、`#kitchen`、`#materials`、`#specs`、`#brands`、`#tw-market`、`#starter` hash 全部用 client-side redirect 兼容
- TocBar 改為「頁內目錄」用途，於 `/rules`、`/equipment` 重新接資料源

### Phase B — 互動深化（OpenSpec change 2）

- `/learn` 與 `/rules` 加上**互動式場地 SVG**（升級既有 `CourtDiagram`）：點選區域 → popover 顯示對應規則
- 規則動畫示範：發球軌跡、Kitchen 違例、雙打發球順序，以 CSS keyframes / SVG 動畫實作（避免外部影片依賴）
- `/rules` 加入**關鍵字搜尋**：條目化規則 JSON + client-side filter
- 與 Phase A 並行也可，但建議 Phase A 上線後再進

### Phase C — `/skills` 進階戰術內容（OpenSpec change 3）

- 五大進階戰術主題（依 WebSearch 驗證）：
  - **Dinking**（軟弧球控制節奏）
  - **Third Shot Drop**（第三球落擊）
  - **Stacking / Switching**（雙打疊位與輪轉）
  - **ATP（Around the Post）**（柱外擊球）
  - **雙打輪轉與發球順序**（依 2026 USAP rulebook 詳列）
- 每個主題以一個 `<Section>` 卡片呈現，含：定義、適用情境、執行步驟、常見錯誤、影片 / GIF 連結（若有）
- 實作前**必須**讀取 2026 USAP rulebook PDF 並交叉比對，所有規則句子在 PR 附上引用註腳

## 5. 價格分級資料模型（Phase A 核心）

### `PriceTier` 型別

```ts
// data/guide/types.ts （或現有 types 檔案）
export type PriceTier = 'low' | 'mid' | 'high';

export const PRICE_TIER_THRESHOLD_TWD = {
  lowMaxExclusive: 2000,   // < NT$2,000  → 'low'
  midMaxInclusive: 6000,   // NT$2,000 – NT$6,000  → 'mid'
  // > NT$6,000  → 'high'
} as const;

export const PRICE_TIER_LABEL: Record<PriceTier, string> = {
  low: '入門價位',
  mid: '中階價位',
  high: '高階價位',
} as const;
```

### `BrandCardData` 改造

```ts
// data/guide/brands.ts
export interface BrandCardData {
  name: string;
  origin: string;
  description: string;
  priceTier: PriceTier;            // 顯示用
  rawPriceRangeTwd?: [number, number]; // 內部維護用，UI 不顯示；範圍取下限判 tier
  lastVerified: `${number}-${number}-${number}`; // ISO 日期，給維護者
}
```

- 跨幣別資料（如 Selkirk US$45–333）需在維護時換算為新台幣下限上限再判 tier
- `priceTier` 的判定邏輯抽出 helper：`priceRangeToTier([min, max]): PriceTier`，依下限門檻判定

### `MarketPriceRow` 改造

```ts
// data/guide/twMarketPrices.ts
export interface MarketPriceRow {
  tier: PriceTier;                 // 取代既有 string tier 名稱
  category: string;                // 既有「木拍/最入門」「中階（碳纖維）」改放這
  example: string;
  recommended?: boolean;
}
```

- 既有的 `priceRange: string` 欄位移除
- `category` 仍可呈現「木拍 / 最入門」「中階（碳纖維）」這類細分類
- 表格欄位改為「等級 Badge | 類別 | 代表產品」

### UI 呈現

- 新增 `components/guide/shared/PriceTierBadge.tsx`，吃 `priceTier: PriceTier` props，套用 Tailwind 顏色：
  - `low` → muted（柔和灰）
  - `mid` → primary（品牌主色）
  - `high` → accent / gold（強調色）
- 取代既有 `BrandCard` 與 `TwMarketSection` 表格中的價格字串

### 維護指引

- 在 `docs/` 或 `data/guide/README.md` 補上：價格分級的判定門檻、`rawPriceRangeTwd` 範圍如何取（建議用「主要型號的中位售價區間」）、更新流程
- 內部仍有 `rawPriceRangeTwd` 與 `lastVerified`，方便未來檢視是否需重新判 tier

## 6. SiteNavbar 元件設計（Phase A）

- 位置：`components/site/SiteNavbar.tsx`（新建目錄 `components/site/`）
- props：無（內部使用 `usePathname()` 自動判定 active item）
- 結構：
  - 左：Logo / 站名（連 `/`）
  - 中（桌機）：五個主題 link：`/learn`、`/rules`、`/equipment`、`/skills`、`/play`
  - 右：（保留擴充位，例如未來放搜尋入口）
  - mobile：漢堡 → `Sheet`（shadcn/ui）抽屜
- `"use client"` 因需要 `usePathname()`
- 與既有 `TocBar` 的關係：
  - 在 Landing 不出 TocBar
  - 在 `/rules`、`/equipment` 出 SiteNavbar (top) + TocBar (top + navbar height)
  - 重新計算 `scroll-margin-top` 避免錨點被遮住

## 7. Landing 改造（Phase A）

- 保留 `Hero` 視覺（動畫感、字型、配色）
- Hero CTA 從「下捲到 TOC」改為三個按鈕：
  - 「我是新手 → /learn」
  - 「挑選球拍 → /equipment」
  - 「來玩玩 → /play」
- Hero 下方加 **三張主題入口卡**（新元件 `components/site/HomeTopicCard.tsx`）：規則 / 球拍 / 互動工具，各自有縮圖、簡介、CTA
- 既有 `Conclusion` 文字搬到 Landing 底部
- 移除 11 個 Section 的串接，page.tsx 內容大幅縮減

## 8. Hash Redirect 兼容（Phase A）

- 新建 `app/HashRedirector.tsx`（client component），於 Landing layout 中 mount
- `useEffect` 偵測 `window.location.hash`，若命中以下 map 即 `router.replace`：

```ts
const HASH_TO_PATH: Record<string, string> = {
  '#court':     '/rules#court',
  '#serve':     '/rules#serve',
  '#scoring':   '/learn#scoring',
  '#fouls':     '/rules#fouls',
  '#kitchen':   '/rules#kitchen',
  '#materials': '/equipment#materials',
  '#specs':     '/equipment#specs',
  '#brands':    '/equipment#brands',
  '#tw-market': '/equipment#tw-market',
  '#starter':   '/equipment#starter',
};
```

- 目的：讓外部既有深連結（社群分享、書籤）不要 404 或落到無效錨點
- 副作用：第一次進站會多一次 client redirect，UX 可接受

## 9. `/play` Hub 設計

- 顯示三張既有工具入口卡：
  - **測驗**：10 題隨機抽題，測試對規則熟悉度 → `/quiz`
  - **計分板**：雙打 / 單打計分，含 localStorage 持久化 → `/scoreboard`
  - **沉浸導覽**：scroll-driven 場地導覽 → `/tour`
- 上方加「推薦學習路徑」短說明（Phase A 用 placeholder 文字）
- 未來擴充位：跨工具的成績歷史、推薦下一站

## 10. 互動式場地圖（Phase B）

- 升級既有 `components/guide/CourtDiagram.tsx`
- 用 SVG `<g>` 將場地分成命名區域：`baseline`、`service-zone-left`、`service-zone-right`、`non-volley-zone`（廚房）、`centerline`、`net`
- 每區可 hover / click，觸發 shadcn/ui `Popover` 顯示對應規則摘要
- 鍵盤可用：`tabIndex`、aria-label
- 在 `/learn` 用基礎模式（簡單 popover）；在 `/rules` 用完整模式（popover 含完整條文引用）
- 與 `useReducedMotion` 整合：若使用者偏好減少動態，hover 動畫 fallback 為瞬切

## 11. 規則動畫示範（Phase B）

- 場景：發球軌跡（下手擊球、過網、落入對角發球區）、Kitchen 違例（球員凌空在 NVZ 擊球）、雙打發球順序
- 技術選型：純 CSS keyframes + SVG，避免引入 Lottie / 影片依賴（保持 bundle 小、無外部來源）
- 元件：`components/guide/animations/ServeArcAnimation.tsx`、`KitchenViolationAnimation.tsx`、`DoublesServeOrderAnimation.tsx`
- 統一 `playOnIntersect` 行為（IntersectionObserver hook）：滑入視窗才播放
- 與 `useReducedMotion` 整合：偏好減少動態時改顯示靜態說明圖

## 12. `/rules` 關鍵字搜尋（Phase B）

- 規則條目化：新建 `data/guide/ruleEntries.ts`

```ts
export interface RuleEntry {
  id: string;                   // e.g. 'serve.underhand'
  category: 'serve' | 'court' | 'scoring' | 'fouls' | 'kitchen';
  title: string;                // 「下手發球」
  body: string;                 // 完整中文條文
  keywords: readonly string[];  // 搜尋關鍵字：['下手','underhand','發球姿勢']
  source?: string;              // USAP rulebook section 引用
}
```

- 來源：從既有 Section 文案抽出，逐項條目化
- 搜尋元件 `components/site/RuleSearch.tsx`：input + 過濾結果列表（命中關鍵字或 body）
- 客端搜尋（資料量小，<200 條目，不需 fuzzy 庫；可用 `String.includes` + 簡單 normalize）
- 若未來資料量增長，可換 `fuse.js`（先不引入）

## 13. `/skills` 進階戰術內容（Phase C）

每個主題以 `<Section>` 卡片呈現，標準結構：

- **定義**：1-2 句官方／業界定義
- **適用情境**：什麼比分 / 站位 / 球路下使用
- **執行步驟**：3-5 點 bullet
- **常見錯誤**：2-3 點警示
- **延伸資料**：USAP rulebook section / 業界文章連結

主題清單（依 WebSearch 驗證）：

1. **Dinking**（軟弧球）
2. **Third Shot Drop**（第三球落擊）
3. **Stacking / Switching**（雙打疊位輪轉）
4. **ATP（Around the Post）**
5. **雙打輪轉與發球順序**（依 2026 USAP rulebook 詳列）

> 實作前必須先讀完 2026 USAP rulebook PDF，並在 PR 附上每個規則句子的章節引用。

## 14. 測試策略

| 階段 | Vitest（單元） | Playwright（E2E） |
| --- | --- | --- |
| Phase A | `priceRangeToTier` 邊界值、`SiteNavbar` active 高亮、`HashRedirector` map 命中 | 五主題頁皆可進入；舊 hash redirect 確實導到新頁；Hero CTA 點擊行為 |
| Phase B | `CourtZone` click handler、規則條目 filter 正確、動畫 prefers-reduced-motion fallback | 點 SVG 區塊 popover 顯示；搜尋輸入過濾即時 |
| Phase C | 戰術 section 內容資料完整性（每主題 5 欄位都非空） | `/skills` 五張卡渲染；錨點導覽運作 |

- 既有 `/quiz`、`/scoreboard`、`/tour` E2E **不可退化**——Phase A PR 必須全綠
- 既有 hooks（`useScrollSpy` 等）測試保持綠燈

## 15. 風險與取捨

| 風險 | 影響 | 緩解 |
| --- | --- | --- |
| 既有外部錨點連結失效 | SEO / 既有讀者體驗 | Phase A 加 hash redirect 兼容 |
| 多 sticky 互相疊壓 | UI 重疊 | SiteNavbar + TocBar 共存時統一 z-index/top offset，於 `/rules`、`/equipment` 測 sticky 行為 |
| 價格 tier 主觀性 | 編輯成本 / 一致性 | 抽 helper + 門檻常數 + `rawPriceRangeTwd` 內部保留，可驗證 |
| `/skills` 內容錯誤 | 規則 / 戰術錯誤誤導讀者 | 實作前必須 WebSearch + 讀 USAP 2026 rulebook，PR 附引用 |
| Phase A 一次搬 11 Section 範圍大 | PR 巨大、review 成本高 | 在 Phase A 內部再拆 commit：Step 1 路由骨架、Step 2 SiteNavbar、Step 3 mapping 搬移、Step 4 價格分級、Step 5 hash redirect |
| 既有 `/quiz`、`/scoreboard`、`/tour` 與新 `SiteNavbar` 樣式衝突 | UI 一致性 | Phase A 確保三個工具頁也套上 `SiteNavbar`，QA 全部走一輪 |

## 16. 開放問題（implementation 時再決）

- Landing 三張主題卡的視覺要走「插圖」還是「icon + 大字」？實作時與設計再對。
- 規則搜尋是否支援英文關鍵字（dink / kitchen / ATP）？傾向支援，但需在 `keywords` 欄位明確列出。
- 是否在 Footer 加版本資訊或「資料最後更新日期」？建議加（增強信任）。
- `priceTier` 的 Badge 顏色與既有 OKLCH semantic colors 如何對應？實作時需與設計確認。

## 17. WebSearch 引用來源

- [Pickleball Shots & Techniques Library — Pickleball.com](https://pickleball.com/docs/en/article/pickleball-shots-techniques-library-every-shot-you-need-to-know)
- [Pickleball ATP — Pickleball35](https://pickleball35.com/pickleball-atp/)
- [Advanced Pickleball Techniques — Olaben](https://olaben.com/blogs/olaben-blog/advanced-pickleball-techniques)
- [Pickleball Terminology — Pickleball Portal](https://www.pickleballportal.com/pickleball-terminology/)
- [Third Shot Drop — Selkirk](https://www.selkirk.com/blogs/pickleball-education/3-tips-for-consistent-pickleball-3rd-shot-drops)
- [2026 Official USA Pickleball Rulebook PDF](https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf) ← Phase C 必讀
- [7 New USAP Pickleball Rules for 2026](https://www.thedinkpickleball.com/7-new-usap-pickleball-rules-for-2026-you-need-to-know/)

## 18. 後續步驟

設計核可後：

1. 交棒 `writing-plans` skill 產生 Phase A 實作計畫（OpenSpec change 1）
2. Phase A 完成、合併、上線後，再 brainstorm + plan Phase B
3. Phase B 完成、上線後，再 brainstorm + plan Phase C
4. 每階段都各自走 OpenSpec spec-driven TDD：先寫 failing Vitest test → 最小實作 → refactor
