# Overview: user-data-account-guard

## Scope

同一瀏覽器另一分頁換成帳號 B 後，本分頁仍以帳號 A 的畫面送出請求，後端只看 cookie，於是把 A 的資料寫進 B（甚至 reset 刪光 B）。
本 change 讓每個使用者資料請求帶上「前端以為的帳號」（`X-Expected-User-Id`），後端不符即回 `401 ACCOUNT_MISMATCH`；
前端雲端 store 以帳號為世代，換帳號就丟棄舊帳號的待送變更並以新帳號重新載入。範圍涵蓋 B5～B7 全部 13 個端點、四支雲端 hook 與三個一次性操作。

**Size**: large — 影響 3 個 capability（ADDED 6、MODIFIED 1），tasks 30 個，跨核心套件、後端、前端與 E2E。
**Frontend involved**: yes — 雲端 hook、選擇器、`CourtCard` 與資料頁區塊的行為改變（畫面在換帳號後改顯示 B）。
**DB schema touched**: no — 不新增表、不改欄位、無 migration。
**Data migration**: no — 既有資料不搬移；只多 seed 一個本機測試帳號。
**Cross-component flow**: yes — 分頁 1 的請求、後端守衛、session refresh 與 store 世代切換是順序敏感的多步互動。

---

## What Changes

- 核心：`API_ERROR_CODES` 加 `ACCOUNT_MISMATCH`；新模組 `api/headers`（`EXPECTED_USER_ID_HEADER`）。
- 後端：新 middleware `requireExpectedUser`，掛在 scoreboard 與 matchmaker 兩個 sub-app；以 `app.routes` 列舉的守衛測試。
- 後端：seed 另建衍生第二帳號（plus addressing、同密碼）。
- 前端：`requestJson` 必填 `expectedUserId`；包裝第一參數帶帳號；命令佇列改收已綁定函式。
- 前端：四支雲端 hook 加 `userId` 世代與擁有者標記；三個選擇器傳 user id；一次性操作 401 時 refresh。
- E2E：新 `account-switch.spec.ts` 七條；helper 清兩個帳號、`expectedUserHeaders()`。

Before / after 對照：

```
=== Before ===
tab1 (shows A) --PUT, cookie=B--> requireSession ok as B --> writes B data
tab1 never sees 401, keeps showing "A" with B's data

=== After ===
tab1 (gen A) --PUT, cookie=B, X-Expected-User-Id=A--> guard: A != B
          <-- 401 ACCOUNT_MISMATCH (no write)
tab1 --> session.refresh() --> user=B --> new generation (userId=B)
          --> GET with X-Expected-User-Id=B --> shows B's data, navbar B
```

---

## UI Mockups

畫面文案不變（不新增 SyncStatus 或提示）；差別在換帳號後的呈現與 CourtCard 的錯誤。

```
=== State 1: tab1 synced as A ===

+--------------------------------------+
| Navbar ............... [A]          |
| Scoreboard   us 7 : 5 them          |
+--------------------------------------+
              |
              | tab2 signs in as B (cookie overwritten)
              | tab1 scores a point -> PUT 401
              v

=== State 2: refresh done, new generation loading ===

+--------------------------------------+
| Navbar ............... [B]          |
| (loading message, A's 7:5 hidden)   |  <- same render as userId change
+--------------------------------------+
              |
              | GET as B -> 200
              v

=== State 3: synced as B ===

+--------------------------------------+
| Navbar ............... [B]          |
| Scoreboard   us 2 : 0 them          |  <- B's cloud data
+--------------------------------------+


=== State 4: CourtCard after switch (matchmaker page) ===

+--------------------------------------+
| Court 1   [Enter scoreboard]        |
|   ! existing error message          |  <- slot PUT 401, no navigate
+--------------------------------------+
| Navbar becomes [B] after refresh    |
```

---

## Architecture

請求的帳號來源與後端 middleware 鏈。

```
 useSession() --user.id--> selector --userId--> useRemoteXStore
                                                  | generation closure
                                                  v
 one-off ops (CSV import, JSON export, CourtCard) --expectedUserId-->
                                                  v
                     lib/sync/*-api.ts --> requestJson(..., expectedUserId)
                                                  | X-Expected-User-Id
                                                  v
                     Next proxy /api/[[...route]] (headers passthrough)
                                                  v
 Hono sub-app: localAuth -> requireSession -> requireExpectedUser
                 404         401 UNAUTH        401 ACCOUNT_MISMATCH
                                                  v
                          zValidator -> handler (c.var.user.id only)
```

---

## Sequence Diagram

另一分頁換帳號後，本分頁一次寫入從被拒到以新帳號重新載入。

```
Tab1 hook(gen A)   Proxy/Hono        Session store     Tab2
 |                   |                   |               |
 |                   |                   |   sign in B   |
 |                   |<--------------------------------- |
 |                   | cookie := B       |               |
 | PUT, exp=A        |                   |               |
 |------------------>| user=B != A       |               |
 | 401 MISMATCH      |                   |               |
 |<------------------|                   |               |
 | stop saver, onUnauthorized()          |               |
 |-------------------------------------->| refresh       |
 |                   | GET /api/session  |               |
 |                   |<------------------|               |
 |                   | user=B            |               |
 |                   |------------------>|               |
 | rerender userId=B (old gen disposed, pending dropped) |
 | GET, exp=B        |                   |               |
 |------------------>| ok                |               |
 | 200 B's data      |                   |               |
 |<------------------|                   |               |
```

---

## Task Tree

```
1. align main + verify (app.routes, better-auth, Context7)
2. core: ACCOUNT_MISMATCH, api/headers            (dep 1)
3. backend test helpers carry header, suite green (dep 2)
4. derived 2nd account + E2E fixtures             (dep 3)
   └── 4.5 account-switch.spec RED (guard absent, real red)
5. backend guard RED/GREEN, enumerated routes     (dep 4)
6. frontend requestJson + wrappers   ┐            (dep 2)
7. hooks: userId generations         ├ one dispatch, tsc red until 8
8. selectors + one-off ops + refresh ┘
9. E2E green, WebKit manual, docs                 (dep 4,5,8)
```

---

## Cross-Cutting Impact

| File / module | Change kind | Risk |
|---------------|-------------|------|
| `packages/pickball-core/src/api/{errors,headers}.ts` | modify / new | low |
| `hono-pickball/src/auth/require-expected-user.ts` | new | medium |
| `hono-pickball/src/routes/{scoreboard,matchmaker}.ts` | modify (one line each) | medium |
| `hono-pickball/test/helpers/*`, existing test local helpers | modify (headers only) | medium |
| `hono-pickball/test/expected-user-guard.test.ts` | new | low |
| `hono-pickball/src/db/seed/test-account.ts`, `scripts/seed-test-account.ts` | modify | low |
| `nextjs-pickball/lib/sync/{api-client,roster-api,round-api,round-command-queue}.ts` | modify | medium |
| `nextjs-pickball/hooks/useRemote{Scoreboard,Roster,Round,MatchSlot}Store.ts` | modify | high |
| `nextjs-pickball/hooks/use{Scoreboard,Roster,Round}Store.ts` (selectors) | modify | low |
| `nextjs-pickball/lib/matchmaker/remote-transfer.ts` | modify | low |
| `nextjs-pickball/components/matchmaker/{CourtCard,JsonBackupSection,RosterCsvImportSection}.tsx` | modify | medium |
| `nextjs-pickball/tests/e2e/helpers/*`, `user-data/*.spec.ts` | modify / new | medium |
| `hono-pickball/CLAUDE.md`, `nextjs-pickball/CLAUDE.md` | docs | low |
