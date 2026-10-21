## MODIFIED Requirements

### Requirement: 部署前品質門檻

系統 SHALL 在 root `README.md` 維護一份「部署前手動檢查清單」作為品質門檻，且該清單 SHALL 依執行成本由低到高排序，使失敗盡早出現。

本專案不使用 CI（無 GitHub Actions、無 branch protection、無 pre-commit hook），
這份手動清單即為唯一的部署前門檻。

清單 SHALL 至少涵蓋：ESLint、所有 workspace 的型別檢查、前端單元測試、核心套件（`packages/pickball-core`）單元測試、後端單元測試、
Playwright E2E、workerd runtime 整合驗證，以及部署順序確認。

#### Scenario: 檢查清單存在且可執行

- **WHEN** 檢查 root `README.md` 的「部署前手動檢查清單」段落
- **THEN** 每個步驟皆為可直接複製執行的指令或明確動作，且指令形式與本 spec 的單檔測試要求一致；核心套件單元測試為其中一步（`pnpm --filter ./packages/pickball-core test --run`）

#### Scenario: 清單順序由快到慢

- **WHEN** 依序閱讀清單步驟
- **THEN** `pnpm lint` 在型別檢查之前、型別檢查在單元測試之前、單元測試在 E2E 之前、E2E 在 `preview` 之前

### Requirement: 根層彙總指令必須涵蓋所有 workspace

root `package.json` 的 `build`、`test`、`typecheck` SHALL 實際涵蓋每一個 workspace，SHALL NOT 因某個 workspace 缺少對應 script 而靜默跳過（`pnpm -r` 對缺少的 script 回傳 exit 0，會讓「全部通過」的假象成立）。

workspace 的範圍以 root `pnpm-workspace.yaml` 為準，目前為三個：`nextjs-pickball`、`hono-pickball`、`packages/pickball-core`。

每個 workspace MUST 提供 `build`、`test`、`typecheck` 三個 script。後端的 `build` MUST 同時包含型別檢查與打包驗證（`tsc --noEmit && wrangler deploy --dry-run`）—— 兩者互補：前者抓型別但抓不到打包錯，後者走真 esbuild 打包並驗證 `wrangler.jsonc` 但不做型別檢查。

後端 `typecheck` MUST 包含 `test/tsconfig.json` 這一段，否則該設定檔會成為沒人執行的死設定（root tsconfig 的 `include` 不含 `test/`）。

核心套件沒有建置產物（`exports` 直接指向 `src/*.ts`，見 `pickball-core` capability），其 `build` MUST 為型別檢查（`tsc --noEmit`），
使 root `pnpm build` 仍能擋下核心套件的型別錯誤；其 `typecheck` MUST 同樣包含 `test/tsconfig.json` 這一段（理由同後端）；
其 `test` MUST 以 vitest 執行 `test/` 下的測試，SHALL NOT 加 `--passWithNoTests`（沒有測試時應失敗而非靜默通過）。

#### Scenario: root test 涵蓋前後端

- **WHEN** 於 repo root 執行 `pnpm test`
- **THEN** 輸出同時出現 `nextjs-pickball test:`、`hono-pickball test:` 與 `packages/pickball-core test:`（或以套件名 `@pickball/core` 標示）三組測試統計

#### Scenario: root build 涵蓋前後端

- **WHEN** 於 repo root 執行 `pnpm build`
- **THEN** 輸出同時出現前端 Next.js 建置、後端 `wrangler deploy --dry-run` 的結果（含 Total Upload / gzip 數字）與核心套件的 `tsc --noEmit`，指令 exit 0

#### Scenario: 後端 typecheck 涵蓋測試檔

- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** 依序執行 `tsc --noEmit` 與 `tsc --noEmit -p test/tsconfig.json`，兩段皆 exit 0

#### Scenario: 核心套件 typecheck 涵蓋測試檔

- **WHEN** 執行 `pnpm --filter ./packages/pickball-core typecheck`
- **THEN** 依序執行 `tsc --noEmit` 與 `tsc --noEmit -p test/tsconfig.json`，兩段皆 exit 0
