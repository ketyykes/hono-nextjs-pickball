## MODIFIED Requirements

### Requirement: 登入時的資料工具頁

`/matchmaker/data` 在雲端模式（`user-data-sync`「前端依 session 選擇儲存模式」）下 SHALL 依下表調整資料來源；本機模式一律維持既有行為與程式路徑。

| 功能 | 雲端模式的行為 |
|---|---|
| JSON 匯出 | `buildBackup` 的快照中 `players` MUST 取自 `GET /api/matchmaker/players`、`currentRound` MUST 取自 `GET /api/matchmaker/round`、`history` MUST 取自 `GET /api/matchmaker/history?order=asc`（全部、完成順序）。任一雲端讀取失敗時 MUST 顯示錯誤、不下載 |
| JSON 還原 | 改為「**從 JSON 備份匯入到雲端**」：本機模式的覆寫式還原（選檔 `json-backup-import-input`、`writeBackup`、`location.reload()`）MUST 不渲染；改渲染雲端匯入的選檔（`data-testid` 為 `json-backup-cloud-import-input`），並顯示說明「登入時選擇的備份檔會匯入到雲端，只有雲端沒有任何對戰分配機資料時才會寫入；不會覆寫或合併雲端資料，也不會寫入本機」。選檔後以既有 `parseBackup` 驗證（失敗訊息與本機模式相同），通過後以 `backupToImportRequest` 轉換、經 `importLocalData` 送出 `POST /api/import`（`scoreboard` 為 `{ current: null, matches: [] }`），結果文案與拒絕規則與「登入後匯入本機資料到雲端」相同——雲端已有對戰分配機資料時拒絕、不覆寫、不合併；SHALL NOT 寫入任何本機 key、SHALL NOT 重新載入頁面 |
| 匯入本機資料 | 見「登入後匯入本機資料到雲端」 |
| 參賽者 CSV 匯入 | 見「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」的登入分支 |
| 歷史 CSV 匯出 | 歷史 MUST 取自 `GET /api/matchmaker/history?order=asc`，CSV 欄位與格式由既有 `historyToCsv` 產生（不另寫）；讀取失敗時 MUST 顯示錯誤、不下載 |
| 清除本機資料 | 不變（只清本機 key，不呼叫任何雲端 API） |

「JSON 完整備份的匯出內容」表中 `players`、`currentRound` 與 `history` 的來源（`matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`），以及「歷史賽果的 CSV 匯出」的資料來源，在雲端模式下以本表為準；`buildBackup` 本身仍是純函式、不變。
雲端分支的資料讀取 MUST 經 `nextjs-pickball/lib/matchmaker/remote-transfer.ts`，元件層只負責選檔、下載與顯示。

歷史的兩個匯出與「從 JSON 備份匯入到雲端」都是 `user-data-sync`「雲端 store 以登入帳號為界」所稱的**一次性雲端操作**：`buildRemoteBackupSnapshot(expectedUserId)` 的名單、回合與歷史三個 GET MUST 使用同一個 `expectedUserId`；
雲端歷史 CSV 函式 MUST 以 `expectedUserId` 為第一參數。任一 GET 回 401（含 `ACCOUNT_MISMATCH`）時，失敗結果 MUST 帶既有的機器可讀未授權標示（訊息為 `REMOTE_TRANSFER_MESSAGES.unauthorized`）；
`HistoryCsvSection` 的雲端分支 MUST 以點擊當下 `useSession()` 的 user id 呼叫，失敗時顯示訊息、不下載，結果為未授權時 MUST 呼叫 `useSession().refresh()`。
雲端歷史 CSV 讀取失敗（非未授權）時的訊息為「無法取得雲端的歷史賽果，未產生 CSV 檔。請確認網路連線後再試一次。」；雲端備份快照的任一讀取失敗沿用既有 `backupFetchFailed`。
`JsonBackupSection` 的雲端 JSON 匯入 MUST 以點擊（選檔）當下 `useSession()` 的 user id 作為 `importLocalData` 的第一參數；該 user id 為 `null` 時 MUST 不送出請求並顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized`；結果為 `unauthorized` 時 MUST 顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized` 並呼叫 `useSession().refresh()`。

JSON 還原在雲端模式的語意（B6 暫停、B9 定案）：本機模式的還原是「以檔案覆寫全部資料」；雲端模式下覆寫會讓另一台裝置正在使用的資料無預警消失，合併則會產生重複的參賽者與歷史，
因此採與匯入本機資料**相同的拒絕規則**——只有雲端沒有任何對戰分配機資料時才寫入。要以備份取代雲端資料的使用者，先在參賽者頁重置名單（清除雲端的名單、回合、分槽與歷史）再匯入。

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

## ADDED Requirements

### Requirement: 登入後匯入本機資料到雲端

雲端模式（`user-data-sync`「前端依 session 選擇儲存模式」）下，資料頁 SHALL 提供「匯入本機資料到雲端」區塊，把訪客時期留在本機的五個 key
（`matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`、`scoreboard:matches:v1`、`scoreboard:current:v1`）一次匯入後端（`user-data-sync`「本機資料匯入雲端的 API」）。

**匯入內容的組成**（`nextjs-pickball/lib/sync/local-import.ts` 的 `buildLocalImportPayload()`，只讀不寫）：

- 一律經既有 reader（`readRoster`、`readRound`、`readHistory`、`readScoreboard(matchId)`、`readScoreboard(null)`）取得資料，SHALL NOT 自行 `JSON.parse` 或直接讀取 `scoreboard:matches:v1`——損毀資料的降級規則只有一份。
- 分槽只對本機目前回合中**未完成**的場次逐一呼叫 `readScoreboard(matchId)`，有值者納入（與雲端的分槽不變式一致）；不屬於這些場次的分槽不讀取、不匯入。
- 歷史依本機的追加順序送出；`matchId` 重複者只保留第一筆並計數（本機資料在正常操作下不會重複，這是對損毀資料的防線）。
- 回傳 `{ payload, summary, isEmpty, oversize }`：`summary` 含各段筆數與略過的重複歷史筆數；五段皆無資料時 `isEmpty` 為 true；
  任一段（名單、歷史、分槽）序列化後超過 1,900,000 位元組時 `oversize` 為 true（D1 單一參數上限 2MB，見 design Decision 2）。

**畫面**：

- `isEmpty` 時顯示「本機沒有可匯入的資料」，不渲染匯入按鈕。
- `oversize` 時顯示「本機資料量超過單次匯入上限，請先匯出 JSON 備份後聯絡管理者」，不渲染匯入按鈕。
- 其餘情況顯示各段筆數與說明（「只有在雲端沒有任何對戰分配機資料時才能匯入；匯入後本機資料會保留」），按鈕按下後送出，期間停用按鈕。
- 成功：顯示「已匯入 N 位參賽者、M 筆歷史…」（回應的 `scoreboardCurrent` 為 `skipped` 時另顯示「雲端已有進行中的獨立計分板，未匯入該場」）；**本機五個 key MUST 保留不動**（使用者定案：匯入成功後保留本機資料）。
- 409：顯示「雲端已有對戰分配機資料，無法匯入。若要以本機資料取代，請先在參賽者頁重置名單。」；不寫入任何資料。
- 401（含 `ACCOUNT_MISMATCH`）：顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized` 並呼叫 `useSession().refresh()`；其他失敗顯示「匯入失敗，請稍後再試」。SHALL NOT 自動重試（匯入不是冪等的最新優先儲存，重送交給使用者決定；重送本身由後端拒絕規則保證不重複）。

**帳號**（`user-data-sync`「前端使用者資料請求帶預期帳號」「雲端 store 以登入帳號為界」）：匯入是一次性雲端操作。`importLocalData(expectedUserId, payload)` MUST 以 `expectedUserId` 為**第一參數**並原樣交給 `requestJson`；
`LocalDataImportSection` MUST 以點擊當下 `useSession()` 的 user id 呼叫，該 user id 為 `null` 時 MUST 不送出請求並顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized`。匯入路徑字串 `/api/import` 只出現在 `lib/sync/local-import.ts`。

**參賽者頁提示**：雲端模式下，雲端名單載入完成（`synced`）且為空、而本機有可匯入的資料（`hasImportableLocalData()`）時，
`/matchmaker/players` MUST 顯示非阻斷提示，連結到資料頁的匯入區塊；雲端名單非空或本機無資料時 SHALL NOT 顯示。

實作位於 `nextjs-pickball/lib/sync/local-import.ts`、`nextjs-pickball/components/matchmaker/LocalDataImportSection.tsx`、`nextjs-pickball/components/matchmaker/LocalImportNotice.tsx`。

#### Scenario: 匯入本機資料：匯入內容讀取本機五個 key 並略過孤兒分槽與重複歷史

- **GIVEN** 本機有 3 位參賽者、一個含 `pending` 的 `m1` 與 `completed` 的 `m2` 的回合、3 筆歷史（其中兩筆 `matchId` 相同）、`m1`／`m2`／`m9` 三個分槽、一場獨立計分板
- **WHEN** 呼叫 `buildLocalImportPayload()`
- **THEN** `payload` 含 3 位參賽者、該回合、2 筆歷史（依原順序、保留第一筆）、只有 `m1` 的分槽、該獨立計分板；`summary` 回報略過 1 筆重複歷史
- **AND** 呼叫前後本機五個 key 的內容逐字相同
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「buildLocalImportPayload 讀取本機五個 key 並略過孤兒分槽與重複歷史」

#### Scenario: 匯入本機資料：本機沒有資料或資料過大

- **WHEN** 本機五個 key 皆不存在；另一次本機歷史序列化後超過 1,900,000 位元組
- **THEN** 前者 `isEmpty` 為 true；後者 `oversize` 為 true
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「本機沒有資料時回報 isEmpty，任一段超過上限時回報 oversize」

#### Scenario: 匯入本機資料：匯入結果的分類

- **WHEN** `POST /api/import` 分別回 200、409、401、500
- **THEN** `importLocalData` 依序回傳 `imported`（含回應的筆數）、`cloud-not-empty`、`unauthorized`、`failed`；四種情況皆不改動本機任何 key
- **AND** 每次請求皆為 `POST /api/import`，`X-Expected-User-Id` 為呼叫端給的第一參數（例：`"user-a"`）
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「importLocalData 依回應分類為已匯入、雲端已有資料、未授權或失敗且不改動本機」

#### Scenario: 匯入本機資料：JSON 備份轉為匯入請求

- **GIVEN** 一份通過 `parseBackup` 的備份
- **WHEN** 呼叫 `backupToImportRequest(backup)`
- **THEN** 回傳的請求含備份的 `players`、`currentRound`、`history`，`scoreboard` 為 `{ current: null, matches: [] }`
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「JSON 備份轉為匯入請求時計分板為空」

#### Scenario: 匯入本機資料：判斷本機是否有可匯入的資料

- **WHEN** 分別在「五個 key 皆不存在」「只有 `scoreboard:current:v1`」「只有一筆歷史」時呼叫 `hasImportableLocalData()`
- **THEN** 依序為 false、true、true
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「hasImportableLocalData 只在任一 key 有資料時為 true」

#### Scenario: 匯入本機資料：登入後匯入本機資料到空的雲端並保留本機資料

- **GIVEN** 本機以訪客身分留下 2 位參賽者、一個回合、1 筆歷史；以測試帳號登入、雲端資料已清空
- **WHEN** 在資料頁按「匯入本機資料到雲端」
- **THEN** 顯示匯入成功與筆數；參賽者頁顯示那 2 位、歷史頁「今日」顯示那筆歷史（seed 的 `playedAt` 為測試當下）、對戰頁顯示該回合；本機五個 key 與匯入前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`，test 名稱「登入後匯入本機資料到空的雲端並保留本機資料」

#### Scenario: 匯入本機資料：重複匯入被拒絕且不產生重複歷史

- **GIVEN** 已完成一次匯入
- **WHEN** 再按一次「匯入本機資料到雲端」
- **THEN** 顯示「雲端已有對戰分配機資料，無法匯入。若要以本機資料取代，請先在參賽者頁重置名單。」；歷史頁的筆數與第一次匯入後相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`，test 名稱「重複匯入時顯示雲端已有資料且歷史不重複」

#### Scenario: 匯入本機資料：雲端名單為空且本機有資料時參賽者頁提示匯入

- **GIVEN** 以測試帳號登入、雲端資料已清空，本機有訪客名單
- **WHEN** 開啟 `/matchmaker/players`；之後匯入完成再重新開啟
- **THEN** 第一次顯示匯入提示與前往資料頁的連結；第二次（雲端名單非空）不顯示
- **驗收**：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`，test 名稱「雲端名單為空且本機有資料時參賽者頁顯示匯入提示」

#### Scenario: 匯入本機資料：本機沒有資料時不提供匯入按鈕

- **GIVEN** 以測試帳號登入，本機五個 key 皆不存在
- **WHEN** 開啟資料頁
- **THEN** 匯入區塊顯示「本機沒有可匯入的資料」，匯入按鈕不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`，test 名稱「本機沒有資料時匯入區塊不提供匯入按鈕」

#### Scenario: 匯入本機資料：匯入以點擊當下的帳號送出且未授權時刷新 session

- **GIVEN** 雲端模式，`useSession` 為使用者 A，本機有可匯入的資料
- **WHEN** 按下匯入按鈕，`POST /api/import` 回 401
- **THEN** 請求的 `X-Expected-User-Id` 為 A 的 id；顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized`；`refresh` 被呼叫一次；本機五個 key 皆未改變
- **驗收**：`nextjs-pickball/components/matchmaker/LocalDataImportSection.test.tsx`，it 名稱「匯入以點擊當下的帳號送出且未授權時刷新 session」
