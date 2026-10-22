## MODIFIED Requirements

### Requirement: 登入時的資料工具頁

`/matchmaker/data` 在雲端模式（`user-data-sync`「前端依 session 選擇儲存模式」）下 SHALL 依下表調整資料來源；本機模式一律維持既有行為與程式路徑。

| 功能 | 雲端模式的行為 |
|---|---|
| JSON 匯出 | `buildBackup` 的快照中 `players` MUST 取自 `GET /api/matchmaker/players`、`currentRound` MUST 取自 `GET /api/matchmaker/round`、`history` MUST 取自 `GET /api/matchmaker/history?order=asc`（全部、完成順序）。任一雲端讀取失敗時 MUST 顯示錯誤、不下載 |
| JSON 還原 | MUST 停用：不渲染選檔按鈕，改以文字說明「登入時暫不支援從 JSON 備份還原，請登出後還原，或使用之後提供的匯入本機資料功能」 |
| 參賽者 CSV 匯入 | 見「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」的登入分支 |
| 歷史 CSV 匯出 | 歷史 MUST 取自 `GET /api/matchmaker/history?order=asc`，CSV 欄位與格式由既有 `historyToCsv` 產生（不另寫）；讀取失敗時 MUST 顯示錯誤、不下載 |
| 清除本機資料 | 不變（只清本機 key，不呼叫任何雲端 API） |

「JSON 完整備份的匯出內容」表中 `players`、`currentRound` 與 `history` 的來源（`matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`），以及「歷史賽果的 CSV 匯出」的資料來源，在雲端模式下以本表為準；`buildBackup` 本身仍是純函式、不變。
雲端分支的資料讀取 MUST 經 `nextjs-pickball/lib/matchmaker/remote-transfer.ts`，元件層只負責選檔、下載與顯示。

JSON 還原停用的理由：還原是「以檔案覆寫全部資料」，雲端模式下等同覆寫雲端名單，其語意（覆寫、合併或拒絕）屬 B9「匯入本機資料」的決策範圍，本 change 不預先決定。

#### Scenario: 雲端備份快照的來源

- **GIVEN** 雲端名單有 2 位、雲端有一個進行中回合與 4 筆歷史；本機有另一個回合與 3 筆歷史
- **WHEN** 呼叫雲端備份快照函式
- **THEN** 回傳的 `players`、`currentRound` 與 `history` 皆為雲端的資料，`history` 依完成順序（以 `order=asc` 請求）
- **AND** 三個雲端讀取任一失敗時回傳錯誤、不回傳快照
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端備份快照的參賽者、回合與歷史皆取自雲端」

#### Scenario: 雲端歷史 CSV 的資料來源

- **GIVEN** 雲端有 2 筆歷史；本機有 3 筆不同的歷史
- **WHEN** 呼叫雲端歷史 CSV 函式
- **THEN** 回傳的 CSV 等於以雲端那 2 筆（完成順序）呼叫 `historyToCsv` 的結果；讀取失敗時回傳錯誤
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端歷史 CSV 以雲端歷史依完成順序產生」

#### Scenario: 登入時歷史 CSV 匯出來自雲端

- **GIVEN** 以測試帳號登入，雲端有一筆剛完成的歷史；本機 `matchmaker:history:v1` 有一筆不同的訪客歷史
- **WHEN** 在資料頁按歷史 CSV 匯出並讀取下載的檔案
- **THEN** 檔案含雲端那一筆的球員姓名，不含訪客那一筆
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入時歷史 CSV 匯出的內容來自雲端」

#### Scenario: 登入時 JSON 匯出的參賽者來自雲端

- **GIVEN** 以測試帳號登入、雲端名單有 2 位；本機 `matchmaker:roster:v1` 有一份不同的訪客名單
- **WHEN** 在資料頁按 JSON 匯出並讀取下載的檔案
- **THEN** 檔案的 `players` 為雲端那 2 位
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時 JSON 匯出的參賽者來自雲端」

#### Scenario: 登入時 JSON 還原停用

- **GIVEN** 以測試帳號登入
- **WHEN** 開啟資料頁
- **THEN** JSON 還原的選檔按鈕不存在，並顯示上表的說明文字
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時 JSON 還原停用並顯示說明」
