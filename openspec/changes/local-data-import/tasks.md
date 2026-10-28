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
> 既有 it／test 的名稱與斷言一律不得修改，**例外（僅限下列，皆為本 change 行為的必然結果，見 design Open Questions 4）**：
> ① `tests/e2e/user-data/roster-sync.spec.ts` 刪除 B6 的「登入時 JSON 還原停用並顯示說明」（行為依本 change 改變）；
> ② `hono-pickball/test/expected-user-guard.test.ts` 的 `SAMPLES` 補 `"POST /api/import"` 一條（合法匯入 body）、「列舉出的使用者資料路由恰與守衛樣本表一致」的 `toHaveLength(14)` 改為 15（B7.5 刻意設計的交接紅燈）；
> ③ `packages/pickball-core/test/module-boundary.test.ts` 的 `CORE_MODULES` 加 `"api/import"`；
> ④ `tests/e2e/user-data/roster-sync.spec.ts` 與 `tests/e2e/user-data/history-sync.spec.ts` 的常數 `JSON_RESTORE_DISABLED_TEXT` 改名為 `JSON_CLOUD_IMPORT_HINT_TEXT`、值改為 `data-transfer` delta 表格中雲端 JSON 匯入的說明文字（四個 test 以它作為「已切到雲端分支」的同步點，斷言的位置與語意不變；其餘斷言一行不改）。
>
> **預期帳號（B7.5 交接）**：`src/routes/import.ts` 開頭 `use("*", localAuth, requireSession, requireExpectedUser)`；前端 `importLocalData(expectedUserId, payload)`（第一參數）；元件以點擊當下 `useSession()` 的 user id 呼叫、`unauthorized` 時 `refresh()`；
> E2E 直接打 API 時一律帶 `tests/e2e/helpers/user-data.ts` 的 `expectedUserHeaders()`。後端新測試的登入 seed 用 `test/helpers/matchmaker-fixtures.ts`（不再複製 `seedAndSignIn`）。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/local-data-import`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  `pnpm test` baseline、三段 typecheck、`pnpm lint`；`playwright test --list` 各 project 數量；回填 environment.md 並 commit
  - 完成（commit `b5945ed`）：見 environment.md Verification。
- [x] 1.2 對齊 B5～B8 實際落地：`hono-pickball/src/matchmaker/{batch-guard,score-repository,history-repository}.ts`、`src/scoreboard/repository.ts`、`src/index.ts`、`test/d1-batch-guard.test.ts`；
  核心 `api/{round,history}.ts`、`matchmaker/transfer-types.ts`；`nextjs-pickball/lib/sync/*`、`lib/matchmaker/remote-transfer.ts`、`components/matchmaker/JsonBackupSection.tsx`、`app/matchmaker/{data,players}/page.tsx`；
  `tests/e2e/user-data/*`（含 `clearTestAccountUserData()`）；B7／B8 design Open Questions。
  比對本 change 的 MODIFIED Requirement（`data-transfer`「登入時的資料工具頁」，B8 版本）與目前主 spec；**若原文不同，以主 spec 為底重新套用本 change 的增修並 commit**
  - 完成（commit `a4b3a0b`）：MODIFIED 以 B8 版主 spec 為底重新套用；B7.5／B8／B7 交接逐項落實於 delta、design（Decision 4.5、「交接與對齊」）、tasks、test-plan；`validate --strict` 通過；授權修改的既有測試見 design OQ4。
- [x] 1.3 Context7 查證（MUST，附 library ID 記入 design.md「apply §1 查證紀錄」）：`/llmstxt/developers_cloudflare_d1_llms-full_txt`（limits：綁定參數、單一參數大小、每次呼叫 query 數與 batch 的計數方式；`json_each`）；
  `/drizzle-team/drizzle-orm-docs`（`db.batch` 中 `db.all(sql)` 取 RETURNING、`insert().select(sql)`）；`/websites/sqlite_docs`（`json_each` 的 `key` 欄位與 `ORDER BY key`、`json_extract` 對物件的回傳型別）。差異記入 Open Questions
  - 完成（commit `a4b3a0b`）：三個 library ID 的查證記入 design「apply §1 查證紀錄」1.3；與 design 假設的差異（`db.all(sql)` 不可用於 batch、`WHERE true`）已改寫 Decision 2 並記入 OQ1。
- [x] 1.4 一次性實測（不 commit）：在 workerd 測試中以 drizzle 執行 design Decision 2 的 `json_each` 插入（含 `ORDER BY key` 與 `rowid` 順序）與 Decision 1 的 `ON CONFLICT DO NOTHING RETURNING`；
  確認 `json_extract(value, '$.data')` 寫入後以 drizzle 讀回與原物件深度相等（design Open Questions 1、2）
  - 完成（未 commit 的探針測試已刪除）：結果記入 design 查證紀錄 1.4；OQ1、OQ2 定案。

## 2. 核心套件：匯入契約

Depends on: §1

- [x] 2.1 RED（TDD）：新增 `packages/pickball-core/test/api/import.test.ts`，it「LocalImportRequestSchema 拒絕重複 id、孤兒分槽與空匯入」。確認紅燈
  - 完成（RED commit `132090c`）：單檔 `pnpm --filter ./packages/pickball-core test --run test/api/import.test.ts` 紅燈輸出：
    `FAIL test/api/import.test.ts` / `Error: Cannot find module '../../src/api/import' imported from .../test/api/import.test.ts` / `Test Files 1 failed (1)` / `Tests no tests`。
  - 機械複驗：`git show 132090c^:packages/pickball-core/test/api/import.test.ts` 與 `git show 132090c^:packages/pickball-core/src/api/import.ts` 皆 fatal（RED 前兩檔均不存在），紅燈為真。
  - 兩個 it：「LocalImportRequestSchema 拒絕重複 id、孤兒分槽與空匯入」（錨點 it，涵蓋 spec 全部拒絕條件、只有獨立計分板與完成場次無分槽等合法請求）；
    另加「LocalImportResponseSchema 只接受固定的回應形狀」（回應 schema 斷言）。兩者在模組不存在時整檔無法載入，無先綠者（無 regression guard）。
- [x] 2.2 GREEN（TDD）：新增 `src/api/import.ts`（design Decision 6）；`CORE_MODULES` 加 `api/import`
  - 完成（GREEN commit `9e3a76a`）：`src/api/import.ts` 重用 `BackupSchema`／`MatchSlotSchema`／`ScoreboardStateSchema`；`CORE_MODULES` 加 `api/import`（檔頭例外 ③）。
    核心全套 9 檔 19 tests 全綠；`pnpm --filter ./packages/pickball-core typecheck` 與 `pnpm -r exec tsc --noEmit` 皆 exit 0。REFACTOR：無壞味道，skipped。
  - mutation（對 `src/api/import.ts`，單檔測試，每次還原且 `git status` 乾淨）：14 條必轉紅全數轉紅——重複參賽者 id／重複歷史 matchId／重複分槽 matchId／孤兒分槽／已完成場次分槽／currentRound 為 null 略過分槽檢查／
    空匯入檢查移除／空匯入漏判獨立計分板／`version` 放寬（request 層 `version: z.number()`，另在 `transfer-types.ts` 改 `z.number()` 亦轉紅）／`current` 允許非 null matchId／回應 `scoreboardCurrent` 列舉少 `skipped`、少 `none`／回應 `players` 允許負數／回應 `round` 改 `z.any()`。
    等價對照 3 條皆維持綠：`Array.from(new Set(...)).length` 改寫、`isEmpty` 條件順序對調、`isEmpty` 拿掉「分槽為空」（等價：有分槽必有 currentRound 或已因孤兒被拒）。

## 3. 後端：匯入 API

Depends on: §2

- [ ] 3.1 RED（TDD）：新增 `test/local-import.test.ts`，spec「本機資料匯入雲端的 API」中該檔的全部 11 個 it（含 apply §1 新增的「預期帳號缺少或與 session 不符時匯入回 401 ACCOUNT_MISMATCH 且雲端不寫入」「匯入的歷史可被歷史端點依區間與兩種排序讀回」）；
  同時依檔頭例外 ② 修改 `test/expected-user-guard.test.ts`（`SAMPLES` 補 `POST /api/import`、`toHaveLength(14)` → 15）。確認紅燈並貼出輸出；
  **「auth 停用…回 404」在路由不存在時同樣是 404，預期先綠——點名並標 regression guard**；守衛檔三個 it 以實跑結果點名真紅／先綠
- [ ] 3.2 GREEN（TDD）：新增 `src/import/local-import-repository.ts`（design Decision 1、2；守衛沿用 B7 `batch-guard.ts`，SHALL NOT 另寫一份守衛或錯誤分類）、
  `src/routes/import.ts`（`SessionAppEnv` sub-app、`use("*", localAuth, requireSession, requireExpectedUser)`、`onError(userDataOnError)`、`zValidator` 以 `invalidBodyHook` 回 400）；`src/index.ts` 以 `app.route("/api/import", importRoutes)` 掛載。
  json_each 插入以 `db.insert(<table>).select(sql\`… FROM json_each(${json}) WHERE true ORDER BY key\`)` 撰寫（不可用 `db.run`／`db.all`，見 design Decision 2）；獨立計分板以 `onConflictDoNothing().returning({ userId })`。
  3.1 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
- [ ] 3.3 REFACTOR：三條 `json_each` 插入的組裝是否值得抽成 helper；`hono-pickball/CLAUDE.md` 後續須知第 3 點（第二個守衛 batch 呼叫端出現時抽 `guardedBatch`）是否現在處理；無壞味道則註記 skipped

## 4. 前端：匯入內容與結果分類

Depends on: §3

- [ ] 4.1 RED（TDD）：新增 `lib/sync/local-import.test.ts`，spec 該檔的五個 it（以 happy-dom 的 localStorage seed 五個 key；斷言「呼叫前後逐字相同」時使用不含損毀資料的 seed）。確認紅燈
- [ ] 4.2 GREEN（TDD）：新增 `lib/sync/local-import.ts`（design Decision 3、4、4.5；請求經 `requestJson`；`importLocalData(expectedUserId, payload)` 以第一參數原樣交給 `requestJson`）

## 5. E2E 與畫面接線

Depends on: §4

- [ ] 5.1 RED（E2E）：新增 `tests/e2e/user-data/local-import.spec.ts`（`test.use({ storageState })`、skip 條件、`test.beforeEach` 呼叫 `clearTestAccountUserData()` 並清空本機 storage），
  spec 錨點的全部 5 個 test（本機資料以 `page.addInitScript` 或 `page.evaluate` 在開啟頁面前寫入；JSON 備份檔以 fixture 產生，不含任何帳密）；
  同時**刪除** `roster-sync.spec.ts` 的「登入時 JSON 還原停用並顯示說明」（commit 訊息載明原因與 spec 出處），並依檔頭例外 ④ 改寫兩檔的同步點常數；
  另新增兩個元件單元測試（RED，TDD）：`components/matchmaker/LocalDataImportSection.test.tsx`「匯入以點擊當下的帳號送出且未授權時刷新 session」、`components/matchmaker/JsonBackupSection.test.tsx`「雲端 JSON 匯入以點擊當下的帳號送出且未授權時刷新 session」，以單檔 vitest 確認紅燈。
  以單檔執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/local-import.spec.ts`（前後清殘留 dev server），貼出輸出
- [ ] 5.2 GREEN（例外層：I/O 樣板元件與頁面，以 5.1 驗收）：新增 `components/matchmaker/LocalDataImportSection.tsx`、`LocalImportNotice.tsx`（本機讀取在 effect 內）；
  `app/matchmaker/data/page.tsx` 掛載區塊（雲端模式）、`app/matchmaker/players/page.tsx` 掛載提示（雲端模式）；`JsonBackupSection.tsx` 雲端分支改為匯入（本機分支不動）。
  5.1 全綠（E2E 5 條、元件 2 個 it，以及授權改寫同步點的既有 4 條 E2E）；不得以 `waitForTimeout` 取代狀態等待
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
  既有 test 全數通過（扣除 5.1 授權刪除的 1 條），新增 5 個 test 全 passed（user-data 40 − 1 + 5 = 44），無因缺帳密 skip。依 project 分開跑（webkit、mobile-safari 各分 3 shard）。結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 6.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate local-data-import --strict` 通過
