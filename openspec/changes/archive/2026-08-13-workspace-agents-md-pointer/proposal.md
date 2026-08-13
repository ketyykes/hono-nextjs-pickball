## Why

`2026-08-13-agents-md-by-reference` 把 root `AGENTS.md` 整成了指標檔，讓非 Claude Code 的 agent 有一條路走到規範單一來源 `CLAUDE.md`。但那次只處理 root —— **workspace 層的入口至今是斷的**：

- `nextjs-pickball/AGENTS.md` 全檔 5 行，整份包在 Next.js 官方的 `<!-- BEGIN:nextjs-agent-rules -->` / `<!-- END:nextjs-agent-rules -->` vendor 標記內，標記外零內容。只認 `AGENTS.md` 的 agent（Codex、Cursor 等）從 `nextjs-pickball/` 進來，只會看到一句框架版本警語，拿不到 openspec change 流程、TDD 三步、`--run` 前不可加 `--`、埠號 3005 這些會直接讓它做錯事的規則。
- `hono-pickball/` 連 `AGENTS.md` 都沒有，從後端 workspace 進來是一片空白。
- `nextjs-pickball/CLAUDE.md:1` 的 `@AGENTS.md` 只對 Claude Code 生效，而且方向相反（CLAUDE.md 吃 AGENTS.md，不是 AGENTS.md 指回去），補不了這個洞。

這不是漏改而是**規格覆蓋範圍的空缺**：`openspec/specs/dev-workflow/spec.md` 的 Requirement「agent 資產與設計文件只有一份來源」主詞是 root `AGENTS.md`，workspace 那份不在管轄內。`2026-08-12-docs-and-agent-tree-consolidation` 的稽核正是因此「合法地」跳過它（`design.md:80` 明寫不刪，理由是「vendor 區塊仍有價值，只是不該是唯一的入口」）—— 但「不該是唯一入口」這句只留在 design，沒有落進 spec。不補這個缺口，下次稽核還是會跳過，過幾個月又漂回去。

## What Changes

- **`nextjs-pickball/AGENTS.md`**：在 `<!-- END:nextjs-agent-rules -->` **之後**新增專案指標段，指向同層 `./CLAUDE.md`、root `../AGENTS.md` 與 `../CLAUDE.md`，並比照 root 的警語提醒不會跟隨連結的工具主動讀入。寫在標記外是硬性要求 —— Next.js 官方文件（`nextjs-pickball/node_modules/next/dist/docs/01-app/02-guides/ai-agents.md:99`）明講標記內歸 Next.js 管、未來更新會覆寫。
- **`nextjs-pickball/AGENTS.md` vendor 區塊**：標記內文字是舊版範本（`# This is NOT the Next.js you know`），已安裝的 next 為 `16.2.9`。同步為官方現行範本（同檔 `:66-74`）。
- **`hono-pickball/AGENTS.md`**：新增（純指標，無規範內文），與前端對稱。
- **`README.md:72`**：目前寫「前端規範：見 `nextjs-pickball/CLAUDE.md`、`nextjs-pickball/AGENTS.md`」，但後者不含任何專案規範。修正措辭並補上後端的 `AGENTS.md`。
- **`openspec/specs/dev-workflow/spec.md`**：把「agent 資產與設計文件只有一份來源」的 Requirement 從 root 擴充到 workspace 層，並明確排除 vendor 管理區塊與 `.agents/skills/` 下的第三方資產。

非破壞性變更：既有的 `@AGENTS.md` import、vendor 標記語意、root `AGENTS.md` 皆維持不動。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `dev-workflow`: Requirement「agent 資產與設計文件只有一份來源」的約束對象由 root `AGENTS.md` 擴充為「repo 內每一個含 `CLAUDE.md` 的目錄」，新增三項義務——該目錄 MUST 有 `AGENTS.md`、其內容 MUST 指向同層 `CLAUDE.md` 與 root `AGENTS.md`、專案指標 MUST 位於 vendor 管理區塊之外；並明訂 `.agents/skills/` 下的第三方 skill 資產不在此義務範圍。

## Impact

**受影響檔案**（全為文件，無程式碼）：

| 檔案 | 動作 |
|---|---|
| `nextjs-pickball/AGENTS.md` | 修改（vendor 區塊同步 + 標記外新增指標段） |
| `hono-pickball/AGENTS.md` | 新增 |
| `README.md` | 修改（`:72` 措辭 + 補後端連結） |
| `openspec/specs/dev-workflow/spec.md` | 修改（經本 change 的 delta spec） |
| `CLAUDE.md`（root） | 修改（「執行環境注意」補一項稽核陷阱，見下方註） |

> `CLAUDE.md` 的異動是 verify 階段的發現：驗證主 spec 有無重複條目時，macOS 的 BSD `uniq`
> 把內容不同的中文標題誤判為重複，謊報了兩筆不存在的重複。這種「錯誤訊息不是它看起來的樣子」
> 的環境陷阱與既有的 `listen EPERM 127.0.0.1` 同性質，屬 root 層規範內文，
> 依既有分工只能記在 root `CLAUDE.md`。未寫進 spec —— 它是工具行為的提醒，不是專案的行為要求。

**不受影響**：`AGENTS.md`（root）、`nextjs-pickball/CLAUDE.md`、`hono-pickball/CLAUDE.md`、任何原始碼。

**TDD 適用性**：本 change 全部落在 `openspec/config.yaml` 定義的 TDD 範圍之外（該範圍為 `nextjs-pickball/{app,components,hooks,lib,data}/**` 與 `hono-pickball/src/**`，`.md` 完全不在內）。依「例外層 task 不強制三步拆分，但至少要指定驗收方式」處理，驗收改用可在 shell 執行的 `grep` / `ls` 檢查。**不得為了湊三步而偽造紅燈。**

**風險**：`nextjs-pickball/AGENTS.md` 的 vendor 標記內文字未來可能被 Next.js 的更新或 `npx @next/codemod agents-md` 覆寫。本 change 把專案指標放在標記外正是為了讓那種覆寫不會波及指標段；delta spec 的 Scenario 亦以「標記外存在指標」為驗收條件，而非鎖定標記內的特定文字。
