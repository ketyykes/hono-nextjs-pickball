## 1. 前置設置（例外層 / 入口配置）

- [x] 1.1 將 `pickleball-guide.html` 加進 `.gitignore`；驗收：`grep pickleball-guide.html .gitignore` 有回傳；`ls pickleball-guide.html` 確認檔案仍存在
- [x] 1.2 修改 `index.html`：`lang="zh-Hant"`、`<title>` 改為「匹克球新手完全入門：規則與球拍選購一次搞懂」、加入 Google Fonts preconnect 與 Noto Sans TC + Bebas Neue + Outfit 三家族 link；驗收：`pnpm dev` 開頁面 view-source 確認三個 family 名稱都在 link href
- [x] 1.3 透過 `pnpm dlx shadcn@latest add table badge separator` 加入三個 shadcn 元件；驗收：`ls src/components/ui/{table,badge,separator}.tsx` 三檔皆存在
- [x] 1.4 在 `src/index.css` 加入四組 keyframes（`floatBall`、`bounce`、`fadeUp`，既有 `fadeIn` 沿用）與對應 `animate-*` utility class；確認 `@theme inline` 內未新增任何匹克球專用 `--color-*` 變數；驗收：`pnpm dev` 開頁面確認動畫名稱可用、`grep "color-pickle\|color-court\|color-accent-coral\|color-accent-yellow" src/index.css` 應無輸出

## 2. 行為邏輯 hooks（smoke 模式：紅燈 → green → refactor）

- [x] 2.1 `useScrollShadow`──新增測試 `src/hooks/useScrollShadow.test.ts`，it「應在 scrollY 超過 threshold 時回傳 true」；執行 `pnpm test -- --run src/hooks/useScrollShadow.test.ts` 看到紅燈
- [x] 2.2 `useScrollShadow`──最小實作 `src/hooks/useScrollShadow.ts`（useEffect 註冊 scroll listener、回傳 boolean），執行同上指令至 green
- [x] 2.3 `useScrollShadow`──refactor 檢視；若無壞味道則註記 skipped，若有則重構並保持測試通過

- [x] 2.4 `useFadeInOnView`──先在 `src/test/helpers/intersectionObserver.ts` 建立共用 stub（`vi.stubGlobal('IntersectionObserver', ...)` + 手動觸發 callback 的 helper）；驗收：檔案存在且匯出 helper
- [x] 2.5 `useFadeInOnView`──新增測試 `src/hooks/useFadeInOnView.test.ts`，it「應在元素進入視窗時將 isVisible 設為 true」（套用 2.4 helper）；執行 `pnpm test -- --run src/hooks/useFadeInOnView.test.ts` 看到紅燈
- [x] 2.6 `useFadeInOnView`──最小實作 `src/hooks/useFadeInOnView.ts`（useRef + useState + IntersectionObserver），執行同上指令至 green
- [x] 2.7 `useFadeInOnView`──refactor 檢視；無壞味道則註記 skipped

- [x] 2.8 `useScrollSpy`──新增測試 `src/hooks/useScrollSpy.test.ts`，it「應回傳目前可視 section 的 id」（套用 2.4 helper）；執行 `pnpm test -- --run src/hooks/useScrollSpy.test.ts` 看到紅燈
- [x] 2.9 `useScrollSpy`──最小實作 `src/hooks/useScrollSpy.ts`（接收 id 陣列、IntersectionObserver 觀察各 section、回傳 active id），執行同上指令至 green
- [x] 2.10 `useScrollSpy`──refactor 檢視；無壞味道則註記 skipped

## 3. 資料層（例外層 / 純常數）

- [x] 3.1 `src/data/guide/tocItems.ts`：匯出 10 項 TOC 連結常數（id + label）；驗收：`pnpm build` 通過
- [x] 3.2 `src/data/guide/courtComparison.ts`：匯出 4 列「比較項目 / 匹克球 / 網球 / 羽球」資料；驗收：同上
- [x] 3.3 `src/data/guide/paddleMaterials.ts`：匯出 3 列拍面材質比較資料；驗收：同上
- [x] 3.4 `src/data/guide/paddleWeights.ts`：匯出 3 列重量分級資料；驗收：同上
- [x] 3.5 `src/data/guide/brands.ts`：匯出 6 個品牌卡資料（name / origin / desc / price）；驗收：同上
- [x] 3.6 `src/data/guide/twMarketPrices.ts`：匯出 6 列台灣市場價格帶資料；驗收：同上
- [x] 3.7 `src/data/guide/kitchenMyths.ts`：匯出 4 組 myth/fact 對照資料；驗收：同上

## 4. 共用展示元件（例外層 / shared）

- [x] 4.1 `src/components/guide/shared/TipCard.tsx`：以 shadcn Card 為底，支援 `variant: 'default' | 'warn'` 切換左邊框色（lime-400 / orange-500），含 label + 內容 children；驗收：手動 dev server 比對原型 `.tip-card`
- [x] 4.2 `src/components/guide/shared/HighlightBox.tsx`：以 shadcn Card 為底，深色漸層（`bg-gradient-to-br from-slate-900 to-slate-800`）、lime-400 標題；驗收：dev server 比對 `.highlight-box`
- [x] 4.3 `src/components/guide/shared/ComparisonTable.tsx`：以 shadcn Table 為底，接收 `columns`、`rows` props，支援 cell 內含 Badge（如「推薦」）；驗收：dev server 比對三張表外觀
- [x] 4.4 `src/components/guide/shared/MythRow.tsx`：兩格佈局，左為 myth（背景偏 orange-50/邊框 orange-500）、右為 fact（背景偏 emerald-50/邊框 emerald-700），內含 Badge label；驗收：dev server 比對 `.myth-row`
- [x] 4.5 `src/components/guide/shared/BrandCard.tsx`：以 shadcn Card 為底，含 brand-name / brand-origin / brand-desc / 價格徽章，hover 時 `-translate-y-1` 與加深 shadow；驗收：dev server 比對 `.brand-card`

## 5. Section 元件（例外層 / 樣式翻譯）

- [x] 5.1 `src/components/guide/Hero.tsx`：背景 slate-900、含浮球（lime-400 + `animate-float-ball`）、Hero badge、主標題（內含 lime-400 highlight）、subtitle、三項統計（`font-['Bebas_Neue']`）、scroll indicator（`animate-bounce`）；驗收：dev server 比對 `.hero`
- [x] 5.2 `src/components/guide/TocBar.tsx`：sticky `top-0`、`backdrop-blur`、橫向 scroll、套用 `useScrollShadow` 切換陰影、套用 `useScrollSpy` 切換 active link；驗收：dev server 捲動驗證陰影與 active 高亮
- [x] 5.3 `src/components/guide/PartDivider.tsx`：接收 `num`、`title` props，大數字用 `font-['Bebas_Neue']` + `text-border`，標題 slate-900，下方 lime-400 短橫；驗收：dev server 比對「01 / 02」分隔
- [x] 5.4 `src/components/guide/CourtDiagram.tsx`：將原型 inline SVG 場地俯視圖搬入；驗收：dev server 比對 SVG 外觀
- [x] 5.5 `src/components/guide/CourtSection.tsx`：組合 SectionHeader + 段落 + `CourtDiagram` + `ComparisonTable`（資料來自 `courtComparison`）；驗收：dev server 比對 `#court`
- [x] 5.6 `src/components/guide/ServeSection.tsx`：段落 + `TipCard`（落地發球友善選項）+ 進階段落；驗收：dev server 比對 `#serve`
- [x] 5.7 `src/components/guide/ScoringSection.tsx`：段落 + `HighlightBox`（比分唱報方式）+ 段落 + `TipCard`（2025 拉力計分）；驗收：dev server 比對 `#scoring`
- [x] 5.8 `src/components/guide/FoulsSection.tsx`：段落 + `TipCard variant="warn"`（完整犯規清單）+ 結語；驗收：dev server 比對 `#fouls`
- [x] 5.9 `src/components/guide/KitchenSection.tsx`：段落 + 4 組 `MythRow`（資料來自 `kitchenMyths`）+ 結語；驗收：dev server 比對 `#kitchen`
- [x] 5.10 `src/components/guide/MaterialsSection.tsx`：`ComparisonTable`（`paddleMaterials`）+ 段落；驗收：dev server 比對 `#materials`
- [x] 5.11 `src/components/guide/SpecsSection.tsx`：`ComparisonTable`（`paddleWeights`）+ 兩段（握把 / 拍面形狀）；驗收：dev server 比對 `#specs`
- [x] 5.12 `src/components/guide/BrandsSection.tsx`：grid 排列 6 個 `BrandCard`（資料來自 `brands`）；驗收：dev server 比對 `#brands`
- [x] 5.13 `src/components/guide/TwMarketSection.tsx`：段落 + `ComparisonTable`（`twMarketPrices`）+ `TipCard`（省錢小撇步）；驗收：dev server 比對 `#tw-market`
- [x] 5.14 `src/components/guide/StarterSection.tsx`：段落 + `TipCard variant="warn"`（選購要點）；驗收：dev server 比對 `#starter`
- [x] 5.15 `src/components/guide/Conclusion.tsx`：深色漸層底（`bg-gradient-to-br from-slate-900 to-slate-950`）、結語段落、3 張 conclusion card（emoji + title + text）；驗收：dev server 比對 `.conclusion`

## 6. 整頁組合（例外層 / layout）

- [x] 6.1 改寫 `src/pages/HomePage.tsx`：移除既有 starter Card / Button import 與「React + Express Template」內容；改 import 並依序組合 `Hero / TocBar / PartDivider(01) / 5 個規則 section / PartDivider(02) / 5 個選購 section / Conclusion`；section 之間用 `Separator` 分隔；驗收：`pnpm dev` 全頁瀏覽，與原型 side-by-side 比對所有 11 個 section
- [x] 6.2 在頁面內掛上 fade-in 行為：在每個 section 容器（或 SectionHeader）使用 `useFadeInOnView` 並依結果切換 `opacity-0 translate-y-6` ↔ `opacity-100 translate-y-0`；驗收：dev server 捲動觀察淡入動作

## 7. 驗收與收尾

- [x] 7.1 執行 `pnpm test --run`；驗收：3 支 hook 測試全綠
- [x] 7.2 執行 `pnpm lint`；驗收：無錯誤
- [x] 7.3 執行 `pnpm build`；驗收：tsc 與 vite build 皆成功
- [x] 7.4 `pnpm dev` 開頁面，與原型 `pickleball-guide.html` side-by-side 比對：Hero / TOC（陰影 + active）/ 11 個 section（含表格、品牌卡、myth/fact、tip、highlight）/ Conclusion / 動畫（floatBall、bounce、fadeUp、scroll fade-in）；任何明顯落差記錄並修補
- [x] 7.5 確認 `git status` 中 `pickleball-guide.html` 不在 untracked 清單（已被 `.gitignore` 排除）
