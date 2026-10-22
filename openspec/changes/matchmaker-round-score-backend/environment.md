# Environment: matchmaker-round-score-backend

> **本批（B1～B9）不使用 git worktree**——沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳權限提示），
> 見 `backend-scoring-runbook-b1-b9.md`「執行模式」。schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；
> apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。SHALL NOT `git worktree add`、SHALL NOT 切換分支、
> SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/matchmaker-round-score-backend`
- **Base branch**: `main`

> 開分支前提：**B4、B5、B6 皆已合併回 `main`、其分支已刪除、且已 archive**（主 spec 已含 `user-data-sync` 的多筆契約、`useRemoteRosterStore` 與 B6 的 `player-roster`／`data-transfer` 增修）；
> `main` 上沒有其他 `change/*` 分支。若 B6 未合併，SHALL NOT 開分支，回報 coordinator。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/matchmaker-round-score-backend main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
```

## Verification

- **Baseline tests**：（apply Step 0／tasks 1.1 回填三個 workspace 的檔數／測試數；B6 合併紀錄為準）
- **Initial commit hash**：（apply Step 0 回填：`change/matchmaker-round-score-backend` 分出時的 `main` HEAD）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/matchmaker-round-score-backend
```

## 注意事項

- 後端測試跑真 workerd；受限沙箱中的 `listen EPERM 127.0.0.1` 是環境限制，放行後重跑再判定。
- `user-data` E2E 與驗收 C6 需要 `hono-pickball/.dev.vars` 齊備；leader 開工前向 coordinator 確認；**帳密與 secret 不得寫進任何 commit**。skip 不算通過。
- 本 change 新增 migration `0003`，切到分支後要跑 `db:migrate:local`。
- **過渡期**（design Risks 第 2 條）：登入時歷史寫入雲端但歷史頁與統計頁仍讀本機；手動測試請用乾淨的瀏覽器設定檔。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**；所有 `wrangler d1` 指令 MUST 帶 `--local`；`wrangler` 若提示登入，一律中止並回報。
- 編輯器診斷不可信，以 `tsc` exit code 為準；Stop hook 不檢查 `hono-pickball/test/**` 型別（runbook R4），合併前 MUST 跑 `pnpm --filter ./hono-pickball typecheck`。
