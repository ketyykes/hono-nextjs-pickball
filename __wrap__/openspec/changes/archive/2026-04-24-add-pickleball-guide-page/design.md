## Context

專案根目錄存有原型檔 `pickleball-guide.html`（1195 行單檔，含 700 行 CSS、3 段 vanilla JS）。它是匹克球新手指南的視覺與互動設計藍本，使用了：

- 自訂 CSS 變數（pickle-green、court-blue、accent-coral 等 10 條品牌色）
- 三套 Google Fonts：Noto Sans TC（內文）、Bebas Neue（大數字）、Outfit（英文 label）
- IntersectionObserver × 2（fade-in、active TOC）+ scroll listener × 1（sticky shadow）
- 4 組 keyframes 動畫（floatBall、bounce、fadeUp、fadeIn）
- inline SVG 場地俯視圖

目前 React 專案使用 Vite + React 19 + Tailwind v4 + shadcn/ui（new-york style、slate base、lucide icons），HomePage 仍是 starter 樣板。`openspec/config.yaml` 規定 src/** 行為邏輯模組要走 TDD，例外層（樣式、型別、入口、E2E）只需指定驗收方式。

## Goals / Non-Goals

**Goals:**

- 把原型內容完整搬上 React，分成元件 + 資料 + hooks 三層
- 全部使用 Tailwind class，不新增任何「匹克球專用」自訂色票變數
- 色票對應到 Tailwind palette 或既有 shadcn token
- 動畫與互動體驗保持與原型一致
- 遵守 TDD 規範但採「樣式翻譯為主」策略：行為層 hooks 補 happy-path smoke 即可
- 盡量套用 shadcn 元件作為基底（Card、Table、Badge、Separator）
- 未來新增其他「主題頁」時，`components/<topic>/` 模式可直接複用

**Non-Goals:**

- 不做 dark mode（原型沒有；shadcn token 雖支援，但本案不主動實作）
- 不擴充 `badgeVariants`（用 className 直接套色，避免動 shadcn 原生檔）
- 不裝 ScrollArea（TOC 純 div + Tailwind 即可）
- 不做 i18n 框架（內容固定為繁體中文）
- 不寫 E2E（手動驗收 + hooks smoke 已足夠）
- 不追求像素級還原；色彩可接受小幅度差異（如 lime-400 vs #BFFF00）

## Decisions

### Decision 1：CSS 策略全 Tailwind，色票對應原生 palette

**選擇**：全 Tailwind class，色票 100% 對應到 Tailwind palette + shadcn token，不在 `@theme inline` 加任何匹克球專用色變數。

**對應表**：

| 原型用途 | 原型色 | 對應 |
|---|---|---|
| 主品牌綠 | `#BFFF00` pickle-green | `lime-400` |
| 深底背景 | `#1A3A5C` court-blue | `slate-900` |
| 球場面 | `#2E7D6E` court-surface | `emerald-700` |
| 強調珊瑚 | `#FF6B4A` accent-coral | `orange-500` |
| 強調黃 | `#FFD23F` accent-yellow | `amber-400` |
| 頁面底 | `#FAF8F5` warm-white | `bg-background` |
| 主文字 | `#111111` off-black | `text-foreground` |
| 次要灰 | `#6B7280` mid-gray | `text-muted-foreground` |
| 邊線 | `#E8E6E2` light-gray | `border-border` |
| section 底 | `#F3F1ED` section-bg | `bg-muted` |

**為何不選 D（混合 / 加品牌色變數）**：使用者明確要求簡化，不維護一堆品牌色。trade-off 是視覺不會 100% 還原，但接受。

**為何不選 A（原樣 import CSS）**：未來想跟 shadcn 風格一致、想開 dark mode 都會卡，且兩套 token 並存維護成本高。

### Decision 2：字型保留三套，從 Google Fonts CDN 載入

**選擇**：保留 Noto Sans TC + Bebas Neue + Outfit，於 `index.html` 加 preconnect + link。元件內透過 arbitrary value `font-['Bebas_Neue']` / `font-['Outfit']` 套用，內文 fallback 走系統 sans。

**為何不簡化**：字型是設計識別主軸，色票已大幅簡化，字型不再砍。

**為何不放 `index.css` `@import`**：preconnect + 並行載入比 CSS @import（會 block render）快，原型也是這樣處理。

### Decision 3：shadcn 元件覆寫策略

| 原型區塊 | shadcn 對應 | 策略 |
|---|---|---|
| BrandCard / TipCard / HighlightBox / ConclusionCard / MythCell | Card | 用 shadcn Card 當底，className 覆寫個性樣式（左邊框色、漸層背景、hover lift） |
| 三張比較表 | Table | 直接用 Table + TableHeader / TableBody / TableRow / TableHead / TableCell |
| recommend-badge / hero-badge / section-tag / tip-label / cell-label | Badge | className 直接套色（`bg-lime-400`、`bg-orange-500/10` 等），**不擴充 badgeVariants** |
| .sep | Separator | 直接用，className 控間距 |
| TocBar | （不用 shadcn） | 純 div + `overflow-x-auto` + Tailwind sticky/blur |

**為何不擴充 badgeVariants**：CLAUDE.md 規定 `src/components/ui/` shadcn 原生檔不自行修改；雖 cva variants 屬灰色地帶，但本案 badge 用法簡單，className 覆寫不會難看，能避免動到原生檔就避免。

**為何不用 ScrollArea**：TocBar 只需 `overflow-x: auto + scrollbar-hide`，加 Radix wrapper 沒必要。

### Decision 4：拆檔結構（components / data / hooks 三層）

```
src/
├─ pages/HomePage.tsx                # 純 layout 組合，import 各 section
├─ components/guide/
│   ├─ Hero.tsx
│   ├─ TocBar.tsx
│   ├─ PartDivider.tsx               # 「01 / 02」分隔
│   ├─ CourtSection.tsx
│   ├─ CourtDiagram.tsx              # 場地俯視 SVG 獨立
│   ├─ ServeSection.tsx
│   ├─ ScoringSection.tsx
│   ├─ FoulsSection.tsx
│   ├─ KitchenSection.tsx
│   ├─ MaterialsSection.tsx
│   ├─ SpecsSection.tsx
│   ├─ BrandsSection.tsx
│   ├─ TwMarketSection.tsx
│   ├─ StarterSection.tsx
│   ├─ Conclusion.tsx
│   └─ shared/
│       ├─ TipCard.tsx
│       ├─ HighlightBox.tsx
│       ├─ ComparisonTable.tsx
│       ├─ MythRow.tsx
│       └─ BrandCard.tsx
├─ data/guide/
│   ├─ tocItems.ts
│   ├─ courtComparison.ts
│   ├─ paddleMaterials.ts
│   ├─ paddleWeights.ts
│   ├─ brands.ts
│   ├─ twMarketPrices.ts
│   └─ kitchenMyths.ts
└─ hooks/
    ├─ useScrollShadow.ts            + useScrollShadow.test.ts
    ├─ useScrollSpy.ts               + useScrollSpy.test.ts
    └─ useFadeInOnView.ts            + useFadeInOnView.test.ts
```

**為何拆這麼細**：對應原型 11 個 section，每個 section 一檔讓未來改某段不影響其他段；資料抽出讓內容修改不需改 JSX；hooks 抽出讓行為邏輯可獨立測試。

### Decision 5：TDD 嚴謹度（依 openspec/config.yaml）

| 模組類別 | 範例 | 測試規範 |
|---|---|---|
| **行為邏輯**（必 TDD，本案放寬為 smoke） | hooks/useScrollShadow / useScrollSpy / useFadeInOnView | 每支 hook 一個 happy-path test，不追求覆蓋率，不寫 edge case |
| **例外層**（不強制 TDD） | components/guide/* / data/guide/* / src/index.css / pages/HomePage.tsx / index.html / SVG | 手動 `pnpm dev` 與原型 side-by-side 比對；可選擇補 `@testing-library/react` smoke render |

**為何放寬**：使用者在 explore 階段明確選「樣式翻譯為主，hooks 補 smoke」。原型已驗證設計與行為正確，本次主要是「翻譯」工作，不是新功能設計，過度測試成本高且邊際效益低。

### Decision 6：IntersectionObserver mock 策略

`happy-dom` 沒有原生 IntersectionObserver，hooks smoke test 需在每個測試檔以 `vi.stubGlobal('IntersectionObserver', class { observe; unobserve; disconnect; })` 建立 stub，並透過手動呼叫 callback 模擬 intersection。三支 hooks 中有兩支用到（`useScrollSpy`、`useFadeInOnView`），策略統一。

### Decision 7：原型保留但不上版控

`pickleball-guide.html` 在改寫期間是視覺對照基準，刪掉會增加 review 成本。改加進 `.gitignore`，個人保留即可。

## Risks / Trade-offs

- **色彩失真** → 接受。使用者明確選擇簡化路線。完成後若視覺差距太大，可以單點調 className（例如 `lime-400` 換 `lime-300`）。
- **shadcn Card 套用後 className 蓋很多 base 樣式** → 接受。Card base 樣式（rounded、border、shadow）大致符合各種卡片，需要覆蓋的主要是色彩與左邊框。若實作時發現某張卡覆寫量太大，可改為「直接 div + Tailwind」（單點放棄 shadcn）。
- **arbitrary value 字型 `font-['Bebas_Neue']`** → 可讀性中等。為避免散落，可在第一個用到的 section 旁註解一次說明。
- **IntersectionObserver mock** → happy-dom 限制。三支 hooks 共用同一個 stub helper（可放 `src/test/helpers/`），避免每個檔重複定義。
- **HomePage 變成「指南頁」** → 之後若要做「真正的首頁」，需重新規劃。本次接受此結果（使用者已確認）。
- **載 3 個 Google Fonts** → 首屏 LCP 會略慢。原型即如此，可接受；之後若要優化可改 self-host 或縮小 weight subset。
- **元件拆 11 個 section + 5 個 shared，總共 ~20 個檔** → 檔案數多，但每檔聚焦單一職責，整體易讀；對 bundle size 無實質影響（Vite 會 tree-shake / chunking）。
