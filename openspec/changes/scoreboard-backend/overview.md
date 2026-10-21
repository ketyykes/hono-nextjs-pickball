# Overview: scoreboard-backend（B5）

## Scope

登入後，獨立計分板（`/scoreboard`，未帶 `?match=`）改以雲端為準：重新整理、換裝置都能接續同一場比賽；兩台裝置同時改時，
後寫的一方看到「資料已在其他裝置更新」並載入最新比分。訪客與正式站完全不變。本 change 同時定下 B6～B9 共用的後端路由、
授權、資料表、版本衝突、前端儲存模式切換與 E2E 清資料慣例（新 capability `user-data-sync`）。

**Size**: large — 影響 5 個 capability（`user-data-sync` 新增，`scoreboard`、`backend-database`、`dev-workflow`、`pickleball-guide-page` 修改），tasks 45 項，跨前端／後端／核心套件。
**Frontend involved**: yes — 計分板新增同步狀態提示與雲端載入／失敗畫面。
**DB schema touched**: yes — 新增 `scoreboard_current` 表與 migration `0001`。
**Data migration**: no — 本機 `scoreboard:current:v1` 不搬移（匯入屬 B9），雲端從空資料開始。
**Cross-component flow**: yes — 載入、儲存佇列、重試、409 衝突重載、401 回本機模式橫跨 hook、API、D1。

---

## What Changes

- 後端：`/api/scoreboard/current`（GET／PUT）、`localAuth` 移到 `src/auth/`、`AuthAppEnv`／`SessionAppEnv` 拆型別
- D1：`scoreboard_current`（user_id PK、data json、version、updated_at）
- 核心套件：`api/versioned`、`api/errors`、`api/user-data-tables`
- 前端：`lib/sync/*`（模式判斷、請求分類、最新優先儲存、狀態文案）、`useRemoteScoreboardStore`、`useScoreboardStore` 變選擇器、`SyncStatusNotice`
- E2E：第六個 project `user-data`（workers 1）、`clearTestAccountUserData()`
- 範圍調整：場次分槽 `scoreboard:matches:v1` 移到 B7

```
=== Before ===
/scoreboard (任何人) --> localStorage scoreboard:current:v1
/scoreboard?match=m1 --> localStorage scoreboard:matches:v1
hono: /api/auth/*, /api/me, /api/session

=== After ===
/scoreboard (訪客/載入中) --> localStorage scoreboard:current:v1 (不變)
/scoreboard (已登入)      --> GET/PUT /api/scoreboard/current --> D1
/scoreboard?match=m1     --> localStorage scoreboard:matches:v1 (不變, B7)
hono: + /api/scoreboard/* (localAuth + requireSession)
```

---

## UI Mockups

只有已登入時才會出現下列狀態；訪客永遠是 State 1（與現在相同）。

```
=== State 1: 訪客 / 本機模式 (與現在相同, 無 data-sync-status) ===
┌──────────────────────────────────────────┐
│   我方 3            對方 1                │
│   [我方得分]        [對方得分]            │
│   [Undo] [Reset]                          │
└──────────────────────────────────────────┘

=== State 2: 已登入, 雲端載入中 (取代計分畫面) ===
┌──────────────────────────────────────────┐
│                                          │
│         正在載入雲端資料…                 │ ← role=status
│                                          │
└──────────────────────────────────────────┘
              │ GET 200
              ▼
=== State 3: synced / saving (無提示, data-sync-status) ===
┌──────────────────────────────────────────┐
│   我方 3            對方 1                │
│   [我方得分]        [對方得分]            │
└──────────────────────────────────────────┘
              │ PUT 失敗 (5xx / 網路)
              ▼
=== State 4: retrying (疊加提示, 照常可計分) ===
┌──────────────────────────────────────────┐
│ ! 尚未儲存到雲端，將自動重試              │ ← role=status
│   我方 4            對方 1                │
│   [我方得分]        [對方得分]            │
└──────────────────────────────────────────┘
              │ PUT 409 (另一裝置先寫)
              ▼
=== State 5: conflict (已重新載入雲端比分) ===
┌──────────────────────────────────────────┐
│ ! 資料已在其他裝置更新，已重新載入最新資料│
│   我方 5            對方 2                │ ← 雲端的比分
└──────────────────────────────────────────┘

=== State 6: load-failed (取代計分畫面) ===
┌──────────────────────────────────────────┐
│     無法載入雲端資料，請重新整理頁面      │ ← 無計分按鈕
└──────────────────────────────────────────┘
```

---

## Data Model

新增一張表，與 auth 的 `user` 一對零或一。

```
=== After ===

┌─ user ───────────┐       ┌─ scoreboard_current ──┐
│ (…)              │ 1───1 │ user_id      PK FK    │
│ id           PK  │       │ data         json     │
└──────────────────┘       │ version      int      │
                           │ updated_at   ms       │
                           └───────────────────────┘
  FK user_id -> user.id ON DELETE CASCADE
```

---

## Architecture

後端以 feature sub-app 掛授權；前端以選擇器在本機與雲端 hook 之間切換，契約 schema 由核心套件共用。

```
nextjs-pickball                         hono-pickball
┌──────────────────────────┐            ┌─────────────────────────────┐
│ Scoreboard               │            │ app (AuthAppEnv)            │
│   └ useScoreboardStore   │            │  ├ /api/auth/* localAuth    │
│      ├ useSession ──────────/api/session                           │
│      ├ resolveStorageMode│            │  └ route /api/scoreboard    │
│      ├ useLocal…(不變)   │            │     sub-app (SessionAppEnv) │
│      │   └ localStorage  │            │     use(localAuth,          │
│      └ useRemote…        │  /api/*    │         requireSession)     │
│          ├ requestJson ──┼─proxy────► │     GET/PUT /current        │
│          └ latest-wins   │            │       └ repository ──► D1   │
│            saver         │            └─────────────────────────────┘
└──────────────────────────┘
          ▲                                   ▲
          └──── @pickball/core/api/* ─────────┘
               (versioned, errors, USER_DATA_TABLES)
```

---

## Sequence Diagram

已登入使用者連續得分，第一次 PUT 在途時又得分（最新優先），隨後另一裝置先寫入造成 409。

```
User      useRemote…      saver         API (hono)        D1
 │ mount     │              │               │               │
 │──────────►│ GET current  │               │               │
 │           │─────────────────────────────►│ select        │
 │           │ {data, v2}   │               │──────────────►│
 │           │◄─────────────────────────────│               │
 │ 得分 A    │ save(A)      │               │               │
 │──────────►│─────────────►│ PUT {A, v2}   │               │
 │ 得分 B,C  │ save(B),(C)  │──────────────►│ update v=2    │
 │──────────►│─────────────►│ (只留 C)      │──────────────►│
 │           │              │ 200 {v3}      │               │
 │           │              │◄──────────────│               │
 │           │              │ PUT {C, v3}   │  (另一裝置已  │
 │           │              │──────────────►│   寫成 v4)    │
 │           │              │ 409           │ 0 rows        │
 │           │ conflict     │◄──────────────│               │
 │           │◄─────────────│ (停止, 丟棄)  │               │
 │           │ GET current  │               │               │
 │           │─────────────────────────────►│               │
 │           │ {data', v4}  │               │               │
 │ 顯示衝突  │◄─────────────────────────────│               │
 │◄──────────│ HYDRATE      │               │               │

失敗分支: PUT 5xx/網路 -> retrying, 1/2/4/8 秒後每 8 秒重試
          PUT/GET 401  -> onUnauthorized -> session.refresh -> 本機模式
```

---

## Task Tree

```
1. 對齊 main + Context7 + 一次性實測
2. 核心套件 API 契約 (versioned, errors)
3. 後端: 型別拆分 (type RED) / localAuth 搬移 / scoreboard_current 表
   (depends on 2)
4. 後端: /api/scoreboard/current (depends on 3)
5. 前端 lib/sync: storage-mode / api-client / saver / sync-status
   (depends on 2, 可與 3-4 並列但依規定序列執行)
6. 前端 hooks: useRemoteScoreboardStore / hooksInventory 同步 /
   選擇器 useScoreboardStore (depends on 4, 5)
7. E2E: user-data project + helper / RED / 畫面接線 GREEN
   (depends on 6)
8. 文件同步與總驗收 (depends on 7)
```

---

## Cross-Cutting Impact

| File / module | Change kind | Risk |
|---------------|-------------|------|
| `hono-pickball/src/index.ts` | modify（掛 sub-app、移出 localAuth） | medium |
| `hono-pickball/src/auth/require-session.ts` | modify（拆型別） | medium |
| `hono-pickball/src/auth/local-auth-middleware.ts` | new | low |
| `hono-pickball/src/routes/scoreboard.ts`、`src/scoreboard/repository.ts` | new | medium |
| `hono-pickball/src/db/schema.ts`、`drizzle/0001_*` | modify／new | medium |
| `packages/pickball-core/src/api/*` | new | low |
| `nextjs-pickball/lib/sync/*` | new | medium |
| `nextjs-pickball/hooks/useScoreboardStore.ts` | modify（改名＋選擇器） | high（訪客路徑） |
| `nextjs-pickball/hooks/useRemoteScoreboardStore.ts` | new | medium |
| `nextjs-pickball/components/scoreboard/Scoreboard.tsx` | modify | medium |
| `nextjs-pickball/playwright.config.ts` | modify（新增 project） | medium |
| `openspec/specs/pickleball-guide-page/spec.md` | 授權同步一句（6.4） | low |
