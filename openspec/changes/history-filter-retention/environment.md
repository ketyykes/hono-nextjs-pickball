# Environment: history-filter-retention

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/history-filter-retention`
- **Base branch**: `main`

> 開分支由 coordinator 負責；leader 啟動時分支已就緒，不要重建。
> propose 當下（2026-10-30）`main` HEAD 為 `630bbd2`，repo 內另有 `change/matchmaker-draw-followups`、`change/site-editorial-redesign` 兩個既有分支，與本 change 無關；
> 開分支前由 coordinator 確認 `main` 已含其他並行 change 中會動到 `RemoteHistoryView.tsx`、`RemoteStatsContent.tsx`、`history-sync.spec.ts` 的提交（若有），避免合併衝突。

## Setup commands

由 coordinator 在主 repo 執行：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/history-filter-retention main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/heavy-lock.sh acquire nextjspickball "history-filter-retention baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**（2026-10-30 apply §1.1 於 `eaf1f50` 實跑，雙鎖）：
  - `pnpm test` exit 0：前端 109 檔／1070、後端 24 檔／177、核心 9 檔／21，全綠（後端未遇 `listen EPERM`）。
  - 三段 typecheck：`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm --filter ./packages/pickball-core typecheck` 皆 exit 0。
  - `pnpm lint` exit 0：0 errors／3 warnings。
  - `playwright test --list`：共 779 tests／24 files；chromium 147、firefox 147、webkit 147、mobile-chrome 147、mobile-safari 147、user-data 44（列出數含瀏覽器條件 skip；coordinator 提供的實跑基線為 chromium 147、firefox 135＋12 skip、mobile-chrome 145＋2 skip、user-data 44、webkit 與 mobile-safari 各 135＋12 skip）。
  - `pnpm install` 後 lockfile 零變動、`git status --porcelain` 為空；`db:migrate:local` 回報 No migrations to apply。
- **Initial commit hash**：`eaf1f50`（`change/history-filter-retention` 分出時的 `main` HEAD；propose 時的 `630bbd2` 之後 main 只多了 `site-navbar-account-entry` 的提交）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/history-filter-retention
```

## 注意事項

- 本 change **只改前端**；**沒有** migration、不動後端與核心套件。`db:migrate:local` 只為讓 `user-data` E2E 有可用的本機 D1。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`）；leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：`/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準；本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈——RED 與其 GREEN 須在同一張派工單內完成（本 change 的 RED 皆為執行期紅燈，不涉及 import 不存在的模組，預期不觸發型別錯誤）。
