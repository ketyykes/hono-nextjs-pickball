# Specification: data-transfer

## MODIFIED Requirements

### Requirement: 登入後匯入本機資料到雲端

雲端模式（`user-data-sync`「前端依 session 選擇儲存模式」）下，資料頁 SHALL 提供「匯入本機資料到雲端」區塊，把訪客時期留在本機的五個 key
（`matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`、`scoreboard:matches:v1`、`scoreboard:current:v1`）一次匯入後端（`user-data-sync`「本機資料匯入雲端的 API」）。

**匯入內容的組成**（`nextjs-pickball/lib/sync/local-import.ts` 的 `buildLocalImportPayload()`，只讀不寫）：

- 一律經既有 reader（`readRoster`、`readRound`、`readHistory`、`readScoreboard(matchId)`、`readScoreboard(null)`）取得資料，SHALL NOT 自行 `JSON.parse` 或直接讀取 `scoreboard:matches:v1`——損毀資料的降級規則只有一份。
- 分槽只對本機目前回合中**未完成**的場次逐一呼叫 `readScoreboard(matchId)`，有值者納入（與雲端的分槽不變式一致）；不屬於這些場次的分槽不讀取、不匯入。
- 歷史依本機的追加順序送出；`matchId` 重複者只保留第一筆並計數（本機資料在正常操作下不會重複，這是對損毀資料的防線）。
- 回傳 `{ payload, summary, isEmpty, oversize }`：`summary` 含各段筆數與略過的重複歷史筆數；五段皆無資料時 `isEmpty` 為 true；
  `oversize` 為 `!checkImportLimits(payload).ok`（`@pickball/core/api/import`，即後端在送出 D1 batch 前使用的同一個判定）：參賽者超過 500 位，或以 `serializeImportSegments` 組成的五段 `json_each` 參數（名單、回合、分槽、歷史、獨立計分板）任一段的 UTF-8 位元組數超過 1,900,000 時為 true。
  SHALL NOT 以原始陣列量測或在前端另寫門檻數字——後端參數另有包裝（例：歷史每筆另含 `matchId` 與 `playedAt`），以原始陣列量測會讓邊緣資料通過前端判定卻被後端拒絕。
  `payload` 由既有 reader 以與 `LocalImportRequestSchema` 相同的 schema 解析而來，後端驗證後的請求與 `payload` 序列化結果相同，因此兩端判定一致。

**畫面**：

- `isEmpty` 時顯示「本機沒有可匯入的資料」，不渲染匯入按鈕。
- `oversize` 時顯示「本機資料量超過單次匯入上限，請先匯出 JSON 備份後聯絡管理者」，不渲染匯入按鈕。
- 其餘情況顯示各段筆數與說明（「只有在雲端沒有任何對戰分配機資料時才能匯入；匯入後本機資料會保留」），按鈕按下後送出，期間停用按鈕。
- 成功：顯示「已匯入 N 位參賽者、M 筆歷史…」（回應的 `scoreboardCurrent` 為 `skipped` 時另顯示「雲端已有進行中的獨立計分板，未匯入該場」）；**本機五個 key MUST 保留不動**（使用者定案：匯入成功後保留本機資料）。
- 409：顯示「雲端已有對戰分配機資料，無法匯入。若要以本機資料取代，請先在參賽者頁重置名單。」；不寫入任何資料。
- 413（`PAYLOAD_TOO_LARGE`）：`importLocalData` 回 `{ kind: "too-large" }`，顯示 `LOCAL_IMPORT_MESSAGES.tooLarge`「資料量超過單次匯入上限，本次沒有匯入任何資料。請聯絡管理者協助匯入。」；不寫入任何資料。
  正常情況下 `oversize` 已在送出前阻擋本區塊的匯入；413 主要來自「從 JSON 備份匯入到雲端」（該入口沒有送出前的大小預覽），兩個入口的結果文案沿用同一份 `describeImportOutcome`。
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

- **WHEN** 本機五個 key 皆不存在；另分別讓名單、歷史、分槽三段經 `serializeImportSegments` 後恰為 1,900,000 位元組與多 1 位元組
- **THEN** 前者 `isEmpty` 為 true；三段恰為上限時 `oversize` 為 false、多 1 位元組時為 true；兩段各自未超過但加總超過時為 false
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

#### Scenario: 匯入本機資料：oversize 以後端參數形狀判定且與後端一致

- **GIVEN** 本機歷史的原始陣列序列化後不超過 1,900,000 位元組，但經 `serializeImportSegments` 包裝後的歷史段超過 1,900,000 位元組（B9 實測情境：原始 1,880,596 B、包裝後約 2,100,131 B 的同型資料）
- **WHEN** 呼叫 `buildLocalImportPayload()`
- **THEN** `oversize` 為 true
- **AND** 對歷史段恰為上限與多 1 位元組的兩份本機資料，`oversize` 皆等於 `!checkImportLimits(LocalImportRequestSchema.parse(payload)).ok`（後端在 validator 之後做的同一個判定）
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「oversize 以後端 json_each 參數的形狀判定，與後端對同一份請求的判定一致」

#### Scenario: 匯入本機資料：本機參賽者超過 500 位時為資料過大

- **WHEN** 本機名單分別有 500 位與 501 位參賽者（各段位元組皆未超過）
- **THEN** 前者 `oversize` 為 false，後者為 true；兩者 `hasImportableLocalData()` 皆為 true
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「本機參賽者超過 500 位時回報 oversize」

#### Scenario: 匯入本機資料：413 分類為資料過大

- **WHEN** `POST /api/import` 回 413
- **THEN** `importLocalData` 回 `{ kind: "too-large" }`；本機五個 key 皆未改變；其他 4xx（例：400）仍為 `failed`
- **驗收**：`nextjs-pickball/lib/sync/local-import.test.ts`，it 名稱「importLocalData 在 413 時回報資料過大且不改動本機」

#### Scenario: 匯入本機資料：資料過大的結果文案

- **WHEN** 以 `{ kind: "too-large" }` 呼叫 `describeImportOutcome`
- **THEN** 回 `{ tone: "error", text: LOCAL_IMPORT_MESSAGES.tooLarge }`，且該文案與 `failed`、`cloudNotEmpty`、`unauthorized` 的文案皆不同
- **驗收**：`nextjs-pickball/components/matchmaker/local-import-view.test.ts`，it 名稱「資料過大的匯入結果對應到超過上限的錯誤文案」

#### Scenario: 匯入本機資料：雲端 JSON 匯入遇到 413 時顯示資料量超過上限

- **GIVEN** 雲端模式，`useSession` 為使用者 A
- **WHEN** 選取一份合法備份檔，`POST /api/import` 回 413
- **THEN** 顯示 `LOCAL_IMPORT_MESSAGES.tooLarge`；不顯示成功訊息；`refresh` 未被呼叫；本機 key 皆未改變
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「雲端 JSON 匯入遇到 413 時顯示資料量超過上限且不寫入本機」

#### Scenario: 匯入本機資料：登入時以超過上限的 JSON 備份匯入雲端

- **GIVEN** 以測試帳號登入、雲端資料已清空；準備一份含 501 位參賽者的合法備份檔
- **WHEN** 在資料頁的「從 JSON 備份匯入到雲端」選取該檔，之後開啟參賽者頁
- **THEN** 資料頁顯示 `LOCAL_IMPORT_MESSAGES.tooLarge`；參賽者頁的雲端名單為空
- **驗收**：`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts`，test 名稱「登入時以超過 500 位參賽者的 JSON 備份匯入雲端時顯示資料量超過上限且雲端不寫入」

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
名單保持不變。POST 回 413（`PAYLOAD_TOO_LARGE`：新增超過 500 位或 body 超過上限，見 `player-roster`「參賽者雲端 API」）時，訊息 MUST 為 `REMOTE_TRANSFER_MESSAGES.importTooLarge`「匯入的資料量超過單次上限（一次最多 500 位參賽者），本次沒有匯入任何資料。請將 CSV 分成較小的檔案後再匯入。」；其餘 4xx 與 5xx 維持 `importFailed`。SHALL NOT 讀寫本機 `matchmaker:roster:v1`。

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

#### Scenario: 雲端 CSV 匯入超過上限

- **WHEN** GET 雲端名單成功，POST `/api/matchmaker/players/import` 回 413
- **THEN** 回傳 `{ ok: false, message: REMOTE_TRANSFER_MESSAGES.importTooLarge }`，不帶未授權標示，不視為成功
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端 CSV 匯入遇到 413 時回傳超過上限的訊息且不視為成功」
