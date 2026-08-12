# Tasks — seo-metadata-spec-backfill

> **全數例外層，零程式碼變更，無 TDD**（依據見 design.md）。

## A. 修正懸空敘述（決策 D4）

- [x] **A1** `tour-experience` 的「`/tour` 之 metadata」Requirement：
      「sitemap 不給高 priority」→「本站目前不提供 `sitemap.xml`；若日後新增，`/tour` 不給高 priority」
  - 依據：`ls nextjs-pickball/app/` 實測無 `sitemap.ts`、無 `robots.ts`
- [x] **A2** 同 Requirement 補「`/tour` 為公開內容頁，SHALL NOT 設定 `robots.index: false`」
- [x] **A3** 新增 Scenario「目前不提供 sitemap」，把現況寫成可驗證的斷言

## B. 追認既有 metadata

- [x] **B1** `quiz` 新增 Requirement「`/quiz` 之 metadata」
  - 真值：`app/quiz/page.tsx:5`，title「規則隨堂測驗 | 匹克球指南」
- [x] **B2** `scoreboard` 新增 Requirement「`/scoreboard` 之 metadata」
  - 真值：`app/scoreboard/page.tsx:4`，title「計分板 | 匹克球指南」
- [x] **B3** 兩條皆明寫「公開內容頁，SHALL NOT 設定 `robots.index: false`」
  - ⚠️ **這條是本 change 的重點**：change ⑤ 剛為 `/health` 加了 noindex，
    若不寫下對照，日後很容易被「順手統一」而把公開頁一起 noindex 掉。
    這是**規格能擋、測試與型別檢查都擋不了**的錯誤

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

DO_NOT_TRACK=1 openspec validate seo-metadata-spec-backfill --strict

# 敘述與現實一致
ls nextjs-pickball/app/ | grep -E "sitemap|robots" || echo "確認無 sitemap.ts / robots.ts（與 spec 敘述一致）"

# 零程式碼變更
git status --short -- nextjs-pickball/app nextjs-pickball/lib nextjs-pickball/components   # 期望無本 change 造成的變更

# 迴歸
pnpm --filter ./nextjs-pickball test --run    # 期望 23 檔 114 測全綠
```
