# playwright-e2e-runner E2E 派遣 prompt 骨架

所有 task 完成後派 `.claude/agents/playwright-e2e-runner.md`（agent definition 中已綁定 `playwright-cli` skill，無需另外載入）。

```
你是 {{feature 名稱}} 的 E2E 驗證者。請對 `{{路由 / 頁面}}` 做 end-to-end browser 驗證並寫成 Playwright spec。

## 環境

- 工作目錄：`/path/to/project`
- 分支：`{{branch}}`
- Dev server 啟動：`pnpm dev`（會在 :3000；Playwright config 含 webServer 會自動啟動）
- 既有 Playwright spec 範例：`tests/e2e/specs/` 下其他 spec 可參考
- 5 個 browser project：Chromium / Firefox / WebKit / Mobile Chrome / Mobile Safari
- testIdAttribute: `data-testid`

## 驗證情境

從 plan 的 E2E 章節或 spec 抽出，例如：

A. **{{進入路徑}}**：點 `{{Navbar 連結 / Hero CTA}}` 進入 `{{path}}`，預期 URL + 內容
B. **{{核心流程}}**：依序操作 → 預期最終 state（含 Dialog / Toast / 分數等）
C. **{{Undo / 回復}}**：操作 X、Y 後 Undo → 預期回到 X
D. **{{設定變更與 lock 機制}}**：開賽後 toggle 應 disabled；Reset 後解鎖
E. **{{Persistence}}**：操作後 reload → 預期狀態仍在
F. **{{Responsive 排版}}**（可選）：viewport 切換、提示顯示

## Selector 對照（給 reviewer 寫斷言用）

- 「贏這球+」按鈕 aria-label：`/{{label}}贏這一球/`
- 分數顯示 aria-label：`{{label}}目前 X 分`
- mode toggle role + name：`combobox` + `"比賽形式"`
- 重置按鈕 aria-label：`重置比賽`
- 確認重置按鈕 text：`確定重置`
- ...{{其他相關 selector}}

## 規範

- 寫成乾淨可重跑的 Playwright spec：`tests/e2e/specs/{{feature}}.spec.ts`
- `test.beforeEach` 清 localStorage / sessionStorage 避免測試污染
- 每個情境一個 `test()`
- Tab 縮排、雙引號、中文 test 描述
- **必加 console error 監控**（spec 內 page.on("console") + page.on("pageerror")）

## Console 監控（必要）

任何測試通過但有 console error/warning 也要回報，特別關注：
- React hydration mismatch
- Key warnings
- 4xx/5xx network errors
- 未捕捉的 JS exceptions

## Commit

完成後：
```bash
git add tests/e2e/specs/{{feature}}.spec.ts
git commit -m "test({{scope}}): E2E 涵蓋 {{核心情境列表}}"
```

## 回報

- DONE / DONE_WITH_CONCERNS / BLOCKED
- 各 test 結果（chromium project，至少）：pass / fail / skipped + 失敗詳情
- Console errors 清單（即使測試 pass）
- commit SHA
- 觀察到的產品 bug（純報告，不修；由後續流程處理）

## 重要

- **必須先呼叫 `playwright-cli` skill**（agent definition 已綁定，但仍要確認用工具前載入）
- 不要動產品程式碼（即使發現 UI bug 也只報告）
- 遇 sandbox 擋 dev server / 網路，回報 BLOCKED + 建議 `dangerouslyDisableSandbox: true` 重跑
- 全 5 個 browser 跑完比較好，但若時間吃緊，至少跑 chromium 確保 spec 本身正確
```

## 為什麼把 E2E 放最後而不是每個 task 跑一次？

- E2E 慢（每次都要起 dev server + 跑 5 個 browser）
- 多數 task 只動 lib/ 或 hook 層級，沒有 UI 變動
- 把 E2E 放在 phase 結尾，等所有 UI 就位才有意義跑 user flow
- 若中途 E2E 抓到 bug，回頭修反而會打斷 task 節奏

## 主 orchestrator 在 E2E 後該做什麼

```
E2E agent 回報後：

1. 全 PASS 且無 console error → 跑最終 sweep：
   - pnpm test -- --run  （unit）
   - pnpm lint
   - pnpm build
   全綠 → 向使用者交付總結

2. 有 fail 或 console error：
   - 區分「測試斷言失敗」vs「產品 bug」
   - 若是測試 spec 寫錯（如 selector 不對）→ 派 fix 修 spec
   - 若是產品 bug：
     a. 嚴重（影響核心流程）→ 派 nextjs-expert 直接修產品 code（不走 review loop，E2E 結果即需求）
     b. 輕微（如 dev mode warning）→ 記錄但不阻擋交付

3. BLOCKED（如 dev server 起不來）→ 回報使用者，調查環境
```

## 與 unit test 的分工

| 層級 | 何時跑 | 抓什麼 |
|---|---|---|
| Unit (Vitest) | 每個 task 內，TDD 紅綠 | 純函式行為、reducer state、hook 對 mock 的反應 |
| E2E (Playwright) | 全部 task 完成後一次 | 跨 component user flow、SSR/hydration、實際瀏覽器行為、persistence |

兩者**互補不重疊**。Unit test 抓不到的 hydration mismatch、實際 localStorage 行為、跨瀏覽器差異——這些是 E2E 的價值所在。
