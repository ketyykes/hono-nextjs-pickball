# Environment: site-navbar-account-entry

> **本專案不使用 git worktree**——沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/site-navbar-account-entry`
- **Base branch**: `main`

> 開分支前提：`main` 上沒有其他尚未合併、且會改動 `nextjs-pickball/components/layout/**`、`components/auth/LoginForm.tsx`、
> `tests/e2e/specs/auth-session.spec.ts` 或 `openspec/specs/{site-navbar,auth}/spec.md` 的 `change/*` 分支；若有，SHALL NOT 開分支，回報 coordinator。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/site-navbar-account-entry main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
```

## Verification

- **Baseline tests**（2026-10-30 apply tasks 1.1 實跑，持雙鎖）：
  - `pnpm test` exit 0：前端 109 files／1068 tests、後端 24 files／177 tests、核心 9 files／21 tests，全綠
  - `pnpm lint` exit 0（0 errors、3 warnings，皆為既有）；`pnpm -r exec tsc --noEmit` exit 0；
    `pnpm --filter ./hono-pickball typecheck` exit 0；`pnpm --filter ./packages/pickball-core typecheck` exit 0
  - `playwright test --list`：chromium／firefox／webkit／mobile-chrome／mobile-safari 各 145 tests in 17 files；user-data 44 tests in 6 files
  - `pnpm install` 後 `git status --porcelain` 為空（lockfile 零變動）；`db:migrate:local` 回報 No migrations to apply；
    `hono-pickball/.dev.vars` 六個 key 齊備（ENVIRONMENT、BETTER_AUTH_SECRET、BETTER_AUTH_URL、TEST_ACCOUNT_EMAIL／PASSWORD／NAME）
- **Initial commit hash**：`f568e14`（`change/site-navbar-account-entry` 分出時的 `main` HEAD；propose 時 `main` HEAD 為 `630bbd2`，其後 `f568e14` 為 propose commit）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/site-navbar-account-entry
```

## 注意事項

- 本 change **沒有** migration、不碰後端；但 auth E2E（`auth-session.spec.ts`）與 user-data project 需要 `hono-pickball/.dev.vars` 齊備，skip 不算通過。
- 新 spec `navbar-account-entry.spec.ts` 以 `page.route` 模擬 `/api/session`，不依賴 `.dev.vars`；仍需前後端 webServer 皆啟動（頁面本身由 Next.js 提供）。
- 重負載（E2E、eslint、全套 vitest、build）一律雙鎖：`/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` →
  `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；不得巢狀 heavy.py。單檔 vitest 免鎖。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、`d1 create`、`--remote`、`secret put`）；只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 的 exit code 為準。
- 指令裡禁止 `cd`，一律用絕對路徑（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
