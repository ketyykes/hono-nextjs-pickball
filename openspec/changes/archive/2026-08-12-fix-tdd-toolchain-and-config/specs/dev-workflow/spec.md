## ADDED Requirements

### Requirement: 單檔測試指令必須能過濾出單一測試檔

TDD 三步驟的紅燈證據仰賴「只跑目標測試檔」。系統 SHALL 以
`pnpm --filter ./<workspace> test --run <path>` 作為唯一的單檔驗證指令形式。

`--run` 之前 SHALL NOT 出現 `--`：`pnpm --filter ./<workspace> test -- --run <path>` 會讓
vitest 收不到路徑參數而執行完整測試套件，使新寫的失敗測試混入既有通過的測試輸出中，
紅燈證據因此無法辨識。

`openspec/config.yaml`、各 workspace 的 `CLAUDE.md`、以及 `.claude/` 下所有會被 agent
逐字照抄執行的 prompt template SHALL 只出現正確形式；反面示例得保留，但 MUST 明確標示為錯誤寫法。

#### Scenario: 單檔指令只跑該檔

- **WHEN** 於 repo root 執行 `pnpm --filter ./nextjs-pickball test --run lib/health.test.ts`
- **THEN** 輸出為 `Test Files 1 passed (1)`，而非完整套件的 15 檔

#### Scenario: 活躍指令範本不含失效寫法

- **WHEN** 執行 `grep -rn "test -- --run" openspec/config.yaml nextjs-pickball/CLAUDE.md CLAUDE.md .claude/` 並排除標示為錯誤寫法的警告行
- **THEN** 命中數為 0

#### Scenario: 歷史紀錄保留原文但標示失效

- **GIVEN** `openspec/changes/archive/**` 與 `docs/superpowers/**` 為歷史紀錄，指令原文不得竄改
- **WHEN** 開啟任一含失效指令的歷史檔
- **THEN** 檔案頁首存在失效註記，說明該寫法已知失效並指向 `openspec/config.yaml` 的正確形式

### Requirement: 部署前品質門檻

系統 SHALL 在 root `README.md` 維護一份「部署前手動檢查清單」作為品質門檻，且該清單 SHALL 依執行成本由低到高排序，使失敗盡早出現。

本專案不使用 CI（無 GitHub Actions、無 branch protection、無 pre-commit hook），
這份手動清單即為唯一的部署前門檻。

清單 SHALL 至少涵蓋：ESLint、兩個 workspace 的型別檢查、前端單元測試、
Playwright E2E、workerd runtime 整合驗證，以及部署順序確認。

#### Scenario: 檢查清單存在且可執行

- **WHEN** 檢查 root `README.md` 的「部署前手動檢查清單」段落
- **THEN** 六個步驟皆為可直接複製執行的指令或明確動作，且指令形式與本 spec 的單檔測試要求一致

#### Scenario: 清單順序由快到慢

- **WHEN** 依序閱讀清單步驟
- **THEN** `pnpm lint` 在型別檢查之前、型別檢查在單元測試之前、單元測試在 E2E 之前、E2E 在 `preview` 之前

### Requirement: Cloudflare 部署的 repo 外設定必須被記載

系統 SHALL 在 root `CLAUDE.md` 記載只存在於 CF Dashboard、git 無法追蹤的部署設定，並 SHALL 明示 `wrangler.jsonc` 的 `name` MUST 與 Dashboard 上的 Worker 名稱一致。

需記載的 repo 外設定包含兩個 Worker 各自的 root directory 與 build command。

部署順序 SHALL 記載為「先 hono-pickball，後 nextjs-pickball」，
理由為 service binding 目標必須先存在。

#### Scenario: root CLAUDE.md 記載 Dashboard 側設定

- **WHEN** 檢查 root `CLAUDE.md` 的 Cloudflare Workers 部署架構段落
- **THEN** 存在「CF Dashboard 側設定（不在 repo 內）」小節，說明 root directory / build command 的位置與 `name` 一致性要求

#### Scenario: 部署順序有明確理由

- **WHEN** 檢查部署順序的描述
- **THEN** 除順序本身外，同時說明「binding 目標不存在會部署失敗」的理由
