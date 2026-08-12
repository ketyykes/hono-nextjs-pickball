## Context

本 change 建立本批唯一的**新 capability**。它涵蓋的範圍橫跨兩個 workspace
（前端 proxy + 後端端點）與兩種執行環境（Next.js runtime + workerd），
因此第一個要回答的問題是：什麼進 spec，什麼留在註解。

## TDD 分層判定

| 項目 | 分類 | 依據 |
|---|---|---|
| `lib/health.ts` 形狀驗證 | **行為邏輯**（`lib/**`） | 走三步，真 red-first |
| `app/health/page.tsx` 的 `metadata` | **例外層**（入口 page） | 但行為確實缺，仍先寫測試看紅 |
| `app/api/[[...route]]/route.test.ts` | **補測試，非 TDD** | proxy 行為已存在且正確 |
| `lib/health.test.ts` 的 2 條補充 | **補測試，非 TDD** | 路徑與 latencyMs 早已正確 |
| `openspec/specs/api-connectivity/` | **例外層** | 純規格文字 |

## 關鍵決策

### D-⑤-1｜可觀察契約進 spec，runtime 繞道留註解

`route.ts` 有兩條因 miniflare/workerd 而生的繞道：
不能傳 `Request` 實例、回傳需在本 realm 重建。它們是 commit `ef7fff4` debug 出來的，
價值很高，但**性質不同**：

| 內容 | 歸屬 | 理由 |
|---|---|---|
| 「第一參數必須是 URL 字串」「回傳必須是新 Response 實例」 | **進 spec** | 這是可從外部觀察、可寫測試斷言的契約 |
| 「因為 miniflare proxy 會把跨 realm Request 字串化成 `[object Request]`」 | **留在 `route.ts:3-10` 註解** | 這是 runtime bug 的成因說明，寫進 spec 會把規格綁死在特定版本的 bug 上 |

判準：**spec 描述「必須是什麼」，註解說明「為什麼是這樣」**。
前者在 bug 修好後依然成立（同 realm 重建本來就無害），後者會過期。

### D-⑤-2｜形狀驗證是修 bug，不是加功能

`lib/health.ts:37-44` 原本只檢查 `payload.status !== "ok"`。實測傳 `{ status: "ok" }`
會走成功分支，回傳的 `service` / `timestamp` / `requestUrl` 全為 `undefined`，
而 `/health` 頁面會照著渲染 —— 顯示三個空欄位，掛著綠色 `ok` badge。

這是先寫測試會**真紅**的項目，且屬於「規格債稽核順帶找到的真 bug」。
修法用手寫 type guard 而非引入 zod：前端 `lib/` 目前沒有 zod 依賴
（scoreboard 的 zod 在 `lib/scoreboard/`，為 workspace 依賴），四個欄位的 `typeof` 檢查
清楚且零成本，不值得為此擴大依賴面。

### D-⑤-3｜`route.test.ts` 的三個實測修正

寫這支測試時踩到三件與直覺不符的事，已在測試檔內註解，此處記錄理由：

1. **`hasBody:false` 的斷言必須精確**
   `route.ts:17` 是 `body: hasBody ? request.body : undefined` —— key **存在**、值為 `undefined`。
   因此必須寫 `expect(init.body).toBeUndefined()` + `expect("duplex" in init).toBe(false)`，
   **不能**寫 `expect(init).not.toHaveProperty("body")`，那會誤紅。

2. **用 `// @vitest-environment node`**
   不是因為 happy-dom 不支援（實測它也支援 stream body 與 `duplex`），
   而是為了與 workerd runtime 的語義對齊，且避免 `tests/setup.ts` 的 DOM `cleanup()` 介入。

3. **測試檔過濾用不含方括號的子字串**
   檔案在 `app/api/[[...route]]/` 下，方括號會被 shell/glob 轉義。
   實測 `pnpm --filter ./nextjs-pickball test --run route.test.ts` 可正確過濾出 1 檔。

### D-⑤-4｜`/health` 的 noindex 只對 `/health` 成立

`grep -rn "export const metadata" nextjs-pickball/app/` 顯示 `layout.tsx`、`tour/page.tsx`、
`quiz/page.tsx`、`scoreboard/page.tsx` 都有，**只有 `app/health/page.tsx` 沒有**。

加 `robots: { index: false }` 時必須明確界定範圍：`/health` 是內部診斷頁，
`/quiz`、`/scoreboard`、`/tour` 是公開內容頁，**不得比照**。
這句話寫進 spec 與程式碼註解兩處，因為它是最容易被「順手統一」而做錯的地方。

### D-⑤-5｜site-navbar 的路由判定改為否定式

原 Scenario 列舉「`/tour`、`/scoreboard` 或 `/quiz`」，漏了 `/health`。
但問題不在漏列，而在**列舉這個形式本身是錯的**：
實作是 `const solid = !isHome || pastHero`，只判斷「是不是首頁」。
每新增一條路由就要回頭補列舉，是必然失效的規格形式。

改為「路由**不為** `/`」，與實作同構，日後新增路由不需改 spec。

## 不做的事

- **不為 proxy 加 try/catch 回 502**。`route.ts:11-28` 目前無錯誤處理，binding 失敗會冒成
  Next.js 未處理錯誤。這**可能**該修，但那是行為變更，不能在「補測試」的名義下偷渡。
  若要做，需另開 change 並在 proposal 討論「502 的 body 形狀」與「前端如何呈現」
- **不斷言 cookie 的 `Secure` 屬性**。dev 是 `http://localhost:3005`，加了會讓該流程收不到 cookie。
  「正式環境才加 Secure」是產品決策，不由測試決定
- **不寫跨 worker 的端到端單元測試**。`@cloudflare/vitest-pool-workers` 的 `exports.default`
  只能觸及 hono-pickball 單一 worker；前端→binding→Hono 的完整穿透由既有的
  `nextjs-pickball/tests/e2e/specs/api-health.spec.ts` 覆蓋
