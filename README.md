# hono-nextjs-pickball

匹克球指南專案的 monorepo，使用 pnpm workspaces 管理前後端。

## 結構

```
hono-nextjs-pickball/
├─ nextjs-pickball/        ← 前端：Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
│  └─ wrangler.jsonc       ← Worker「nextjs-pickball」設定（OpenNext + service binding）
├─ hono-pickball/          ← 後端：Hono on Cloudflare Workers
│  └─ wrangler.jsonc       ← Worker「hono-pickball」設定
├─ openspec/               ← OpenSpec 規格與變更（CLI 從 root 執行）
├─ .claude/                ← Claude Code 專案設定
└─ .agents/                ← agent 相關設定
```

## 環境

- Node `22.22.1`（見 `.node-version`）
- pnpm `10.17.0`

## 常用指令（在 root 執行）

| 指令 | 行為 |
|---|---|
| `pnpm install` | 一次安裝兩個 workspace 的依賴 |
| `pnpm dev` | 同時起前端（:3000）與後端（:8787） |
| `pnpm dev:web` | 只啟動 Next.js dev server |
| `pnpm dev:api` | 只啟動 wrangler dev |
| `pnpm build` | 兩個 workspace 都跑 build |
| `pnpm lint` | 跑 Next.js ESLint |
| `pnpm test` | 跑 nextjs-pickball Vitest |
| `pnpm test:e2e` | 跑 Playwright E2E（5 個 browser project） |
| `pnpm --filter ./nextjs-pickball preview` | OpenNext build 後在本機 workerd runtime 驗證 |
| `pnpm --filter ./<workspace> cf-typegen` | 改 `wrangler.jsonc` 後重新產生 Cloudflare binding 型別 |

## 部署

部署目標為 Cloudflare Workers，經 CF Dashboard 的 **Workers Builds**（Git 整合）自動部署；兩個 Worker 連同一個 repo、各設 root directory：

| Worker 名稱 | 來源 | 說明 |
|---|---|---|
| `hono-pickball` | `hono-pickball/` | Hono API（wrangler） |
| `nextjs-pickball` | `nextjs-pickball/` | Next.js（@opennextjs/cloudflare），service binding `HONO_API` 指向 hono-pickball |

- 部署順序：**先 hono-pickball、後 nextjs-pickball**（service binding 目標必須先存在）
- 部署後 URL 形式：`<worker>.<subdomain>.workers.dev`

## 各 workspace 細節

- 前端規範：見 [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)、[`nextjs-pickball/AGENTS.md`](./nextjs-pickball/AGENTS.md)
- 後端規範：見 [`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md)
