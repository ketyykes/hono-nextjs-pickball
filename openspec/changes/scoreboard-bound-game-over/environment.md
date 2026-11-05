# Environment: scoreboard-bound-game-over

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/scoreboard-bound-game-over`
- **Base branch**: `main`

> 開分支由 coordinator 負責；leader 啟動時分支已就緒，不要重建。
> propose 當下（2026-11-06）`main` HEAD 為 `38b6ae8`；`openspec/changes/` 另有並行中的 `target-score-lock-current-round`（其 E2E 驗收錨點同樣落在 `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`）與 `site-not-found-and-nav-active`。
> 開分支前由 coordinator 確認 `main` 已含其他並行 change 中會動到 `GameOverDialog.tsx`、`Scoreboard.tsx`、`GameOverDialog.test.tsx`、`scoreboard-binding.spec.ts` 與主 spec `openspec/specs/scoreboard/spec.md` 的提交（若有），避免合併衝突。

## Setup commands

由 coordinator 在主 repo 執行：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/scoreboard-bound-game-over main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/heavy-lock.sh acquire nextjspickball "scoreboard-bound-game-over baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**（2026-11-06 01:55～01:58 實跑，`pnpm install` 後 lockfile 零變動、`db:migrate:local` exit 0）：
  - `pnpm test`（雙鎖）：前端 109 檔／1085 tests、後端 26 檔／215 tests、核心 10 檔／27 tests，全綠
  - 三段 typecheck：`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm --filter ./packages/pickball-core typecheck` 皆 exit 0
  - `pnpm lint`（雙鎖）：0 errors、3 warnings
  - `playwright test --list`：chromium／firefox／webkit／mobile-chrome／mobile-safari 各 147 tests（18 檔）、user-data 47 tests（6 檔）；C5 ② 三檔在四個 browser project 各 38；`scoreboard-binding.spec.ts` 在 chromium 為 20；C5 ③ 兩檔在 user-data 為 15
- **Initial commit hash**：`c4b18a7`（`change/scoreboard-bound-game-over` 分出時的 `main` HEAD）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/scoreboard-bound-game-over
```

## 注意事項

- 本 change **只改前端**；**沒有** migration、不動後端與核心套件。`db:migrate:local` 只為讓 C5 的 `user-data` E2E 有可用的本機 D1。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`）；leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：`/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準。本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈：
  **2.1 的 RED 會對 `GameOverDialog` 傳入尚不存在的 `matchId` prop，RED commit 時 `pnpm -r exec tsc --noEmit` 預期失敗（excess property）**——RED 與其 GREEN MUST 在同一張派工單內完成，GREEN 後 tsc 恢復 exit 0。
