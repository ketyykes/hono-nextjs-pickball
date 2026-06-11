## ADDED Requirements

### Requirement: 全域導航列

全站共享的 fixed top header，高度 h-14（56px），z-index 110，掛在 root layout 的 `<ViewTransition>` 外側，不受路由過場動畫影響。

#### Scenario: 首頁捲動前樣式

- **WHEN** 路由為 `/`，且 `window.scrollY ≤ window.innerHeight - 56`（尚未捲過 Hero）
- **THEN** Navbar 背景為半透明深色（`bg-slate-900/20 backdrop-blur-sm`），連結文字為白色

#### Scenario: 首頁捲動後樣式

- **WHEN** 路由為 `/`，且 `window.scrollY > window.innerHeight - 56`
- **THEN** Navbar 背景為白底毛玻璃（`bg-background/90 backdrop-blur shadow-sm`），連結文字深色

#### Scenario: 非首頁路由樣式

- **WHEN** 路由為 `/tour` 或 `/scoreboard`
- **THEN** Navbar 一律顯示白底樣式（不看捲動位置）

#### Scenario: 連結點擊帶 view transition

- **WHEN** 使用者點擊「計分板」或「完整體驗」連結
- **THEN** 觸發 `transitionTypes={["nav-forward"]}`；點擊「首頁」時觸發 `transitionTypes={["nav-back"]}`

#### Scenario: 當前頁面 active 標示

- **WHEN** 使用者在 `/scoreboard`
- **THEN** 「計分板」連結文字顏色不同（active 態）；其餘連結為 muted 態
