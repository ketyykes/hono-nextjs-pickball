## Why

專案 root 目前有一份原型 `pickleball-guide.html`（1195 行單頁 HTML，匹克球新手指南），但 React 應用的首頁 (`HomePage.tsx`) 仍是初始 starter 樣板。我們需要把這份指南內容遷移到 React 版本，讓 `/` 直接顯示完整指南，並透過拆檔、抽資料、用 shadcn 元件，讓內容後續好維護、好擴充。

## What Changes

- 清空 `src/pages/HomePage.tsx` 既有 sample 內容，改組合「匹克球指南」整頁
- 新增 `src/components/guide/` 目錄，依原型 11 個 section 拆元件，並抽出 5 個共用 sub-components（TipCard、HighlightBox、ComparisonTable、MythRow、BrandCard）
- 新增 `src/data/guide/` 目錄，將原型中 6 組 list-driven 內容（品牌卡、3 張比較表、myth/fact 對照、TOC 項目）抽為純資料常數
- 新增 3 個 hook：`useScrollShadow`、`useScrollSpy`、`useFadeInOnView`，封裝原型的 sticky shadow / active TOC link / scroll-triggered fade-in 行為
- 新增 shadcn 元件：`table`、`badge`、`separator`（透過 `pnpm dlx shadcn@latest add`）
- 在 `src/index.css` 加入 4 組 `@keyframes`（floatBall、bounce、fadeUp、fadeIn）與對應 utility class
- `index.html`：`lang` 改 `zh-Hant`、`title` 改為指南標題、加 Google Fonts preconnect + link（Noto Sans TC + Bebas Neue + Outfit）
- `.gitignore` 加入 `pickleball-guide.html`（原型保留作對照，但不上版控）
- **不**新增任何匹克球專用色票變數，全部色票對應到 Tailwind palette 或既有 shadcn token

## Capabilities

### New Capabilities

- `pickleball-guide-page`: 首頁顯示完整匹克球新手指南（規則、選購、品牌、台灣市場），含 sticky TOC、scroll fade-in 動畫、active link 高亮等互動

### Modified Capabilities

（無，目前 `openspec/specs/` 為空）

## Impact

- **Code**：新增 `src/components/guide/`、`src/data/guide/`、3 個 hooks 及對應 smoke 測試；改寫 `src/pages/HomePage.tsx`、`src/index.css`、`index.html`、`.gitignore`
- **Dependencies**：不新增 npm package；透過 shadcn CLI 新增 3 個 UI primitive（`table`、`badge`、`separator`）
- **第三方資源**：頁面 runtime 會從 Google Fonts CDN 載入 3 個字型家族
- **TDD 範圍**：依 `openspec/config.yaml`，hooks 屬行為邏輯但本案採「樣式翻譯為主」策略，僅補 happy-path smoke test；展示元件、資料檔、CSS 屬例外層
- **既有功能**：HomePage 原本展示的「React + Express Template」歡迎卡片會被完全移除
