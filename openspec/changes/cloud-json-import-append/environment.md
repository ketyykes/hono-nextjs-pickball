# Environment: cloud-json-import-append

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`（合併由 coordinator 於驗收後執行）。

## Branch

- **Branch name**: `change/cloud-json-import-append`
- **Base branch**: `main`

> 分支已由 coordinator 建立並切換完成（propose 當下 HEAD 與 `main` 皆為 `cad7de9`，即「archive session-hint-failure-no-local-fallback」）；leader 啟動時不要重建。
> `openspec/changes/` 下沒有其他進行中的 change。

## Setup commands

分支已就緒，由 leader 在主 repo 執行（§1.1）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 只允許本 change 的 artifact 尚未 commit
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch --show-current # 必須為 change/cloud-json-import-append
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/lock-fast.sh nextjspickball "cloud-json-import-append baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**（§1.1 實跑，2026-11-12，HEAD `081b9e4`，雙鎖）：`pnpm install` exit 0、lockfile 零變動；`db:migrate:local` exit 0；全套 test exit 0——前端 119 檔／1184 tests、後端 27／223、核心 10／27；
  三段 typecheck（root `pnpm typecheck`、後端、核心）皆 exit 0；lint exit 0（0 errors／3 warnings）；`playwright test --list` 共 883 tests／27 files：chromium、firefox、webkit、mobile-chrome、mobile-safari 各 167，user-data 48。
  參考值（上一個 change 合併前的最終 gate，HEAD `20e9f2a`）：前端 119 檔／1184 tests、後端 27／223、核心 10／27；三段 tsc exit 0；lint 0 errors／3 warnings；E2E chromium、firefox、mobile-chrome、webkit、mobile-safari 各 167，user-data 48。
- **Initial commit hash**：`cad7de9`（`change/cloud-json-import-append` 分出時的 `main` HEAD）。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證、archive 後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/cloud-json-import-append
```

## 注意事項

- 本 change 跨**三個 workspace**：核心 `packages/pickball-core/src/api/import.ts`、後端 `hono-pickball/src/{routes/import.ts,import/local-import-repository.ts}`、前端三個產品檔（見 proposal Impact）；**沒有** migration、不新增資料表或欄位。`db:migrate:local` 只為讓 `user-data` E2E 有可用的本機 D1。
- 單檔測試（免鎖）：
  - 前端：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`
  - 後端（workerd）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball test --run <path>`（受限沙箱噴 `listen EPERM 127.0.0.1` 時放行後重跑，不是設定錯誤）
  - 核心：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core test --run <path>`
  - **`--run` 前不可加 `--`**；不要用 `pnpm --dir <root> --filter ./<ws>`（cwd 不在 root 時會 "No projects matched" 且 exit 0）。
- 型別：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`（Stop hook 同款，不含後端與核心的 `test/**`）＋ `pnpm --dir …/hono-pickball typecheck` ＋ `pnpm --dir …/packages/pickball-core typecheck`；三者皆以 exit code 為準，編輯器診斷不可信。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT=development`）；leader 開工前向 coordinator 確認。**帳密不得寫進任何 commit**。skip 不算通過。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈——核心與前端的 RED（import 尚不存在的匯出）與其 GREEN 須在同一張派工單內完成。
- 合併前全瀏覽器 gate：`/tmp/cgate2.sh cloud-json-import-append`，矩陣檔 `/tmp/cgate-cloud-json-import-append.e2e` 由 coordinator 照 `/tmp/cgate-session-hint-failure-no-local-fallback.e2e` 複製（chromium、firefox、mobile-chrome、webkit 三個 shard、mobile-safari 三個 shard、user-data）。
