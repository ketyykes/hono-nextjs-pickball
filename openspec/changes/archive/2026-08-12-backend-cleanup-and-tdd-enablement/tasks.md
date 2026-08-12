# Tasks — backend-cleanup-and-tdd-enablement

> 分類依 design.md「TDD 分層判定」。**只有 B1 走三步**，其餘為例外層或 characterization test。
> ⚠️ 後端測試在受限沙箱中會噴 `listen EPERM 127.0.0.1`（miniflare 需開 localhost server），
> 不是設定錯誤，放行後重跑即可。

## A. 工具鏈建置（例外層）

- [x] **A1** `hono-pickball/package.json` 先加 `"test": "vitest"`
  - ⚠️ **必須先加 script 紅燈才是真的**：script 不存在時 pnpm 是**靜默成功**（無輸出、EXIT=0），根本不會紅（見 design.md D-④-1）
  - 驗收：加完後 `pnpm --filter ./hono-pickball test --run test/smoke.test.ts` → `Exit status 1`（無測試檔）
- [x] **A2** 新增 `hono-pickball/vitest.config.ts`，用 `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })`
  - ⚠️ 實測 0.16.13 的 `exports` 只有 `.` / `./types` / `./codemods/vitest-v3-to-v4`，**無 `./config` subpath、無 `defineWorkersConfig`**
  - 刻意不開 `globals`（與前端不同），避免 workerd 全域污染
- [x] **A3** 新增 `hono-pickball/test/tsconfig.json`
  - ⚠️ 官方範例的 `../src/worker-configuration.d.ts` 在本 repo 是 `../worker-configuration.d.ts`（檔案在 workspace 根）
  - ⚠️ 不新增 `env.d.ts`：實測 `worker-configuration.d.ts` 無 `ProvidedEnv` 擴充點
- [x] **A4** `hono-pickball/tsconfig.json` 補 `"include": ["src/**/*.ts", "worker-configuration.d.ts"]`
  - 理由：避免加了 `test/` 之後 `tsc --noEmit`（= build 的型別檢查段）把測試檔一起編而汙染 build 語意
- [x] **A5** `hono-pickball/package.json` 補 `typecheck` 與 `build`
  - `typecheck` 必須帶第二段 `-p test/tsconfig.json`，否則該設定檔會是沒人跑的死設定
  - `build` 為 `tsc --noEmit && wrangler deploy --dry-run`，兩段互補
  - ⚠️ **落地前人工確認**：CF Dashboard → hono-pickball → Settings → Builds 的 build command。新增 `build` script 可能讓 Workers Builds 改跑 dry-run（無害但屬行為改變），該設定不在 git 內
- [x] **A6** 新增 `test/smoke.test.ts` 驗證工具鏈
  - 用 `exports.default.fetch()`，**不用 `SELF` / `env`**（皆已標 `@deprecated`）
  - 檔頂 `import "../src/index"`，`src/` 改動時才會自動重跑
  - 驗收：1 檔 2 測全綠 ✅
- [x] **A7** root `package.json`：`test` → `pnpm -r test`；新增 `typecheck`、`test:web`、`test:api`
  - 驗收：`pnpm test` 輸出同時出現兩個 workspace 的統計 ✅（19 檔 93 測 + 4 檔 16 測）

## B. 三步 TDD

### B1｜`GET /` 回 404 — 刪除 scaffold 樣板路由（決策 D2）

- [x] **B1-①（紅）** 新增 `test/routing.test.ts`，2 個 it：
      `GET / 應回傳 404（對外路由一律掛在 /api/* 之下）`、`未定義的 /api/* 路徑應回傳 404`
  - 實測紅燈：`Tests 1 failed | 1 passed (2)` —— `GET /` 現行回 200 `Hello Hono!` ✅
- [x] **B1-②（綠）** 刪除 `src/index.ts` 的 `app.get('/')` 整段，改為說明性註解
  - 驗收：2 測全綠 ✅
- [x] **B1-③（refactor）** 純刪除，無新增實作 → `skipped`

## C. Characterization test（實作已存在，寫測試直接綠燈 — 不套三步）

- [x] **C1** `test/api-health.test.ts`，5 個 it：200/json、status ok、service、timestamp 可解析、requestUrl 未被改寫
  - `timestamp` 用 `Date.parse` 驗可解析性，**不對固定字串做快照**
- [x] **C2** `test/api-cookie-check.test.ts` cookie 屬性，4 個 it：cookie 名稱、HttpOnly、SameSite=Lax、Path=/
  - **刻意不斷言 `Secure`**：現行沒設，加上去會讓 `http://localhost:3005` 的 dev 流程收不到 cookie。屬產品決策，不由測試偷渡
  - **刻意不斷言 `Max-Age` / `Expires`**：現行為 session cookie，無需求文件支持
- [x] **C3** `test/api-cookie-check.test.ts` 來回穿透，3 個 it：未帶 cookie、帶前次 cookie、帶其他名稱 cookie
  - ⚠️ **實測坑**：`setCookie` 會對 ISO 字串的 `:` 做 percent-encoding，比對前必須 `decodeURIComponent(issued)`
  - `exports.default.fetch()` 無 cookie jar，第二次呼叫手動組 `Cookie` header——反而讓測試完全確定性

## D. 型別（例外層）

- [x] **D1** `src/index.ts` 泛型化為 `new Hono<{ Bindings: CloudflareBindings }>()`
  - `CloudflareBindings` 為全域介面，**不需 import**
  - **不寫單元測試**：binding 清單目前為空，泛型化後 runtime 零變化（見 design.md D-④-4）
  - 驗收：`pnpm --filter ./hono-pickball typecheck` EXIT=0 ✅

## E. 規範與文件（例外層）

- [x] **E1** `openspec/config.yaml`：移除「後端 TDD 待補充」，寫入後端 TDD 範圍
- [x] **E2** `openspec/config.yaml` context 補 CF 部署與通路架構、不使用 CI 的說明
- [x] **E3** `openspec/config.yaml` 補後端測試工具說明（`cloudflareTest`、`test/` 目錄、沙箱陷阱、coverage 需 istanbul）
  - ⚠️ **與 change ① 的衝突處理（C-1）**：① 只改 `rules.tasks` 指令字串；④ 只**追加** context 段落。已嚴格序列化，④ 開工前重讀過 `config.yaml`
- [x] **E4** `hono-pickball/CLAUDE.md` 新增「測試慣例」段與常用指令
- [x] **E5** `hono-pickball/CLAUDE.md` 路由約定補「root path 回 404 是刻意行為，不代表部署失敗」
- [x] **E6** `hono-pickball/CLAUDE.md` 依賴段補決策 D5 的保留理由與 **2026-11-12 複審期限**
- [x] **E7** root `CLAUDE.md` / `README.md`：把 ① 記錄的「build 靜默跳過後端」警告改為現況

## F. 決策記錄（不執行，只記錄）

- [x] **F1** 7 個零使用依賴 → **保留**（決策 D5）。實測 gzip 16.91 KiB，離 3 MiB 上限餘裕極大
- [x] **F2** `wrangler.jsonc:14-33` 被註解的 d1/kv/r2 樣板 → **保留**作為未來 binding 的填空模板

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# ⚠️ 沙箱內若噴 listen EPERM 127.0.0.1，是 miniflare 被擋，放行後重跑
pnpm --filter ./hono-pickball test --run                # 期望 4 檔 16 測全綠
pnpm --filter ./hono-pickball typecheck                 # 期望 EXIT=0
pnpm --filter ./hono-pickball build                     # 期望 EXIT=0 + Total Upload / gzip 數字

pnpm test                                               # 期望同時出現兩個 workspace 的統計
pnpm build                                              # 期望前後端都真的建置

# root 指令不再說謊
grep -n "靜默跳過\|尚無測試" CLAUDE.md README.md         # 期望無輸出

DO_NOT_TRACK=1 openspec validate backend-cleanup-and-tdd-enablement --strict
```
