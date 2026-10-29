# Environment: user-data-version-monotonic

> **本 change 不使用 git worktree**——沿用 2026-09-03 使用者指示（worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/user-data-version-monotonic`
- **Base branch**: `main`

> 開分支前提：`main` 工作樹乾淨、沒有其他未合併的 `change/*` 分支正在同一個 repo 進行 apply（本 change 會改 `hono-pickball/src/matchmaker/*-repository.ts`、
> `src/import/local-import-repository.ts` 與 `drizzle/`，與其他後端 change 衝突的機率高）。若同時有其他 change 也新增 migration，**編號（0004）由後合併者重新產生**，SHALL NOT 手改。
> 已知並行 change `user-data-import-limits` 也改 `src/import/local-import-repository.ts`、`test/local-import.test.ts`，並 MODIFIED `user-data-sync`「本機資料匯入雲端的 API」：
> **後歸檔者 MUST 以先歸檔者合併後的主 spec 為底重做 MODIFIED**，程式碼由後合併者 rebase（design Open Questions 6）。

## Setup commands

由 coordinator 在主 repo 執行（leader 啟動時分支已就緒，不要重建）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/user-data-version-monotonic main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
/tmp/heavy-lock.sh acquire nextjspickball "user-data-version-monotonic baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**：待 apply §1.1 實跑後回填（前端／後端／核心各幾檔幾 it、三段 typecheck、`pnpm lint` 的 errors／warnings、`playwright test --list` 各 project 數量）。
- **Initial commit hash**：待 apply §1.1 回填（`change/user-data-version-monotonic` 分出時的 `main` HEAD；propose 當下 `main` 為 `630bbd2`，僅供參考）。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/user-data-version-monotonic
```

## 注意事項

- 後端測試跑真 workerd；受限沙箱中的 `listen EPERM 127.0.0.1` 是環境限制，放行後重跑再判定。
- **重負載一律雙鎖**（E2E、eslint、全套 vitest、build）：先 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，再 `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>`，
  最後 `/tmp/heavy-lock.sh release nextjspickball`；SHALL NOT 在 heavy.py 內再包 heavy.py。單檔測試（`pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`）免鎖。
- **本 change 有 migration**：§2 GREEN 產生 `drizzle/0004_sync_version_floors.sql` 後 MUST 立即 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local`；
  未套用前 `tests/e2e/helpers/user-data.ts` 的 `clearTestAccountUserData()` 會因 `sync_version_floors` 不存在而失敗，所有 `user-data` E2E 連帶失敗（不是本 change 的行為回歸）。
  後端 vitest 以 `readD1Migrations` 讀 `drizzle/`，不需要手動套用。
- `user-data` E2E 與驗收 C6 需要 `hono-pickball/.dev.vars` 齊備；leader 開工前向 coordinator 確認；**帳密與 secret 不得寫進任何 commit**。skip 不算通過。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、`d1 create`、`--remote`、`secret put`）；所有 `wrangler d1` 指令 MUST 帶 `--local`；`wrangler` 若提示登入，一律中止並回報。只允許 `--local`、`--dry-run`。
- 編輯器診斷不可信，以 `tsc` exit code 為準；Stop hook 不檢查 `hono-pickball/test/**` 型別，合併前 MUST 跑 `pnpm --filter ./hono-pickball typecheck`。
