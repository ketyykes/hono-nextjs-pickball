# Design: matchmaker-history-stats-backend

## Context

- 前提：B4～B7 已合併並 archive。B7 建立 `matchmaker_history(user_id, match_id PK, played_at ms, data, version=1, updated_at)`，由送出比分的 batch 寫入；
  雲端模式的 `useRemoteRoundStore` 的 `history` 恆為空陣列；`resetLocalMatchProgress()` 只剩清本機歷史（B7 過渡）。
- 歷史頁：`app/matchmaker/history/page.tsx` → `HistoryView`（effect 內 `readHistory()`＋`new Date()`，`filterHistoryByRange`，`droppedCount` 提示，`EmptyHistory range={null|range}`）。
- 統計頁：`useRosterStore`＋`useRoundStore().history` → `computePlayerStats(filterHistoryByRange(...), players)`；`history.length === 0` 時引導型空狀態。
- 資料頁：`JsonBackupSection` 雲端分支經 `buildRemoteBackupSnapshot()`（B7：players／currentRound 雲端、history 本機）；`HistoryCsvSection` 以 `readSnapshot().history`＋`historyToCsv`。
- 核心 `history-range.ts`：`computeRangeCutoffs(now)` 以 `new Date(y, m, d)` 取**本地時區**的日／週／月起點；`rangeOfTime(time, now)`；`filterHistoryByRange`（以穩定排序依時間由新到舊）。

## Goals

- 登入時歷史頁、統計頁、歷史 CSV、JSON 匯出的 `history` 讀雲端；行為（排序、區間、空狀態、損毀提示、平局統計）與本機一致。
- 區間定義仍只有一份實作；不因伺服器時區產生偏移。
- 刪除過渡函式 `resetLocalMatchProgress()`。

## Non-Goals

- 歷史寫入 API（只增不改）；後端統計；分頁；匯入（B9）。

## Decisions

### Decision 1：區間界線由前端以核心 `rangeBounds` 計算，API 收毫秒界線

**Choice**：核心新增 `rangeBounds(range, now) → { from, to }`（以 `computeRangeCutoffs` 的 `c0..c3` 組出半開區間）；`GET /api/matchmaker/history?from=&to=` 以 `played_at` 篩選。

**Rationale**：
- Context7（`/cloudflare/cloudflare-docs`，`workers/local-development` 與 `wrangler/commands/workers#dev`）：「The local workerd runtime runs with `TZ=UTC` … matching the production Cloudflare runtime」——
  伺服器上 `new Date(y, m, d)` 是 UTC 午夜，台灣使用者的「今日」會從早上 8 點才開始。
- 讓後端接 `range` 再另收時區參數，等於在後端重寫一份切點計算（且 Workers 的 `Intl` 時區支援範圍需要另外查證）；前端算毫秒界線則切點只有核心一份實作。
- `rangeBounds` 與 `rangeOfTime` 的等價以屬性式樣本測試守住（含切點前後 1 毫秒、跨月週）。

**Alternatives considered**：
- `?range=today&tz=Asia/Taipei`：後端需依時區計算週一與月初，與核心 `computeRangeCutoffs` 成為兩份實作。不選。
- 一次取回全部歷史、前端沿用 `filterHistoryByRange`：最簡單，但每切一次區間都傳全部資料，且 `total` 與 `droppedCount` 仍要另算。歷史是持續累積的資料，不選；
  匯出功能則確實需要全部（`order=asc`、不帶界線）。

### Decision 2：排序與 `total`、`droppedCount`

**Choice**：`desc` = `ORDER BY played_at DESC, rowid ASC`；`asc` = `ORDER BY played_at ASC, rowid ASC`。`total` = `SELECT COUNT(*) … WHERE user_id = ?`（不受界線影響）。
讀出後逐列 `MatchHistoryEntrySchema.safeParse`，失敗者略過並計數，不刪除。

**Rationale**：
- `filterHistoryByRange` 以穩定排序把同時間的紀錄維持在追加順序；`rowid ASC` 是雲端的追加順序（B7 以插入順序保存），兩者結果相同。
- `total` 讓前端區分「完全沒有歷史」（引導型空狀態）與「此區間沒有」（區間空狀態），對應既有 `EmptyHistory` 的兩種 `range`。
- 本機的逐筆降級會「回寫清理」；雲端不刪：寫入前已驗證，損毀只可能來自未來的 schema 變更，保留原列才有機會以新版 schema 救回。

### Decision 3：前端——`useRemoteHistory` 與雲端內容元件，本機元件不動

**Choice**：`hooks/useRemoteHistory.ts`（只採用最後一次請求：以遞增的請求序號比對）；`components/matchmaker/RemoteHistoryView.tsx`、`RemoteStatsContent.tsx`；
兩個頁面以 `resolveStorageMode(useSession())` 擇一渲染本機或雲端元件。`RemoteStatsContent` 只掛 `useRosterStore` 與 `useRemoteHistory`，不掛 `useRoundStore`。

**Rationale**：React hooks 不能條件呼叫；把雲端路徑放進獨立元件，本機的 `HistoryView` 與統計頁本機內容一行不動，訪客零迴歸可由 `git diff` 直接證明。
統計頁不再掛回合 store，也順便消除「看統計卻讀回合與分槽」的多餘請求（`player-stats` 唯讀保證 MODIFIED）。

**Alternatives considered**：在 `HistoryView` 內加分支：需要同時呼叫本機 effect 與雲端 hook 並以 `enabled` 關閉其中一個，本機元件被改動。不選。

### Decision 4：資料頁改讀雲端歷史

**Choice**：`remote-transfer.ts` 新增 `fetchRemoteHistoryForExport()`（`order=asc`）與 `buildRemoteHistoryCsv()`；`buildRemoteBackupSnapshot()` 的 `history` 改取雲端；
`HistoryCsvSection` 依模式分支（本機分支不動）。

**Rationale**：匯出要的是「全部、完成順序」，與本機 `matchmaker:history:v1` 的追加順序一致，`historyToCsv`／`buildBackup` 不需要任何改動。

### Decision 5：刪除 `resetLocalMatchProgress()`

**Choice**：雲端重置成功後不清除任何本機 key；刪除函式與其 it（B7 改寫過的那個）。

**Rationale**：B8 起雲端模式完全不讀寫本機的名單、回合、分槽與歷史；本機資料只剩「訪客時期的資料」一種意義，是 B9 匯入的來源，不應因登入時的重置而消失。

### Decision 6：核心 `api/history.ts`

**Choice**：`HistoryQuerySchema`（`from`／`to` 以 `z.string().regex(/^\d+$/)` 轉數字並要求安全整數——apply §1 實測 `z.coerce.number()` 對空字串得 0，見查證紀錄；`order` 列舉、`from <= to` 的 refine——`from === to` 為合法空區間，見 Open Questions 13）、`HistoryListResponseSchema`；`CORE_MODULES` 加一項。

### Decision 7：對齊 B7.5 預期帳號守衛（apply §1 追加）

**Choice**：
- 後端：`GET /history` 加在既有 matchmaker sub-app，沿用 `use("*", localAuth, requireSession, requireExpectedUser)`；`test/expected-user-guard.test.ts` 的 `SAMPLES` 補一條、列舉數 13 → 14（授權修改既有 it 的一個數字）。
- 前端包裝：`fetchRemoteHistory(expectedUserId, query)`。
- hook：`useRemoteHistory({ enabled, userId, range, onUnauthorized })`；主 effect 依賴含 `userId`；以 `useReducer` 保存 `{ owner, items, total, droppedCount, syncStatus }`，render 時 `owner !== userId` 回傳空結果與 `loading`；
  請求序號（`ref` 遞增）只採用最後一次；effect cleanup 設 `cancelled`，舊世代或舊 range 的結果不 dispatch。`enabled && userId !== null` 才請求。
- 雲端內容元件：`RemoteHistoryView`、`RemoteStatsContent` 自行 `useSession()` 取 user id 與 `refresh`（比照選擇器 hook 的接線）；元件測試 mock `@/hooks/useSession`。
- 一次性操作：`buildRemoteBackupSnapshot(expectedUserId)` 三個 GET 用同一個 id；`buildRemoteHistoryCsv(expectedUserId)` 回 `{ ok: true, csv } | RemoteTransferFailure`；
  401 回既有 `unauthorizedFailure()`（先檢查所有讀取有無 401，再檢查其他失敗——使 B7.5 的「遇到 401 時標示未授權」it 不需改動）；`HistoryCsvSection` 雲端分支以點擊當下的 user id 呼叫、失敗顯示訊息、未授權時 `refresh()`。
  CSV 失敗訊息新增 `REMOTE_TRANSFER_MESSAGES.historyCsvFetchFailed`；備份快照的歷史讀取失敗沿用 `backupFetchFailed`（其文案只提「參賽者名單」為 B7 既有的不精確，列後續，不在本 change 改）。

**Rationale**：B7.5 design「交接給 B8／B9」逐條要求；`user-data-sync`「雲端 store 以登入帳號為界」已以「之後的 change 新增者」涵蓋本 change 的 hook 與一次性操作，故只在 `match-history`／`data-transfer` 補 Scenario，不 MODIFIED `user-data-sync`。

**Alternatives considered**：MODIFIED `user-data-sync`「雲端 store 以登入帳號為界」把 `useRemoteHistory` 列入清單——需逐字帶入 12 個 Scenario，與 B9 撞同一條，且該 Requirement 已寫明「之後的 change 新增者」。不選。

## Risks / Trade-offs

- [Risk] 單一使用者的歷史筆數成長後，匯出（不帶界線）一次回傳全部 → 以千筆計約數百 KB，在 Worker 回應與前端記憶體的合理範圍內；若日後超過，再加分頁（不影響本 change 的契約，`order` 已固定）。
- [Risk] `playedAt` 自 B7 起為伺服器時間；B9 匯入的本機歷史則是裝置時間——兩者混在同一張表中排序，若裝置時鐘偏差很大，排序會與實際先後不同。屬資料本身的限制，不處理。
- [Risk] `range` 快速切換的競態 → 只採用最後一次請求（有測試）。
- [Trade-off] 雲端不做損毀列的回寫清理（Decision 2）。
- [Trade-off] 統計仍在前端計算：歷史以區間取回後量級小，且平局等統計語意只維護一份。

## Migration Plan

- 無 migration（B7 已建表）。合併後無需額外步驟。正式站零變更（auth 停用）。**不 push**（D4）。回滾：revert 合併 commit。

## 交接給 B9

1. 匯入的歷史 MUST 寫入 `played_at`（`Date.parse(playedAt)`），否則 B8 的區間查詢會漏掉。
2. 匯入的歷史以 `asc` 讀回時，順序為 `played_at`＋插入順序；匯入時 MUST 依本機的追加順序插入，才能讓同時間的紀錄維持原順序。
3. `resetLocalMatchProgress()` 已刪除；登入時重置不碰本機，本機五個 key 皆可作為匯入來源。

## Open Questions

1. ~~`z.coerce.number()` 對空字串會轉成 0~~ → **apply §1 已定案**：採 `z.string().regex(/^\d+$/)` 再轉數字（Decision 6），「空字串」已加入 400 的測試樣本（delta「雲端歷史：不合法的查詢參數」）。
2. `RemoteStatsContent` 在名單 `load-failed`、歷史 `synced` 時的呈現：沿用 B6「名單載入失敗以 `SyncStatusNotice` 取代內容」，§7 E2E 驗證。
3. **（apply §1，待 coordinator 知悉，非阻擋）`player-roster`「resetLocalMatchProgress 只清除本次活動的進度」沿用標題、內容改寫**：OpenSpec 的 MODIFIED 不可丟棄主 spec 既有 Scenario（validate 擋），
   而本 change 刪除該函式與其 it。比照 B7 apply §1 的前例（沿用主 spec 標題、改寫內容），本 Scenario 改為以指令 `rg resetLocalMatchProgress nextjs-pickball` 無輸出守住「函式已刪除」，
   標題的字面語意與內容不再一致（標題是舊行為）。替代方案為 REMOVED＋ADDED 整條 Requirement（11 個 Scenario、Requirement 移到主 spec 末尾），成本高於收益，不選。若 coordinator 要求改名，需另開 change 處理。
4. **（apply §1，B7.5 交接）授權修改的既有 it 由三個增為五個**：`expected-user-guard.test.ts`「列舉出的使用者資料路由恰與守衛樣本表一致」的路由數 13 → 14（B7.5 刻意設計的交接紅燈）；
   `remote-transfer.test.ts`「雲端匯入與備份的每個請求都帶呼叫端給的帳號」的備份呼叫次數 2 → 3。兩者都只是本 change 行為的必然結果，tasks 檔頭已列入。
5. （apply §2 完成，2026-10-27）Implementer（sonnet）：df77c9f RED（3 紅、無先綠）→ b2621ee GREEN（`rangeBounds`、`api/history.ts`、`CORE_MODULES`）。Stage 1（sonnet）PASS。
   Stage 2（opus）第一輪 FAIL（實作無缺陷，9 條非等價存活：只帶 `to` 的查詢（「更早」區間）、`from=0` 的 truthy 判斷、`to` 的安全整數、`"1.0"`、回應五個欄位的必填性）→ c7f6e86 regression guard → 複審 PASS（9 條全紅、4 條等價對照綠、抽查 9 條仍紅）。
6. （apply §3，leader 裁定 2026-10-27）§3 Implementer（sonnet）：1995cff RED（5 紅＋守衛列舉真紅；先綠：停用 404、未登入 401、守衛「不符」「缺少或空白」「未登入／停用優先」）→ 54b03f1 GREEN → 3d4e239（3.3 skipped）。Stage 1（sonnet）PASS；Stage 2（opus，41 條變異全殺、4 條等價對照綠）PASS。
   Stage 2 實測：`data` 欄位若為非 JSON 文字，drizzle json mode 讀取時即拋錯 → 整個端點 500，歷史頁、統計頁與兩種匯出全部失效，與 Decision 2「略過並計數」的目的相反；
   spec 字面「每一列的 data MUST 以 MatchHistoryEntrySchema 驗證：不合法者 … 計入 droppedCount」可涵蓋此情形。**裁定**：在 §3 追加 task 3.4（新增 Scenario「雲端歷史：data 不是合法 JSON 的列同樣被略過並計數」），以 `sql` 片段取原始文字再 `JSON.parse`。
   3.4 完成：8984613 RED（`expected 500 to be 200`，真紅）→ 2488400 GREEN；Stage 1 由 leader 對照 Scenario 逐條核對 diff，Stage 2（opus，9 條非等價變異全殺、3 條等價對照綠）PASS。後端全套 23 檔／165 it 綠。§3 完成。

7. （apply §4，2026-10-28 接任 leader）§4 由前一任完成 edbe859／d47f318／1256905／d3f7be3／25f1215／f46b053 後因關機中斷；接任後以 `git show <commit>^:<path>` 機械複驗兩個 RED（實作檔於 RED^ 與 RED 皆不存在），tasks 補勾並註記「shell 紅燈輸出遺失，以 RED／GREEN 分開的 commit 作證」；4.5 守衛紅燈輸出在 4.6 commit 前未留存，照實註記、未重現（禁止改回主 spec 偽造）。
   Stage 1（sonnet）PASS。Stage 2（opus）第一輪 FAIL（產品程式碼正確；非等價存活：thisWeek／earlier 界線、`from` 為 null 仍送出、換帳號當幀 `droppedCount` 沿用、只拿掉 `cancelled`（結束世代後的 401 仍呼叫 onUnauthorized）、401 後狀態）→ 9464cad 四個 regression guard → 複審 PASS（8 條存活全紅、3 條等價對照綠、抽查 11 條仍紅）。
   Stage 2 判定：`requestSeqRef` 比對與 `cancelled` 重疊——只拿掉序號比對為等價變異（下一次 effect 前必先跑 cleanup），屬 Decision 7 要求的縱深防禦，保留。§4 完成。

8. （apply §5，2026-10-28）Implementer（sonnet）：304a507 RED（真紅）→ 36fc099 GREEN → 159e51e regression guard。Stage 1（sonnet）PASS。Stage 2（opus）第一輪 FAIL（產品程式碼正確；10 條非等價存活：卡片資料與筆數、提示 class、篩選 `value`、狀態優先序、`total === 0` 時隱藏篩選、內容分支 data-sync-status）→ 759b548 → 複審 PASS（10 條全紅、4 條等價對照綠、抽查 13 條仍紅）。
   實作選擇（Stage 1 判定與 spec 無衝突）：`RemoteStatsContent` 名單 `loading`／`load-failed` 優先於歷史狀態，兩邊皆非阻斷時 `data-sync-status` 取歷史狀態；根元素為 `<div>`（`<main>` 由 §7 頁面提供）；`total === 0` 時統計頁不顯示區間篩選（與本機統計頁一致）。
9. **（apply §5，待 coordinator 裁定，非阻擋）換區間時鍵盤焦點遺失**：`useRemoteHistory` 每次 `range` 改變都回到 `loading`（Decision 7 的 `begin`），而 spec「`syncStatus` 為 `loading`／`load-failed` 時以 `SyncStatusNotice` 取代內容」使 `HistoryRangeFilter` 卸載再掛載。Stage 2 以 happy-dom 實測：以鍵盤（Enter）或點擊選「本月」後 `activeElement` 變為 `BODY`，回應到達後仍為 `BODY`，再按 Tab 從「今日」重新開始；本機頁不會如此。
   與 player-stats「區間篩選控制項 MUST 可由鍵盤操作」不構成字面衝突（每次掛載後仍可操作），但屬焦點管理的退步。本 change 照 spec 字面實作，未改；可選方案：(a) 接受並列為已知限制；(b) 另開 change 修改 spec 為「只在首次載入或失敗時取代整段，換區間載入中保留篩選」。

10. （apply §6，2026-10-28）Implementer（sonnet）：88c46de RED（4 個真紅＋B7.5 授權 it 隨行為變更而紅）→ a8a2380 GREEN（含 `nextjs-pickball/CLAUDE.md` 三處、`storage.test.ts` 另刪同函式的 SSR it）。Stage 1（sonnet）PASS。Stage 2（opus）第一輪 FAIL（名單 401＋回合 500、回合 401＋名單 500 的優先序未守住）→ 256b6f4 → 複審 PASS。§6 完成。

11. （apply §7，2026-10-28）Implementer（sonnet）：ef1bd62 RED（6 failed、無先綠）→ f139623 GREEN（含對 §5 `RemoteStatsContent` 加標題的偏差，理由見 tasks 7.2）。Stage 1（sonnet）PASS。Stage 2（opus）PASS 但列 4 條非等價存活；leader 依硬規則將 `HistoryCsvSection` 未授權 `refresh()` 與失敗不下載改列必修 → 13a20d3、3f8d690 → 複審 PASS。OQ2 由既有 `roster-sync.spec.ts` 守住（名單 load-failed 優先）。§7 完成。
12. **（apply §7 Stage 2 觀察，待 coordinator 知悉，非阻擋）session 載入中本機 `HistoryView` 先掛載的副作用**：`resolveStorageMode` 在 session 載入中回 `local`（user-data-sync 主 spec），登入使用者開歷史頁時本機 `HistoryView` 會先掛載一瞬，其 effect 內 `readHistory()` 若遇到含損毀項的本機歷史，會依既有逐筆降級規則回寫清理（Stage 2 以暫時性探針實測 `unchanged=false`）。合法本機歷史不受影響（E2E「登入時瀏覽歷史頁只發出 GET 且不改動本機歷史」的 GIVEN 為合法資料）。
   與 delta「雲端模式下…SHALL NOT 讀寫 `matchmaker:history:v1`」字面有張力，但載入中的那一刻定義上屬本機模式，與統計頁本機 store 的等值回寫同類。本 change 未處理；可選方案：(a) 接受；(b) 另開 change 讓歷史頁在 session 載入中不掛本機元件。

13. （Final Code Review，2026-10-28）Final Code Reviewer（opus）FAIL，必修 M1：`computeRangeCutoffs` 以逐層 `min()` 刻意產生空區間（週一的「本週」、本週一落在上個月時的「本月」，`from === to`），但 `HistoryQuerySchema` 要求 `from < to` → 後端 400 → 雲端歷史頁、統計頁在這些日期顯示載入失敗，且因 `load-failed` 取代整段內容而篩選器消失、無法切回（OQ9 因此加重）。單元測試未抓到：hook 的 FAKE_NOW 為週三月中，核心 schema 測試未接 `rangeBounds` 的真實輸出；8.8 E2E 實跑日為週三。
    裁定（leader，比照 3.4 追加 task 8.10～8.12）：refine 放寬為 `from <= to`（`[x, x)` 為合法空集合，回空 `items`、`total` 照算，前端走既有區間空狀態，與本機一致）；`from=300&to=200` 仍 400。不採前端短路（空區間不發請求會拿不到 `total`，分不出「完全沒有歷史」與「此區間沒有」）。delta spec 對應句改寫並新增兩個 Scenario。
    Final 其他建議（非必修，轉 coordinator）：匯出（備份、CSV）略過損毀列時未告知 `droppedCount`；`packages/pickball-core/CLAUDE.md`「CORE_MODULES 目前 23 項」在 main 即已過時（main 24、本 change 後 25）；`nextjs-pickball/CLAUDE.md` API 包裝第一參數清單未列 `history-api`；`backend-scoring-runbook-b1-b9.md` 狀態快照仍為「B8 apply 中斷」。
    M1 修正：bdeb124 RED（三處真紅）→ 32a3c0a GREEN → e0cbcb9 文件 → 8acce25 tasks 紀錄；Final Code Reviewer（opus）複審 **PASS**（RED 以讀碼確認在舊 refine 下必紅、名稱逐字一致、`from=300&to=200` 仍 400、文件無殘留、上次必修清單全數消除）。後端全套 23 檔／166、核心 8 檔／17。M1 只放寬後端查詢驗證，8.8 E2E（週三實跑）未重跑。

## apply §1 查證紀錄（2026-10-27）

**1.1 環境**：見 environment.md Verification（baseline 前端 100／1010、後端 22／157、核心 6／13；lint 0／3；三段 typecheck exit 0；E2E 五個 browser project 各 145、user-data 34；lockfile 零變動；`db:migrate:local` 無待套用；`db:seed:local` exit 0）。

**1.2 對齊 main**：
- 後端：`src/routes/matchmaker.ts` 的 sub-app 已為 `.use("*", localAuth, requireSession, requireExpectedUser).onError(userDataOnError)`，`invalidBodyHook` 在 `src/http/invalid-body.ts`；`matchmaker_history` 的 `played_at` 為 `integer({ mode: "timestamp_ms" })`（drizzle 以 `Date` 讀寫，SQL 比較時為毫秒整數）。
  既有排序前例：`players-repository.ts` 以 `.orderBy(asc(...), sql\`rowid\`)`。測試 helper：`test/helpers/matchmaker-fixtures.ts` 已有 `seedAndSignIn`、`request()`（有 cookie 時自動帶 `X-Expected-User-Id`）、`makeHistoryEntry`、`seedHistory`（`played_at` 取自 `entry.playedAt`）、`rowsOf`；`test/helpers/session.ts` 有 `userIdOf`、`expectedUserHeader`。
- 核心：`CORE_MODULES` 在 `packages/pickball-core/test/module-boundary.test.ts`（目前 24 項）；`test/matchmaker/` 目錄尚不存在（新增）；zod `^4.4.3`。
- 前端：`requestJson(method, path, { body?, schema, expectedUserId })`；`remote-transfer.ts` 已有 `unauthorizedFailure()`（不可列舉的 `unauthorized: true`）；`buildRemoteBackupSnapshot(expectedUserId)` 的 history 取 `readSnapshot().history`；
  `HistoryCsvSection` 尚無 session 與訊息狀態；`JsonBackupSection` 已以點擊時的 user id 呼叫並在未授權時 `refresh()`（範本）；選擇器以 `session.status === "ready" ? session.user?.id ?? null : null` 取 user id、`onUnauthorized: session.refresh`。
  統計頁仍掛 `useRosterStore`＋`useRoundStore`；歷史頁 `page.tsx` 為 server component、只渲染 `HistoryView`。
- MODIFIED Requirement 與目前主 spec 逐段比對（python difflib）：`match-history` 兩條、`data-transfer` 一條、`pickleball-guide-page` 一條除本 change 刻意增修外無差異（主 spec 已含 B7 的 `useRemoteRoundStore`／`useRemoteMatchSlotStore`）；
  `player-stats`「統計依區間篩選」把 `nextjs-pickball/lib/matchmaker/history-range.ts` 改為核心路徑（模組已移至核心，屬正確修正），且兩個區塊末尾漏了主 spec 的 `---` → 已補回；
  `player-roster`「重置名單與二次確認」缺兩個 Scenario（validate --strict 失敗）→ 「登入時重置名單前停止所有待送與重試中的變更」原文帶入；「resetLocalMatchProgress 只清除本次活動的進度」見 Open Questions 3。commit `d6dd2dd`。
- B7.5 交接（`changes/archive/2026-10-27-user-data-account-guard/design.md`「交接給 B8／B9」、`hono-pickball/CLAUDE.md`「後續 change 須知」第 4 點、`nextjs-pickball/CLAUDE.md` 帳號世代段）逐項落實為 Decision 7，並寫入 delta（commit `4030332`）、test-plan 授權覆蓋表第四欄、tasks 檔頭與 §3／§4／§6／§7。
- B7 交接（`2026-10-24-matchmaker-round-score-backend/design.md`「交接給 B8～B9」）：`played_at` 與 `rowid` 追加順序、`useRemoteRoundStore.history` 恆空、刪除 `resetLocalMatchProgress()`、快照 history 改雲端——皆已在本 change 範圍內；後端測試 seed 用 `matchmaker-fixtures.ts`。
- 新增 Scenario 標題皆加 Requirement 專屬前綴（雲端歷史／歷史頁唯讀／損毀提示／統計區間／統計空狀態／統計頁唯讀／登入資料工具）；模擬合併後逐標題計數：五個 capability 皆無新增重複（`player-roster`「刪除參賽者」為主 spec 既有的重複，B7.5 OQ5 已裁定不處理）。

**1.3 Context7 查證**：
- `/cloudflare/cloudflare-docs`（`workers/wrangler/commands/workers` 的 dev、`workers/local-development`）：「`wrangler dev` runs the local `workerd` runtime with `TZ=UTC` to match the production Cloudflare runtime. `Date` and `Intl` APIs inside your Worker observe UTC」——與 Decision 1 一致。
- `/colinhacks/zod`（`packages/zod/src/v4/core/schemas.ts` 的 `$ZodNumber`）：`coerce` 為 `payload.value = Number(payload.value)` 後只檢查 finite number。本機以 zod 4.4.3 實測 `z.coerce.number().int().nonnegative()`：`""` → 0（通過）、`" 12 "` → 12、`"1e3"` → 1000、`"0x10"` → 16。
  **與 design 假設的差異**：不只空字串，空白、科學記號與十六進位也會被接受 → Decision 6 改為 regex＋安全整數，Open Questions 1 定案。
- `/drizzle-team/drizzle-orm-docs`（`sql` 運算子於 `orderBy`）：`orderBy` 可放 `sql` 模板片段（`.orderBy(sql\`${t.id} desc nulls first\`)`），可與 `asc()`／`desc()` 混用多欄——與 Decision 2（`desc(playedAt), sql\`rowid\``）一致；repo 內 `players-repository.ts` 已有相同用法。

