# Overview: backend-d1-foundation（B1）

## Scope

讓 `hono-pickball` 第一次擁有資料庫：本機 D1 binding、drizzle schema 與 migration 管線、
在 workerd 測試裡自動套用 migration 的夾具，外加一個 `getDb(env)` 入口。
正式部署設定完全不動，誤 push 也不會失敗或在遠端建立資源。

- **規模：medium**——影響 2 個 capability（新增 `backend-database`、修改 `dev-workflow`），
  tasks 約 20 項，新增 `src/db/` 模組；無跨服務流程、無既有資料遷移。
- **前端需求**：否。本 change 不動 `nextjs-pickball/**`。
- **DB 結構**：是。新增 `user`／`session`／`account`／`verification` 四張表 → 附 Data Model。
- **資料遷移**：否。全新空資料庫，沒有既有資料要搬。
- **跨元件流程**：是（順序敏感）。migration 在 Node 端讀取、經 binding 傳進 workerd、
  由 setup 檔在每個測試檔前套用 → 附 Sequence Diagram。

## What Changes

- `wrangler.jsonc` 新增 `env.local`（`name: hono-pickball`、`DB` binding、`migrations_dir: drizzle`）
- `package.json`：`dev` 走 `--env local`；新增 `db:generate`、`db:migrate:local`；`cf-typegen` 改讀範例檔
- 新增 `drizzle.config.ts`、`src/db/schema.ts`、`src/db/client.ts`、`drizzle/0000_auth_core.sql`
- 測試夾具：`vitest.config.ts` 注入 `TEST_MIGRATIONS`，`test/apply-migrations.ts` 套用
- `.dev.vars.example`、`hono-pickball/CLAUDE.md` 改寫

前後對照（設定層面）：

```
=== Before ===                          === After ===
wrangler.jsonc                          wrangler.jsonc
  top-level: 無 D1                        top-level: 無 D1  (正式部署,不變)
                                          env.local: name=hono-pickball
                                                     DB -> 本機 sqlite
pnpm dev  -> wrangler dev               pnpm dev  -> wrangler dev --env local
tests     -> 無 binding                 tests     -> DB + TEST_MIGRATIONS
src/      -> index.ts                   src/      -> index.ts, db/schema.ts,
                                                     db/client.ts (getDb)
drizzle/  -> (不存在)                   drizzle/  -> 0000_auth_core.sql, meta/
```

## Data Model

純新增四張表，無既有關聯，只畫 After。

```
=== After ===
┌─ user ──────────────────┐
│ id              PK text │
│ name            text    │
│ email     UNIQUE text   │
│ email_verified  bool    │
│ image           text?   │
│ created_at      ts_ms   │
│ updated_at      ts_ms   │
└─────────────────────────┘
   1 │                 │ 1
     │                 │
   N │                 │ N
┌─ session ───────────────┐   ┌─ account ───────────────────┐
│ id              PK text │   │ id                  PK text │
│ user_id  FK→user CASCADE│   │ user_id      FK→user CASCADE│
│ token     UNIQUE text   │   │ account_id          text    │
│ expires_at      ts_ms   │   │ provider_id         text    │
│ ip_address      text?   │   │ password            text?   │
│ user_agent      text?   │   │ access_token        text?   │
│ created_at      ts_ms   │   │ refresh_token       text?   │
│ updated_at      ts_ms   │   │ id_token            text?   │
└─────────────────────────┘   │ access_token_exp.   ts_ms?  │
                              │ refresh_token_exp.  ts_ms?  │
┌─ verification ──────────┐   │ scope               text?   │
│ id              PK text │   │ created_at          ts_ms   │
│ identifier      text    │   │ updated_at          ts_ms   │
│ value           text    │   └─────────────────────────────┘
│ expires_at      ts_ms   │    (無 issuer 欄位: 1.7 才有)
│ created_at      ts_ms   │
│ updated_at      ts_ms   │
└─────────────────────────┘
```

## Architecture

```
            drizzle.config.ts
                  │ db:generate
src/db/schema.ts ─┴──────────────► drizzle/0000_auth_core.sql
      │                                 │            │
      │ import                          │            │ readD1Migrations
      ▼                                 │            ▼ (Node, vitest.config)
src/db/client.ts  getDb(env)            │      TEST_MIGRATIONS binding
      │                                 │            │
      ▼                                 │            ▼ applyD1Migrations
  env.DB (D1) ◄──── wrangler.jsonc ─────┘      test/apply-migrations.ts
      ▲             env.local.DB  db:migrate:local
      │
  .wrangler/state (本機 sqlite)
```

## Sequence Diagram

每個測試檔開始前 D1 如何被建立（storage 以測試檔為隔離單位）。

```
vitest(Node)        pool/miniflare        workerd(測試檔)       D1(本機)
    │ readD1Migrations("drizzle")  │                    │              │
    │──► [{name,queries}] │                    │              │
    │ cloudflareTest({wrangler env=local,      │              │
    │   bindings:{TEST_MIGRATIONS}})           │              │
    │────────────────────►│ 建立 DB + bindings │              │
    │                     │───────────────────►│              │
    │                     │   setup: applyD1Migrations(DB, M) │
    │                     │                    │─────────────►│
    │                     │                    │◄─ batch ok ──│
    │                     │   it(...) getDb(env) 讀寫         │
    │                     │                    │─────────────►│
    │                     │ 失敗分支: env.DB 不存在 → getDb 拋錯
```
