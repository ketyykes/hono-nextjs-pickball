## Branch

- **Branch name**: `change/matchmaker-match-stage-ui`
- **Base branch**: `main`

> ⚠️ **開分支前的前提**：`matchmaker-round-lifecycle`（M4）MUST 已合併回 `main`
> （M3 隨之在內）。本 change 的 worktree 從 `main` 開出，`main` 上沒有回合 capability 時
> baseline 雖然會綠（因為還沒有任何本 change 的測試），但 §7 之後的每一個 task 都會建立在
> 不存在的介面上。見 proposal.md 的「執行相依」。

## Setup commands

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-match-stage-ui -b change/matchmaker-match-stage-ui main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-match-stage-ui
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: 2026-08-24 於本 worktree 執行 `pnpm install` 後 `pnpm test` 全綠——
  `nextjs-pickball` 46 檔 / 358 測試 passed、`hono-pickball` 4 檔 / 16 測試 passed（無 EPERM）。
  另：`pnpm -r exec tsc --noEmit` exit 0、`pnpm --filter ./nextjs-pickball lint` 0 errors / 3 warnings
  （既存於 `hooks/useQuiz.ts`、`hooks/useRosterStore.ts`、`hooks/useScoreboardStore.ts`）
- **Initial commit hash**: `bbda8ff`
- **Worktree path**: `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-match-stage-ui`

## Teardown

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-match-stage-ui
git branch -d change/matchmaker-match-stage-ui
```

> apply 完成時**不要**執行 teardown——change 當下多半尚未合併。Teardown 留給使用者在合併
> 並歸檔之後自行執行（`schema.yaml` 的 Forbidden 明文列出「Tearing down the worktree when
> apply completes」）。

## 注意事項

- **所有 subagent 共用上面這一個 worktree**，SHALL NOT 各自 `git worktree add`。apply 的
  Step 0 會用 `Worktree path` 檢查 cwd；路徑必須是絕對路徑，相對路徑會讓該檢查失效。
- **本 repo 後端測試跑真 workerd**（miniflare），在受限沙箱中會噴
  `listen EPERM 127.0.0.1`——那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，
  放行後重跑即可（見 root `CLAUDE.md`）。`pnpm test` 是 `pnpm -r test`，會同時跑前後端，
  因此 baseline 若只在後端段落失敗且訊息為 EPERM，MUST 先放行再重跑，SHALL NOT 判定為
  baseline 不綠。
- **E2E 需要前後端兩個 server 同時運行**（`playwright.config.ts` 有兩組 `webServer`）。
  若出現 `Worker "hono-pickball" not found`，先用 `lsof -i :3005 -i :8787` 與
  `ps aux | grep -E "wrangler|workerd|next"` 找出**所有**殘留 process 全數 kill，
  確認 port 釋放後再起單一組——**不要**把 `~/.wrangler/registry` 不存在當成根因
  （wrangler 4.99 不靠該路徑做本機服務發現，root `CLAUDE.md` 有 2026-08-17 的實測紀錄）。
- worktree 內的 dev server 埠號與主工作區相同（前端 `:3005`、後端 `:8787`）。**兩邊不可同時
  起 server**，否則會互搶 port 並出現上一條的症狀。
- 本 change 只動 `nextjs-pickball/**` 與 `openspec/changes/matchmaker-match-stage-ui/**`，
  不動 `hono-pickball/**`；但 `pnpm test`／`pnpm typecheck` 仍為 `-r`（全 workspace），
  收尾驗證 MUST 跑完整套而非只跑前端。
