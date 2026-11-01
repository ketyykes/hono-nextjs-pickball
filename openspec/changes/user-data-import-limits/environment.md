# Environment: user-data-import-limits

> **本 change 不使用 git worktree**——沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳權限提示），
> 見 `docs/backend-scoring-runbook-b1-b9.md`「執行模式」。schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；
> apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。SHALL NOT `git worktree add`、SHALL NOT 切換分支、
> SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/user-data-import-limits`
- **Base branch**: `main`

> 開分支前提：`main` 工作樹乾淨。若同時有其他修改 `user-data-sync`「本機資料匯入雲端的 API」或 `hono-pickball/src/import/local-import-repository.ts`、`src/matchmaker/players-repository.ts` 的 change
> （propose 當下為 `user-data-version-monotonic`）已先合併並 archive，§1 MUST 以 archive 後的主 spec 與程式碼為底重新套用本 change 的增修（見 tasks 1.2）。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/user-data-import-limits main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/heavy-lock.sh acquire nextjspickball "user-data-import-limits baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**（2026-11-01 apply §1 實跑，持雙鎖，load 約 5）：
  - `pnpm test`：前端 109 檔／1078 passed；後端 24 檔／177 passed；核心 9 檔／21 passed（exit 0）
  - `pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm --filter ./packages/pickball-core typecheck`：皆 exit 0
  - `pnpm lint`：exit 0，0 errors／3 warnings
  - `playwright test --list`：chromium、firefox、webkit、mobile-chrome、mobile-safari 各 147 tests（18 files）；user-data 46 tests（6 files）
  - `pnpm install`：lockfile 零變動；`db:migrate:local`：No migrations to apply
- **Initial commit hash**：`7d5d142`（`change/user-data-import-limits` 分出時的 `main` HEAD；propose 當下 `main` HEAD 為 `630bbd2`）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/user-data-import-limits
```

## 注意事項

- 後端測試跑真 workerd；受限沙箱中的 `listen EPERM 127.0.0.1` 是環境限制，放行後重跑再判定。
- 本 change 的後端測試會建立 1.9MB～10MB 的請求 body；單檔測試免鎖，但若單檔執行時間異常（> 2 分鐘）先回報，不要自行調高 timeout 掩蓋。
- `user-data` E2E 需要 `hono-pickball/.dev.vars` 齊備；leader 開工前向 coordinator 確認；**帳密與 secret 不得寫進任何 commit**。skip 不算通過。
- 本 change **沒有** migration；`db:migrate:local` 只是確認既有 migration 已套用。
- **重負載雙鎖**（E2E、eslint、全套 vitest、build）：先 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，再 `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>`，最後 `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py。單檔測試免鎖。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、`d1 create`、`--remote`、`secret put`）；`wrangler d1` 一律帶 `--local`，只允許 `--dry-run`；`wrangler` 若提示登入，一律中止並回報。
- 編輯器診斷不可信，以 `tsc` exit code 為準；Stop hook 不檢查 `hono-pickball/test/**` 與 `packages/pickball-core/test/**` 的型別，合併前 MUST 跑兩個 workspace 的 `typecheck`。
