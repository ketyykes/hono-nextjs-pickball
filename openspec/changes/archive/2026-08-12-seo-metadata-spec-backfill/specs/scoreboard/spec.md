## ADDED Requirements

### Requirement: `/scoreboard` 之 metadata

系統 SHALL 為 `nextjs-pickball/app/scoreboard/page.tsx` 提供獨立 metadata：title 為「計分板 | 匹克球指南」、description 為「支援單打與雙打的匹克球 Traditional 計分器」。

`/scoreboard` 為公開內容頁，SHALL 對搜尋引擎開放索引，SHALL NOT 設定 `robots.index: false` —— noindex 只適用於 `/health` 這類內部診斷路由（見 `api-connectivity` capability）。

#### Scenario: `/scoreboard` 匯出 metadata 且開放索引

- **WHEN** 檢查 `nextjs-pickball/app/scoreboard/page.tsx` 的模組匯出
- **THEN** 存在 `export const metadata`，title 與 description 如上；未設定 `robots.index: false`
