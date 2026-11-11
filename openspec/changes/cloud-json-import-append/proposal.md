# Proposal: cloud-json-import-append

## Why

上一個 change（`session-hint-failure-no-local-fallback`）讓有登入提示的使用者在 session 無法確認時可以按「先用這台裝置的資料」改用本機，但這段期間的修改只存在本機。
現有兩個雲端匯入入口都走 `POST /api/import`，雲端名單、回合、分槽、歷史任一表已有資料就回 `409` 且整份不寫——已登入的使用者雲端幾乎一定有資料，所以備援期間的參賽者與賽果救不回雲端。
使用者已定案：在本機匯出 JSON 備份後，登入時用「從 JSON 備份匯入到雲端」由使用者自行決定**附加**到雲端。

## What Changes

- **新增後端端點 `POST /api/import/append`**（同 `src/routes/import.ts` sub-app、同一組 middleware、body 上限沿用 `IMPORT_BODY_LIMIT_BYTES`）：
  請求只含 `players` 與 `history` 兩段；以**單一** D1 `batch()`、固定兩條 `INSERT … SELECT … FROM json_each(?)` 寫入：
  - 參賽者：雲端已有**同名**（名稱完全相同；名稱已由 `PlayerSchema` trim）或**相同 id** 的略過；備份內同名只取第一位；新增者依備份順序接在雲端名單之後，`version` 為版本下限加一。
  - 歷史：雲端已有相同 `matchId` 的略過；其餘依備份順序插入，`played_at` 規則與整份匯入相同，`version` 為 1。
  - **歷史中的球員 id 改寫**（coordinator 追加的使用者定案）：附加的歷史中，因與雲端同名而被略過的參賽者（及備份內同名的第二位以後）其 `teamA`／`teamB` 的 `players[].id` 在同一條 SQL 內改寫為雲端同名者的 id，讓附加的比賽算到雲端那位的統計上；姓名快照、`ratingBefore`／`ratingAfter` 不改。
  - 不碰回合、分槽、獨立計分板、版本下限與整批守衛表；同一份備份附加兩次，第二次全部略過。
  - 回應 `200 { appended: { players: { added, skipped }, history: { added, skipped } } }`；沒有 409。
- **核心 `@pickball/core/api/import` 新增附加契約**：`AppendImportRequestSchema`、`AppendImportResponseSchema`、`serializeAppendSegments`（同名只留第一位，另產生供 id 改寫用的參賽者對照段）、`checkAppendLimits`（前後端同一個判定）。
- **前端「從 JSON 備份匯入到雲端」**（`JsonBackupSection` 雲端分支）：照舊先送 `POST /api/import`；雲端為空時行為完全不變。
  回 `409` 時先以既有 `fetchRemotePlayers`（選檔當下的帳號）讀取雲端名單，再顯示**附加確認**：備份內的參賽者數與歷史筆數、**會新增到雲端的參賽者名單**與已在雲端而視為同一人的名單（使用者追加定案：送出前先看一眼，名字打錯會變成另一位且目前無法合併）、名字要完全相同才算同一人的提醒、四條固定說明（同名略過〔含名稱比對規則〕、重複歷史略過、回合不匯入、分數不變需手動調整），以及按鈕「附加到雲端」與「取消」；按下才送附加請求（帳號取按下當下）。
  名單的計算是前端純函式 `previewAppendPlayers`，規則與後端逐字一致，只作提示，實際結果以後端回應為準；名單讀取 401 時刷新 session、其他失敗顯示讀取失敗，兩者皆不顯示確認、不送附加。
  備份沒有任何參賽者與歷史時顯示無可附加、不渲染按鈕、不讀名單。附加成功顯示新增與略過筆數；401、413、其他錯誤沿用既有文案與 `refresh()` 規則；不寫本機、不重新載入。
- `lib/sync/local-import.ts` 新增 `backupToAppendRequest`、`appendBackupToCloud(expectedUserId, request)`、`previewAppendPlayers`、`fetchAppendPreview(expectedUserId, request)`；`components/matchmaker/local-import-view.ts` 新增附加與預覽名單文案、`describeAppendOutcome`，並改寫雲端 JSON 匯入的說明文字 `jsonCloudImportHint`。
- **BREAKING（規格層）**：`data-transfer`「登入時的資料工具頁」中「從 JSON 備份匯入到雲端」由「雲端已有資料時拒絕、不覆寫、不合併」改為「雲端已有資料時經使用者確認後附加、仍不覆寫」；舊 409 文案「…請先在參賽者頁重置名單。」在此入口不再出現。
  「匯入本機資料到雲端」區塊的 409 行為與文案**不變**。

### 明確不做

- 依附加的歷史重算或更新強度分數（雲端分數維持不變，畫面明講需手動調整）。
- 匯入備份中的進行中回合與場次分槽（雲端回合不動）。
- 同名但不同人的區分（同名一律視為同一人，使用者已接受）。
- 改動 `player-stats` 的統計鍵（仍以球員 id 彙整；同名分列由上述 id 改寫解決，不改統計程式）。
- 改動「匯入本機資料到雲端」區塊、參賽者 CSV 匯入、自動合併或自動上傳本機備援期間的修改。
- 新增 npm 相依、資料庫 migration、遠端 Cloudflare 操作。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：ADDED「本機備份附加到雲端的 API」；MODIFIED「批次寫入端點的筆數與 body 上限」（批次寫入端點加入 `POST /api/import/append`）、
  「刪除後重建的使用者資料版本不得重複」（建立路徑加入附加的參賽者；附加的歷史不適用下限）、「本機資料匯入雲端的 API」（守衛樣本表總數由 15 條變為 16 條；註明附加由新端點提供、本端點拒絕規則不變）。
- `data-transfer`：MODIFIED「登入時的資料工具頁」——表中「JSON 還原」列、雲端 JSON 匯入的帳號與結果規則、「JSON 還原在雲端模式的語意」段落改為附加流程，新增附加流程的 Scenario。

逐一查核但**不修改**：`data-transfer`「登入後匯入本機資料到雲端」（409 文案與 `describeImportOutcome` 的敘述只描述該區塊與第一次請求，仍成立）、「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」（「同名視為不同人」只限 CSV 入口）；
`player-roster`（雲端 API 表只列 `/api/matchmaker/*`）；`match-history`（「SHALL NOT 提供批次附加」的主詞是 `GET /api/matchmaker/history` 端點）；`player-stats`（依 id 彙整的規則不變）；`backend-database`（不新增表或欄位）。

## Impact

- **核心套件**：`packages/pickball-core/src/api/import.ts`（新增匯出，不改既有匯出；不新增模組，`CORE_MODULES` 不變）。
- **後端**：`hono-pickball/src/routes/import.ts`（新增 `POST /append`）、`hono-pickball/src/import/local-import-repository.ts`（新增附加寫入函式）。不新增表、不改 migration。
- **前端產品程式碼**：`nextjs-pickball/lib/sync/local-import.ts`、`nextjs-pickball/components/matchmaker/local-import-view.ts`、`nextjs-pickball/components/matchmaker/JsonBackupSection.tsx`。
  - 不改：`lib/sync/roster-api.ts`（只呼叫既有 `fetchRemotePlayers`）、`LocalDataImportSection.tsx`、`LocalImportNotice.tsx`、`LocalImportResultMessage.tsx`、`ClearLocalDataSection.tsx`、`RosterCsvImportSection.tsx`、`HistoryCsvSection.tsx`、`lib/matchmaker/remote-transfer.ts`、`lib/matchmaker/backup.ts`、`lib/matchmaker/transfer-storage.ts`、雲端 hook（`hooks/useRemote*.ts`）、`lib/matchmaker/player-stats.ts`、`components/layout/**`、`components/auth/**`、quiz／tour／guide、`hono-pickball/src/db/**`、`hono-pickball/drizzle/**`、`hono-pickball/src/matchmaker/**`。
- **測試**：
  - 新增檔（1）：`hono-pickball/test/local-import-append.test.ts`。
  - 新增 it 的既有檔：`packages/pickball-core/test/api/import.test.ts`、`packages/pickball-core/test/api/import-limits.test.ts`、`nextjs-pickball/lib/sync/local-import.test.ts`、`nextjs-pickball/components/matchmaker/local-import-view.test.ts`、`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`、`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`。
  - **授權改寫的既有測試（僅限下列各處；其餘既有 it／test 的名稱、斷言與 setup 一律不得修改）**：
    ① `hono-pickball/test/expected-user-guard.test.ts`：`SAMPLES` 補一條 `POST /api/import/append`，it「列舉出的使用者資料路由恰與守衛樣本表一致」的 `toHaveLength(15)` 改為 `toHaveLength(16)`；
    ② `nextjs-pickball/tests/e2e/user-data/{local-import,history-sync,roster-sync}.spec.ts` 的常數 `JSON_CLOUD_IMPORT_HINT_TEXT` 改為新說明文字（三檔共 5 處以它為同步點，test 名稱與其他斷言不變）；
    ③ `nextjs-pickball/tests/e2e/user-data/local-import.spec.ts` 的 test「登入時以 JSON 備份匯入到空的雲端且不寫入本機」：第二次選檔後的 `getByText(CONFLICT_TEXT)` 可見斷言改為「附加確認可見且 `CONFLICT_TEXT` 數量為 0」（不按附加，其後斷言不變）。
- **文件**：`hono-pickball/CLAUDE.md`（本機資料匯入 API 段落補附加端點、守衛樣本 16 條）、`nextjs-pickball/CLAUDE.md`（資料頁雲端 JSON 匯入的敘述，若有）。
- **相依**：不新增。**migration**：無。**遠端**：無；部署順序照舊先 `hono-pickball` 後 `nextjs-pickball`（前端新流程依賴新端點）。
- **使用者可見**：已登入且雲端有資料時，在資料頁「從 JSON 備份匯入到雲端」選檔，會看到附加確認、會新增與視為同一人的參賽者名單、名稱提醒與四條說明；按「附加到雲端」後顯示新增與略過筆數，參賽者頁與歷史頁出現附加的資料，統計頁中與雲端同名者的出場數包含附加的比賽。雲端為空時的整份匯入、訪客的本機覆寫式還原、「匯入本機資料到雲端」區塊皆不變。
