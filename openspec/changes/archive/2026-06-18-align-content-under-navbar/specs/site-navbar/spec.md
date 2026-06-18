## MODIFIED Requirements

### Requirement: 全域導航列

全站共享的 fixed top header，高度 h-14（56px），z-index 110，掛在 root layout 的 `<ViewTransition>` 外側，不受路由過場動畫影響。透明態與 solid 態的配色 SHALL 與 TocBar 在首頁堆疊時形成自然視覺階序（同色系不同 alpha），避免兩條 nav 看起來像獨立的橫條切割。

#### Scenario: 首頁捲動前樣式

- **WHEN** 路由為 `/`，且 `window.scrollY ≤ window.innerHeight - 56`（尚未捲過 Hero）
- **THEN** Navbar 背景為半透明深色 `bg-slate-900/20 backdrop-blur-sm`，底部 border 為 `border-white/5`（降低與下方 TocBar 的視覺切割），連結文字為白色

#### Scenario: 首頁捲動後樣式

- **WHEN** 路由為 `/`，且 `window.scrollY > window.innerHeight - 56`
- **THEN** Navbar 背景為 `bg-background/85 shadow-sm backdrop-blur-md`，連結文字深色

#### Scenario: 非首頁路由樣式

- **WHEN** 路由為 `/tour`、`/scoreboard` 或 `/quiz`
- **THEN** Navbar 一律顯示 solid 樣式 `bg-background/85 shadow-sm backdrop-blur-md`（不看捲動位置）

#### Scenario: 連結點擊帶 view transition

- **WHEN** 使用者點擊「計分板」或「完整體驗」連結
- **THEN** 觸發 `transitionTypes={["nav-forward"]}`；點擊「首頁」時觸發 `transitionTypes={["nav-back"]}`

#### Scenario: 當前頁面 active 標示

- **WHEN** 使用者在 `/scoreboard`
- **THEN** 「計分板」連結文字顏色不同（active 態）；其餘連結為 muted 態

## ADDED Requirements

### Requirement: 全域 navbar 高度以 CSS variable 暴露

`nextjs-pickball/app/globals.css` 的 `:root` SHALL 定義 `--site-nav-h: 3.5rem`（= 56px，對應 `h-14`）；其他 layout 元件（Hero、TourShell 等）SHALL 透過 `var(--site-nav-h)` 取用此高度做偏移計算，避免高度數值散落各處。

#### Scenario: globals.css 定義 --site-nav-h

- **WHEN** 檢查 `nextjs-pickball/app/globals.css`
- **THEN** `:root` 區塊內存在 `--site-nav-h: 3.5rem;` 一條 CSS variable

#### Scenario: SiteNavbar 元件高度仍維持 h-14

- **WHEN** 檢查 `nextjs-pickball/components/layout/SiteNavbar.tsx`
- **THEN** `<header>` 套用 Tailwind class `h-14`（與 `--site-nav-h` 在數值上一致）
