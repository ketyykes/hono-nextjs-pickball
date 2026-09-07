## Branch

- **Branch name**: `change/matchmaker-player-swap`
- **Base branch**: `main`

> ⚠️ **開分支前的前提**：`matchmaker-scoreboard-team-labels`（M12）MUST 已合併回 `main`
> （M10、M11 隨之在內，序列相依）。本 change 的 worktree 從 `main` 開出，`main` 上若尚無
> M12 合併紀錄，baseline 雖然會綠（因為還沒有任何本 change 的測試），但 §4 之後的每一個
> task 都會建立在 M12 修改前的 `CourtCard.tsx`／`MatchStage.tsx` 之上，與實際內容脫節。
> 見 proposal.md 的「執行相依」與 tasks.md 的 1.2。

## Setup commands

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-swap -b change/matchmaker-player-swap main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-swap
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: 2026-09-06 於 `change/matchmaker-player-swap` 實測 `pnpm test` 全綠——
  `nextjs-pickball` 70 個測試檔／672 個測試通過，`hono-pickball` 4 個測試檔／16 個測試通過
  （後端未出現 `listen EPERM 127.0.0.1`，不需放行重跑）。`pnpm install` 為 `Already up to date`，
  `git status --porcelain` 於安裝後仍為空（lockfile 零變動）。
- **Initial commit hash**: `b69a418`（本分支開工前的 HEAD，其 parent 鏈已含 M10／M11／M12；
  M12 的合併 commit 為 `ea71e08`）。
- **Worktree path**: `/Users/m2_24gb/Desktop/project/nextjs-pickball`（**主 repo**）。

> ⚠️ **本批不使用 git worktree**（apply 階段由 coordinator 裁決，覆寫上方 Setup commands
> 的原始寫法）：M11、M13 兩次派工都曾因 `cd <path> && <相對路徑指令>` 讓背景 agent 卡在
> 無法回答的權限提示而永久停擺。本批改為全程在主 repo 的 `change/matchmaker-player-swap`
> 分支上作業，所有指令**一律禁止出現 `cd`**，需要指定目錄時改用完整絕對路徑參數或
> `pnpm --filter ./<workspace> <script>`（於 repo root 執行）。因此上方 Teardown 的
> `git worktree remove` 不適用，合併後只需刪分支。

## Teardown

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-swap
git branch -d change/matchmaker-player-swap
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
  `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 找出**所有**殘留 process
  全數 kill，確認 port 釋放後再起單一組——**不要**把 `~/.wrangler/registry` 不存在當成
  根因（wrangler 4.99 不靠該路徑做本機服務發現，root `CLAUDE.md` 有 2026-08-17 的實測
  紀錄）。跑完立刻清掉自己起的 process。
- worktree 內的 dev server 埠號與主工作區相同（前端 `:3005`、後端 `:8787`）。**兩邊不可同時
  起 server**，否則會互搶 port 並出現上一條的症狀。
- E2E **一律帶 `--workers=1`**：預設併發下本機不穩定，先前 milestone 已多次實測併發下的
  失敗集合不固定。
- 本 change 只動 `nextjs-pickball/**` 與 `openspec/changes/matchmaker-player-swap/**`，
  不動 `hono-pickball/**`；但 `pnpm test`／`pnpm typecheck` 仍為 `-r`（全 workspace），
  收尾驗證 MUST 跑完整套而非只跑前端。
- **本 change 不得新增任何 npm 相依**，因此 `pnpm install` 之後 `pnpm-lock.yaml` 與
  `package.json` MUST 全程保持未變動（收尾驗證 7.6 會機械確認）。
- **worktree 內的編輯器／IDE 診斷不可信**（跨 milestone 累積的教訓，記於
  `matchmaker-runbook.md`）：常整批謊報 `Cannot find module 'react'` 之類。一律以實跑
  `pnpm -r exec tsc --noEmit` 的 exit code 為準；唯一可信的例外是「單一新檔的單一 import
  解不到」——那是 TDD 紅燈，是真的。
