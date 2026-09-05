## Branch

- **Branch name**: `change/matchmaker-timed-draw`
- **Base branch**: `main`

> ⚠️ **開分支前的前提**：`matchmaker-round-timer`（M14）MUST 已合併回 `main`（M10～M13 隨之
> 在內——M10～M14 依序執行、逐棒合併，前一棒必須已合併才可開下一棒的分支）。本 change 的
> worktree 從 `main` 開出，`main` 上沒有 M14 引入的計時判定條件時，baseline 雖然會綠
> （因為還沒有任何本 change 的測試），但 §1 之後的每一個 task 都會建立在不存在的欄位上。
> 見 proposal.md 的「執行相依」與 design.md 的 Open Questions 第 1 條、tasks.md 的 1.2。
>
> 本文件撰寫時（propose 階段）`main @ 3fa2d22`（M9 archive 完成後的狀態）**尚無 M10～M14
> 任何一棒**，故下方 Setup commands 為**標準指令模板**，實際執行時機是 M14 合併之後；
> apply 開工前 MUST 先確認 `main` 的實際 HEAD 已包含 M10～M14。

## Setup commands

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-timed-draw -b change/matchmaker-timed-draw main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-timed-draw
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: 待 apply Step 0 實測回填（本文件為 propose 階段產出，M10～M14 尚未
  合併，無法在此時取得真實 baseline 數字；SHALL NOT 沿用 M9 的舊數字或憑空估計）。
- **Initial commit hash**: 待 apply Step 0 實測回填（MUST 為 `main` 上已包含 M10～M14 全部
  七棒＋本批次前五棒的 commit，而非本文件撰寫時的 `3fa2d22`）。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-timed-draw`

## Teardown

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-timed-draw
git branch -d change/matchmaker-timed-draw
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
  baseline 不綠。本 change 不動 `hono-pickball/**`，後端測試預期維持 baseline 數字不變。
- **E2E 需要前後端兩個 server 同時運行**（`playwright.config.ts` 有兩組 `webServer`）。
  若出現 `Worker "hono-pickball" not found`，先用 `lsof -i :3005 -i :8787` **並且**
  `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對，找出**所有**
  殘留 process 全數 kill，確認 port 釋放後再起單一組——**不要**把 `~/.wrangler/registry`
  不存在當成根因（wrangler 4.99 不靠該路徑做本機服務發現，root `CLAUDE.md` 有 2026-08-17
  的實測紀錄）。跑完 E2E／preview 後**立刻清掉自己起的 process**。E2E 一律帶 `--workers=1`。
- worktree 內的 dev server 埠號與主工作區相同（前端 `:3005`、後端 `:8787`）。**兩邊不可同時
  起 server**，否則會互搶 port 並出現上一條的症狀。
- **本 change 不得新增任何 npm 相依**，因此 `pnpm install` 之後 `pnpm-lock.yaml` 與
  `package.json` MUST 全程保持未變動（收尾驗證會機械確認 `git diff` 為空）。
- **worktree 內的編輯器／IDE 診斷不可信**（root `CLAUDE.md`、agent-memory 皆有記載）。
  常整批謊報 `Cannot find module` 之類的錯誤。一律以實跑
  `pnpm -r exec tsc --noEmit` 的 exit code 為準；唯一可信的例外是「單一新檔的單一 import
  解不到」——那是 TDD 紅燈，是真的。
- 本 change 只動 `nextjs-pickball/lib/matchmaker/**`、
  `nextjs-pickball/components/matchmaker/**` 與
  `openspec/changes/matchmaker-timed-draw/**`，不動 `hono-pickball/**`；但
  `pnpm test`／`pnpm typecheck` 仍為 `-r`（全 workspace），收尾驗證 MUST 跑完整套而非只跑
  前端。
- Migration Plan 的「舊版讀新資料」實測（design.md）需要暫時切換到**不含本 change**的
  commit 執行 `pnpm dev:web` 或等效手段——執行完畢後 MUST 切回本 worktree 的分支，
  SHALL NOT 讓 worktree 停留在錯誤的 commit 上繼續後續 task。
