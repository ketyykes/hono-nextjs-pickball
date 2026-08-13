# dev-workflow Specification

## Purpose
TBD - created by archiving change fix-tdd-toolchain-and-config. Update Purpose after archive.
## Requirements
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

### Requirement: 後端測試在 workerd runtime 中執行

`hono-pickball` 的單元測試 SHALL 在真正的 workerd runtime 中執行，SHALL NOT 使用 node 或 happy-dom 模擬 —— 後端程式碼依賴 Cloudflare Workers 的執行環境語意（`cloudflare:workers` 模組、binding、Request/Response 實作），在模擬環境中通過的測試不足以證明部署後可運作。

測試 MUST 放在 `hono-pickball/test/` 獨立目錄，SHALL NOT 鄰近 `src/`（與前端慣例相反）。理由有二：官方 pool 的 tsconfig 分層以 `test/` 為邊界；且 `src/` 會被 `wrangler deploy` 打包，測試檔不應混入部署產物。

設定 MUST 使用從 `@cloudflare/vitest-pool-workers` 套件根匯入的 `cloudflareTest()` Vite plugin。本版（0.16.13）不存在 `defineWorkersConfig`，`exports` 亦無 `./config` subpath。

測試 MUST 使用 `import { exports } from "cloudflare:workers"` 搭配 `exports.default.fetch()`，SHALL NOT 使用 `SELF` 或 `env` —— 兩者在 `@cloudflare/vitest-pool-workers/types` 中皆已標記 `@deprecated`。

#### Scenario: 後端測試可在 workerd runtime 中取得 worker

- **WHEN** 執行 `pnpm --filter ./hono-pickball test --run test/smoke.test.ts`
- **THEN** 測試通過，且 `exports.default.fetch` 為可呼叫的函式
- **驗收**：`hono-pickball/test/smoke.test.ts`，it 名稱「可在 workerd runtime 中執行並存取 Hono worker」

#### Scenario: 測試檔位於獨立的 test/ 目錄

- **WHEN** 列出 `hono-pickball/` 下的測試檔
- **THEN** 全部位於 `test/` 目錄，`src/` 下不存在任何 `*.test.ts`

#### Scenario: 受限沙箱中的失敗不得被誤判為設定錯誤

- **GIVEN** 執行環境禁止程序監聽 localhost
- **WHEN** 執行後端測試
- **THEN** 會出現 `listen EPERM: operation not permitted 127.0.0.1`（miniflare 需開 localhost server）
- **AND** 此為環境限制而非設定錯誤，處置方式是放行後重跑，SHALL NOT 因此修改 `vitest.config.ts`

### Requirement: 根層彙總指令必須涵蓋所有 workspace

root `package.json` 的 `build`、`test`、`typecheck` SHALL 實際涵蓋每一個 workspace，SHALL NOT 因某個 workspace 缺少對應 script 而靜默跳過（`pnpm -r` 對缺少的 script 回傳 exit 0，會讓「全部通過」的假象成立）。

每個 workspace MUST 提供 `build`、`test`、`typecheck` 三個 script。後端的 `build` MUST 同時包含型別檢查與打包驗證（`tsc --noEmit && wrangler deploy --dry-run`）—— 兩者互補：前者抓型別但抓不到打包錯，後者走真 esbuild 打包並驗證 `wrangler.jsonc` 但不做型別檢查。

後端 `typecheck` MUST 包含 `test/tsconfig.json` 這一段，否則該設定檔會成為沒人執行的死設定（root tsconfig 的 `include` 不含 `test/`）。

#### Scenario: root test 涵蓋前後端

- **WHEN** 於 repo root 執行 `pnpm test`
- **THEN** 輸出同時出現 `nextjs-pickball test:` 與 `hono-pickball test:` 兩組測試統計

#### Scenario: root build 涵蓋前後端

- **WHEN** 於 repo root 執行 `pnpm build`
- **THEN** 輸出同時出現前端 Next.js 建置與後端 `wrangler deploy --dry-run` 的結果（含 Total Upload / gzip 數字）

#### Scenario: 後端 typecheck 涵蓋測試檔

- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** 依序執行 `tsc --noEmit` 與 `tsc --noEmit -p test/tsconfig.json`，兩段皆 exit 0

### Requirement: 後端 Hono app 必須帶入 binding 型別

`hono-pickball/src/index.ts` 的 Hono 實例 SHALL 宣告為 `new Hono<{ Bindings: CloudflareBindings }>()`，使 `c.env` 具備由 `wrangler types` 產生的型別。

`CloudflareBindings` 為 `worker-configuration.d.ts` 宣告的全域介面，SHALL NOT 額外 import。改動 `wrangler.jsonc` 後 MUST 重跑 `pnpm cf-typegen`（root `.claude/settings.json` 已有 PostToolUse hook 自動觸發）。

此為型別層要求，SHALL NOT 以單元測試驗收 —— 目前 binding 清單為空，泛型化後 runtime 行為零變化，用 `@ts-expect-error` 湊出的「型別測試」是空測試。驗收方式為 `typecheck` exit 0。

#### Scenario: Hono 實例帶入 CloudflareBindings

- **WHEN** 檢查 `hono-pickball/src/index.ts` 的 Hono 建構
- **THEN** 為 `new Hono<{ Bindings: CloudflareBindings }>()`，且檔案未 import `CloudflareBindings`

#### Scenario: 型別檢查通過

- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** exit 0

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

