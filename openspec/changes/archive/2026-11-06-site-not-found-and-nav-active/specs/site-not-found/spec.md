# Specification: site-not-found

## ADDED Requirements

### Requirement: 全站未匹配路由顯示中文 404 頁

`nextjs-pickball/app/not-found.tsx` MUST 存在並作為全站未匹配路由（以及日後任何 segment 呼叫 `notFound()` 而該 segment 沒有自己的 `not-found`）的 404 畫面。它 MUST 是 Server Component（檔案 SHALL NOT 標 `"use client"`），在 root layout 內渲染，因此全站 navbar 照常顯示。

內容要求：

- MUST 匯出 `metadata`，其 `title` 為「找不到頁面 | 匹克球指南」（與其他頁 `<頁名> | 匹克球指南` 的格式一致）。
- MUST 以 `<main>` 包住內容，內含恰一個 `h1`「找不到這個頁面」與一段中文說明（說明網址不存在或連結已失效）。
- MUST 提供至少兩個導回連結：「回首頁」指向 `/`、「前往對戰分配」指向 `/matchmaker`。兩者 MUST 以 `nextjs-pickball/components/ui/button.tsx` 的 `Button asChild` 包 `next/link` 呈現（沿用站內既有按鈕元件，SHALL NOT 另寫按鈕樣式）。
- 內容區 MUST 以 `--site-nav-h` 避開固定 navbar（Tailwind `pt-(--site-nav-h)`），SHALL NOT 硬寫 navbar 高度數值（見「全域 navbar 高度以 CSS variable 暴露」）。
- 介面文字 SHALL NOT 含 emoji（`emoji-free-ui`「介面文字不含 emoji，國旗除外」，由既有守門測試掃描 `app/` 涵蓋）。

狀態碼：造訪未匹配路由時 HTTP 回應狀態 MUST 為 `404`。本 change SHALL NOT 新增 `loading.tsx`（root segment 有 `loading.tsx` 時回應會先以 200 串流，狀態碼即無法再改為 404）。

範圍界線：`/api/*` 由 `nextjs-pickball/app/api/[[...route]]/route.ts` 原樣轉發給 hono-pickball，未匹配的 `/api/*` 路徑 SHALL 維持由後端回應，SHALL NOT 渲染本頁。

#### Scenario: 404 頁匯出中文 metadata 標題

- **WHEN** 匯入 `nextjs-pickball/app/not-found.tsx` 的 `metadata`
- **THEN** `metadata.title` 為字串「找不到頁面 | 匹克球指南」
- **驗收**：`nextjs-pickball/app/not-found.test.tsx`，it 名稱「404 頁匯出中文 metadata 標題」

#### Scenario: 404 頁顯示中文標題、說明與兩個導回連結

- **WHEN** 渲染 `not-found.tsx` 的預設匯出元件
- **THEN** 存在 level 1 的 heading「找不到這個頁面」，且 `main` 內含一段非空的中文說明文字
- **THEN** 存在名稱為「回首頁」的連結 `href === "/"`、名稱為「前往對戰分配」的連結 `href === "/matchmaker"`，兩者皆帶 `data-slot="button"`
- **THEN** `main` 的 class token 含 `pt-(--site-nav-h)`
- **驗收**：`nextjs-pickball/app/not-found.test.tsx`，it 名稱「404 頁顯示中文標題、說明與回首頁、前往對戰分配兩個連結」

#### Scenario: 造訪不存在的路徑回應 404 並顯示中文 404 頁

- **GIVEN** 前後端 dev server 皆已啟動
- **WHEN** 開啟 `/this-page-does-not-exist`
- **THEN** 回應狀態為 404
- **THEN** 文件 `<title>` 為「找不到頁面 | 匹克球指南」；`main` 內可見 heading「找不到這個頁面」與「回首頁」「前往對戰分配」兩個連結；頁面不含英文預設文案「This page could not be found」
- **THEN** 全站 navbar（header）仍可見
- **驗收**：`nextjs-pickball/tests/e2e/specs/site-not-found.spec.ts`，test 名稱「造訪不存在的路徑回應 404 並顯示中文說明與導回連結」

#### Scenario: 從 404 頁點擊回首頁

- **GIVEN** 已開啟 `/this-page-does-not-exist`
- **WHEN** 點擊 `main` 內的「回首頁」
- **THEN** 網址變為 `/`，且首頁內容已渲染（不再顯示 heading「找不到這個頁面」）
- **驗收**：`nextjs-pickball/tests/e2e/specs/site-not-found.spec.ts`，test 名稱「404 頁點擊回首頁後導回首頁」

#### Scenario: 404 頁文案不含 emoji

- **WHEN** 執行 emoji 守門測試（掃描 `nextjs-pickball/app/` 等目錄的介面文字）
- **THEN** `app/not-found.tsx` 不產生任何違規
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「app、components、data、lib、hooks 的介面文字不含 emoji 或 emoji 類符號」
