# Environment: user-data-account-guard

> **本批（B1～B9，含本 change B7.5）不使用 git worktree**——沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳權限提示），
> 見 `backend-scoring-runbook-b1-b9.md`「執行模式」。schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；
> apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/user-data-account-guard`
- **Base branch**: `main`

> 開分支前提：**B7 `matchmaker-round-score-backend` 已合併回 `main`（`a94a741`）、其分支已刪除、且已 archive（`5cdf647`）**；本 change 的 propose commit 已在 `main`；
> `main` 上沒有其他 `change/*` 分支。B8／B9 尚未開工（本 change 在兩者之前，Q11）。前提不成立時 SHALL NOT 開分支，回報 coordinator。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/user-data-account-guard main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:seed:local
/tmp/heavy-lock.sh acquire nextjspickball "user-data-account-guard baseline"
uptime                                                                       # load average < 20 才繼續
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**（tasks 1.1 實測，2026-10-24，取鎖時 load 2.36）：前端 100 檔／985、後端 21 檔／149、核心 4 檔／11，全綠；`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm --filter ./packages/pickball-core typecheck` 皆 exit 0；`pnpm lint` 0 errors／3 warnings；`playwright test --list`：chromium／firefox／mobile-chrome／webkit／mobile-safari 各 145 tests／17 files，user-data 27 tests／3 files；`pnpm install` 後 lockfile 零變動；`db:migrate:local`（無待套用）、`db:seed:local` 成功。
  參考值（B7 合併紀錄，runbook）：前端 100 檔／985、後端 21 檔／149、核心 4 檔／11；lint 0 errors／3 warnings。
- **Initial commit hash**：`e8d025b`
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/user-data-account-guard
```

## 注意事項

- **共用高負載鎖**（runbook 教訓 #15）：E2E、eslint（`pnpm lint`）、全套 vitest（`pnpm test`、`pnpm test:web` 等）、OpenNext／wrangler build 前一律
  `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，跑完 `/tmp/heavy-lock.sh release nextjspickball`；取鎖後仍要 `uptime` load average < 20，否則等待。單檔測試除外。
  `/tmp/heavy-lock.sh` 在 /tmp，重開機後若不存在，停止並回報 coordinator（不要自行重建）。
- **E2E 驗收指令**（runbook「每開一個新 change 的標準流程」第 4 步，含 `user-data` project）：
  ```bash
  for p in chromium firefox mobile-chrome user-data; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p; done
  for p in webkit mobile-safari; do for i in 1 2 3; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p --shard=$i/3; done; done
  ```
  不要用 `pnpm test:e2e --`（教訓 #6）；webkit `quiz.spec.ts:49` 的 navbar 點擊偶發不導覽是 B7 記錄的既有競態，以隔離重跑判讀並上報，不得自行判定為雜訊。
- **第二測試帳號**：本 change 讓 `db:seed:local` 另建衍生帳號（`TEST_ACCOUNT_EMAIL` 的 plus addressing、同密碼）；切到分支並完成 §4 後 MUST 重跑一次 `db:seed:local`
  （E2E globalSetup 也會自動執行）。**不新增、不修改 `hono-pickball/.dev.vars`**，也不得把其中的值寫進任何紀錄。
- 後端測試跑真 workerd；受限沙箱中的 `listen EPERM 127.0.0.1` 是環境限制，放行後重跑再判定。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備；leader 開工前向 coordinator 確認；**帳密與 secret 不得寫進任何 commit**。skip 不算通過。
- §5（守衛上線）到 §8（前端帶標頭）之間，既有 `user-data` E2E 必紅，這段期間不跑也不判讀（execution-plan）。
- 手動測試（C9 WebKit）與 dev server：前端 :3005、後端 :8787；前後清殘留 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep`，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**；所有 `wrangler d1` 指令 MUST 帶 `--local --env local`；`wrangler` 若提示登入，一律中止並回報。
- 編輯器診斷不可信，以 `tsc` exit code 為準；Stop hook 不檢查 `hono-pickball/test/**` 與 `packages/pickball-core/test/**` 型別，合併前 MUST 跑兩者的 `typecheck`。
- 本 change **無 migration**、無新相依；`git diff main --stat -- pnpm-lock.yaml '**/package.json'` MUST 為空。
