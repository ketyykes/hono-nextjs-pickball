# Environment: google-oauth-launch

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示：worktree 位於專案目錄外，每個檔案操作都會跳權限提示）。
> schema 的 worktree 欄位在此改為宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`。

## Branch

- **Branch name**: `change/google-oauth-launch`
- **Base branch**: `main`

> 開分支由 coordinator 負責；leader 啟動時分支已就緒，不要重建。
> propose 當下（2026-11-07）`main` HEAD 為 `35f71a4`。開分支前由 coordinator 確認 `main` 已含其他並行 change 中會動到 proposal「Impact」所列檔案的提交（若有），避免合併衝突。

## Setup commands

由 coordinator 在主 repo 執行：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 必須為空
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch -c change/google-oauth-launch main
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local
grep -c '^GOOGLE_' /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball/.dev.vars   # 必須為 0（只計數，不輸出值）
/tmp/lock-fast.sh nextjspickball "google-oauth-launch baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**：（apply §1.1 回填：三個 workspace 的檔數／測試數、三段 typecheck、lint errors／warnings、`playwright test --list` 六個 project 各自數量、`hono-pickball build` 的 dry-run binding 清單）
- **Initial commit hash**：（apply §1.1 回填：`change/google-oauth-launch` 分出時的 `main` HEAD；propose 時為 `35f71a4`）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/google-oauth-launch
```

合併與 archive **不 push**；push 是 tasks §5 的 U5，由使用者在 U1～U4 完成後執行。

## 注意事項

- 本 change 前後端皆改，**沒有** migration、不動核心套件。`db:migrate:local` 只為讓 E2E 有可用的本機 D1。
- `hono-pickball/.dev.vars` 必須含 `TEST_ACCOUNT_*` 與 `ENVIRONMENT=development`，且**不含** `GOOGLE_*`（C5 與 E2E「登入頁的登入方式與後端回報一致」的執行前提）；leader 開工前向 coordinator 確認。agent 不得讀出或修改其值。**帳密不得寫進任何 commit**。skip 不算通過。
- **Google OAuth Client ID／Secret 不會提供給 agent**，也 SHALL NOT 出現在任何檔案或 commit；測試一律用 `fake-client-id`／`fake-client-secret`。
- 重負載（E2E、eslint 全套、全套 vitest、build、preview）一律雙鎖：先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
  不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
- 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace> test --run <path>`（`--run` 前不可加 `--`；不要用 `pnpm --dir <root> --filter ./<ws>`）。
- E2E 與 preview 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（`wrangler deploy`、`d1 create`、任何 `--remote`、`secret put`／`list`／`delete`、`wrangler login`）；只允許 `--local`、`--dry-run`。`hono-pickball build` 的 `wrangler deploy --dry-run` 屬允許範圍。
- `.dev.vars.example` 的改動不會觸發 root 的 cf-typegen hook（只看 `wrangler.(jsonc|json|toml)`），§2.1 須手動重跑 `cf-typegen`。
- 編輯器診斷不可信，以 `tsc` exit code 為準；本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈——§3.1 的 RED 會 import 尚不存在的 `startGoogleSignIn`（前端型別錯誤），RED 與其 GREEN MUST 在同一張派工單內完成。
- 後端測試跑在 workerd；沙箱內出現 `listen EPERM 127.0.0.1` 屬 miniflare 被擋，放行後重跑，不是設定錯誤。
