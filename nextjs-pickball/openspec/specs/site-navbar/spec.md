## Purpose

定義全站共享的固定頂部導航列（SiteNavbar）規格，包含樣式切換行為、路由 active 標示與 view transition 整合。

## Requirements

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

### Requirement: 測驗連結

`SiteNavbar` MUST 提供「測驗」連結指向 `/quiz`，與既有「計分板」「完整體驗」等連結並列顯示。當路由為 `/quiz` 時，該連結 MUST 呈現 active 標示樣式。

#### Scenario: Navbar 顯示測驗連結

- **WHEN** 使用者位於任一頁面
- **THEN** Navbar 內可見文字為「測驗」的連結，`href === "/quiz"`

#### Scenario: /quiz active 標示

- **WHEN** 路由為 `/quiz`
- **THEN** 「測驗」連結套用 active 樣式；其餘連結為 muted 樣式

#### Scenario: E2E 從 Navbar 進入測驗

- **WHEN** 從首頁點擊 Navbar 的「測驗」連結
- **THEN** 導向 `/quiz` 並顯示第 1 題（對應 `tests/e2e/specs/quiz.spec.ts` 第一個情境）
