# Environment: matchmaker-player-stats

## Branch

- **Branch name**: `change/matchmaker-player-stats`
- **Base branch**: `main`

> ⚠️ **開分支前的前提**：`matchmaker-stage-gaps`（M10）MUST 已合併回 `main`（依序執行的
> 硬性規定，見 proposal.md 的「執行相依」）。本 change 的 worktree 從 `main` 開出；即使
> M10 不觸及本 change 消費的任一檔案（見 design.md Open Questions 第 1 條），仍必須確認
> 合併已發生才能開分支，SHALL NOT 以「反正沒有檔案衝突」為由跳過這項確認。

## Setup commands

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-stats -b change/matchmaker-player-stats main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-stats
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: 待 apply Step 0 實測回填（於本 worktree 執行 `pnpm install` 後
  `pnpm test`，記錄前端／後端各自的檔案數與測試數、exit code；後端若出現
  `listen EPERM 127.0.0.1` 屬沙箱限制，放行後重跑，不視為 baseline 不綠）。
- **Initial commit hash**: 待 apply Step 0 實測回填（`main` 上 M10 已合併後的 HEAD）。
- **Worktree path**: `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-stats`

## Teardown

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-stats
git branch -d change/matchmaker-player-stats
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
  若出現 `Worker "hono-pickball" not found`，先用 `lsof -i :3005 -i :8787` **並且**
  `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對，找出**所有**
  殘留 process 全數 kill，確認 port 釋放後再起單一組——**不要**把 `~/.wrangler/registry`
  不存在當成根因（wrangler 4.99 不靠該路徑做本機服務發現，root `CLAUDE.md` 有
  2026-08-17 的實測紀錄）。跑完 E2E 或 preview 後 MUST 立刻清掉自己起的 process。
  E2E 一律帶 `--workers=1`。
- worktree 內的 dev server 埠號與主工作區相同（前端 `:3005`、後端 `:8787`）。**兩邊不可同時
  起 server**，否則會互搶 port 並出現上一條的症狀。
- 本 change 只動 `nextjs-pickball/**` 與
  `openspec/changes/matchmaker-player-stats/**`，不動 `hono-pickball/**`；但
  `pnpm test`／`pnpm typecheck` 仍為 `-r`（全 workspace），收尾驗證 MUST 跑完整套而非
  只跑前端。
- **本 change 不得新增任何 npm 相依**，因此 `pnpm install` 之後 `pnpm-lock.yaml` 與
  `package.json` MUST 全程保持未變動（收尾驗證會機械確認 `git diff` 為空）。
- **worktree 內的編輯器／IDE 診斷不可信**（常整批謊報 `Cannot find module` 或大量誤報
  implicit any）。一律以實跑 `pnpm -r exec tsc --noEmit` 的 exit code 為準；唯一可信的
  例外是「單一新檔的單一 import 解不到」——那是 TDD 紅燈，是真的。
