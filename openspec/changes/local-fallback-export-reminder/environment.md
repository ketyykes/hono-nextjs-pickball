# Environment: local-fallback-export-reminder

> **本專案不使用 git worktree**（沿用 2026-09-03 使用者指示）。schema 的 worktree 欄位在此宣告**主 repo 路徑**；apply Step 0 的 cwd 檢查以下方 `Worktree path` 為準。
> SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`、SHALL NOT `git push`（合併由 coordinator 於驗收後執行）。

## Branch

- **Branch name**: `change/local-fallback-export-reminder`
- **Base branch**: `main`

> 分支已由 coordinator 建立並切換完成（分出時 `main` HEAD 為 `9113111`，即「封存 cloud-json-import-append」）；leader 啟動時不要重建。`openspec/changes/` 下沒有其他進行中的 change。

## Setup commands

分支已就緒，由 leader 在主 repo 執行（§1.1）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball status --porcelain   # 只允許本 change 的 artifact 尚未 commit
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch --show-current # 必須為 change/local-fallback-export-reminder
pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install
/tmp/lock-fast.sh nextjspickball "local-fallback-export-reminder baseline"
python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test
/tmp/heavy-lock.sh release nextjspickball
```

## Verification

- **Baseline tests**（2026-11-12，HEAD `1cf45b5`，雙鎖）：install 後 lockfile 零變動；前端 119 檔／1197 tests、後端 28／238、核心 10／31 全綠；三段 typecheck exit 0；lint 0 errors／3 warnings；`playwright test --list` 共 884：chromium、firefox、webkit、mobile-chrome、mobile-safari 各 167，user-data 49。
- **Initial commit hash**: `9113111`（`change/local-fallback-export-reminder` 分出時的 `main` HEAD）。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（主 repo，非 linked worktree）

## Teardown

合併回 `main` 並經 coordinator 獨立驗證、archive 後，由 coordinator 執行（apply 完成時**不要**執行）：

```bash
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball switch main
git -C /Users/m2_24gb/Desktop/project/nextjs-pickball branch -d change/local-fallback-export-reminder
```

## 注意事項

- 本 change 只動前端一個產品檔與一個單元測試檔（見 proposal Impact），**不碰後端與核心**，無 migration。`user-data` E2E 不受影響，gate 中照基線跑。
- 單檔測試（免鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**；不要用 `pnpm --dir <root> --filter ./<ws>`，cwd 不在 root 時會 "No projects matched" 且 exit 0）。
- 型別：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`（Stop hook 同款）；以 exit code 為準，編輯器診斷不可信。
- 重負載（E2E、eslint 全套、全套 vitest、build）一律雙鎖：先 `/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py。
- E2E 前後 MUST 用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。
- **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。
- 本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈；本 change 的 RED 只是字面值斷言，不產生型別錯誤。
- 合併前全瀏覽器 gate：`/tmp/cgate2.sh local-fallback-export-reminder`，矩陣檔 `/tmp/cgate-local-fallback-export-reminder.e2e` 由 coordinator 準備。
