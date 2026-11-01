# Tasks: user-data-import-limits

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：前端 `pnpm --filter ./nextjs-pickball test --run <path>`；後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`；
> 核心 `pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> 新增具名匯出前，測試檔匯入不存在的匯出在執行期為 `undefined`（只有該 it 失敗），型別檢查會紅——RED commit 的 tsc 紅燈是預期的，GREEN 後 MUST 回到 exit 0。
>
> **標註**：`TDD`；`regression guard`；`例外層`（`tests/**` E2E，以 E2E 驗收）；`文件`；`驗收（指令）`（test-plan C1～C9）。
>
> **前提**：**不新增任何第三方相依**；**禁止任何遠端 CF 操作**（只允許 `--local`、`--dry-run`）；不 push；本 change **無 migration**。
> 測試帳密不得寫進任何會被 commit 的檔案或訊息。it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入。
> **上限數字只在核心**：前後端產品程式碼 SHALL NOT 寫 `1_900_000`、`1_000_000`、`10_000_000`、`500` 等上限字面值，一律引用 `@pickball/core` 的常數（C8）；本 change 新寫的測試也以核心常數組資料（既有測試中與上限無關的填充長度，如 `"x".repeat(1_000_000)`，不受此限、不改）。
>
> **訪客路徑零變更**：`PlayerSchema`（`packages/pickball-core/src/matchmaker/**`）、本機 reader（`lib/matchmaker/{storage,round-storage}.ts`、`lib/scoreboard/**`）、`lib/matchmaker/{backup,transfer-storage,roster-csv}.ts`、`lib/sync/api-client.ts`、
> `components/matchmaker/{LocalDataImportSection,JsonBackupSection}.tsx` 一行不改（C9）。
>
> **授權修改的既有測試（僅限下列三處，皆為本 change 行為的必然結果；其餘既有 it／test 的名稱與斷言一律不得修改）**：
> ① `packages/pickball-core/test/api/errors.test.ts`：it「API_ERROR_CODES 恰為四個錯誤碼且值等於鍵名」改名為「API_ERROR_CODES 恰為五個錯誤碼且值等於鍵名」，期望陣列加入 `"PAYLOAD_TOO_LARGE"`（錯誤碼由四變五，見 `user-data-sync` delta「使用者資料請求的預期帳號守衛」）。
> ② `hono-pickball/test/local-import.test.ts` 的 it「300 位參賽者與 2000 筆歷史可一次匯入」：只改最後一段（約 2.4MB 歷史）的 `expect(oversized.status).toBe(500)` 為 413，並補斷言回應 body 為 `{ error: "PAYLOAD_TOO_LARGE" }`、同步更新該段註解；`expectNoRows` 與前段 300／2000 的斷言不改（design Decision 4）。
> ③ `nextjs-pickball/lib/sync/local-import.test.ts` 的 it「本機沒有資料時回報 isEmpty，任一段超過上限時回報 oversize」：只改「三段各自以 UTF-8 位元組判定」那一段的量測方式——`measureSegment` 改為 `utf8ByteLength(serializeImportSegments(payload)[段])`（段名 `players`／`history`／`slots`），
>    檔頭 `LIMIT_BYTES` 改為匯入核心的 `IMPORT_SEGMENT_LIMIT_BYTES`；邊界斷言（恰為上限 false、多一位元組 true、多位元組字元 true）與其餘段落一行不改（design Decision 1、2）。
>
> **與其他 change 的重疊**：propose 當下 `user-data-version-monotonic` 同樣 MODIFIED `user-data-sync`「本機資料匯入雲端的 API」，並修改 `local-import-repository.ts` 與 `players-repository.ts`。先 archive 者不受影響；後 archive 者 MUST 在 §1 以主 spec 為底重新套用 delta（tasks 1.2）。

## 1. 對齊 main＋基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/user-data-import-limits`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  持雙鎖跑 `pnpm test` baseline、三段 typecheck、`pnpm lint`；`playwright test --list` 各 project 數量；回填 environment.md Verification 並 commit（`chore:`）
- [x] 1.2 對齊：比對本 change 五個 MODIFIED Requirement 與目前主 spec 的原文（`openspec/specs/{user-data-sync,data-transfer,player-roster}/spec.md`）；**若原文不同（例：`user-data-version-monotonic` 已 archive），以主 spec 為底重新套用本 change 的增修**；
  對照 `hono-pickball/src/import/local-import-repository.ts`、`src/matchmaker/players-repository.ts`、`src/routes/{import,matchmaker}.ts`、核心 `api/{errors,players,import}.ts`、前端 `lib/sync/local-import.ts` 的現況與 design Context 是否相符；
  `DO_NOT_TRACK=1 openspec validate user-data-import-limits --strict` 通過後 commit（`docs:`）；差異記入 design Open Questions
- [x] 1.3 一次性實測（不 commit）：在 workerd 單檔測試中以 `exports.default.fetch` 對一個臨時掛 `bodyLimit` → `zValidator` 的路由送出 ① 10,000,001 位元組 body（確認 workerd 測試環境可承受此大小、記錄是否帶 `Content-Length`）；
  ② 未超過上限且**不帶** `Content-Length` 的串流 body（確認 `bodyLimit` 重建 request 後下游 `zValidator` 仍讀得到 body）；並記錄 1.9MB 與 10MB 請求的單一 it 耗時。
  結果記入 design Open Questions；若預設 5 秒 timeout 不足，3.3／3.5 對個別 it 加 timeout 參數並註明理由（不改 `vitest.config.ts`）；若 ① 不可行，3.3 的 body 上限 it 改以 `app.request` 注入並回報

## 2. 核心套件：錯誤碼、寫入邊界 schema、上限判定

Depends on: §1

- [ ] 2.1 RED（TDD）：依檔頭例外 ① 修改 `packages/pickball-core/test/api/errors.test.ts`，it「API_ERROR_CODES 恰為五個錯誤碼且值等於鍵名」。確認紅燈（缺 `PAYLOAD_TOO_LARGE`）
- [ ] 2.2 GREEN（TDD）：`src/api/errors.ts` 的 `API_ERROR_CODES` 加 `PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE"`（design Decision 3）
- [ ] 2.3 RED（TDD）：`test/api/players.test.ts` 新增 it「PlayerWriteSchema 拒絕空字串 id 而 PlayerSchema 照舊接受」（含 `PlayerImportRequestSchema` 與 `LocalImportRequestSchema` 拒絕 id 為 `""` 的參賽者）。確認紅燈；同 it 內「`PlayerSchema` 接受 `""`」的斷言在 RED 時即成立，於紀錄中點名
- [ ] 2.4 GREEN（TDD）：`src/api/players.ts` 新增 `PlayerWriteSchema = PlayerSchema.extend({ id: z.string().min(1) })`，`PlayerImportRequestSchema` 改用之；`src/api/import.ts` 的 `LocalImportRequestSchema` 以 `BackupSchema.extend({ players: z.array(PlayerWriteSchema), scoreboard: … })` 覆寫 `players`（design Decision 7）。
  `PlayerSchema`、`BackupSchema` 不改；既有 `test/api/{players,import}.test.ts` 全綠
- [ ] 2.5 RED（TDD）：新增 `test/api/import-limits.test.ts`，it「serializeImportSegments 產生後端 json_each 參數的五段 JSON」「utf8ByteLength 與 TextEncoder 的位元組數一致」「checkImportLimits 依後端參數形狀判定，五段各自恰為上限時通過、多一位元組即超過」
  「checkImportLimits 拒絕超過 500 位參賽者且不以各段加總判定」「批次寫入的上限常數皆小於 D1 單一字串上限」。確認五個 it 皆紅（函式與常數不存在）
- [ ] 2.6 GREEN（TDD）：`src/api/players.ts` 新增 `MAX_PLAYERS_PER_IMPORT = 500`、`PLAYER_IMPORT_BODY_LIMIT_BYTES = 1_000_000`；`src/api/import.ts` 新增 `IMPORT_SEGMENT_LIMIT_BYTES = 1_900_000`、`IMPORT_BODY_LIMIT_BYTES = 10_000_000`、
  `ImportSegments` 型別、`serializeImportSegments`（五段形狀逐字沿用目前 `hono-pickball/src/import/local-import-repository.ts` 的五個 `JSON.stringify`）、`utf8ByteLength`（不用 `TextEncoder`）、`checkImportLimits`（design Decision 1、2、6）。
  核心全套綠；`pnpm --filter ./packages/pickball-core typecheck` 與 `pnpm -r exec tsc --noEmit` exit 0；`CORE_MODULES` 不變
- [ ] 2.7 REFACTOR：視需要整理；無壞味道註記 skipped

## 3. 後端：body 上限 middleware 與兩個批次寫入端點

Depends on: §2

- [ ] 3.1 RED（TDD）：新增 `hono-pickball/test/body-limit.test.ts`，it「共用 body 上限 middleware 超過上限時回 413 PAYLOAD_TOO_LARGE 且不執行下一層」（測試用 Hono app、上限 16；含有 `Content-Length` 與無 `Content-Length` 的串流兩種 17 位元組請求）。確認紅燈（模組不存在）
- [ ] 3.2 GREEN（TDD）：新增 `src/http/body-limit.ts` 的 `jsonBodyLimit(maxSize)`：包裝 `hono/body-limit` 的 `bodyLimit`，`onError` 回 `c.json({ error: API_ERROR_CODES.PAYLOAD_TOO_LARGE }, 413)`（design Decision 5）
- [ ] 3.3 RED（TDD）：`test/local-import.test.ts` 依檔頭例外 ② 修改一條斷言，並新增 it「單段 JSON 參數恰為上限時匯入成功，超過一位元組時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入」「參賽者恰為 500 位時匯入成功，501 位時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入」
  「請求 body 超過匯入上限時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入」「超過上限的匯入不呼叫 D1 batch」「batch 拋出非守衛錯誤時匯入回 500 而非 409」「參賽者 id 為空字串的匯入請求回 400 且不寫入」。
  邊界資料以核心 `serializeImportSegments`／`utf8ByteLength`／常數計算填充長度，不寫字面值；替身沿用 `test/matchmaker-players.test.ts` 的 `batchFailingDb` 寫法（`app.request` 注入 env）。
  確認紅燈；**「batch 拋出非守衛錯誤時匯入回 500 而非 409」與「參賽者 id 為空字串的匯入請求回 400 且不寫入」預期先綠**（後者因 2.4 已收緊核心 schema；真紅證據為 2.3）——點名並標 regression guard
- [ ] 3.4 GREEN（TDD）：`src/import/local-import-repository.ts`：`ImportOutcome` 加 `{ kind: "too-large" }`；第一步 `checkImportLimits(input)`，不通過即回 `too-large`（不建立陳述式、不呼叫 `db.batch()`）；通過時以 `segments` 作為五個 `json_each` 參數，移除自行 `JSON.stringify`。
  `src/routes/import.ts`：`post("/", jsonBodyLimit(IMPORT_BODY_LIMIT_BYTES), zValidator(…), handler)`，`too-large` 回 `413 { error: PAYLOAD_TOO_LARGE }`（design Decision 4、5）。3.3 全綠、`local-import.test.ts` 與 `expected-user-guard.test.ts` 既有 it 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
- [ ] 3.5 RED（TDD）：`test/matchmaker-players.test.ts` 新增 it「匯入恰 500 位參賽者成功，501 位時回 413 PAYLOAD_TOO_LARGE 且不寫入」「匯入請求 body 超過上限時回 413 PAYLOAD_TOO_LARGE 且不寫入」「匯入含 id 為空字串的參賽者時回 400 且不寫入」。
  確認紅燈；**「匯入含 id 為空字串的參賽者時回 400 且不寫入」預期先綠**（2.4 已收緊；真紅證據為 2.3）——點名並標 regression guard
- [ ] 3.6 GREEN（TDD）：`src/routes/matchmaker.ts` 的 `POST /players/import`：`jsonBodyLimit(PLAYER_IMPORT_BODY_LIMIT_BYTES)` 掛在 `zValidator` 之前；驗證後 `players.length > MAX_PLAYERS_PER_IMPORT` 回 `413 { error: PAYLOAD_TOO_LARGE }`，不呼叫 repository。
  `test/matchmaker-players.test.ts` 與 `test/expected-user-guard.test.ts` 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
- [ ] 3.7 REFACTOR：視需要整理（例：兩個 route 的 413 回應是否值得共用一個小函式）；無壞味道註記 skipped

## 4. 前端：oversize 判定、413 分類與文案

Depends on: §2

- [ ] 4.1 RED（TDD）：`nextjs-pickball/lib/sync/local-import.test.ts` 依檔頭例外 ③ 修改一段量測，並新增 it「oversize 以後端 json_each 參數的形狀判定，與後端對同一份請求的判定一致」「本機參賽者超過 500 位時回報 oversize」「importLocalData 在 413 時回報資料過大且不改動本機」。確認紅燈（修改後的既有 it 在「多一位元組」處轉紅）
- [ ] 4.2 GREEN（TDD）：`lib/sync/local-import.ts`：移除 `SEGMENT_LIMIT_BYTES` 與 `utf8Bytes`，`oversize = !checkImportLimits(payload).ok`；`LocalImportOutcome` 加 `{ kind: "too-large" }`，`importLocalData` 在 `rejected` 且 `status === 413` 時回傳之（design Decision 1、8）。`local-import.test.ts` 全綠
- [ ] 4.3 RED（TDD）：`components/matchmaker/local-import-view.test.ts` 新增 it「資料過大的匯入結果對應到超過上限的錯誤文案」；`components/matchmaker/JsonBackupSection.test.tsx` 新增 it「雲端 JSON 匯入遇到 413 時顯示資料量超過上限且不寫入本機」。確認紅燈
- [ ] 4.4 GREEN（TDD）：`components/matchmaker/local-import-view.ts` 新增 `LOCAL_IMPORT_MESSAGES.tooLarge`，`describeImportOutcome` 對 `too-large` 回 `{ tone: "error", text: tooLarge }`（design Decision 8）；`JsonBackupSection.tsx` 不改。兩檔測試全綠
- [ ] 4.5 RED（TDD）：`lib/matchmaker/remote-transfer.test.ts` 新增 it「雲端 CSV 匯入遇到 413 時回傳超過上限的訊息且不視為成功」。確認紅燈
- [ ] 4.6 GREEN（TDD）：`lib/matchmaker/remote-transfer.ts` 新增 `REMOTE_TRANSFER_MESSAGES.importTooLarge`（訊息中的人數以 `MAX_PLAYERS_PER_IMPORT` 組字串）；`importRemoteRoster` 在 POST 回 `rejected` 且 413 時回傳之，其餘 4xx 仍為 `importFailed`。`remote-transfer.test.ts` 全綠
- [ ] 4.7 regression guard：`lib/matchmaker/storage.test.ts` 新增 it「id 為空字串的參賽者照常讀回且不被捨棄」。預期加入即綠（`PlayerSchema` 不變），點名標 regression guard、`storage.ts` 不改
- [ ] 4.8 驗收（指令）：前端單檔全綠後，持雙鎖跑 `pnpm lint` 0 errors；`pnpm -r exec tsc --noEmit` exit 0

## 5. E2E 與文件

Depends on: §3, §4

- [ ] 5.1 例外層（E2E 驗收）：`tests/e2e/user-data/local-import.spec.ts` 新增 test「登入時以超過 500 位參賽者的 JSON 備份匯入雲端時顯示資料量超過上限且雲端不寫入」（備份檔以 `MAX_PLAYERS_PER_IMPORT + 1` 位組成；斷言資料頁顯示 `tooLarge` 文案、參賽者頁雲端名單為空；等待以元素與 `data-sync-status` 為依據，不用 `waitForTimeout`）。
  持雙鎖以 `--project=user-data` 單跑該檔，預期加入即綠，如實記錄
- [ ] 5.2 文件：`hono-pickball/CLAUDE.md`「本機資料匯入 API」改寫上限敘述（body 10,000,000、單段 1,900,000 以核心 `checkImportLimits` 判定、超過回 413 `PAYLOAD_TOO_LARGE` 且不送出 batch；刪除「單段 JSON 參數超過 D1 的 2MB 上限，整批回滾、零列」的 500 例子）、
  「matchmaker 名單 API」的 `POST /players/import` 補 body 1,000,000／500 位上限與 id 非空；「路由約定」補「批次寫入端點一律掛 `src/http/body-limit.ts` 的 `jsonBodyLimit`」；
  `nextjs-pickball/CLAUDE.md` 對 `lib/sync/local-import.ts` 的敘述改為「以核心 `checkImportLimits` 判定 `oversize`（五段包裝後各 ≤ 1,900,000 位元組、參賽者 ≤ 500 位）」與「分類加 `too-large`（413）」，並補 `remote-transfer.ts` 的 413 → `importTooLarge`。只寫現行行為與理由，不寫 change 名稱（`docs:`）

## 6. 驗收

Depends on: §5

- [ ] 6.1 驗收（指令）C1～C5：三段 typecheck、`pnpm lint`、`pnpm test`、`pnpm build`、`db:generate` 無新檔（重負載一律持雙鎖）；數字寫在本 task 下
- [ ] 6.2 驗收（指令）C6：E2E 依 project 分開跑（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`），持雙鎖；既有 test 全數通過、user-data 新增 1 條 passed、無 skip
- [ ] 6.3 驗收（指令）C7～C9：`openspec validate --strict`；`grep` 上限字面值與 repository 的 `JSON.stringify`；訪客路徑檔案 `git diff main --stat` 無輸出
- [ ] 6.4 Final Code Review（`opus`）：依 execution-plan「Final Code Reviewer」清單；結論與未採納項寫入 design Open Questions 並 commit
