# Proposal: user-data-version-monotonic

## Why

樂觀鎖只比對「呼叫端持有的 `version` 是否等於目前 `version`」。目前對戰分配機的名單、回合與分槽在**刪除後以同一個主鍵重建**時，`version` 一律從 1 重新起算，
不是單調遞增：裝置 A 手上記著某列 version 1，裝置 B 重置名單後重建同一個 key 的列也是 version 1，A 之後帶 version 1 的 PUT 會比對成功、**靜默覆蓋** B 的新資料（ABA）。
此問題在 B7（`2026-10-24-matchmaker-round-score-backend`）Stage 2 被指出、coordinator 裁定為「G1（Google 登入上線）前評估項」（該 change design Open Questions 16、18③；
`docs/backend-scoring-runbook-b1-b9.md` B7 紀錄「維持現狀／後續」）。上線後多裝置同時使用是常態，必須在 G1 前修掉。

## What Changes

**盤點結論**（證據見 design「Context」與 Decision 5）：

| 表 | 主鍵 | 會被刪除後以同主鍵重建？ | ABA |
|---|---|---|---|
| `matchmaker_round` | `user_id` | 是：重置刪除，之後任何 `PUT /round`（version 0）或匯入都重建同一列 | **有** |
| `matchmaker_players` | `(user_id, id)` | 是：重置或逐筆刪除後，`POST /api/import`（本機資料、JSON 備份）以**原本的 id** 重建；API 層 `PUT` version 0 與 `POST /players/import` 也接受任意 id | **有** |
| `matchmaker_match_slots` | `(user_id, match_id)` | 是：重置、回合 PUT 的孤兒清除、送出比分都會刪除；`POST /api/import` 以本機的場次 id 重建，回合 PUT 也能把同 id 場次加回後以 version 0 重建 | **有** |
| `scoreboard_current` | `user_id` | 否：沒有任何刪除路徑（重置不含此表、匯入為 `ON CONFLICT DO NOTHING`），version 只增不減 | 無 |
| `matchmaker_history` | `(user_id, match_id)` | 會重建，但沒有任何接受 `version` 的寫入端點（只增不改、version 恆為 1） | 無 |
| `sync_batch_guards` | `user_id` | 每個 batch 結束即刪除，version 不對外 | 無 |

**後端**
- 新增使用者資料表 `sync_version_floors`（每位使用者至多一列，`version` 欄＝該使用者的**版本下限**；migration `drizzle/0004_sync_version_floors.sql` 由 `db:generate` 產生）；`USER_DATA_TABLES` 加入此表。
- **每一條會刪除上述三張「可重建的版本化表」之列的寫入**，在同一個 D1 `batch()` 內、於刪除之前把下限提高為 `max(目前下限, 被刪列的最大 version)`：
  `DELETE /api/matchmaker/players/:id`（由單一陳述式改為兩條的 batch）、`POST /api/matchmaker/reset`、`PUT /api/matchmaker/round` 的孤兒分槽清除、送出比分的該場分槽刪除。
- **每一條建立這三張表之列的寫入**，初始 version 由 SQL 子查詢取「下限 + 1」（從未刪除過資料時下限為 0、初始仍為 1）：
  `PUT` version 0（參賽者、回合、分槽）、`POST /api/matchmaker/players/import`（回應改為實際寫入的 version）、`POST /api/import` 的參賽者／回合／分槽三段。
- `scoreboard_current`、`matchmaker_history` 與 `sync_batch_guards` 行為零變更；`POST /api/import` 的整批守衛條件不含下限表。

**前端**：零變更（各 remote store 只保存伺服器回傳的 version、未知時送 0，沒有任何算術或大小比較；見 design Decision 6）。

**文件**：`hono-pickball/CLAUDE.md` 加入「版本下限」規則（新增刪除路徑時 MUST 同批提高下限）。

### 明確不做

- 改變「更新時 version + 1」與「全新使用者建立時 version 為 1」的既有契約。
- 改動 `scoreboard_current`、`matchmaker_history`、`sync_batch_guards` 的任何寫入。
- 修正 apply 前盤點時發現的另一個既有缺口「回合 PUT 可把已完成場次以 pending 換回」（列為 design Open Questions 2，另開 change）。
- 回填已在本機 D1 刪除過的舊資料的下限（無正式資料，見 design Migration Plan）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：新增「刪除後重建的使用者資料版本不得重複」；修改「版本化讀寫契約」「多筆使用者資料的逐筆版本化契約」「本機資料匯入雲端的 API」中「建立時 version 為 1」的敘述與刪除／重置的 batch 內容。
- `backend-database`：新增「版本下限資料表由 migration 建立」。
- `round-lifecycle`：修改「回合與送出比分的雲端 API」——回合 PUT、送出比分與重置的 batch 內容加入提高版本下限。

## Impact

- **後端**：新增 `src/matchmaker/version-floor.ts`（初始版本子查詢與提高下限的陳述式）；修改 `src/db/schema.ts`（`syncVersionFloors`）、
  `src/matchmaker/players-repository.ts`（`putPlayer`、`deletePlayer`、`importPlayers`、`resetMatchmaker`）、`src/matchmaker/round-repository.ts`（`putRound`）、
  `src/matchmaker/slots-repository.ts`（`putSlot`）、`src/matchmaker/score-repository.ts`（`submitScoreForUser`）、`src/import/local-import-repository.ts`（`importLocalData`、`selectFromJsonEach`）。
  **有 migration**：`drizzle/0004_sync_version_floors.sql` 與 `drizzle/meta/*`（`db:generate --name sync_version_floors` 產生）。路由檔（`src/routes/*.ts`）不改。
- **核心套件**：`src/api/user-data-tables.ts`（`USER_DATA_TABLES` 加 `sync_version_floors`）。
- **測試**：新增 `hono-pickball/test/version-floor.test.ts`；`hono-pickball/test/d1-schema.test.ts` 加四個 it。
  **允許修改的既有測試（皆為本 change 行為的必然結果）**：① `test/matchmaker-players.test.ts`「重置以單一 D1 batch 送出四條刪除」的 `toEqual([4])` → `[5]`；
  ② `test/matchmaker-round.test.ts`「回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出」的 `toEqual([2, 2])` → `[3, 3]`（及其註解）。其餘既有 it 的名稱與斷言一律不改。
- **E2E**：不新增；`tests/e2e/helpers/user-data.ts` 依 `USER_DATA_TABLES` 逐表清空，跑 E2E 前本機 D1 **必須**已套用 0004（否則清空 SQL 因表不存在而失敗）。
- **文件**：`hono-pickball/CLAUDE.md`。
- **相依**：**不新增任何第三方套件**。
- **訪客／正式站**：零變更（前端未改；auth 停用時所有使用者資料端點仍回 404、不碰 D1）。
