# environment（matchmaker-rating-engine / M3）

本 change 在**獨立 git worktree** 內執行。apply 每次開始前都會讀本檔確認 cwd 就是這裡宣告的 worktree（schema apply Step 0）。

## Branch

- **Branch name**：`change/matchmaker-rating-engine`
- **Base branch**：`main`

> **執行相依：無**。本 change 不依賴任何尚未合併的 change，可直接從 `main` 開出，與 M4～M9 平行進行。
> 但**合併順序**上本 change 必須最先回到 `main`——M4 消費 `updateRatings`、M5 顯示觸界旗標。

## Setup commands

在 repo root（`/Users/m2_24gb/Desktop/project/nextjs-pickball`）依序執行：

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-rating-engine -b change/matchmaker-rating-engine main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-rating-engine
pnpm install
pnpm test
```

## Verification

| 欄位 | 值 |
|---|---|
| **Baseline tests** | 尚未執行——由 apply Step 0 建立 worktree 時執行並回填（格式：`PASS`／`FAIL` + 一行結果摘要，例如 `PASS — 前端 Vitest N passed、後端 Vitest M passed`） |
| **Initial commit hash** | 尚未執行——由 apply Step 0 建立 worktree 時以 `git rev-parse HEAD` 取得並回填 |
| **Worktree path** | `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-rating-engine` |

## Teardown

**work 完成且已合併回 `main` 之後**再執行（apply 完成時**不要**拆掉——change 當下可能還沒合併）：

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-rating-engine
git branch -d change/matchmaker-rating-engine
```

## 注意事項

- **worktree 路徑刻意放在 repo 之外**（`../pickball-worktrees/`）：放在 repo 內會被 Next.js 的檔案監看與 Vitest 的 `include` 掃到，造成同一份測試被跑兩次。
- **`pnpm install` 不可省略**：worktree 是全新的工作目錄，沒有 `node_modules`。root `pnpm-workspace.yaml` 的 `onlyBuiltDependencies: esbuild, workerd` 不可移除，否則 wrangler dev 與 OpenNext build 會失敗。
- **後端測試跑在真正的 workerd runtime**：受限沙箱中會噴 `listen EPERM 127.0.0.1`，那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可（見 root `CLAUDE.md`）。baseline 因此有可能在第一次執行時假性失敗，請放行後重跑再判定。
- **本 change 只動前端**，日常跑單檔用 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts`；但 Step 0 的 baseline 與 Final Review 仍須跑**完整** `pnpm test`（前後端都跑）。
- **所有派工的 subagent 共用這一個 worktree**，禁止各自再開 worktree（schema apply Forbidden 明列）。
- root `.claude/settings.json` 的 Stop hook 會在 session 停止時跑 `pnpm -r exec tsc --noEmit`，失敗以 exit 2 擋下；**該指令不含 `hono-pickball/test/**` 的型別**，但本 change 不動後端，無影響。
