# Environment — matchmaker-scoreboard-binding

本 change 於**獨立 git worktree** 內實作。apply 的 Step 0 會讀本檔確認 cwd 是否為下方宣告的 worktree；
所有被派工的 subagent 共用**同一個** worktree，SHALL NOT 各自另建。

## Branch

- **Branch name**: `change/matchmaker-scoreboard-binding`
- **Base branch**: `main`

> ⚠️ **開 worktree 前必須先確認 M5（`matchmaker-match-stage-ui`）已合併回 `main`**（M3／M4 隨之在內）。
> 未合併就從 `main` 開出，`lib/matchmaker/` 不會有回合模組與送出 pipeline，tasks §0 的對齊步驟會全數落空。
> 確認方式：`main` 上存在 M4 的回合模組與 M5 的對戰頁路由（實際路徑見 tasks §0.1、§0.4）。

## Setup commands

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-scoreboard-binding -b change/matchmaker-scoreboard-binding main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-scoreboard-binding
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: 尚未執行——由 apply Step 0 建立 worktree 時執行並回填（格式：`PASS` / `FAIL` + 一行結果摘要，例如 `PASS — hono-pickball 4 files / 16 tests，nextjs-pickball N files / M tests 全數通過`）
- **Initial commit hash**: 尚未執行——由 apply Step 0 建立 worktree 時執行 `git rev-parse HEAD` 並回填
- **Worktree path**: `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-scoreboard-binding`

## Teardown

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-scoreboard-binding
git branch -d change/matchmaker-scoreboard-binding
```

> Teardown 由**使用者**在確認合併後自行執行。apply 完成時 SHALL NOT 自動拆除 worktree
> ——此時 change 可能尚未合併回 `main`。

## 注意事項

- **後端測試跑在真正的 workerd runtime**：在受限沙箱中 `pnpm test` 會噴 `listen EPERM 127.0.0.1`，那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可（見 root `CLAUDE.md`）。
- **E2E 需前後端同時運行**：`playwright.config.ts` 的 `webServer` 有兩組（先 hono-pickball :8787、再 Next.js :3005）。若出現 `Worker "hono-pickball" not found`，先用 `lsof -i :3005 -i :8787` 與 `ps aux | grep -E "wrangler|workerd|next"` 找出**所有**殘留 process 全數 kill，確認 port 釋放後再起單一組；**不要**把 `~/.wrangler/registry` 不存在當成根因（root `CLAUDE.md` 有實測記錄）。
- **worktree 與主工作區共用同一組 port**：本 change 的 E2E 需要 :3005 與 :8787，跑之前確認主工作區沒有正在執行的 `pnpm dev`。
- **`pnpm install` 必須在 worktree 內跑一次**：node_modules 不隨 worktree 共用；lockfile 只在 repo root，pnpm 會依 workspace 定義安裝。
- **Node 版本以 root `.node-version` 為準**（`22.22.1`），pnpm 為 `10.17.0`。
- **本 change 的 LocalStorage 影響面**：新增 `scoreboard:matches:v1`。手動驗證前若要重現乾淨狀態，清除 `scoreboard:matches:v1`、`scoreboard:current:v1`、`matchmaker:round:v1` 三個 key 即可，**不需**清 `matchmaker:roster:v1`（清了要重建參賽者，徒增前置成本）。
