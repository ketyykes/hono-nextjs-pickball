## Why

2026-08-12 的規格債稽核發現：本 repo 用來證明「TDD 紅燈確實發生過」的指令本身是壞的。

`openspec/config.yaml:26-27` 規定的驗證指令是 `pnpm --filter ./nextjs-pickball test -- --run <path>`，
但那個 `--` 會讓 vitest 收不到路徑參數。實測：

| 指令 | 實際結果 |
|---|---|
| `pnpm --filter ./nextjs-pickball test -- --run lib/health.test.ts` | Test Files **15** passed / Tests **77** passed（跑了全套） |
| `pnpm --filter ./nextjs-pickball test --run lib/health.test.ts` | Test Files **1** passed / Tests **5** passed（正確過濾） |

TDD 閘門沒有完全失效（新加的 failing 測試仍會在全套裡紅），但紅燈證據會混在 77 個既有測試的輸出裡，
回饋變慢、且無法分辨紅的是不是自己剛寫的那條。

更嚴重的是這個壞指令的散佈範圍：全 repo **81 處 / 17 檔**，其中 **`.claude/skills/subagent-tdd-flow/`
的 prompt template 佔 4 處** —— 那是 apply 階段 subagent 會逐字照抄執行的模板。
不先清掉，後續每一個 change 的每一次紅燈都會帶著同樣的缺陷。

同一批稽核另外找出一組「文件說的和實際不符」的問題（幽靈環境變數、幽靈目錄引用、
過期埠號、不存在的 npm script、孤兒 schema），性質相同：都會讓人或 agent 依據錯誤前提行動。

## What Changes

- **測試指令範本**：活躍權威檔 10 處全部改為可正確過濾單檔的寫法；`config.yaml` 的 workspace 名稱泛化，為後端測試鋪路
- **歷史檔**：openspec archive tasks（14 處）與 docs/superpowers 計畫（57 處）**不改指令原文**，只在頁首加失效註記
- **埠號**：前端 dev server 實際為 3005（`nextjs-pickball/package.json` 的 `next dev --port 3005`），文件 8 處仍寫 3000，全部更正
- **幽靈引用清除**：`.env.local.example`（`NEXT_PUBLIC_API_URL` 全 repo 零使用）、`legacy-react-pickball/`（目錄已不存在，仍被 6 檔引用）、`.claude/settings.json` 的 `test:unit` / `format`（兩個 script 都不存在）
- **孤兒 schema**：`openspec/schemas/spec-driven-visual/` 與 CLI 內建 `spec-driven` 無實質差異且零引用，整個目錄刪除
- **文件事實更正**：Playwright webServer 已是前後端兩段式；CF Dashboard Workers Builds 約束補進 root 文件
- **部署前手動檢查清單**：本輪不做 CI，改在 root README 落地一份六步手動清單作為品質門檻
- **不變**：任何 capability spec 的內容、任何程式碼行為、任何測試結果

## Capabilities

### New Capabilities

- `dev-workflow` —— 開發與部署流程的規格化，3 條 Requirement：
  1. **單檔測試指令必須能過濾出單一測試檔**（含「`--run` 前不可加 `--`」的禁則，以及歷史紀錄保留原文但需標示失效）
  2. **部署前品質門檻**（本專案不做 CI，root README 的六步手動清單即為唯一門檻，且需依成本由低到高排序）
  3. **Cloudflare 部署的 repo 外設定必須被記載**（Dashboard 側的 root directory / build command、`name` 一致性、部署順序理由）

> **原始規劃是「不新增任何 capability」，執行時修正。**
> openspec CLI 要求每個 change 至少有一條 delta（`Change must have at least one delta`），
> 而稽核原本把「無部署前品質門檻規格」這條 medium 發現降級處理成 README 的一個條列。
> 工具的堅持是對的：那確實是一條有可驗證情境的系統要求，不該只當文件註解。
> 因此把它連同另兩條同性質的流程要求升格為 `dev-workflow` capability。

### Modified Capabilities

無 —— 不動 pickleball-guide-page / quiz / scoreboard / site-navbar / tour-experience 任何一份。
後續 change 才會碰這五份，① 維持零觸碰以把風險壓到最低。

## Impact

- **受影響檔案**
  - openspec：`openspec/config.yaml`、`openspec/schemas/spec-driven-visual/`（刪除 5 檔）、archive tasks 4 檔（僅加註記）
  - agent 設定（**需人工授權**，`.claude/` 在 sandbox deny 清單內）：`.claude/settings.json`、`.claude/agents/nextjs-expert.md`、`.claude/agents/playwright-e2e-runner.md`、`.claude/skills/subagent-tdd-flow/`（SKILL.md + 3 個 template）
  - 專案文件：root `CLAUDE.md` / `README.md`、`nextjs-pickball/CLAUDE.md` / `README.md`、`nextjs-pickball/.env.local.example`（刪除）
  - 設定檔（僅清 legacy 引用）：`nextjs-pickball/.gitignore`、`vitest.config.ts`、`eslint.config.mjs`、`tsconfig.json`
  - docs/superpowers 6 檔（僅加註記）
- **測試影響**：零。本 change 不新增、不刪除、不修改任何測試檔；全套測試在改動前後都必須是 15 檔 77 測全綠
- **風險**
  - `vitest.config.ts` 與 `tsconfig.json` 的 legacy exclude 移除後，若有殘留檔案被意外納入編譯範圍 → 由 `pnpm lint` + 全套測試把關
  - `.claude/settings.json` 移除 permission 後，若實際有流程依賴那兩條 → 兩個 script 都不存在，不可能有依賴
- **明確不做**：結構圖（歸 ⑦）、hooks/元件數量同步（歸 ②）、`pnpm build` 的實際修正（歸 ④，本 change 只記錄現況為假）
