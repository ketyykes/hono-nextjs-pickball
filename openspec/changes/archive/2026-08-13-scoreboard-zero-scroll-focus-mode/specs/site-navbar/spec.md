## ADDED Requirements

### Requirement: 專注模式下隱藏

`document.documentElement` 帶有 `sb-focus` class 時，SiteNavbar SHALL 隱藏（`display: none`）；class 移除後 SHALL 恢復顯示。

`sb-focus` 存在期間，本 requirement 優先於「全域導航列」與「窄螢幕導航呈現」的可見性條款（該兩條描述的是**未進入專注模式**時的行為）——專注模式是使用者明確選擇的沉浸狀態，隱藏導航是其定義的一部分，退出入口由 scoreboard 的浮動退出鈕提供。

實作 MUST 僅為 `nextjs-pickball/components/layout/SiteNavbar.tsx` header className 追加一個 Tailwind arbitrary variant（`[.sb-focus_&]:hidden`），SHALL NOT 引入對 scoreboard 狀態的任何 props／context／store 依賴 —— `sb-focus` class 的掛載與清除是 scoreboard capability（`useFocusMode`）的責任，SiteNavbar 只以 CSS 回應。

#### Scenario: sb-focus 時隱藏

- **GIVEN** 使用者於 `/scoreboard` 進入專注模式（`html.sb-focus`）
- **WHEN** 檢視 SiteNavbar
- **THEN** header 為 `display: none`，navbar 內連結皆不可見
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「專注模式：進入後隱藏 navbar 與設定列、退出後恢復」

#### Scenario: 退出專注模式後恢復

- **WHEN** `sb-focus` class 自 `document.documentElement` 移除（退出專注模式或離開 `/scoreboard`）
- **THEN** SiteNavbar 恢復顯示，樣式回到既有規則（非首頁路由為 solid 態）

#### Scenario: 其他路由不受影響

- **GIVEN** 使用者未進入專注模式
- **WHEN** 瀏覽任一路由
- **THEN** `document.documentElement` 不帶 `sb-focus`，SiteNavbar 行為與既有規格完全一致
