# Environment: navbar-narrow-viewport-fit

## Branch

- **Branch name**: `change/navbar-narrow-viewport-fit`
- **Base branch**: `main`

## Setup commands

> ⚠️ **不使用 git worktree**（2026-09-10 使用者指示，M10 起沿用）：直接在主 repo 的
> `change/navbar-narrow-viewport-fit` 分支上施工。禁止 `git worktree add`、禁止施工中切換分支、禁止 `git merge`。

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git switch -c change/navbar-narrow-viewport-fit main
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: PASS — 2026-10-09 實測 `pnpm test` 全綠：後端 4 檔 16 測試、前端 74 檔 766 測試；`navbar-rwd.spec.ts` chromium 5/5 通過
- **Initial commit hash**: `a79572659c22f02054a29fa8ee0e0c0231e85eb7`（本分支起點，含本 change artifacts 的 commit；parent 為 `main` @ `8a112c0`）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（本次不開 worktree）

## Teardown

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git branch -d change/navbar-narrow-viewport-fit
```

> apply 完成時不要執行 teardown；留給使用者在合併並歸檔後自行執行。

## 注意事項

- 後端測試跑真 workerd，沙箱中出現 `listen EPERM 127.0.0.1` 時放行後重跑，不是 baseline 失敗
- E2E 需要前後端兩個 server 同時運行；殘留 process 以 `lsof`／`ps` 找出後逐一 `kill <PID>`，SHALL NOT `pkill -f`
- 編輯器診斷不可信，一律以實跑 `tsc` 的 exit code 為準
- 本 change 不得新增 npm 相依；`package.json`、`pnpm-lock.yaml` 全程不變
