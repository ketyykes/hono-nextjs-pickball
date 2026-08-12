# Tasks — docs-and-agent-tree-consolidation

> **全數例外層，零程式碼變更，無 TDD**（依據見 design.md）。
> 本 change **必須排最後** —— 結構圖要等所有檔案搬完才畫。

## A. 合併重複樹（canonical = repo root）

- [x] **A1** 合併兩份 `skills-lock.json` 至 root
  - ⚠️ **必須合併不能二選一**：root 專有 4 個（next-cache-components-* 等）、
    workspace 專有 3 個（vercel-react-* / web-design-guidelines），但那 7 個 skill 的**檔案全在 root**。
    直接保留 root 會讓 3 個 skill 變成無鎖定狀態
  - 合併後 7 個 skill，依名稱排序寫回 root
- [x] **A2** `git rm -r nextjs-pickball/.agents`（83 個受版控檔）
  - 前置確認：`diff -rq nextjs-pickball/.agents .agents` → workspace 為 root 的嚴格子集，
    無 `Only in nextjs-pickball`、無 `Files ... differ` ✅
- [x] **A3** `git rm nextjs-pickball/skills-lock.json`
- [x] **A4** `git mv` 8 個 `nextjs-pickball/docs/superpowers/**` 至 `docs/superpowers/`
  - 合併後 root `docs/` 共 10 檔（原 2 + 搬入 8）
- [x] **A5** 清理 `nextjs-pickball/docs/` 下的空目錄；只保留 `pickleball-guide.html`（已 gitignore）

## B. 標註 docs 狀態

- [x] **B1** health 的 plan 與 design 兩份標為「已由 `openspec/specs/api-connectivity/spec.md` 取代」
- [x] **B2** `2026-05-14-multipage-content-deepening-design.md` 標為「**未執行**」
  - 依據：文中宣告拆為 3 個 change，但 archive 內無對應 change；
    `ls nextjs-pickball/app/` 亦無 learn / rules / equipment 路由；
    對應的 phase-a plan 全部 checkbox 未勾

## C. root AGENTS.md

- [x] **C1** 新增 root `AGENTS.md`，指向 `openspec/config.yaml` 與 `openspec/specs/`
  - 內容涵蓋：change 流程要求、TDD 三步、「紅燈要是真的」、單檔測試指令正確形式、
    沙箱 EPERM、埠號 3005/8787、E2E 雙 webServer、agent 資產單一來源
  - **不複製 `nextjs-pickball/AGENTS.md`** —— 那 5 行是 Next.js vendor 版本警告，
    `grep -c openspec` = 0，不是專案規範

## D. archived tasks.md 註記

> ⚠️ **稽核的這條發現大部分不成立，本 change 更正。**
> 以 `git show HEAD:<path>` 逐檔複核的實際勾選狀況：
>
> | change | 已勾 / 未勾 |
> |---|---|
> | add-pickleball-guide-page | **48 / 0** |
> | make-tocbar-fixed-overlay | **11 / 0** |
> | add-scoreboard | **33 / 0** |
> | quiz-feature | **20 / 0** |
> | align-content-under-navbar | **24 / 0** |
> | align-guide-spec-with-code | 8 / 1 |
> | **add-tour-experience** | **0 / 45** ← 唯一真的全未勾 |
>
> 稽核聲稱「6 個 change 全部 unchecked 就歸檔」，實際上 5 個是 100% 勾選。

- [x] **D1** 7 份 archived `tasks.md` 加頁首註記，載明實際勾選比例與新的歸檔紀律
- [x] **D2** **不事後補勾** —— 那會偽造當時的執行紀錄。檔案是歷史，不是待辦清單

## E. 結構圖（最後才做）

- [x] **E1** root `CLAUDE.md` 結構圖補 `docs/`、`AGENTS.md`、`skills-lock.json`，
      並註明 `.agents/` 為唯一來源、`docs/` 與 `openspec/` 的分工
- [x] **E2** root `README.md` 結構圖同步
- [x] **E3** `nextjs-pickball/README.md` 移除誤畫在 workspace 內的 `openspec/`
  - ⚠️ root `README.md` 畫的位置是**對的**，錯的是 workspace 那張。不要「統一」成錯的那個

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# 1. 重複樹歸零
git ls-files "*/.agents/*" | wc -l                    # 期望 0
git ls-files "*skills-lock.json" | wc -l              # 期望 1
git ls-files nextjs-pickball/docs | wc -l             # 期望 0（pickleball-guide.html 已 gitignore）
git ls-files docs | wc -l                             # 期望 10

# 2. skills-lock 涵蓋全部 skill
python3 -c "import json;d=json.load(open('skills-lock.json'));print(len(d['skills']),'skills')"   # 期望 7
ls .agents/skills | wc -l                             # 應與上者一致

# 3. AGENTS.md 存在且指向規格治理
grep -c "openspec" AGENTS.md                          # 期望 > 0

# 4. 標註齊備
grep -l "📌" docs/superpowers/**/*.md | wc -l          # 期望 3
grep -l "歸檔紀錄說明" openspec/changes/archive/*/tasks.md | wc -l   # 期望 7

# 5. 迴歸（搬移未造成路徑斷裂）
pnpm --filter ./nextjs-pickball test --run            # 期望 23 檔 114 測
pnpm lint
pnpm -r exec tsc --noEmit

DO_NOT_TRACK=1 openspec validate docs-and-agent-tree-consolidation --strict
```
