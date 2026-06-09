# hono-nextjs-pickball

匹克球指南專案的 monorepo，使用 pnpm workspaces 管理前後端。

## 結構

```
hono-nextjs-pickball/
├─ nextjs-pickball/   ← 前端：Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
└─ hono-pickball/     ← 後端：Hono on Cloudflare Workers + D1
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

## 各 workspace 細節

- 前端規範：見 [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)、[`nextjs-pickball/AGENTS.md`](./nextjs-pickball/AGENTS.md)
- 後端規範：見 [`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md)（待補）
