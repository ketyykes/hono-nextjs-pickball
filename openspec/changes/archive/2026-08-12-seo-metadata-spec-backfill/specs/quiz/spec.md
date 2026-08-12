## ADDED Requirements

### Requirement: `/quiz` 之 metadata

系統 SHALL 為 `nextjs-pickball/app/quiz/page.tsx` 提供獨立 metadata：title 為「規則隨堂測驗 | 匹克球指南」、description 為「從 25 道題庫中隨機抽 10 題，測驗你對匹克球規則的掌握程度」。

`/quiz` 為公開內容頁，SHALL 對搜尋引擎開放索引，SHALL NOT 設定 `robots.index: false` —— noindex 只適用於 `/health` 這類內部診斷路由（見 `api-connectivity` capability）。

#### Scenario: `/quiz` 匯出 metadata 且開放索引

- **WHEN** 檢查 `nextjs-pickball/app/quiz/page.tsx` 的模組匯出
- **THEN** 存在 `export const metadata`，title 與 description 如上；未設定 `robots.index: false`
