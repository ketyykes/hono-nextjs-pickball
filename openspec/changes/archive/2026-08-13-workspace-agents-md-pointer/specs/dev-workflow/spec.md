## MODIFIED Requirements

### Requirement: agent 資產與設計文件只有一份來源

agent 相關資產（`.agents/`、`skills-lock.json`）SHALL 只存在於 repo root，SHALL NOT 在任何 workspace 內複製。設計文件與實作計畫 SHALL 集中於 root `docs/`。

重複的樹會造成兩種具體傷害：改動只落在其中一棵時 agent 讀到的規則取決於它從哪個目錄啟動；以及兩份 `skills-lock.json` 會各自漂移（實測 root 少了 3 個 skill 的鎖定條目、workspace 少了 4 個，而兩邊的 skill **檔案**其實都在 root）。

同一種漂移也適用於規範文件本身，因此 root 層規範的**內文** SHALL 只記載於 root `CLAUDE.md` 一處。repo root SHALL 提供 `AGENTS.md` 作為所有 coding agent 的入口，其內容 MUST 以標準 markdown 相對路徑指向 root `CLAUDE.md`（規範單一來源）、`openspec/config.yaml`（TDD 規則）與 `openspec/specs/`（正式規格），且 MUST 明示新規則應寫入 `CLAUDE.md` 而非 `AGENTS.md`。`AGENTS.md` SHALL NOT 重複記載規則內文，SHALL NOT 只放特定框架的版本提醒。

相對地，root `CLAUDE.md` MUST 自足：SHALL NOT 為取得任何規範內文而回指 `AGENTS.md`，避免兩檔互指而都不完整。

入口義務 SHALL NOT 只適用於 repo root。repo 內**每一個含 `CLAUDE.md` 的目錄** MUST 同時提供 `AGENTS.md`，其內容 MUST 以標準 markdown 相對路徑指向同層 `CLAUDE.md`（該層規範的單一來源）與 root `AGENTS.md`（治理入口）。workspace 層的 `AGENTS.md` 同樣 SHALL NOT 重複記載規則內文。

理由：只認 `AGENTS.md` 的 agent（Codex、Cursor 等）從 workspace 目錄啟動時，讀到什麼完全取決於該層有沒有入口。Claude Code 專屬的 `@AGENTS.md` import 語法方向相反（`CLAUDE.md` ← `AGENTS.md`），補不了這個洞。

當某份 `AGENTS.md` 含有第三方工具以註解標記界定的受管區段（例如 Next.js 的 `<!-- BEGIN:nextjs-agent-rules -->` 與 `<!-- END:nextjs-agent-rules -->`），該區段內的內容不計入上述指向義務；專案自訂的指標 MUST 寫在標記**之外**，避免被該工具的更新或 codemod 覆寫。本規格 SHALL NOT 對受管區段內的文字設任何驗收條件。

本義務的判定對象是「含 `CLAUDE.md` 的目錄」。隨第三方 skill 一併引入、位於 `.agents/` 之下的 `AGENTS.md` 不在此列。

`README.md` 描述各層文件角色時 MUST 與上述分工一致：規範內文的來源是 `CLAUDE.md`，`AGENTS.md` 的角色是非 Claude agent 的入口指標，SHALL NOT 把 `AGENTS.md` 描述為規範來源。

#### Scenario: agent 資產不重複

- **WHEN** 執行 `git ls-files "*/.agents/*" "*/skills-lock.json"` 並排除 root 下的路徑
- **THEN** 無任何命中

#### Scenario: skills-lock 為單一份且涵蓋全部 skill

- **WHEN** 檢查 root `skills-lock.json`
- **THEN** 其 `skills` 涵蓋 `.agents/skills/` 下每一個外部 skill；repo 內不存在第二份 lock 檔

#### Scenario: root AGENTS.md 指向規格治理

- **WHEN** 檢查 root `AGENTS.md`
- **THEN** 內容含指向 `./CLAUDE.md`、`./openspec/config.yaml`、`./openspec/specs/` 的相對路徑連結，且每個路徑在檔案系統上實際存在
- **THEN** 內容明示規範單一來源為 `CLAUDE.md`，以及新規則不得寫入 `AGENTS.md`

#### Scenario: 規則內文不重複於 AGENTS.md

- **WHEN** 對 root `AGENTS.md` 搜尋規則內文特徵字串（`mutation check`、`e5b709c`、`EPERM`、`--run`）
- **THEN** 四者皆無命中
- **THEN** 同樣四個字串在 root `CLAUDE.md` 皆有命中，證明內文已收斂而非遺失

#### Scenario: root CLAUDE.md 自足

- **WHEN** 只讀 root `CLAUDE.md`（不開啟 `AGENTS.md`）
- **THEN** 可取得 openspec change 流程要求、TDD 三步規則、單檔測試指令的正確形式（`--run` 前不可加 `--`）與執行環境注意事項

#### Scenario: 每個含 CLAUDE.md 的目錄都有 AGENTS.md

- **WHEN** 以 `git ls-files "*CLAUDE.md"` 列出所有受版控的 `CLAUDE.md`，對其中每一個目錄檢查同層是否存在 `AGENTS.md`
- **THEN** 無任何目錄缺少 `AGENTS.md`（現況應命中 repo root、`nextjs-pickball/`、`hono-pickball/` 三處）

#### Scenario: workspace 層 AGENTS.md 指向同層 CLAUDE.md 與 root 入口

- **WHEN** 檢查 `nextjs-pickball/AGENTS.md` 與 `hono-pickball/AGENTS.md`
- **THEN** 兩者皆含指向 `./CLAUDE.md` 與 `../AGENTS.md` 的相對路徑連結，且每個路徑在檔案系統上實際存在
- **THEN** 兩者皆含提示：若工具不會自動跟隨連結，須主動讀入

#### Scenario: 專案指標位於第三方受管區段之外

- **WHEN** 執行 `sed '/BEGIN:nextjs-agent-rules/,/END:nextjs-agent-rules/d' nextjs-pickball/AGENTS.md` 刪除 Next.js 受管區段後，於剩餘內容搜尋 `./CLAUDE.md`
- **THEN** 仍有命中，證明指標段不會隨該區段被覆寫而消失

#### Scenario: 規則內文不重複於 workspace 層 AGENTS.md

- **WHEN** 對 `nextjs-pickball/AGENTS.md` 與 `hono-pickball/AGENTS.md` 搜尋規則內文特徵字串（`mutation check`、`e5b709c`、`EPERM`、`--run`）
- **THEN** 兩檔皆無任何命中

#### Scenario: 第三方 skill 夾帶的 AGENTS.md 不受入口義務約束

- **WHEN** 檢查 `.agents/skills/` 下受版控的 `AGENTS.md`
- **THEN** 其所在目錄不含 `CLAUDE.md`，因此不要求含指向 `./CLAUDE.md` 或 `../AGENTS.md` 的連結

#### Scenario: README 對 AGENTS.md 的角色描述正確

- **WHEN** 檢查 root `README.md` 中描述各 workspace 文件的段落
- **THEN** 規範內文的來源標示為該層 `CLAUDE.md`，`AGENTS.md` 標示為非 Claude agent 的入口指標，未被描述為規範來源
