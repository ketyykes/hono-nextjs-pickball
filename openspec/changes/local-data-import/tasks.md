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
  - Stage 2 缺口與修補（commit 見本節下方 test 補強 commit，regression guard，加入即綠，`src/api/import.ts` 未改）：Stage 2 判 FAIL，12 條非等價變異存活。補強前以 mutation harness 實測全數存活（測試不轉紅），補強後全數轉紅：
    S9b 空匯入漏判 currentRound、S18 去重鍵改 name、S12 current 放寬為 `!state.matchId`、S14 缺 current 放行、S16 缺 matches 放行、R2／R5 回應 players／slots 允許小數、R6 history 允許負數、R10a／b／c／e 回應 key 省略（R10d 補強前即已被既有斷言殺死）。
    新增 it（既有 it 未改）：「LocalImportRequestSchema 的邊界輸入：僅回合、id 去重鍵、空字串 matchId 與缺漏段落」「LocalImportResponseSchema 的欄位皆為必填且筆數為非負整數」；並加 `expectTypeOf` 斷言 `matches[i].matchId` 為 `string`
    （matches 改用 `ScoreboardStateSchema` 的變異補強前即因 src 內 `openMatchIds.has(slot.matchId)` 型別錯誤使 typecheck 轉紅，測試檔斷言為第二道防線）。等價對照 E1、E2 仍維持綠。核心全套、核心 typecheck、`pnpm -r exec tsc --noEmit` 皆 exit 0。

## 3. 後端：匯入 API

Depends on: §2

- [x] 3.1 RED（TDD）：新增 `test/local-import.test.ts`，spec「本機資料匯入雲端的 API」中該檔的全部 11 個 it（含 apply §1 新增的「預期帳號缺少或與 session 不符時匯入回 401 ACCOUNT_MISMATCH 且雲端不寫入」「匯入的歷史可被歷史端點依區間與兩種排序讀回」）；
  同時依檔頭例外 ② 修改 `test/expected-user-guard.test.ts`（`SAMPLES` 補 `POST /api/import`、`toHaveLength(14)` → 15）。確認紅燈並貼出輸出；
  **「auth 停用…回 404」在路由不存在時同樣是 404，預期先綠——點名並標 regression guard**；守衛檔三個 it 以實跑結果點名真紅／先綠
  - 完成（RED commit `fac4d74`）：新增 `test/local-import.test.ts` 11 個 it（名稱與 delta spec 驗收錨點逐字一致）；`expected-user-guard.test.ts` 的 `SAMPLES` 補 `POST /api/import`（合法最小匯入 body；B 已有資料，若被放行會回 409，401 斷言仍可分辨）、`toHaveLength(14)` → 15，其餘斷言一行未改。
  - 紅燈（單檔實跑，`/api/import` 尚未存在回 404）：`local-import.test.ts` 11 個 it 中 **10 紅、1 先綠**（`Tests 10 failed | 1 passed`）。
    **先綠（regression guard）**：「auth 停用且無 DB binding 時匯入端點回 404」（路由不存在同樣 404）。真紅：未登入 401（`expected 404 to be 401`）、B 的匯入不受 A、五段資料與順序、四表任一有資料 409、重複匯入 409、skipped、七種 400、300／2000 大量資料、ACCOUNT_MISMATCH（`expected 404 to be 401`）、歷史讀回（匯入回 404）。
    `expected-user-guard.test.ts`：6 個 it 中 **4 紅 2 先綠**（`Tests 4 failed | 2 passed`）。真紅：「每條…帳號不符…」（`POST /api/import（他人的帳號） 狀態碼: expected 404 to be 401`）、「缺少或空白的預期帳號標頭…」（同型）、「列舉出的使用者資料路由恰與守衛樣本表一致」（列舉 14 ≠ 樣本 15）、「未登入回 UNAUTHORIZED、停用回 404…」（`POST /api/import 未登入狀態碼: expected 404 to be 401`）；先綠（未改動、與新樣本無關）：「標頭與 session 相符時…」「非使用者資料路由不要求預期帳號標頭」。
  - 機械複驗：`git show fac4d74^:hono-pickball/test/local-import.test.ts` 回 `exists on disk, but not in 'fac4d74^'`（檔案新增）；`git show fac4d74^:hono-pickball/test/expected-user-guard.test.ts` 中 `POST /api/import` 0 筆、`toHaveLength(14)` 1 筆。紅燈成立。
- [x] 3.2 GREEN（TDD）：新增 `src/import/local-import-repository.ts`（design Decision 1、2；守衛沿用 B7 `batch-guard.ts`，SHALL NOT 另寫一份守衛或錯誤分類）、
  `src/routes/import.ts`（`SessionAppEnv` sub-app、`use("*", localAuth, requireSession, requireExpectedUser)`、`onError(userDataOnError)`、`zValidator` 以 `invalidBodyHook` 回 400）；`src/index.ts` 以 `app.route("/api/import", importRoutes)` 掛載。
  json_each 插入以 `db.insert(<table>).select(sql\`… FROM json_each(${json}) WHERE true ORDER BY key\`)` 撰寫（不可用 `db.run`／`db.all`，見 design Decision 2）；獨立計分板以 `onConflictDoNothing().returning({ userId })`。
  3.1 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
  - 完成（GREEN commit `7cb53dd`）：`src/import/local-import-repository.ts`、`src/routes/import.ts`、`src/index.ts` 掛載；守衛沿用 `batch-guard.ts` 的 `insertBatchGuard`／`releaseBatchGuard`／`isBatchGuardViolation`，未另寫守衛或錯誤分類。
    batch 固定 7 條：守衛（四張表皆無本人列，條件全在 SQL 內）→ 參賽者 → 回合 → 分槽 → 歷史 → 獨立計分板（`onConflictDoNothing().returning({ userId })`）→ 釋放守衛。
    **空陣列處理**：回合與獨立計分板最多一列，也以 `json_each` 展開 0 或 1 個元素的陣列（`[]` 或 `[{ data }]`），空陣列插入 0 列；因此 7 條陳述式與資料有無無關，不需要條件式 batch，守衛與釋放永遠存在。
    獨立計分板段為 `insert().select(sql…json_each…)` 接 `.onConflictDoNothing().returning(...)`（apply §1.4 只驗證過 `values`，此寫法於本次實測可行：skipped 與 imported 兩分支皆有測試覆蓋）。
    回應 `scoreboardCurrent`：請求無獨立計分板為 `none`，有則依 returning 是否有列為 `imported`／`skipped`。
  - 綠燈：`local-import.test.ts` 11/11、`expected-user-guard.test.ts` 6/6（GREEN 時；追加測試後見下）；`pnpm --filter ./hono-pickball typecheck` 與 `pnpm -r exec tsc --noEmit` 皆 exit 0。
  - 追加的 regression guard（加入即綠，非 TDD 紅燈）：`13ccdf0`「300 位參賽者與 2000 筆歷史可一次匯入」加 30 個分槽（使分槽改逐筆 values 時超過 100 參數上限而轉紅）、「…七者…400」追加 JSON 語法錯誤須回 400 `INVALID_BODY`（證明 `onError` 有掛；此為 spec「七者」之外的超集斷言，it 名稱不變）；
    `31a0c1e` golden path 加 `updated_at >=` 請求前時間（殺死 `updated_at` 寫 0 的變異）。
  - mutation（`src/import/local-import-repository.ts`、`src/routes/import.ts`、守衛樣本表；harness 三重落地檢查，每次變異後還原並確認 `git status` 乾淨；每次跑 `local-import.test.ts`＋`expected-user-guard.test.ts` 共 17 個 it）：
    44 條（含等價對照），**除下列等價者外全數轉紅**——守衛少 `matchmaker_players`／`round`／`match_slots`／`history` 各一（皆由「四張對戰分配機表任一有資料時回 409…」殺死）；守衛加入 `scoreboard_current`（「雲端已有獨立計分板時略過…」）；四個守衛子句各自拿掉 `user_id` 條件（「B 的匯入不受 A…」等 6 個 it）；
    守衛移到 batch 最後（7 個 it）；完全拿掉守衛（4）；拿掉釋放守衛（2）；參賽者／歷史／分槽三段各自改逐筆 `values`（各轉紅於「300 位參賽者與 2000 筆歷史可一次匯入」）；`played_at` 改 0（「匯入的歷史可被歷史端點…」）；獨立計分板改 `onConflictDoUpdate`（「雲端已有獨立計分板時略過…」）；
    `user_id` 改錯（重構前五段各一、重構後 helper 一）；`version` 改 0（重構前五段各一、重構後 helper 一）；`updated_at` 改 0（補斷言後轉紅）；`sort_order` 改常數（SQL 端與 JSON 端各一）；歷史／分槽欄位順序對調；
    sub-app 拿掉 `requireSession`（12 個 it）、拿掉 `requireExpectedUser`（3）、拿掉 `localAuth`（14）；樣本表拿掉 `POST /api/import`（「列舉出的…恰與守衛樣本表一致」）；`skipped`／`imported` 對調；`none` 分支改 `skipped`；本機有計分板時一律 `imported`；409 改 500、改 200；`zValidator` 拿掉；`onError` 拿掉；
    `isBatchGuardViolation` 判斷拿掉（409 變 500，兩個 it 轉紅）；回應 `players`／`slots`／`history` 筆數改常數、`round` 恆 true。
    **存活者（等價）**：歷史／參賽者／全部各段拿掉 `ORDER BY key`——SQLite 的 `json_each` 本就依 key（陣列索引）順序輸出列，行為上等價；保留是為了不依賴實作細節的穩健寫法，無法以測試區分。
    helper 拿掉 `WHERE true`（含計分板 ON CONFLICT 段）仍綠：本版 drizzle／D1 不受解析歧義影響，等價；`WHERE true` 依 apply §1.3 的 Context7 查證保留。
    另放對照組 `updatedAt` 改用 `Date.now()`、`fields: readonly string[]` 改 `string[]`、`const now = new Date(Date.now())` 皆維持綠。
  - 後端全套（持鎖）24 檔 177 tests 全綠（baseline 23／166）；`pnpm --filter ./hono-pickball db:generate` 後 `git status --porcelain hono-pickball/drizzle` 為空（No schema changes）。
  - Stage 2 缺口與補強（test commit `fd2ccda`、註解 refactor `c9386e2`；regression guard，加入即綠，`src` 邏輯未改）：Stage 2 判 FAIL，6 條非等價變異存活。補強前以 harness 對 HEAD 測試實測存活、補強後轉紅：
    L21（`ORDER BY` 改依 `matchId`）、L26（歷史 `match_id` 欄位寫錯，另以「附加尾碼」變異 L26b 對照）→ bulk it 比對 `rowsOf` 依 rowid 的 `match_id` 等於輸入順序（`bulk-h-10` 字串序在 `bulk-h-2` 前）、讀回 it 比對 `match_id` 為 `h1`／`h2`／`h3`；
    L34（`played_at` 加 1）→ 讀回 it 直接讀表，`played_at` 精確等於 `Date.parse(T1／T2／T2)`；
    L49（分槽 `match_id` 欄位寫錯，含附加尾碼 L49b）→ golden it 加 `GET /slots/m1` 與 `match_id` 欄位斷言；
    L50（`updated_at` 改未來 +1 天）→ golden it 補上界 `finishedAt`；
    L60（catch 一律回 conflict）→ bulk it 內另以新使用者匯入 3 筆各含 800KB 姓名（單段 JSON 參數 > 2MB）的合法資料，實測 D1 拋錯、回 500，且該使用者每張使用者資料表（含 `sync_batch_guards`）零列（對應 `57bbd75` 補在 delta 的 AND）。
    另新增讀回 it 的特殊字元姓名（`"`、`\`、換行、tab、emoji、中文）往返斷言，額外變異 L61（emoji 被替換）、L62（反斜線被替換）補前存活、補後轉紅。
    補前存活／補後轉紅：L21、L26、L26b、L34、L49b、L50、L60、L61、L62 九條皆「補前 11/11 綠、補後轉紅」；L49（欄位取 `data.scores.us`）在 13ccdf0 的 30 分槽下補前已被 bulk it 殺死，補後再加兩條斷言。
    等價對照 3 條（`updatedAt` 改 `Date.now()`、`fields` 型別放寬、歷史 `match_id` 取 `data.matchId` 同值路徑）補前補後皆維持綠。`results[5]` 以註解標明與陳述式順序耦合（`c9386e2`，僅註解）。
- [x] 3.3 REFACTOR：三條 `json_each` 插入的組裝是否值得抽成 helper；`hono-pickball/CLAUDE.md` 後續須知第 3 點（第二個守衛 batch 呼叫端出現時抽 `guardedBatch`）是否現在處理；無壞味道則註記 skipped
  - 完成（commit `af57946`）：實際為五條（參賽者、回合、分槽、歷史、獨立計分板）`json_each` 插入，user_id、`version` 1、`updated_at`、`WHERE true`、`ORDER BY key` 各重複五份，抽成同檔私有函式 `selectFromJsonEach(userId, fields, json, updatedAt)`，行為不變；`ORDER BY key` 與 `version` 因此只剩一處。
    `fields` 以 `sql.raw` 組路徑，只接受程式碼內常數（函式註解已註明）。重構後 `local-import`＋`expected-user-guard` 17/17 全綠、兩段 typecheck exit 0；上列 mutation 重構後重跑，結果見 3.2 註記。
  - `guardedBatch`：**不抽**。`score-repository` 的 batch 為可變長度、catch 另把歷史主鍵衝突分類為 conflict；匯入為固定 7 條且需取回計分板 `RETURNING` 結果，共用包裝需要泛型與額外分類參數，複雜度高於兩處各數行的重複，且會改動已驗收的 B7 程式碼。
    `hono-pickball/CLAUDE.md`「後續須知」第 3 點的現況描述（`guardedBatch` 不是具名函式）仍成立，本節未改該文件（文件更新屬後續 task）。

## 4. 前端：匯入內容與結果分類

Depends on: §3

- [x] 4.1 RED（TDD）：新增 `lib/sync/local-import.test.ts`，spec 該檔的五個 it（以 happy-dom 的 localStorage seed 五個 key；斷言「呼叫前後逐字相同」時使用不含損毀資料的 seed）。確認紅燈
  - 完成（RED commit `dc37269`）：五個 it 名稱與 delta spec 逐字一致；以 happy-dom localStorage seed 五個 key（key 取自 reader 的 `storage-keys` 常數），`importLocalData` 測試 stub 全域 `fetch`（經真實 `requestJson`），斷言 200／409／401／500 與 400、不符 schema 的 200、204、網路錯誤。
    紅燈輸出：`pnpm --filter ./nextjs-pickball test --run lib/sync/local-import.test.ts` → `Error: Failed to resolve import "./local-import" from "lib/sync/local-import.test.ts"`，`Test Files 1 failed (1) / Tests no tests`。
    機械複驗：`git show dc37269^:nextjs-pickball/lib/sync/local-import.ts` → `fatal: path ... does not exist in 'dc37269^'`；`git show dc37269^:nextjs-pickball/lib/sync/local-import.test.ts` 亦不存在，紅燈成立（模組不存在，非斷言偽造）。
    先綠者：RED 當下五個 it 皆無法載入，無先綠者。GREEN 後 mutation 發現存活變異 S4（未完成但無分槽的場次仍被納入），補強 commit `56df8f5`（phase 2 回合加入無分槽的 m4）寫入即綠，**標 regression guard**，非 TDD 紅燈。
- [x] 4.2 GREEN（TDD）：新增 `lib/sync/local-import.ts`（design Decision 3、4、4.5；請求經 `requestJson`；`importLocalData(expectedUserId, payload)` 以第一參數原樣交給 `requestJson`）
  - 完成（GREEN commit `384d6df`）：`lib/sync/local-import.ts` 匯出 `buildLocalImportPayload`、`importLocalData`、`backupToImportRequest`、`hasImportableLocalData` 與型別 `LocalImportSummary`／`LocalImportPreview`／`LocalImportOutcome`；型別來自 `@pickball/core/api/import`。`/api/import` 路徑字串只在本檔。
    單檔 5/5 綠；前端全套（持共用鎖）106 檔 1059 tests 全綠；`pnpm -r exec tsc --noEmit` exit 0；新檔 ESLint 無 error。REFACTOR：skipped（無壞味道）。
    - 實作取捨：`hasImportableLocalData` 以 `!buildLocalImportPayload().isEmpty` 判斷而非檢查 key 是否存在——元件掛載時的 write effect 會寫出只含空陣列的容器，單看 key 會讓沒有資料的訪客也看到提示。`summary` 欄位為 `{ players, round, slots, history, scoreboardCurrent, duplicateHistorySkipped }`。`importLocalData` 回傳 `imported`（含回應 `imported`）／`cloud-not-empty`／`unauthorized`／`failed`，`rejected`、不符 schema 的 200、204、網路錯誤皆歸 `failed`。
    - mutation（harness：`src.count(old)==1`、`new!=old`、`git diff --stat` 有輸出、每次還原並確認 `git status` 乾淨）共 71 次（含 S4 補強後重跑）：
      分槽（讀已完成場次、只收 pending、讀所有本機分槽含孤兒、matchId 取 state 內的值、缺值仍納入、略過 current）、歷史（不去重、保留最後一筆、重複數常數 0／1、summary 用未去重筆數）、
      `isEmpty`（漏判名單／回合／歷史／獨立計分板、恆 true、恆 false）、`oversize`（門檻 2,000,000、`>` 改 `>=`、漏判名單／歷史／分槽、三段加總、全部或各段改字元數、恆 false）、
      清除本機（成功後清除五個 key 各一次、409 後清除、失敗後清除）、分類（409→failed、401→failed、409→unauthorized、rejected→imported、failed→unauthorized、204 不判失敗、筆數固定）、
      `expectedUserId`（固定字串、空字串）、路徑／方法／body（路徑改錯、PUT、不帶 body、body 被改、schema 寬鬆）、`backupToImportRequest`（current 非 null、matches 非空、漏帶 players／currentRound／history／scoreboard、version 2）、
      `hasImportableLocalData`（漏判名單／回合／歷史／獨立計分板、改用 key 存在、恆 true、恆 false）、payload／summary 欄位（version 2、漏帶 currentRound、round／scoreboardCurrent／players 常數）。
      **68 次轉紅**；3 次未轉紅：S4 首輪存活（已補強後重跑轉紅）、等價對照 E5（`isEmpty` 加判分槽）與 I5（`hasImportableLocalData` 加判分槽）——有分槽必有未完成場次、即必有回合，故分槽段無法單獨使 `isEmpty` 為 false，此即「`isEmpty` 漏判分槽」無法成為可殺變異的原因，兩條等價對照如預期維持綠燈。
  - Stage 2 缺口與補強（test commit `5055ac9`、註解 commit `ca5938a`；regression guard，加入即綠，非 TDD 紅燈，`local-import.ts` 邏輯未改）：Stage 2 判 FAIL，10 條非等價變異存活。補強前以 harness 對 `5055ac9^` 的舊測試實測全數存活、補強後全數轉紅：
    M08（已完成場次 `continue` 改 `break`）、M09（無分槽 `continue` 改 `break`）→ 第一個 it 追加回合 `[completed m2, pending m5（無分槽）, pending m1, scoring m3]`，斷言分槽 matchId 為 `["m1","m3"]`；
    S05／S06（`summary.round` 改用 `current !== null`／`matches.length > 0`）、S11／S12（`summary.scoreboardCurrent` 改用 `currentRound !== null`／`players.length > 0`）→ 第二個 it 追加「只有獨立計分板」「只有已完成場次的回合」兩組 summary `toEqual`；
    C12（`hasImportableLocalData` 內清除本機 key）→ 以完整 seed 呼叫前後比對五個 key 逐字相同；
    B07／B08／B09（`backupToImportRequest` 的 `scoreboard` 改讀本機 current／本機分槽／整段 payload）→ 呼叫前先 `seedFullLocalData()`，使既有的空計分板斷言有鑑別力。
    等價對照 3 條（`dedupeHistory` 的 Set 改陣列 `includes`、`hasImportableLocalData` 加判分槽、`isEmpty` 的 `players.length === 0` 改 `!players.length`）補前補後皆維持綠。
    自審時發現首輪 M08／M09 的 harness 寫成無條件 `break`（補前就轉紅，屬 harness 錯誤而非測試鑑別力），改為 `if (…) break;` 後重跑才得到「補前存活、補後轉紅」。
    另修正 `buildLocalImportPayload` JSDoc：「只讀不寫」改為本模組不寫入、reader 遇損毀資料的既有清理除外（design Decision 3 已載明）。單檔 5/5 綠、`pnpm -r exec tsc --noEmit` exit 0、ESLint 0 errors。
  - Stage 2 複審缺口與補強（test commit `1a616ed`；regression guard，加入即綠，非 TDD 紅燈，`local-import.ts` 未改動；只在既有 it 末段追加斷言與 seed、新增 `emptyLikeSeeds` helper，既有 it 名稱與斷言未改，diff 為 99 行純新增）：Stage 2 複審判 FAIL，8 組非等價變異存活。補強前以 harness 對 `HEAD:local-import.test.ts`（探針檔，跑完已刪）實測全數存活、補強後全數轉紅：
    N09／N10（`backupToImportRequest` 的 players／currentRound 改讀本機；`5055ac9` 的完整 seed 恰與備份逐欄相同所致）→ 備份 it 末段清空後 seed 逐欄不同的本機資料（名單 p9、回合含 pending m7、分槽 m7、current、歷史 h9），斷言 players、currentRound、history 取自備份、scoreboard 為空；
    N08（`importLocalData` 改送本機組出的 payload）→ 以與本機不同的請求（p9、h9、無回合）呼叫，斷言 body 等於參數；
    N16／N16b（`imported` 筆數改由 payload 推算）→ 追加兩個各欄與請求及本機都不一致的 200 回應（布林欄位兩個方向各一次），斷言結果原樣帶回；
    N12／N13（isEmpty 時清除本機／移除孤兒分槽 key）→ 「只有空容器」「只有孤兒分槽 m6」兩組 seed，於 isEmpty 與 `hasImportableLocalData` 兩個 it 比對呼叫前後五個 key 逐字相同；
    N03／N04（去重鍵改 `matchId + playedAt`／略過筆數改 0／1 旗標）→ seed h5、h6、h5'（playedAt 等欄不同）、h7、h5''、h7'、h8，斷言保留 `[h5, h6, h7, h8]`、略過 3 筆（唯一筆數與略過筆數刻意不同）。
    回歸：前輪 10 條（M08、M09、S05、S06、S11、S12、C12、B07、B08、B09）與 N11 仍轉紅。新嘗試 16 條（imported 單欄改由 payload 或本機推算 5 條、body 單段改讀本機 3 條、去重鍵改 `matchId + courtNumber`、略過筆數上限 2、略過筆數改 `history.length - 1`、`readRound() ?? backup`、名單併入本機、isEmpty 時移除分槽 key／空名單時移除名單 key、只略過相鄰重複）全數轉紅。
    等價對照 3 條（`dedupeHistory` 的 Set 改陣列 `includes`、`isEmpty` 加判分槽、body 改 `{ ...payload }`）補前補後皆維持綠。單檔 5/5 綠、`pnpm -r exec tsc --noEmit` exit 0、ESLint 0 errors。
  - Stage 2 第二輪複審缺口與補強（test commit `8f273eb`；regression guard，加入即綠，非 TDD 紅燈，`local-import.ts` 未改動；只在既有三個 it 末段追加 seed 與斷言，既有 it 名稱與斷言未改，diff 為 68 行純新增）：Stage 2 第二輪複審判 FAIL，6 條非等價變異存活。補強前以 harness 直接對 `HEAD`（`4045bda`）版測試實測全數存活、補強後全數轉紅：
    R07／Y13／R09（名單只取啟用者、`summary.players` 改啟用者數、名單依 id 排序；既有名單 seed 全為啟用且 id 已排序所致）→ 第一個 it 末段 seed id 非字典序且夾兩位停用者的名單（p7、p2 停用、p5、p1 停用），斷言 `payload.players` 原樣含順序（後端 sort_order 取自陣列索引）、`summary.players` 為 4；
    R08（歷史只取 singles；既有歷史 fixture 全為單打所致）→ 同段 seed 單打 h10、雙打 h11（`doublesComposition: "mixed"`、teamB 勝）、單打 h12，斷言 `payload.history` 原樣三筆、`summary.history` 為 3，並以快照確認 reader 未降級或回寫、payload 通過 `LocalImportRequestSchema`；
    O12（oversize 改量去重前的歷史）→ 第二個 it 末段 seed 兩筆同 matchId、各約 1MB 的歷史（去重前超過 1,900,000 位元組、去重後未超過），斷言略過 1 筆、`oversize` 為 false；
    H07（`hasImportableLocalData` 在 oversize 時回 false）→ 第五個 it 末段 seed 超過上限的歷史，斷言 `oversize` 為 true 且 `hasImportableLocalData()` 仍為 true。
    **H07 裁定（leader）**：依 it 名稱「只在任一 key 有資料時為 true」與 spec「本機有可匯入的資料」，oversize 時仍為 true——參賽者頁照樣提示並帶使用者到資料頁，由資料頁匯入區塊顯示 oversize 說明；現行實作即此語意，未改實作。
    回歸：前兩輪 19 條（M08、M09、S05、S06、S11、S12、C12、B07、B08、B09、N03、N04、N08、N09、N10、N12、N13、N16、N16b）與 execution-plan b. §4 必做 13 條（分槽讀已完成場次、歷史不去重、保留最後一筆、門檻 2,000,000、成功後清除五個 key 各一次、409／401 分類為 failed、`expectedUserId` 固定字串／不傳）補強後仍全數轉紅；reviewer 第二輪 168 條變異集重跑，非等價者全數轉紅（其中 6 條為 reviewer 首版字串比對失敗的 HARNESS-ERROR，其修正版皆轉紅）。
    等價對照 4 條（E09 `history.length + skipped === 0`、S14 分槽依 matchId 排序、EQ1 Set 改陣列 `includes`、EQ11 `summary.players` 改再讀一次 `readRoster()`）補前補後皆維持綠。單檔 5/5 綠、`pnpm -r exec tsc --noEmit` exit 0（持共用鎖）、測試檔 ESLint 0 errors。
  - Stage 2 第三輪複審缺口與補強（test commit `091b591`；regression guard，加入即綠，非 TDD 紅燈，`local-import.ts` 未改動；只在既有四個 it 末段追加 seed 與斷言，並新增 fixture `distinctFieldPlayers` 與 helper `makeDoublesHistoryEntry`、`playUntilFinished`，既有 it 名稱與斷言未改，diff 為 198 行新增、2 行刪除（皆為 import 擴充匯入 `scoreboardReducer` 與 `Team`））：Stage 2 第三輪複審判 FAIL，26 條非等價變異存活（派工單寫 24 條，但逐條列出者為 26 條，以實測為準）。以 reviewer 的 96 條變異集對 `HEAD`（`3908e46`）版測試實測全數存活、補強後全數轉紅：
    G10（歷史依 matchId 排序）、K01～K04（去重鍵加 format／winner／scoreB／teamA 首位球員）→ 第一個 it 末段 seed 歷史 h30、h10、h20（matchId 非字典序）加一筆與 h30 在單雙打、勝方、scoreB、teamA 球員皆不同的同 matchId 雙打紀錄，斷言 `payload.history` 為原順序三筆、略過 1 筆；
    S03／S04（略過 finished／0:0 分槽）、S06／S07／S13（分槽 history 改 []、status 改 setup、winner 改 null）→ 同段回合的兩個未完成場次分別 seed 以 reducer 實際打完的 finished 分槽（winner 為 us、帶 rally history）與 0:0 分槽，斷言分槽原樣兩筆；
    C01／C04（finished 的 current 改 null、current history 改 []）、C02（0:0 的 current 改 null）→ 同段 seed finished（winner 為 them、帶 rally history）的獨立計分板，下一段改 seed 0:0 的獨立計分板，各斷言 `scoreboard.current` 原樣；
    F01／F02／F04／F05／F06（名單 restCount／gamesPlayed 歸零、rating 改 5、createdAt 固定、色碼改寫、gender 改 female）→ 同段名單改用各欄皆非 `makePlayer` 預設值、id 非字典序且夾停用者的 `distinctFieldPlayers`，斷言 `payload.players` 原樣；以上兩段皆以快照確認 reader 未降級或回寫、payload 通過 `LocalImportRequestSchema`；
    O01（oversize 只量啟用者）→ 第二個 it 末段 seed 姓名超過上限的停用者加一位啟用者，斷言 `oversize` 為 true；
    I06（body 名單只取啟用者）→ 第三個 it 末段以名單為 `distinctFieldPlayers` 的請求呼叫，斷言 body 原樣；
    B01／B02／B03／B06／B07／B08（備份名單只取啟用者、依 id 排序、歷史只取 singles、名單 restCount／gamesPlayed 歸零、回合去掉已完成場次、timer 改 null）→ 第四個 it 末段以 `distinctFieldPlayers`、單打加雙打歷史、含已完成場次且 timer 非 null 的回合組成備份，斷言 players／currentRound／history 原樣並通過 `LocalImportRequestSchema`。
    回歸：96 條中補前已轉紅的 59 條（含第二輪的 R07、Y13、R09、R08、O12、H07 與 execution-plan b. §4 必做 P01～P09：分槽讀已完成場次、歷史不去重、保留最後一筆、門檻 2,000,000、成功後清除五個 key 各一次、409／401 分類為 failed、`expectedUserId` 固定 user-a／user-b／不傳）補強後仍全數轉紅；補後統計 85 轉紅、11 存活。
    等價對照 7 條（EQ1 Set 改陣列 `includes`、EQ2 `summary.round` 改再讀 `readRound()`、EQ3 body 改 `{ ...payload }`、EQ4 backup version 改 `backup.version`、EQ5 略過分支加 `void 0`、C05 current `teamPlayers` 改 null、O03 oversize 加判 current）補前補後皆維持綠。
    **規格未定義 4 條（leader 裁定，不補測試、維持現行行為）**：F08（名單依 id 去重）、Y03（`summary.round` 改用 matches 數）、G04（playedAt 經 `toISOString` 正規化）、B04（備份歷史去重）——現行行為皆為「前端原樣送出、不合法者由後端 400 拒絕」，spec 未要求前端處理；補前補後皆存活。
    單檔 5/5 綠、`pnpm -r exec tsc --noEmit` exit 0（持共用鎖）、測試檔 ESLint 0 errors。

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
