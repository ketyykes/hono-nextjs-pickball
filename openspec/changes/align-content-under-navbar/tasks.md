## 1. globals.css 引入 layout 變數（樣式例外層）

- [x] 1.1 於 `app/globals.css` 的 `:root` 區塊新增 `--site-nav-h: 3.5rem;` 與 `--toc-bar-h: 3.5rem;`（緊接既有 `--radius` 後）
- [x] 1.2 驗收：`grep -n "--site-nav-h\|--toc-bar-h" app/globals.css` 各出現一次

## 2. SiteNavbar 顏色和諧化（樣式例外層）

- [x] 2.1 將 `components/layout/SiteNavbar.tsx` 透明態 class 從 `border-white/10 bg-slate-900/20 backdrop-blur-sm` 調整為 `border-white/5 bg-slate-900/20 backdrop-blur-sm`（border 階度降低）
- [x] 2.2 將 solid 態 class 從 `border-border bg-background/90 shadow-sm backdrop-blur` 調整為 `border-border bg-background/85 shadow-sm backdrop-blur-md`
- [ ] 2.3 驗收：`pnpm dev` 開啟 `/`、`/tour`、`/scoreboard`、`/quiz`，肉眼確認透明態的 border 不再像獨立切割線；solid 態白底較不刺眼

## 3. TocBar 顏色和諧化（樣式例外層）

- [x] 3.1 將 `components/guide/TocBar.tsx` 透明態類別 `border-white/10 bg-slate-900/20 backdrop-blur-sm` 調整為「無 border」加深背景：`bg-slate-900/30 backdrop-blur-sm`（移除 `border-b` 由背景階序自然分層）
- [x] 3.2 將 solid 態 `border-border bg-background/90 shadow-md backdrop-blur` 中的 `shadow-md` 改為 `shadow-sm`（避免與 SiteNavbar shadow 疊加過重）
- [x] 3.3 對應檢視 `nav` 外層 className——若還有頂部 border 行為，一併移除/調整
- [ ] 3.4 驗收：`pnpm dev`，在首頁透明態下，SiteNavbar 與 TocBar 視覺上像兩階自然加深的色塊；捲離 hero 後也不會看到雙 shadow

## 4. Hero nav 偏移層（入口/元件例外層）

- [x] 4.1 改寫 `components/guide/Hero.tsx` JSX：在背景光暈與 scroll indicator 之間插入一層 `<div className="relative flex min-h-screen flex-col items-center justify-center pt-[calc(var(--site-nav-h)+var(--toc-bar-h))]">`
- [x] 4.2 將既有「浮球」與「主內容 motion.div」搬入此偏移層內；浮球的 `top-[15%]`、`right-[12%]`、`max-md:top-[10%]`、`max-md:right-[8%]` 維持不變（現在相對偏移層而非 section）
- [x] 4.3 確認 `min-h-screen` 從 section 移到偏移層（section 改為僅 `relative overflow-hidden bg-slate-900`），或保留 section `min-h-screen` 並把偏移層改 `flex-1 flex flex-col items-center justify-center pt-[...]`——二擇一，視排版實際結果挑乾淨者
- [x] 4.4 ScrollIndicator (`absolute bottom-8 left-1/2`) 維持在 section 層級，不搬入偏移層
- [ ] 4.5 驗收：`pnpm dev` 開啟 `/`，把瀏覽器拉到 600px / 800px / 1080px 三種高度，浮球皆位於 TocBar 之下、主標題置中

## 5. TourShell main 高度與位置（入口/元件例外層）

- [ ] 5.1 將 `components/tour/TourShell.tsx` `<main>` 的 className 從 `relative h-screen snap-y snap-mandatory overflow-y-scroll bg-slate-900 text-white` 改為 `relative h-[calc(100vh-var(--site-nav-h))] mt-[var(--site-nav-h)] snap-y snap-mandatory overflow-y-scroll bg-slate-900 text-white`
- [ ] 5.2 視需要將 `components/tour/TourStage.tsx` `<section>` 從 `h-screen` 改為 `h-full`（讓 stage = main 可視高度，避免 snap 點偏移）。**先評估**：若 TourStage 改 h-full 後 stage 高度仍正確（因 main 已縮短），則改；若改後造成其他 stage 元件（CourtSizeStage 等）內以 `h-full` 嵌套出問題，則保留 `h-screen` 並接受第一段比 main 高 56px 的微差
- [ ] 5.3 確認 `TourSkipButton`、`TourProgressRail` 兩個 fixed 元素位置不受 main 縮短影響（兩者都用 `fixed` 對 viewport 定位，不掛在 main 內）
- [ ] 5.4 驗收：`pnpm dev` 開啟 `/tour`，肉眼確認 stage 1 標題未被 SiteNavbar 遮、捲動 6 段 snap 行為正常、Skip 按鈕仍在右上、左側 ProgressRail 仍正常切換

## 6. E2E smoke 驗收（E2E 例外層）

- [ ] 6.1 執行 `pnpm test:e2e` 跑既有所有 E2E（5 個 browser project），確認沒有因 DOM 增層或樣式調整造成既有 selector 失效
- [ ] 6.2 若有測試失敗，逐一排查：是否為 `getBoundingClientRect` y 座標斷言？是否為依賴 main `h-screen` 假設？決定要更新測試 baseline 還是修實作

## 7. 視覺最終驗收

- [ ] 7.1 在 `pnpm dev` 開啟 `/` 並依序測試三種視窗高度（600 / 800 / 1080）——浮球與主標題視覺一致
- [ ] 7.2 在 `/tour` 同樣測試三種高度——stage 標題不被 navbar 遮、snap 體驗順暢
- [ ] 7.3 在 `/scoreboard`、`/quiz` 確認 solid navbar 樣式調整後沒有破壞既有頁面（顏色和諧、可讀性 OK）
- [ ] 7.4 與使用者確認視覺成果，必要時調整 D4 配色（`bg-slate-900/30` → `/35` 或微調 alpha）
