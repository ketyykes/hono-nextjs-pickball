# Environment: round-settings-follow-round

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/round-settings-follow-round`
- **Base branch**: `main`

> 開分支由 coordinator 負責；leader 啟動時分支已就緒，不要重建。
> propose 當下（2026-11-06）`main` HEAD 為 `cb9b585`；同時有並行 change `site-not-found-and-nav-active`（改全站 navbar／404，可能動到 `match-stage.spec.ts` 或區段導覽相關檔）。
> 本 change 今晚不 apply，留待使用者之後執行；開分支前由 coordinator 確認 `main` 是否已含並行 change 的提交，合併順序與衝突由 coordinator 處理。

## Setup commands

由 coordinator 在主 repo 執行：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/round-settings-follow-round main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/lock-fast.sh nextjspickball "round-settings-follow-round baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

> `/tmp/lock-fast.sh` 與 `/tmp/heavy-lock.sh` 為同一把 mkdir 鎖（前者每秒輪詢取鎖）。**`/tmp` 下的腳本重開機後會消失**，apply 前若不存在，MUST 由 coordinator 重建後再開始，SHALL NOT 自行以其他方式取代鎖。

## Verification

- **Baseline tests**（來源：coordinator 於前一個 change `court-score-entry-submit-a11y` 合併前在 `main` 實跑；依今晚特別安排第 2 點，leader 不重跑全套）：
  - `pnpm test`：前端 111 檔／1107 tests、後端 26 檔／215、核心 10 檔／27，全綠
  - `pnpm lint`：0 errors／3 warnings
  - 三段 typecheck：皆 exit 0（leader 於分支上另實跑 `pnpm --dir <repo> -r exec tsc --noEmit` exit 0）
  - E2E：chromium 全套 154 passed；`match-stage.spec.ts` 五個 browser project 各 23 passed；`user-data/round-sync.spec.ts` 9 passed
- **Initial commit hash**：`bc96661`（`main` HEAD，`change/round-settings-follow-round` 分出點）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/round-settings-follow-round
```

## 注意事項

- 本 change **只改前端三檔**；**沒有** migration、不新增儲存 key、不動後端與核心套件。`db:migrate:local` 只為讓 C5 ③ 的 `user-data` E2E 有可用的本機 D1。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`）；leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：`/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- **`pnpm --dir <root> --filter ./<ws>` 的 filter 以 shell cwd 解析**：cwd 不在 repo root 時會印 "No projects matched" 且 exit 0（看似成功、實際什麼都沒跑）。一律改用 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace> <script>`。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準。本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈：§2 的 RED 會 import 尚不存在的 `resolveRoundSettings`（型別錯誤），**RED 與其 GREEN MUST 在同一張派工單內完成**，leader 在該組交件前不結束回合。
