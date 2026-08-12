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
├─ docs/superpowers/       ← 設計文件與實作計畫（歷史紀錄；正式規格在 openspec/）
├─ .claude/                ← Claude Code 專案設定
├─ .agents/                ← agent 相關設定（唯一來源，不在 workspace 內複製）
├─ AGENTS.md               ← 給所有 coding agent 的入口文件
└─ skills-lock.json        ← 外部 skill 版本鎖定（root 單一份）
```

## 環境

- Node `22.22.1`（見 `.node-version`）
- pnpm `10.17.0`

## 常用指令（在 root 執行）

| 指令 | 行為 |
|---|---|
| `pnpm install` | 一次安裝兩個 workspace 的依賴 |
| `pnpm dev` | 同時起前端（:3005）與後端（:8787） |
| `pnpm dev:web` | 只啟動 Next.js dev server |
| `pnpm dev:api` | 只啟動 wrangler dev |
| `pnpm build` | `pnpm -r build`，兩個 workspace 都真的建置（後端為 `tsc --noEmit && wrangler deploy --dry-run`） |
| `pnpm lint` | 跑 Next.js ESLint |
| `pnpm typecheck` | `pnpm -r exec tsc --noEmit` |
| `pnpm test` | `pnpm -r test`，前端 Vitest + 後端 workerd Vitest |
| `pnpm test:web` / `pnpm test:api` | 只跑單一 workspace 的單元測試 |
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
- 每個 Worker 的 root directory 與 build command 設在 **CF Dashboard → Settings → Builds**，不在 repo 內；`wrangler.jsonc` 的 `name` 必須與 Dashboard 上的 Worker 名稱一致，否則會部署到錯的 Worker

### 部署前手動檢查清單

本專案**不使用 CI**，以下六步在推送前手動跑過（順序刻意由快到慢，讓失敗盡早出現）：

```bash
pnpm lint                                        # 1. ESLint
pnpm -r exec tsc --noEmit                        # 2. 型別檢查（兩個 workspace）
pnpm --filter ./nextjs-pickball test --run       # 3. 前端單元測試
pnpm test:e2e                                    # 4. Playwright E2E（會自動帶起前後端）
pnpm --filter ./nextjs-pickball preview          # 5. workerd runtime 整合驗證
```

6. 確認部署順序：先 hono-pickball，後 nextjs-pickball

## 各 workspace 細節

- 前端規範：見 [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)、[`nextjs-pickball/AGENTS.md`](./nextjs-pickball/AGENTS.md)
- 後端規範：見 [`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md)
