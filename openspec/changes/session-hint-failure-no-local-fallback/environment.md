# Environment: session-hint-failure-no-local-fallback

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`（合併由 coordinator 於驗收後執行）。

## Branch

- **Branch name**: `change/session-hint-failure-no-local-fallback`
- **Base branch**: `main`

> 分支已由 coordinator 建立並切換完成（propose 當下 HEAD 為 `0de9ad9`，即 `main` 的「封存 session-pending-loading 並同步主 spec」）；leader 啟動時不要重建。
> `openspec/changes/` 下沒有其他進行中的 change。

## Setup commands

分支已就緒，由 leader 在主 repo 執行（§1.1）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 只允許本 change 的 artifact 尚未 commit
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch --show-current # 必須為 change/session-hint-failure-no-local-fallback
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/lock-fast.sh nextjspickball "session-hint-failure-no-local-fallback baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**（§1.1 實跑，HEAD `e78b456`，雙鎖）：**PASS**。前端 117 檔／1163 tests、後端 27／223、核心 10／27；三段 typecheck（`-r exec tsc --noEmit`、hono-pickball typecheck、pickball-core typecheck）皆 exit 0；lint 0 errors／3 warnings；`playwright test --list` 共 873 tests：chromium、firefox、mobile-chrome、mobile-safari、webkit 各 165，user-data 48。
  `pnpm install` 後 lockfile 零變動、`db:migrate:local` 為 No migrations to apply。
  參考值（上一個 change 合併前驗收，HEAD `1b21a86`）：前端 117 檔／1163 tests、後端 27／223、核心 10／27；lint 0 errors／3 warnings；E2E 五個 browser project 各 165、user-data 48。
- **Initial commit hash**：`0de9ad9`（`change/session-hint-failure-no-local-fallback` 分出時的 `main` HEAD）。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證、archive 後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/session-hint-failure-no-local-fallback
```

## 注意事項

- 本 change **只改前端**（15 個產品檔，見 proposal Impact）；**沒有** migration、不動後端與核心套件。`db:migrate:local` 只為讓 `user-data` E2E 有可用的本機 D1。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`）；leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
  本 change 新增的兩條 E2E 在五個 browser project 跑（訪客＋以 `addInitScript` 寫入的提示），不需要測試帳號。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（`--run` 前不可加 `--`；不要用 `pnpm --dir <root> --filter ./<ws>`）。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準；本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈——RED 與其 GREEN 須在同一張派工單內完成（§2 的 RED 會以 `null` 呼叫 `mockResolvedValue`、匯入尚不存在的 `chooseLocalFallback`，屬型別紅燈）。
- 合併前全瀏覽器 gate：`/tmp/cgate2.sh session-hint-failure-no-local-fallback`，矩陣檔 `/tmp/cgate-session-hint-failure-no-local-fallback.e2e` 照 `/tmp/cgate-session-pending-loading.e2e` 複製（chromium、firefox、mobile-chrome、webkit 三個 shard、mobile-safari 三個 shard、user-data）。
