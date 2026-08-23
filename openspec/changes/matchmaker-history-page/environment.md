## Branch

- **Branch name**: `change/matchmaker-history-page`
- **Base branch**: `main`

> ⚠️ **開 worktree 前必須確認 M5 已合併回 `main`**（見 [proposal.md](./proposal.md) 的「執行相依」）。
> M5 相依 M4，因此 M5 在 `main` 上時 M4 必然也在。若 `main` 上還沒有歷史紀錄的 reader 與
> matchmaker 區段導覽，本 change 的 §3～§5 無法實作，**不要先開 worktree 硬做**。

## Setup commands

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-history-page -b change/matchmaker-history-page main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-history-page
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: 尚未執行——由 apply Step 0 建立 worktree 時執行並回填（屆時填 PASS / FAIL 與一行結果摘要，例如 `PASS：hono-pickball 4 檔 16 tests、nextjs-pickball 39 檔 274 tests 全綠`）
- **Initial commit hash**: 尚未執行——由 apply Step 0 建立 worktree 時執行並回填（`git rev-parse HEAD` 的 SHA）
- **Worktree path**: `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-history-page`

## Teardown

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-history-page
git branch -d change/matchmaker-history-page
```

> apply 完成時**不要**執行 teardown——change 可能尚未合併。teardown 留給使用者在合併後自行執行。

## 注意事項

- 所有被派工的 subagent 共用**同一個** worktree，SHALL NOT 各自 `git worktree add`（見 [execution-plan.md](./execution-plan.md) 的 Per-task contract 第 5 點）。
- 本 repo 後端測試跑在真正的 **workerd** runtime，在受限沙箱中會噴 `listen EPERM 127.0.0.1`，那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可（見 root `CLAUDE.md`）。
- 單檔測試指令的 **`--run` 前不可加 `--`**：`pnpm --filter ./nextjs-pickball test --run lib/matchmaker/history-range.test.ts`。加了 `--` 會讓 vitest 收不到路徑而跑完整套，RED 的紅燈證據會被既有綠燈淹沒。
- E2E 的 `webServer` 有兩組（先起 `hono-pickball` :8787、再起 Next.js :3005）。若遇到 `Worker "hono-pickball" not found`，先用 `lsof -i :3005 -i :8787` 與 `ps aux | grep -E "wrangler|workerd|next"` 找出**所有**殘留 process 全數 kill，確認 port 釋放後再起單一組；**不要**把 `~/.wrangler/registry` 目錄不存在當成根因（root `CLAUDE.md` 已記錄此誤判）。
- openspec CLI 與 `pnpm` 指令一律從 **worktree 的根目錄**執行（該目錄即為 repo root 的鏡像），並建議帶 `DO_NOT_TRACK=1`。
- 本 change 的 worktree 內 **SHALL NOT** 修改 `openspec/specs/` 下的主 spec，也不得改動其他 change 的檔案。
