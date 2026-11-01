# Design: user-data-version-monotonic

## Context

- **問題來源**：B7（`openspec/changes/archive/2026-10-24-matchmaker-round-score-backend/design.md`）Open Questions 16「reset 使 version 不單調 → 理論 ABA」、18③ coordinator 裁定「G1 前評估項」；
  `docs/backend-scoring-runbook-b1-b9.md` B7 紀錄「維持現狀／後續」同列此項。
- **樂觀鎖的現況**（`hono-pickball/src/**`）：建立一律寫 `version = 1`（`putPlayer`／`putSlot` 的 `INSERT … SELECT … 1`、`putRound` 的 `values({ version: 1 })`、`importPlayers` 的 `version: 1`、
  `local-import-repository.ts` 的 `selectFromJsonEach` 寫死 `1`），更新為 `UPDATE … SET version = expected + 1 WHERE version = expected`。版本只在「列存在期間」單調；
  列被刪除後，以同主鍵重建的列又從 1 起算。
- **D1 的限制**：沒有互動式 transaction，只有 `db.batch()`（SQL transaction，依序、非並行執行，任一陳述式失敗整批回滾；影響 0 列不算失敗）。
  多表一致寫入依主 spec `user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」，守衛表 `sync_batch_guards` 在任何 batch 結束後恆為空。

### 盤點：每張使用者資料表是否有 ABA（證據）

`USER_DATA_TABLES`（`packages/pickball-core/src/api/user-data-tables.ts`）共六張。逐表列出**刪除路徑**、**以同主鍵重建的路徑**與結論：

| 表（主鍵） | 刪除路徑 | 同主鍵重建路徑 | 呼叫端會帶 version 寫入？ | 結論 |
|---|---|---|---|---|
| `matchmaker_round`（`user_id`） | `resetMatchmaker`（`players-repository.ts`） | 主鍵就是使用者，重置後**任何**建立都重用：`putRound` version 0、`importLocalData` 的回合段 | 是：`PUT /round`、送出比分的 `roundVersion` | **有 ABA** |
| `matchmaker_players`（`user_id, id`） | `deletePlayer`、`resetMatchmaker` | `POST /api/import`（`LocalDataImportSection` 讀本機名單、`JsonBackupSection` 讀備份檔，兩者都保留**原 id**）；API 層 `PUT /players/:id` version 0 與 `POST /players/import` 接受任意 id（前端新增參賽者與 CSV 匯入用 `crypto.randomUUID()`，不會撞） | 是：`PUT /players/:id` | **有 ABA** |
| `matchmaker_match_slots`（`user_id, match_id`） | `resetMatchmaker`、`putRound` 的孤兒清除、`submitScoreForUser` 的該場分槽 | `POST /api/import` 的分槽段（本機分槽以本機場次 id 為鍵）；`PUT /slots/:matchId` version 0（場次須在目前回合且未完成；回合 PUT 可把同 id 的 pending 場次加回） | 是：`PUT /slots/:matchId` | **有 ABA** |
| `scoreboard_current`（`user_id`） | **無**：`grep` `src/**` 沒有任何刪除此表的陳述式；`resetMatchmaker` 只刪四張 matchmaker 表；`importLocalData` 為 `onConflictDoNothing` | 只會在「從未建立」時以 version 0 建立 | 是，但 version 只增不減 | **無 ABA**，不改 |
| `matchmaker_history`（`user_id, match_id`） | `resetMatchmaker` | `submitScoreForUser`、`importLocalData` | **否**：沒有 PUT；送出比分比對的是 `roundVersion` 與伺服器自讀的球員版本；`version` 恆為 1、從不被比對 | **無 ABA**，不改 |
| `sync_batch_guards`（`user_id`） | 每個守衛 batch 的最後一條 | 每個守衛 batch 的第一條 | 否：`version` 是守衛哨兵，不對外 | **無 ABA**，不改 |

另：使用者被刪除時所有表 cascade，但 better-auth 的 user id 為隨機字串、不會重用，且預期帳號守衛（`require-expected-user.ts`）擋下帶舊帳號的請求，不構成 ABA。

### 可重現的 ABA 情境（RED 測試的依據）

以下皆以兩個 cookie／同一帳號模擬兩台裝置 A、B，現況（main）每一個「A 的舊版本寫入」都回 **200** 並覆蓋 B 的新資料：

- **R1 回合（最直接）**：B `PUT /api/matchmaker/round {R1, version: 0}` → v1；A 讀到 v1。B `POST /api/matchmaker/reset` → 204；B `PUT /round {R2, version: 0}` → **v1**。
  A `PUT /round {R1′, version: 1}` → **200**，R2 被覆蓋，且 R2 的分槽因孤兒清除被刪掉。若 R1′ 含 completed 場次會先得 400（OQ16 的順序），所以 RED 測試用全 pending 的回合。
- **R2 參賽者（重置後重新匯入同一份本機資料）**：B `POST /api/import P`（P 含參賽者 `p1`）→ `p1` v1；A 讀到 `p1` v1。B `POST /reset`、再 `POST /api/import P` → `p1` **v1**。
  A `PUT /players/p1 {舊資料, version: 1}` → **200**。這是最貼近實際使用的路徑：登入時重置不碰本機，本機五個 key 永遠可以再匯入一次；JSON 備份還原同理。
- **R3 分槽**：同 R2，P 含 `pending` 的 `m1` 與其分槽；A `PUT /slots/m1 {…, version: 1}` → **200**。
- **R4 送出比分**：同 R2，A 以 `POST /round/matches/m1/score {roundVersion: 1}` → **200**，在 B 剛還原的回合上寫入歷史並改動評分。
- **R5 不經重置**：`p1` 為 v1 時 `DELETE /players/p1`，名單、回合、分槽、歷史皆空時 `POST /api/import [p1]` → `p1` **v1**，持 v1 的裝置照樣覆蓋。
  分槽則可經「回合 PUT 移除 `m1`（孤兒清除）→ 回合 PUT 加回 pending 的 `m1` → `PUT /slots/m1` version 0」重建。

### 前端對 version 的假設（證據）

各 remote store 把 version 當**不透明整數**：只保存伺服器回應的值、未知時送 0、從不做算術或大小比較——
`hooks/useRemoteRosterStore.ts`（`versions` Map：載入時 `versions.set(item.data.id, item.version)`、送出 `versions.get(id) ?? 0`、成功後 `versions.set(id, result.value.version)`）、
`hooks/useRemoteScoreboardStore.ts` 與 `hooks/useRemoteMatchSlotStore.ts`（`versionRef.current` 來自 GET／PUT 回應，送出 `version ?? 0`）、
`lib/sync/round-command-queue.ts`（`confirmed.version` 來自 PUT 回應與送出比分回應的 `round.version`）。
以 `grep` 搜尋 `lib/`、`hooks/`、`components/`、核心 `src/` 的 `version +`、`version >`、`version ===` 數字等寫法皆無命中。
`lib/sync/local-import.ts` 的 `version: 1` 是 `BackupSchema` 的**檔案格式版本**，與列的 version 無關。
核心回應 schema 對逐筆 version 要求 `z.number().int().positive()`（`api/round.ts`、`api/players.ts`、`api/history.ts`）、單筆為 `nonnegative`——「下限 + 1 ≥ 1」都滿足。

## Goals

- 消除三張可重建的版本化表在「刪除後以同主鍵重建」時的 ABA：持舊版本的寫入必然 409，觸發前端既有的整份重載。
- 不改變既有契約的可觀察行為：全新使用者建立仍為 version 1、更新仍為 version + 1；前端零改動；訪客路徑零變更。
- 每一條刪除路徑都有會在「該路徑漏提高下限」時轉紅的測試。

## Non-Goals

- 改動 `scoreboard_current`、`matchmaker_history`、`sync_batch_guards` 的任何寫入（盤點結論為無 ABA）。
- 讓 version 在**整個使用者**範圍內全域單調（只要求同一主鍵單調）。
- 修正盤點中發現的「回合 PUT 可把已完成場次以 pending 換回」（Open Questions 2）。
- 回填既有本機 D1 中已刪除列的下限（Migration Plan）。

## Decisions

### Decision 1：每位使用者一個「版本下限」，刪除時提高、建立時取下限加一

**Choice**：新表 `sync_version_floors(user_id PK FK cascade, version NOT NULL, updated_at NOT NULL)`；

- 刪除可重建的版本化表之列的每一個 batch，在刪除陳述式**之前**加一條：
  `INSERT INTO sync_version_floors (user_id, version, updated_at) SELECT ?, v, ? FROM (SELECT max(v) AS v FROM (<與刪除相同條件、選出將被刪列 version AS v 的子查詢>)) WHERE v IS NOT NULL
   ON CONFLICT (user_id) DO UPDATE SET version = max(sync_version_floors.version, excluded.version), updated_at = excluded.updated_at`；
  沒有任何列將被刪除時，外層 `WHERE v IS NOT NULL` 使 SELECT 為零列，**不寫入也不改動下限列**；
- 建立列時初始 version 改為子查詢 `(SELECT coalesce(max(version), 0) + 1 FROM sync_version_floors WHERE user_id = ?)`，寫在建立的**同一條**陳述式內。

**Rationale**：
- **不變式的證明**：設某主鍵 K 的某一代列在刪除時 version 為 v。刪除與提高下限在同一個 batch（transaction），下限 ≥ v；下限只升不降；K 的下一代列建立時取「下限 + 1」> v，之後只會遞增。
  任何裝置持有的 K 的舊 version ≤ v，因此不可能與新一代列的 version 相等——ABA 消失。讀下限與寫新列在同一條陳述式、提高下限與刪除在同一個 batch，D1 依序非並行執行，沒有可插隊的時間窗。
- **與既有契約相容**：從未真的刪除過三表任一列的使用者沒有下限列（視為 0），建立仍是 1；既有 scenario（「以 version 0 首次寫入成功並回 version 1」「匯入五段資料後各自為 version 1」等）全部維持。
- **改動面最小**：只動「刪除」與「建立」兩類陳述式；所有更新路徑（PUT 更新、送出比分的 version + 1）不變，主 spec 的「目前版本 + 1」契約不變。

**Alternatives considered**：
- **重置不刪列，改為 tombstone 並續增版本**：三張表要加 `deleted` 欄（migration）、所有讀取（GET、孤兒清除子查詢、送出比分的讀取、匯入守衛的「表為空」判定）都要過濾；
  匯入的 `INSERT … SELECT FROM json_each` 要改成 upsert 才能覆蓋 tombstone，又會讓「主鍵衝突使整份不寫入」的既有語意（`POST /players/import` 的 409）失效。改動面遠大於本方案。不選。
- **每位使用者一個單調計數器、所有寫入（含更新）都向它取號**：每個單筆 PUT 都要變成「計數器 upsert ＋ 寫入」的 batch，且 version 不再是「目前 + 1」，
  主 spec 多個 scenario（「以目前版本更新…回 version 2」「分槽…第一次回 version 2」等）與既有測試都要改；保證強度與本方案相同（本方案已保證同主鍵單調），代價高。不選。
- **version 改用不會重複的值（隨機 53 位元整數、UUID、時間戳）**：隨機值只有機率保證，且「建立回 1、更新回 + 1」的契約全面改變；
  時間戳仰賴各 Workers isolate 的時鐘單調（不保證），一毫秒內多次更新也會撞。不選。
- **在版本號前加「世代」**（例：`generation * 2^32 + seq`，或請求帶 `{ generation, version }`）：前者等同本方案但把下限硬塞進數字編碼、可讀性差；後者要改 API 契約與前端。不選。
- **只在重置時提高下限**：漏掉 R5（逐筆刪除後匯入）與「送出比分／孤兒清除刪掉的分槽，日後經重置＋匯入以同場次 id 重建」——
  後者的舊分槽 version 在重置時已不存在，重置當下取不到它（`version-floor.test.ts`「送出比分刪除的分槽在重置後重新匯入時版本大於刪除前」即此反例）。不選。

### Decision 2：下限存在新表 `sync_version_floors`，每位使用者共用一個下限

**Choice**：新表，命名沿用 `sync_` 前綴（與 `sync_batch_guards` 同屬同步機制，非任一 feature 的資料），欄位依「使用者資料表的命名與欄位慣例」（`user_id`、`version`、`updated_at`），列入 `USER_DATA_TABLES`。
三張表共用同一個下限（不分表）。

**Rationale**：
- version 只在同一列內比較，共用下限只會讓其他表重建時的 version 跳號，不影響正確性；分表要多一個 `table_name` 鍵與三組字串常數，沒有收益。
- 放在 `user` 表上要改 better-auth 管理的 auth 表，與其 schema 版本綁在一起（root 規則「不升級到 better-auth 1.7」也說明 auth 表變動的代價）；放在 `sync_batch_guards` 會破壞「守衛表恆為空」。
- `version` 刻意不設 `DEFAULT`、NOT NULL：提高下限的 SELECT 若算出 NULL（例如漏了外層 `WHERE v IS NOT NULL`），要以 NOT NULL 失敗暴露，而不是被預設值吞掉。

**Alternatives considered**：
- 每張表一列（`(user_id, table_name)` 主鍵）：如上，無收益。不選。
- 不建表、把下限算成「目前所有列的最大 version」：已刪除的列不在任何地方，取不到。不選。

### Decision 3：程式結構——`src/matchmaker/version-floor.ts` 兩個產生陳述式的函式

**Choice**：新增 `hono-pickball/src/matchmaker/version-floor.ts`（與 `batch-guard.ts` 同層，因為適用的三張表都是 matchmaker 表），匯出：

- `initialVersion(userId): SQL`——「下限 + 1」的純量子查詢，可放進 `values({ version: … })` 或 `INSERT … SELECT` 的欄位。
- `raiseVersionFloor(db, userId, deletedVersions: SQL, now)`——回傳 drizzle query builder（可放進 `db.batch`），`deletedVersions` 是「選出將被刪列的 `version`」的子查詢。

各呼叫端的放置位置：

| 呼叫端 | batch 內容（依序） |
|---|---|
| `resetMatchmaker` | 提高下限（三張表 `UNION ALL`）→ 四條 DELETE（共 5 條） |
| `deletePlayer` | 提高下限（該參賽者）→ DELETE（由單一 `await db.delete` 改為 2 條的 batch） |
| `putRound` | 回合寫入 → 提高下限（與孤兒清除**同一個** `NOT IN (…)` 條件）→ 孤兒 DELETE（共 3 條）；條件抽成同檔的一個 SQL 片段，兩條共用，避免兩份條件漂移 |
| `submitScoreForUser` | 守衛 → 歷史 → 回合 → 球員 → 提高下限（該場分槽）→ 刪除該場分槽 → 釋放守衛 |
| `putPlayer`／`putSlot`（version 0） | `INSERT … SELECT` 的 version 欄由 `1` 改為 `initialVersion(userId)` |
| `putRound`（version 0） | `values({ version: initialVersion(userId) })` |
| `importPlayers` | 每筆 `values({ version: initialVersion(userId) })`，並以 `.returning()` 取得實際 version 組回應（不再在 JS 端寫死 1） |
| `importLocalData` | `selectFromJsonEach` 增加 version 參數：參賽者、回合、分槽段傳 `initialVersion(userId)`，歷史與獨立計分板傳 `sql\`1\`` |

**Rationale**：
- 與 `insertBatchGuard`／`releaseBatchGuard` 同型（回傳 query builder、由呼叫端排進 batch），沿用 `hono-pickball/CLAUDE.md`「守衛 batch 不抽共用包裝」的取捨。
- 提高下限的陳述式**必須在刪除之前**：放在之後就選不到已刪除的列。`putRound` 中必須在回合寫入**之後**：孤兒的判定依據是寫入後的回合（與現行 DELETE 相同）。
  `submitScoreForUser` 中守衛仍是第一條（守衛規則不變）。
- drizzle 0.45.2 的 batch 內不可用帶參數的 `db.run(sql)`（`hono-pickball/CLAUDE.md` 禁止事項），所以提高下限用 `db.insert().select(sql…).onConflictDoUpdate(…)`；
  `INSERT … SELECT` 搭配 upsert 子句時 SELECT 必須帶 `WHERE`（下方 Context7 證據），本設計的外層 `WHERE v IS NOT NULL` 同時滿足此要求並處理空集合。
- **空集合**：沒有 `GROUP BY` 的聚合即使輸入為空也恆回一列（`max` 為 NULL），若直接寫入會違反 NOT NULL、讓**整個重置／刪除 batch 回滾成 500**。
  外層 `WHERE v IS NOT NULL` 讓此時的 SELECT 為零列：不寫入、不失敗，也不會為「從未刪除過資料」的使用者產生 `version = 0` 的列——
  `PUT /round` 與送出比分是熱路徑，大多數呼叫沒有分槽被刪，不應每次都多一次 upsert 寫入（apply 前審查指出；scenario「沒有任何資料時重置不失敗」與「一位使用者的下限不影響他人」守住）。
  外層的 `WHERE` 同時滿足 SQLite「`INSERT … SELECT` 搭配 upsert 時 SELECT 必須帶 WHERE」的解析要求。
- **不採用 `setWhere`（下限未提高時不改寫 `updated_at`）**：有列被刪除才會走到 upsert，頻率低；多一個條件只為避免改寫 `updated_at`，收益不足。

**Alternatives considered**：
- 用 SQLite trigger 在 DELETE 時自動提高下限：D1 支援 trigger，但 migration 由 drizzle-kit 從 `schema.ts` 產生、不產生 trigger，手寫 SQL 違反「migration SHALL NOT 手寫或手改」；
  且行為藏在 schema 外，未來讀程式碼的人看不到。不選。
- 抽一個 `guardedDelete` 包裝：四個呼叫端的 batch 形態各不相同（有無守衛、刪除條件、陳述式順序），包裝需要多個旋鈕。不選。

### Decision 4：`POST /api/import` 的守衛不含下限表；重置不刪下限列

**Choice**：`importLocalData` 的守衛條件維持四張 matchmaker 表；`resetMatchmaker` 的四條 DELETE 不含 `sync_version_floors`。

**Rationale**：下限必須跨越重置才有意義；重置後下限列一定存在，若納入守衛，重置後永遠無法匯入（等同 B9 對 `scoreboard_current` 的同一個理由）。

**Alternatives considered**：重置時一併刪除下限：直接重現本 change 要修的 ABA。不選。

### Decision 5：`scoreboard_current`、`matchmaker_history`、`sync_batch_guards` 不改

**Choice**：三表的寫入不讀也不提高下限，建立仍寫 1。

**Rationale**：見 Context 盤點表。`scoreboard_current` 在 `src/**` 沒有任何刪除陳述式（`resetMatchmaker` 刻意不含、`importLocalData` 為 `ON CONFLICT DO NOTHING`、計分板「重置」是 PUT 寫回初始狀態），
同一列的 version 只增不減；`matchmaker_history` 沒有任何把呼叫端 version 拿來比對的寫入；`sync_batch_guards` 的 version 是 `CASE` 哨兵。為它們加下限只是增加陳述式，沒有可觀察的效果。
`version-floor.test.ts`「重置後重新匯入同一份本機資料時持舊版本的寫入皆回 409」同時斷言歷史 version 仍為 1、獨立計分板不變，守住「不改」。

### Decision 6：前端零改動

**Choice**：不改 `nextjs-pickball/**`。

**Rationale**：見 Context「前端對 version 的假設」。舊版本寫入被改判為 409 後，走的是前端既有的衝突路徑（名單：停止所有佇列並整份重載；計分板／分槽：`conflict` 重載；回合佇列：`onConflict` 重載），
這正是 ABA 時應有的行為。version 數值變大（例：重置後從 4 起算）對 UI 不可見。

### Decision 7：migration 走設定層例外，以 workerd 測試覆蓋

**Choice**：`schema.ts` 新增 `syncVersionFloors`，以 `pnpm --filter ./hono-pickball db:generate --name sync_version_floors` 產生 `drizzle/0004_sync_version_floors.sql` 與 meta；
依 `hono-pickball/CLAUDE.md`「D1 schema 與 migration SQL 屬設定層」不強制紅燈，但同一 change 內 MUST 有 workerd 測試證明表可建立並讀寫、PRIMARY KEY、NOT NULL、cascade 各一（backend-database delta 四個 scenario）。
實際上這四個 it 在 migration 存在前就會因表不存在而真紅，§2 仍照 RED → GREEN 記錄。

## Risks / Trade-offs

- [Risk] 日後新增會刪除這三張表之列的寫入卻忘了提高下限，ABA 復發 → Mitigation：主 spec 新 Requirement 明列「之後新增任何刪除路徑 MUST 同樣處理」；`hono-pickball/CLAUDE.md` 加入同一條規則（§5）；每條既有刪除路徑都有專屬測試。
- [Risk] 提高下限的 SELECT 算出 NULL 使重置／刪除整批回滾（500）→ Mitigation：外層 `WHERE v IS NOT NULL`（空集合時零列）；scenario「沒有任何資料時重置不失敗」與「刪除參賽者…」覆蓋空集合；`version` 無 DEFAULT 讓錯誤不被吞掉。
- [Risk] `putRound` 的下限條件與孤兒 DELETE 條件不一致（只提高了一部分）→ Mitigation：兩條共用同一個 SQL 片段；「回合 PUT 清除的分槽以同場次重建時版本大於清除前」在條件漂移時轉紅。
- [Risk] batch 陳述式數各加一，D1 Free 方案每次呼叫 50 個 query → Mitigation：最多的送出比分約 2 次讀取 + 9 條 batch，仍遠低於上限（B7 design 的計數方式）。
- [Risk] 兩個既有測試以 spy 斷言 batch 大小（`[4]`、`[2, 2]`），本 change 必然使其轉紅 → Mitigation：proposal Impact 與 tasks 檔頭明列為唯一允許修改的既有斷言，改為 `[5]`、`[3, 3]`；it 名稱不改。
- [Risk] 跑 E2E 前本機 D1 未套用 0004，`clearTestAccountUserData()` 的 `DELETE FROM sync_version_floors` 因表不存在失敗 → Mitigation：§2 GREEN 內執行 `db:migrate:local`；environment 注意事項與 C6 前置條件寫明。
- [Trade-off] 共用下限使重建後的 version 跳號（例：重置前名單最高 v50，新回合從 v51 起）。version 對使用者不可見，可接受。

## Migration Plan

1. 本 change 新增 `drizzle/0004_sync_version_floors.sql`（純新增一張表，無資料搬移）。本機以 `pnpm --filter ./hono-pickball db:migrate:local` 套用；**禁止 `--remote`**。
2. 正式 D1 尚未建立（G1 才以 `wrangler d1 create` 建立並一次套用 0000～0004），**沒有需要回填的正式資料**。本機開發 D1 中在本 change 之前已刪除的列沒有下限紀錄，視為 0——只影響本機測試資料，不回填。
3. 部署順序不變（先 hono-pickball 後 nextjs-pickball）；前端未改，順序只是既有規則。
4. Rollback：revert 程式碼即恢復舊行為；多出的空表無害（drizzle 無 down migration，若要移除需另開 change 產生 DROP 的 migration）。

## Context7 查證紀錄（propose 階段）

- `/drizzle-team/drizzle-orm-docs`（`sqlite/insert`「Insert into … select」）：「To avoid a parsing ambiguity, the SELECT statement should always contain a WHERE clause, even if that clause is simply "WHERE true", if the upsert-clause is present」——
  提高下限的 `INSERT … SELECT … ON CONFLICT DO UPDATE` MUST 帶 `WHERE`（本設計為 `WHERE v IS NOT NULL`）；`insert().select(sql\`…\`)` 可傳 SQL 樣板。`guides/upsert`：`onConflictDoUpdate({ target, set })` 的 `set` 可用 `sql\`excluded.<col>\`` 參照提議值。
- `/llmstxt/developers_cloudflare_d1_llms-full_txt`（`worker-api/d1-database#batch`）：「each statement in the list will execute and commit sequentially, non-concurrently. Batched statements are SQL transactions; if a statement fails … the entire sequence is aborted or rolled back」——
  提高下限與刪除同批即原子；讀下限與建立在同一條陳述式內，無先讀後寫的時間窗。`best-practices/retry-queries`：寫入期間資料庫被鎖，寫入彼此序列化。
- **apply §1.3 再查證（2026-11-01）**：`/drizzle-team/drizzle-orm-docs` 的 `sqlite/insert`「Insert into … select」警語與 `guides/upsert`（`set` 以 `sql\`excluded.<col>\`` 參照提議值）內容與 propose 時相同；
  `/llmstxt/developers_cloudflare_d1_llms-full_txt` 的 `batch()`：「execute and commit, sequentially, non-concurrently」「Batched statements are SQL transactions … aborts or rolls back the entire sequence」，與 propose 時相同。設計假設不變。
- **apply §1.3 實測**（一次性 workerd 探針 `test/zz-probe-floor.test.ts`，因 0004 尚未產生而在探針內臨時建表；跑完即刪、未 commit）——結果見 Open Questions 3，全部與 Decision 3 相符。
  drizzle 0.45.2 產生的提高下限 SQL 為：
  `insert into "sync_version_floors" ("user_id", "version", "updated_at") SELECT ?, v, ? FROM (SELECT max(v) AS v FROM (<被刪列子查詢>)) WHERE v IS NOT NULL on conflict ("sync_version_floors"."user_id") do update set "version" = max("sync_version_floors"."version", excluded.version), "updated_at" = excluded.updated_at`。
  `insert().select()` 會依 schema 宣告順序**明確列出欄名**，所以 SELECT 的位置必須與 `user_id, version, updated_at` 的宣告順序一致（tasks 2.2 已要求）；`set` 中以 `${syncVersionFloors.version}` 產生的限定欄名 `"sync_version_floors"."version"` 在 SQLite upsert 中正確解析為既有列。

## Open Questions

1. **（已定案，記錄替代方案）共用下限 vs. 分表下限**：選共用（Decision 2）。若日後某張表需要「version 從 1 起算」的對外語意（目前沒有），再改為分表。
2. **（盤點附帶發現，不在本 change 處理）回合 PUT 可把已完成場次以 pending 換回**：`round-repository.ts` 的 `keepsCompletedMatches` 只檢查「新資料中的 completed 場次」都在目前回合中，
   不檢查「目前回合的 completed 場次」在新資料中仍為 completed；因此 PUT 一個把 `m2` 由 `completed` 改回 `pending` 的回合會被接受，與主 spec `round-lifecycle`「完成狀態不可經 PUT 改變」字面不符
   （該 Requirement 的 scenario 只測了 pending → completed 與改已完成場次的比分）。前端不會送出這種回合，但它讓「已送出比分的場次」可以重新計分、產生第二筆同 `matchId` 的歷史嘗試（被歷史主鍵擋成 409）。
   建議 coordinator 另開 change（TDD：新增「把已完成場次改回未完成回 400」的 scenario）。本 change 的測試刻意不依賴此行為（送出比分的分槽改以「重置＋重新匯入」重建）。
3. **apply §1 實測項**：(a) `raiseVersionFloor` 在 `db.batch` 內可執行，`ON CONFLICT DO UPDATE SET version = max(<既有>, excluded.version)` 只升不降，空集合時零列寫入；(b) `initialVersion` 子查詢在 `INSERT … SELECT FROM json_each` 中只計算一次且值正確；
   (c) `importPlayers` 的多條 `insert().values().returning()` 在 batch 結果中可依序取回 version。任一與本 design 不符，改寫 Decision 3 並記錄於此。
   **（apply §1.3 實測結果，2026-11-01，皆符合，Decision 3 不需改寫）**：
   (a) 符合：空集合時 batch 成功且下限表 0 列；先刪 v3 的 `p1`、再刪 v1 的 `p2` 後下限為 3（不被降低）；三表 `UNION ALL`（players 空、round v7、slots 空）提高後為 7。
   (b) 符合：下限 5 時以 `json_each` 一次插入 3 位參賽者，三列 version 皆為 6（子查詢與列無關，值一致）；`putSlot` 形式的 `INSERT … SELECT … WHERE …` 與 `putRound` 形式的 `values({ version: <SQL> })` 也都寫入 6。
   (c) 符合：下限 2 時 batch 內 3 條 `insert().values({ version: initialVersion }).returning()`，`batch` 結果依陳述式順序為 `[[x,3]],[[y,3]],[[z,3]]`，可直接組回應。
4. **（已定案）為何連 API 層才會用到的重建路徑也處理**：前端新增參賽者與 CSV 匯入用隨機 UUID，`PUT /players/:id` version 0 與 `POST /players/import` 在正常使用下不會以舊 id 重建；
   但下限是「表」的不變式，只放過某些建立路徑會讓不變式依賴前端行為，且每條路徑的改動只是把常數 `1` 換成子查詢。故全部建立路徑一致處理。
5. **（審查建議，未採納）`onConflictDoUpdate` 加 `setWhere: excluded.version > 既有`**：見 Decision 3 末條。
6. **與並行 change `user-data-import-limits` 的衝突**：該 change 也 MODIFIED `user-data-sync`「本機資料匯入雲端的 API」，並改 `src/import/local-import-repository.ts`（送進 `json_each` 的參數形狀）與 `test/local-import.test.ts`，與本 change 3.10 的 `selectFromJsonEach` 簽章重疊。
   **後歸檔者 MUST 以先歸檔者合併後的主 spec 為底重做 MODIFIED**，程式碼由後合併者手動 rebase（tasks 1.2 已要求）；兩者語意不衝突（筆數上限 vs. 初始 version）。
   - **（apply §1.2 落實，2026-11-01）** `user-data-import-limits` 已先歸檔（`openspec/changes/archive/2026-11-01-user-data-import-limits/`）並合併進 main（`4088acf`）。對齊結果：
     - `user-data-sync` delta 的 MODIFIED「本機資料匯入雲端的 API」原本以舊主 spec 為底，漏了主 spec 現有的 8 個 scenario（單段參數上限、500 位上限、body 上限、不送出 batch、非守衛錯誤 500、空字串 id 400、共用參數形狀、共用上限判定），
       且仍寫著「單段超過 2MB 回 500」，使 `openspec validate --strict` 失敗。已改為**以目前主 spec 該 Requirement 全文為底**，只加兩處本 change 的增修：「原子性與冪等」段加入「守衛條件 SHALL NOT 包含 `sync_version_floors`」一句；
       「陳述式數量為常數」段的「所有匯入列的 `version` 為 1」改為「參賽者、回合、分槽為下限加一，歷史與獨立計分板為 1」。上限用語沿用主 spec 的「D1 單一字串上限 2,000,000 位元組」與 413 行為，舊的「回 500」敘述已刪除。
     - `user-data-sync` 另兩個 MODIFIED（「版本化讀寫契約」「多筆使用者資料的逐筆版本化契約」）、`round-lifecycle` 的 MODIFIED「回合與送出比分的雲端 API」逐行比對主 spec：只有本 change 預期的增修，無遺漏；`backend-database` 為純 ADDED。
     - test-plan「本機資料匯入雲端的 API」既有列改為「全部 21 個 it」（import-limits 後 `local-import.test.ts` 由 11 個增為 21 個）、「超過上限回 413 後各表仍零列」（原寫「2MB 失敗」）。
     - 程式碼：`local-import-repository.ts` 現由核心 `checkImportLimits` 先判定上限（413 在 `db.batch` 之前），送進 `json_each` 的五段 JSON 取自 `limits.segments`。3.10 的 `selectFromJsonEach` 只在既有四個參數 `(userId, fields, json, updatedAt)` 之外**增加一個 `version: SQL` 參數**，
       不動 `checkImportLimits` 的呼叫位置與 `segments` 的來源，因此 413 行為與既有 21 個 it 不受影響（3.10 驗收含 `test/local-import.test.ts` 全綠）。
     - 刪除路徑（`grep -rn "delete(matchmaker" hono-pickball/src` 7 行、4 條路徑）與建立路徑（7 條）與 Context 盤點表一致，無新增。
