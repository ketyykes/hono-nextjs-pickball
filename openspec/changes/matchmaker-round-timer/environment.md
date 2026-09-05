# Environment: matchmaker-round-timer

## Branch

- **Branch name**: `change/matchmaker-round-timer`
- **Base branch**: `main`

> ⚠️ **本批（M10～M15）不用 git worktree**（使用者 2026-09-03 指示：worktree 在專案目錄外，
> 每個檔案操作都會跳權限提示，見 `matchmaker-runbook-m10-m15.md`「狀態快照」上方的說明）。
> 所有 apply 都在主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball` 內、切到本分支
> 上做，**禁止 `git worktree add`、禁止切換分支、禁止 `git merge`**，所有 commit 皆落在
> 這條分支上。下方「Worktree path」欄位沿用 schema（`tdd-subagent-worktree`）要求的欄位
> 名稱，值即為主 repo 路徑本身，apply Step 0 的 cwd 檢查以此為準——不要因為欄位仍叫
> 「Worktree path」或 `.openspec.yaml` 仍宣告 `tdd-subagent-worktree` 就去建一個實體
> worktree。
>
> **開分支前的前提**：`matchmaker-player-swap`（M13）MUST 已合併回 `main`
> （M10～M12 隨之在內，序列相依）。本 change 的分支從 `main` 開出，`main` 上沒有
> M13 的產出時 baseline 雖然會綠（因為還沒有任何本 change 的測試），但 §4 之後每一個
> task 都會建立在不存在或已過期的 `round.ts`／`useRoundStore.ts`／`page.tsx` 介面上。
> 見 proposal.md 的「執行相依」與 tasks.md 的 1.2。

## Setup commands

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git status --porcelain      # 必須為空，工作樹不乾淨不可開分支
git switch -c change/matchmaker-round-timer main
pnpm install
pnpm test
```

## Verification

- **Baseline tests**：待 apply Step 0（tasks 1.1）實測回填，不在此先行編造數字。
- **Initial commit hash**：待 apply Step 0 實測回填（`main` 上須含 M10～M13 全部已合併
  的產出）。
- **Worktree path**（absolute；本批無實體 worktree，此欄位值為主 repo 路徑本身，
  供 apply Step 0 的 cwd 檢查比對）：
  `/Users/m2_24gb/Desktop/project/nextjs-pickball`

## Teardown

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git switch main
git branch -d change/matchmaker-round-timer
```

> apply 完成時**不要**執行 teardown——change 當下多半尚未合併。Teardown（刪分支）留給
> 使用者在合併並歸檔之後自行執行。本批因為沒有實體 worktree，teardown 只剩刪分支這一步。

## 注意事項

- **本批不建立實體 git worktree**：所有 subagent 都在主 repo 的
  `change/matchmaker-round-timer` 分支上工作，SHALL NOT 各自 `git worktree add`、SHALL NOT
  切換分支、SHALL NOT `git merge`。apply 的 Step 0 除了用「Worktree path」欄位（值為主
  repo 絕對路徑）檢查 cwd，還 MUST 用 `git branch --show-current` 確認目前在
  `change/matchmaker-round-timer` 分支、`git status --porcelain` 為空；路徑必須是絕對
  路徑，相對路徑會讓 cwd 檢查失效。
- **本 repo 後端測試跑真 workerd**（miniflare），在受限沙箱中會噴
  `listen EPERM 127.0.0.1`——那是 miniflare 需要開 localhost server 被擋，**不是設定
  錯誤**，放行後重跑即可（見 root `CLAUDE.md`）。`pnpm test` 是 `pnpm -r test`，會同時
  跑前後端，因此 baseline 若只在後端段落失敗且訊息為 EPERM，MUST 先放行再重跑，SHALL NOT
  判定為 baseline 不綠。本 change 不動 `hono-pickball/**`，後端測試理論上不受影響，但仍
  MUST 實跑確認。
- **E2E 需要前後端兩個 server 同時運行**（`playwright.config.ts` 有兩組 `webServer`）。
  若出現 `Worker "hono-pickball" not found`，先用 `lsof -i :3005 -i :8787` **並且**
  `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對找出**所有**
  殘留 process 全數 kill，確認 port 釋放後再起單一組——**不要**把
  `~/.wrangler/registry` 不存在當成根因（wrangler 4.99 不靠該路徑做本機服務發現，
  root `CLAUDE.md` 有 2026-08-17 的實測紀錄）。
- **本批只有一個工作樹（主 repo 本身）**：前端 `:3005`、後端 `:8787` 埠號固定，
  同一時間**只能有一組**在跑——沒有第二份 worktree 可以互搶，但若上一棒或前一次中斷
  的 session 留下殘留 process，仍會出現同樣的搶 port 症狀，開工與收工前都要查。
- **本 change 新增的 E2E 觸發真實計時流程**：`round-timer.spec.ts` 使用 Playwright
  `page.clock`（`@playwright/test` `^1.59.1`）安裝假時鐘並快轉，理論上不需要真實等待
  10～20 分鐘，但本 repo **尚無任何既有 E2E 使用過這個 API**——apply 階段 §12 實測時
  MUST 確認假時鐘確實驅動 `useRoundTimer.ts` 的 `setInterval` tick 並反映在畫面上；
  不相容時依 execution-plan 的升級條件處理（design Open Questions 2）。
- **提示音的 E2E 驗證改用 `addInitScript` stub `window.AudioContext`**（記錄建構呼叫
  次數），不依賴真實音訊播放與裝置喇叭，理論上與瀏覽器引擎無關，但仍須五個 browser
  project 全數實跑後才能確認（design Open Questions 3）。
- 跑 E2E／`preview` 之前先 `lsof -i :3005 -i :8787` 並 `ps aux | grep -E
  "next-server|wrangler|workerd|playwright"` 查殘留並全數 kill；**跑完立刻清掉自己起的
  process**；跑 E2E 一律帶 `--workers=1`。
- 本 change 只動 `nextjs-pickball/**` 與
  `openspec/changes/matchmaker-round-timer/**`，不動 `hono-pickball/**`；但
  `pnpm test`／`pnpm typecheck` 仍為 `-r`（全 workspace），收尾驗證 MUST 跑完整套而非
  只跑前端。
- **本 change 不得新增任何 npm 相依**（提示音全由瀏覽器內建 Web Audio API 產生），因此
  `pnpm install` 之後 `pnpm-lock.yaml` 與 `package.json` MUST 全程保持未變動（收尾驗證
  13.9 會機械確認 `git diff main --stat -- pnpm-lock.yaml package.json
  nextjs-pickball/package.json hono-pickball/package.json` 為空）。
- **派出 subagent 之後不可結束回合**；脈絡將盡就在派工**之前**乾淨停止，把狀態寫進
  `design.md` 的 `## Open Questions` 後 commit 並回報（沿用 `matchmaker-runbook-m10-m15.md`
  的硬性規定）。
- 主 repo 內的編輯器／IDE 診斷不可信（常整批謊報 `Cannot find module` 之類），一律以
  實跑 `pnpm -r exec tsc --noEmit` 的 exit code 為準。
- **只有一個工作樹**：leader 執行期間 coordinator 不會改動 repo；leader 與其 subagent
  也 SHALL NOT 改動 `matchmaker-runbook-m10-m15.md` 與 `openspec/changes/` 下其他 change
  的目錄。
- **Bash 指令裡禁止 `cd`，一律絕對路徑**（auto mode 遇到 `cd` 後接相對路徑會跳權限
  提示）。
