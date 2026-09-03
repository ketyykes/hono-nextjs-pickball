# Environment — matchmaker-data-transfer（M8）

本 change 在**獨立的 git worktree** 中執行。apply 的 Step 0 每次啟動都會讀本檔，
確認目前工作目錄就是下方宣告的 worktree；不是的話先 `cd` 進去（已存在）或跑
Setup commands 建立（不存在）。

## Branch

- **Branch name**: `change/matchmaker-data-transfer`
- **Base branch**: `main`

> ⚠️ **開 worktree 前先確認 `main` 已含 M5**（連帶含 M3 與 M4）。
> 本 change 的 `transfer-types.ts` 必須 import M4 定案的回合與歷史 schema，
> base 若不含 M4，§2 之後的任務全數無法進行。
>
> ⚠️ **`main` 也必須已含 M6（`matchmaker-scoreboard-binding`）**。
> §7.2 的 `CLEAR_ALL_KEYS` 硬相依於 M6 的 `lib/scoreboard/match-slots.ts`
> 所匯出的 `MATCH_SLOTS_KEY`，M6 未合併時該 import 會讓 `tsc` 直接失敗，
> 而改為硬編字串或省略該 key 都違反 delta spec。
>
> ⚠️ **M7（`matchmaker-history-page`）若已合併**，本 change 對
> `lib/matchmaker/section-nav.ts` 與 `section-nav.test.ts` 的改動 MUST 保留 M7 的「歷史」分頁，
> 最終分頁順序為對戰／參賽者／歷史／資料。
>
> 確認方式與未達成時的處置見 `tasks.md` §0.1 與 `execution-plan.md` 的 Escalation。

## Setup commands

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-data-transfer -b change/matchmaker-data-transfer main
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-data-transfer
pnpm install
pnpm test
```

## Verification

- **Baseline tests**: `PASS` — hono-pickball 4 檔 16 tests、nextjs-pickball 57 檔 486 tests 全綠
  （2026-09-02 於 worktree 內執行 `pnpm test`，exit code 0；後端未出現 `listen EPERM`）
- **Initial commit hash**: `da9cfd2`（`git rev-parse HEAD`，即 `main` 上含 M3～M7 的 base commit）
- **Worktree path**: `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-data-transfer`

## Teardown

工作完成**並合併回 `main` 之後**才執行；apply 完成時 SHALL NOT 自行拆除
（change 可能尚未合併）。

```bash
git worktree remove /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-data-transfer
git branch -d change/matchmaker-data-transfer
```

## 注意事項

- **pnpm 的 lockfile 只在 repo root**，worktree 是完整的 repo 副本，
  `pnpm install` 需在 worktree 根目錄執行（上方 Setup commands 已是此順序）。
- **本 repo 後端測試跑真 workerd**（miniflare），在受限沙箱中會噴
  `listen EPERM 127.0.0.1`——那是 miniflare 需要開 localhost server 被擋，
  **不是設定錯誤**，放行後重跑即可（見 root `CLAUDE.md`）。
- **E2E 需要前後端兩個 server 同時運行**（:3005 與 :8787），`playwright.config.ts` 的
  `webServer` 會自動帶起。若出現 `Worker "hono-pickball" not found`，先用
  `lsof -i :3005 -i :8787` 與 `ps aux | grep -E "wrangler|workerd|next"` 找出**所有**
  殘留 process 全數 kill，再起單一組；**不要把 `~/.wrangler/registry` 目錄不存在當成根因**。
- **多個 milestone 的 worktree 會並存**（M6／M7／M9 各自一份），
  它們共用同一組本機 port。跑 E2E 前先確認沒有其他 worktree 的 dev server 佔用 :3005／:8787。
- 本 change **除 `lib/matchmaker/section-nav.ts` 與 `section-nav.test.ts`（新增資料頁分頁，
  見 `tasks.md` §8.2a）外只允許新增檔案**：`nextjs-pickball/lib/matchmaker/` 下六個新模組與其測試、
  `app/matchmaker/data/page.tsx`、`components/matchmaker/` 下的新元件、一支新 E2E spec，
  以及 `openspec/changes/matchmaker-data-transfer/` 底下的 artifact。
  `git status` 若出現 `openspec/specs/**`、`prd.md` 或 `lib/matchmaker/storage.ts`
  等既有檔案的改動，代表越界（見 `tasks.md` §9.8）。
