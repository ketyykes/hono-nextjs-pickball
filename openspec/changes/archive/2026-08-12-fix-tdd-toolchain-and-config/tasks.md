# Tasks — fix-tdd-toolchain-and-config

> **全數例外層，不套三步 TDD**（依據見 design.md「TDD 分層判定」）。
> 每個 task 標明驗收方式；`⚠️授權` 標記者位於 `.claude/`（實際執行時未觸發額外授權提示）。

## 執行中發現（影響後續 change）

1. **openspec 的 SHALL/MUST 檢查只看 Requirement 的第一行**，不是整段本文。
   實測 `openspec validate` 對「第二行才出現 SHALL」的 Requirement 仍判 ERROR。
   → **change ③ 修 scoreboard 那 7 條時必須把 SHALL 放進第一行**，否則會白做一輪。
2. **每個 change 至少要有一條 spec delta**，純設定/文件的 change 無法通過 validate。
   → 本 change 因此新增 `dev-workflow` capability（見 proposal.md 的說明）。
3. **驗收 grep 需排除反面警告行**：修正後的檔案裡刻意保留了「`test -- --run` 是錯的」這類警示，
   會被單純的 grep 命中。驗收指令改為排除含「會讓 vitest 收不到路徑」的行。
4. `rm -rf` 被 Safety Net 攔截；刪除受版控目錄改用 `git rm -r`。

## A. 測試指令範本（最優先）

- [x] **A1** `openspec/config.yaml:26` 的紅燈驗證指令改為 `pnpm --filter ./<workspace> test --run <path>`（去掉 `--`、workspace 泛化）
  - 驗收：`grep -c "test -- --run" openspec/config.yaml` → `0`
- [x] **A2** `openspec/config.yaml:27` 的每步驗證指令同上
  - 驗收：同 A1（兩處一併計）
- [x] **A3** `nextjs-pickball/CLAUDE.md:22` 單檔測試範例改為 `pnpm test --run hooks/useScrollSpy.test.ts`
- [x] **A4** `nextjs-pickball/CLAUDE.md:80` 三步驟描述的指令改為 `pnpm test --run <path>`
  - 驗收（A3+A4）：`grep -c "test -- --run" nextjs-pickball/CLAUDE.md` → `0`
- [x] **A5** ⚠️授權 `.claude/agents/nextjs-expert.md:51`
- [x] **A6** ⚠️授權 `.claude/skills/subagent-tdd-flow/SKILL.md:174`
- [x] **A7** ⚠️授權 `.claude/skills/subagent-tdd-flow/references/implementer-prompt-template.md:22` 與 `:34`
- [x] **A8** ⚠️授權 `.claude/skills/subagent-tdd-flow/references/e2e-prompt-template.md:90`
- [x] **A9** ⚠️授權 `.claude/skills/subagent-tdd-flow/references/fix-prompt-template.md:46`
  - 驗收（A5~A9）：`grep -rc "test -- --run" .claude/ | grep -v ":0"` → 無輸出
- [x] **A10** 驗證過濾確實生效
  - 驗收：`pnpm --filter ./nextjs-pickball test --run lib/health.test.ts` → `Test Files 1 passed / Tests 5 passed`

## B. 歷史檔加失效註記（不改指令原文，依據見 design.md D-①-1）

註記文字統一為：
`> ⚠️ 本檔為歷史紀錄。文中 pnpm test -- --run 指令已知失效（-- 會讓路徑過濾失效），正確寫法見 openspec/config.yaml。`

- [x] **B1** `openspec/changes/archive/2026-05-08-add-tour-experience/tasks.md`（7 處）
- [x] **B2** `openspec/changes/archive/2026-04-24-make-tocbar-fixed-overlay/tasks.md`（3 處）
- [x] **B3** `openspec/changes/archive/2026-04-24-add-pickleball-guide-page/tasks.md`（3 處）
- [x] **B4** `openspec/changes/archive/2026-05-13-quiz-feature/tasks.md`（1 處）
- [x] **B5** `nextjs-pickball/docs/superpowers/plans/` 4 檔（2026-05-11-scoreboard 27 處、2026-05-14-multipage-phase-a 12 處、2026-05-08-scroll-driven-tour 12 處、2026-05-13-quiz 2 處）
- [x] **B6** `docs/superpowers/` 2 檔（各 2 處）
  - 驗收（B1~B6）：每檔第一行為該註記；`grep -c "本檔為歷史紀錄" <各檔>` → `1`

## C. 埠號 3000 → 3005

真值：`nextjs-pickball/package.json` 的 `next dev --port 3005`、`playwright.config.ts:38` 的 `http://localhost:3005`

- [x] **C1** `README.md:28`
- [x] **C2** `CLAUDE.md:26`
- [x] **C3** `nextjs-pickball/CLAUDE.md:14`
- [x] **C4** `nextjs-pickball/CLAUDE.md:54`（Playwright `baseURL`）
- [x] **C5** `nextjs-pickball/README.md:22`
- [x] **C6** ⚠️授權 `.claude/agents/playwright-e2e-runner.md:19` 與 `:78`
- [x] **C7** ⚠️授權 `.claude/skills/subagent-tdd-flow/references/e2e-prompt-template.md:12`
  - 驗收：`grep -rn "3000" --include="*.md" . | grep -v node_modules | grep -v superpowers | grep -v archive` → 無輸出

## D. 幽靈引用清除

- [x] **D1** 刪除 `nextjs-pickball/.env.local.example`（`NEXT_PUBLIC_API_URL` 全 repo 除自身外零命中；且實際 API 通路是 service binding 不是 base URL）
- [x] **D2** 刪除 `nextjs-pickball/README.md:21` 的 `cp .env.local.example .env.local`
  - 驗收（D1+D2）：`grep -rn "NEXT_PUBLIC_API_URL\|env.local.example" . | grep -v node_modules` → 無輸出
- [x] **D3** `nextjs-pickball/.gitignore` 刪除 legacy 整段（含註解行）
- [x] **D4** `nextjs-pickball/vitest.config.ts` 兩處 legacy exclude
- [x] **D5** `nextjs-pickball/eslint.config.mjs` legacy ignore
- [x] **D6** `nextjs-pickball/tsconfig.json` legacy exclude
- [x] **D7** `nextjs-pickball/CLAUDE.md` 兩處 legacy 描述（含「目錄約定」段的整行）
- [x] **D8** `nextjs-pickball/README.md` legacy 結構圖項目
  - 驗收（D3~D8）：`grep -rn "legacy-react-pickball" . | grep -v node_modules` → 無輸出
  - 迴歸驗收：`pnpm lint` exit 0；`pnpm --filter ./nextjs-pickball test --run` → 仍為 15 檔 77 測全綠
- [x] **D9** ⚠️授權 `.claude/settings.json` 刪除三條幽靈 permission（`pnpm test:unit --run 2>&1`、`pnpm test:unit`、`pnpm format:*`）
  - 依據：三個 workspace 的 `package.json` 皆無 `test:unit`、無 `format`
- [x] **D10** 刪除 `openspec/schemas/spec-driven-visual/`（5 個檔：`schema.yaml` + `templates/` 下 4 個）
  - 依據：`config.yaml:1` 為 `schema: spec-driven`；7 份 archive `.openspec.yaml` 亦全為 `spec-driven`；全 repo 對 `spec-driven-visual` 僅該目錄自身命中
  - 驗收：`ls openspec/schemas/` → 目錄不存在或為空；`DO_NOT_TRACK=1 openspec validate --all` 結果不變（仍 4 passed / 1 failed）

## E. 文件事實更正

- [x] **E1** `nextjs-pickball/CLAUDE.md:53` 的 webServer 描述改為兩段式
  - 真值：`playwright.config.ts:29-42` 是陣列 —— `:31` `pnpm --filter hono-pickball dev`（url `:8787`）、`:37` `pnpm dev`（url `:3005`）
- [x] **E2** root `CLAUDE.md` 部署架構段補上 CF Dashboard Workers Builds 的設定約束（兩個 Worker 各自的 root directory、build command；`wrangler.jsonc` 的 `name` 必須與 Dashboard Worker 名稱一致）
- [x] **E3** 在 root `CLAUDE.md` / `README.md` 記錄「`pnpm build` 目前會靜默跳過後端、`pnpm test` 只跑前端」為已知現況，並註明修正歸 change ④
  - 依據：`hono-pickball/package.json` scripts 只有 `dev / deploy / cf-typegen`，`pnpm -r build` 對缺少的 script 靜默成功

## F. CI 的替代品（必須落地，見 design.md D-①-4）

- [x] **F1** root `README.md` 新增「部署前手動檢查清單」六步
  1. `pnpm lint`
  2. `pnpm -r exec tsc --noEmit`
  3. `pnpm --filter ./nextjs-pickball test --run`
  4. `pnpm test:e2e`
  5. `pnpm --filter ./nextjs-pickball preview`（workerd runtime 整合驗證）
  6. 部署順序：先 hono-pickball，後 nextjs-pickball
  - 驗收：清單六步逐一實跑，記錄各步 exit code；步驟 2 若因後端無 build/typecheck 而失敗，於 ④ 修正並在此註記

## 完成驗收（全部 task 完成後一次跑）

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# 1. 活躍權威檔壞指令歸零（歷史檔因保留原文而排除）
grep -rn "test -- --run" openspec/config.yaml nextjs-pickball/CLAUDE.md CLAUDE.md .claude/ \
  | grep -v "會讓 vitest 收不到路徑" | wc -l    # 期望 0（排除刻意保留的反面警告行）

# 2. 過濾確實生效
pnpm --filter ./nextjs-pickball test --run lib/health.test.ts    # 期望 Test Files 1 / Tests 5

# 3. 迴歸：全套測試不變
pnpm --filter ./nextjs-pickball test --run                       # 期望 Test Files 15 / Tests 77

# 4. lint 無破口
pnpm lint

# 5. 幽靈引用歸零
grep -rn "legacy-react-pickball\|NEXT_PUBLIC_API_URL" --include="*.ts" --include="*.mjs" --include="*.json" --include="*.md" . | grep -v node_modules | wc -l   # 期望 0
ls openspec/schemas/ 2>&1                                        # 期望不存在或空

# 6. openspec 自身仍可驗證
DO_NOT_TRACK=1 openspec validate --all                           # 期望 5 passed, 1 failed（含本 change；scoreboard 歸 change ③）
DO_NOT_TRACK=1 openspec validate fix-tdd-toolchain-and-config --strict   # 期望 valid
```
