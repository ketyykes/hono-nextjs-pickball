## Why

metadata 是橫切所有路由的能力，但目前**只有 `/tour` 被規格化**，而且那條規格還引用了一個不存在的產物。

`openspec/specs/tour-experience/spec.md:146` 寫：

> 對搜尋引擎開放索引；**sitemap 不給高 priority**。

實測 `ls nextjs-pickball/app/` → `api / globals.css / health / layout.tsx / page.tsx / quiz / scoreboard / tour`
—— **沒有 `sitemap.ts`，也沒有 `robots.ts`**。規格描述了一個不存在的東西，
讀者會以為 sitemap 已存在而去找設定。

另一側：`/quiz`、`/scoreboard` 的 metadata **早已實作且內容正確**
（`app/quiz/page.tsx:5`、`app/scoreboard/page.tsx:4`），但沒有任何 capability spec 記載它們。
這代表任何人重構時把它們刪掉都不會被規格擋下。

`/health` 的 metadata 已於 change ⑤ 處理（noindex），不在本 change 範圍。

## What Changes

### 修正懸空敘述（決策 D4：只改措辭，不新增 sitemap）

- `tour-experience` 的「`/tour` 之 metadata」Requirement：
  - 「sitemap 不給高 priority」改為「本站目前不提供 `sitemap.xml`；若日後新增，`/tour` 不給高 priority」
  - 補上「`/tour` 為公開內容頁，SHALL NOT 設定 `robots.index: false`」
  - 新增 Scenario 明確記載「目前不提供 sitemap」這個現況

### 追認既有實作

- `quiz` 新增「`/quiz` 之 metadata」Requirement
- `scoreboard` 新增「`/scoreboard` 之 metadata」Requirement
- 兩者皆明訂「公開內容頁，不得設 noindex」——與 `/health` 的 noindex 形成明確對照，
  避免日後有人「順手統一」而把公開頁一起 noindex 掉

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `tour-experience`：1 條 MODIFIED（sitemap 措辭修正 + 開放索引的明確要求）
- `quiz`：1 條 ADDED（`/quiz` 之 metadata）
- `scoreboard`：1 條 ADDED（`/scoreboard` 之 metadata）

## Impact

- **受影響檔案**：僅三份 spec（archive 時由 delta 套用）
- **程式碼變更**：**零**
- **測試變更**：**零**
- **風險**：極低，純規格文字
- **明確不做**（決策 D4）
  - **不新增 `app/sitemap.ts` / `app/robots.ts`**。要不要讓搜尋引擎索引、索引哪些路由，
    是**產品決策**，不該夾帶在「清理規格債」裡。本輪目標是讓規格與現實一致，不是擴充功能
  - **不為 `/quiz`、`/scoreboard` 建測試檔**。metadata 已存在，寫測試會直接綠燈，
    投報比低。等日後 spec 新增 `openGraph` / `canonical` / `twitter card` 這類尚未實作的要求時，
    才會有真紅燈，屆時再一併建立 `app/quiz/page.test.ts` 與 `app/scoreboard/page.test.ts`
  - **未來入口**：若要做 SEO，`app/sitemap.ts` 有導出邏輯、屬行為模組，需 1 組三步 TDD
    （`app/sitemap.test.ts`），並回頭把 `tour-experience` 的 priority 敘述改回描述真實策略
