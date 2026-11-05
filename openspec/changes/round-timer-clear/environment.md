# Environment: round-timer-clear

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/round-timer-clear`
- **Base branch**: `main`

> 開分支由 coordinator 負責；leader 啟動時分支已就緒，不要重建。
> propose 當下（2026-11-06）`main` HEAD 為 `f506616`；同批尚未 apply 的 `round-settings-follow-round` 會改 `app/matchmaker/page.tsx`、`lib/matchmaker/round-settings.ts`、`components/matchmaker/RoundControls.tsx`（目標分數方向鍵一行）與 `tests/e2e/specs/match-stage.spec.ts`。
> **本 change MUST 在 `round-settings-follow-round` 合併進 `main` 之後才開分支**（相依理由見 proposal Impact）；coordinator 開分支前確認 `main` 已含其合併 commit。

## Setup commands

由 coordinator 在主 repo 執行：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/round-timer-clear main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
/tmp/lock-fast.sh nextjspickball "round-timer-clear baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

> `/tmp/lock-fast.sh` 與 `/tmp/heavy-lock.sh` 為同一把 mkdir 鎖（前者每秒輪詢取鎖）；`/tmp` 下的腳本**重開機會消失**，缺檔時由 coordinator 重建，leader／Implementer 不得自行改寫鎖腳本。

## Verification

- **Baseline tests**：待 apply §1.1 回填（`pnpm test` 三個 workspace 的檔數／測試數、三段 typecheck、`pnpm lint` errors／warnings、`playwright --list` 各 project 數量，另記 `round-timer.spec.ts`＋`match-stage.spec.ts` 在五個 browser project 的數量）。
- **Initial commit hash**：待 apply §1.1 回填。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/round-timer-clear
```

## 注意事項

- 本 change 動核心套件一個函式（`packages/pickball-core/src/matchmaker/round.ts`）與前端三檔；**沒有** migration、不動後端。
- C5 ③ 的 `user-data` E2E 需要本機 D1 已 migrate（`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local`）與 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`）；leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：`/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- `pnpm --dir <root> --filter ./<ws>` 的 filter 以 **shell cwd** 解析，cwd 不在 repo root 時會 "No projects matched" 且 **exit 0**（假綠）；一律改用 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace> <script>`。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準。本 change 的 RED 會以 `null` 呼叫 `setTimerDuration`（GREEN 前為型別錯誤），主 repo 的 Stop hook 會擋 tsc 紅燈——**RED 與其 GREEN 須在同一張派工單內完成**。
