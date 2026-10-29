# Proposal: user-data-import-limits

## Why

上線（G1）前必修的三個匯入邊界缺口，來源為 `docs/backend-scoring-runbook-b1-b9.md` 的 B6 與 B9 紀錄：

1. **匯入大小門檻餘裕不足**（B9）：前端以「原始陣列的 UTF-8 位元組數 ≤ 1,900,000」判定 oversize，但後端送進 D1 `json_each` 的參數另有包裝（歷史每筆約 +80 B）。
   實測前端 1,880,596 B 的歷史段在後端為 2,100,131 B，超過正式 D1 單一字串上限 2,000,000 B（本機 miniflare 不擋）。現況失敗安全（整批回滾），但邊緣資料只看到「匯入失敗，請稍後再試」，看不到 oversize 說明；JSON 備份匯入雲端則完全沒有大小檢查。
2. **批次寫入沒有筆數與 body 大小上限**（B6）：B6 所說的「import」是 `POST /api/matchmaker/players/import`（名單 CSV 雲端匯入；B9 的 `POST /api/import` 當時尚不存在，兩者並存，沒有取代關係）。兩個批次寫入端點都沒有筆數與 body 上限。
3. **`PlayerSchema.id` 接受空字串**（B6）：雲端可被寫入 id 為空字串的參賽者。`PlayerSchema` 同時是訪客本機名單逐筆降級的驗證 schema，直接收緊會讓訪客既有的這類參賽者被捨棄並回寫清除。

## What Changes

**核心套件（`@pickball/core`）**
- `api/errors`：新增錯誤碼 `PAYLOAD_TOO_LARGE`（錯誤碼由四個變為五個）。
- `api/players`：新增 `PlayerWriteSchema`（`PlayerSchema` 再要求 `id` 非空字串，只用於寫入雲端的邊界）、`MAX_PLAYERS_PER_IMPORT = 500`、`PLAYER_IMPORT_BODY_LIMIT_BYTES = 1_000_000`；`PlayerImportRequestSchema` 改用 `PlayerWriteSchema`。
- `api/import`：`LocalImportRequestSchema` 的 `players` 改用 `PlayerWriteSchema`；新增 `serializeImportSegments`（產生後端送進 `json_each` 的五段 JSON 字串，前後端共用同一份形狀）、`utf8ByteLength`、`checkImportLimits`（參賽者 ≤ 500 位、五段參數各自 ≤ `IMPORT_SEGMENT_LIMIT_BYTES = 1_900_000`）、`IMPORT_BODY_LIMIT_BYTES = 10_000_000`。
- **`PlayerSchema` 本身不變**：訪客的本機名單、本機 JSON 還原、雲端回應的解析皆不受影響。

**後端（`hono-pickball`）**
- 新增 `src/http/body-limit.ts`：Hono `bodyLimit` 的共用包裝，超過時回 `413 { error: "PAYLOAD_TOO_LARGE" }`。
- `POST /api/import`：body 超過 10,000,000 B，或 `checkImportLimits` 不通過（參賽者超過 500 位、任一段參數超過 1,900,000 B）時回 `413 PAYLOAD_TOO_LARGE`，**在呼叫 `db.batch()` 之前**拒絕、不寫入任何列。repository 改用核心 `serializeImportSegments` 的輸出作為 `json_each` 參數（不再自行 `JSON.stringify`）。
- `POST /api/matchmaker/players/import`：body 超過 1,000,000 B 或參賽者超過 500 位時回 `413 PAYLOAD_TOO_LARGE`、不寫入；id 為空字串回 400。
- **BREAKING（僅登入態 API）**：單段參數超過上限的 `POST /api/import` 由「500 且整批回滾」改為「413 `PAYLOAD_TOO_LARGE`」；`API_ERROR_CODES` 由四個鍵變為五個。

**前端（`nextjs-pickball`，只影響雲端模式）**
- `lib/sync/local-import.ts`：`oversize` 改為 `!checkImportLimits(payload).ok`（以後端實際送進 D1 的形狀量測，五段皆量、含參賽者筆數）；`importLocalData` 遇 413 回 `{ kind: "too-large" }`。
- `components/matchmaker/local-import-view.ts`：新增 `LOCAL_IMPORT_MESSAGES.tooLarge` 與對應的結果文案（「匯入本機資料」與「從 JSON 備份匯入到雲端」兩個入口共用）。
- `lib/matchmaker/remote-transfer.ts`：雲端 CSV 匯入遇 413 時回 `REMOTE_TRANSFER_MESSAGES.importTooLarge`。

### 明確不做

- B9 紀錄的其他低優先後續（JSON 雲端匯入送出中防護、只有獨立計分板與 playedAt 時區位移的後端專屬 it、`history-sync.spec.ts` 過時註解）與 B6 的低優先項（import `sort_order` 併發、PUT 回應 version 下限、回應遺失重試的假 conflict）。
- 單筆寫入端點（`PUT /players/:id`、`PUT /round`、`PUT /slots/:matchId`、`PUT /scoreboard/current`、送出比分）的 body 上限（非批次寫入，列於 design Open Questions）。
- 超過上限時的分批匯入、訪客本機 CSV 匯入的筆數上限、收緊 `PlayerSchema` 本身。
- 新 hook、新相依、migration。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：MODIFIED「本機資料匯入雲端的 API」（大小與筆數上限、413、參賽者 id 非空）、「使用者資料請求的預期帳號守衛」（錯誤碼清單加 `PAYLOAD_TOO_LARGE`）；ADDED「批次寫入端點的筆數與 body 上限」。
- `data-transfer`：MODIFIED「登入後匯入本機資料到雲端」（oversize 改以後端形狀量測、413 的結果分類與文案）、「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」（雲端分支遇 413 的訊息）。
- `player-roster`：MODIFIED「參賽者雲端 API」（批次匯入的上限與 id 非空；`PlayerSchema` 不變）。

## Impact

- **核心套件**：修改 `src/api/{errors,players,import}.ts`；測試修改 `test/api/errors.test.ts`（授權例外，見 tasks 檔頭）、新增 it 於 `test/api/players.test.ts`、`test/api/import.test.ts`，新增 `test/api/import-limits.test.ts`。**不新增核心模組**（`CORE_MODULES` 不變）。
- **後端**：新增 `src/http/body-limit.ts` 與其測試 `test/body-limit.test.ts`；修改 `src/routes/import.ts`、`src/import/local-import-repository.ts`、`src/routes/matchmaker.ts`；測試修改 `test/local-import.test.ts`（含授權修改一條既有斷言）、`test/matchmaker-players.test.ts`（只新增 it）。**無 migration**，`src/db/schema.ts` 不變。
- **前端**：修改 `lib/sync/local-import.ts`、`components/matchmaker/local-import-view.ts`、`lib/matchmaker/remote-transfer.ts`；
  測試修改 `lib/sync/local-import.test.ts`（含授權修改一條既有 it 的邊界斷言）、新增 it 於 `components/matchmaker/local-import-view.test.ts`、`components/matchmaker/JsonBackupSection.test.tsx`、`lib/matchmaker/remote-transfer.test.ts`、`lib/matchmaker/storage.test.ts`（訪客零影響的 regression guard）；
  E2E 新增一條於 `tests/e2e/user-data/local-import.spec.ts`。`LocalDataImportSection.tsx`、`JsonBackupSection.tsx` 與所有本機 reader 不改。
- **文件**：`hono-pickball/CLAUDE.md`「本機資料匯入 API」與 matchmaker 名單 API 段落的上限敘述（含移除「單段 JSON 參數超過 2MB 回 500」）；`nextjs-pickball/CLAUDE.md` 對 `lib/sync/local-import.ts` 的 oversize 判定與結果分類敘述（改為核心 `checkImportLimits`、新增 `too-large`）。
- **相依**：不新增任何第三方套件（`hono/body-limit` 為既有 `hono` 內建 middleware）。
- **訪客／正式站**：訪客路徑零變更（`PlayerSchema`、本機 reader、本機 JSON 還原與本機 CSV 匯入皆不動；新文案只在雲端模式渲染）。
