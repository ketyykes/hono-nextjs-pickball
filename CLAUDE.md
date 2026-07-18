# CLAUDE.md（repo root）

匹克球指南專案的 pnpm monorepo。本檔只描述 root 層慣例，workspace 細節見各自的 CLAUDE.md。

## 結構

```
hono-nextjs-pickball/
├─ nextjs-pickball/   ← 前端：Next.js 16 + React 19，經 OpenNext 部署為 Cloudflare Worker
├─ hono-pickball/     ← 後端：Hono API on Cloudflare Workers，所有後端邏輯都放這裡
├─ openspec/          ← OpenSpec 規格與變更（spec-driven 工作流程）
├─ .claude/           ← Claude Code 專案設定（settings.json 含 lint / cf-typegen hooks）
└─ .agents/           ← agent 相關設定
```

## 環境

- Node `22.22.1`：root 與 workspace 各有 `.node-version`，**以 root 為準**
- pnpm `10.17.0`（root `package.json` 的 `packageManager`）
- `pnpm-workspace.yaml` 的 `onlyBuiltDependencies: esbuild, workerd` 不可移除，否則 wrangler dev 與 OpenNext build 會失敗

## 常用指令（在 root 執行）

| 指令 | 行為 |
|---|---|
| `pnpm dev` | 並行啟動前端（:3000）與後端（:8787），dev registry 自動接通 service binding |
| `pnpm dev:web` | 只啟動 Next.js dev server |
| `pnpm dev:api` | 只啟動 wrangler dev |
| `pnpm build` | 兩個 workspace 都跑 build |
| `pnpm lint` | 跑 nextjs-pickball ESLint |
| `pnpm test` | 跑 nextjs-pickball Vitest |
| `pnpm test:e2e` | 跑 nextjs-pickball Playwright E2E |

要在 root 執行特定 workspace 的任意 script，慣例為 `pnpm --filter ./<workspace> <script>`，例如 `pnpm --filter ./nextjs-pickball preview`。

## Cloudflare Workers 部署架構

- 兩個 Worker：`nextjs-pickball`（OpenNext adapter `@opennextjs/cloudflare`）與 `hono-pickball`（wrangler）
- 前端 `wrangler.jsonc` 宣告 service binding `HONO_API → hono-pickball`；`/api/*` 由 Next.js catch-all route 原樣轉發給 Hono，瀏覽器視角為 same-origin
- 部署走 CF Dashboard Workers Builds（Git 整合），兩個 Worker 連同一個 repo、各設 root directory
- **部署順序必須先 hono-pickball 後 nextjs-pickball**，否則 binding 目標不存在會部署失敗
- 整合驗證用 `pnpm --filter ./nextjs-pickball preview`（workerd runtime）

## OpenSpec 慣例

- `openspec/` 位於 repo root；openspec CLI 與 Claude Code session **一律從 repo root 執行**
- 工作流程細節（TDD 規則等）見 `openspec/config.yaml` 與 `nextjs-pickball/CLAUDE.md`

## Workspace 細節

- 前端：[`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)
- 後端：[`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md)
