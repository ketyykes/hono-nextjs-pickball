## MODIFIED Requirements

### Requirement: agent 資產與設計文件只有一份來源

agent 相關資產（`.agents/`、`skills-lock.json`）SHALL 只存在於 repo root，SHALL NOT 在任何 workspace 內複製。設計文件與實作計畫 SHALL 集中於 root `docs/`。

重複的樹會造成兩種具體傷害：改動只落在其中一棵時 agent 讀到的規則取決於它從哪個目錄啟動；以及兩份 `skills-lock.json` 會各自漂移（實測 root 少了 3 個 skill 的鎖定條目、workspace 少了 4 個，而兩邊的 skill **檔案**其實都在 root）。

同一種漂移也適用於規範文件本身，因此 root 層規範的**內文** SHALL 只記載於 root `CLAUDE.md` 一處。repo root SHALL 提供 `AGENTS.md` 作為所有 coding agent 的入口，其內容 MUST 以標準 markdown 相對路徑指向 root `CLAUDE.md`（規範單一來源）、`openspec/config.yaml`（TDD 規則）與 `openspec/specs/`（正式規格），且 MUST 明示新規則應寫入 `CLAUDE.md` 而非 `AGENTS.md`。`AGENTS.md` SHALL NOT 重複記載規則內文，SHALL NOT 只放特定框架的版本提醒。

相對地，root `CLAUDE.md` MUST 自足：SHALL NOT 為取得任何規範內文而回指 `AGENTS.md`，避免兩檔互指而都不完整。

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
