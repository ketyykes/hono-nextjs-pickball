# Tasks: matchmaker-history-stats-backend

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：前端 `pnpm --filter ./nextjs-pickball test --run <path>`；後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`；
> 核心 `pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`；`regression guard`；`設定層`（`tests/**` helper、文件）；`例外層`（`app/**/page.tsx`、純呈現或 I/O 樣板元件，以 E2E 驗收）；`驗收（指令）`（test-plan C1～C7）。
>
> **前提**：B4～B7 皆已合併回 `main` 並 archive。**不新增任何第三方相依**；**禁止任何遠端 CF 操作**；不 push；本 change **無 migration**。
> 測試帳密不得寫進任何會被 commit 的檔案或訊息。it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入。
> **訪客路徑零迴歸**：`HistoryView.tsx`、統計頁的本機內容、`history-range.ts` 既有函式、`player-stats.ts`、`history-csv.ts`、`backup.ts`、`transfer-storage.ts`、`round-storage.ts` 一行不改
> （統計頁的本機內容若需搬進獨立元件，MUST 是原樣搬移，`git diff -M` 可辨識）。
> 既有 it 的名稱與斷言一律不得修改，**唯一例外**：`lib/matchmaker/storage.test.ts` 刪除 B7 的「resetLocalMatchProgress 只移除本機歷史…」；
> `hooks/useRemoteRosterStore.test.tsx` 改寫 B7 的「resetRoster 成功後清空名單並只清除本機歷史」；`lib/matchmaker/remote-transfer.test.ts` 改寫 B7 的「雲端備份快照的參賽者與回合取自雲端、歷史取自本機」；
> **B7.5 交接的兩處（apply §1 追加授權）**：`hono-pickball/test/expected-user-guard.test.ts` 的 `SAMPLES` 補 `"GET /api/matchmaker/history"` 一條、「列舉出的使用者資料路由恰與守衛樣本表一致」的 `toHaveLength(13)` 改為 14（B7.5 design「交接給 B8／B9」明定的刻意紅燈）；
> `lib/matchmaker/remote-transfer.test.ts`「雲端匯入與備份的每個請求都帶呼叫端給的帳號」的備份段：fetch mock 補歷史回應、`toHaveBeenCalledTimes(2)` 改 3、帳號清單多一個 `"user-a"`（備份多一個歷史 GET 的必然結果，匯入段一字不動）。
>
> **預期帳號（B7.5）**：所有使用者資料請求帶 `X-Expected-User-Id`。後端新測試一律用 `hono-pickball/test/helpers/matchmaker-fixtures.ts`（`seedAndSignIn`、`request()` 自動帶標頭、`seedHistory`、`rowsOf`），不得另抄 `seedAndSignIn`；
> 前端 API 包裝以 `expectedUserId` 為第一參數；雲端 hook 收 `userId` 並以擁有者標記擋前一帳號的資料（effect 內重設狀態用 `useReducer` dispatch，`react-hooks/set-state-in-effect` 會擋 setState，前例 `hooks/useRemoteRosterStore.ts`）；
> 一次性雲端操作以點擊當下 `useSession()` 的 user id 呼叫、未授權時 `refresh()`；E2E 直接打 API 時用 `tests/e2e/helpers/user-data.ts` 的 `expectedUserHeaders()`。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/matchmaker-history-stats-backend`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  `pnpm test` baseline、三段 typecheck、`pnpm lint`；`playwright test --list` 各 project 數量；回填 environment.md 並 commit
- [x] 1.2 對齊 B7 實際落地：`hono-pickball/src/{routes/matchmaker.ts,matchmaker/score-repository.ts}`、`test/matchmaker-score.test.ts`（歷史列的插入方式，供本 change 的測試 seed 照抄）、
  `nextjs-pickball/{hooks/useRemoteRoundStore.ts,lib/sync/round-api.ts,lib/matchmaker/remote-transfer.ts,app/matchmaker/stats/page.tsx}`、`tests/e2e/user-data/round-sync.spec.ts`（產生對戰與送出比分的 helper）、B7 design Open Questions。
  比對本 change 的 MODIFIED Requirement 與目前主 spec：`match-history`（兩個）、`player-stats`（三個）、`player-roster`「重置名單與二次確認」（B7 版本）、`data-transfer`「登入時的資料工具頁」（B7 版本）、
  `pickleball-guide-page`（MUST 已含 B7 的兩支 hook）；**若主 spec 原文與 delta 原文部分不同，以主 spec 為底重新套用本 change 的增修並 commit**
- [x] 1.3 Context7 查證（MUST，附 library ID 記入 design.md「apply §1 查證紀錄」）：`/cloudflare/cloudflare-docs`（Workers runtime 的 `TZ=UTC`，design Decision 1）；
  `/colinhacks/zod`（或 resolve 到的 zod 文件：`z.coerce.number()` 對空字串的行為，design Open Questions 1）；`/drizzle-team/drizzle-orm-docs`（`orderBy` 以 `sql` 指定 `rowid`）。差異記入 Open Questions
  - 紀錄：見 design.md「apply §1 查證紀錄」。差異：zod 的 coerce 連空白、`1e3`、`0x10` 都接受 → Decision 6 改 regex（OQ1 定案）；player-roster 兩個 Scenario 補回（OQ3）；B7.5 交接落實為 Decision 7（OQ4）

## 2. 核心套件：區間界線與歷史 API 契約

Depends on: §1

- [x] 2.1 RED（TDD）：新增 `packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`（兩個 it）與 `test/api/history.test.ts`（一個 it）。確認紅燈
  - 紅燈紀錄：`history-range-bounds.test.ts` 2 個 it 皆紅（`TypeError: rangeBounds is not a function`）；`history.test.ts` 整檔紅（`Cannot find module '../../src/api/history'`，1 個 it 無法載入）。無先綠者，無 regression guard。
- [x] 2.2 GREEN（TDD）：`src/matchmaker/history-range.ts` 新增 `rangeBounds`（既有函式不改，`git diff` 只見新增）；新增 `src/api/history.ts`；`CORE_MODULES` 加 `api/history`
  - 綠燈紀錄：3 個 it 轉綠；`module-boundary.test.ts` 仍綠；core typecheck 兩段與 `pnpm -r exec tsc --noEmit` 皆 exit 0；`history-range.ts` diff 僅 +33 行新增。
  - 變異驗證（Implementer 自跑，harness 在 /tmp/b8tools，不入 repo）：共 37 次，34 次預期轉紅且皆轉紅（rangeBounds 五區間各界線 12 條含 `today.to`→`now.getTime()`、`earlier.from`→非 null；`from < to` 拿掉／改 `<=`；`from` regex 改回 `z.coerce.number()`（空字串樣本轉紅）、拿掉錨點、拿掉安全整數檢查；`order` 拿掉 asc／desc／改任意字串／改必填；`from`／`to` 改必填；`total`／`droppedCount` 可負、可小數、移除欄位；`version` 可為 0、可小數；`data`／`items` 不驗證；`matchmaker/history.ts` entry `winner` 拿掉 `draw`），2 次等價對照（改 refine 訊息、交換 switch case 順序）如預期仍綠；另 1 次 `today.to` null→Infinity（isInBounds 下判定等價，但 `toBeNull` 斷言轉紅，證明「無界」以 null 表達被釘住）；每次還原後 `git status --porcelain` 與基線一致。
  - 測試強化：mutation 前自行發現 `droppedCount`／`version` 的小數樣本缺漏，已在同一 it 內補 `droppedCount: 1.5`、`version: 1.5`（it 名稱不變，隨 GREEN commit 一併提交）。
  - Stage 2 補件（regression guard，加入時皆為綠，非 RED）：在 `history.test.ts` 同一 it 內補 `{ to: "200" }` 通過、`{ from: "0", to: "0" }` 失敗／`{ from: "0", to: "1" }` 通過、`from`／`to` 兩個 key 皆跑完整非法樣本（新增 `"1.0"`）、回應缺 `total`／`droppedCount`／`items` 與 item 缺 `version`／`data` 要失敗；條件式 `if (success)` 斷言改為先斷言 success 再以 `data?.` 取值。補件後重跑 N1、N2、N3、X3、N5、N6、N9、X5、X6 共 9 條存活變異全數轉紅，等價對照 E4（refine 運算元交換）仍綠。
  - 設計選擇：回應 `version` 比照 `api/players.ts` 用 `z.number().int().positive()`；`order` 為 optional 且 schema 不帶預設值（預設 `desc` 由 handler 處理）。

## 3. 後端：歷史讀取 API

Depends on: §2

- [x] 3.1 RED（TDD）：新增 `test/matchmaker-history.test.ts`，spec「登入時歷史以雲端為準」中該檔的全部 7 個 it（以 `matchmaker-fixtures.ts` 的 `seedAndSignIn`／`request()`／`seedHistory` 登入與 seed；刻意損毀的一列以 SQL 直接插入）；
  同時在 `test/expected-user-guard.test.ts` 的 `SAMPLES` 補 `GET /api/matchmaker/history`（B 有歷史 `h0`，放行即會回傳資料）並把 `toHaveLength(13)` 改為 14（檔頭授權）。確認紅燈並貼出輸出；
  **「auth 停用…回 404」預期先綠——點名標 regression guard**；「未登入…回 401」若因 sub-app 的 `requireSession` 先綠，同樣點名；
  守衛的「不符」「缺少或空白」兩個 it 對新樣本預期先綠（sub-app 的 `use("*")` 在路由不存在時仍先回 401），點名標 regression guard；「列舉…一致」應因列舉 13 ≠ 樣本 14 而**真紅**
  - 紅燈紀錄：`matchmaker-history.test.ts` 7 個 it 中 5 個真紅（「B 看不到 A 的歷史且 total 為 0」「預設依 played_at…」「from 含、to 不含…」「from、to 或 order 不合法時回 400」「不合 schema 的歷史列被略過…」，皆為路由不存在而回 404：`expected 404 to be 200`／`expected 404 to be 400`）；`expected-user-guard.test.ts`「列舉出的使用者資料路由恰與守衛樣本表一致」真紅（`expected [ …(13) ] to deeply equal [ …(14) ]`）。
  - **先綠者（regression guard，非 RED）**：`matchmaker-history.test.ts`「auth 停用且無 DB binding 時歷史端點回 404」（路由不存在時也是 404）、「未登入呼叫歷史端點回 401」（sub-app 的 `requireSession` 已先擋）；`expected-user-guard.test.ts`「每條使用者資料路由在預期帳號與 session 不符時…」「缺少或空白的預期帳號標頭使…」（sub-app 的 `use("*")` 在路由不存在時仍先回 401）。機械複驗：`git show <RED commit>^:hono-pickball/src/routes/matchmaker.ts` 不含 `/history`。
  - 授權修改已執行：`SAMPLES` 補 `GET /api/matchmaker/history`、`toHaveLength(13)` → 14；其餘既有 it 名稱與斷言未動。
  - RED 階段 `pnpm --filter ./hono-pickball typecheck`（兩段）exit 0（測試不 import 尚不存在的模組，只靠 HTTP 呼叫）。
- [x] 3.2 GREEN（TDD）：新增 `src/matchmaker/history-repository.ts`（design Decision 2）；`src/routes/matchmaker.ts` 的既有 sub-app 加 `GET /history`（`zValidator("query", …, invalidBodyHook)` 回 400；不另建 sub-app，守衛由既有 `use("*", localAuth, requireSession, requireExpectedUser)` 涵蓋）。
  3.1 全綠（含 `expected-user-guard.test.ts` 全檔）；`pnpm --filter ./hono-pickball typecheck` exit 0
  - 綠燈紀錄：`matchmaker-history.test.ts` 7/7 綠、`expected-user-guard.test.ts` 6/6 綠；`pnpm --filter ./hono-pickball typecheck`（兩段）與 `pnpm -r exec tsc --noEmit` 皆 exit 0。
  - 後端全套（持共用高負載鎖）：`pnpm --filter ./hono-pickball test` 23 檔／164 個 it 全綠。
  - 變異驗證（Implementer 自跑，harness 在 /tmp/b8tools/s3，不入 repo）：共 44 次，40 次預期轉紅且皆轉紅，4 次等價對照（型別標註、`from` 改 truthy 判斷［from=0 與不篩選等價］、`data` 改取 `row.data`、只改註解）如預期仍綠；每次替換前 `count(old)==1`、`git diff --stat` 有輸出、輸出含 `Test Files`，還原後 `git status --porcelain` 與基線一致（皆為空）。
    涵蓋：列表與 total 各自拿掉 `user_id`；`from` 含改 `>`、`to` 不含改 `<=`、`from`／`to` 被忽略、`to` 改 truthy（to=0 被忽略）；desc／asc 次排序各自改 `rowid DESC`、拿掉次排序、主排序方向對調、`order` 被忽略（恆 desc／恆 asc）、預設改 asc；`total` 改為篩選後筆數／恆 0；損毀列改丟出 500／改為刪除／不計入 `droppedCount`／不驗證／`safeParse` 直通；`version` 改 2／加一、`data` 被改、每列重複；`zValidator` 拿掉、`invalidBodyHook` 拿掉、`HistoryQuerySchema` 改回 `z.coerce.number()`（400 it 轉紅）；`/history` 不經 `requireExpectedUser`（守衛「不符」「缺少或空白」兩 it 轉紅）、拿掉 `requireSession`、拿掉 `localAuth`、401 body／狀態碼改錯、停用改 403、`ACCOUNT_MISMATCH` 狀態碼改 403、守衛只擋缺少不擋不符、守衛樣本表的 history 條目拿掉（「列舉…一致」轉紅）、路徑改名。
- [x] 3.3 REFACTOR：逐列驗證與計數是否值得抽成與名單讀取共用的 helper；無壞味道則註記 skipped
  - skipped：名單、回合、分槽的 repository 皆無逐列 `safeParse` 與計數（`grep safeParse|count(` 僅 `history-repository.ts` 命中），只有一個使用端，抽 helper 屬單次使用抽象，無壞味道。

## 4. 前端：歷史 API 包裝、雲端 hook 與歸屬清單

Depends on: §3

- [ ] 4.1 RED（TDD）：新增 `lib/sync/history-api.test.ts`（一個 it；`fetchRemoteHistory(expectedUserId, query)`，斷言 `expectedUserId` 原樣交給 `requestJson`）。確認紅燈
- [ ] 4.2 GREEN（TDD）：新增 `lib/sync/history-api.ts`
- [ ] 4.3 RED（TDD）：新增 `hooks/useRemoteHistory.test.tsx`（四個 it：spec 的三個＋B7.5 交接的「userId 變更時以新帳號重新載入歷史且不顯示前一帳號的歷史」；假時鐘固定 `now`；斷言 `X-Expected-User-Id`）。確認紅燈
- [ ] 4.4 GREEN（TDD）：新增 `hooks/useRemoteHistory.ts`（design Decision 3、7：`{ enabled, userId, range, onUnauthorized }`、擁有者標記、請求序號只採最後一次、`userId` 為 null 視同停用）
- [ ] 4.5 RED（既有守衛）：跑 `hooks/hooksInventory.test.ts`，確認因 `useRemoteHistory` 未列入主 spec 而**真的轉紅**，貼出輸出
- [ ] 4.6 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子原樣搬進主 spec 的對應句，只動這一句（B3／B5～B7 前例）；
  commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useRemoteHistory（B8 §4）`。重跑 4.5 轉綠。archive 時此段 MODIFIED 應為 no-op

## 5. 前端：雲端歷史與統計內容元件

Depends on: §4

- [ ] 5.1 RED（TDD）：新增 `components/matchmaker/RemoteHistoryView.test.tsx`（兩個 it）與 `components/matchmaker/RemoteStatsContent.test.tsx`（一個 it）；mock `useRemoteHistory`、`useRosterStore` 與 `@/hooks/useSession`。確認紅燈
- [ ] 5.2 GREEN（TDD）：新增 `RemoteHistoryView.tsx`、`RemoteStatsContent.tsx`（重用 `HistoryRangeFilter`、`HistoryRecordCard`、`EmptyHistory`、`PlayerStatsTable`、`computePlayerStats`；損毀提示文案與本機逐字相同）

## 6. 前端：資料頁與重置

Depends on: §5

- [ ] 6.1 RED（TDD）：`lib/matchmaker/remote-transfer.test.ts` 改寫 B7 的快照 it 為「雲端備份快照的參賽者、回合與歷史皆取自雲端」並新增「雲端歷史 CSV 以雲端歷史依完成順序產生」「雲端歷史匯出的每個請求帶呼叫端給的帳號且 401 時標示未授權」，
  同檔 B7.5 it「雲端匯入與備份的每個請求都帶呼叫端給的帳號」依檔頭授權調整備份段（預期因呼叫次數 2 而紅，**屬既有 it 隨行為變更而紅，非 RED 證據**，紀錄中分開列）；
  `hooks/useRemoteRosterStore.test.tsx` 改寫為「resetRoster 成功後清空名單且不清除任何本機資料」；`lib/matchmaker/storage.test.ts` 刪除 `resetLocalMatchProgress` 的 it（commit 訊息載明原因與 spec 出處）。確認三個新／改寫的 it 紅燈
- [ ] 6.2 GREEN（TDD）：`remote-transfer.ts`（design Decision 4、7：歷史匯出函式以 `expectedUserId` 為第一參數，401 回既有未授權標示；先判斷三個讀取中有無 401 再判斷其他失敗）；`useRemoteRosterStore` 的重置成功分支不再呼叫任何本機清除；刪除 `resetLocalMatchProgress()`（`rg resetLocalMatchProgress` 無結果）。6.1 全綠

## 7. E2E 與頁面接線

Depends on: §6

- [ ] 7.1 RED（E2E）：新增 `tests/e2e/user-data/history-sync.spec.ts`（`test.use({ storageState })`、skip 條件、`test.beforeEach` 呼叫 `clearTestAccountUserData()`），spec 錨點的全部 6 個 test。
  直接打 API（如讀回雲端歷史）時帶 `expectedUserHeaders()`。
  以單檔執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/history-sync.spec.ts`（前後清殘留 dev server），貼出輸出；先綠者逐一點名標 regression guard
- [ ] 7.2 GREEN（例外層：頁面與 I/O 樣板元件，以 7.1 驗收）：`app/matchmaker/history/page.tsx`、`app/matchmaker/stats/page.tsx` 依 `resolveStorageMode(useSession())` 擇一渲染本機或雲端元件；
  `components/matchmaker/HistoryCsvSection.tsx` 加雲端分支（本機分支不動；以點擊當下 `useSession()` 的 user id 呼叫、失敗顯示訊息不下載、未授權時 `refresh()`）。7.1 全綠；不得以 `waitForTimeout` 取代狀態等待
- [ ] 7.3 REFACTOR：歷史頁與統計頁的模式分支是否值得抽成小元件；無壞味道則註記 skipped

## 8. 文件同步與總驗收

Depends on: §7

- [ ] 8.1 設定層（文件）：`nextjs-pickball/CLAUDE.md` 改寫「歷史讀取待 B8」敘述（登入後歷史、統計、匯出皆讀雲端；區間界線由前端以 `rangeBounds` 計算）、hooks 歸屬加 `useRemoteHistory`、`lib/sync/history-api.ts`；
  `hono-pickball/CLAUDE.md` 路由約定加 `GET /api/matchmaker/history` 與「後端不計算區間（UTC）」說明；design「交接給 B9」三點寫入適當段落
- [ ] 8.2 regression guard（平局）：單獨執行 `lib/matchmaker/player-stats.test.ts` 與 `components/matchmaker/PlayerStatsTable.test.tsx`，貼出 draw-followups 四個 it 皆 passed 的輸出
- [ ] 8.3 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 8.4 驗收（指令）C2：`pnpm lint` 0 errors、warning 不多於基線
- [ ] 8.5 驗收（指令）C3：`pnpm test` 全綠，記錄三個 workspace 的檔數／測試數與基線差異
- [ ] 8.6 驗收（指令）C4：`pnpm build` exit 0
- [ ] 8.7 驗收（指令）C5：`db:generate` 無新檔
- [ ] 8.8 驗收（指令）C6：`.dev.vars` 齊備下，依 test-plan C6 依 project 分開執行（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`；持高負載鎖），前後清殘留 dev server；
  既有 test 全數原樣通過，新增 6 個 test 全 passed，無因缺帳密 skip。結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 8.9 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate matchmaker-history-stats-backend --strict` 通過
