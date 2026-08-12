## Why

資料夾遷移在 repo 裡留下兩棵重複的樹，以及一個沒有入口文件的 agent 治理缺口。

實測（本 change 開工前）：

| 項目 | root | workspace |
|---|---|---|
| `.agents/` 受版控檔案 | 90 | 83 |
| `docs/superpowers/` 受版控檔案 | 2 | 8 |
| `skills-lock.json` | 有 | 有（**兩份皆入版控**） |
| `AGENTS.md` | **無** | 有（僅 5 行 Next.js 版本提醒，`grep -c openspec` = 0） |

`diff -rq nextjs-pickball/.agents .agents` 顯示 workspace 是 root 的**嚴格子集且零內容差異** ——
83 個檔案純粹是重複。但兩份 `skills-lock.json` **已經開始漂移**：
root 少了 3 個 skill 的鎖定條目（vercel-react-best-practices 等），workspace 少了 4 個
（next-cache-components-* 等），而那 7 個 skill 的**檔案**其實都在 root。

重複樹的實際傷害是：改動只落在其中一棵時，agent 讀到什麼規則取決於它從哪個目錄啟動。

另外 openspec 流程本身缺少對外入口：`AGENTS.md` 只有 vendor 的版本提醒，
非 Claude Code 的 agent 完全踩不到 `openspec/config.yaml` 的 TDD 規則。

## What Changes

### 合併重複樹（canonical = repo root）

- 刪除 `nextjs-pickball/.agents/`（83 個受版控檔，經 `diff -rq` 確認為 root 的子集且零差異）
- 合併兩份 `skills-lock.json` 至 root（7 個 skill 全數涵蓋），刪除 workspace 那份
- 將 `nextjs-pickball/docs/superpowers/` 的 8 個檔案 `git mv` 至 root `docs/superpowers/`
  - `nextjs-pickball/docs/` 只保留 `pickleball-guide.html`（已 gitignore，本機參考資產）

### 標註 docs 的狀態

- health 的 plan 與 design 兩份：標為「已由 `openspec/specs/api-connectivity/spec.md` 取代」
- `2026-05-14-multipage-content-deepening-design.md`：標為「**未執行**」
  —— 文中宣告拆為 3 個 change，但 archive 內無對應 change，`app/` 也無 learn / rules / equipment 路由

### 新增 root `AGENTS.md`

指向 `openspec/config.yaml` 與 `openspec/specs/`，明寫 change 流程、TDD 三步、
「紅燈要是真的」、單檔測試指令的正確形式、以及沙箱與埠號等執行環境注意事項。
**不直接複製 `nextjs-pickball/AGENTS.md`** —— 那 5 行是 Next.js 的版本警告，不是專案規範。

### archived tasks.md 加勾選比例註記

> ⚠️ **稽核的這條發現大部分是錯的，本 change 予以更正。**
>
> 稽核聲稱 6 個 archived change 的 task「全部 unchecked 就歸檔」。
> 以 `git show HEAD:<path>` 逐檔複核實際為：
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
> 也就是說 7 個 archived change 中有 5 個是完整勾選的，1 個差 1 個，只有 1 個真的沒勾。
> 註記仍加（讓比例可見），但描述改為據實陳述，**不事後補勾**（那會偽造當時的執行紀錄）。

### 更新結構圖（本 change 最後才做）

- root `CLAUDE.md` / `README.md`：補 `docs/`、`AGENTS.md`、`skills-lock.json`，
  並註明 `.agents/` 為唯一來源
- `nextjs-pickball/README.md:54`：移除誤畫在 workspace 內的 `openspec/`
  （root `README.md` 畫的位置是對的，錯的是 workspace 那張）

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `dev-workflow`（由 change ① 建立、④ 擴充）：3 條 ADDED
  1. agent 資產與設計文件只有一份來源
  2. 設計文件與正式規格的分工必須明確
  3. 歸檔前必須確認 task 狀態

## Impact

- **受影響檔案**
  - 刪除：`nextjs-pickball/.agents/`（83 檔）、`nextjs-pickball/skills-lock.json`
  - 搬移：`nextjs-pickball/docs/superpowers/` 8 檔 → `docs/superpowers/`
  - 新增：root `AGENTS.md`
  - 修改：root `skills-lock.json`（合併為 7 個 skill）、root `CLAUDE.md` / `README.md`、
    `nextjs-pickball/README.md`、`docs/superpowers/` 3 份加標註、archive 7 份 `tasks.md` 加註記
- **程式碼變更**：**零**（不動任何 `.ts` / `.tsx` / `.css`）
- **測試影響**：零，但需跑迴歸確認搬移未造成路徑斷裂
- **風險**
  - 刪除 workspace `.agents/` 後，若有工具硬編碼該路徑會失效。已用 `diff -rq` 確認為
    root 的嚴格子集，且 `.agents` 屬 agent 讀取的資產而非建置輸入
- **排序理由**：本 change **必須排最後** —— 結構圖要等所有檔案搬完才畫，先畫會畫錯兩次
