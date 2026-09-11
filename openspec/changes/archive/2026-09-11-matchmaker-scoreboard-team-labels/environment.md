# Environment: matchmaker-scoreboard-team-labels

## Branch

- **Branch name**: `change/matchmaker-scoreboard-team-labels`
- **Base branch**: `main`

> ⚠️ **開分支前的前提**：`matchmaker-player-stats`（M11）MUST 已合併回 `main`。本 change 的
> 分支從 `main` 開出，`main` 上沒有 M11 的產物時，apply 的 §0 MUST 停止並回報，
> SHALL NOT 在本 change 內補做 M11。見 proposal.md 的「執行相依」與 design.md Open Questions
> 第 1 條（apply §0 MUST 以合併後的 `main` 重新對齊本 change 的兩處 MODIFIED delta）。

## Setup commands

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git status --porcelain            # 必須為空才可開分支
git switch -c change/matchmaker-scoreboard-team-labels main
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: 全綠。`pnpm test`（2026-09-06 實測）：`nextjs-pickball` 70 test files／
  664 tests 全數通過；`hono-pickball` 4 test files／16 tests 全數通過（未出現 EPERM，
  workerd 正常啟動）。`pnpm install` 後 `git status --porcelain` 為空，
  `pnpm-lock.yaml`／`package.json` 零變動。
- **Initial commit hash**: `b7541af`（`main` 與本分支的共同起點；`git log --oneline main..HEAD`
  在 apply 開工前為空）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`
  （主 repo；本批不用 worktree，schema Step 0 的 cwd 檢查以此路徑為準）

## Teardown

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git switch main
git branch -d change/matchmaker-scoreboard-team-labels
```

> apply 完成時**不要**執行 teardown——change 當下多半尚未合併，留給 coordinator 合併後執行。
> （`schema.yaml` 的 Forbidden 明文列出「Tearing down the worktree when apply completes」；
> 本批不建 worktree，這裡的 teardown 對應的是上面的分支切回與刪除，精神相同：合併前不得執行。）

## 注意事項

- **所有 subagent 都在主 repo 的 `change/matchmaker-scoreboard-team-labels` 分支上工作**；
  SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`。apply 的 Step 0
  除了用 `Worktree path` 檢查 cwd，還 MUST 用 `git branch --show-current` 確認在該分支、
  `git status --porcelain` 為空。
- **本 repo 後端測試跑真 workerd**（miniflare），在受限沙箱中會噴
  `listen EPERM 127.0.0.1`——那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，
  放行後重跑即可（見 root `CLAUDE.md`）。`pnpm test` 是 `pnpm -r test`，會同時跑前後端，
  因此 baseline 若只在後端段落失敗且訊息為 EPERM，MUST 先放行再重跑，SHALL NOT 判定為
  baseline 不綠。
- **E2E 需要前後端兩個 server 同時運行**（`playwright.config.ts` 有兩組 `webServer`）。
  跑 E2E／preview 前 MUST 先 `lsof -i :3005 -i :8787` **並且**
  `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對殘留 process 並全數
  kill，確認 port 釋放後再起單一組；跑完立刻清掉自己起的 process。若出現
  `Worker "hono-pickball" not found`，**不要**把 `~/.wrangler/registry` 不存在當成根因
  （wrangler 4.99 不靠該路徑做本機服務發現，root `CLAUDE.md` 有 2026-08-17 的實測紀錄）。
- **只有一個工作樹**：跑 E2E／preview 前後都要用 `lsof` 與 `ps aux` 交叉核對並清掉殘留
  process——沒有第二個 worktree 可以互相隔離，殘留 process 會直接搶主工作樹的 port。
- E2E **一律帶 `--workers=1`**。預設併發下本機不穩定，`matchmaker-visual-export`（M9）與
  `matchmaker-scoreboard-binding`（M6）的 runbook 皆記錄過根因為 Turbopack dev 的延遲 chunk
  競態，非本 change 特有。
- 本 change 只動 `nextjs-pickball/**` 與
  `openspec/changes/matchmaker-scoreboard-team-labels/**`，不動 `hono-pickball/**`；但
  `pnpm test`／`pnpm typecheck` 仍為 `-r`（全 workspace），收尾驗證 MUST 跑完整套而非只跑
  前端。
- **本 change 不得新增任何 npm 相依**，因此 `pnpm install` 之後 `pnpm-lock.yaml` 與
  `package.json` MUST 全程保持未變動（收尾驗證會機械確認 `git diff` 為空）。
- 編輯器／IDE 診斷不可信（常整批謊報 `Cannot find module` 之類）。一律以實跑
  `pnpm -r exec tsc --noEmit` 的 exit code 為準；唯一可信的例外是「單一新檔的單一 import
  解不到」——那是 TDD 紅燈，是真的。
- **只有一個工作樹**：leader 執行期間 coordinator 不會改動 repo；leader 與其 subagent 也
  SHALL NOT 改動 `matchmaker-runbook-m10-m15.md` 與 `openspec/changes/` 下其他 change 的目錄。
- **Bash 指令裡禁止 `cd`，一律絕對路徑**（auto mode 遇到 `cd` 後接相對路徑會跳權限提示）。
