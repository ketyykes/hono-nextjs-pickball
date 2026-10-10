# Environment: remove-emoji

## Branch

- **Branch name**: `change/remove-emoji`
- **Base branch**: `main`

> 注意：`change/site-editorial-redesign`（全站改版）**不併入**本分支，也不從它 cherry-pick；
> 只允許以 `git show change/site-editorial-redesign:<path>` 唯讀參考 SVG 路徑（design Decision 2）。

## Setup commands

> 注意：**不使用 git worktree**（2026-09-10 使用者指示，M10 起沿用）：直接在主 repo 的
> `change/remove-emoji` 分支上施工。禁止 `git worktree add`、禁止施工中切換分支、禁止 `git merge`。

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git switch -c change/remove-emoji main
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: PASS — 2026-10-10 實測 `pnpm test` 全綠：後端 4 檔 16 測試、前端 74 檔 766 測試
- **Initial commit hash**: `798c962`（含本 change artifacts；parent 為 `main` @ `cb2fb73`）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（本次不開 worktree）

## Teardown

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git branch -d change/remove-emoji
```

> apply 完成時不要執行 teardown；留給使用者在合併並歸檔後自行執行。

## 注意事項

- 所有 subagent 共用同一個工作樹，SHALL NOT 各自 `git worktree add`；coordinator 在 subagent 施工期間 SHALL NOT 改動 repo 內任何檔案
- 後端測試跑真 workerd，沙箱中出現 `listen EPERM 127.0.0.1` 時放行後重跑，不是 baseline 失敗
- E2E 需要前後端兩個 server；殘留 process 以 `lsof -i :3005 -i :8787` 與 `ps aux | grep -E "next-server|wrangler|workerd"` 找出後逐一 `kill <PID>`，SHALL NOT `pkill -f`；跑完立刻清掉自己起的 process
- E2E 指令 MUST 為 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 [檔案...]`，SHALL NOT 用 `test:e2e -- --workers=1`
- 編輯器診斷不可信，一律以實跑 `pnpm -r exec tsc --noEmit` 的 exit code 為準
- Stop hook 會在主工作樹 `tsc` 失敗時擋下 session 結束；TDD RED 階段 import 尚不存在的 icons 本來就會讓 tsc 紅，這是預期行為，SHALL NOT 為放行 hook 而跳過或偽造紅燈
- 本 change 不得新增 npm 相依；`package.json`、`pnpm-lock.yaml`、`components/ui/**`、`app/globals.css`、`app/layout.tsx`、`public/icon.svg` 全程不變
