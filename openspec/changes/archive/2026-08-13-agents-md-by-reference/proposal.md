## Why

root `AGENTS.md` 與 root `CLAUDE.md` 目前各自記載了一份 root 層規範，兩者有大量重疊（monorepo 定位、單檔測試指令與 `--run` 陷阱、openspec CLI 從 root 執行、`.agents/` 與 `docs/` 的目錄約定）。同一條規則存在兩處就會各自演化：改動只落在其中一份時，agent 讀到的規則取決於它先開哪個檔案 —— 這正是 dev-workflow spec 已為 `.agents/` 與 `skills-lock.json` 認定過的傷害模式（實測兩份 lock 檔各漂移 3、4 個條目），只是這次漂移的對象換成規範文件本身。

現行 spec 反而把這個重複寫死成要求：`openspec/specs/dev-workflow/spec.md` 的 Scenario「root AGENTS.md 指向規格治理」要求 `AGENTS.md` **內容包含** openspec change 流程、TDD 三步與單檔測試指令的正確形式，而這三項在 `CLAUDE.md` 同樣必須存在。要消除漂移就必須先改這條 Requirement。

## What Changes

- root `AGENTS.md` 改為**純指標檔**：只保留「該讀哪些檔案」的相對路徑表，不再記載任何規則內文；並明示「要新增規則請寫進 `CLAUDE.md`，不要寫在本檔」
- root `CLAUDE.md` 成為 root 層規範的**單一來源**，吸收原先只存在於 `AGENTS.md` 的三段內容：
  - 新增「不可省略的規則」：openspec change 流程要求、主 spec 不可直接編輯（含前科 commit `e5b709c`、`c7f4f7e`、`ea7955d`）、TDD 三步、紅燈要是真的／禁止 mutation check 偽造
  - 新增「執行環境注意」：dev server 埠號（前端 :3005、後端 :8787）、workerd `listen EPERM 127.0.0.1` 非設定錯誤、E2E 兩組 `webServer` 與 service binding 依賴
  - 「OpenSpec 慣例」補上 `DO_NOT_TRACK=1` 建議，並補齊指向 `openspec/config.yaml` 與 `openspec/specs/` 的連結，使 `CLAUDE.md` 自足
- **BREAKING**（對規格而言）：dev-workflow 中 root `AGENTS.md` 的內容要求反轉 —— 從「MUST 包含規則內文」改為「MUST 以相對路徑指向 `CLAUDE.md`，SHALL NOT 重複記載規則內文」。既有的 `archive/2026-08-12-docs-and-agent-tree-consolidation` 驗收指令 `grep -c "openspec" AGENTS.md` 仍會通過（指標表格含 `openspec/config.yaml` 與 `openspec/specs/`）
- root `README.md` 結構圖對 `AGENTS.md` 的一行描述同步為「只放指標」

不改動範圍：`nextjs-pickball/AGENTS.md`（Next.js vendor 注入的 `BEGIN:nextjs-agent-rules` 區塊）與 `nextjs-pickball/CLAUDE.md` 首行的 `@AGENTS.md` import 皆維持原狀 —— 那是 workspace 層的 vendor 資產，與 root 層的指標方向無關。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `dev-workflow`: Requirement「agent 資產與設計文件只有一份來源」中關於 root `AGENTS.md` 的條款改為指標檔要求；其 Scenario「root AGENTS.md 指向規格治理」的驗收條件隨之反轉為「只含指標、規則內文只出現於 `CLAUDE.md`」

## Impact

- `AGENTS.md`（重寫為指標檔，46 行 → 約 30 行）
- `CLAUDE.md`（新增「不可省略的規則」「執行環境注意」兩節，擴充「OpenSpec 慣例」）
- `README.md`（結構圖一行描述）
- `openspec/specs/dev-workflow/spec.md`（經 delta spec 套用）
- 無程式碼、API、依賴變更；不影響建置與部署，故無 TDD 三步適用對象（純文件治理變更，以 grep 驗收）
