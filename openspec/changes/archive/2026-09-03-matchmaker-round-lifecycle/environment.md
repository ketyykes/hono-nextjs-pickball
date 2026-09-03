# Environment — matchmaker-round-lifecycle（M4）

本 change 在**獨立的 git worktree** 內執行。apply 每次啟動都會讀本檔，確認工作目錄就是下方宣告的 worktree（Step 0）。所有被派工的 subagent 共用**同一個** worktree，SHALL NOT 各自再開一個。

## Branch

- **Branch name**：`change/matchmaker-round-lifecycle`
- **Base branch**：`main`

> ⚠️ **開分支前必須確認 M3（`matchmaker-rating-engine`）已合併回 `main`**。本 change 的比分送出 pipeline 直接消費 M3 的評分 API，`main` 上沒有它時 §6 的 RED 測試寫不出來（見 proposal 的「執行相依」與 tasks §0.1）。

## Setup commands

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-round-lifecycle -b change/matchmaker-round-lifecycle main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-round-lifecycle
pnpm install
pnpm test
```

## Verification

| 欄位 | 值 |
|---|---|
| **Baseline tests** | **PASS**——`pnpm test`（worktree root，2026-08-23）：前端 41 檔／299 測試全綠、後端 4 檔／16 測試全綠，exit code 0；後端未出現 `listen EPERM` |
| **Initial commit hash** | `e3477eb`（`main` 的 merge commit「feat(matchmaker): 合併評分引擎（PRD 6.4）」，即 M3 合併點） |
| **Worktree path** | `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-round-lifecycle` |

回填時 `Baseline tests` 請寫 `PASS` 或 `FAIL` 並附一行結果摘要（例如兩個 workspace 的檔數與測試數）；baseline 不是綠燈就**停下來回報，不要開始任何 task**。

## Teardown

工作完成**且已合併**之後才執行；apply 結束時 SHALL NOT 自行拆除（change 可能尚未合併）。

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-round-lifecycle
git branch -d change/matchmaker-round-lifecycle
```

## 注意事項

- **後端測試跑在真正的 workerd runtime**：在受限沙箱中會噴 `listen EPERM 127.0.0.1`，那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可（見 root `CLAUDE.md`）。本 change 只動前端，但 `pnpm test` 是 `pnpm -r test`，後端那半仍會跑。
- **單檔測試指令**：`pnpm --filter ./nextjs-pickball test --run <path>`。**`--run` 前不可加 `--`**——加了 vitest 會收不到路徑而跑完整套，TDD 的紅燈證據會被既有綠燈淹沒。
- **Node 版本以 repo root 的 `.node-version` 為準**（`22.22.1`）；worktree 內兩份 `.node-version` 若不一致，以 root 那份為準。
- **pnpm workspace**：lockfile 只在 repo root，worktree 是完整的 repo 複本，`pnpm install` 需在 worktree 根目錄執行。
- **本 change 會修改 `openspec/specs/pickleball-guide-page/spec.md` 的一行**（hooks 歸屬清單）。這是刻意且範圍受限的例外，理由見 design Decision 9；Step 0 完成後、開始 §1 之前 MUST 先跑 tasks §0.2 的對齊檢查——若別的 change 已先合併並在該清單新增了 hook，本 change 的 delta 必須先重新對齊為 union（只加不刪），否則套用時會把對方的項目刪掉。
- **`pnpm dev` 不需要在本 change 中啟動**：本 change 無 UI，驗證全靠 Vitest。若為了跑 §9.6 的 e2e 而啟動 server，先用 `lsof -i :3005 -i :8787` 與 `ps aux | grep -E "wrangler|workerd|next"` 確認沒有殘留的 dev server 互搶 port（root `CLAUDE.md` 記載過此地雷）。
