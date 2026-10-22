# Overview: matchmaker-roster-backend（B6）

## Scope

登入後，對戰分配機的參賽者名單（含強度分數、出場與休息次數）改以雲端為準：新增、編輯、刪除、切換出場、送出比分後的評分都寫入後端，
換裝置看得到同一份名單；資料頁的 CSV 匯入與 JSON 匯出在登入時讀寫雲端。回合與歷史仍在本機（B7、B8）。訪客完全不變。

**Size**: large — 影響 5 個 capability（`user-data-sync`、`player-roster`、`data-transfer`、`backend-database`、`pickleball-guide-page`），tasks 35 項，跨前端／後端／核心套件。
**Frontend involved**: yes — 三個對戰分配機頁面加同步提示；資料頁登入時 JSON 還原停用。
**DB schema touched**: yes — 新增 `matchmaker_players` 與 migration `0002`。
**Data migration**: no — 本機名單不搬移（B9 匯入），雲端從空名單開始。
**Cross-component flow**: yes — 逐人儲存佇列、409 整份重載、CSV 匯入的「讀雲端 → 計算 → 批次寫入」。

---

## What Changes

- 後端：`/api/matchmaker/players`（GET／PUT／DELETE／import）、`/api/matchmaker/reset`
- D1：`matchmaker_players`（`(user_id, id)` 複合主鍵、data json、sort_order）
- 核心套件：`api/players.ts`、`USER_DATA_TABLES` 加一張表
- 前端：`useRemoteRosterStore`（逐人最新優先）、`useRosterStore` 變選擇器、`roster-api.ts`、`remote-transfer.ts`、`resetLocalMatchProgress()`
- 頁面：對戰／參賽者／統計頁的同步提示；資料頁登入分支
- 文件：「matchmaker 為 LocalStorage-only」改寫

```
=== Before (B5 後) ===
名單 (任何人)   --> localStorage matchmaker:roster:v1
回合/歷史       --> localStorage
/api: scoreboard/current

=== After ===
名單 (訪客)     --> localStorage matchmaker:roster:v1 (不變)
名單 (已登入)   --> /api/matchmaker/players --> D1 matchmaker_players
回合/歷史       --> localStorage (B7/B8 前不變)
重置 (已登入)   --> POST /api/matchmaker/reset + 清本機回合/歷史/分槽
                    (保留本機訪客名單)
```

---

## UI Mockups

參賽者頁（已登入）；對戰頁與統計頁的載入中／失敗呈現相同。

```
=== State 1: 雲端載入中 (取代主要內容) ===
┌──────────────────────────────────────────┐
│ 對戰 | 參賽者 | 歷史 | 資料 | 統計        │
│                                          │
│         正在載入雲端資料…                 │ ← role=status
└──────────────────────────────────────────┘
              │ GET 200
              ▼
=== State 2: synced (與訪客版面相同, 多 data-sync-status) ===
┌──────────────────────────────────────────┐
│ [新增參賽者]                 [重置名單]   │
│ ┌────────┐ ┌────────┐                    │
│ │ 王小明 │ │ 陳大華 │                    │
│ │ 4.5    │ │ 3.0    │                    │
│ └────────┘ └────────┘                    │
└──────────────────────────────────────────┘
              │ 另一裝置先改了王小明, 本裝置再改
              ▼
=== State 3: conflict ===
┌──────────────────────────────────────────┐
│ ! 資料已在其他裝置更新，已重新載入最新資料│
│ ┌────────┐ ┌────────┐                    │
│ │ 王曉明 │ │ 陳大華 │ ← 雲端版本          │
└──────────────────────────────────────────┘

=== 資料頁 (已登入) ===
┌──────────────────────────────────────────┐
│ JSON 備份  [匯出 JSON]                    │ ← players 取自雲端
│ 登入時暫不支援從 JSON 備份還原，請登出後  │ ← 無選檔按鈕
│ 還原，或使用之後提供的匯入本機資料功能    │
│ 參賽者 CSV [選擇檔案] -> 預覽 -> [確認]   │ ← POST import
│ 歷史 CSV   [匯出 CSV]                     │ ← 不變 (本機)
│ [清除本機資料]                            │ ← 不變 (只清本機)
└──────────────────────────────────────────┘
```

---

## Data Model

```
=== After ===

┌─ user ───────────┐       ┌─ matchmaker_players ──┐
│ (…)              │ 1───N │ user_id      PK FK    │
│ id           PK  │       │ id           PK       │
└──────────────────┘       │ data         json     │
        │                  │ sort_order   int      │
        │ 1───1            │ version      int      │
        ▼                  │ updated_at   ms       │
┌─ scoreboard_current ─┐   └───────────────────────┘
│ (…)  (B5)            │   PK (user_id, id)
└──────────────────────┘   FK user_id -> user.id ON DELETE CASCADE
```

---

## Architecture

```
app/matchmaker/{page,players,stats}
   └ useRosterStore (選擇器)
       ├ useLocalRosterStore (不變) ──► localStorage
       └ useRemoteRosterStore
           ├ reducer (重用 roster.ts 純函式)
           ├ saver per player (latest-wins) ─┐
           └ roster-api.ts ──► requestJson ──┼─► /api/matchmaker/* ─► D1
   └ useRoundStore (本機) ── updatePlayer port ┘

/matchmaker/data
   ├ RosterCsvImportSection ─ remote-transfer.importRosterRemote
   │                           GET players -> applyRosterImport
   │                           -> POST import (D1 batch)
   └ JsonBackupSection ─ remote-transfer.buildRemoteBackupSnapshot
```

---

## Sequence Diagram

登入時 CSV 匯入：任一 id 已存在時整份不寫入（D1 batch 回滾）。

```
User      CsvSection    remote-transfer     API (hono)        D1
 │ 確認匯入   │               │                  │               │
 │──────────►│ importRemote  │                  │               │
 │           │──────────────►│ GET players      │               │
 │           │               │─────────────────►│ select        │
 │           │               │ {items}          │──────────────►│
 │           │               │◄─────────────────│               │
 │           │               │ applyRosterImport│               │
 │           │               │ POST import      │               │
 │           │               │─────────────────►│ batch[ins...] │
 │           │               │                  │──────────────►│
 │           │               │ 200 {items}      │   commit      │
 │           │ {ok}          │◄─────────────────│               │
 │ reload    │◄──────────────│                  │               │

失敗分支: 任一 insert 主鍵衝突 -> batch 回滾 -> 409 -> {ok:false, 訊息}
          GET/POST 失敗       -> {ok:false, 訊息}, 不 reload
```

---

## Task Tree

```
1. 對齊 main(B5 落地) + Context7 + batch/sort_order 實測
2. 核心套件 api/players (depends on 1)
3. 後端: d1-schema RED -> 表+migration -> API RED -> API GREEN
   (depends on 2)
4. 前端: roster-api / resetLocalMatchProgress (depends on 3)
5. 前端: useRemoteRosterStore / hooksInventory 同步 / 選擇器
   (depends on 4)
6. 前端: remote-transfer (depends on 5)
7. E2E RED -> 頁面與資料頁接線 GREEN (depends on 6)
8. 文件同步與總驗收 (depends on 7)
```

---

## Cross-Cutting Impact

| File / module | Change kind | Risk |
|---------------|-------------|------|
| `hono-pickball/src/routes/matchmaker.ts`、`src/matchmaker/players-repository.ts` | new | medium |
| `hono-pickball/src/db/schema.ts`、`drizzle/0002_*` | modify／new | medium |
| `packages/pickball-core/src/api/{players,user-data-tables}.ts` | new／modify | low |
| `nextjs-pickball/hooks/useRosterStore.ts` | modify（改名＋選擇器） | high（訪客路徑、三個頁面） |
| `nextjs-pickball/hooks/useRemoteRosterStore.ts` | new | high（逐人佇列） |
| `nextjs-pickball/lib/matchmaker/storage.ts` | modify（新增函式） | low |
| `nextjs-pickball/app/matchmaker/{page,players/page,stats/page}.tsx` | modify | medium |
| `nextjs-pickball/components/matchmaker/{RosterCsvImportSection,JsonBackupSection}.tsx` | modify | medium |
| `openspec/specs/pickleball-guide-page/spec.md` | 授權同步一句（5.4） | low |
