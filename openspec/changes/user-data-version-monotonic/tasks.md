# Tasks: user-data-version-monotonic

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`。**`--run` 前不可加 `--`**。單檔免鎖；全套 vitest、lint、build、E2E 一律雙鎖（execution-plan j）。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> 新 it 一律寫在 `hono-pickball/test/version-floor.test.ts`（§3 第一個 RED 建立此檔）或 `test/d1-schema.test.ts`；每個 it 使用各自的測試帳號 email（同檔共用一份 D1）。
>
> **標註**：`TDD`；`regression guard`；`設定層`（`src/db/schema.ts`、`drizzle/**`、`USER_DATA_TABLES` 常數、文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **前提**：`main` 乾淨、本 change 分支已由 coordinator 建立（environment.md）。**不新增任何第三方相依**；**禁止任何遠端 CF 操作**；不 push。
> **本 change 有 migration**（`drizzle/0004_sync_version_floors.sql`），只能由 `db:generate --name sync_version_floors` 產生，產生後立即 `db:migrate:local`。
>
> **訪客路徑零迴歸**：`nextjs-pickball/**` 一行不改；`src/routes/*.ts`、auth middleware 一行不改；`scoreboard_current`、`matchmaker_history`、`sync_batch_guards` 的寫入陳述式一行不改（design Decision 5）。
> 既有 it 的名稱與斷言一律不得修改，**例外（僅限下列兩條，皆為本 change 行為的必然結果）**：
> ① `hono-pickball/test/matchmaker-players.test.ts`「重置以單一 D1 batch 送出四條刪除」的 `expect(batchSizes).toEqual([4])` 改為 `[5]`（重置 batch 多一條提高下限；於 3.2 修改）；
> ② `hono-pickball/test/matchmaker-round.test.ts`「回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出」的 `expect(batchSizes).toEqual([2, 2])` 改為 `[3, 3]`，同 it 的註解「一次 batch、兩條陳述式」改為三條（於 4.4 修改）。
> 兩條 it 名稱不改；修改在該 GREEN 的同一個 commit 內，並在紀錄中註明「既有斷言依檔頭例外修改」。

## 1. 對齊與實測（不寫產品程式碼）

- [x] 1.1 驗收（指令）：確認分支 `change/user-data-version-monotonic`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  持鎖跑 `pnpm test` baseline、三段 typecheck、`pnpm lint`；`playwright test --list` 各 project 數量；回填 environment.md「Verification」並 commit（`docs:`）
- [x] 1.2 對齊：重讀 design「Context」盤點表涉及的 `hono-pickball/src/**` 檔案，確認刪除路徑仍只有四條（`grep -rn "delete(matchmaker" hono-pickball/src` 預期 7 行命中：`players-repository.ts` 5 行、`round-repository.ts` 1 行、`score-repository.ts` 1 行，分屬 4 條路徑）、建立路徑仍只有七條（三個 PUT version 0、`importPlayers`、`importLocalData` 三段）；
  比對本 change 的三個 MODIFIED Requirement 與目前主 spec，**若主 spec 已被其他 change 改過（已知並行 change `user-data-import-limits` 也 MODIFIED「本機資料匯入雲端的 API」並改 `local-import-repository.ts`，見 design Open Questions 6），以主 spec 為底重新套用本 change 的增修**，`DO_NOT_TRACK=1 openspec validate user-data-version-monotonic --strict` 通過後 commit（`docs:`）
- [x] 1.3 Context7 查證並一次性實測（不 commit 探針）：`/drizzle-team/drizzle-orm-docs`（`insert().select()` 搭配 `onConflictDoUpdate`、`excluded` 的寫法）、`/llmstxt/developers_cloudflare_d1_llms-full_txt`（batch 語意）；
  在 workerd 測試中實測 design Open Questions 3 的 (a)(b)(c)；結果寫入 design「Context7 查證紀錄」與 Open Questions 3 並 commit（`docs:`）

## 2. 版本下限資料表

Depends on: §1

- [x] 2.1 RED（TDD）：`test/d1-schema.test.ts` 新增四個 it——「sync_version_floors 可由 migration 建立並寫入讀回」「sync_version_floors 每位使用者只能有一列」「sync_version_floors 的 version 不可為 NULL」「刪除使用者時其 sync_version_floors 一併刪除」。
  「version 不可為 NULL」MUST 比對錯誤訊息含 `NOT NULL constraint failed: sync_version_floors.version`（只比對「拋錯」會因表不存在而先綠）。確認四個皆紅並貼出輸出（`test:`）
- [x] 2.2 GREEN（設定層＋TDD）：`src/db/schema.ts` 新增 `syncVersionFloors`（`user_id` PK FK cascade、`version` NOT NULL 無 DEFAULT、`updated_at` `timestamp_ms` NOT NULL，註解寫明為何不設 DEFAULT；
  欄位宣告順序 MUST 為 `user_id, version, updated_at`——`raiseVersionFloor` 沿用 `selectFromJsonEach` 的位置式 `INSERT … SELECT`，順序不同會使 version 與 updated_at 對調）；
  `pnpm --filter ./hono-pickball db:generate --name sync_version_floors` 產生 `drizzle/0004_sync_version_floors.sql` 與 meta（不手改）；`packages/pickball-core/src/api/user-data-tables.ts` 的 `USER_DATA_TABLES` 加 `"sync_version_floors"`；
  `pnpm --filter ./hono-pickball db:migrate:local`。2.1 全綠；既有 `test/user-data-tables.test.ts` 兩個 it 綠（regression guard）；再跑一次 `db:generate` 無新檔（`feat:`）

## 3. 重置提高下限，所有建立路徑取下限加一

Depends on: §2

- [x] 3.1 RED（TDD）：新增 `test/version-floor.test.ts`（檔頭 `import "../src/index"`、顯式匯入 vitest；登入 seed 用 `test/helpers/matchmaker-fixtures.ts`），寫入三個 it：
  「重置後重建的回合版本大於重置前且持舊版本的 PUT 回 409」（真紅：現況重建得 1、舊版本 PUT 200）、
  「沒有任何資料時重置仍回 204 且之後建立的版本為 1」與「一位使用者的重置不影響其他使用者的建立版本」（**預期先綠，點名標 regression guard**；後者斷言 `sync_version_floors` 無 B 的列，在 §2 後可查詢）。貼出輸出（`test:`）
- [x] 3.2 GREEN（TDD）：新增 `src/matchmaker/version-floor.ts`（`initialVersion(userId)`、`raiseVersionFloor(db, userId, deletedVersions, now)`，design Decision 3；`INSERT … SELECT ?, v, ? FROM (SELECT max(v) AS v FROM (…)) WHERE v IS NOT NULL ON CONFLICT DO UPDATE SET version = max(既有, excluded)`：空集合時零列）；
  `resetMatchmaker` 的 batch 第一條改為提高下限（`matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots` 三表 `UNION ALL`），四條 DELETE 不變、不刪下限列；
  `putRound` 的 version 0 建立改用 `initialVersion`。依檔頭例外 ① 把「重置以單一 D1 batch 送出四條刪除」的 `[4]` 改為 `[5]`。3.1 全綠、`test/matchmaker-*.test.ts` 全綠（`feat:`）
- [x] 3.3 RED（TDD）：it「重置後以 version 0 重建同 id 的參賽者版本大於重置前且持舊版本的 PUT 回 409」。確認紅燈（`putPlayer` 仍寫 1）（`test:`）
- [x] 3.4 GREEN（TDD）：`putPlayer` version 0 的 `INSERT … SELECT` 的 version 欄改為 `initialVersion(userId)`。3.3 綠（`feat:`）
- [x] 3.5 RED（TDD）：it「重置後批次附加同 id 的參賽者回應實際版本且持舊版本的 PUT 回 409」。確認紅燈（`importPlayers` 寫入與回應皆為 1）（`test:`）
- [x] 3.6 GREEN（TDD）：`importPlayers` 每筆 `values` 的 version 改為 `initialVersion(userId)`，並以 `.returning()` 從 batch 結果組回應（不再在 JS 端寫死 1；`isConstraintError` 的 409 行為不變）。3.5 綠、`test/matchmaker-players.test.ts` 全綠（`feat:`）
- [x] 3.7 RED（TDD）：it「重置後重建同場次的分槽版本大於重置前且持舊版本的 PUT 回 409」。確認紅燈（回合已取下限，但 `putSlot` 仍寫 1）（`test:`）
- [x] 3.8 GREEN（TDD）：`putSlot` version 0 的 `INSERT … SELECT` 的 version 欄改為 `initialVersion(userId)`（前置條件 `WHERE EXISTS` 不變）。3.7 綠、`test/matchmaker-slots.test.ts` 全綠（`feat:`）
- [x] 3.9 RED（TDD）：it「重置後重新匯入同一份本機資料時持舊版本的寫入皆回 409」（`makePayload`／`makePlayer`／`postImport` 是 `test/local-import.test.ts` 的私有函式，在新檔內**複製**一份，SHALL NOT 為共用而改動既有測試檔；參賽者含 `m1` 兩隊的選手 `m1-a`、`m1-b`）。確認紅燈（四個舊版本寫入皆 200）（`test:`）
- [x] 3.10 GREEN（TDD）：`selectFromJsonEach` 增加 version 參數；`importLocalData` 的參賽者、回合、分槽段傳 `initialVersion(userId)`，歷史與獨立計分板段傳 `sql\`1\``；守衛條件不變（不含下限表）；batch 仍為固定 7 條。
  3.9 綠、`test/local-import.test.ts` 全綠（`feat:`）
- [x] 3.11 REFACTOR：檢視 §3 的重複（例：測試中的「建立 → 重置 → 重建 → 舊版本 PUT」步驟可抽成檔內 helper）；無壞味道註記 skipped。後端全套持鎖跑一次並記錄數字（`refactor:` 或 skipped）
  - 紀錄：3.11 REFACTOR skipped（無壞味道）；後端全套 26 檔／204 it 綠。§3（`3da926e`～`51b9e85`）Stage 1 PASS；Stage 2（opus）PASS、無必修項——獨立 27 條變異＋2 條對照組，唯一存活的實質變異為「upsert 直接覆寫 `excluded.version`」（§3 無法以 API 觀察，移交 §4 的 deletePlayer it 覆蓋）

## 4. 其餘刪除路徑提高下限

Depends on: §3

- [ ] 4.1 RED（TDD）：it「刪除參賽者後以同 id 重建時版本大於刪除前」（先刪 v3 的 p1、再刪 v1 的 p2）與「刪除參賽者以單一 D1 batch 提高版本下限並刪除」（spy D1，範本為「重置以單一 D1 batch 送出四條刪除」）。確認兩者皆紅（`deletePlayer` 未提高下限、未走 batch）（`test:`）
- [ ] 4.2 GREEN（TDD）：`deletePlayer` 改為 `db.batch([raiseVersionFloor(該參賽者), delete])`；刪除仍冪等（不存在也 204）。4.1 綠、`test/matchmaker-players.test.ts` 與 `test/version-floor.test.ts` 全綠（`feat:`）
- [ ] 4.3 RED（TDD）：it「回合 PUT 清除的分槽以同場次重建時版本大於清除前」。確認紅燈（孤兒清除未提高下限，重建得 1）（`test:`）
- [ ] 4.4 GREEN（TDD）：`putRound` 的 batch 改為「回合寫入 → 提高下限 → 孤兒 DELETE」，孤兒條件抽成同檔一個 SQL 片段供兩條共用（design Decision 3）。依檔頭例外 ② 把「回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出」的 `[2, 2]` 改為 `[3, 3]` 並更新註解。
  4.3 綠、`test/matchmaker-round.test.ts` 與 `test/version-floor.test.ts` 全綠（特別是「一位使用者的重置不影響其他使用者的建立版本」：B 的 `PUT /round` 不得產生下限列）（`feat:`）
- [ ] 4.5 RED（TDD）：it「送出比分刪除的分槽在重置後重新匯入時版本大於刪除前」。確認紅燈（§3 完成後重置只取得當下其餘列的最大值，分槽得 3 而非 6）（`test:`）
- [ ] 4.6 GREEN（TDD）：`submitScoreForUser` 的 batch 在「刪除該場分槽」之前加入提高下限（選取條件與刪除相同：`user_id` 與 `match_id`）；守衛仍為第一條、釋放守衛仍為最後一條。
  4.5 綠、`test/matchmaker-score.test.ts` 與 `test/version-floor.test.ts` 全綠（守衛相關 it 若任一轉紅，依 execution-plan 升級）（`feat:`）
- [ ] 4.7 REFACTOR：檢視四條刪除路徑的呼叫寫法是否一致、`version-floor.ts` 的註解是否只寫「為什麼」；無壞味道註記 skipped（`refactor:` 或 skipped）

## 5. 文件與指令驗收

Depends on: §4

- [ ] 5.1 設定層（文件）：`hono-pickball/CLAUDE.md`——「使用者資料 API」的新表慣例處加入「`sync_version_floors` 為版本下限、不屬任何 feature」；「matchmaker 名單 API」的 `POST /reset` 敘述加入「batch 第一條提高版本下限（共 5 條）」、`DELETE` 加入「以 2 條的 batch 先提高下限」；
  「新增或修改使用者資料端點時須遵守」加入第 6 點：**新增任何會刪除 `matchmaker_players`／`matchmaker_round`／`matchmaker_match_slots` 之列的寫入 MUST 在同一 batch、刪除之前呼叫 `raiseVersionFloor`；新增建立路徑 MUST 以 `initialVersion` 取初始 version**（理由一句：ABA）。
  `pnpm --filter ./hono-pickball db:generate` 不產生新檔（`docs:`）
- [ ] 5.2 驗收（指令）C1：`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm --filter ./packages/pickball-core typecheck` 皆 exit 0
- [ ] 5.3 驗收（指令）C2～C5：持鎖跑 `pnpm lint`（0 errors、warning 不多於基線）、`pnpm test`（三組全綠；後端檔數與 it 數 = 基線 + 1 檔、+15 it）、`pnpm build`；C5 `db:generate` 後 `git status --porcelain hono-pickball/drizzle` 為空。數字記錄於此
- [ ] 5.4 驗收（指令）C6：確認本機 D1 已套用 0004 後，持鎖依 project 分開跑 E2E（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3..3/3`），數量與 1.1 基線一致且全數 passed；無因缺帳密 skip。數字記錄於此
- [ ] 5.5 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate user-data-version-monotonic --strict` 通過
