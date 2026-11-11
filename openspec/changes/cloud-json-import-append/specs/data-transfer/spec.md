# Specification: data-transfer

## MODIFIED Requirements

### Requirement: 登入時的資料工具頁

`/matchmaker/data` 在雲端模式（`user-data-sync`「前端依 session 選擇儲存模式」）下 SHALL 依下表調整資料來源；本機模式一律維持既有行為與程式路徑。

| 功能 | 雲端模式的行為 |
|---|---|
| JSON 匯出 | `buildBackup` 的快照中 `players` MUST 取自 `GET /api/matchmaker/players`、`currentRound` MUST 取自 `GET /api/matchmaker/round`、`history` MUST 取自 `GET /api/matchmaker/history?order=asc`（全部、完成順序）。任一雲端讀取失敗時 MUST 顯示錯誤、不下載 |
| JSON 還原 | 改為「**從 JSON 備份匯入到雲端**」：本機模式的覆寫式還原（選檔 `json-backup-import-input`、`writeBackup`、`location.reload()`）MUST 不渲染；改渲染雲端匯入的選檔（`data-testid` 為 `json-backup-cloud-import-input`），並顯示說明 `LOCAL_IMPORT_MESSAGES.jsonCloudImportHint`「登入時選擇的備份檔會匯入到雲端，不會寫入本機；雲端已有對戰分配機資料時，可確認後把備份中的參賽者與歷史附加到雲端，不會覆寫雲端既有的資料」。選檔後以既有 `parseBackup` 驗證（失敗訊息與本機模式相同），通過後以 `backupToImportRequest` 轉換、經 `importLocalData` 送出 `POST /api/import`（`scoreboard` 為 `{ current: null, matches: [] }`），雲端沒有任何對戰分配機資料時整份匯入，結果文案與「登入後匯入本機資料到雲端」相同；回 409（雲端已有資料）時改進入下方「附加到雲端」流程，由使用者確認後只附加參賽者與歷史、不覆寫；SHALL NOT 寫入任何本機 key、SHALL NOT 重新載入頁面 |
| 匯入本機資料 | 見「登入後匯入本機資料到雲端」 |
| 參賽者 CSV 匯入 | 見「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」的登入分支 |
| 歷史 CSV 匯出 | 歷史 MUST 取自 `GET /api/matchmaker/history?order=asc`，CSV 欄位與格式由既有 `historyToCsv` 產生（不另寫）；讀取失敗時 MUST 顯示錯誤、不下載 |
| 清除本機資料 | 不變（只清本機 key，不呼叫任何雲端 API） |

「JSON 完整備份的匯出內容」表中 `players`、`currentRound` 與 `history` 的來源（`matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`），以及「歷史賽果的 CSV 匯出」的資料來源，在雲端模式下以本表為準；`buildBackup` 本身仍是純函式、不變。
雲端分支的資料讀取 MUST 經 `nextjs-pickball/lib/matchmaker/remote-transfer.ts`，元件層只負責選檔、下載與顯示；唯一例外是下方「附加到雲端」的預覽名單讀取，MUST 經 `nextjs-pickball/lib/sync/local-import.ts` 的 `fetchAppendPreview`（與附加請求同檔）。

歷史的兩個匯出與「從 JSON 備份匯入到雲端」（含附加）都是 `user-data-sync`「雲端 store 以登入帳號為界」所稱的**一次性雲端操作**：`buildRemoteBackupSnapshot(expectedUserId)` 的名單、回合與歷史三個 GET MUST 使用同一個 `expectedUserId`；
雲端歷史 CSV 函式 MUST 以 `expectedUserId` 為第一參數。任一 GET 回 401（含 `ACCOUNT_MISMATCH`）時，失敗結果 MUST 帶既有的機器可讀未授權標示（訊息為 `REMOTE_TRANSFER_MESSAGES.unauthorized`）；
`HistoryCsvSection` 的雲端分支 MUST 以點擊當下 `useSession()` 的 user id 呼叫，失敗時顯示訊息、不下載，結果為未授權時 MUST 呼叫 `useSession().refresh()`。
雲端歷史 CSV 讀取失敗（非未授權）時的訊息為「無法取得雲端的歷史賽果，未產生 CSV 檔。請確認網路連線後再試一次。」；雲端備份快照的任一讀取失敗沿用既有 `backupFetchFailed`。
`JsonBackupSection` 的雲端 JSON 匯入 MUST 以點擊（選檔）當下 `useSession()` 的 user id 作為 `importLocalData` 的第一參數；該 user id 為 `null` 時 MUST 不送出請求並顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized`；結果為 `unauthorized` 時 MUST 顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized` 並呼叫 `useSession().refresh()`。附加預覽的名單讀取與附加請求的帳號規則見下方「附加到雲端」。

JSON 還原在雲端模式的語意（B6 暫停、B9 定案、本 change 改為可附加）：本機模式的還原是「以檔案覆寫全部資料」；雲端模式下覆寫會讓另一台裝置正在使用的資料無預警消失，因此雲端模式 SHALL NOT 覆寫任何既有資料。
雲端沒有任何對戰分配機資料時整份匯入（含回合）；已有資料時，由使用者看過附加確認後自行決定是否把備份中的參賽者與歷史**附加**到雲端（同名參賽者與重複歷史略過，避免 B9 擔心的重複）——
B9 原定的「不合併」只在本入口改為附加，用於救回 session 無法確認期間在本機產生、經 JSON 備份帶出的資料；「匯入本機資料到雲端」區塊的拒絕規則與文案不變。
要以備份取代雲端資料的使用者，仍可先在參賽者頁重置名單（清除雲端的名單、回合、分槽與歷史）再匯入。

**附加到雲端**（使用者定案；`nextjs-pickball/components/matchmaker/JsonBackupSection.tsx`，請求函式在 `nextjs-pickball/lib/sync/local-import.ts`，文案在 `nextjs-pickball/components/matchmaker/local-import-view.ts`）：

- **觸發**：「從 JSON 備份匯入到雲端」的 `POST /api/import` 結果為 `cloud-not-empty`（409）時，MUST 進入附加流程，SHALL NOT 顯示 `LOCAL_IMPORT_MESSAGES.cloudNotEmpty`。雲端沒有對戰分配機資料時（200）整份匯入，行為與文案不變（含回合）。
- **附加內容**：以 `backupToAppendRequest(backup)` 轉為 `{ players, history }`——取備份的 `players` 與 `history` 原樣，丟棄 `currentRound`。
- **無可附加**：兩段皆為空（例如備份只有回合）時 MUST 以 `role="alert"` 顯示 `LOCAL_IMPORT_MESSAGES.appendNothing`「雲端已有對戰分配機資料，這份備份沒有可附加的參賽者或歷史，未匯入任何資料。」，SHALL NOT 渲染附加確認與按鈕，SHALL NOT 讀取雲端名單，SHALL NOT 送出附加請求。
- **預覽名單的讀取**（使用者定案：送出前先讓使用者看到會新增到雲端的參賽者）：附加內容不為空時，MUST 先以 `fetchAppendPreview(expectedUserId, request)` 讀取雲端名單（`GET /api/matchmaker/players`，經既有 `fetchRemotePlayers`），讀取完成前 SHALL NOT 渲染附加確認（不另顯示讀取中文字）。
  `expectedUserId` MUST 與本次 `POST /api/import` 相同，即**選檔當下** `useSession()` 的 user id。
  - `fetchAppendPreview` MUST 以 `expectedUserId` 為第一參數；回應以既有 `PlayerListResponseSchema` 驗證；結果分類為 `ready`（含 `previewAppendPlayers(request.players, 雲端名單各列的 data)` 的結果）、`unauthorized`（401，含 `ACCOUNT_MISMATCH`）、`failed`（其他狀態碼、回應形狀不符、網路錯誤）。SHALL NOT 寫入任何本機 key。
  - `unauthorized`：MUST 顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized` 並呼叫 `useSession().refresh()`；`failed`：MUST 以 `role="alert"` 顯示 `LOCAL_IMPORT_MESSAGES.appendPreviewFailed`「無法取得雲端的參賽者名單，未匯入任何資料。請確認網路連線後再試一次。」。
    兩者皆 SHALL NOT 渲染附加確認與按鈕、SHALL NOT 送出附加請求、SHALL NOT 自動重試。
- **預覽的計算**（`previewAppendPlayers(backupPlayers, cloudPlayers)`，`lib/sync/local-import.ts` 的純函式）回傳 `{ added: string[], matched: string[] }`，規則 MUST 與 `user-data-sync`「本機備份附加到雲端的 API」的參賽者寫入規則及 `serializeAppendSegments` 的去重一致：
  ① 先依名稱去重——備份中每個名稱只保留第一位（名稱以 `name` 字串完全相同判定，不另做正規化；`PlayerSchema` 已 trim 前後空白，大小寫、全形半形與中間的空白不同即為不同名稱），同名的第二位以後不出現在任一陣列；
  ② 對保留者依備份順序判定：`id` 與雲端任一位相同，或名稱與雲端任一位完全相同 → 放入 `matched`（放備份中的名稱）；其餘 → 放入 `added`。
  預覽只是送出前的提示：實際新增與略過以後端回應為準，結果文案照下方「結果」（雲端名單可能在讀取後被其他裝置改動）。
- **附加確認**（容器 `data-testid="json-backup-append-confirm"`）MUST 依序顯示：
  - `describeAppendPreview(players, history)`：「雲端已有對戰分配機資料。可以把這份備份的 N 位參賽者、M 筆歷史附加到雲端：」（N、M 為附加內容兩段的筆數，去重前）；
  - 會新增的參賽者：`added` 不為空時，顯示 `describeAppendNewPlayers(count)`「會新增到雲端的參賽者（N 位）：」（N 為 `added` 的長度），其後為清單 `data-testid="json-backup-append-new-players"`，`added` 每個名稱依序為一個 `<li>`；
    `added` 為空時改以 `data-testid="json-backup-append-no-new-players"` 顯示 `LOCAL_IMPORT_MESSAGES.appendNoNewPlayers`「沒有會新增到雲端的參賽者。」，SHALL NOT 渲染 `json-backup-append-new-players`（「附加到雲端」按鈕照常渲染：歷史仍可能附加）；
  - 視為同一人的參賽者：`matched` 不為空時，顯示 `describeAppendMatchedPlayers(count)`「已在雲端、會視為同一人而不新增的參賽者（K 位）：」（K 為 `matched` 的長度），其後為清單 `data-testid="json-backup-append-matched-players"`，`matched` 每個名稱依序為一個 `<li>`；`matched` 為空時兩者皆 SHALL NOT 渲染；
  - 名稱提醒：`added` 不為空時，顯示 `APPEND_NAME_CHECK_HINT`「名字要完全相同才算同一人。若會新增的名單中有其實已在雲端、只是名字寫法不同的參賽者，請先取消，在本機把名字改成與雲端相同後重新匯出備份，再匯入一次；目前無法在雲端合併重複的參賽者。」；`added` 為空時 SHALL NOT 顯示；
  - `APPEND_RULES` 四條說明，以清單 `data-testid="json-backup-append-rules"` 呈現，依下列順序各為一個清單項目（`<li>`），文字固定：
    ① 「與雲端名稱完全相同或已在雲端的參賽者視為同一人，不會重複新增，也不會覆寫雲端的資料；附加的歷史會算在雲端那位參賽者身上；名稱前後的空白不計，大小寫、全形半形或中間的空白不同都視為不同人」
    ② 「雲端已有的同一場歷史不會重複新增」
    ③ 「備份中尚未完成的回合不會帶過去；請先在本機結束回合再匯出備份」
    ④ 「雲端參賽者的強度分數維持不變，附加的歷史不會反映在分數上，需要時請在參賽者頁手動調整」
  - 兩顆 `<button type="button">`：`APPEND_ACTION_LABEL`「附加到雲端」與 `APPEND_CANCEL_LABEL`「取消」。
- **使用者自行決定**：只有按下「附加到雲端」才 MUST 以 `appendBackupToCloud(expectedUserId, request)` 送出 `POST /api/import/append`；按下「取消」MUST 收起附加確認、不送出請求、不顯示訊息。
  `expectedUserId` MUST 為**按下當下** `useSession()` 的 user id（不沿用預覽名單讀取時的選檔當下 id；兩者不同時預覽可能與實際結果不符，實際結果以後端回應為準）；為 `null` 時 MUST 不送出請求、收起附加確認並顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized`。請求進行中兩顆按鈕 MUST 停用。
  每次選檔 MUST 先收起前一份的附加確認並清除前一次的結果與錯誤訊息；選檔時尚未回應的名單讀取、整份匯入或附加請求，其結果晚到時 MUST 丟棄，SHALL NOT 覆寫新一次選檔的狀態。
- **結果**（`describeAppendOutcome`，請求完成後收起附加確認）：
  - `appended`：以 `role="status"`（`data-testid="json-backup-import-message"`）顯示「已新增 N 位參賽者、M 筆歷史。」；有略過時另以補充說明（`data-testid="json-backup-import-message-note"`）顯示略過筆數：
    參賽者略過 K 位時含「略過同名或已在雲端的參賽者 K 位」、歷史略過 L 筆時含「略過已在雲端的歷史 L 筆」，兩者皆有時以「、」連接，句尾為「。」；K 與 L 皆為 0 時 SHALL NOT 顯示補充說明。
  - `unauthorized`（401，含 `ACCOUNT_MISMATCH`）：顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized` 並呼叫 `useSession().refresh()`。
  - `too-large`（413）：顯示 `LOCAL_IMPORT_MESSAGES.tooLarge`。
  - `failed`（其他狀態碼、回應形狀不符、網路錯誤）：顯示 `LOCAL_IMPORT_MESSAGES.failed`。SHALL NOT 自動重試。
  - 三種失敗與成功相同，請求完成後 MUST 收起附加確認（結果顯示在訊息區，要再附加須重新選檔）。
  - 任一結果皆 SHALL NOT 寫入任何本機 key、SHALL NOT 重新載入頁面。附加後各頁在下次掛載時自雲端讀取，本元件不另行通知其他 store。
- **請求函式**：`appendBackupToCloud(expectedUserId, request)` MUST 以 `expectedUserId` 為第一參數並原樣交給 `requestJson`；回應以 `AppendImportResponseSchema` 驗證；結果分類為 `appended`（含回應的 `appended`）、`unauthorized`、`too-large`、`failed`（409 亦為 `failed`：此端點不應回 409）。
  附加路徑字串 `/api/import/append` 只出現在 `lib/sync/local-import.ts`。
- **已知取捨**：同名但不同人的參賽者會被視為同一人而略過，其附加的歷史也會算在雲端那位身上——使用者已接受，不在此入口處理。
  反過來，同一人但名字寫法不同（打錯字、大小寫不同）會被新增為另一位參賽者，且目前沒有合併參賽者的功能——因此確認畫面在送出前列出會新增的名單與名稱提醒，由使用者先取消並在本機改名（使用者定案）。

#### Scenario: 雲端備份快照的來源

- **GIVEN** 雲端名單有 2 位、雲端有一個進行中回合與 4 筆歷史；本機有另一個回合與 3 筆歷史
- **WHEN** 呼叫雲端備份快照函式
- **THEN** 回傳的 `players`、`currentRound` 與 `history` 皆為雲端的資料，`history` 依完成順序（以 `order=asc` 請求）
- **AND** 三個雲端讀取任一失敗時回傳錯誤、不回傳快照
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端備份快照的參賽者、回合與歷史皆取自雲端」

#### Scenario: 登入資料工具：雲端歷史 CSV 的資料來源

- **GIVEN** 雲端有 2 筆歷史；本機有 3 筆不同的歷史
- **WHEN** 呼叫雲端歷史 CSV 函式
- **THEN** 回傳的 CSV 等於以雲端那 2 筆（完成順序）呼叫 `historyToCsv` 的結果；讀取失敗時回傳錯誤
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端歷史 CSV 以雲端歷史依完成順序產生」

#### Scenario: 登入資料工具：歷史匯出帶呼叫端給的帳號且 401 時標示未授權

- **WHEN** 以 `"user-a"` 呼叫雲端備份快照函式與雲端歷史 CSV 函式；另以歷史 GET 回 401 各呼叫一次
- **THEN** 每一個請求（備份的名單、回合、歷史 GET；CSV 的歷史 GET）的 `X-Expected-User-Id` 皆為 `user-a`
- **AND** 歷史 GET 回 401 時兩者的失敗結果皆帶未授權標示、訊息為 `REMOTE_TRANSFER_MESSAGES.unauthorized`；歷史 GET 回 500 時不帶該標示
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端歷史匯出的每個請求帶呼叫端給的帳號且 401 時標示未授權」

#### Scenario: 登入資料工具：登入時歷史 CSV 匯出來自雲端

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

（B9 起本 Scenario 的意義為「本機覆寫式的 JSON 還原在登入時停用」；標題沿用主 spec 以符合 OpenSpec MODIFIED 不可丟棄既有 Scenario 的限制，見 design Open Questions。）

- **GIVEN** 以測試帳號登入
- **WHEN** 開啟資料頁
- **THEN** 本機覆寫式還原的選檔（`json-backup-import-input`）不存在，B6 的停用說明文字不再顯示；改顯示雲端匯入的選檔（`json-backup-cloud-import-input`）與上表的說明文字
- **驗收**：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`，test 名稱「登入時以 JSON 備份匯入到空的雲端且不寫入本機」

#### Scenario: 登入資料工具：以 JSON 備份匯入到空的雲端

- **GIVEN** 以測試帳號登入、雲端資料已清空；準備一份含 2 位參賽者與 1 筆歷史的合法備份檔；本機 `matchmaker:roster:v1` 有一份不同的訪客名單
- **WHEN** 在資料頁的「從 JSON 備份匯入到雲端」選取該檔
- **THEN** 顯示匯入成功與筆數；參賽者頁顯示那 2 位；本機 `matchmaker:roster:v1` 的內容與匯入前相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`，test 名稱「登入時以 JSON 備份匯入到空的雲端且不寫入本機」

#### Scenario: 登入資料工具：雲端 JSON 匯入以點擊當下的帳號送出且未授權時刷新 session

- **GIVEN** 雲端模式，`useSession` 為使用者 A
- **WHEN** 選取一份合法備份檔，`POST /api/import` 回 401
- **THEN** 請求的 `X-Expected-User-Id` 為 A 的 id；顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized`；`refresh` 被呼叫一次；本機 key 皆未改變
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「雲端 JSON 匯入以點擊當下的帳號送出且未授權時刷新 session」

#### Scenario: 登入資料工具：雲端已有資料時顯示附加確認，按下附加到雲端才送出

- **GIVEN** 雲端模式，`useSession` 為使用者 A；`POST /api/import` 回 409，`GET /api/matchmaker/players` 回雲端名單一位「甲」（id 與備份不同），`POST /api/import/append` 回 200 且 `appended` 為 `{ players: { added: 1, skipped: 1 }, history: { added: 1, skipped: 0 } }`（回應以可控的 Promise 延後）
- **WHEN** 選取一份含 2 位參賽者（「甲」「丙」）、1 筆歷史與一個進行中回合的合法備份檔；確認出現後把 `useSession` 換成使用者 B 再按「附加到雲端」
- **THEN** 選檔後依序只有兩個請求：`POST /api/import` 與 `GET /api/matchmaker/players`，兩者的 `X-Expected-User-Id` 皆為 A 的 id；附加確認顯示「雲端已有對戰分配機資料。可以把這份備份的 2 位參賽者、1 筆歷史附加到雲端：」、
  `describeAppendNewPlayers(1)` 與只有「丙」的 `json-backup-append-new-players`、`describeAppendMatchedPlayers(1)` 與只有「甲」的 `json-backup-append-matched-players`、`APPEND_NAME_CHECK_HINT`；`json-backup-append-rules` 的四條說明依序為清單項目、兩顆按鈕的 `type` 皆為 `button`；`LOCAL_IMPORT_MESSAGES.cloudNotEmpty` 不存在
- **AND** 按下後第三個請求為 `POST /api/import/append`、`X-Expected-User-Id` 為 B 的 id、body 為 `{ players, history }`（不含 `currentRound`）；回應前兩顆按鈕停用；回應後附加確認消失，`json-backup-import-message` 為「已新增 1 位參賽者、1 筆歷史。」，補充說明為「略過同名或已在雲端的參賽者 1 位。」；`refresh` 未被呼叫；本機 key 皆未改變
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「雲端已有資料時顯示附加確認、預覽名單與四條說明，按下附加到雲端才以當下帳號送出附加請求」

#### Scenario: 登入資料工具：取消附加或重新選檔不送出附加請求

- **GIVEN** 同上，`POST /api/import` 依序回 409、409、200，`GET /api/matchmaker/players` 回合法名單
- **WHEN** 選檔後在附加確認按「取消」；再選一次同一份檔（409）讓附加確認出現，接著改選另一份備份檔且這次 `POST /api/import` 回 200
- **THEN** 按下取消後附加確認消失，沒有 `role="alert"` 與 `json-backup-import-message`；改選檔後附加確認消失並顯示整份匯入的成功文案；三次選檔共三個 `POST /api/import`、兩個 `GET /api/matchmaker/players`（只在 409 之後），`POST /api/import/append` 從未送出；本機 key 皆未改變
- **AND**（以下四段各自重新 render、另設回應序列；選檔元素進行中不停用，晚到情境皆可能發生）晚到的舊結果皆被丟棄、不覆寫新狀態：
  ① 名單 GET 晚到——`POST /api/import` 依序回 409、200，名單 GET 延後；第一次選檔（409）後名單尚未回應即改選另一份檔（200，顯示成功文案），之後名單才回應 → 附加確認不出現、成功文案仍在；
  ② 整份匯入 POST 晚到——第一個 `POST /api/import` 延後、第二個回 200；第一次選檔未回應即改選另一份檔（顯示成功文案），之後第一個 POST 才以 409 回應 → 附加確認與 `role="alert"` 皆不出現、不讀取名單（`GET /api/matchmaker/players` 0 次）、成功文案仍在；
  ③ 附加 POST 晚到——`POST /api/import` 依序回 409、200；附加確認出現後按「附加到雲端」，附加請求未回應即改選另一份檔（200，顯示成功文案），之後附加才以 500 回應 → 不出現 `role="alert"`、成功文案仍在、本機 key 皆未改變
- **AND** 選檔開頭清除前次的成功文案與錯誤：`POST /api/import` 依序回 200、409、409——先選檔得 200 顯示成功文案，再選檔得 409 時附加確認出現且 `json-backup-import-message` 不存在；接著選一份不支援版本的檔（`parseBackup` 驗證失敗、不送請求）出現 `role="alert"`，再選檔得 409 時附加確認出現且 `role="alert"` 已消失
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「附加確認按下取消或重新選檔時不送出附加請求並收起確認」

#### Scenario: 登入資料工具：附加請求失敗的文案與 session 刷新

- **GIVEN** 雲端模式，`POST /api/import` 一律回 409，`GET /api/matchmaker/players` 回合法名單
- **WHEN** 分別在附加請求回 401、413、500 時按「附加到雲端」；另在確認出現後把 `useSession` 換成 user 沒有 id 的 session 再按
- **THEN** 401 顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized` 且 `refresh` 被呼叫一次；413 顯示 `LOCAL_IMPORT_MESSAGES.tooLarge`；500 顯示 `LOCAL_IMPORT_MESSAGES.failed`；後兩者不呼叫 `refresh`；
  user 沒有 id 時不送出附加請求並顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized`；每一輪皆無成功訊息、本機 key 皆未改變；每一輪結束後 `json-backup-append-confirm` 已收起（含帳號為 null 那輪）
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「附加請求未授權時刷新 session，資料過大與其他失敗顯示對應文案且不寫入本機」

#### Scenario: 登入資料工具：備份沒有可附加的內容

- **GIVEN** 雲端模式，`POST /api/import` 回 409
- **WHEN** 選取一份只有進行中回合、沒有參賽者與歷史的合法備份檔
- **THEN** 以 `role="alert"` 顯示 `LOCAL_IMPORT_MESSAGES.appendNothing`；附加確認與「附加到雲端」按鈕不存在；請求只有 `POST /api/import` 一個（不讀取雲端名單）
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「備份沒有可附加的參賽者與歷史時顯示無可附加且不渲染附加按鈕」

#### Scenario: 登入資料工具：雲端為空時整份匯入不變

- **GIVEN** 雲端模式，`POST /api/import` 回 200
- **WHEN** 選取一份合法備份檔
- **THEN** 顯示既有的整份匯入成功文案；附加確認不存在；請求只有 `POST /api/import` 一個（不讀取雲端名單）
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「雲端沒有資料時照舊整份匯入且不顯示附加確認」（regression guard）

#### Scenario: 登入資料工具：附加確認在沒有會新增的參賽者時顯示提示且仍可附加

- **GIVEN** 雲端模式，`POST /api/import` 回 409，`GET /api/matchmaker/players` 回雲端名單一位「甲」
- **WHEN** 選取一份只有參賽者「甲」（id 與雲端不同）與 1 筆歷史的合法備份檔
- **THEN** 附加確認顯示 `json-backup-append-no-new-players` 為 `LOCAL_IMPORT_MESSAGES.appendNoNewPlayers`；`json-backup-append-new-players` 與 `APPEND_NAME_CHECK_HINT` 不存在；`json-backup-append-matched-players` 只有「甲」；「附加到雲端」按鈕存在且可按
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「附加確認在沒有會新增的參賽者時顯示提示且仍可附加歷史」

#### Scenario: 登入資料工具：讀取雲端名單失敗時不顯示附加確認

- **GIVEN** 雲端模式，`useSession` 為使用者 A，`POST /api/import` 一律回 409
- **WHEN** 兩輪（各輪重新 render）選取同一份合法備份檔：`GET /api/matchmaker/players` 分別回 401、500
- **THEN** 401 時顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized` 且 `refresh` 被呼叫一次；500 時以 `role="alert"` 顯示 `LOCAL_IMPORT_MESSAGES.appendPreviewFailed` 且 `refresh` 未增加；
  兩輪皆不存在 `json-backup-append-confirm` 與「附加到雲端」按鈕、`POST /api/import/append` 從未送出、沒有 `json-backup-import-message`；本機 key 皆未改變
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「讀取雲端名單未授權時刷新 session，其他失敗顯示讀取失敗，兩者皆不顯示附加確認」

#### Scenario: 登入資料工具：附加預覽依後端規則列出會新增與視為同一人的參賽者

（fixture 與 `user-data-sync`「附加 API：略過同名或已存在的參賽者與重複歷史，其餘依備份順序接在後面」「附加 API：備份內同名的參賽者只新增第一位」的後端 it 相同，兩邊各自斷言同一組結果，作為規則一致的保證。）

- **WHEN** 以下列四組呼叫 `previewAppendPlayers(backupPlayers, cloudPlayers)`：
  ① 雲端 `c1`「甲」、`c2`「乙」；備份 `b1`「甲」、`b2`「丙」、`c2`「改名乙」、`b3`「丁」
  ② 雲端「甲」；備份 `x1`「戊」、`x2`「戊」、`x3`「己」
  ③ 雲端 `c1`「甲」；備份 `c1`「戊」、`x2`「戊」（名稱的第一位因 id 已在雲端而略過）
  ④ 雲端「Amy」；備份「amy」、「Amy」（另一次呼叫：備份「Amy」、「Ａmy」（全形）、「A my」（中間空白），結果須為全形與中間空白者皆會新增）
- **THEN** 依序為 ① `{ added: ["丙", "丁"], matched: ["甲", "改名乙"] }`（與後端 `added` 2、`skipped` 2 一致）；② `{ added: ["戊", "己"], matched: [] }`（與後端 `added` 2、`skipped` 1 一致）；③ `{ added: [], matched: ["戊"] }`；④ `{ added: ["amy"], matched: ["Amy"] }`；另一次呼叫為 `{ added: ["Ａmy", "A my"], matched: ["Amy"] }`
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「previewAppendPlayers 依後端的同名與 id 規則列出會新增與視為同一人的參賽者」

#### Scenario: 登入資料工具：附加預覽以呼叫端給的帳號讀取雲端名單

- **WHEN** 以 `"user-a"` 與一份含 2 位參賽者的附加內容呼叫 `fetchAppendPreview`，回應分別為 200（合法名單）、200（形狀不符）、401、500、網路錯誤
- **THEN** 五次請求皆為 `GET /api/matchmaker/players` 且 `X-Expected-User-Id` 為 `user-a`；結果依序為 `ready`（`preview` 等於以同一份名單呼叫 `previewAppendPlayers` 的結果）、`failed`、`unauthorized`、`failed`、`failed`；呼叫前後本機五個 key 逐字相同
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「fetchAppendPreview 以呼叫端給的帳號讀取雲端名單並分類為預覽、未授權或失敗」

#### Scenario: 登入資料工具：附加請求的組成與結果分類

- **WHEN** 以一份含參賽者、歷史與進行中回合的備份呼叫 `backupToAppendRequest`；另以 `"user-a"` 呼叫 `appendBackupToCloud`，回應分別為 200（合法形狀）、200（形狀不符）、401、409、413、500、網路錯誤
- **THEN** 轉換結果恰為 `{ players: backup.players, history: backup.history }`；七次請求皆為 `POST /api/import/append` 且 `X-Expected-User-Id` 為 `user-a`；
  結果依序為 `appended`（含回應的 `appended`）、`failed`、`unauthorized`、`failed`、`too-large`、`failed`、`failed`；呼叫前後本機五個 key 逐字相同
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「backupToAppendRequest 只取備份的參賽者與歷史」「appendBackupToCloud 依回應分類為已附加、未授權、資料過大或失敗且不改動本機」

#### Scenario: 登入資料工具：附加結果與確認的文案

- **WHEN** 以 `appended` 的四種略過組合（皆有、只有參賽者、只有歷史、皆為 0）與 `unauthorized`、`too-large`、`failed` 呼叫 `describeAppendOutcome`；讀取 `describeAppendPreview(2, 1)`、`describeAppendNewPlayers(3)`、`describeAppendMatchedPlayers(2)`、`APPEND_NAME_CHECK_HINT`、`APPEND_RULES`、`APPEND_ACTION_LABEL`、`APPEND_CANCEL_LABEL`、
  `LOCAL_IMPORT_MESSAGES.appendNothing`、`LOCAL_IMPORT_MESSAGES.appendNoNewPlayers`、`LOCAL_IMPORT_MESSAGES.appendPreviewFailed` 與 `LOCAL_IMPORT_MESSAGES.jsonCloudImportHint`
- **THEN** 成功皆為 `tone: "success"`、`text` 為「已新增 N 位參賽者、M 筆歷史。」；`note` 依序為「略過同名或已在雲端的參賽者 K 位、略過已在雲端的歷史 L 筆。」「略過同名或已在雲端的參賽者 K 位。」「略過已在雲端的歷史 L 筆。」與不存在；
  三種失敗依序為 `REMOTE_TRANSFER_MESSAGES.unauthorized`、`LOCAL_IMPORT_MESSAGES.tooLarge`、`LOCAL_IMPORT_MESSAGES.failed` 且 `tone: "error"`；
  其餘常數與本 Requirement「附加到雲端」所列文字逐字相同，`APPEND_RULES` 恰為四條且順序相同
- **驗收**：`nextjs-pickball/components/matchmaker/local-import-view.test.ts`，it 名稱「附加結果依略過筆數組成新增與略過的文案」「附加確認的說明、預覽名單標題與提醒、四條說明與按鈕文字為固定值」

#### Scenario: 登入資料工具：雲端已有資料時以 JSON 備份附加參賽者與歷史

- **GIVEN** 以測試帳號登入、雲端資料已清空後以 `POST /api/import` 建立雲端資料：參賽者「共同甲」（rating 3）、「雲端乙」，歷史 `ch1`，一個含進行中場次的回合；
  準備一份備份檔：參賽者「共同甲」（不同 id、rating 5）、「新人丙」，歷史 `ch1` 與 `bh2`（`bh2` 由備份的「共同甲」與「新人丙」對戰），以及另一個進行中回合；雲端的 `ch1` 由雲端「共同甲」與「雲端乙」對戰
- **WHEN** 在資料頁的「從 JSON 備份匯入到雲端」選取該檔，看到附加確認後按「附加到雲端」
- **THEN** 附加確認顯示 2 位參賽者、2 筆歷史與四條說明；`json-backup-append-new-players` 只有「新人丙」、`json-backup-append-matched-players` 只有「共同甲」；結果為「已新增 1 位參賽者、1 筆歷史。」，補充說明為「略過同名或已在雲端的參賽者 1 位、略過已在雲端的歷史 1 筆。」；頁面未重新載入、本機 key 未改變
- **AND** 參賽者頁依序顯示「共同甲」「雲端乙」「新人丙」，且雲端「共同甲」的 rating 仍為 3；歷史頁「今日」恰有 2 筆紀錄；統計頁雲端「共同甲」那一列（`player-stat-row-<雲端 id>`）的出場數為 2（含附加的 `bh2`），沒有以備份「共同甲」id 為鍵的列；雲端回合與附加前相同（`GET /api/matchmaker/round` 的 `data` 與 `version` 不變）
- **驗收**：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`，test 名稱「登入時雲端已有資料時以 JSON 備份附加參賽者與歷史且不覆寫雲端」
