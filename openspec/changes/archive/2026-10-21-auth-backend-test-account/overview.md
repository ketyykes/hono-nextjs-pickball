# Overview: auth-backend-test-account（B2）

## Scope

在 B1 的 D1 基礎上接上 better-auth：本機測試帳號可以用 email／密碼登入、拿到 session cookie、
呼叫 `GET /api/me` 看到自己；`ENVIRONMENT` 不是 `development` 時整組登入路由回 404。
另提供永遠回 200 的 `GET /api/session` 給 B3 前端判斷要不要顯示登入入口，以及 Wave 2 共用的 `requireSession`。

- **規模：large**——影響 3 個 capability（新增 `auth`，修改 `api-connectivity`、`dev-workflow`），tasks 超過 20 項，
  且跨服務（前端 proxy → service binding → Hono → D1）。
- **前端需求**：否。只新增 E2E 與測試 helper，不動前端產品程式碼。
- **DB 結構**：否。沿用 B1 的四張表；若 adapter 需要欄位調整才以新 migration 補（Risks）。
- **資料遷移**：否。
- **跨元件流程**：是。登入經 proxy 與 service binding、cookie 回到瀏覽器、後續請求帶回 → 附 Sequence Diagram。

## What Changes

- `src/auth/`：`createAuth(env)`（每請求）、`isLocalAuthEnabled(env)`、gate、`requireSession`
- 路由：`/api/auth/*`（gate→better-auth）、`GET /api/me`（gate→requireSession）、`GET /api/session`（永遠 200）
- seed：`src/db/seed/test-account.ts`（純函式）＋`scripts/seed-test-account.ts`（Node，只 `--local`）＋`db:seed:local`
- `.dev.vars.example` 補 auth 變數；`vitest.config.ts` 注入測試值
- E2E：`auth-proxy.spec.ts`＋`helpers/test-account.ts`

```
=== Before ===                         === After ===
/api/health        200                 /api/health        200 (不變)
/api/cookie-check  200                 /api/cookie-check  200 (不變)
                                       /api/session       200 {authEnabled,user}
                                       /api/auth/*        dev: better-auth
                                                          其他: 404
                                       /api/me            dev: 401 / 200
                                                          其他: 404
```

## Architecture

```
 Browser ──► nextjs-pickball /api/[[...route]] ──HONO_API──► hono-pickball
                                                               │
                ┌──────────────────────────────────────────────┤
                ▼                     ▼                        ▼
         /api/session          gate: isLocalAuthEnabled(env)
         (永遠 200)              │ false → 404
           │ disabled→false     │ true
           │ enabled ──────────►├──► createAuth(env) ──► drizzleAdapter
           │                    │     (每請求一次,       │  getDb(env)
           │                    │      存 c.var.auth)    ▼
           │                    │                       D1 (env.local)
           │                    ├── /api/auth/*  → auth.handler(req)
           │                    └── /api/me → requireSession → {user}
           │
 scripts/seed-test-account.ts ──► buildTestAccountSeedSql ──► wrangler d1
   (.dev.vars 帳密)                (hashPassword)               execute --local
```

## Sequence Diagram

本機登入、帶 cookie 呼叫 `/api/me`、停用時的 404 分支。

```
Browser          Next proxy          Hono(gate)         better-auth      D1
  │ POST /api/auth/sign-in/email (Origin:3005)            │               │
  │────────────►│ HONO_API.fetch(url 字串)                │               │
  │             │───────────────────►│ ENVIRONMENT?        │               │
  │             │                    │ ≠development → 404 ─┼──► (不碰 D1)  │
  │             │                    │ createAuth(env)     │               │
  │             │                    │────────────────────►│ verify 密碼   │
  │             │                    │                     │──────────────►│
  │             │                    │◄─ 200 Set-Cookie ───│◄──────────────│
  │◄────────────│◄─ 原樣重建 Response │                     │               │
  │ GET /api/me (Cookie)             │                     │               │
  │────────────►│───────────────────►│ requireSession      │               │
  │             │                    │────────────────────►│ getSession    │
  │             │                    │◄─ null → 401 ───────│               │
  │◄── 200 {user:{id,email,name}} ───│◄─ session ──────────│               │
```

## Task Tree

```
§1 對齊 main（B1 已合併）＋Context7 查證
 └─ §2 isLocalAuthEnabled（unit）
     └─ §3 createAuth 與測試 env 注入
         └─ §4 seed 純函式（SQL 形狀；「可登入」留給 §5 驗證）
             └─ §5 /api/auth/* 掛載（登入／註冊／重複 seed）→ gate
                 ├─ §6 requireSession＋/api/me
                 ├─ §7 /api/session
                 └─ §8 seed 腳本與 db:seed:local
                     └─ §9 E2E proxy 穿透（需要 §5～§8）
                         └─ §10 文件與總驗收
```

## Cross-Cutting Impact

| 檔案／模組 | §2 | §3 | §4 | §5 | §6 | §7 | §8 | §9 | §10 |
|---|---|---|---|---|---|---|---|---|---|
| `hono-pickball/src/auth/local-auth.ts` | 新增 | | | | | | | | |
| `hono-pickball/src/auth/create-auth.ts` | | 新增 | | | | | | | |
| `hono-pickball/src/auth/require-session.ts` | | | | | 新增 | | | | |
| `hono-pickball/src/index.ts` | | | | 改 | 改 | 改 | | | |
| `hono-pickball/src/db/seed/test-account.ts` | | | 新增 | | | | | | |
| `hono-pickball/scripts/seed-test-account.ts` | | | | | | | 新增 | | |
| `hono-pickball/vitest.config.ts` | | 改 | | | | | | | |
| `hono-pickball/package.json` | | | | | | | 改 | | |
| `hono-pickball/.dev.vars.example`、`worker-configuration.d.ts` | | 改 | | | | | | | |
| `hono-pickball/CLAUDE.md` | | | | | | | | | 改 |
| `nextjs-pickball/tests/e2e/**` | | | | | | | | 新增 | |
