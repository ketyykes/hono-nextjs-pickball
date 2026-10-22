# Tasks: local-data-import

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：前端 `pnpm --filter ./nextjs-pickball test --run <path>`；後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`；
> 核心 `pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`；`regression guard`；`設定層`（`tests/**` helper、文件）；`例外層`（`app/**/page.tsx`、純呈現或 I/O 樣板元件，以 E2E 驗收）；`驗收（指令）`（test-plan C1～C7）。
>
> **前提**：B4～B8 皆已合併回 `main` 並 archive。**不新增任何第三方相依**；**禁止任何遠端 CF 操作**；不 push；本 change **無 migration**。
> 測試帳密不得寫進任何會被 commit 的檔案或訊息。it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入。
> **使用者定案（不得變更）**：匯入成功後**保留**本機資料；後端已有對戰分配機資料時**拒絕並提示**（不覆寫、不合併）；重複匯入不得產生重複歷史。
> **訪客路徑零迴歸**：本機 reader（`roster`／`round-storage`／`match-slots`／`scoreboard/storage`）、`backup.ts`、`transfer-storage.ts`、`JsonBackupSection` 的本機分支一行不改；
> 既有 it／test 的名稱與斷言一律不得修改，**唯一例外**：`tests/e2e/user-data/roster-sync.spec.ts` 刪除 B6 的「登入時 JSON 還原停用並顯示說明」（行為依本 change 改變）。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [ ] 1.1 確認分支 `change/local-data-import`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  `pnpm test` baseline、三段 typecheck、`pnpm lint`；`playwright test --list` 各 project 數量；回填 environment.md 並 commit
- [ ] 1.2 對齊 B5～B8 實際落地：`hono-pickball/src/matchmaker/{batch-guard,score-repository,history-repository}.ts`、`src/scoreboard/repository.ts`、`src/index.ts`、`test/d1-batch-guard.test.ts`；
  核心 `api/{round,history}.ts`、`matchmaker/transfer-types.ts`；`nextjs-pickball/lib/sync/*`、`lib/matchmaker/remote-transfer.ts`、`components/matchmaker/JsonBackupSection.tsx`、`app/matchmaker/{data,players}/page.tsx`；
  `tests/e2e/user-data/*`（含 `clearTestAccountUserData()`）；B7／B8 design Open Questions。
  比對本 change 的 MODIFIED Requirement（`data-transfer`「登入時的資料工具頁」，B8 版本）與目前主 spec；**若原文不同，以主 spec 為底重新套用本 change 的增修並 commit**
- [ ] 1.3 Context7 查證（MUST，附 library ID 記入 design.md「apply §1 查證紀錄」）：`/llmstxt/developers_cloudflare_d1_llms-full_txt`（limits：綁定參數、單一參數大小、每次呼叫 query 數與 batch 的計數方式；`json_each`）；
  `/drizzle-team/drizzle-orm-docs`（`db.batch` 中 `db.all(sql)` 取 RETURNING、`insert().select(sql)`）；`/websites/sqlite_docs`（`json_each` 的 `key` 欄位與 `ORDER BY key`、`json_extract` 對物件的回傳型別）。差異記入 Open Questions
- [ ] 1.4 一次性實測（不 commit）：在 workerd 測試中以 drizzle 執行 design Decision 2 的 `json_each` 插入（含 `ORDER BY key` 與 `rowid` 順序）與 Decision 1 的 `ON CONFLICT DO NOTHING RETURNING`；
  確認 `json_extract(value, '$.data')` 寫入後以 drizzle 讀回與原物件深度相等（design Open Questions 1、2）

## 2. 核心套件：匯入契約

Depends on: §1

- [ ] 2.1 RED（TDD）：新增 `packages/pickball-core/test/api/import.test.ts`，it「LocalImportRequestSchema 拒絕重複 id、孤兒分槽與空匯入」。確認紅燈
- [ ] 2.2 GREEN（TDD）：新增 `src/api/import.ts`（design Decision 6）；`CORE_MODULES` 加 `api/import`

## 3. 後端：匯入 API

Depends on: §2

- [ ] 3.1 RED（TDD）：新增 `test/local-import.test.ts`，spec「本機資料匯入雲端的 API」中該檔的全部 9 個 it。確認紅燈並貼出輸出；
  **「auth 停用…回 404」在路由不存在時同樣是 404，預期先綠——點名並標 regression guard**
- [ ] 3.2 GREEN（TDD）：新增 `src/import/local-import-repository.ts`（design Decision 1、2；守衛沿用 B7 `batch-guard.ts`，SHALL NOT 另寫一份守衛或錯誤分類）、
  `src/routes/import.ts`（`SessionAppEnv` sub-app、`use("*", localAuth, requireSession)`、`zValidator` hook 回 400）；`src/index.ts` 以 `app.route("/api/import", importRoutes)` 掛載。
  3.1 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
- [ ] 3.3 REFACTOR：四條 `json_each` 插入的組裝是否值得抽成 helper；無壞味道則註記 skipped

## 4. 前端：匯入內容與結果分類

Depends on: §3

- [ ] 4.1 RED（TDD）：新增 `lib/sync/local-import.test.ts`，spec 該檔的五個 it（以 happy-dom 的 localStorage seed 五個 key；斷言「呼叫前後逐字相同」時使用不含損毀資料的 seed）。確認紅燈
- [ ] 4.2 GREEN（TDD）：新增 `lib/sync/local-import.ts`（design Decision 3、4；請求經 `requestJson`）

## 5. E2E 與畫面接線

Depends on: §4

- [ ] 5.1 RED（E2E）：新增 `tests/e2e/user-data/local-import.spec.ts`（`test.use({ storageState })`、skip 條件、`test.beforeEach` 呼叫 `clearTestAccountUserData()` 並清空本機 storage），
  spec 錨點的全部 5 個 test（本機資料以 `page.addInitScript` 或 `page.evaluate` 在開啟頁面前寫入；JSON 備份檔以 fixture 產生，不含任何帳密）；
  同時**刪除** `roster-sync.spec.ts` 的「登入時 JSON 還原停用並顯示說明」（commit 訊息載明原因與 spec 出處）。
  以單檔執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/local-import.spec.ts`（前後清殘留 dev server），貼出輸出
- [ ] 5.2 GREEN（例外層：I/O 樣板元件與頁面，以 5.1 驗收）：新增 `components/matchmaker/LocalDataImportSection.tsx`、`LocalImportNotice.tsx`（本機讀取在 effect 內）；
  `app/matchmaker/data/page.tsx` 掛載區塊（雲端模式）、`app/matchmaker/players/page.tsx` 掛載提示（雲端模式）；`JsonBackupSection.tsx` 雲端分支改為匯入（本機分支不動）。
  5.1 全綠；不得以 `waitForTimeout` 取代狀態等待
- [ ] 5.3 REFACTOR：兩個元件的結果文案是否集中為具名常數（比照 `TRANSFER_MESSAGES`）；無壞味道則註記 skipped

## 6. 文件同步與總驗收

Depends on: §5

- [ ] 6.1 設定層（文件）：`nextjs-pickball/CLAUDE.md` 加入匯入流程（入口、保留本機、拒絕規則、JSON 還原在登入時的語意）與 `lib/sync/local-import.ts`；
  `hono-pickball/CLAUDE.md` 路由約定加 `POST /api/import` 與「大量插入用 `json_each`、陳述式數量為常數」
- [ ] 6.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 6.3 驗收（指令）C2：`pnpm lint` 0 errors、warning 不多於基線
- [ ] 6.4 驗收（指令）C3：`pnpm test` 全綠，記錄三個 workspace 的檔數／測試數與基線差異
- [ ] 6.5 驗收（指令）C4：`pnpm build` exit 0
- [ ] 6.6 驗收（指令）C5：`db:generate` 無新檔
- [ ] 6.7 驗收（指令）C6：`.dev.vars` 齊備下，依 runbook「每開一個新 change 的標準流程」第 4 步的 E2E 指令執行（含 user-data project），前後清殘留 dev server；
  既有 test 全數原樣通過（扣除 5.1 授權刪除的 1 條），新增 5 個 test 全 passed，無因缺帳密 skip。結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 6.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate local-data-import --strict` 通過
