# CLAUDE.md（repo root）

匹克球指南專案的 pnpm monorepo。本檔只描述 root 層慣例，workspace 細節見各自的 CLAUDE.md。

## 結構

```
hono-nextjs-pickball/
├─ nextjs-pickball/   ← 前端：Next.js 16 + React 19，經 OpenNext 部署為 Cloudflare Worker
├─ hono-pickball/     ← 後端：Hono API on Cloudflare Workers，所有後端邏輯都放這裡
├─ openspec/          ← OpenSpec 規格與變更（spec-driven 工作流程）
├─ docs/              ← 設計文件與實作計畫（superpowers/）；已被 openspec 取代者於頁首標註
├─ .claude/           ← Claude Code 專案設定（settings.json 含 lint / cf-typegen hooks）
├─ .agents/           ← agent 相關設定（**唯一來源，不在 workspace 內複製**）
├─ AGENTS.md          ← 給所有 coding agent 的入口文件
└─ skills-lock.json   ← 外部 skill 的版本鎖定（root 單一份）
```

> `docs/` 與 `openspec/` 的分工：`openspec/specs/` 是**正式規格**，
> `docs/superpowers/` 是設計脈絡與實作計畫的歷史紀錄。
> 任何行為變更以 openspec change 為準，不要在 `docs/` 下新增平行規格。

## 環境

- Node `22.22.1`：root 與 workspace 各有 `.node-version`，**以 root 為準**
- pnpm `10.17.0`（root `package.json` 的 `packageManager`）
- `pnpm-workspace.yaml` 的 `onlyBuiltDependencies: esbuild, workerd` 不可移除，否則 wrangler dev 與 OpenNext build 會失敗

## 常用指令（在 root 執行）

| 指令 | 行為 |
|---|---|
| `pnpm dev` | 並行啟動前端（:3005）與後端（:8787），dev registry 自動接通 service binding |
| `pnpm dev:web` | 只啟動 Next.js dev server |
| `pnpm dev:api` | 只啟動 wrangler dev |
| `pnpm build` | `pnpm -r build`，兩個 workspace 都真的建置（後端為 `tsc --noEmit && wrangler deploy --dry-run`） |
| `pnpm lint` | 跑 nextjs-pickball ESLint |
| `pnpm typecheck` | `pnpm -r exec tsc --noEmit` |
| `pnpm test` | `pnpm -r test`：前端 Vitest（happy-dom）+ 後端 Vitest（workerd runtime） |
| `pnpm test:web` / `pnpm test:api` | 只跑單一 workspace 的單元測試 |
| `pnpm test:e2e` | 跑 nextjs-pickball Playwright E2E（webServer 會自動帶起前後端兩個 server） |

要在 root 執行特定 workspace 的任意 script，慣例為 `pnpm --filter ./<workspace> <script>`，例如 `pnpm --filter ./nextjs-pickball preview`。

執行單一測試檔用 `pnpm --filter ./<workspace> test --run <path>`。**`--run` 前不可加 `--`** —— `test -- --run <path>` 會讓 vitest 收不到路徑而跑完整套，TDD 的紅燈證據會被既有綠燈淹沒。

## Cloudflare Workers 部署架構

- 兩個 Worker：`nextjs-pickball`（OpenNext adapter `@opennextjs/cloudflare`）與 `hono-pickball`（wrangler）
- 前端 `wrangler.jsonc` 宣告 service binding `HONO_API → hono-pickball`；`/api/*` 由 Next.js catch-all route 原樣轉發給 Hono，瀏覽器視角為 same-origin
- 部署走 CF Dashboard Workers Builds（Git 整合），兩個 Worker 連同一個 repo、各設 root directory
- **部署順序必須先 hono-pickball 後 nextjs-pickball**，否則 binding 目標不存在會部署失敗
- 整合驗證用 `pnpm --filter ./nextjs-pickball preview`（workerd runtime）

### CF Dashboard 側設定（不在 repo 內）

以下設定只存在於 CF Dashboard，git 無法追蹤，改動時需人工同步：

- 每個 Worker 的 **root directory** 與 **build command**：Dashboard → 該 Worker → Settings → Builds
- `wrangler.jsonc` 的 `name` **必須與 Dashboard 上的 Worker 名稱一致**，否則會部署到錯的 Worker
- 新增 `build` script 到某個 workspace 時要留意：Workers Builds 可能因此改用不同的 build command

### 部署前檢查

本專案不使用 CI，改以 root `README.md` 的「部署前手動檢查清單」六步把關（lint → tsc → unit → e2e → preview → 部署順序）。推送前請實際跑過。

## OpenSpec 慣例

- `openspec/` 位於 repo root；openspec CLI 與 Claude Code session **一律從 repo root 執行**
- 工作流程細節（TDD 規則等）見 `openspec/config.yaml` 與 `nextjs-pickball/CLAUDE.md`

## Workspace 細節

- 前端：[`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)
- 後端：[`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md)
