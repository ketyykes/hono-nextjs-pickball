# Environment: round-put-completed-immutable

> **本 change 不使用 git worktree**，沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳出權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**，apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/round-put-completed-immutable`
- **Base branch**: `main`

> 開分支的前提：
> - `main` 工作樹乾淨。
> - 沒有其他未合併的 `change/*` 分支正在同一個 repo 進行 apply。本 change 會改 `hono-pickball/src/matchmaker/round-repository.ts`、`test/matchmaker-round.test.ts` 與 `hono-pickball/CLAUDE.md`，與其他後端 change 衝突的機率不低。
> - 若另一個 change 也 MODIFIED `round-lifecycle`「回合與送出比分的雲端 API」，**後歸檔者 MUST 以先歸檔者合併後的主 spec 為底重做 MODIFIED**（tasks 1.2）。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/round-put-completed-immutable main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/heavy-lock.sh acquire nextjspickball "round-put-completed-immutable baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test:api
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**：（apply §1.1 回填。內容：`pnpm test:api` 的檔數與 it 數、兩段 typecheck、`pnpm --filter ./hono-pickball build`、E2E `--project=user-data` 的 passed／skipped 數、執行時的 load）
- **Initial commit hash**：（apply §1.1 回填；propose 提交時 `main` 的 HEAD 見本 change 的 propose commit）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/round-put-completed-immutable
```

## 注意事項

- 後端測試跑在真的 workerd 上；受限沙箱中出現的 `listen EPERM 127.0.0.1` 是環境限制，放行後重跑再判定。
- **重負載一律雙鎖**（E2E、全套 vitest、build）：
  1. `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`
  2. `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>`
  3. `/tmp/heavy-lock.sh release nextjspickball`

  SHALL NOT 在 heavy.py 內再包 heavy.py。單檔測試（`pnpm --filter ./hono-pickball test --run test/matchmaker-round.test.ts`）免鎖。
- **本 change 沒有 migration**；`db:migrate:local` 只用來確認本機 D1 已套用到最新（user-data E2E 的清空 helper 依 `USER_DATA_TABLES` 逐表清空）。
- user-data E2E 需要 `hono-pickball/.dev.vars` 齊備，leader 開工前先向 coordinator 確認。**帳密與 secret 不得寫進任何 commit**。skip 不算通過。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` 與 `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、`d1 create`、`--remote`、`secret put`）。所有 `wrangler d1` 指令 MUST 帶 `--local`；`wrangler` 若提示登入，一律中止並回報。只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` 的 exit code 為準。Stop hook 不檢查 `hono-pickball/test/**` 的型別，合併前 MUST 跑 `pnpm --filter ./hono-pickball typecheck`。
