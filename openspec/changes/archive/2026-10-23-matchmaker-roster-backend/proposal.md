# Proposal: matchmaker-roster-backend

## Why

runbook B6：登入後對戰分配機的參賽者名單（含評分、出場數）要以後端為準，換裝置可續用；CSV 匯入與 JSON 匯出在登入態要讀寫後端。
名單是 B7（回合與送出比分）與 B8（歷史統計）的根資料，必須先上雲。本 change **沿用 B5 定下的全部慣例**（`user-data-sync`），
並補上「多筆資料」的版本化契約（逐筆 `version`、刪除冪等、批次匯入整份原子性、一鍵重置）。

**前提**：B5 `scoreboard-backend` 已合併並 archive（`user-data-sync` 慣例、`lib/sync/*`、`user-data` E2E project、`USER_DATA_TABLES` 皆已存在）。

## What Changes

**後端**
- D1 表 `matchmaker_players`：`(user_id, id)` 複合主鍵、`data`（`PlayerSchema` JSON）、`sort_order`、`version`、`updated_at`；`USER_DATA_TABLES` 加入。
- `src/routes/matchmaker.ts`（`/api/matchmaker/*` sub-app，`localAuth`＋`requireSession`）：
  - `GET /players` → `{ items: [{ data, version }] }`（依 `sort_order`）
  - `PUT /players/:id` → `{ data, version }`（`version: 0` 建立、否則版本相符才更新、不符 409；path id 必須等於 `data.id`）
  - `DELETE /players/:id` → 204，冪等、不比對版本
  - `POST /players/import` → `{ players }` 以 D1 `batch()` 整份附加，任一 id 已存在則整份不寫入（409）
  - `POST /reset` → 以 `batch()` 刪除該使用者所有對戰分配機資料（本 change 只有名單；B7、B8 把回合與歷史加進同一個 batch）

**前端**
- `useRosterStore` 改為選擇器（本機實作原封不動改名為同檔的 `useLocalRosterStore`），新增 `hooks/useRemoteRosterStore.ts`：
  樂觀更新＋**每位參賽者一個**最新優先儲存佇列（新增／編輯／切換出場送 PUT、刪除送 DELETE）；任何 409 → 停止所有佇列、整份重新載入、顯示衝突提示。
  回傳值多 `syncStatus`；`useRoundStore` 經 `updatePlayer` port 寫回的評分與休息次數在登入時同樣寫入雲端。
- 參賽者頁、對戰頁、統計頁：雲端載入中／失敗時以 `SyncStatusNotice` 取代內容，其餘狀態疊加提示。
- 重置名單（登入時）：`POST /api/matchmaker/reset` 成功後清空畫面，並只清除本機的回合、歷史與場次分槽（新函式 `resetLocalMatchProgress()`）；
  **不清除**本機 `matchmaker:roster:v1`（那是訪客時期的名單，留給 B9 匯入）。
- 資料頁（登入時）：CSV 匯入讀雲端現有名單、以既有 `applyRosterImport` 計算附加結果、只把新增的人 `POST /players/import`；
  JSON 匯出的 `players` 取自雲端（回合與歷史仍取本機）；**JSON 還原停用**並說明原因（由 B9 的匯入功能取代）；歷史 CSV 匯出與「清除本機資料」不變。
- `lib/sync/roster-api.ts`（名單 API 的薄包裝）、`lib/matchmaker/remote-transfer.ts`（登入態的 CSV 匯入與備份快照）。

**文件**：兩份 CLAUDE.md 的「matchmaker 為 LocalStorage-only」敘述改寫（B5 交接）。

### 明確不做

- 回合、計時、送出比分、場次分槽上雲（B7）；歷史與統計上雲（B8）；匯入本機資料（B9）。
- 名單的合併或拖曳排序 API（`sort_order` 只在建立與匯入時決定，沿用現行「附加在後」的順序語意）。
- 登入態的 JSON 還原（B9）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：新增「多筆使用者資料的逐筆版本化契約」。
- `player-roster`：「LocalStorage 持久化與逐筆降級」限定本機模式；「重置名單與二次確認」加入登入分支；新增「登入時名單以雲端為準」。
- `data-transfer`：「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」加入雲端寫入；新增「登入時的資料工具頁」。
- `backend-database`：新增「對戰分配機參賽者資料表由 migration 建立」。
- `pickleball-guide-page`：hooks 歸屬清單加入 `useRemoteRosterStore → player-roster`。

## Impact

- **後端**：`src/routes/matchmaker.ts`、`src/matchmaker/players-repository.ts`、`src/index.ts`（掛載）、`src/db/schema.ts`、`drizzle/0002_matchmaker_players.sql`（＋meta）；
  測試 `test/matchmaker-players.test.ts`、`test/d1-schema.test.ts`（新增 it）。`test/user-data-tables.test.ts` 不改（雙向比對自動涵蓋新表）。
- **核心套件**：`src/api/user-data-tables.ts`（加 `matchmaker_players`）、新增 `src/api/players.ts`（`PlayerListResponseSchema`、`PlayerImportRequestSchema`）與其測試；`CORE_MODULES` 更新。
- **前端**：`hooks/useRosterStore.ts`（改名＋選擇器）、`hooks/useRemoteRosterStore.ts`、`lib/sync/roster-api.ts`、`lib/matchmaker/remote-transfer.ts`、
  `lib/matchmaker/storage.ts`（新增 `resetLocalMatchProgress`，既有函式不改）、`app/matchmaker/{page,players/page,stats/page}.tsx`、
  `components/matchmaker/{RosterCsvImportSection,JsonBackupSection}.tsx`；既有 `hooks/useRosterStore.test.tsx` 只新增 mock 區塊與新 it、`lib/matchmaker/storage.test.ts` 只新增 it；
  E2E `tests/e2e/user-data/roster-sync.spec.ts`。
- **主 spec 例外同步**：依 B3／B5 先例，tasks 授權同步 `pickleball-guide-page` 歸屬清單那一句。
- **相依**：**不新增任何第三方套件**。
- **訪客／正式站**：零變更（本機實作一行不改、資料頁在本機模式走既有程式路徑）。
- **過渡期限制（B6～B7 之間，不 push 故不影響正式站）**：登入時名單在雲端、回合與歷史仍在本機；登出後訪客會看到登入時產生的本機回合（其中的球員 id 指向雲端名單）。B7 起消失。
