<!--
This file is a mandatory schema output; it records the isolated work environment.
The apply phase reads it on every start to confirm work is happening in the
correct branch (this batch does not use a git worktree — work happens on a
branch inside the main repo; see 注意事項 below).
-->

# Environment: matchmaker-stage-gaps

## Branch

- **Branch name**: `change/matchmaker-stage-gaps`
- **Base branch**: `main`

> ⚠️ **開分支前的前提**：本 change 是 M10～M15 這一批的第一棒，相依對象固定為
> `main @ 3fa2d22`（M3～M9 皆已合併並歸檔）。**不相依批次內其他 change**——與其餘五棒
> 不同，其餘五棒的 environment.md 須寫「前一棒 M(n-1) MUST 已合併回 main」，本 change
> 沒有這個前提，只要 `main` 上已含 `3fa2d22` 即可開分支。
>
> 開分支當下 `main` HEAD 為 `3fa2d224a0b5700f910656de07b03fe23b93f007`（`git rev-parse HEAD`
> 於 propose 階段實測）；本批其餘五棒（M11～M15）的 propose 或 apply 若與本 change 平行
> 進行，其異動一律落在各自獨立的分支／change 目錄，不影響本 change 的開分支前提。

## Setup commands

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git status --porcelain            # 必須為空才可開分支
git switch -c change/matchmaker-stage-gaps main
pnpm install
pnpm test
```

（這段是寫進文件給人看的，不是要你執行。）

## Verification

- **Baseline tests**: apply Step 0（2026-09-06）實測 `pnpm test` 全綠——
  `nextjs-pickball`：68 test files / 638 tests passed；`hono-pickball`：4 test files / 16 tests
  passed（workerd runtime，未出現 `listen EPERM`）。`pnpm install` 後 `git status --porcelain`
  為空、`pnpm-lock.yaml` 零變動。
- **Initial commit hash**: `3da4ce944e4b8c855686f41cb3c736341ff2027c`（於
  `change/matchmaker-stage-gaps` 上實測 `git rev-parse HEAD`）。與上方 propose 階段記載的
  `3fa2d22` 不同是預期內的：`main` 在 propose 之後多了三個**純文件** commit
  （`80143fa` 目錄索引、`70099ad` M10～M15 執行手冊、`3da4ce9` 六個 change 提案），
  皆不含任何 `nextjs-pickball/**` 程式碼異動；`git merge-base --is-ancestor 3fa2d22 main`
  已實測通過，開分支前提（`main` 含 `3fa2d22`）成立。
- **Worktree path** (absolute): `/Users/m2_24gb/Desktop/project/nextjs-pickball`
  （主 repo；本批不用 worktree，schema Step 0 的 cwd 檢查以此路徑為準）

## Teardown

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball
git switch main
git branch -d change/matchmaker-stage-gaps
```

> apply 完成時**不要**執行 teardown——change 當下多半尚未合併。Teardown 留給使用者在合併
> 並歸檔之後自行執行（`schema.yaml` 的 Forbidden 明文列出「Tearing down the worktree when
> apply completes」）。

## 注意事項

- **所有 subagent 都在主 repo 的 `change/matchmaker-stage-gaps` 分支上工作**；SHALL NOT
  `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`。apply 的 Step 0 除了用
  `Worktree path` 檢查 cwd，還 MUST 用 `git branch --show-current` 確認目前在該分支、
  `git status --porcelain` 為空；路徑必須是絕對路徑，相對路徑會讓該檢查失效。
- **本 repo 後端測試跑真 workerd**（miniflare），在受限沙箱中會噴
  `listen EPERM 127.0.0.1`——那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，
  放行後重跑即可（見 root `CLAUDE.md`）。`pnpm test` 是 `pnpm -r test`，會同時跑前後端，
  因此 baseline 若只在後端段落失敗且訊息為 EPERM，MUST 先放行再重跑，SHALL NOT 判定為
  baseline 不綠。**本 change 完全不觸碰 `hono-pickball/**`**，但收尾驗證仍須跑完整套
  `pnpm test`（`-r`，全 workspace），不得只跑前端。
- **E2E 需要前後端兩個 server 同時運行**（`playwright.config.ts` 有兩組 `webServer`）。
  若出現 `Worker "hono-pickball" not found`，先用 `lsof -i :3005 -i :8787` **並且**
  `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對殘留 process，
  找出**所有**殘留全數 kill，確認 port 釋放後再起單一組——**不要**把
  `~/.wrangler/registry` 不存在當成根因（wrangler 4.99 不靠該路徑做本機服務發現，
  root `CLAUDE.md` 有 2026-08-17 的實測紀錄）。
- worktree 內的 dev server 埠號與主工作區相同（前端 `:3005`、後端 `:8787`）。**兩邊不可同時
  起 server**，否則會互搶 port。跑完 E2E／preview 後 MUST 立刻清掉自己起的 process。
- E2E 一律帶 `--workers=1`（root `CLAUDE.md`：預設併發下本機不穩定，曾有 change 實測三次
  每次失敗集合都不同）。
- 本 change 的 E2E 新增測試涉及**多頁面導覽**（`/matchmaker` ↔ `/matchmaker/players`）與
  **一次比分送出**，皆為既有頁面既有操作的組合，不需要任何新的 Playwright fixture 或
  webServer 設定。
- 本 change 只動 `nextjs-pickball/components/matchmaker/**` 與
  `nextjs-pickball/tests/e2e/specs/**` 兩處既有目錄下的既有檔案（`MatchStage.tsx`、
  `HistoryView.tsx`）＋一個新檔（`EmptyMatches.tsx`），不動 `hono-pickball/**`；但
  `pnpm test`／`pnpm typecheck` 仍為 `-r`（全 workspace），收尾驗證 MUST 跑完整套而非只跑
  前端。
- **本 change 不得新增任何 npm 相依**，因此 `pnpm install` 之後 `pnpm-lock.yaml` 與
  `package.json` MUST 全程保持未變動（收尾驗證會機械確認 `git diff` 為空）。
- **本 change 不新增任何 hook**，`hooks/` 目錄零新增或修改檔案（收尾驗證會以
  `git diff --stat hooks/` 機械確認為空）。
