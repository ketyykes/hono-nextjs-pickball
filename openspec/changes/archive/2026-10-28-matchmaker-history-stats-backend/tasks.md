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
- [x] 3.4 RED→GREEN（TDD，apply §3 Stage 2 追加，design Open Questions 6）：新增 it「data 不是合法 JSON 的歷史列同樣被略過並計數而不使端點失敗」（預期 500 → 真紅）；
  `history-repository.ts` 以 `sql` 片段取 `data` 原始文字、`try { JSON.parse }` 失敗即計入 `droppedCount`，再交給 `MatchHistoryEntrySchema.safeParse`（不刪除、不改寫）。commit 分 `test:`／`feat:`
  - 紅燈紀錄（真紅，commit `8984613`）：單檔 `test --run test/matchmaker-history.test.ts`，新 it 失敗 `AssertionError: expected 500 to be 200`，`Tests 1 failed | 7 passed (8)`；既有 7 個 it 未動。成因：drizzle json mode 在 `mapFromDriverValue` 直接 `JSON.parse`。複驗：`git show 8984613^:hono-pickball/src/matchmaker/history-repository.ts` 以 `db.select()` 讀 `data`。
  - 綠燈紀錄（`feat:` GREEN commit）：同檔 8/8 綠；`pnpm --filter ./hono-pickball typecheck`（兩段）與 `pnpm -r exec tsc --noEmit` 皆 exit 0。
  - 變異驗證（Implementer 自跑，harness 在 /tmp/b8tools/s34，不入 repo）：共 11 次，9 次預期轉紅且皆轉紅、2 次等價對照（`raw` 加初始化、`catch` 綁定變數）如預期仍綠；每次替換前 `count(old)==1`、`new != old`、`git diff --stat` 有輸出、輸出含 `Test Files`，還原後 `git status --porcelain` 為空。
    涵蓋：拿掉 try/catch（500）；catch 內不計數；catch 內把壞列放進 items；catch 內計數後丟錯；catch 內不 continue（落入 safeParse 重複計數）；catch 內刪除該列；`rawData` 改回直接讀 drizzle json 欄位（5 個 it 轉紅）；`JSON.parse` 失敗時回空 items——以上除 `rawData` 外皆僅新 it 轉紅；另 safeParse 失敗不計數僅既有「不合 schema 的歷史列…」轉紅（既有損毀列 it 仍有效）。
- [x] 3.3 REFACTOR：逐列驗證與計數是否值得抽成與名單讀取共用的 helper；無壞味道則註記 skipped
  - skipped：名單、回合、分槽的 repository 皆無逐列 `safeParse` 與計數（`grep safeParse|count(` 僅 `history-repository.ts` 命中），只有一個使用端，抽 helper 屬單次使用抽象，無壞味道。

## 4. 前端：歷史 API 包裝、雲端 hook 與歸屬清單

Depends on: §3

- [x] 4.1 RED（TDD）：新增 `lib/sync/history-api.test.ts`（一個 it；`fetchRemoteHistory(expectedUserId, query)`，斷言 `expectedUserId` 原樣交給 `requestJson`）。確認紅燈
  - 紅燈紀錄（commit `edbe859`）：shell 原始輸出隨前一任 session 遺失，以 RED／GREEN 分開的 commit 作證；commit 訊息載有當時摘要：整檔載入失敗（`Failed to resolve import ./history-api`，`Test Files 1 failed`），1 個 it 無法執行，無先綠者。
    機械複驗（2026-10-28 leader）：`git cat-file -e edbe859:nextjs-pickball/lib/sync/history-api.test.ts` 存在且 `import { fetchRemoteHistory } from "./history-api"`；`edbe859^` 與 `edbe859` 皆無 `lib/sync/history-api.ts`。
- [x] 4.2 GREEN（TDD）：新增 `lib/sync/history-api.ts`
  - 綠燈紀錄（commit `d47f318`）：2026-10-28 重跑單檔 `history-api.test.ts` 1/1 綠。
- [x] 4.3 RED（TDD）：新增 `hooks/useRemoteHistory.test.tsx`（四個 it：spec 的三個＋B7.5 交接的「userId 變更時以新帳號重新載入歷史且不顯示前一帳號的歷史」；假時鐘固定 `now`；斷言 `X-Expected-User-Id`）。確認紅燈
  - 紅燈紀錄（commit `1256905`）：shell 原始輸出隨前一任 session 遺失，以 RED／GREEN 分開的 commit 作證；commit 訊息載有當時摘要：整檔載入失敗（`Failed to resolve import ./useRemoteHistory`），4 個 it 皆無法執行，無先綠者。
    機械複驗（2026-10-28 leader）：`1256905:nextjs-pickball/hooks/useRemoteHistory.test.tsx` 含四個 it（名稱與 spec 錨點逐字一致）且 `import { useRemoteHistory } from "./useRemoteHistory"`；`1256905^` 與 `1256905` 皆無 `hooks/useRemoteHistory.ts`。
- [x] 4.4 GREEN（TDD）：新增 `hooks/useRemoteHistory.ts`（design Decision 3、7：`{ enabled, userId, range, onUnauthorized }`、擁有者標記、請求序號只採最後一次、`userId` 為 null 視同停用）
  - 綠燈紀錄（commit `d3f7be3`）：2026-10-28 重跑單檔 `useRemoteHistory.test.tsx` 綠；四個檔逐檔 eslint exit 0。
  - regression guard（commit `25f1215`，加入即綠，非 RED）：it「regression guard：enabled 由 false 改為 true 時開始載入，onUnauthorized 以最新的函式呼叫」——前一任 mutation 發現主 effect 依賴拿掉 `enabled`、`onUnauthorizedRef` 不更新兩條變異存活而補；既有 4 個 it 未動。
  - §4 Stage 2 補件（commit `9464cad`，regression guard，加入即綠，非 RED）：四個 it「regression guard：五個區間的請求界線皆等於 rangeBounds 且無界的一端不送出」「regression guard：換帳號的每一次 render 的 droppedCount 皆為 0，不沿用前一帳號的損毀筆數」「regression guard：userId 變為 null、停用或卸載後才到達的 401 不呼叫 onUnauthorized」「regression guard：401 之後 syncStatus 維持 loading」；`useRemoteHistory.ts` 未改，既有 it 只動兩行 import（新增匯入名稱）。單檔 9/9 綠。
- [x] 4.5 RED（既有守衛）：跑 `hooks/hooksInventory.test.ts`，確認因 `useRemoteHistory` 未列入主 spec 而**真的轉紅**，貼出輸出
  - **4.6 commit 前未留存紅燈輸出**（前一任 session 因關機中斷，輸出遺失；4.6 已 commit，無法再自然重現，且不得改回主 spec 偽造紅燈）。
    佐證：`git show f46b053^:openspec/specs/pickleball-guide-page/spec.md | grep -c useRemoteHistory` 為 0，而 `d3f7be3` 起 `hooks/useRemoteHistory.ts` 已存在——同步前守衛「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」的前提必然不成立。
- [x] 4.6 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子原樣搬進主 spec 的對應句，只動這一句（B3／B5～B7 前例）；
  commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useRemoteHistory（B8 §4）`。重跑 4.5 轉綠。archive 時此段 MODIFIED 應為 no-op
  - 完成（commit `f46b053`）：主 spec diff 僅該一句（+1／−1，插入 `` `useRemoteHistory` → match-history ``）。2026-10-28 重跑 `hooksInventory.test.ts` 綠（與 history-api、useRemoteHistory 合跑 3 檔／8 tests passed）。

## 5. 前端：雲端歷史與統計內容元件

Depends on: §4

- [x] 5.1 RED（TDD）：新增 `components/matchmaker/RemoteHistoryView.test.tsx`（兩個 it）與 `components/matchmaker/RemoteStatsContent.test.tsx`（一個 it）；mock `useRemoteHistory`、`useRosterStore` 與 `@/hooks/useSession`。確認紅燈
  - 紅燈紀錄（真紅，commit `304a507`）：兩檔合跑 `Test Files 2 failed (2)`、`Tests no tests`，原因 `Failed to resolve import "./RemoteHistoryView"`／`"./RemoteStatsContent"`；三個 it 皆無法執行，無先綠者。機械複驗：`git show 304a507^:nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx`／`RemoteStatsContent.tsx` 皆不存在。
- [x] 5.2 GREEN（TDD）：新增 `RemoteHistoryView.tsx`、`RemoteStatsContent.tsx`（重用 `HistoryRangeFilter`、`HistoryRecordCard`、`EmptyHistory`、`PlayerStatsTable`、`computePlayerStats`；損毀提示文案與本機逐字相同）
  - 綠燈紀錄（commit `36fc099`）：3 個 it 轉綠；前端全套（持鎖）104 檔／1039 tests 綠；`pnpm -r exec tsc --noEmit` exit 0；四檔 eslint exit 0；本機元件與 `app/`、`player-stats.ts` 對 main 零 diff。
  - 變異驗證（Implementer 自跑，harness 在 /tmp/b8tools/s5，不入 repo）：46 次；第一輪 33 條存活 → commit `159e51e` 補 regression guard（加入即綠，非 RED：hook 參數、userId 推導、區間傳遞、歷史／名單的 loading 與 load-failed、data-sync-status、平局計為和局、不掛 useRoundStore）→ 40 條非等價全紅、6 條等價對照綠。
  - Stage 2 補件（commit `759b548`，regression guard，加入即綠，非 RED）：紀錄卡片各自渲染且保留後端順序、損毀提示 class 與本機相同、切換區間後篩選選取狀態、狀態優先序（名單阻斷優先、非阻斷取歷史）、`local` 狀態的 data-sync-status、`total === 0` 時不顯示篩選、`total` 5 而 `items` 空時名單成員出場 0。既有 it 只動 import 與 `buildEntry` 加選用參數。兩檔 29/29 綠。
  - REFACTOR：skipped（`useSession → userId` 接線只有兩處，不抽共用）。

## 6. 前端：資料頁與重置

Depends on: §5

- [x] 6.1 RED（TDD）：`lib/matchmaker/remote-transfer.test.ts` 改寫 B7 的快照 it 為「雲端備份快照的參賽者、回合與歷史皆取自雲端」並新增「雲端歷史 CSV 以雲端歷史依完成順序產生」「雲端歷史匯出的每個請求帶呼叫端給的帳號且 401 時標示未授權」，
  同檔 B7.5 it「雲端匯入與備份的每個請求都帶呼叫端給的帳號」依檔頭授權調整備份段（預期因呼叫次數 2 而紅，**屬既有 it 隨行為變更而紅，非 RED 證據**，紀錄中分開列）；
  `hooks/useRemoteRosterStore.test.tsx` 改寫為「resetRoster 成功後清空名單且不清除任何本機資料」；`lib/matchmaker/storage.test.ts` 刪除 `resetLocalMatchProgress` 的 it（commit 訊息載明原因與 spec 出處）。確認三個新／改寫的 it 紅燈
  - 紅燈紀錄（真紅，commit `88c46de`）：三檔合跑 5 failed／60 passed。RED 證據 4 個 it：「雲端備份快照的參賽者、回合與歷史皆取自雲端」（history 取到本機 `m-3`、預期雲端 `c-4`，且只發 2 個 GET）；「雲端歷史 CSV 以雲端歷史依完成順序產生」（`TypeError: buildRemoteHistoryCsv is not a function`）；「雲端歷史匯出的每個請求帶呼叫端給的帳號且 401 時標示未授權」（備份只有 2 個帶帳號的 GET，預期 3）；「resetRoster 成功後清空名單且不清除任何本機資料」（`expected null to be 'x'`，舊實作移除 `matchmaker:history:v1`）。無先綠者。
    機械複驗：`git show 88c46de^:nextjs-pickball/lib/matchmaker/remote-transfer.ts` 不含 `buildRemoteHistoryCsv`；Stage 2 另把三個產品檔暫換回 88c46de 版本、跑 HEAD 測試，重現同樣 5 failed。
  - **既有 it 隨行為變更而紅（非 RED 證據）**：B7.5「雲端匯入與備份的每個請求都帶呼叫端給的帳號」（called 2 times，預期 3）；依檔頭授權只改備份段三處，匯入段一字不動。
  - `storage.test.ts` 刪除兩個 it：檔頭點名的「resetLocalMatchProgress 只移除本機歷史…」，以及同函式的「resetLocalMatchProgress 在沒有 localStorage 的環境（SSR）不拋例外」——後者只呼叫已刪除的函式，留著無法編譯，依 design Decision 5「刪除函式與其 it」一併刪除（Stage 1 判定與授權一致）。
- [x] 6.2 GREEN（TDD）：`remote-transfer.ts`（design Decision 4、7：歷史匯出函式以 `expectedUserId` 為第一參數，401 回既有未授權標示；先判斷三個讀取中有無 401 再判斷其他失敗）；`useRemoteRosterStore` 的重置成功分支不再呼叫任何本機清除；刪除 `resetLocalMatchProgress()`（`rg resetLocalMatchProgress` 無結果）。6.1 全綠
  - 綠燈紀錄（commit `a8a2380`）：三檔 65 tests 綠；前端全套（持鎖）104 檔／1049 tests 綠；`pnpm -r exec tsc --noEmit` exit 0；`rg resetLocalMatchProgress nextjs-pickball` 無輸出（exit 1）；本機路徑（`backup.ts`、`transfer-storage.ts`、`history-csv.ts`、`round-storage.ts`、`HistoryView.tsx`）對 main 零 diff。
    同 commit 改 `nextjs-pickball/CLAUDE.md` 三處移除對已刪函式的敘述（否則 `rg … nextjs-pickball` 會命中該檔），其餘「歷史讀取待 B8」敘述留給 8.1。
  - 變異驗證（Implementer 自跑，/tmp/b8tools/s6）：47 次，43 條非等價全紅、4 條等價對照綠。Stage 2（opus，58 條）發現名單與回合交叉時「401 先於其他失敗」兩條存活 → commit `256b6f4` regression guard（加入即綠，非 RED）「regression guard：名單與回合交叉時 401 先於其他失敗判斷」→ 複審 PASS。
  - REFACTOR：skipped（無壞味道）。

## 7. E2E 與頁面接線

Depends on: §6

- [x] 7.1 RED（E2E）：新增 `tests/e2e/user-data/history-sync.spec.ts`（`test.use({ storageState })`、skip 條件、`test.beforeEach` 呼叫 `clearTestAccountUserData()`），spec 錨點的全部 6 個 test。
  直接打 API（如讀回雲端歷史）時帶 `expectedUserHeaders()`。
  以單檔執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/history-sync.spec.ts`（前後清殘留 dev server），貼出輸出；先綠者逐一點名標 regression guard
  - 紅燈紀錄（真紅，commit `ef1bd62`，持鎖單檔 user-data）：6 failed／0 passed，無先綠者。原因：歷史頁與統計頁從未發出 `GET /api/matchmaker/history`（`waitForResponse` 逾時，兩條唯讀 test）；本機 `HistoryView` 無 `data-sync-status="synced"`；本機元件不顯示雲端錯誤文案；統計頁讀本機歷史、排行榜 0 列；CSV 內容為本機訪客歷史。
    第一版平局 test 的比分文字斷言寫錯（實為 `9:9平手`），於 commit 前修正為 `toContainText` 後才取得行為紅燈（Stage 1 判定為誠實揭露）。機械複驗：`ef1bd62^` 無該 spec；`ef1bd62^` 的歷史頁只渲染 `HistoryView`、`HistoryCsvSection` 無雲端分支；`ef1bd62` 與 `f139623` 之間 spec 未變。
- [x] 7.2 GREEN（例外層：頁面與 I/O 樣板元件，以 7.1 驗收）：`app/matchmaker/history/page.tsx`、`app/matchmaker/stats/page.tsx` 依 `resolveStorageMode(useSession())` 擇一渲染本機或雲端元件；
  `components/matchmaker/HistoryCsvSection.tsx` 加雲端分支（本機分支不動；以點擊當下 `useSession()` 的 user id 呼叫、失敗顯示訊息不下載、未授權時 `refresh()`）。7.1 全綠；不得以 `waitForTimeout` 取代狀態等待
  - 綠燈紀錄（commit `f139623`）：歷史頁新增 client 元件 `HistoryModeSwitch`（page 維持 server component）；統計頁本機內容原樣搬到 `LocalStatsContent.tsx`（`git show -M -C` 辨識為 copy、similarity 98%，只改檔頭路徑註解與匯出名稱）；`HistoryCsvSection` 加雲端分支（本機分支零刪除行）。
    history-sync 6 passed；`--project=user-data` 全部 40 passed；chromium 訪客迴歸（matchmaker-history、player-stats、matchmaker-data-transfer、matchmaker-local-mode）40 passed；前端單元 104 檔／1050 綠；tsc exit 0。
    偏差：`RemoteStatsContent.tsx`（§5）非阻擋分支加 h1「球員統計」與說明句——既有 E2E `roster-sync.spec.ts`「雲端名單載入失敗時對戰頁與統計頁以錯誤提示取代內容」要求載入失敗時標題不存在，標題放在 page 會殘留（第一次跑 user-data 39 passed／1 failed 即此，移入元件後 40 passed）。§5 單元測試未改、仍綠。Stage 1 判定合理。
    OQ2 實測：名單 `load-failed` 優先，`SyncStatusNotice` 取代內容（含標題），`data-sync-status="load-failed"`。
  - 變異驗證：Implementer 8 次（頁面本機也渲染雲端元件兩頁皆紅、雲端內容掛 `useRoundStore` 紅、CSV 雲端分支讀本機紅、固定 user id 紅、兩頁反向皆紅；2 條等價對照綠）。Stage 2（opus）獨立 22 次：非等價存活 M7（失敗仍下載）、M10（未授權不 `refresh()`）、M14（雲端統計標題消失）、M17（未切回今日）→ leader 依「每個 401／授權分支都要有會轉紅的變異」列為必修 → commit `13a20d3`（`HistoryCsvSection.test.tsx` 4 個 regression guard，加入即綠、非 RED）、`3f8d690`（平局 test 內新增 h1 斷言、`switchThroughAllRanges` 最後切回今日；test 名稱與原有斷言不變）→ 複審 PASS（四條皆紅、M9 與兩條等價對照綠）。
- [x] 7.3 REFACTOR：歷史頁與統計頁的模式分支是否值得抽成小元件；無壞味道則註記 skipped
  - skipped：歷史頁分支已是 15 行的 `HistoryModeSwitch`，統計頁分支為 page 內 20 行，無重複可抽。

## 8. 文件同步與總驗收

Depends on: §7

- [x] 8.1 設定層（文件）：`nextjs-pickball/CLAUDE.md` 改寫「歷史讀取待 B8」敘述（登入後歷史、統計、匯出皆讀雲端；區間界線由前端以 `rangeBounds` 計算）、hooks 歸屬加 `useRemoteHistory`、`lib/sync/history-api.ts`；
  `hono-pickball/CLAUDE.md` 路由約定加 `GET /api/matchmaker/history` 與「後端不計算區間（UTC）」說明；design「交接給 B9」三點寫入適當段落
  - 完成（commit `10b91ee`）：`nextjs-pickball/CLAUDE.md`（`/matchmaker/data` 登入態、歷史頁與統計頁的模式分支、儲存分流段改寫為登入後歷史以雲端為準、交接給 B9 三點、hooks 歸屬 `useRemoteHistory`、`lib/sync/history-api.ts`、新元件）；`hono-pickball/CLAUDE.md`（範圍例外、守衛樣本 13→14、路由約定新增歷史讀取 API 與「後端不計算區間（UTC）」、後續 change 須知改寫並新增交接給 B9）。`rg resetLocalMatchProgress nextjs-pickball` 無輸出（exit 1）；函式名僅出現在 `hono-pickball/CLAUDE.md`「後續 change 須知」第 1 點與第 5 點（交接給 B9）③，不在 `rg` 的搜尋範圍內。§8 Stage 1（sonnet）PASS；依其建議修正該檔「見上方」為「見下方」。
- [x] 8.2 regression guard（平局）：單獨執行 `lib/matchmaker/player-stats.test.ts` 與 `components/matchmaker/PlayerStatsTable.test.tsx`，貼出 draw-followups 四個 it 皆 passed 的輸出
  - 輸出（`test --run lib/matchmaker/player-stats.test.ts components/matchmaker/PlayerStatsTable.test.tsx --reporter=verbose`，2 檔／27 passed）：
    `✓ player-stats.test.ts > computePlayerStats > 出場數、勝場與敗場依歷史紀錄正確加總`、`✓ … > 平局紀錄計為和局而非雙方各一敗場`、`✓ … > 出場數為零時勝率為零而非 NaN`、`✓ PlayerStatsTable.test.tsx > PlayerStatsTable > 勝負和欄依序顯示勝場敗場與和局三個數字`。
- [x] 8.3 驗收（指令）C1：三段 typecheck 皆 exit 0
  - `pnpm -r exec tsc --noEmit`、`hono-pickball typecheck`（兩段）、`packages/pickball-core typecheck`（兩段）皆 exit 0。
- [x] 8.4 驗收（指令）C2：`pnpm lint` 0 errors、warning 不多於基線
  - `pnpm lint`（持鎖）exit 0：0 errors／3 warnings（`useQuiz.ts:33`、`useRosterStore.ts:130`、`useScoreboardStore.ts:50` 的 no-unused-vars），與基線相同。
- [x] 8.5 驗收（指令）C3：`pnpm test` 全綠，記錄三個 workspace 的檔數／測試數與基線差異
  - `pnpm test`（持鎖）exit 0：前端 105 檔／1054（基線 100／1010，+5／+44）；後端 23 檔／165（基線 22／157，+1／+8）；核心 8 檔／16（基線 6／13，+2／+3）。
- [x] 8.6 驗收（指令）C4：`pnpm build` exit 0
  - `pnpm build`（持鎖）exit 0：前端 Compiled successfully、12/12 靜態頁；後端 `tsc --noEmit && wrangler deploy --dry-run`（Total Upload 2420.92 KiB／gzip 405.47 KiB，`--dry-run: exiting now.`）。
- [x] 8.7 驗收（指令）C5：`db:generate` 無新檔
  - `db:generate`：「No schema changes, nothing to migrate」；`git status --porcelain hono-pickball/drizzle` 為空。
- [x] 8.8 驗收（指令）C6：`.dev.vars` 齊備下，依 test-plan C6 依 project 分開執行（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`；持高負載鎖），前後清殘留 dev server；
  既有 test 全數原樣通過，新增 6 個 test 全 passed，無因缺帳密 skip。結果寫在本 task 後方；失敗不得自行判定為雜訊
  - 結果（2026-10-28，HEAD `10b91ee` 的程式碼；每次 run 各自持鎖、load 4.2～9.0、前後清殘留）：`--list` 五個 browser project 各 145（17 檔）與基線相符，user-data 40（5 檔）＝基線 34＋6。
    chromium 145 passed；firefox 133 passed／12 skipped；mobile-chrome 143 passed／2 skipped；user-data 40 passed；webkit 1/3 44＋5 skip、2/3 41＋7 skip、3/3 48；mobile-safari 1/3 44＋5 skip、2/3 41＋7 skip、3/3 48。**全部 failed 0、flaky 0**；webkit `quiz.spec.ts:49` 亦 passed。
    skip 皆為 spec 內既有的「只在 chromium 跑一次」條件（api-health 2、auth-proxy 2、auth-session 1、navbar-rwd 7），無因缺帳密 skip；chromium 的 auth-proxy 兩條 passed。
    `history-sync.spec.ts` 6 個 test 全 passed（登入時瀏覽歷史頁只發出 GET 且不改動本機歷史／登入後完成的對戰由雲端顯示在歷史頁且不寫入本機／雲端歷史載入失敗時歷史頁顯示錯誤提示／登入時計時回合的平局在統計頁計為和局／登入時瀏覽統計頁只發出名單與歷史的讀取請求／登入時歷史 CSV 匯出的內容來自雲端）；既有 34 個 user-data test 原樣通過。
- [x] 8.9 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate matchmaker-history-stats-backend --strict` 通過
  - `DO_NOT_TRACK=1 openspec validate matchmaker-history-stats-backend --strict`（repo root）：`Change 'matchmaker-history-stats-backend' is valid`，exit 0。

## 8A. Final Code Review 必修 M1：空區間（leader 追加，比照 3.4）

Depends on: §8（Final Code Review 結果見 design Open Questions 13）

- [x] 8.10 RED（TDD）：核心 `test/matchmaker/history-range-bounds.test.ts` 新增 it「rangeBounds 產生的每個區間界線皆通過 HistoryQuerySchema」（沿用檔內 now 樣本，含週一與跨月週）；
  後端 `test/matchmaker-history.test.ts` 新增 it「from 等於 to 時回 200、items 為空且 total 為全部筆數」；核心 `test/api/history.test.ts` 本 change 新增的 it 改名為「HistoryQuerySchema 拒絕 from 大於 to 且 HistoryListResponseSchema 接受平局紀錄」，`{ from: "0", to: "0" }` 的斷言改為通過並補一條 `{ from: "1", to: "0" }` 失敗（該 it 為本 change §2 新增，非 main 既有 it）。各自單檔實跑貼紅燈
  - 完成（commit `bdeb124`）：三個變動皆真紅，無 regression guard。核心 `history-range-bounds.test.ts`（3 tests／1 failed）：`AssertionError: now=2026-08-01T02:30:00.000Z range=thisMonth query={"from":"1785081600000","to":"1785081600000"}: expected false to be true`；
    核心 `api/history.test.ts`（1 failed）：`test/api/history.test.ts:33`（`{ from: "100", to: "100" }` 斷言改為 true 處）`expected false to be true`（同一個 it 先在 100／100 失敗，後面的 `"0","0"` 與 `"1","0"` 斷言因此尚未執行；為補齊契約一併把 100／100 由 false 改 true，否則 GREEN 後與放寬後的行為矛盾）；
    後端 `matchmaker-history.test.ts`（9 tests／1 failed）：`× from 等於 to 時回 200、items 為空且 total 為全部筆數`，`AssertionError: expected 400 to be 200`。
- [x] 8.11 GREEN（TDD）：`packages/pickball-core/src/api/history.ts` 的 refine 改為 `from <= to`（含 JSDoc 與錯誤訊息）；三檔單檔綠、後端與核心全套綠（持鎖）、三段 typecheck exit 0
  - 完成（commit `32a3c0a`）：`src/api/history.ts` refine 改 `from <= to`，JSDoc 與錯誤訊息改為「from 不得大於 to」（`rg "from 必須小於 to"` 全 repo 無其他引用）。三檔單檔綠（核心 3／1 tests、後端 9 tests）；
    持鎖全套：後端 23 檔／166（原 165，+1）、核心 8 檔／17（原 16，+1）；`pnpm -r exec tsc --noEmit`、hono typecheck、core typecheck 皆 exit 0；鎖已 release。REFACTOR skipped（無壞味道）。
    變異驗證（harness 在 /tmp，不入 repo；每條皆過 `src.count(old)==1`、`new != old`、`git diff --stat` 有輸出，還原後 `git status --porcelain` 為空）：
    改回 `<`：range-bounds 紅、api/history 紅；改 `>=`：range-bounds 紅、api/history 紅；拿掉 refine 條件（改為 `true`）：range-bounds 綠、api/history 紅（`from=300&to=200` 擋不住）；等價對照（只改錯誤訊息）：兩檔皆綠。
- [x] 8.12 設定層（文件）：`hono-pickball/CLAUDE.md` 的「同時給兩者時 `from` 必須小於 `to`」「`from >= to`」改為不大於／`from > to`；`openspec validate --strict` 通過
  - 完成（commit `e0cbcb9`）：`hono-pickball/CLAUDE.md` 改為「`from` 不得大於 `to`（相等為合法的空區間…）」與「`from > to`」；`rg "from < to|from >= to|小於 .?to"` 於兩份 CLAUDE.md 與核心 `src` 無輸出（exit 1）；`DO_NOT_TRACK=1 openspec validate matchmaker-history-stats-backend --strict` 通過。
