# Environment: local-data-import

> **本批（B1～B9）不使用 git worktree**——沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳權限提示），
> 見 `backend-scoring-runbook-b1-b9.md`「執行模式」。schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；
> apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。SHALL NOT `git worktree add`、SHALL NOT 切換分支、
> SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/local-data-import`
- **Base branch**: `main`

> 開分支前提：**B4～B8 皆已合併回 `main`、其分支已刪除、且已 archive**（`GET /api/matchmaker/history` 已在 main；`resetLocalMatchProgress()` 已刪除；主 spec 已含 B8 的增修）；
> `main` 上沒有其他 `change/*` 分支。若 B8 未合併，SHALL NOT 開分支，回報 coordinator。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/local-data-import main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
```

## Verification

- **Baseline tests**（2026-10-28 apply Step 0 實跑，持鎖）：前端 105 檔／1054、後端 23 檔／166、核心 8 檔／17，全綠；
  `pnpm lint` 0 errors／3 warnings；`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm --filter ./packages/pickball-core typecheck` 皆 exit 0；
  `playwright test --list`：chromium／firefox／webkit／mobile-chrome／mobile-safari 各 145（17 檔）、user-data 40（5 檔）。
  `pnpm install` 後 lockfile 零變動；`db:migrate:local` 無待套用 migration；`db:seed:local` 成功
- **Initial commit hash**：`6185472`（`change/local-data-import` 分出時的 `main` HEAD）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/local-data-import
```

## 注意事項

- 後端測試跑真 workerd；受限沙箱中的 `listen EPERM 127.0.0.1` 是環境限制，放行後重跑再判定。
- `user-data` E2E 與驗收 C6 需要 `hono-pickball/.dev.vars` 齊備；leader 開工前向 coordinator 確認；**帳密與 secret 不得寫進任何 commit**。skip 不算通過。
- 本 change **沒有** migration；`db:migrate:local` 只是確認 B7 的 `0003` 已套用。
- 手動測試匯入時，先以訪客身分在乾淨的瀏覽器設定檔留下資料，再登入；測試帳號的雲端資料以 `clearTestAccountUserData()` 清空，**SHALL NOT** 以真實活動資料測試。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**；所有 `wrangler d1` 指令 MUST 帶 `--local`；`wrangler` 若提示登入，一律中止並回報。
- 編輯器診斷不可信，以 `tsc` exit code 為準；Stop hook 不檢查 `hono-pickball/test/**` 型別（runbook R4），合併前 MUST 跑 `pnpm --filter ./hono-pickball typecheck`。
