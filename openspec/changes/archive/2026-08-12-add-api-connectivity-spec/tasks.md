# Tasks — add-api-connectivity-spec

> 分類依 design.md「TDD 分層判定」。**A1 與 A2 走三步**，B 為 regression guard，C 為純規格。
> 前置：change ④ 必須先完成（本 change 引用的後端錨點由 ④ 建立）。

## A. 三步 TDD

### A1｜`lib/health.ts` payload 形狀驗證（真 red-first，且是修 bug）

- [x] **A1-①（紅）** `lib/health.test.ts` 新增 it「payload 缺少 service 或 timestamp 時回傳 ok:false」
  - 實測紅燈：`Tests 1 failed | 7 passed (8)`，`expected true to be false` ✅
  - 證實 bug：傳 `{ status: "ok" }` 會走成功分支，三個欄位全 `undefined` 卻回 `ok: true`
- [x] **A1-②（綠）** `lib/health.ts` 新增 `isValidPayload` type guard，四個欄位皆為字串才視為合法
  - 用手寫 `typeof` 檢查而非引入 zod（前端 `lib/` 目前無 zod 依賴，四欄位檢查不值得擴大依賴面）
  - 驗收：8 測全綠 ✅
- [x] **A1-③（refactor）** 形狀檢查已抽為獨立 `isValidPayload` helper，無進一步壞味道 → `skipped`

### A2｜`/health` metadata noindex（真 red-first）

- [x] **A2-①（紅）** 新增 `app/health/page.test.ts`，3 個 it
  - 實測紅燈：`Tests 2 failed | 1 passed (3)`，`Cannot read properties of undefined (reading 'title')` ✅
  - 第 3 條（`dynamic === "force-dynamic"`）如預告直接綠 —— 已在測試檔內註明其為 regression guard
- [x] **A2-②（綠）** `app/health/page.tsx` 新增 `export const metadata`（title + `robots.index: false`）
  - ⚠️ noindex **只對 `/health`**；`/quiz`、`/scoreboard`、`/tour` 是公開內容頁不得比照（已註解標明）
  - 驗收：3 測全綠 ✅
- [x] **A2-③（refactor）** 純新增匯出常數 → `skipped`

## B. Regression guard（實作已存在，寫測試直接綠燈 — 不套三步）

- [x] **B1** 新增 `app/api/[[...route]]/route.test.ts`，7 個 it
  - ⚠️ **實測修正 1**：`hasBody:false` 時 key `body` **存在**但值為 `undefined`。
    必須用 `expect(init.body).toBeUndefined()` + `expect("duplex" in init).toBe(false)`；
    寫 `not.toHaveProperty("body")` 會誤紅
  - ⚠️ **實測修正 2**：用 `// @vitest-environment node` 不是因為 happy-dom 不支援，
    而是為了與 workerd 語義對齊並避開 `tests/setup.ts` 的 DOM cleanup
  - ⚠️ **實測修正 3**：過濾用 `route.test.ts`（不含方括號），避免 shell/glob 轉義
  - 驗收：7 測全綠 ✅
- [x] **B2** `lib/health.test.ts` 補 2 個 it：`binding.fetch 被呼叫時路徑為 /api/health`、`失敗分支也會回報 latencyMs`
  - ⚠️ 需改 `fakeBinding` helper 使其記錄呼叫參數，**且必須保持既有 5 條全綠**
  - 驗收：8 測全綠（原 5 + A1 的 1 + 本項的 2）✅

## C. 規格（例外層）

- [x] **C1** 新增 `specs/api-connectivity/spec.md`，6 條 ADDED Requirement
- [x] **C2** 把 `route.ts:3-27` 註解裡的可觀察契約升格為 SHALL（不含 runtime bug 成因，見 design.md D-⑤-1）
- [x] **C3** `specs/site-navbar/spec.md`：「非首頁路由樣式」改為「路由不為 `/`」，新增「診斷路由不出現在導航列」Scenario

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

pnpm --filter ./nextjs-pickball test --run lib/health.test.ts        # 期望 8 測
pnpm --filter ./nextjs-pickball test --run route.test.ts             # 期望 7 測
pnpm --filter ./nextjs-pickball test --run app/health/page.test.ts   # 期望 3 測
pnpm --filter ./nextjs-pickball test --run                           # 實測 21 檔 106 測

pnpm lint
pnpm -r exec tsc --noEmit

DO_NOT_TRACK=1 openspec validate add-api-connectivity-spec --strict

# E2E（需前後端同時運行，webServer 會自動帶起）
pnpm --filter ./nextjs-pickball test:e2e --project=chromium tests/e2e/specs/api-health.spec.ts
```
