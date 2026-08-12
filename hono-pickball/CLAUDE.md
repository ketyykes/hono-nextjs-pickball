# CLAUDE.md

本檔描述 **hono-pickball workspace**（monorepo 後端）：Hono 4 API on Cloudflare Workers。**所有後端邏輯（含未來的 better-auth、drizzle、D1）都放這裡**，不要寫進前端的 API route。

以下指令除特別標註外皆假設 cwd 在 `hono-pickball/`；從 repo root 執行請用 `pnpm --filter ./hono-pickball <script>`。

## 常用指令

- `pnpm dev` — wrangler dev（http://localhost:8787）
- `pnpm test` — Vitest（在真正的 workerd runtime 中執行）；單檔用 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`（**`--run` 前不可加 `--`**）
- `pnpm typecheck` — `tsc --noEmit` + `tsc --noEmit -p test/tsconfig.json`（兩段都要，root tsconfig 的 include 不含 test/）
- `pnpm build` — `tsc --noEmit && wrangler deploy --dry-run`；兩段互補：前者抓型別但抓不到打包錯，後者走真 esbuild 打包並驗證 wrangler.jsonc 但不做型別檢查
- `pnpm run deploy` — `wrangler deploy --minify` 手動部署（注意：`deploy` 與 pnpm 內建指令撞名，必須加 `run`）；**正式部署走 CF Dashboard Workers Builds（Git 整合），平常不手動 deploy**
- `pnpm cf-typegen` — 重新產生 `CloudflareBindings` 型別（`worker-configuration.d.ts`）；改 `wrangler.jsonc` 後必須重跑，root `.claude/settings.json` 已有 PostToolUse hook 自動觸發

## wrangler.jsonc 要點

- `name: "hono-pickball"` **必須與 CF Dashboard 的 Worker 名稱一致**，否則 Workers Builds 會失敗
- `compatibility_flags: ["nodejs_compat"]` 已開啟（better-auth / drizzle 依賴 node:crypto 等模組）
- D1 binding 暫時移除（未來會員／揪團功能時再建）；重新加入時務必用 `wrangler d1 create` 產生的**真實 UUID** 填 `database_id`，placeholder 值會讓遠端部署直接失敗

## 測試慣例

- 測試放 **`test/` 獨立目錄**（與前端「鄰近程式碼」的慣例不同）。理由：(a) 官方 pool 的 tsconfig 分層以 `test/` 為邊界，(b) `src/` 會被 `wrangler deploy` 打包，測試檔不該混入
- `vitest.config.ts` 用 **`cloudflareTest()` plugin 從套件根匯入**；本版（0.16.13）**沒有 `defineWorkersConfig`、也沒有 `./config` subpath**，照抄舊版官方範例會 import 失敗
- 用 `import { exports } from "cloudflare:workers"` 搭配 `exports.default.fetch()`；**不要用 `SELF` / `env`**（兩者在 `types/cloudflare-test.d.ts` 皆已標 `@deprecated`）
- 測試檔頂部要 `import "../src/index"`，`src/` 改動時才會自動重跑
- 刻意不開 `globals`：一律顯式 `import { describe, it, expect } from "vitest"`，避免 workerd 全域污染
- ⚠️ 在受限沙箱中跑會噴 `listen EPERM: operation not permitted 127.0.0.1` —— 是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可
- ⚠️ `setCookie` 會對 ISO 字串的 `:` 做 percent-encoding；比對 cookie 值時要先 `decodeURIComponent`

## 路由約定

- 對外 API **一律掛在 `/api/*` 之下**——Next.js 端的 catch-all proxy（`app/api/[[...route]]/route.ts`）只轉發 `/api/*`，掛在其他路徑的端點前端打不到
- **root path（`GET /`）刻意不定義，回 404 是預期行為**，不代表部署失敗。原本的 `Hello Hono!` 樣板已於 change `backend-cleanup-and-tdd-enablement` 移除（驗收：`test/routing.test.ts`）
- 現有測試端點：
  - `GET /api/health` — 部署冒煙測試，驗證 Next.js → service binding → Hono 的通路正常
  - `GET /api/cookie-check` — 驗證 Set-Cookie 能經 service binding 原樣穿透回瀏覽器（呼叫兩次即可確認來回都通；未來 better-auth 依賴此行為）

## 依賴注意

- `better-auth`、`drizzle-orm`（與 `@better-auth/drizzle-adapter`、`drizzle-kit`）、`@hono/zod-validator`、`zod`、`date-fns` 已在 dependencies 但**尚未被 `src/**` 匯入**，為未來會員／揪團功能預先安裝
- **保留而非移除的理由**：`wrangler deploy --dry-run` 實測產物為 gzip **16.91 KiB**，離 CF Free plan 的 3 MiB 上限餘裕極大；體積沒有壓力時，移除的收益低於日後重裝的摩擦
- **複審期限：2026-11-12**。屆時若仍未被 `src/**` 匯入，開 change 移除（決策 D5）
- `@cloudflare/vitest-pool-workers` 與 `vitest` 不屬上述範圍——已於 change `backend-cleanup-and-tdd-enablement` 實際啟用
