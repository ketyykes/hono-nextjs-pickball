## MODIFIED Requirements

### Requirement: 首頁顯示完整匹克球指南

系統 SHALL 在路由 `/` 直接渲染完整匹克球新手指南，包含 Hero、TOC、Part 01（規則 5 段）、Part 02（選購 5 段）、Conclusion 區塊，與原型 `pickleball-guide.html` 結構一致。TocBar SHALL 以 fixed overlay 方式於頁面載入即顯示於視窗頂端，而非 sticky（非捲動後才出現）。TocBar SHALL 使用 `top-14`，固定在 SiteNavbar（高度 h-14 = 56px）下方，不與 Navbar 重疊。TocBar 在透明態 SHALL 採用 `bg-slate-900/30 backdrop-blur-sm` 且不再渲染 `border-b`，與 SiteNavbar 的 `slate-900/20` 形成自然漸深階序，避免兩條 nav 視覺切割。

#### Scenario: 訪問首頁可看到 Hero badge 與主標題
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成
- **THEN** 畫面顯示「2025 完全入門指南」badge、主標題「匹克球新手完全入門」與三項統計數字（14萬+、¼、11）

#### Scenario: TocBar 於頁面載入即顯示並列出 10 個 section 連結
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成且 `window.scrollY === 0`
- **THEN** TocBar 即時可見於視窗頂端，列出 court / serve / scoring / fouls / kitchen / materials / specs / brands / tw-market / starter 共 10 個錨點連結

#### Scenario: TocBar 位置（有 SiteNavbar 時）

- **WHEN** 使用者瀏覽首頁（`/`）
- **THEN** TocBar 顯示在 viewport top + 56px 的位置，SiteNavbar 佔據最上方 56px

#### Scenario: TocBar 透明態無 border-b 切割

- **WHEN** 路由為 `/`，且 `window.scrollY === 0`
- **THEN** `TocBar` 不渲染 `border-b` 樣式，背景為 `bg-slate-900/30 backdrop-blur-sm`

#### Scenario: 每個 section 都有對應錨點 id
- **GIVEN** 頁面渲染完成
- **WHEN** DOM 解析完成
- **THEN** 存在 `#court`、`#serve`、`#scoring`、`#fouls`、`#kitchen`、`#materials`、`#specs`、`#brands`、`#tw-market`、`#starter` 共 10 個 id

## ADDED Requirements

### Requirement: Hero 浮球與主內容避開 fixed nav 合計高度

`nextjs-pickball/components/guide/Hero.tsx` 的浮球（`aria-hidden` 的右上 lime 圓球）與主內容（含 badge、主標題、副標、統計、CTA）SHALL 全部落在 `SiteNavbar (56px) + TocBar (56px)` = 112px 之下的可用視覺區。具體實作方式：浮球與主內容掛在 Hero 內一層 `pt-[calc(var(--site-nav-h)+var(--toc-bar-h))]` 的偏移層之內。**主內容**（motion.div）為 flow child、由偏移層的 `pt-` + `flex flex-col items-center justify-center` 自動推到 nav 之下置中。**浮球**為 absolute child、不受 padding 影響，其 `top` SHALL 明確含 nav offset：`top-[calc(var(--site-nav-h)+var(--toc-bar-h)+15%)]`、`max-md:top-[calc(var(--site-nav-h)+var(--toc-bar-h)+10%)]`，確保在矮視窗（≤ 700px viewport height）下不被 fixed nav 遮擋。

背景光暈 SHALL 仍鋪滿整個 section（含 nav 區），維持透明 navbar 之下的深色背景延伸感。Hero section 本身仍維持 `min-h-screen overflow-hidden bg-slate-900` 不變。

#### Scenario: globals.css 定義 --toc-bar-h

- **WHEN** 檢查 `nextjs-pickball/app/globals.css`
- **THEN** `:root` 區塊內存在 `--toc-bar-h: 3.5rem;` 一條 CSS variable

#### Scenario: Hero 浮球與主內容包在 nav 偏移層內

- **WHEN** 檢查 `nextjs-pickball/components/guide/Hero.tsx` 的 JSX
- **THEN** 浮球與 motion.div 主內容皆為「nav 偏移層」之子節點；該偏移層套用 `pt-[calc(var(--site-nav-h)+var(--toc-bar-h))]`

#### Scenario: 矮視窗下浮球不被 fixed nav 遮擋

- **GIVEN** 使用者開啟 `/`，viewport height 為 700px
- **WHEN** 頁面載入完成、`window.scrollY === 0`
- **THEN** 浮球元素 `getBoundingClientRect().top` 大於等於 112px（fixed nav 合計高度）

#### Scenario: 主標題仍位於視窗可視區內

- **GIVEN** 使用者開啟 `/`，viewport height 為 800px
- **WHEN** 頁面載入完成
- **THEN** 主標題 `<h1>匹克球新手完全入門</h1>` 完整位於視窗範圍內且未被遮擋
