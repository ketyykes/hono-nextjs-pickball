# Environment: target-score-lock-current-round

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/target-score-lock-current-round`
- **Base branch**: `main`

> 開分支由 coordinator 負責；leader 啟動時分支已就緒，不要重建。
> propose 當下（2026-11-06）`main` HEAD 為 `38b6ae8`；同時有 `scoreboard-bound-game-over`、`site-not-found-and-nav-active` 兩個並行 proposal。
> `scoreboard-bound-game-over` 可能也會修改 `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`：開分支前由 coordinator 確認 `main` 是否已含其提交，合併順序與衝突由 coordinator 處理。

## Setup commands

由 coordinator 在主 repo 執行：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/target-score-lock-current-round main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/heavy-lock.sh acquire nextjspickball "target-score-lock-current-round baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**：（待 apply §1.1 實跑後回填：三個 workspace 的檔數／測試數、三段 typecheck、`pnpm lint` errors／warnings、`playwright test --list` 各 project 數量與 `scoreboard-binding.spec.ts`＋`match-stage.spec.ts` 在各 project 的數量）
- **Initial commit hash**：（待 apply §1.1 回填：`change/target-score-lock-current-round` 分出時的 `main` HEAD）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/target-score-lock-current-round
```

## 注意事項

- 本 change **只改前端一個函式**；**沒有** migration、不動後端與核心套件。`db:migrate:local` 只為讓 C5 ③ 的 `user-data` E2E 有可用的本機 D1。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`）；leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：`/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準；本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈——RED 與其 GREEN 須在同一張派工單內完成（本 change 的 RED 皆為執行期紅燈，不 import 不存在的符號，預期不觸發型別錯誤）。
