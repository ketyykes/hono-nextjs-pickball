## MODIFIED Requirements

### Requirement: `/tour` 之 metadata

系統 SHALL 為 `nextjs-pickball/app/tour/page.tsx` 提供獨立 metadata：title 為「匹克球新手完全入門 · 互動體驗 | 匹克球指南」、description 為「用捲動的方式快速看完匹克球規則與器材重點，6 個互動場景帶你 5 分鐘上手」。`/tour` 為公開內容頁，SHALL 對搜尋引擎開放索引，SHALL NOT 設定 `robots.index: false`。

本站目前不提供 `sitemap.xml`（`nextjs-pickball/app/` 下無 `sitemap.ts` 亦無 `robots.ts`）。若日後新增，`/tour` 不給高 priority。

> 先前版本寫「sitemap 不給高 priority」，描述了一個不存在的產物。規格不得描述未實作的東西 ——
> 那會讓讀者以為 sitemap 已存在而去找設定。

#### Scenario: `/tour` head 中 title 與 description 設定正確

- **GIVEN** 完成實作
- **WHEN** 訪問 `/tour` 並檢查 document head
- **THEN** title 含「匹克球新手完全入門 · 互動體驗」、meta description 為上述定義之文字

#### Scenario: 目前不提供 sitemap

- **WHEN** 列出 `nextjs-pickball/app/` 下的檔案
- **THEN** 不存在 `sitemap.ts` 與 `robots.ts`；規格中關於 sitemap priority 的敘述為條件式（「若日後新增」）而非現況描述
