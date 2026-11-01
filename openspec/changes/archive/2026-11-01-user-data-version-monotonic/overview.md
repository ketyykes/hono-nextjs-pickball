# Overview: user-data-version-monotonic

## Scope

對戰分配機的名單、回合、分槽在「刪除後以同一個主鍵重建」時，version 會從 1 重新起算，
讓手上還拿著舊 version 的另一台裝置寫入成功、靜默蓋掉新資料（ABA）。本 change 為每位使用者
記一個「版本下限」：刪除時把下限抬到被刪列的最大 version，重建時從「下限 + 1」起算。

**Size**: large — tasks 超過 20 條（每條刪除路徑與建立路徑各一組 RED／GREEN），且含 schema migration；capability 只動 3 個。
**Frontend involved**: no — 前端只保存伺服器回傳的 version，不做算術，零改動。
**DB schema touched**: yes — 新增 `sync_version_floors` 表（migration 0004）。
**Data migration**: no — 純新增空表；正式 D1 尚未建立，沒有要回填的資料。
**Cross-component flow**: yes — ABA 是兩台裝置、API 與 D1 之間順序敏感的多步互動。

---

## What Changes

- 新表 `sync_version_floors`（每位使用者一列，`version` 即下限），列入 `USER_DATA_TABLES`。
- 四條刪除路徑（逐筆刪除參賽者、重置、回合 PUT 的孤兒清除、送出比分刪分槽）在同一個 batch 內先抬高下限。
- 七條建立路徑（三個 PUT version 0、批次附加參賽者、本機匯入的參賽者／回合／分槽）的初始 version 改為「下限 + 1」。
- `scoreboard_current`、`matchmaker_history`、`sync_batch_guards` 不變（盤點證明無 ABA）。

以「重置後重建回合」為例的前後對照：

```
=== Before ===
round v1 --(B: reset)--> (no row) --(B: PUT v0)--> round v1   <- reuses 1
A: PUT {version: 1}  -> 200, overwrites B's new round           (ABA)

=== After ===
round v1 --(B: reset; floor := max(floor, 1))--> (no row), floor = 1
         --(B: PUT v0; version := floor + 1)--> round v2
A: PUT {version: 1}  -> 409 VERSION_CONFLICT, A reloads         (safe)
```

---

## Data Model

新增一張使用者資料表，只與 `user` 有 FK 關聯。

```
=== Before ===

┌─ user ───────────┐
│ (…)              │
└──────────────────┘
   1───N matchmaker_players / matchmaker_round / matchmaker_match_slots
   1───N matchmaker_history / scoreboard_current / sync_batch_guards

=== After ===

┌─ user ───────────┐        ┌─ sync_version_floors ───────────┐
│ (…)              │ 1───1  │ user_id      PK FK (cascade)    │
└──────────────────┘        │ version      NOT NULL, no DEFAULT│
                            │ updated_at   NOT NULL           │
                            └─────────────────────────────────┘
   (other user data tables unchanged)
```

---

## Architecture

下限的讀寫集中在新模組 `version-floor.ts`，由各 repository 把產生的陳述式排進自己的 batch。

```
 routes/matchmaker.ts      routes/import.ts        (unchanged)
        │                        │
        ▼                        ▼
 players-repository ─┐    local-import-repository
 round-repository ───┤           │
 slots-repository ───┤           │
 score-repository ───┤           │
                     ▼           ▼
            matchmaker/version-floor.ts
            ├─ initialVersion(userId)      -> SQL subquery
            │    used by: PUT v0 x3, players/import, /api/import
            └─ raiseVersionFloor(db, ...)  -> INSERT..SELECT..UPSERT
                 used by: delete player, reset,
                          round orphan cleanup, score slot delete
                     │
                     ▼
               D1: sync_version_floors
```

---

## Sequence Diagram

最貼近實際使用的 ABA：B 重置後重新匯入同一份本機資料，A 仍持有舊 version。

```
Device A           Device B             Hono API              D1
   │                  │ POST /api/import P  │                   │
   │                  │────────────────────►│ insert p1 v1      │
   │ GET players      │                     │──────────────────►│
   │────────────────────────────────────────►│ p1 v1             │
   │                  │ POST /reset         │                   │
   │                  │────────────────────►│ batch:            │
   │                  │                     │  floor := 1       │
   │                  │                     │  delete 4 tables  │
   │                  │                     │──────────────────►│
   │                  │ POST /api/import P  │                   │
   │                  │────────────────────►│ insert p1         │
   │                  │                     │  v = floor+1 = 2  │
   │                  │                     │──────────────────►│
   │ PUT p1 {v: 1}    │                     │                   │
   │────────────────────────────────────────►│ UPDATE..WHERE v=1 │
   │                  │                     │──────────────────►│
   │                  │                     │ 0 rows            │
   │ 409 -> reload    │                     │◄──────────────────│
   │◄────────────────────────────────────────│                   │
```

---

## Task Tree

§1 對齊與實測，§2 先建表，§3 處理重置與所有建立路徑，§4 補齊其餘刪除路徑，§5 文件與驗收。

```
1. Align + probe (no product code)
2. Table sync_version_floors          (depends on 1)
├── 2.1 RED  d1-schema: 4 its
└── 2.2 GREEN schema + migration 0004 + USER_DATA_TABLES
3. Reset raises floor; creation uses floor+1   (depends on 2)
├── 3.1/3.2  round PUT v0 (+ reset batch, [4]->[5])
├── 3.3/3.4  player PUT v0
├── 3.5/3.6  POST /players/import (RETURNING)
├── 3.7/3.8  slot PUT v0
├── 3.9/3.10 POST /api/import (3 segments)
└── 3.11     REFACTOR
4. Other deletion paths               (depends on 3)
├── 4.1/4.2  DELETE player (batch of 2)
├── 4.3/4.4  round PUT orphan cleanup ([2,2]->[3,3])
├── 4.5/4.6  score submission slot delete
└── 4.7      REFACTOR
5. Docs + command acceptance C1..C7   (depends on 4)
```

---

## Cross-Cutting Impact

| File / module | Change kind | Risk |
|---------------|-------------|------|
| `hono-pickball/src/db/schema.ts` | modify（新表） | low |
| `hono-pickball/drizzle/0004_sync_version_floors.sql`、`meta/*` | new（產生） | medium（E2E 前須 migrate） |
| `hono-pickball/src/matchmaker/version-floor.ts` | new | medium |
| `hono-pickball/src/matchmaker/players-repository.ts` | modify | medium |
| `hono-pickball/src/matchmaker/round-repository.ts` | modify | medium |
| `hono-pickball/src/matchmaker/slots-repository.ts` | modify | low |
| `hono-pickball/src/matchmaker/score-repository.ts` | modify | medium（守衛 batch 順序） |
| `hono-pickball/src/import/local-import-repository.ts` | modify | low |
| `packages/pickball-core/src/api/user-data-tables.ts` | modify | low |
| `hono-pickball/test/version-floor.test.ts` | new | — |
| `hono-pickball/test/d1-schema.test.ts` | modify（新增 it） | — |
| `hono-pickball/test/matchmaker-{players,round}.test.ts` | modify（各一條 batch 大小斷言） | low |
| `hono-pickball/CLAUDE.md` | modify（文件） | low |
