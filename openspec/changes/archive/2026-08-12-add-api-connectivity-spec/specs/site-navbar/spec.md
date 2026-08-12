## MODIFIED Requirements

### Requirement: 全域導航列

全站共享的 fixed top header，高度 h-14（56px），z-index 110，掛在 root layout 的 `<ViewTransition>` 外側，不受路由過場動畫影響。透明態與 solid 態的配色 SHALL 與 TocBar 在首頁堆疊時形成自然視覺階序（同色系不同 alpha），避免兩條 nav 看起來像獨立的橫條切割。

樣式態的判定 SHALL 以「路由是否為 `/`」表述，SHALL NOT 逐一列舉非首頁路由 —— 實作 `nextjs-pickball/components/layout/SiteNavbar.tsx` 為 `const solid = !isHome || pastHero`，任何列舉都會在新增路由時漏列（`/health` 就是如此漏掉的）。

`NAV_LINKS` 僅包含公開內容路由；內部診斷路由 SHALL NOT 列入（見 `api-connectivity` capability 的「`/health` 為內部診斷路由」Requirement）。

#### Scenario: 首頁捲動前樣式

- **WHEN** 路由為 `/`，且 `window.scrollY ≤ window.innerHeight - 56`（尚未捲過 Hero）
- **THEN** Navbar 背景為半透明深色 `bg-slate-900/20 backdrop-blur-sm`，底部 border 為 `border-white/5`（降低與下方 TocBar 的視覺切割），連結文字為白色

#### Scenario: 首頁捲動後樣式

- **WHEN** 路由為 `/`，且 `window.scrollY > window.innerHeight - 56`
- **THEN** Navbar 背景為 `bg-background/85 shadow-sm backdrop-blur-md`，連結文字深色

#### Scenario: 非首頁路由樣式

- **WHEN** 路由**不為** `/`（含 `/tour`、`/scoreboard`、`/quiz`、`/health` 及日後新增的任何路由）
- **THEN** Navbar 一律顯示 solid 樣式 `bg-background/85 shadow-sm backdrop-blur-md`（不看捲動位置）

#### Scenario: 連結點擊帶 view transition

- **WHEN** 使用者點擊「計分板」或「完整體驗」連結
- **THEN** 觸發 `transitionTypes={["nav-forward"]}`；點擊「首頁」時觸發 `transitionTypes={["nav-back"]}`

#### Scenario: 診斷路由不出現在導航列

- **WHEN** 檢查 `nextjs-pickball/components/layout/SiteNavbar.tsx` 的 `NAV_LINKS`
- **THEN** 不含 `/health`；該路由僅供直接輸入網址存取
