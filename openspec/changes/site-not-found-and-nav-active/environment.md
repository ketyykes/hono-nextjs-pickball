# Environment: site-not-found-and-nav-active

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/site-not-found-and-nav-active`
- **Base branch**: `main`

> 開分支由 coordinator 負責；leader 啟動時分支已就緒，不要重建。
> propose 當下（2026-11-06）`main` HEAD 為 `38b6ae8`；同時有 `scoreboard-bound-game-over`、`target-score-lock-current-round` 兩個 change 在 propose，預期與本 change 的檔案無交集。
> 開分支前由 coordinator 確認 `main` 已含其他並行 change 中會動到 `SiteNavbar.tsx`、`SiteNavbar.test.tsx`、`app/` 根目錄或 `nextjs-pickball/CLAUDE.md` 同段落的提交（若有），避免合併衝突。

## Setup commands

由 coordinator 在主 repo 執行：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/site-not-found-and-nav-active main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/heavy-lock.sh acquire nextjspickball "site-not-found-and-nav-active baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**（來源：coordinator 於前一個 change 合併前在 `main` 的前一個 commit 實跑；leader 依今晚安排未重跑全套）：
  前端 109 檔／1091 tests、後端 26 檔／215、核心 10 檔／27，全綠；`pnpm lint` 0 errors／3 warnings；三段 typecheck exit 0；E2E chromium 全套 150 passed（18 檔）。
  leader 於 2026-11-06 03:50 在本分支實跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` → exit 0；工作樹乾淨；未跑 `pnpm install`（lockfile 未變）。
- **Initial commit hash**：`cb9b585`（`main` HEAD，分支自此分出；propose 時為 `38b6ae8`）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/site-not-found-and-nav-active
```

## 注意事項

- 本 change **只改前端**；**沒有** migration、不動後端與核心套件。`db:migrate:local` 只為讓 E2E 的 globalSetup 與 `user-data` project 有可用的本機 D1。
- 本 change 新增的 E2E 皆為訪客、在五個 browser project 執行，不需要 `.dev.vars` 的測試帳號；C5 的 user-data 回歸仍需 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`），leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：`/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準。本 change 在主 repo 進行，**Stop hook 會擋主 worktree 的 tsc 紅燈**：§2、§3 的 RED 會 import 尚不存在的模組（`@/lib/navActive`、`./not-found`），是型別錯誤——RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。
