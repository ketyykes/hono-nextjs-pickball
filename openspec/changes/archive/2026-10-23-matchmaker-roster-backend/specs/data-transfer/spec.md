## MODIFIED Requirements

### Requirement: 參賽者 CSV 匯入的預覽、附加寫入與整份原子性

匯入 MUST 分成兩個階段：先產生**預覽**，使用者確認後才寫入（`prd.md` 9.3.2）。預覽 MUST 至少
呈現「將新增幾人」與「哪幾列有問題」。

任一列驗證失敗時系統 MUST **整份不匯入**，SHALL NOT 只匯入通過的部分而留下半套資料
（`prd.md` 9.3.2）。使用者於預覽取消時 SHALL NOT 寫入任何資料。

寫入採**附加**模式：匯入的人一律新增於既有名單之後，SHALL NOT 覆蓋或合併既有參賽者。
**同名視為不同人**——球聚常有同名同姓，靜默合併的風險高於重複建立；重複匯入造成的重複人員
由使用者自行刪除。

未提供顏色的列 SHALL 由系統自動配色，且**同一次匯入的多列 MUST 各自取得不同的預設漸層**，
SHALL NOT 全部拿到同一組——匯入是一次建立多人的操作，若全部同色即等同沒有顏色標記，
違背 `prd.md` 4.1.1 「讓使用者快速辨識球場位置」的目的。自動配色 MUST 重用
`player-roster` 既有的調色盤與選色規則，SHALL NOT 另寫一套。

`id` 與 `createdAt` MUST 由呼叫端注入，SHALL NOT 於函式內部呼叫 `crypto.randomUUID()`
或 `new Date()`（沿用 `player-roster` 的同一原則）。

**登入時（雲端模式）**：預覽與驗證流程不變；確認後系統 MUST 先 `GET /api/matchmaker/players` 取得雲端現有名單，以同一個 `applyRosterImport`
計算附加結果（自動配色依雲端名單判斷），再只把**新增的參賽者**以 `POST /api/matchmaker/players/import` 一次送出。整份原子性由後端的 D1 `batch()` 保證
（`user-data-sync`「多筆使用者資料的逐筆版本化契約」），SHALL NOT 逐筆 PUT（中途失敗會留下半套資料）。送出失敗時 MUST 顯示錯誤、SHALL NOT 重新整理頁面，
名單保持不變。SHALL NOT 讀寫本機 `matchmaker:roster:v1`。

實作位於 `nextjs-pickball/lib/matchmaker/roster-csv.ts`。雲端分支位於 `nextjs-pickball/lib/matchmaker/remote-transfer.ts`。

#### Scenario: 預覽回報將新增人數與問題列

- **WHEN** 解析含 5 筆資料、其中 2 筆有問題的 CSV
- **THEN** 預覽結果顯示可新增 3 人、2 筆問題列，且問題列各自帶列號與原因
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「預覽回報可新增人數與問題列的列號與原因」

#### Scenario: 任一列失敗時整份不匯入

- **GIVEN** CSV 含 4 筆資料，其中第 3 筆強度分數為 `12`
- **WHEN** 呼叫寫入函式
- **THEN** 回傳的名單與原名單完全相同，SHALL NOT 新增任何一位
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「任一列驗證失敗時整份不匯入，名單完全不變」

#### Scenario: 附加模式不覆蓋既有參賽者

- **GIVEN** 名單中已有 2 位參賽者
- **WHEN** 匯入 3 筆合法資料
- **THEN** 名單為 5 位，原本 2 位的欄位完全不變且仍在陣列前段
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「匯入採附加模式，既有參賽者不被覆蓋且順序在前」

#### Scenario: 同名視為不同人

- **GIVEN** 名單中已有一位名為「王小明」的參賽者
- **WHEN** 匯入的資料中也有一位「王小明」
- **THEN** 名單中出現兩位「王小明」，兩者 `id` 不同，SHALL NOT 合併為一筆
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「同名參賽者各自獨立建立，不靜默合併」

#### Scenario: 未提供顏色的多列取得互不相同的配色

- **WHEN** 匯入 3 筆皆未提供顏色的資料
- **THEN** 三者的 `colorFrom`／`colorTo` 組合兩兩相異，且皆來自既有預設調色盤
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「同一次匯入未提供顏色的多列取得互不相同的預設漸層」

#### Scenario: 於預覽取消時不寫入任何資料

- **GIVEN** 已選擇一份合法的參賽者 CSV 並看到預覽
- **WHEN** 使用者按下取消
- **THEN** 參賽者頁的名單與匯入前完全相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「在 CSV 匯入預覽按取消後名單維持不變」

#### Scenario: 確認預覽後名單新增匯入的參賽者

- **GIVEN** 已選擇一份含 2 筆合法資料的參賽者 CSV 並看到預覽
- **WHEN** 使用者按下確認匯入
- **THEN** 參賽者頁出現這 2 位，且既有參賽者仍在
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「確認 CSV 匯入預覽後名單新增匯入的參賽者」

#### Scenario: 雲端 CSV 匯入只送出新增的參賽者

- **GIVEN** 雲端名單有 2 位，預覽為 3 筆合法資料
- **WHEN** 呼叫雲端匯入函式（注入 3 個 id 與時間）
- **THEN** 先 GET 名單，再以 `POST /api/matchmaker/players/import` 送出恰好 3 位（id 為注入值、配色與雲端既有 2 位互不相同時沿用 `applyRosterImport` 的結果），回傳成功
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端 CSV 匯入以雲端現有名單計算並只送出新增的參賽者」

#### Scenario: 雲端 CSV 匯入失敗

- **WHEN** GET 失敗，或 POST 回 409／500
- **THEN** 回傳失敗結果（含繁體中文訊息），不視為成功
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端 CSV 匯入失敗時回傳錯誤且不視為成功」

#### Scenario: 登入時 CSV 匯入寫入雲端

- **GIVEN** 以測試帳號登入、雲端名單為空
- **WHEN** 在資料頁選擇含 2 筆合法資料的參賽者 CSV 並確認匯入，之後開啟參賽者頁
- **THEN** 參賽者頁出現這 2 位；本機 `matchmaker:roster:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時 CSV 匯入的參賽者寫入雲端」

## ADDED Requirements

### Requirement: 登入時的資料工具頁

`/matchmaker/data` 在雲端模式（`user-data-sync`「前端依 session 選擇儲存模式」）下 SHALL 依下表調整資料來源；本機模式一律維持既有行為與程式路徑。

| 功能 | 雲端模式的行為 |
|---|---|
| JSON 匯出 | `buildBackup` 的快照中 `players` MUST 取自 `GET /api/matchmaker/players`；`currentRound` 與 `history` 仍取自本機（回合與歷史上雲前）。取得名單失敗時 MUST 顯示錯誤、不下載 |
| JSON 還原 | MUST 停用：不渲染選檔按鈕，改以文字說明「登入時暫不支援從 JSON 備份還原，請登出後還原，或使用之後提供的匯入本機資料功能」 |
| 參賽者 CSV 匯入 | 見「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」的登入分支 |
| 歷史 CSV 匯出 | 不變（歷史仍在本機） |
| 清除本機資料 | 不變（只清本機 key，不呼叫任何雲端 API） |

「JSON 完整備份的匯出內容」表中 `players` 的來源 `matchmaker:roster:v1`，在雲端模式下以本表為準；`buildBackup` 本身仍是純函式、不變。
雲端分支的資料讀取 MUST 經 `nextjs-pickball/lib/matchmaker/remote-transfer.ts`，元件層只負責選檔、下載與顯示。

JSON 還原停用的理由：還原是「以檔案覆寫全部資料」，雲端模式下等同覆寫雲端名單，其語意（覆寫、合併或拒絕）屬 B9「匯入本機資料」的決策範圍，本 change 不預先決定。

#### Scenario: 雲端備份快照的來源

- **GIVEN** 雲端名單有 2 位；本機有一個進行中回合與 3 筆歷史
- **WHEN** 呼叫雲端備份快照函式
- **THEN** 回傳的 `players` 為雲端那 2 位，`currentRound` 與 `history` 等於本機的資料
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端備份快照的參賽者取自雲端、回合與歷史取自本機」

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
