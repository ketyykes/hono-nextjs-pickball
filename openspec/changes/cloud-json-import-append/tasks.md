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
> 文案以 delta spec `data-transfer`「登入時的資料工具頁」為準（附加確認、四條說明、兩顆按鈕、無可附加、結果與補充說明、新 `jsonCloudImportHint`）；SHALL NOT 新增 spec 以外的文案。
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
- [ ] 2.4 Stage 1（sonnet）→ Stage 2（opus）審查 §2：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選

## 3. 後端附加端點（hono-pickball）

Depends on: §2

- [ ] 3.1 RED（TDD；改寫既有 it ①）：`hono-pickball/test/expected-user-guard.test.ts` 依檔頭授權改寫 ①。單檔 vitest 貼出輸出：「列舉出的使用者資料路由恰與守衛樣本表一致」紅（列舉 15 條、樣本 16 條）；
  另兩個 it 對新樣本的 401 斷言在路由加入前也成立（middleware 對未定義路由先執行），點名標 regression guard
- [ ] 3.2 RED（TDD）：新檔 `hono-pickball/test/local-import-append.test.ts`，寫入 test-plan「本機備份附加到雲端的 API（ADDED）」中後端的 15 個 it（名稱見 delta spec 驗收錨點；夾具與 D1 替身依 test-plan 檔頭「後端」說明）。
  單檔 vitest 貼出輸出：12 個紅（404 或斷言不符）；「auth 停用且無 DB binding 時附加端點回 404」「未登入呼叫附加端點回 401」「預期帳號缺少或與 session 不符時附加回 401 ACCOUNT_MISMATCH 且雲端不寫入」預期寫入即綠，點名標 regression guard；
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck` 的 test 段因核心匯出已在 §2 存在而 exit 0
- [ ] 3.3 GREEN（TDD）：`hono-pickball/src/routes/import.ts` 新增 `.post("/append", jsonBodyLimit(IMPORT_BODY_LIMIT_BYTES), zValidator("json", AppendImportRequestSchema, invalidBodyHook), …)`；
  `hono-pickball/src/import/local-import-repository.ts` 新增附加函式（例如 `appendLocalBackup`）：`checkAppendLimits` 於 batch 前判定（413）、單一 `db.batch()` 固定兩條 `db.insert(…).select(sql\`… FROM json_each(${segment}) … ORDER BY key\`)`（design Decision 4、5、6、11），以 `RETURNING` 列數計算 `added`。
  SHALL NOT 使用 `db.run`／`db.all` 帶參數的 raw 陳述式、SHALL NOT 使用整批守衛、SHALL NOT 在 batch 外讀名單。3.1、3.2 全綠；`hono-pickball/test/local-import.test.ts` 與後端全部既有 it 全綠（單檔逐一或雙鎖全套）；`pnpm --dir …/hono-pickball typecheck` exit 0
- [ ] 3.4 REFACTOR：附加與整份匯入共用的 json_each 寫法（`selectFromJsonEach` 等）是否沿用而非複製；兩條 SQL 的略過條件與 id 對應 CTE 是否有註解說明「為什麼」（同一條陳述式看不到自己的插入、第二條看得到第一條）；無壞味道則註記 skipped
- [ ] 3.5 Stage 1（sonnet）→ Stage 2（opus）審查 §3：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選

## 4. 前端請求函式與文案（lib／view 層）

Depends on: §3

- [ ] 4.1 RED（TDD）：`nextjs-pickball/lib/sync/local-import.test.ts` 新增 it「backupToAppendRequest 只取備份的參賽者與歷史」「appendBackupToCloud 依回應分類為已附加、未授權、資料過大或失敗且不改動本機」；
  `nextjs-pickball/components/matchmaker/local-import-view.test.ts` 新增 it「附加結果依略過筆數組成新增與略過的文案」「附加確認的說明、四條說明與按鈕文字為固定值」。兩檔單檔 vitest 確認四個新 it 紅、既有 it 全綠並貼出輸出（與 4.2 同一張派工單）
- [ ] 4.2 GREEN（TDD；含 E2E 常數同步 ②）：`lib/sync/local-import.ts` 新增 `backupToAppendRequest`、`appendBackupToCloud(expectedUserId, request)`、`AppendImportOutcome`（附加路徑字串只在此檔）；
  `components/matchmaker/local-import-view.ts` 新增 `APPEND_RULES`、`APPEND_ACTION_LABEL`、`APPEND_CANCEL_LABEL`、`LOCAL_IMPORT_MESSAGES.appendNothing`、`describeAppendPreview`、`describeAppendOutcome`，改寫 `jsonCloudImportHint`（design Decision 7、8）；
  同一個 commit 依檔頭授權 ② 同步三個 E2E 檔的 `JSON_CLOUD_IMPORT_HINT_TEXT`。4.1 全綠；`JsonBackupSection.test.tsx`、`LocalDataImportSection.test.tsx` 既有 it 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors
- [ ] 4.3 REFACTOR：`describeAppendOutcome` 與 `describeImportOutcome` 的錯誤分支是否值得共用（預期不抽：結果型別不同）；補充說明的組字是否以 if/else 表達、無巢狀三元；無壞味道則註記 skipped
- [ ] 4.4 Stage 1（sonnet）→ Stage 2（opus）審查 §4：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選

## 5. JSON 雲端匯入的附加流程（元件與 E2E）

Depends on: §4

- [ ] 5.1 RED（TDD，E2E；含 改寫既有 test ③）：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts` 新增 test「登入時雲端已有資料時以 JSON 備份附加參賽者與歷史且不覆寫雲端」（寫法依 test-plan「E2E 共同要求」與該列斷言，含統計頁出場數），並依檔頭授權改寫 ③。
  雙鎖下 `--project=user-data` 跑該檔並貼出輸出：新 test 與改寫的 ③ 紅（附加確認不存在）、該檔其餘 test 綠；`.dev.vars` 不齊備導致 skip 時停止並向 coordinator 索取
- [ ] 5.2 RED（TDD）：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx` 新增 5 個 it——「雲端已有資料時顯示附加確認與四條說明，按下附加到雲端才以當下帳號送出附加請求」「附加確認按下取消或重新選檔時不送出附加請求並收起確認」
  「附加請求未授權時刷新 session，資料過大與其他失敗顯示對應文案且不寫入本機」「備份沒有可附加的參賽者與歷史時顯示無可附加且不渲染附加按鈕」「雲端沒有資料時照舊整份匯入且不顯示附加確認」。
  單檔 vitest 貼出輸出：前四個紅；最後一個預期寫入即綠，點名標 regression guard（與 5.3 同一張派工單）
- [ ] 5.3 GREEN（TDD）：`components/matchmaker/JsonBackupSection.tsx` 的雲端分支依 delta spec「附加到雲端」與 design Decision 2、8 實作：409 進入附加確認、無可附加提示、按下當下取 `useSession()` 的 user id、進行中停用兩顆按鈕、取消與重新選檔收起確認、`describeAppendOutcome` 顯示結果、401 時 `refresh()`；
  不寫本機、不重新載入。5.2 全綠、該檔既有 6 個 it 全綠；tsc exit 0；改動檔 ESLint 0 errors；雙鎖下 `--project=user-data` 跑 `local-import.spec.ts`，5.1 兩條轉綠、其餘綠
- [ ] 5.4 REFACTOR：附加確認是否抽成同檔內的小元件（只有一處使用則不抽）；狀態（確認中的請求、進行中）是否以單一 state 表達、無互斥 boolean；舊註解（「只有雲端沒有資料時才寫入」等）依新行為更新；無壞味道則註記 skipped
- [ ] 5.5 驗收（E2E）：雙鎖下 `--project=user-data` 跑全部 `tests/e2e/user-data/`，全數 passed、0 skipped，數量＝基線＋1；`--project=chromium` 跑 `tests/e2e/specs/` 中含 `JsonBackupSection` 或資料頁的 spec（以 `grep -l "json-backup\|matchmaker/data" tests/e2e/specs` 列出），全綠
- [ ] 5.6 Stage 1（sonnet）→ Stage 2（opus）審查 §5：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選

## 6. 文件、指令驗收與合併前流程

Depends on: §5

- [ ] 6.1 設定層（文件）：`hono-pickball/CLAUDE.md` 的本機資料匯入 API 段落補 `POST /api/import/append`（兩條陳述式、無整批守衛、歷史 id 改寫在 SQL 內）與守衛樣本「目前 16 條」；`nextjs-pickball/CLAUDE.md` 若有描述資料頁雲端 JSON 匯入或 `jsonCloudImportHint` 同步點，依新行為更新。commit（`docs:`）
- [ ] 6.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 6.3 驗收（指令）C2：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖）0 errors、warning 不多於基線
- [ ] 6.4 驗收（指令）C3：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖）三組皆綠；前端測試數＝基線＋9、檔數＝基線；後端檔數＝基線＋1、測試數＝基線＋15；核心測試數＝基線＋4、檔數＝基線
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
