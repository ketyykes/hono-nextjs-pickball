# Environment: court-score-entry-submit-a11y

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/court-score-entry-submit-a11y`
- **Base branch**: `main`

> 開分支由 coordinator 負責；leader 啟動時分支已就緒，不要重建。
> propose 當下（2026-11-06）`main` HEAD 為 `2bd7176`；同時有 `round-settings-follow-round`、`round-timer-clear` 兩個待 apply 的 proposal（無相依）。
> 若兩者先合併且改到 `CourtCard.tsx` 或 `match-stage.spec.ts`，屬不同段落，由 coordinator 在開分支前確認 `main` 已含其提交，§1.2 對齊。

## Setup commands

由 coordinator 在主 repo 執行：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/court-score-entry-submit-a11y main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/lock-fast.sh nextjspickball "court-score-entry-submit-a11y baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

> `/tmp/lock-fast.sh` 與 `/tmp/heavy-lock.sh` 是同一把 mkdir 鎖（前者每秒輪詢取鎖），**重開機會消失**；不存在時由 coordinator 重建，SHALL NOT 略過取鎖。
> `pnpm --dir <root> --filter ./<ws>` 的 filter 以 shell cwd 解析，cwd 不在 repo root 時會 "No projects matched" 且 exit 0；一律改用 `pnpm --dir <repo>/<workspace> <script>`。

## Verification

- **Baseline tests**（來源：coordinator 於前一個 change 合併前實跑，leader 未重跑全套）：前端 111 檔／1103 tests、後端 26 檔／215、核心 10 檔／27，全綠；`pnpm lint` 0 errors／3 warnings；三段 typecheck exit 0；E2E 五個 browser project 各 153（chromium 153 passed；firefox、webkit、mobile-safari 各 141 passed＋12 skipped；mobile-chrome 151＋2）、user-data 47 passed。leader 於 §1.1 僅實跑 `pnpm --dir <repo> -r exec tsc --noEmit`：exit 0。
- **Initial commit hash**：`96d384a`（`change/court-score-entry-submit-a11y` 自 `main` 分出）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/court-score-entry-submit-a11y
```

## 注意事項

- 本 change **只改前端兩個元件檔**；**沒有** migration、不動後端與核心套件。`db:migrate:local` 只為讓 C5 ③ 的 `user-data` E2E 有可用的本機 D1。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`）；leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：`/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準；本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈——RED 與其 GREEN 須在同一張派工單內完成（本 change 的 RED 經由 `CourtCard` 既有 props 渲染，皆為執行期紅燈，預期不觸發型別錯誤）。
