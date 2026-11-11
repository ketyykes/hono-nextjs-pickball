# Tasks: cloud-json-import-append

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest（免鎖）：前端 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`；後端（workerd）`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball test --run <path>`；核心 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core test --run <path>`
> （**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時會 "No projects matched" 且 exit 0；後端在受限沙箱噴 `listen EPERM 127.0.0.1` 時放行後重跑，不是設定錯誤）。
> 單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec 路徑> [-g <test 名稱>]`，前後清殘留 dev server（只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`）。
>
> **重負載雙鎖**（E2E、eslint 全套、全套 vitest、build）：先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→
> `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> 紅燈宣稱一律以 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱；改寫的既有 it／test 確認 RED 前為舊斷言）。
>
> **標註**：`TDD`；`regression guard`；`改寫既有 it`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C10）。
>
> **範圍**：產品程式碼只改 proposal Impact 列出的 6 個檔案（核心 1、後端 2、前端 3）；文件只改兩份 workspace `CLAUDE.md`。**不新增相依、無 migration、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`（`beforeEach`、`afterEach` 亦同）；E2E 不得使用 `waitForTimeout`。
> 文案以 delta spec `data-transfer`「登入時的資料工具頁」為準（附加確認、預覽名單標題與名稱提醒、沒有新增者與名單讀取失敗、四條說明、兩顆按鈕、無可附加、結果與補充說明、新 `jsonCloudImportHint`）；SHALL NOT 新增 spec 以外的文案。
>
> **授權改寫的既有測試（僅限下列；其餘既有 it／test 的名稱、斷言與 setup 一律不得修改）**：
> ① `hono-pickball/test/expected-user-guard.test.ts`：`SAMPLES` 補一條 `POST /api/import/append`（合法附加 body），it「列舉出的使用者資料路由恰與守衛樣本表一致」的 `toHaveLength(15)` 改為 `toHaveLength(16)`；
> ② `nextjs-pickball/tests/e2e/user-data/{local-import,history-sync,roster-sync}.spec.ts` 的常數 `JSON_CLOUD_IMPORT_HINT_TEXT` 改為新說明文字（三檔共 5 處以它為同步點；test 名稱與其他斷言不變）——與產品的 `jsonCloudImportHint` 改寫放在同一個 GREEN commit（§4.2），**不宣稱紅燈**；
> ③ `nextjs-pickball/tests/e2e/user-data/local-import.spec.ts` test「登入時以 JSON 備份匯入到空的雲端且不寫入本機」：第二次選檔後的 `getByText(CONFLICT_TEXT)` 可見斷言改為 `getByTestId("json-backup-append-confirm")` 可見且 `getByText(CONFLICT_TEXT)` `toHaveCount(0)`（不按附加；相關註解同步）。
>
> **本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：前端 RED（§4.1、§5.2 匯入尚不存在的匯出）屬型別紅燈，RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。
> 核心與後端的 `test/**` 不在 Stop hook 範圍（§2.1、§3.2 不會被擋），但交件前 MUST 實跑 `pnpm --dir …/packages/pickball-core typecheck` 與 `pnpm --dir …/hono-pickball typecheck` 並以 exit code 為準。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/cloud-json-import-append`、工作樹除本 change artifact 外乾淨；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install` 後 lockfile 零變動；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local` 成功；
  雙鎖下跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck（test-plan C1）、`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（errors／warnings 數）、
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --list`（六個 project 各自數量）；回填 environment.md Verification 並 commit（`chore:`）
- [x] 1.2 對齊 main：確認 proposal Impact 列出的產品檔與測試檔自 `cad7de9` 後未被其他提交改動（`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff --stat cad7de9 HEAD -- packages/pickball-core hono-pickball nextjs-pickball/{lib,components,tests}` 只含本 change 的提交）；
  以 python difflib 比對本 change 四個 MODIFIED Requirement（`user-data-sync` 三個、`data-transfer` 一個）與目前主 spec，除本 change 刻意增修外應無差異；**若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**，
  `DO_NOT_TRACK=1 openspec validate cloud-json-import-append --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions。
  另以 Context7 查證並把結果記在本 task 後方：drizzle（0.45.2）sqlite 的 `db.insert(t).select(sql\`…\`)` 能否搭配 `.onConflictDoNothing()` 與 `.returning()`、在 `db.batch()` 中帶 `.returning()` 的結果形狀；
  D1 對 `json_each`／`json_set`／`json_group_array`／`->>` 與 CTE 的支援（design Decision 4、11 的假設）。與 design 假設不符時停止並回報
  - 1.1 結果記於 environment.md Verification（全綠、與上一個 change 的最終 gate 數字一致）。
  - 1.2 對齊：`git diff --stat cad7de9 HEAD -- packages/pickball-core hono-pickball nextjs-pickball/{lib,components,tests} openspec/specs` 為空（`cad7de9..HEAD` 只有本 change artifact `081b9e4`）。以 python 逐行比對四個 MODIFIED Requirement 與主 spec：主 spec 中不在 delta 的行為 user-data-sync 三個各 2 行、data-transfer 5 行，全為本 change 刻意改寫（守衛路由數 15→16、批次寫入端點清單、版本下限的建立與重置條文、JSON 還原列與雲端語意段落），無誤刪；主 spec 未被其他 change 改動，不需重套。
  - Context7 查證（coordinator）：
    - drizzle（`/drizzle-team/drizzle-orm-docs`）：sqlite `insert().select(sql\`…\`)` 支援 SQL template 形式；搭配 upsert（`onConflictDoNothing`）時 SELECT 須帶 `WHERE`（文件明載解析歧義，`WHERE true` 即可）；`db.batch()` 中帶 `.returning()` 的陳述式回傳列陣列、其餘回 `D1Result`（v0.29.0 batch 範例的 tuple 型別）；v1 RC 修正了 `insert().select().returning()` 的 `.get()` 型別，`.all()` 形狀不受影響。與 design Decision 4 一致。
    - D1（`/llmstxt/developers_cloudflare_d1_llms-full_txt`）：Query JSON 文件列出 `json_each(value, path)`、`json_set`、`json_group_array`、`->>`、`json_extract` 為支援函式；`batch()` 依序執行、任一失敗整批回滾，回傳與陳述式同序的 `D1Result`，`results` 為 RETURNING 列。CTE（`WITH`）文件未逐條列出，屬 SQLite 標準語法，propose 階段已於本機 D1 實測可用；正式 D1 無法於本機驗證（design Risks 已記）。`meta.changes` 欄位存在但未定義 ON CONFLICT 時的語意，維持 Decision 以 RETURNING 列數計數。與 design 假設相符，不停止。

## 2. 核心附加契約（`@pickball/core/api/import`）

Depends on: §1

- [x] 2.1 RED（TDD）：`packages/pickball-core/test/api/import.test.ts` 新增 it「AppendImportRequestSchema 拒絕空字串或重複的參賽者 id、重複的歷史 matchId 與兩段皆空」「AppendImportResponseSchema 只接受新增與略過筆數的固定形狀」；
  `packages/pickball-core/test/api/import-limits.test.ts` 新增 it「serializeAppendSegments 同名只保留第一位參賽者，對照段含全部參賽者，歷史段與整份匯入的歷史段相同」「checkAppendLimits 三段各自恰為上限時通過，多一位元組或超過 500 位參賽者即不通過」。
  兩檔單檔 vitest 確認四個新 it 紅（匯出不存在）、既有 it 全綠並貼出輸出
  - RED commit `7e293e1`（`9e11b6d` 為後續修正測試夾具：補長位置改在無同名者的參賽者、`gender` 型別；不影響紅燈判定）。四個新 it 皆真紅：`AppendImportRequestSchema`／`AppendImportResponseSchema` 為 undefined（`Cannot read properties of undefined (reading 'safeParse')`）、`serializeAppendSegments`／`checkAppendLimits` `is not a function`；單檔 vitest 為 `Tests 4 failed | 9 passed (13)`，既有 9 個 it 全綠。
  - 機械複驗：`git show 7e293e1^:` 的產品檔 `import.ts` 不含 `Append`、兩個測試檔不含任何 `Append`；RED commit 只改兩個測試檔。無 regression guard。
- [x] 2.2 GREEN（TDD）：`packages/pickball-core/src/api/import.ts` 依 delta spec「本機備份附加到雲端的 API」與 design Decision 3、7、11 新增 `AppendImportRequestSchema`、`AppendImportResponseSchema`、`AppendImportRequest`／`AppendImportResponse` 型別、`serializeAppendSegments`（參賽者段、參賽者對照段、歷史段）、`checkAppendLimits`；
  不改既有匯出、不新增模組（`CORE_MODULES` 不變）。2.1 全綠、核心全部既有 it 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core typecheck` exit 0
  - GREEN commit `6fb035b`。核心全部 10 檔 31 it 全綠；`pnpm --dir …/packages/pickball-core typecheck` exit 0。參數形狀的對照段欄位名稱 spec 未指定，採 `AppendSegments.playerNames`（`{ players, playerNames, history }`），§3 後端以此名取用。
- [x] 2.3 REFACTOR：歷史段與 `serializeImportSegments` 是否共用私有 helper（預期共用，確保逐字相同）；重複判定（參賽者 id、`matchId`）是否與既有 `LocalImportRequestSchema` 的寫法一致；無壞味道則註記 skipped
  - REFACTOR commit `133f604`：抽出私有 `serializeHistorySegment`，整份匯入與附加共用（歷史段逐字相同）；重複判定（參賽者 id、`matchId`）的寫法與 `LocalImportRequestSchema` 一致，不另動。測試仍全綠、typecheck exit 0。
  - mutation（單檔雙檔 vitest，三重落地檢查通過、每次還原後 `git status` 乾淨）：① 參賽者段不去重 紅；② 同名保留最後一位 紅；③ 對照段改為去重後名單 紅；④ 500 位以去重後筆數判定 紅；⑤ 不判定對照段上限 紅；⑥ 三段改以加總判定 紅；⑦ 不拒絕兩段皆空 紅；⑧ 不拒絕重複 `matchId` 紅；對照組（去重 `Set` 改 `Map`）維持綠。
- [x] 2.4 Stage 1（sonnet）→ Stage 2（opus）審查 §2：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選
  - Stage 1（sonnet）：PASS，無必修。複驗 RED `7e293e1`（`7e293e1^` 產品檔與測試檔皆不含 `Append`）、GREEN 只動 `src/api/import.ts`、`9e11b6d` 只修夾具不改斷言語意；mutation ①～⑧＋2 條額外皆紅、對照組綠。建議：回應 schema 只拿掉 `added` 的 `.int()` 或 `skipped` 的 `.nonnegative()` 會存活；`playerNames` 欄位名未寫進 design。
  - Stage 2（opus）：PASS，無必修。獨立 mutation 20 條（①～⑧ 與 10 條額外）紅、兩條對照組綠，同樣僅上述兩條存活。建議同 Stage 1，另建議為附加請求的重複檢查補「為什麼」註解。
  - 處置（coordinator）：既有新 it「AppendImportResponseSchema 只接受新增與略過筆數的固定形狀」補四欄位逐一 `-1`／`1.5` 斷言（regression guard），兩條原存活變異改為轉紅（各 1 failed）後還原；`AppendImportRequestSchema` 的 superRefine 補註解；design Decision 11 註明欄位名 `AppendSegments.playerNames`。核心 typecheck exit 0。

## 3. 後端附加端點（hono-pickball）

Depends on: §2

- [x] 3.1 RED（TDD；改寫既有 it ①）：`hono-pickball/test/expected-user-guard.test.ts` 依檔頭授權改寫 ①。單檔 vitest 貼出輸出：「列舉出的使用者資料路由恰與守衛樣本表一致」紅（列舉 15 條、樣本 16 條）；
  另兩個 it 對新樣本的 401 斷言在路由加入前也成立（middleware 對未定義路由先執行），點名標 regression guard
  - RED commit `1abcb6d`（改寫既有 it ①：`SAMPLES` 補 `POST /api/import/append`、`toHaveLength(15)` 改 16）。單檔 vitest `Tests 1 failed | 5 passed (6)`：「列舉出的使用者資料路由恰與守衛樣本表一致」紅（列舉 15 條、樣本 16 條，差 `POST /api/import/append`）。
  - regression guard：「每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變」「缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變」對新樣本在路由加入前即為 401（middleware 先執行）。
  - 機械複驗：`git show 1abcb6d^:` 為 15 與舊樣本表；RED commit 只改該測試檔。
- [x] 3.2 RED（TDD）：新檔 `hono-pickball/test/local-import-append.test.ts`，寫入 test-plan「本機備份附加到雲端的 API（ADDED）」中後端的 15 個 it（名稱見 delta spec 驗收錨點；夾具與 D1 替身依 test-plan 檔頭「後端」說明）。
  單檔 vitest 貼出輸出：12 個紅（404 或斷言不符）；「auth 停用且無 DB binding 時附加端點回 404」「未登入呼叫附加端點回 401」「預期帳號缺少或與 session 不符時附加回 401 ACCOUNT_MISMATCH 且雲端不寫入」預期寫入即綠，點名標 regression guard；
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck` 的 test 段因核心匯出已在 §2 存在而 exit 0
  - RED commit `627e459`（新檔 `hono-pickball/test/local-import-append.test.ts`，15 個 it，名稱與 delta spec 驗收錨點逐字相同）。單檔 vitest `Tests 12 failed | 3 passed (15)`：12 個紅皆為路由不存在的 404（斷言收到 `expected 404 to be 200／400／413／500`）。
  - regression guard（寫入即綠）：「auth 停用且無 DB binding 時附加端點回 404」「未登入呼叫附加端點回 401」「預期帳號缺少或與 session 不符時附加回 401 ACCOUNT_MISMATCH 且雲端不寫入」。
  - `pnpm --dir …/hono-pickball typecheck` exit 0。機械複驗：`git show 627e459^:hono-pickball/test/local-import-append.test.ts` 不存在，RED commit 只新增該檔。
- [x] 3.3 GREEN（TDD）：`hono-pickball/src/routes/import.ts` 新增 `.post("/append", jsonBodyLimit(IMPORT_BODY_LIMIT_BYTES), zValidator("json", AppendImportRequestSchema, invalidBodyHook), …)`；
  `hono-pickball/src/import/local-import-repository.ts` 新增附加函式（例如 `appendLocalBackup`）：`checkAppendLimits` 於 batch 前判定（413）、單一 `db.batch()` 固定兩條 `db.insert(…).select(sql\`… FROM json_each(${segment}) … ORDER BY key\`)`（design Decision 4、5、6、11），以 `RETURNING` 列數計算 `added`。
  SHALL NOT 使用 `db.run`／`db.all` 帶參數的 raw 陳述式、SHALL NOT 使用整批守衛、SHALL NOT 在 batch 外讀名單。3.1、3.2 全綠；`hono-pickball/test/local-import.test.ts` 與後端全部既有 it 全綠（單檔逐一或雙鎖全套）；`pnpm --dir …/hono-pickball typecheck` exit 0
  - GREEN commit `3cfde3e`（`src/routes/import.ts`、`src/import/local-import-repository.ts` 的 `appendLocalBackup`）。新檔 15 個 it 全綠；`local-import.test.ts` 與 `expected-user-guard.test.ts` 全綠；後端全套（雙鎖）28 檔 238 測試全綠；三段 typecheck（root `-r exec tsc`、hono、core）皆 exit 0。
  - 實作：兩條 `db.insert().select(sql…).onConflictDoNothing().returning()`；參賽者條件以 `NOT EXISTS`（同名、id）排除，`sort_order` 為子查詢最大值加 `row_number()`；歷史以 `WITH id_map AS MATERIALIZED` 對應表加 `json_set` 改寫 `teamA`／`teamB` 球員 id；送進 `json_each` 的就是 `checkAppendLimits` 的 `segments`；無 `db.run`／`db.all`、無整批守衛、無 batch 外讀名單、`added` 取 RETURNING 列數。
  - mutation（單檔 vitest，三重落地檢查通過、每次還原後 `git status` 乾淨）：① 轉紅（2 failed）；② 同時移除 `NOT EXISTS` 與 `ON CONFLICT` 轉紅（1）；②b 只移除 id 的 `NOT EXISTS`（`ON CONFLICT DO NOTHING` 仍在）維持綠——兩者互為備援，屬等價變異；③ 紅（2）；④ 紅（1）；⑤ 紅（1）；⑥ 紅（3）；⑦ 紅（2）；⑧ 紅（1）；⑨ 只改寫 `teamA` 紅（1，補 fixture 後）；⑩ 紅（1）；⑪ 對應表不排除「id 已在雲端」者紅（1，補 fixture 後）；⑫ 紅（1）；⑬ 紅（1）；⑭ 紅（4）；⑮ 紅（1，regression guard 轉紅）；對照組（`coalesce` 改 `CASE WHEN`、id `NOT EXISTS` 改 `NOT IN`）維持綠。
  - 補強（coordinator 裁定，commit `272d56b`，regression guard，寫入即綠）：「附加的歷史中因同名而略過…」it 內新增 `r3`（teamB `[b1, b9]` 斷言改寫為 `[c1, b2]`）與第二位使用者的規則 ① 情境（雲端 `c1`「甲」、`c5`「甲」，附加 `c5`「甲」，歷史 teamA `[c5]`、teamB `[c1]` 斷言 id 不變）；原斷言全保留。重跑 ⑨、⑪ 皆轉紅（各 1 failed）並還原，對照組維持綠。②b 為等價變異（`ON CONFLICT DO NOTHING` 備援），不處理。
  - 跨使用者隔離補強（Stage 1 發現，commit `ffa5911`、`27bfeb4`，regression guard，寫入即綠）：「B 的附加不受 A 的資料影響且不改動 A」it 後半段新增 A2／B2 情境（A2 `a1`「甲」先建立；B2 雲端 `cb2`「甲」，附加 `b1`「甲」、`a1`「甲」與引用兩者的歷史，斷言兩隊皆改寫為 `cb2`、A2 不變；`cb2` 刻意不與同檔其他 it 的 id 重複，首版用 `c1` 時 X 因碰巧同 id 而存活）。額外變異：X（id_map 同名子查詢拿掉 `user_id`）紅（1）、Y（id_map 排除條件拿掉 `user_id`）紅（1），對照組（`user_id = ?` 改寫為 `user_id IN (?)`）與對照 A 維持綠；每次還原後 `git status` 乾淨。
  - Stage 2 建議補強（commit `f4e2721`，regression guard，寫入即綠）：「備份內同名的參賽者只新增第一位」it 補「雲端 `Ann`、附加 `ann` 會新增」；「B 的附加不受 A 的資料影響且不改動 A」it 讓 A 先多建兩位（`sort_order` 最大值 2 > B 的 0），並斷言 B 新增的 `s1` 之 `sort_order` 為 B 自己最大值加 1。變異 Z9（同名比對改 `lower()`）紅（1）、Z2（`sort_order` 子查詢拿掉 `user_id`）紅（1）、對照組（`user_id = ?` 改 `user_id IN (?)`）維持綠；每次還原後 `git status` 乾淨。
- [x] 3.4 REFACTOR：附加與整份匯入共用的 json_each 寫法（`selectFromJsonEach` 等）是否沿用而非複製；兩條 SQL 的略過條件與 id 對應 CTE 是否有註解說明「為什麼」（同一條陳述式看不到自己的插入、第二條看得到第一條）；無壞味道則註記 skipped
  - skipped：附加的兩條 SQL 的欄位抽取、過濾與改寫都與 `selectFromJsonEach` 不同（需 `NOT EXISTS`、窗函式、CTE、`json_set`），強行共用會讓 helper 多出一堆參數，故不抽、不複製；兩條 SQL 的「為什麼」（同條陳述式看不到自己的插入、第二條看得到第一條、`MATERIALIZED` 只算一次）已寫在函式註解與 CTE 註解。無壞味道，未產生 `refactor:` commit。
  - REFACTOR commit `3a30362`（Stage 2 建議）：參賽者 id 排除條件由 `json_extract(j.value, '$.data.id')` 統一為與插入欄位相同的 `'$.id'`；同檔、整份匯入與守衛測試 42 個全綠、typecheck exit 0；mutation ②、對照 B 於新寫法下重跑結果不變。
- [x] 3.5 Stage 1（sonnet）→ Stage 2（opus）審查 §3：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選
  - Implementer 首次交件 DONE_WITH_CONCERNS：⑨（只改寫 teamA）、⑪（對應表不排除已在雲端 id）存活 → coordinator 裁定擴充既有新 it「歷史 id 改寫」補 teamB 改寫與「id 已在雲端且與雲端另一位同名」情境（`272d56b`，regression guard），兩條轉紅。
  - Stage 1（sonnet）：PASS，無必修。複驗 RED（`3cfde3e^` 產品檔下 12 failed | 3 passed）、15 個錨點逐字相同；建議：id_map 兩處子查詢拿掉 `user_id`（X、Y）存活，有跨使用者改寫風險 → 擴充既有新 it「B 的附加不受 A 的資料影響且不改動 A」（`ffa5911`、`27bfeb4`，首版 fixture 的 `c1` 與他 it 碰巧相同使 X 存活，改為 `cb2`），X、Y 轉紅。
  - Stage 2（opus）：PASS，無必修。獨立 mutation 28 條＋對照 6 條；確認所有子查詢帶 `user_id`、id_map MATERIALIZED 只算一次、第二條陳述式可見第一條新增列、`json_group_array` 順序已由雙打陣列斷言鎖住、batch RETURNING 形狀與計數有鎖、無 `db.run`／`db.all`／`meta.changes`。建議：① 大小寫同名未鎖（Z9 存活）② sort_order 子查詢的 `user_id` 未鎖（Z2 存活，行為上等價）③ id 排除寫法 `$.data.id` 與插入欄位不一致。處置：`f4e2721`（regression guard：雲端 `Ann`／附加 `ann` 會新增；B 新增者 sort_order＝B 原最大值＋1），Z9、Z2 轉紅；`3a30362` refactor 統一為 `$.id`（三檔 42 tests 綠）；②b 為 `ON CONFLICT` 互為備援的等價變異，不處理。

## 4. 前端請求函式與文案（lib／view 層）

Depends on: §3

- [x] 4.1 RED（TDD）：`nextjs-pickball/lib/sync/local-import.test.ts` 新增 it「backupToAppendRequest 只取備份的參賽者與歷史」「appendBackupToCloud 依回應分類為已附加、未授權、資料過大或失敗且不改動本機」
  「previewAppendPlayers 依後端的同名與 id 規則列出會新增與視為同一人的參賽者」「fetchAppendPreview 以呼叫端給的帳號讀取雲端名單並分類為預覽、未授權或失敗」（前者的 ①② fixture 與 §3 後端兩個對應 it 相同，見 test-plan）；
  `nextjs-pickball/components/matchmaker/local-import-view.test.ts` 新增 it「附加結果依略過筆數組成新增與略過的文案」「附加確認的說明、預覽名單標題與提醒、四條說明與按鈕文字為固定值」。兩檔單檔 vitest 確認六個新 it 紅、既有 it 全綠並貼出輸出（與 4.2 同一張派工單）
  - RED commit `255d18a`（只改兩個測試檔：`local-import.test.ts` 新增 4 個 it、`local-import-view.test.ts` 新增 2 個 it）。六個新 it 皆真紅：`appendBackupToCloud`／`previewAppendPlayers`／`fetchAppendPreview`／`backupToAppendRequest` 皆 `is not a function`、view 兩個 it 的 `describeAppend*`／`APPEND_*` 不存在；單檔 vitest 兩檔 `Tests 6 failed | 14 passed (20)`，既有 it 全綠。無 regression guard。
  - 機械複驗：`git show 255d18a^:` 兩個測試檔皆不含四個新 it 名稱（view 檔既有的「附加」字樣僅為舊註解）；產品檔 RED 前後未動；`previewAppendPlayers` fixture ①② 與後端對應 it 的名單相同（測試內註解註明對應 it）。
- [x] 4.2 GREEN（TDD；含 E2E 常數同步 ②）：`lib/sync/local-import.ts` 新增 `backupToAppendRequest`、`appendBackupToCloud(expectedUserId, request)`、`AppendImportOutcome`（附加路徑字串只在此檔）、
  純函式 `previewAppendPlayers(backupPlayers, cloudPlayers)`（先依名稱去重、再判定 id 或名稱已在雲端，不做正規化）與 `fetchAppendPreview(expectedUserId, request)`（經既有 `fetchRemotePlayers`，`roster-api.ts` 不改）；
  `components/matchmaker/local-import-view.ts` 新增 `APPEND_RULES`、`APPEND_ACTION_LABEL`、`APPEND_CANCEL_LABEL`、`APPEND_NAME_CHECK_HINT`、`LOCAL_IMPORT_MESSAGES.appendNothing`／`appendNoNewPlayers`／`appendPreviewFailed`、`describeAppendPreview`、`describeAppendNewPlayers`、`describeAppendMatchedPlayers`、`describeAppendOutcome`，改寫 `jsonCloudImportHint`（design Decision 7、8、12）；
  同一個 commit 依檔頭授權 ② 同步三個 E2E 檔的 `JSON_CLOUD_IMPORT_HINT_TEXT`。4.1 全綠；`JsonBackupSection.test.tsx`、`LocalDataImportSection.test.tsx` 既有 it 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors
  - GREEN commit `d54c7a5`（`lib/sync/local-import.ts`、`local-import-view.ts`，並依授權 ② 同步三個 E2E 檔的 `JSON_CLOUD_IMPORT_HINT_TEXT`，非紅燈、E2E 本組未跑）。四檔（含 `JsonBackupSection.test.tsx`、`LocalDataImportSection.test.tsx`）28 tests 全綠；root `-r exec tsc --noEmit`、hono、core typecheck 皆 exit 0；改動的 7 個前端檔逐檔 ESLint 0 errors。
  - mutation（單檔雙檔 vitest，三重落地檢查通過、每次還原後 `git status` 乾淨）：①～⑭ 全數轉紅（各 1 failed）：① `backupToAppendRequest` 帶 `currentRound`；② 409 分類為 `unauthorized`；③ 413 分類為 `failed`；④ 不以 `AppendImportResponseSchema` 驗證 200；⑤ 略過皆 0 仍回 `note`；⑥ 兩句連接改「，」；⑦ `APPEND_RULES` 調換前兩條；⑧ `jsonCloudImportHint` 改回舊文字；⑨ 預覽忽略 id 規則；⑩ 不做備份內同名去重；⑪ 先判定雲端再去重；⑫ 比對前轉小寫；⑬ `fetchAppendPreview` 401 分類為 `failed`；⑭ 不以 `PlayerListResponseSchema` 驗證名單。對照組 A（雲端名稱 `Set.has` 改 `some`）、B（`join` 改 `reduce` 串接）維持綠。
- [x] 4.3 REFACTOR：`describeAppendOutcome` 與 `describeImportOutcome` 的錯誤分支是否值得共用（預期不抽：結果型別不同）；補充說明的組字是否以 if/else 表達、無巢狀三元；`previewAppendPlayers` 的去重與判定是否以具名步驟表達、註解寫明「必須與後端規則一致」的理由；無壞味道則註記 skipped
  - skipped：`describeAppendOutcome` 與 `describeImportOutcome` 結果型別不同，不抽共用；補充說明以 `skippedParts` 陣列加 if 組字、無三元；`previewAppendPlayers` 已是「先去重、再判定」兩個具名步驟，並以註解寫明必須與後端 `appendLocalBackup` 一致與順序的理由。無壞味道，未產生 `refactor:` commit。
- [x] 4.4 Stage 1（sonnet）→ Stage 2（opus）審查 §4：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選
  - Stage 1（sonnet）：PASS，無必修。六個錨點逐字相同；RED `255d18a` 只動兩個測試檔；`previewAppendPlayers` 與核心去重、後端兩個 NOT EXISTS 規則一致，fixture ①② 與後端 it 相同；mutation ①～⑬ 紅、對照 2 條綠。
  - Stage 2（opus）：PASS，無必修。獨立 mutation 21 條＋對照 4 條；⑭ 確認 schema 驗證經 `fetchRemotePlayers` 鎖住；401 一律分類為 unauthorized（含 ACCOUNT_MISMATCH）。建議：① 名稱比對只鎖住大小寫，NFKC／移除中間空白的變異（⑫c）存活；② 備份內參賽者 id 重複時預覽與結果不一致。
  - 處置：`51d3f4a`（前端預覽 it 補全形「Ａmy」與中間空白「A my」）、`5db7f75`（後端 Ann it 補「Ａnn」「A nn」），皆 regression guard，前後端正規化變異轉紅；spec／test-plan 同步、design Risks 記錄 ② 為接受的已知缺口（正常匯出不會出現）。

## 5. JSON 雲端匯入的附加流程（元件與 E2E）

Depends on: §4

- [x] 5.1 RED（TDD，E2E；含 改寫既有 test ③）：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts` 新增 test「登入時雲端已有資料時以 JSON 備份附加參賽者與歷史且不覆寫雲端」（寫法依 test-plan「E2E 共同要求」與該列斷言，含預覽名單「新人丙」／「共同甲」與統計頁出場數），並依檔頭授權改寫 ③。
  - RED commit `d270d04`（只改 `local-import.spec.ts`：新增 test「登入時雲端已有資料時以 JSON 備份附加參賽者與歷史且不覆寫雲端」，並依授權 ③ 改寫既有 test「登入時以 JSON 備份匯入到空的雲端且不寫入本機」第二次選檔後的斷言；新增 `STATS_PAGE` 常數與 `buildHistoryEntryWithPlayers` helper，既有 helper 未動）。標註：新 test TDD 真紅；③ 改寫既有 test 真紅。
  - 紅燈（雙鎖、`--project=user-data` 單檔）：`2 failed, 5 passed`。兩條紅皆為 `getByTestId('json-backup-append-confirm')` `toBeVisible` 逾時、element(s) not found（改寫的 ③ 在 :224，新 test 在 :285）；該檔其餘 5 個 test 全綠，`.dev.vars` 齊備未 skip。
  - 機械複驗：`git show d270d04^:` 的 spec 不含新 test 名稱與 `json-backup-append-confirm`，且第 210 行為舊斷言 `getByText(CONFLICT_TEXT)).toBeVisible()`；RED commit 刪除的只有該行與其舊註解。無 regression guard。
  雙鎖下 `--project=user-data` 跑該檔並貼出輸出：新 test 與改寫的 ③ 紅（附加確認不存在）、該檔其餘 test 綠；`.dev.vars` 不齊備導致 skip 時停止並向 coordinator 索取
- [x] 5.2 RED（TDD）：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx` 新增 7 個 it——「雲端已有資料時顯示附加確認、預覽名單與四條說明，按下附加到雲端才以當下帳號送出附加請求」「附加確認按下取消或重新選檔時不送出附加請求並收起確認」
  - RED commit `3fa9e1b`（只改 `JsonBackupSection.test.tsx`：新增 7 個 it 與附加流程的夾具 helper；既有 it 與既有 helper 未動，被替換的兩行僅為 `import` 行擴充）。tsc 為 exit 0（匯入的常數與函式 §4 已存在，非型別紅燈）。
  - 紅燈（單檔 vitest）：`Tests 6 failed | 7 passed (13)`。前六個新 it 皆真紅：找不到 `json-backup-append-confirm`／`json-backup-append-no-new-players`，或現行 409 顯示 `cloudNotEmpty` 而非 `appendNothing`／`unauthorized`；既有 6 個 it 全綠。
  - regression guard（寫入即綠）：「雲端沒有資料時照舊整份匯入且不顯示附加確認」。
  - 機械複驗：`git show 3fa9e1b^:` 的測試檔不含任何新 it 名稱；產品檔 RED 前後未動。
  「附加請求未授權時刷新 session，資料過大與其他失敗顯示對應文案且不寫入本機」「備份沒有可附加的參賽者與歷史時顯示無可附加且不渲染附加按鈕」「附加確認在沒有會新增的參賽者時顯示提示且仍可附加歷史」
  「讀取雲端名單未授權時刷新 session，其他失敗顯示讀取失敗，兩者皆不顯示附加確認」「雲端沒有資料時照舊整份匯入且不顯示附加確認」。
  單檔 vitest 貼出輸出：前六個紅；最後一個預期寫入即綠，點名標 regression guard（與 5.3 同一張派工單）
- [x] 5.3 GREEN（TDD）：`components/matchmaker/JsonBackupSection.tsx` 的雲端分支依 delta spec「附加到雲端」與 design Decision 2、8、12 實作：409 後以選檔當下的 user id 呼叫 `fetchAppendPreview`、讀完才顯示附加確認（預覽兩份名單、名稱提醒、沒有新增者的提示；讀取 401 時 `refresh()`、其他失敗顯示 `appendPreviewFailed`，皆不顯示確認）、無可附加提示（不讀名單）、按下當下取 `useSession()` 的 user id、進行中停用兩顆按鈕、取消與重新選檔收起確認、`describeAppendOutcome` 顯示結果、401 時 `refresh()`；
  - GREEN commit `1834a60`（只動 `JsonBackupSection.tsx`）。單檔 13 個 it 全綠（含既有 6 個）；`local-import.test.ts`、`local-import-view.test.ts`、`LocalDataImportSection.test.tsx` 合計 35 tests 全綠；root `-r exec tsc --noEmit`、hono、core typecheck 皆 exit 0；改動的三個前端檔逐檔 ESLint 0 errors。雙鎖 `--project=user-data` 單檔 `local-import.spec.ts`：`7 passed`（5.1 兩條轉綠）。
  - 實作：單一 `appendState`（`idle`／`confirm`／`appending`，後兩者共用 request 與 preview）；`selectionRef` 遞增計數，名單讀取、整份匯入與附加請求回來時若已不是同一次選檔即丟棄結果；按下附加時才取當下的 `userId`；結果以 `showImportView` 與整份匯入共用顯示。
  不寫本機、不重新載入。5.2 全綠、該檔既有 6 個 it 全綠；tsc exit 0；改動檔 ESLint 0 errors；雙鎖下 `--project=user-data` 跑 `local-import.spec.ts`，5.1 兩條轉綠、其餘綠
- [x] 5.4 REFACTOR：附加確認是否抽成同檔內的小元件（只有一處使用則不抽）；狀態（名單讀取中、確認中、附加請求進行中）是否以單一 state 表達、無互斥 boolean；重新選檔後才回應的名單讀取結果不覆寫新狀態；舊註解（「只有雲端沒有資料時才寫入」等）依新行為更新；無壞味道則註記 skipped
  - REFACTOR commit `5f912f1`：選檔處舊註解（「雲端名單不能被備份檔整份覆蓋…拒絕規則與匯入本機資料相同」）改為符合附加行為；附加確認只用一處故不抽小元件；狀態已是單一 `appendState`、無互斥 boolean；重新選檔後才回應的結果由 `selectionRef` 丟棄。ESLint 0 errors。
  - 注意：test-plan 沒有「重新選檔後過期結果不覆寫」的 it（前端新 it 數固定為 7，C3 要求測試數＝基線＋13）；額外變異 X1（移除名單讀取後的過期檢查）、X2（移除附加請求後的）、X3（移除整份匯入後的）三條皆存活（13 passed），屬測試缺口，已誠實記錄，交 Stage 1／2 與 coordinator 裁定是否另補。
- [x] 5.5 驗收（E2E）：雙鎖下 `--project=user-data` 跑全部 `tests/e2e/user-data/`，全數 passed、0 skipped，數量＝基線＋1；`--project=chromium` 跑 `tests/e2e/specs/` 中含 `JsonBackupSection` 或資料頁的 spec（以 `grep -l "json-backup\|matchmaker/data" tests/e2e/specs` 列出），全綠
  - 雙鎖下 `--project=user-data` 跑全部 `tests/e2e/user-data/`：`49 passed`（基線 48＋1），0 skipped、0 failed；`--project=chromium` 跑 `grep -l "json-backup\|matchmaker/data" tests/e2e/specs` 列出的 `data-pending.spec.ts`、`matchmaker-data-transfer.spec.ts`：`22 passed`。E2E 前後 `lsof -i :3005 -i :8787` 與 `ps` 皆無殘留。
  - mutation（單檔 vitest，每次三重落地檢查通過〔`count(old)==1`〔④ 為 2 處同改〕、`new != old`、`git diff --stat` 有輸出〕、還原後 `git status` 乾淨，輸出皆含 `Test Files`）：① 轉紅（6 failed）；② 紅（4）；③ 紅（1）；④ 紅（1）；⑤ 紅（1）；⑥ 紅（1）；⑦ 紅（1）；⑧ 紅（1）；⑨ 紅（3，regression guard 轉紅）；⑩ 附加成功後寫入本機 `matchmaker:roster:v1`：E2E 單檔（雙鎖）轉紅（`toEqual` 本機 key 不變斷言失敗）；⑪ 紅（1）；⑫ 紅（1）；⑬ 紅（1）；⑭ 紅（1）；⑮ 紅（1）。對照組 A（`selectionRef.current += 1` 改寫為 `++selectionRef.current`）、B（`added.length === 0` 改 `< 1`）維持綠。額外變異 X1～X3（過期結果檢查）存活，見 5.4。
- [ ] 5.6 Stage 1（sonnet）→ Stage 2（opus）審查 §5：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選

## 6. 文件、指令驗收與合併前流程

Depends on: §5

- [ ] 6.1 設定層（文件）：`hono-pickball/CLAUDE.md` 的本機資料匯入 API 段落補 `POST /api/import/append`（兩條陳述式、無整批守衛、歷史 id 改寫在 SQL 內）與守衛樣本「目前 16 條」；`nextjs-pickball/CLAUDE.md` 若有描述資料頁雲端 JSON 匯入或 `jsonCloudImportHint` 同步點，依新行為更新。commit（`docs:`）
- [ ] 6.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 6.3 驗收（指令）C2：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖）0 errors、warning 不多於基線
- [ ] 6.4 驗收（指令）C3：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖）三組皆綠；前端測試數＝基線＋13、檔數＝基線；後端檔數＝基線＋1、測試數＝基線＋15；核心測試數＝基線＋4、檔數＝基線
- [ ] 6.5 驗收（指令）C4：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖）exit 0；建置後 `git status --porcelain` 為空
- [ ] 6.6 驗收（指令）C6：`/api/import/append` 在前端產品碼只出現在 `lib/sync/local-import.ts`
- [ ] 6.7 驗收（指令）C7：範圍 `git diff main --stat -- <test-plan C7 列出的路徑>` 輸出為空
- [ ] 6.8 驗收（指令）C8：`DO_NOT_TRACK=1 openspec validate cloud-json-import-append --strict` 通過
- [ ] 6.9 驗收（指令）C9：既有匯入測試只增不刪（`git diff main -- <C9 路徑> | grep -E "^-[^-]"` 為空）
- [ ] 6.10 驗收（指令）C10：`cloudNotEmpty` 在前端產品碼只出現在 `components/matchmaker/local-import-view.ts`
- [ ] 6.11 驗收（指令）C5，全瀏覽器 gate（coordinator）：`/tmp/cgate-cloud-json-import-append.e2e` 由 coordinator 照 `/tmp/cgate-session-hint-failure-no-local-fallback.e2e` 複製後執行 `/tmp/cgate2.sh cloud-json-import-append`；五個 browser project 各＝基線且 0 failed、user-data＝基線＋1 全 passed；結果寫在本 task 後方
- [ ] 6.12 Final Code Review（opus，依 execution-plan）：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選（產品程式碼有改動時重跑 6.11）
- [ ] 6.13 `/opsx:verify`：critical／warning／suggestion 全部逐項查證並處理（修正 commit 記在本 task 後方），直到報告全清才勾選
- [ ] 6.14 合併（coordinator）：在 `main` 執行 `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball merge --no-ff change/cloud-json-import-append`，合併後由 coordinator 執行 archive；**不 push**（push 即觸發正式站部署，由使用者決定；部署順序先 `hono-pickball` 後 `nextjs-pickball`）
