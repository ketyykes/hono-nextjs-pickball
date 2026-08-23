# environment（quick-rating-spec-backfill）

本 change 在**獨立 git worktree** 內執行。apply 每次開始前都會讀本檔確認 cwd 就是這裡宣告的 worktree（schema apply Step 0）。

## Branch

- **Branch name**：`change/quick-rating-spec-backfill`
- **Base branch**：`main`

> **執行相依：無**。本 change 回填的行為**早已在 `main` 上**（M1 `add-player-roster` 已歸檔），
> 因此 worktree 可隨時從 `main` 開出。與 M3～M9 七個 change **皆可平行、任何順序合併**——
> 本 change 只 ADDED 一條新 Requirement，不 MODIFY 任何既有 Requirement，
> 與 M4／M6 的 `player-roster` MODIFIED delta 作用在主 spec 的不同區塊（見 `proposal.md` 的衝突確認表）。

## Setup commands

在 repo root（`/Users/m2_24gb/Desktop/project/nextjs-pickball`）依序執行：

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/quick-rating-spec-backfill -b change/quick-rating-spec-backfill main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/quick-rating-spec-backfill
pnpm install
pnpm test
```

## Verification

| 欄位 | 值 |
|---|---|
| **Baseline tests** | 尚未執行——由 apply Step 0 建立 worktree 時執行並回填（格式：`PASS`／`FAIL` + 一行結果摘要，例如 `PASS — 前端 Vitest N passed、後端 Vitest M passed`） |
| **Initial commit hash** | 尚未執行——由 apply Step 0 建立 worktree 時以 `git rev-parse HEAD` 取得並回填 |
| **Worktree path** | `/Users/m2_24gb/Desktop/project/pickball-worktrees/quick-rating-spec-backfill` |

## Teardown

**work 完成且已合併回 `main` 之後**再執行（apply 完成時**不要**拆掉——change 當下可能還沒合併）：

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/quick-rating-spec-backfill
git branch -d change/quick-rating-spec-backfill
```

## 注意事項

- **worktree 路徑刻意放在 repo 之外**（`../pickball-worktrees/`）：放在 repo 內會被 Next.js 的檔案監看與 Vitest 的 `include` 掃到，造成同一份測試被跑兩次。
- **`pnpm install` 不可省略**：worktree 是全新的工作目錄，沒有 `node_modules`。root `pnpm-workspace.yaml` 的 `onlyBuiltDependencies: esbuild, workerd` 不可移除，否則 wrangler dev 與 OpenNext build 會失敗。
- **後端測試跑在真正的 workerd runtime**：受限沙箱中會噴 `listen EPERM 127.0.0.1`，那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可（見 root `CLAUDE.md`）。baseline 因此有可能在第一次執行時假性失敗，請放行後重跑再判定。
- **本 change 只動前端測試檔**，日常跑單檔用 `pnpm --filter ./nextjs-pickball test --run components/matchmaker/PlayerForm.test.tsx`（**`--run` 前不可加 `--`**）；但 Step 0 的 baseline 與 Final Review 仍須跑**完整** `pnpm test`（前後端都跑）。
- **本 change 含 E2E**：`pnpm test:e2e` 的 `webServer` 有兩組，會自動先起後端（:8787）再起前端（:3005），兩者同時運行 service binding 才通。若出現 `Worker "hono-pickball" not found`，**先查有沒有殘留的重複 dev server**——`lsof -i :3005 -i :8787` 與 `ps aux | grep -E "wrangler|workerd|next"` 找出**所有**殘留 process 全數 kill，確認 port 釋放後再起單一組（見 root `CLAUDE.md`；不要把 `~/.wrangler/registry` 不存在當成根因）。
- **首次在 worktree 跑 E2E 可能需要安裝瀏覽器**：若 Playwright 回報缺 browser binary，在 worktree 內跑 `pnpm --filter ./nextjs-pickball exec playwright install`；這是環境安裝，不算本 change 的程式碼變更。
- **所有派工的 subagent 共用這一個 worktree**，禁止各自再開 worktree（schema apply Forbidden 明列）。
- root `.claude/settings.json` 的 hooks 在 worktree 內同樣生效：編輯前端檔會觸發逐檔 ESLint（錯誤以 exit 2 擋下），session 停止時跑 `pnpm -r exec tsc --noEmit`。**該 tsc 指令不含 `hono-pickball/test/**` 的型別**，但本 change 不動後端，無影響。
