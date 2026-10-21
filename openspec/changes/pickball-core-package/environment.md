# Environment: pickball-core-package

> **本批（B1～B9）不使用 git worktree**——沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳權限提示），
> 見 `backend-scoring-runbook-b1-b9.md`「執行模式」。schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；
> apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。SHALL NOT `git worktree add`、SHALL NOT 切換分支、
> SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/pickball-core-package`
- **Base branch**: `main`

> 開分支前提：**B3 `auth-frontend-session` 已合併回 `main`、其分支已刪除、且已 archive，S1 已通過**；
> `main` 上沒有其他 `change/*` 分支；本 change 的 propose commit 已在 `main`。不符合時 SHALL NOT 開分支，回報 coordinator。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/pickball-core-package main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
```

## Verification

- **Baseline tests**：（apply Step 0／tasks 1.1 回填）預期 B3 後前端 87 檔／823、後端 12 檔／50，全綠；lint 0 errors／3 warnings；`playwright test --list` 總數待記錄。
- **Initial commit hash**：（apply Step 0 回填：`change/pickball-core-package` 分出時的 `main` HEAD）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/pickball-core-package
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install   # 回到 main 後重建 workspace 連結
```

## 注意事項

- 後端測試跑真 workerd；受限沙箱中的 `listen EPERM 127.0.0.1` 是環境限制，放行後重跑再判定。
- 切換分支後 MUST 重跑 `pnpm install`：`packages/pickball-core` 的 workspace 連結只在 install 後存在。
- C7（完整 E2E）需要 `hono-pickball/.dev.vars` 齊備（B3 的 `auth-session.spec.ts` 依賴它）；帳密與 secret 不得寫進任何 commit。
- C4 的 OpenNext build 會產生 `nextjs-pickball/.open-next/`（已 gitignore）；C3 的暫存入口與輸出目錄 MUST 刪除。
- **禁止任何遠端 CF 操作**；`wrangler` 若提示登入，一律中止並回報。
- 編輯器診斷不可信，以 `tsc` exit code 為準。
