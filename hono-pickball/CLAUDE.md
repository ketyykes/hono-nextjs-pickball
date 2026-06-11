# CLAUDE.md

本檔描述 **hono-pickball workspace**（monorepo 後端）：Hono 4 API on Cloudflare Workers。**所有後端邏輯（含未來的 better-auth、drizzle、D1）都放這裡**，不要寫進前端的 API route。

以下指令除特別標註外皆假設 cwd 在 `hono-pickball/`；從 repo root 執行請用 `pnpm --filter ./hono-pickball <script>`。

## 常用指令

- `pnpm dev` — wrangler dev（http://localhost:8787）
- `pnpm run deploy` — `wrangler deploy --minify` 手動部署（注意：`deploy` 與 pnpm 內建指令撞名，必須加 `run`）；**正式部署走 CF Dashboard Workers Builds（Git 整合），平常不手動 deploy**
- `pnpm cf-typegen` — 重新產生 `CloudflareBindings` 型別（`worker-configuration.d.ts`）；改 `wrangler.jsonc` 後必須重跑，root `.claude/settings.json` 已有 PostToolUse hook 自動觸發

## wrangler.jsonc 要點

- `name: "hono-pickball"` **必須與 CF Dashboard 的 Worker 名稱一致**，否則 Workers Builds 會失敗
- `compatibility_flags: ["nodejs_compat"]` 已開啟（better-auth / drizzle 依賴 node:crypto 等模組）
- D1 binding 暫時移除（未來會員／揪團功能時再建）；重新加入時務必用 `wrangler d1 create` 產生的**真實 UUID** 填 `database_id`，placeholder 值會讓遠端部署直接失敗

## 路由約定

- 對外 API **一律掛在 `/api/*` 之下**——Next.js 端的 catch-all proxy（`app/api/[[...route]]/route.ts`）只轉發 `/api/*`，掛在其他路徑的端點前端打不到
- 現有測試端點：
  - `GET /api/health` — 部署冒煙測試，驗證 Next.js → service binding → Hono 的通路正常
  - `GET /api/cookie-check` — 驗證 Set-Cookie 能經 service binding 原樣穿透回瀏覽器（呼叫兩次即可確認來回都通；未來 better-auth 依賴此行為）

## 依賴注意

- `better-auth`、`drizzle-orm`（與 `@better-auth/drizzle-adapter`、`drizzle-kit`）已在 dependencies 但**尚未使用**，為未來會員功能預先安裝
