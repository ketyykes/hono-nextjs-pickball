## Branch

- **Branch name**: `change/matchmaker-draw-followups`
- **Base branch**: `main`

> ⚠️ **開分支前的前提**：`matchmaker-timed-draw`（M15）MUST 已合併回 `main` **且已 archive**
> ——本 change 修的兩個缺陷都以 `winner` 可為 `"draw"` 為前提，而 `player-stats` 與
> `match-stage` 的主 spec MUST 已是 M15 archive 後的版本，否則本 change 的 MODIFIED 區塊會
> 以過時文字為基礎，archive 時覆寫掉 M15 已合併的內容。
> 撰寫本文件時 `main @ 091c038`（M10～M15 六棒全數合併、verify 與 archive 皆完成）已滿足
> 此前提，tasks.md 的 1.2 會在開工時再機械確認一次。

## Setup commands

> ⚠️ **本批不使用 git worktree**（2026-09-10 使用者指示，M10 起沿用）：一律在主 repo
> `/Users/m2_24gb/Desktop/project/nextjs-pickball` 的 `change/matchmaker-draw-followups`
> 分支上直接施工。**禁止 `git worktree add`、禁止切換分支、禁止 `git merge`。**

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git switch -c change/matchmaker-draw-followups main
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: 2026-09-14 於本分支實測，`pnpm test` 全綠（exit 0）。
  後端（hono-pickball）：4 個測試檔、16 個測試全過。
  前端（nextjs-pickball）：74 個測試檔、763 個測試全過。
  `pnpm install` 後 `git status --porcelain` 僅剩本 change 的 openspec 資料夾（未追蹤，
  非本次變動），`pnpm-lock.yaml` 零變動。
- **Initial commit hash**: `439dd232eeba86435a03667399ab399a84daaf3d`
  （`change/matchmaker-draw-followups` 的起點，其 parent 為 `main` 的 HEAD）。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`
  （**本次不開 worktree**，見上方 Setup commands）。

## Teardown

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git branch -d change/matchmaker-draw-followups
```

> apply 完成時**不要**執行 teardown——change 當下多半尚未合併。Teardown 留給使用者在合併
> 並歸檔之後自行執行。

## 注意事項

- **所有 subagent 共用同一個工作樹**（主 repo），SHALL NOT 各自 `git worktree add`。
  apply 的 Step 0 會用 `Worktree path` 檢查 cwd；路徑必須是絕對路徑。
- **coordinator 在 subagent 施工期間 SHALL NOT 改動 repo 內任何檔案**（含本 change 的
  artifact 與 runbook）——共用單一工作樹時，任何額外改動都會污染 subagent 看到的
  `git status`，使它誤判自己動過不該動的檔案。
- **本 repo 後端測試跑真 workerd**（miniflare），在受限沙箱中會噴
  `listen EPERM 127.0.0.1`——那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，
  放行後重跑即可（見 root `CLAUDE.md`）。`pnpm test` 是 `pnpm -r test`，會同時跑前後端；
  baseline 若只在後端段落失敗且訊息為 EPERM，MUST 先放行再重跑，SHALL NOT 判定為 baseline
  不綠。本 change 不動 `hono-pickball/**`，後端測試預期維持 baseline 數字不變。
- **E2E 指令 MUST 為**
  `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 [檔案...]`。
  **SHALL NOT** 用 `pnpm --filter ./nextjs-pickball test:e2e -- --workers=1`——不帶檔案參數時
  它回報 "No tests found"，帶檔案參數時它會**靜默吞掉** `--workers=1`
  （`matchmaker-runbook-m10-m15.md` 教訓 #20）。
- **E2E 需要前後端兩個 server 同時運行**（`playwright.config.ts` 有兩組 `webServer`）。
  若出現 `Worker "hono-pickball" not found`，先用 `lsof -i :3005 -i :8787` **並且**
  `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對，找出**所有**殘留
  process 後**逐一 `kill <PID>`**——SHALL NOT 用無差別的 `pkill -f`（曾誤殺其他專案的
  Playwright 執行）。確認 port 釋放後再起單一組。**不要**把 `~/.wrangler/registry` 不存在
  當成根因（wrangler 4.99 不靠該路徑做本機服務發現，root `CLAUDE.md` 有 2026-08-17 的實測
  紀錄）。跑完 E2E／preview 後**立刻清掉自己起的 process**。
- **本 change 不得新增任何 npm 相依**，因此 `pnpm install` 之後 `pnpm-lock.yaml` 與
  `package.json` MUST 全程保持未變動（收尾驗證 §5.7 會機械確認 `git diff` 為空）。
- **編輯器／IDE 診斷不可信**（root `CLAUDE.md`、agent-memory 皆有記載），常整批謊報
  `Cannot find module` 之類的錯誤。一律以實跑 `pnpm -r exec tsc --noEmit` 的 exit code
  為準；唯一可信的例外是「單一新檔的單一 import 解不到」——那是 TDD 紅燈，是真的。
- **Stop hook（`.claude/hooks/stop-typecheck.sh`）會在主工作樹 `tsc` 失敗時以 exit 2 擋下
  session 結束**。TDD 的 RED 階段（測試 import 尚不存在的欄位）本來就會讓 `tsc` 紅——
  這是**預期行為，不是要修的東西**，也 SHALL NOT 為了讓 hook 放行而跳過或偽造紅燈
  （`matchmaker-runbook-m10-m15.md` 教訓 #11）。
- 本 change 只動 `nextjs-pickball/lib/matchmaker/player-stats.ts`、
  `nextjs-pickball/lib/matchmaker/labels.ts`、
  `nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx`、對應的四個測試檔，以及
  `openspec/changes/matchmaker-draw-followups/**`；不動 `hono-pickball/**`。但
  `pnpm test`／`pnpm typecheck` 仍為 `-r`（全 workspace），收尾驗證 MUST 跑完整套。
- **無資料遷移**（design Migration Plan）：統計為純計算、不落地，本 change 不需要做
  「舊版讀新資料」之類的跨版本實測，SHALL NOT 為此切換到其他 commit。
