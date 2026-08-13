## MODIFIED Requirements

### Requirement: 單檔測試指令必須能過濾出單一測試檔

TDD 三步驟的紅燈證據仰賴「只跑目標測試檔」。系統 SHALL 以
`pnpm --filter ./<workspace> test --run <path>` 作為唯一的單檔驗證指令形式。

`--run` 之前 SHALL NOT 出現 `--`：`pnpm --filter ./<workspace> test -- --run <path>` 會讓
vitest 收不到路徑參數而執行完整測試套件，使新寫的失敗測試混入既有通過的測試輸出中，
紅燈證據因此無法辨識。

`openspec/config.yaml`、各 workspace 的 `CLAUDE.md`、以及 `.claude/` 下所有會被 agent
逐字照抄執行的 prompt template SHALL 只出現正確形式；反面示例得保留，但 MUST 明確標示為錯誤寫法。

本 Requirement 的驗收條件 SHALL NOT 引用完整測試套件的檔數或測試數。該數字每補一次測試就會變動
（歷程：15 檔 77 測 → 19 檔 93 測 → 28 檔 161 測），寫死它等於讓規格在每次正常的補測後立刻過期。
需要說明對照時，SHALL 以「完整套件的全部測試檔」這類相對表述，或標明為「當時實測」的歷史數值。

#### Scenario: 單檔指令只跑該檔

- **WHEN** 於 repo root 執行 `pnpm --filter ./nextjs-pickball test --run lib/health.test.ts`
- **THEN** 輸出為 `Test Files 1 passed (1)`，而非完整套件的全部測試檔

#### Scenario: 活躍指令範本不含失效寫法

- **WHEN** 執行 `grep -rn "test -- --run" openspec/config.yaml nextjs-pickball/CLAUDE.md CLAUDE.md .claude/` 並排除標示為錯誤寫法的警告行
- **THEN** 命中數為 0

#### Scenario: 歷史紀錄保留原文但標示失效

- **GIVEN** `openspec/changes/archive/**` 與 `docs/superpowers/**` 為歷史紀錄，指令原文不得竄改
- **WHEN** 開啟任一含失效指令的歷史檔
- **THEN** 檔案頁首存在失效註記，說明該寫法已知失效並指向 `openspec/config.yaml` 的正確形式
