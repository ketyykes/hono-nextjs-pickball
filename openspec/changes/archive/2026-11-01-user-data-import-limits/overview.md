# Overview: user-data-import-limits

## Scope

上線前補齊兩個批次寫入端點（`POST /api/import`、`POST /api/matchmaker/players/import`）的大小與筆數上限：
前後端改用核心套件同一個函式量測「真正送進 D1 的參數」，超過時後端在寫入前回 413 `PAYLOAD_TOO_LARGE`，前端顯示說明；
寫入雲端的參賽者 id 不得為空字串，但訪客本機用的 `PlayerSchema` 不動。

**Size**: large — tasks 超過 20 條，且同時改核心、後端與前端兩個 Worker（跨服務）。
**Frontend involved**: yes — 雲端模式的匯入結果新增「資料量超過上限」文案（兩個匯入入口與名單 CSV 雲端匯入）。
**DB schema touched**: no — 不改 `src/db/schema.ts`、無 migration。
**Data migration**: no — 不搬移或改寫任何既有資料；`PlayerSchema` 不收緊正是為了避免改寫訪客本機資料。
**Cross-component flow**: no — 皆為同步的「前端 → proxy → Hono → D1」一來一回，沒有非同步或排程。

---

## What Changes

- 核心：新錯誤碼 `PAYLOAD_TOO_LARGE`；`PlayerWriteSchema`（id 非空）；`serializeImportSegments`／`utf8ByteLength`／`checkImportLimits` 與四個上限常數。
- 後端：共用 body 上限 middleware；`/api/import` 在 `db.batch()` 前判定 413；`players/import` 加 body 與 500 位上限。
- 前端：`oversize` 改用核心判定；413 對應「資料量超過上限」文案（匯入本機資料、JSON 備份匯入雲端、名單 CSV 雲端匯入）。

量測方式與失敗模式的前後對照：

```
=== Before ===
frontend: utf8(raw players|history|slots) > 1,900,000 ? oversize
backend : JSON.stringify(wrapped segment) -> json_each(?)   (no check)
          wrapped segment > 2,000,000 on real D1 -> throw -> 500
          players/import: no count / body limit; id "" accepted

=== After ===
core    : checkImportLimits(req) = serializeImportSegments(req)
          -> each of 5 segments <= 1,900,000 B and players <= 500
frontend: oversize = !checkImportLimits(payload).ok   (same function)
backend : body > limit -> 413 PAYLOAD_TOO_LARGE  (before validator)
          !checkImportLimits -> 413               (before db.batch)
          json_each params = segments from checkImportLimits
          players/import: body <= 1,000,000 B, players <= 500, id != ""
```

---

## UI Mockups

只影響雲端模式的資料頁；訪客畫面不變。預覽階段的 oversize 說明沿用既有文案，差別在判定改準。

```
=== State 1: before - edge data passes preview, fails on submit ===

+- 匯入本機資料到雲端 --------------------------------------+
|  本機資料: 3 位參賽者、2,750 筆歷史、...                  |
|  [匯入本機資料到雲端]                                     |
+-----------------------------------------------------------+
              |
              | click -> backend 500 on real D1
              v
|  匯入失敗,請稍後再試                          <- 看不到原因 |


=== State 2: after - same data is caught in preview ===

+- 匯入本機資料到雲端 --------------------------------------+
|  本機資料量超過單次匯入上限,請先匯出 JSON 備份後聯絡管理者 |
|  (no import button)                                       |
+-----------------------------------------------------------+


=== State 3: after - JSON backup to cloud, server says 413 ===

+- JSON 完整備份 -------------------------------------------+
|  [匯出 JSON]  [選擇備份檔匯入雲端...]                     |
|  資料量超過單次匯入上限,本次沒有匯入任何資料。            |
|  請聯絡管理者協助匯入。                    <- tooLarge     |
+-----------------------------------------------------------+


=== State 4: after - roster CSV to cloud with 501 rows ===

+- 參賽者 CSV 匯入 -----------------------------------------+
|  預覽: 將新增 501 人  [確認匯入]  [取消]                  |
+-----------------------------------------------------------+
              |
              | confirm -> GET players -> POST import -> 413
              v
|  匯入的資料量超過單次上限(一次最多 500 位參賽者),         |
|  本次沒有匯入任何資料。請將 CSV 分成較小的檔案後再匯入。  |
```

---

## Architecture

上限的數字與量測函式只在核心一份，前後端都引用；後端 repository 送進 D1 的字串就是核心函式的輸出。

```
            +------------------- @pickball/core ------------------+
            | api/errors : PAYLOAD_TOO_LARGE                      |
            | api/players: PlayerWriteSchema, MAX_PLAYERS (500)   |
            |              PLAYER_IMPORT_BODY_LIMIT (1,000,000)   |
            | api/import : serializeImportSegments, utf8ByteLength|
            |              checkImportLimits, SEGMENT (1,900,000) |
            |              IMPORT_BODY_LIMIT (10,000,000)         |
            +---------+-------------------------------+-----------+
                      |                               |
        +-------------v-----------+       +-----------v--------------+
        | nextjs-pickball         |       | hono-pickball            |
        | lib/sync/local-import   |       | http/body-limit (413)    |
        |   oversize, too-large   |       | routes/import            |
        | local-import-view       |       |   -> local-import-repo   |
        |   tooLarge text         |       |      checkImportLimits   |
        | matchmaker/remote-      |       |      -> db.batch(7 stmt) |
        |   transfer importTooLg  |       | routes/matchmaker        |
        +-------------------------+       |   players/import 413/400 |
                                          +------------+-------------+
                                                       v
                                                 +-----------+
                                                 |    D1     |
                                                 +-----------+
```

---

## Task Tree

群組間嚴格序列；核心先行（前後端都依賴其匯出），後端與前端皆依賴核心，E2E 依賴前後端。

```
1. 對齊 main + 基線
2. 核心契約 (depends on 1)
├── 2.1/2.2 錯誤碼 PAYLOAD_TOO_LARGE
├── 2.3/2.4 PlayerWriteSchema
└── 2.5/2.6 serializeImportSegments / utf8ByteLength / checkImportLimits
3. 後端 (depends on 2)
├── 3.1/3.2 jsonBodyLimit
├── 3.3/3.4 /api/import 413 (repository before db.batch)
└── 3.5/3.6 players/import 413 / 400
4. 前端 (depends on 2)
├── 4.1/4.2 local-import oversize + too-large
├── 4.3/4.4 local-import-view tooLarge (+ JsonBackupSection test)
├── 4.5/4.6 remote-transfer importTooLarge
└── 4.7     storage regression guard
5. E2E + 文件 (depends on 3, 4)
6. 驗收 C1-C9 + Final review (depends on 5)
```

---

## Cross-Cutting Impact

| File / module | Change kind | Risk |
|---------------|-------------|------|
| `packages/pickball-core/src/api/errors.ts` | modify（加一個鍵） | low |
| `packages/pickball-core/src/api/players.ts` | modify（新 schema、常數） | low |
| `packages/pickball-core/src/api/import.ts` | modify（players 改 schema、三個函式、常數） | medium |
| `packages/pickball-core/test/api/import-limits.test.ts` | new | low |
| `packages/pickball-core/test/api/{errors,players}.test.ts` | modify（errors 授權改斷言；players 新增 it） | low |
| `hono-pickball/src/http/body-limit.ts` | new | low |
| `hono-pickball/src/import/local-import-repository.ts` | modify（改用核心 segments、too-large 分支） | medium |
| `hono-pickball/src/routes/{import,matchmaker}.ts` | modify（middleware、413） | medium |
| `hono-pickball/test/{body-limit,local-import,matchmaker-players}.test.ts` | new／modify | low |
| `nextjs-pickball/lib/sync/local-import.ts` | modify | medium |
| `nextjs-pickball/components/matchmaker/local-import-view.ts` | modify | low |
| `nextjs-pickball/lib/matchmaker/remote-transfer.ts` | modify | low |
| `nextjs-pickball/**/*.test.ts(x)`（5 檔） | modify（新增 it；local-import 授權改一段斷言） | low |
| `nextjs-pickball/tests/e2e/user-data/local-import.spec.ts` | modify（新增 1 test） | low |
| `hono-pickball/CLAUDE.md` | docs | low |
| `PlayerSchema`、本機 reader、`backup.ts`、`api-client.ts` | **不改** | — |
