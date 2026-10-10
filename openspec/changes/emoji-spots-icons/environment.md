# Environment: emoji-spots-icons

## Branch

- **Branch name**: `change/emoji-spots-icons`
- **Base branch**: `change/remove-emoji`

> 注意：`change/remove-emoji` 已 archive 但**尚未併入 `main`**；本 change 修改的 `emoji-free-ui` 主 spec 只存在於該分支，
> 因此以它為基底。日後併入 `main` 時兩個分支一起 fast-forward。

## Setup commands

> 注意：**不使用 git worktree**（2026-09-10 使用者指示，M10 起沿用）：直接在主 repo 的
> `change/emoji-spots-icons` 分支上施工。禁止 `git worktree add`、禁止施工中切換分支、禁止 `git merge`。

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git switch -c change/emoji-spots-icons change/remove-emoji
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: PASS — 2026-10-10 實測 `pnpm test` 全綠：後端 4 檔 16 測試、前端 81 檔 782 測試
- **Initial commit hash**: `2d82e57`（含本 change artifacts；parent 為 `change/remove-emoji` @ `172071d`）
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`（本次不開 worktree）

## Teardown

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git branch -d change/emoji-spots-icons
```

> apply 完成時不要執行 teardown；留給使用者在合併並歸檔後自行執行。

## 注意事項

- 所有 subagent 共用同一個工作樹，SHALL NOT 各自 `git worktree add`；coordinator 在 subagent 施工期間 SHALL NOT 改動 repo 內任何檔案
- 後端測試跑真 workerd，沙箱中出現 `listen EPERM 127.0.0.1` 時放行後重跑，不是 baseline 失敗
- E2E 需要前後端兩個 server；殘留 process 以 `lsof -i :3005 -i :8787` 找出後逐一 `kill <PID>`，SHALL NOT `pkill -f`
- E2E 指令 MUST 為 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 [檔案...]`
- 編輯器診斷不可信，一律以實跑 `pnpm -r exec tsc --noEmit` 的 exit code 為準
- 不得新增 npm 相依；`package.json`、`pnpm-lock.yaml`、`components/ui/**`、`app/globals.css`、`app/layout.tsx`、`public/icon.svg` 全程不變
