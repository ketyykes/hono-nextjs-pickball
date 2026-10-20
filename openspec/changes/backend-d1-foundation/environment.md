# Environment: backend-d1-foundation

> **本批（B1～B9）不使用 git worktree**——沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳權限提示），
> 見 `backend-scoring-runbook-b1-b9.md`「執行模式」。schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；
> apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。SHALL NOT `git worktree add`、SHALL NOT 切換分支、
> SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/backend-d1-foundation`
- **Base branch**: `main`

> 開分支前提：`main` 上沒有其他 `change/*` 分支存在（runbook「全程嚴格序列」）。本 change 為 Wave 1 第一棒，無前置 change。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/backend-d1-foundation main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
```

## Verification

- **Baseline tests**: 待 apply Step 0（tasks 1.1）實測回填。runbook 記載 M15 時後端為 4 檔／16 測試。
- **Initial commit hash**: 待 apply Step 0 回填（`change/backend-d1-foundation` 分出時的 `main` HEAD）。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/backend-d1-foundation
```

## 注意事項

- 後端測試跑真 workerd；受限沙箱中的 `listen EPERM 127.0.0.1` 是環境限制，放行後重跑再判定。
- 本 change 會讓 `pnpm --filter ./hono-pickball dev`（含 Playwright `webServer`）改走 `wrangler dev --env local`；
  E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 清殘留，
  只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- 本機 D1 資料位於 `hono-pickball/.wrangler/state`（已 gitignore），可隨時刪除重建（`db:migrate:local`）。
- **禁止任何遠端 CF 操作**；`wrangler` 若提示登入，一律中止並回報。
- 編輯器診斷不可信，以 `tsc` exit code 為準。
