## Context

root 目前有兩份平行的規範文件：

| 段落 | `AGENTS.md` | `CLAUDE.md` |
|---|---|---|
| monorepo 定位一句話 | 有 | 有 |
| 單檔測試指令 + `--run` 前不可加 `--` | 有 | 有 |
| openspec CLI 從 root 執行 | 有 | 有 |
| `.agents/` / `skills-lock.json` 單一來源 | 有（目錄約定） | 有（結構圖） |
| `docs/` vs `openspec/specs/` 分工 | 有 | 有（結構圖 + blockquote） |
| openspec change 流程、主 spec 不可直接改 | **只有 AGENTS.md** | 無 |
| TDD 三步、紅燈要是真的 | **只有 AGENTS.md** | 無 |
| workerd `EPERM`、dev 埠號、E2E webServer | **只有 AGENTS.md** | 部分（埠號在指令表） |
| 結構圖、環境版本、CF 部署架構、部署前檢查 | 無 | **只有 CLAUDE.md** |

重疊的五列是漂移風險；「只有其中一邊」的兩組則代表兩份都不自足 —— agent 從哪一份進來，讀到的規範就少一塊。

約束來自現行 spec 本身：`openspec/specs/dev-workflow/spec.md` 的 Scenario「root AGENTS.md 指向規格治理」要求 `AGENTS.md` 內容**包含** openspec change 流程、TDD 三步與單檔測試指令的正確形式。這條把重複寫成了義務，因此必須連同修改，否則收斂即違規。

## Goals / Non-Goals

**Goals:**

- root 層規範內文只存在於一個檔案，改規則時不需要同步兩處
- 兩個入口（`AGENTS.md` / `CLAUDE.md`）任一進入都能拿到完整規範，不會少一塊
- 非 Claude 的 coding agent 仍能循標準 markdown 相對路徑抵達規範
- dev-workflow spec 與實際檔案結構一致，`openspec validate` 通過

**Non-Goals:**

- 不動 `nextjs-pickball/AGENTS.md`（Next.js vendor 注入的 `BEGIN:nextjs-agent-rules` 區塊）與 `nextjs-pickball/CLAUDE.md` 首行的 `@AGENTS.md` import —— 那是 workspace 層的 vendor 資產
- 不把 `openspec/config.yaml` 的 TDD 細則搬進 `CLAUDE.md`；`config.yaml` 仍是 TDD 適用範圍與例外層的權威來源，`CLAUDE.md` 只放「不可省略」的摘要並指過去
- 不引入任何自動化檢查（本專案無 CI），驗收維持人工 grep

## Decisions

### D1｜以 `CLAUDE.md` 為單一來源，`AGENTS.md` 為指標

**替代方案**：反過來以 `AGENTS.md` 為主檔，`CLAUDE.md` 首行寫 `@AGENTS.md` —— 這與 `nextjs-pickball/CLAUDE.md` 現有方向一致，且 `@` import 由 Claude Code 實際載入內容，不依賴模型自覺去點連結。

**選擇 `CLAUDE.md` 的理由**：root `CLAUDE.md` 已經承載結構圖、環境、常用指令、CF 部署架構、部署前檢查等大部分內容（4359 bytes vs `AGENTS.md` 2425 bytes），把少的一邊收斂到多的一邊，搬動量與出錯面都較小；且 `CLAUDE.md` 在 root 與兩個 workspace 都存在，形成一致的層級鏈（root → workspace），而 `AGENTS.md` 只在 root 與 nextjs-pickball 存在且後者是 vendor 檔。

**代價**：方向與 `nextjs-pickball/CLAUDE.md` 的 `@AGENTS.md` 相反，repo 內出現兩種引用方向。以「root 層 vs workspace vendor 層」的職責差異區隔，並在兩檔內都寫明方向，避免被當成不一致而被「修正」回去。

### D2｜用標準 markdown 相對路徑連結，不用 `@` import

`@AGENTS.md` 是 Claude Code 專屬語法，其他 agent 讀到只會看到一行純文字。root `AGENTS.md` 的目標讀者恰恰是非 Claude 的 agent，因此一律用 `[`CLAUDE.md`](./CLAUDE.md)` 這種標準相對路徑。

**已知弱點**：by reference 的成敗取決於對方會不會跟隨連結。緩解方式是在 `AGENTS.md` 放一段顯式警語（「若你的工具不會自動跟隨連結，請主動把 `CLAUDE.md` 讀入 —— 沒讀到它就等於沒有拿到本專案的規範」），把隱性依賴變成明講的指令。

### D3｜`CLAUDE.md` 必須自足，不反向依賴 `AGENTS.md`

指標檔可以指向主檔，主檔不可回指指標檔取內容，否則形成循環、兩邊又都不自足。因此 `CLAUDE.md` 需補上原本只在 `AGENTS.md` 的三段（不可省略的規則、執行環境注意、`DO_NOT_TRACK=1`），並自行列出 `openspec/config.yaml` 與 `openspec/specs/` 的連結。

`AGENTS.md` 內對規則內文的唯一提及方式是「段落名稱 + 連結」，不得複述內文。

### D4｜TDD 適用性：本變更全屬例外層

本 change 只動 `AGENTS.md`、`CLAUDE.md`、`README.md`、`openspec/specs/dev-workflow/spec.md` 四個 markdown 檔，**不含任何行為邏輯模組**（無 `app/**`、`components/**`、`hooks/**`、`lib/**`、`data/**`、`hono-pickball/src/**` 變更），因此不適用 `openspec/config.yaml` 的 TDD 三步，屬「文件」例外層。

驗收方式改為可執行的 grep 斷言（見 tasks.md），逐條對應 delta spec 的 Scenario：規則內文特徵字串在 `CLAUDE.md` 命中、在 `AGENTS.md` 不命中；`AGENTS.md` 內所有相對路徑實際存在。

## Risks / Trade-offs

- **agent 不跟隨連結，只讀 `AGENTS.md` 就開工** → 以 D2 的顯式警語緩解；且 `AGENTS.md` 頂端第一段就宣告「本檔只放指標」，讀完不會誤以為已拿到全部規範
- **未來有人想「補完」`AGENTS.md`，把規則抄回去** → 在 `AGENTS.md` 末尾加「要新增規則時」一節明文禁止；並在 `CLAUDE.md` 的「不可省略的規則」開頭聲明本節是單一來源。delta spec 的 `SHALL NOT 重複記載規則內文` 讓這件事成為可驗收的違規
- **既有 archive 的驗收指令失效** → `archive/2026-08-12-docs-and-agent-tree-consolidation/tasks.md:81` 的 `grep -c "openspec" AGENTS.md`（期望 > 0）仍會通過，因為指標表格含 `openspec/config.yaml` 與 `openspec/specs/`。archive 內容依規不回頭修改
- **`CLAUDE.md` 變長，重點稀釋** → 把「不可省略的規則」提到結構之後、環境之前，確保它在檔案前段而非埋在尾巴

## Migration Plan

單次提交即可，無部署面影響（不動程式碼、不影響 build 產物與 Worker）。回滾方式為 `git revert`，兩個檔案的舊內容都在 git history 中。

無需重跑 `pnpm build` / `pnpm test`；部署前檢查清單不受影響。

## Open Questions

無。`nextjs-pickball/AGENTS.md` 的去留已在 Non-Goals 明確排除（維持 vendor 現狀）。
