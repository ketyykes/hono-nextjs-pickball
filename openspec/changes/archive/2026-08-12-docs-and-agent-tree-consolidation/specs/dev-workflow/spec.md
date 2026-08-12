## ADDED Requirements

### Requirement: agent 資產與設計文件只有一份來源

agent 相關資產（`.agents/`、`skills-lock.json`）SHALL 只存在於 repo root，SHALL NOT 在任何 workspace 內複製。設計文件與實作計畫 SHALL 集中於 root `docs/`。

重複的樹會造成兩種具體傷害：改動只落在其中一棵時 agent 讀到的規則取決於它從哪個目錄啟動；以及兩份 `skills-lock.json` 會各自漂移（實測 root 少了 3 個 skill 的鎖定條目、workspace 少了 4 個，而兩邊的 skill **檔案**其實都在 root）。

repo root SHALL 提供 `AGENTS.md` 作為所有 coding agent 的入口，內容 MUST 指向 `openspec/config.yaml` 的 TDD 規則與 `openspec/specs/`，SHALL NOT 只放特定框架的版本提醒。

#### Scenario: agent 資產不重複

- **WHEN** 執行 `git ls-files "*/.agents/*" "*/skills-lock.json"` 並排除 root 下的路徑
- **THEN** 無任何命中

#### Scenario: skills-lock 為單一份且涵蓋全部 skill

- **WHEN** 檢查 root `skills-lock.json`
- **THEN** 其 `skills` 涵蓋 `.agents/skills/` 下每一個外部 skill；repo 內不存在第二份 lock 檔

#### Scenario: root AGENTS.md 指向規格治理

- **WHEN** 檢查 root `AGENTS.md`
- **THEN** 內容包含 openspec change 流程要求、TDD 三步規則、以及單檔測試指令的正確形式

### Requirement: 設計文件與正式規格的分工必須明確

`openspec/specs/` SHALL 為行為的**唯一正式規格**；`docs/` 下的設計文件 SHALL 僅作為設計脈絡與實作計畫的歷史紀錄，SHALL NOT 作為平行的規格來源。

當某份設計文件的內容已被 openspec spec 取代，該檔案頁首 MUST 加註說明並指向對應的 spec。當某份設計文件所描述的工作從未執行，頁首 MUST 標明「未執行」，避免被誤讀為現況。

#### Scenario: 被取代的設計文件有明確標註

- **WHEN** 開啟 `docs/superpowers/` 下任一份內容已被 openspec spec 涵蓋的文件
- **THEN** 檔案頁首存在標註，指向對應的 `openspec/specs/` 路徑

#### Scenario: 未執行的設計文件有明確標註

- **WHEN** 開啟 `docs/superpowers/specs/2026-05-14-multipage-content-deepening-design.md`
- **THEN** 檔案頁首標明本設計未執行，且說明 `openspec/changes/archive/` 內無對應 change

### Requirement: 歸檔前必須確認 task 狀態

change 歸檔前 SHALL 確認 `tasks.md` 的每個 task 皆已勾選或明確標為 skipped。

已歸檔且未達此標準者 SHALL 在檔案頁首加註實際勾選比例並說明「未勾選不代表未實作」，SHALL NOT 事後補勾 —— 那會偽造當時的執行紀錄。

#### Scenario: archived tasks.md 標明勾選比例

- **WHEN** 開啟 `openspec/changes/archive/` 下任一份 `tasks.md`
- **THEN** 頁首存在歸檔紀錄說明，載明該檔實際的已勾選／總數比例
