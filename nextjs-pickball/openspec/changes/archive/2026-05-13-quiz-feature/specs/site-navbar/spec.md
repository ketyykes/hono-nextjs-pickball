## ADDED Requirements

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
