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

root `CLAUDE.md`、各 workspace 的 `CLAUDE.md`、以及 `.claude/` 下所有會被 agent
逐字照抄執行的 prompt template SHALL 只出現正確形式；反面示例得保留，但 MUST 明確標示為錯誤寫法。

本指令形式的內文來源 SHALL 為 root `CLAUDE.md`。`openspec/config.yaml` 曾承載此規則，現已只放
`schema` 與 `context` 兩項設定，SHALL NOT 再被任何文件引用為單檔測試指令的來源。

本 Requirement 的驗收條件 SHALL NOT 引用完整測試套件的檔數或測試數。該數字每補一次測試就會變動
（歷程：15 檔 77 測 → 19 檔 93 測 → 28 檔 161 測），寫死它等於讓規格在每次正常的補測後立刻過期。
需要說明對照時，SHALL 以「完整套件的全部測試檔」這類相對表述，或標明為「當時實測」的歷史數值。

#### Scenario: 單檔指令只跑該檔

- **WHEN** 於 repo root 執行 `pnpm --filter ./nextjs-pickball test --run lib/health.test.ts`
- **THEN** 輸出為 `Test Files 1 passed (1)`，而非完整套件的全部測試檔

#### Scenario: 活躍指令範本不含失效寫法

- **WHEN** 執行 `grep -rn "test -- --run" CLAUDE.md nextjs-pickball/CLAUDE.md hono-pickball/CLAUDE.md .claude/` 並排除標示為錯誤寫法的警告行
- **THEN** 命中數為 0

#### Scenario: 歷史紀錄保留原文但標示失效

- **GIVEN** `openspec/changes/archive/**` 與 `docs/superpowers/**` 為歷史紀錄，指令原文不得竄改
- **WHEN** 開啟任一含失效指令的歷史檔
- **THEN** 檔案頁首存在失效註記，說明該寫法已知失效並指向 root `CLAUDE.md` 的正確形式

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

測試 MUST 使用 `import { exports } from "cloudflare:workers"` 搭配 `exports.default.fetch()`，SHALL NOT 使用 `cloudflare:test` 模組的 `SELF` 或 `env` —— 兩者在 `@cloudflare/vitest-pool-workers/types` 中皆已標記 `@deprecated`。需要直接存取 binding（例如 D1）時，`env` MUST 自 `cloudflare:workers` 匯入（即上述 deprecated 註記所指定的替代來源）。

測試用 D1 MUST 經由 migration 夾具建立：`vitest.config.ts` 於 Node 端以套件根匯出的 `readD1Migrations()` 讀取 `hono-pickball/drizzle/` 的 migration，經 `cloudflareTest()` 的 `miniflare.bindings` 注入為 `TEST_MIGRATIONS`，並以 `wrangler.environment: "local"` 取得 `env.local` 宣告的 `DB`；`test.setupFiles` 指定的 `test/apply-migrations.ts` MUST 以 `cloudflare:test` 的 `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` 套用。測試 SHALL NOT 以手寫 `CREATE TABLE` 自建資料表——那會讓測試驗證的 schema 與 migration 脫鉤。storage 隔離單位為**測試檔**（本版已移除 `isolatedStorage` 選項），同一測試檔內的 it 共用同一份 D1 資料，測試 MUST 自行使用不互相衝突的資料（例如各自的 email）。

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

#### Scenario: 測試用 D1 已由夾具套用全部 migration

- **WHEN** 任一測試檔開始執行
- **THEN** `env.DB` 的 `d1_migrations` 表記錄的 migration 名稱與 `env.TEST_MIGRATIONS` 的名稱清單完全一致
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「測試用 D1 已套用 TEST_MIGRATIONS 的全部 migration」

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

`cf-typegen` MUST 以 `--env-file .dev.vars.example` 產生型別：預設行為會讀取各機器自己的 `.dev.vars`（gitignored），使 commit 進版控的 `worker-configuration.d.ts` 隨開發者本機內容漂移。

`DB` 只宣告於 `env.local`（見 `backend-database` capability），`wrangler types` 對「並非所有環境都有」的 binding 產生可選型別，因此 `CloudflareBindings` 的 `DB` MUST 為 `DB?: D1Database`；程式碼 SHALL NOT 以非空斷言（`!`）繞過，一律經 `getDb(env)` 取得實例。

此為型別層要求，SHALL NOT 以單元測試驗收 —— 泛型化與型別產生不改變 runtime 行為，用 `@ts-expect-error` 湊出的「型別測試」是空測試。驗收方式為 `typecheck` exit 0 與檢查產出檔內容。

#### Scenario: Hono 實例帶入 CloudflareBindings

- **WHEN** 檢查 `hono-pickball/src/index.ts` 的 Hono 建構
- **THEN** 為 `new Hono<{ Bindings: CloudflareBindings }>()`，且檔案未 import `CloudflareBindings`

#### Scenario: 型別檢查通過

- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** exit 0

#### Scenario: 產出的型別中 DB 為可選且不受本機 .dev.vars 影響

- **WHEN** 在本機 `.dev.vars` 存在與不存在兩種狀態下各執行一次 `pnpm --filter ./hono-pickball cf-typegen`
- **THEN** 兩次產出的 `worker-configuration.d.ts` 內容相同，且含 `DB?: D1Database`
- **驗收**：tasks.md §2 的實測紀錄（兩次產出以 `git diff --exit-code` 比對）

### Requirement: agent 資產與設計文件只有一份來源

agent 相關資產（`.agents/`、`skills-lock.json`）SHALL 只存在於 repo root，SHALL NOT 在任何 workspace 內複製。設計文件與實作計畫 SHALL 集中於 root `docs/`。

重複的樹會造成兩種具體傷害：改動只落在其中一棵時 agent 讀到的規則取決於它從哪個目錄啟動；以及兩份 `skills-lock.json` 會各自漂移（實測 root 少了 3 個 skill 的鎖定條目、workspace 少了 4 個，而兩邊的 skill **檔案**其實都在 root）。

同一種漂移也適用於規範文件本身，因此 root 層規範的**內文** SHALL 只記載於 root `CLAUDE.md` 一處。repo root SHALL 提供 `AGENTS.md` 作為所有 coding agent 的入口，其內容 MUST 以標準 markdown 相對路徑指向 root `CLAUDE.md`（規範單一來源，含 TDD 三步與紅燈規則）、`openspec/config.yaml`（openspec workflow schema 與 artifact 輸出語言設定）與 `openspec/specs/`（正式規格），且 MUST 明示新規則應寫入 `CLAUDE.md` 而非 `AGENTS.md`。`AGENTS.md` SHALL NOT 重複記載規則內文，SHALL NOT 只放特定框架的版本提醒。

`openspec/config.yaml` SHALL NOT 被任何入口文件描述為 TDD 規則的來源。該檔現只承載 `schema`（workflow schema 變體）與 `context`（artifact 輸出語言）兩項設定；TDD 三步與紅燈規則的內文在 root `CLAUDE.md`，各 workspace 的適用範圍與例外層在該 workspace 的 `CLAUDE.md`。此分工變更後，入口文件與歷史文件的指標 MUST 一併更新——指標指向一個已不含該內容的檔案，比沒有指標更耗讀者時間。

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
- **THEN** `openspec/config.yaml` 的角色標示為 workflow schema 與輸出語言設定，未被描述為 TDD 規則來源

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
- **THEN** 兩者皆未把 `openspec/config.yaml` 描述為 TDD 規則的寫入處或來源

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

### Requirement: 本機 D1 migration 流程

`hono-pickball/package.json` SHALL 提供：

- `db:generate`：`drizzle-kit generate`，依 `drizzle.config.ts`（`dialect: "sqlite"`、`schema: "./src/db/schema.ts"`、`out: "./drizzle"`，不設 `driver` 與 `dbCredentials`）產生 SQL migration
- `db:migrate:local`：`wrangler d1 migrations apply DB --local --env local`
- `dev`：`wrangler dev --env local`

`env.local` 的 `d1_databases[0].migrations_dir` MUST 為 `drizzle`，使 wrangler 與測試夾具讀取同一份 migration。

任何指令 SHALL NOT 帶 `--remote`；遠端 D1 的建立與 migration 屬 G1。

`drizzle/` 下的 SQL 與 `meta/` SHALL 與 `src/db/schema.ts` 保持一致：commit 前執行 `db:generate` MUST 不產生新檔案。

#### Scenario: migration 可從零套用到本機 D1

- **GIVEN** 刪除 `hono-pickball/.wrangler/state` 下的本機 D1 資料
- **WHEN** 執行 `pnpm --filter ./hono-pickball db:migrate:local`
- **THEN** exit 0，且 `wrangler d1 execute DB --local --env local --command "SELECT name FROM sqlite_master WHERE type='table'"` 列出 `user`、`session`、`account`、`verification`
- **驗收**：tasks.md §5 的實測紀錄

#### Scenario: schema 與 migration 無漂移

- **WHEN** 在已 commit 的狀態下執行 `pnpm --filter ./hono-pickball db:generate`
- **THEN** drizzle-kit 回報沒有 schema 變更，`git status --porcelain -- hono-pickball/drizzle` 為空
- **驗收**：tasks.md §5 的實測紀錄

### Requirement: D1 schema 與 migration SQL 屬設定層

`hono-pickball/src/db/schema.ts` 的資料表宣告與 `hono-pickball/drizzle/**` 的 migration SQL SHALL 視為**設定層**：
撰寫或修改時不強制 TDD 紅燈（宣告式內容沒有分支可言，且 SQL 由工具產生）。

但設定層 MUST 被至少一條在 workerd 中對 D1 實際讀寫的測試覆蓋：每新增一張資料表，同一 change 內
MUST 有測試證明該表可經 migration 建立並被寫入讀回；schema 上的約束（unique、foreign key、cascade）
MUST 各有測試。讀寫這些資料表的 `src/**` 行為邏輯（查詢、驗證、授權）照常適用 TDD 三步。

此規則 MUST 寫入 `hono-pickball/CLAUDE.md`。

#### Scenario: CLAUDE.md 記載設定層例外與其覆蓋義務

- **WHEN** 檢查 `hono-pickball/CLAUDE.md`
- **THEN** 存在段落說明 `src/db/schema.ts` 與 `drizzle/**` 屬設定層免紅燈，且同時寫明「每張表與每個約束須有 D1 讀寫測試覆蓋」

### Requirement: .dev.vars.example 列出本機所需變數且不含真值

`hono-pickball/.dev.vars.example` SHALL 列出本機 `wrangler dev` 所需的每一個變數名稱與用途說明，
值 MUST 為示意值或空值，SHALL NOT 含任何真實密碼或 secret。`.dev.vars` 維持 gitignored。

`ENVIRONMENT` SHALL 只出現在 `.dev.vars`（範例值 `development`），`wrangler.jsonc` 的 top-level 與
`env.local` 皆 SHALL NOT 以 `vars` 設定它——遠端環境沒有 `.dev.vars`，缺值即代表非開發環境。

#### Scenario: 範例檔存在且 wrangler.jsonc 不設 ENVIRONMENT

- **WHEN** 檢查 `hono-pickball/.dev.vars.example` 與 `hono-pickball/wrangler.jsonc`
- **THEN** 前者含 `ENVIRONMENT=development` 一行與說明註解；後者的 top-level 與 `env.local` 皆不存在 `vars` 鍵（註解中提及不算）
