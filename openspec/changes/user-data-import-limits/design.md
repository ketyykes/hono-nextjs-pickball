# Design: user-data-import-limits

## Context

三個缺口都出自上線前的匯入邊界（來源：`docs/backend-scoring-runbook-b1-b9.md` 的 B6 紀錄「帶到 G1」與 B9 紀錄「G1 前必修」）：

1. **oversize 量測與後端參數形狀不一致**。`POST /api/import`（`hono-pickball/src/routes/import.ts`、`src/import/local-import-repository.ts`）把每段陣列包裝後整段 `JSON.stringify` 成**一個** `json_each` 參數：
   參賽者 `{ id, data, sortOrder }`、回合 `[{ data }]`、分槽 `{ matchId, data }`、歷史 `{ matchId, playedAt, data }`、獨立計分板 `[{ data }]`。
   前端 `nextjs-pickball/lib/sync/local-import.ts` 卻量**原始陣列**（`SEGMENT_LIMIT_BYTES = 1_900_000`，只量名單、歷史、分槽三段）。B9 Stage 2 實測：前端 1,880,596 B 的歷史段在後端為 2,100,131 B（歷史每筆約 +80 B、名單每位約 +70 B），超過正式 D1 的 2,000,000 B；
   本機 miniflare 約到 2.1～2.2MB 仍會成功（更大時才在本機失敗，例：既有 it 的 2.4MB 歷史段回 500），所以邊緣資料只有正式環境會失敗。現況失敗安全（D1 拋錯 → 整批回滾 → 500 → 前端顯示「匯入失敗，請稍後再試」），但使用者看不到 oversize 說明。
   「從 JSON 備份匯入到雲端」（`JsonBackupSection` 的雲端分支，同一端點）完全沒有大小檢查。
2. **批次寫入沒有筆數與 body 上限**。B6 紀錄「import 無筆數／body 大小上限」寫於 2026-10-23，當時只有 `POST /api/matchmaker/players/import`（B6 design Open Questions 列為「API 層加 `.max()`／`bodyLimit`，轉 G1」）；
   B9 的 `POST /api/import` 是 2026-10-29 才新增的另一個端點，兩者並存、沒有取代關係。逐一盤點 `hono-pickball/src/index.ts` 掛載的寫入路由：
   | 端點 | 寫入筆數來源 | 歸類 |
   |---|---|---|
   | `POST /api/matchmaker/players/import` | 客戶端陣列，每位一條 INSERT | **批次** |
   | `POST /api/import` | 客戶端五段陣列，固定 7 條陳述式 | **批次** |
   | `PUT /api/scoreboard/current`、`PUT /players/:id`、`PUT /round`、`PUT /slots/:matchId` | 單筆 | 非批次 |
   | `DELETE /players/:id`、`POST /reset` | 無 body | 非批次 |
   | `POST /round/matches/:matchId/score` | body 為三個數字，寫入筆數由伺服器決定（4 位球員＋回合＋歷史＋分槽） | 非批次 |
3. **`PlayerSchema.id` 接受空字串**。`packages/pickball-core/src/matchmaker/types.ts` 的 `id: z.string()`。使用處盤點：
   - 訪客本機：`nextjs-pickball/lib/matchmaker/storage.ts` 的 `readRoster()` 逐筆 `PlayerSchema.safeParse`，不合法者**捨棄並 `writeRoster` 回寫**；`BackupSchema`（本機 JSON 還原，整份 parse，一筆不合法整份拒絕）。
   - 雲端讀取：`PlayerListResponseSchema`、`PUT_PLAYER_RESPONSE_SCHEMA`、`api/round` 的送出比分回應。
   - 雲端寫入：`PUT /players/:id`（`versionedWriteSchema(PlayerSchema)`）、`PlayerImportRequestSchema`、`LocalImportRequestSchema`（經 `BackupSchema`）。
   - 本機 id 一律由 `crypto.randomUUID()` 產生（`useRosterStore`、`useRemoteRosterStore`、`RosterCsvImportSection`），空字串只可能來自手改的備份檔或手改的 localStorage。

## Goals

- 前後端以**同一個函式、同一份形狀**判定匯入是否超過上限；後端在呼叫 `db.batch()` 之前以明確錯誤碼拒絕，前端在 oversize 時顯示說明。
- 兩個批次寫入端點都有 body 上限與參賽者筆數上限，超過時在寫入前回 413。
- 寫入雲端的參賽者 id 不可為空字串，且訪客本機路徑零變更。

## Non-Goals

- 單筆寫入端點的 body 上限（見 Open Questions 1）。
- 超過上限時的分批匯入（B9 design Risks 已列「日後以同一 batch 內多個 `json_each` 參數擴充」）。
- 訪客本機 CSV 匯入的筆數上限；收緊 `PlayerSchema` 本身。
- B9 紀錄的其他低優先後續與 B6 的低優先項（見 proposal「明確不做」）。

## Decisions

### Decision 1：五段參數的序列化與上限判定移到核心套件，前後端共用

**Choice**：`@pickball/core/api/import` 新增三個純函式：

- `serializeImportSegments(request): ImportSegments`——回傳 `{ players, round, slots, history, current }` 五個字串，內容即目前 repository 內聯的五個 `JSON.stringify(...)`（搬移，形狀不變）。
- `utf8ByteLength(text): number`——以 `charCodeAt` 迴圈自行計算 UTF-8 位元組數（< 0x80 為 1、< 0x800 為 2、成對的代理字元合計 4、其餘含單獨的代理字元為 3，與 `TextEncoder` 以 U+FFFD 取代單獨代理字元的結果一致）。
- `checkImportLimits(request): { ok: true; segments: ImportSegments } | { ok: false }`——參賽者超過 `MAX_PLAYERS_PER_IMPORT` 或任一段 `utf8ByteLength` 超過 `IMPORT_SEGMENT_LIMIT_BYTES` 時為 `{ ok: false }`；通過時回傳已序列化的 `segments`。

後端 repository 以 `checkImportLimits` 的 `segments` 直接作為 `json_each` 參數（不再自行 `JSON.stringify`）；前端 `oversize = !checkImportLimits(payload).ok`。

**Rationale**：B9 的問題根源是「兩端各量各的形狀」。把序列化本身放進核心，量測的字串與送進 D1 的字串是**同一個函式**的輸出，不可能再漂移。
`checkImportLimits` 回傳 `segments` 讓後端只序列化一次（2MB 量級的字串不重複產生）。
`utf8ByteLength` 不能用 `TextEncoder`：核心 `tsconfig.json` 為 `lib: ["ESNext"]`、`types: []`，`TextEncoder` 不在 ESNext lib 內，會 tsc 失敗（`packages/pickball-core/CLAUDE.md`「零瀏覽器 API」）。測試端（`test/tsconfig.json` 有 node types）以 `TextEncoder` 為對照。

**前後端判定一致的前提**：前端 `payload` 由既有 reader 以 `PlayerSchema`、`RoundSchema`、`MatchHistoryEntrySchema`、`ScoreboardStateSchema` 解析而來，與 `LocalImportRequestSchema` 用的是同一批 schema；
zod 的輸出（`trim`、預設值、剝除未知欄位）對已解析過的值是冪等的，所以後端 `c.req.valid("json")` 序列化後與前端 `payload` 相同。前端測試以「`oversize` 等於 `!checkImportLimits(LocalImportRequestSchema.parse(payload)).ok`」在邊界上鎖定此性質。

**Alternatives considered**：
- 降低前端門檻（例如 1,600,000）：仍是猜測包裝比例，名單與歷史的包裝率不同，資料型態改變時會再漂移。
- 只在後端檢查：前端預覽看不到 oversize 說明，使用者要按下去才知道。
- 前端以「原始位元組＋每筆估計包裝量」近似：形狀仍有兩份。
- 新增核心模組 `api/import-limits.ts`：會動到 `CORE_MODULES`；上限與匯入契約同屬一份，放 `api/import.ts` 即可（測試另開 `test/api/import-limits.test.ts`）。

### Decision 2：單段上限 1,900,000 位元組，量的是送進 D1 的參數本身

**Choice**：`IMPORT_SEGMENT_LIMIT_BYTES = 1_900_000`，以 `utf8ByteLength(segments[k])` 判定，五段（含回合與獨立計分板）各自計算、不加總；恰等於上限時通過。

**Rationale**：D1 文件（下方查證紀錄）：「Maximum string, BLOB or table row size：2,000,000 bytes」，且單一 query 的限制適用於 batch 內每條陳述式。`json_each(?)` 的參數是一個字串，受 2,000,000 B 限制；
`INSERT … SELECT` 寫入的每一列是陣列中的一筆，必然小於整段參數。量測對象改為參數本身後，1,900,000 不再是「給包裝的餘裕」，而是 5% 的平台餘裕——正式 D1 無法在本機驗證（miniflare 約到 2.1～2.2MB 仍成功，且本 change 禁止任何遠端操作）。
回合與獨立計分板原本不量，但它們同樣是單一參數，五段一致量測比較單純。各段分別計算是因為 D1 的限制是「每個字串」而非「每個請求」（沿用 B9 既有斷言「單段都沒超過時，各段加總超過也不算 oversize」）。

**Alternatives considered**：
- 2,000,000 整：沒有餘裕，D1 的「2MB」是否另含內部開銷無法在本機確認。
- 1,000,000：無理由地砍半容量（B9 紀錄：實測歷史每筆約 690 B，1.9MB 約可容納 2,700 筆）。

### Decision 3：超過上限一律回 `413 { error: "PAYLOAD_TOO_LARGE" }`，新增錯誤碼

**Choice**：`API_ERROR_CODES` 新增 `PAYLOAD_TOO_LARGE`。body 上限、參賽者筆數上限、單段位元組上限三種「超過上限」都回 413 與此錯誤碼。前端 `requestJson` 依既有規則把 413 分類為 `{ kind: "rejected", status: 413 }`（不改 `api-client.ts`），由呼叫端依狀態碼轉為「超過上限」。

**Rationale**：前端需要分辨「資料太大」與「資料不合法」才能顯示對的說明；413 是 HTTP 的標準語意，前端只看狀態碼即可，不必解析錯誤 body。三種上限共用一個碼，使用者看到的處置相同（縮小資料或聯絡管理者）。
新錯誤碼會讓 `user-data-sync`「使用者資料請求的預期帳號守衛」的「恰含四個鍵」改為五個（MODIFIED），`packages/pickball-core/test/api/errors.test.ts` 的 it 名稱與斷言隨之修改（tasks 檔頭授權）。

**Alternatives considered**：
- `400 INVALID_BODY`：與 schema 不合法無法區分，前端只能顯示籠統失敗——正是 B9 要修的問題。
- 筆數上限以 zod `.max(500)` 實作：同樣變成 400 `INVALID_BODY`。
- 維持 500：現況。

### Decision 4：`POST /api/import` 的判定在 repository 內、`db.batch()` 之前

**Choice**：`importLocalData(db, userId, input)` 第一步呼叫 `checkImportLimits(input)`；不通過時回 `{ kind: "too-large" }`（`ImportOutcome` 新增此分支），不建立任何陳述式、不呼叫 `db.batch()`；route 把 `too-large` 對應為 413。
schema 驗證仍由 route 的 `zValidator` 先做（位元組上限只對合法請求有意義）。

**Rationale**：送進 D1 的參數形狀屬於 repository；判定與使用放在同一處，`segments` 才能直接沿用。「在 batch 之前」以測試替身（`batch` 被呼叫即計數並拋錯，沿用 `test/matchmaker-players.test.ts` 既有的 `batchFailingDb` 寫法）證明。

**被取代的既有行為**：B9 的「單段 JSON 參數超過 2MB → D1 拋錯 → 500 且整批回滾」改為 413。既有 it「300 位參賽者與 2000 筆歷史可一次匯入」中那段 2.4MB 歷史的斷言由 `500` 改為 `413`＋錯誤 body（tasks 檔頭授權）；
該段原本兼任「非守衛錯誤不被分類為 409」的唯一證據，改由新 it「batch 拋出非守衛錯誤時匯入回 500 而非 409」（替身 `batch` 拋一般錯誤）承接，屬 regression guard。

**Alternatives considered**：
- 在 route 內判定再把 `segments` 傳給 repository：repository 的簽章多一個參數，且「形狀」與「使用」分處兩檔。

### Decision 5：body 上限以 `hono/body-limit` 加共用包裝 `src/http/body-limit.ts`

**Choice**：新增 `jsonBodyLimit(maxSize)`，回傳 `bodyLimit({ maxSize, onError: (c) => c.json({ error: API_ERROR_CODES.PAYLOAD_TOO_LARGE }, 413) })`；掛在兩個批次寫入路由的 `zValidator` **之前**（sub-app 的 `use("*", localAuth, requireSession, requireExpectedUser)` 仍在更前面）。

**Rationale**（查證：Context7 `/websites/hono_dev` 與已安裝的 `hono@4.12.25` 原始碼 `dist/middleware/body-limit/index.js`）：有 `Content-Length` 且無 `Transfer-Encoding` 時只比對標頭；否則邊讀串流邊計數，超過即呼叫 `onError`，未超過時以讀到的 chunk 重建 request，下游 validator 照常讀取。
預設 `onError` 會 `throw new HTTPException(413, { res })`，經 `userDataOnError` 的 `err.getResponse()` 回純文字「Payload Too Large」，沒有錯誤碼——所以必須自訂 `onError`。共用包裝讓兩個端點的回應一致，且符合 `hono-pickball/CLAUDE.md`「凡是使用者資料路由都沿用共用 http 工具，不要各寫一份」。
放在驗證之後的 middleware 之後，未登入、停用、帳號不符的回應仍優先（`user-data-sync` 既有的優先順序不變）。

**Alternatives considered**：
- 自行比對 `Content-Length`：串流（無 `Content-Length`）的請求擋不住。
- 用 sub-app 層 `use("*", bodyLimit(...))`：matchmaker sub-app 的其他端點會被一併套用同一上限，不符本 change 範圍。

### Decision 6：上限數值

**Choice**：

| 常數 | 值 | 位置 |
|---|---|---|
| `MAX_PLAYERS_PER_IMPORT` | 500 | `api/players` |
| `PLAYER_IMPORT_BODY_LIMIT_BYTES` | 1,000,000 | `api/players` |
| `IMPORT_SEGMENT_LIMIT_BYTES` | 1,900,000 | `api/import` |
| `IMPORT_BODY_LIMIT_BYTES` | 10,000,000 | `api/import` |

**Rationale**：
- **500 位**：球聚名單為數十人量級；500 足以涵蓋並約束單次 batch 的執行時間與 Worker CPU。兩個端點用同一個常數，使「名單 CSV 雲端匯入」與「本機資料匯入」對同一份名單的接受度一致。
  D1 的「每次 Worker 呼叫的 query 數」把一次 `db.batch()` 計為一個 query（下方查證），所以 `players/import` 逐位一條陳述式不受 Free 方案 50 個 query 的限制——B9 design Risks 的「文件未明說」已有答案，500 的理由不是 query 數。
- **歷史與分槽不設筆數上限**：兩者在 `POST /api/import` 各只有一條陳述式，筆數由 1,900,000 B 的單段上限約束（歷史每筆約 690 B，約 2,700 筆；一筆合法歷史至少含兩隊球員與時間戳，數百位元組），再設筆數上限永遠不會先觸發，是死碼。
  `players/import` 沒有歷史與分槽。
- **`players/import` body 1,000,000 B**：小於 D1 單一列 2,000,000 B，因此任何通過上限的請求中，單一參賽者的 `data`（PlayerSchema 的 `name` 沒有長度上限）都不會超過 D1 列大小；500 位一般參賽者約 130KB，餘裕充足。
- **`/api/import` body 10,000,000 B**：五段參數各 ≤ 1,900,000，而 body 中每段的原始陣列都比對應參數小（參數多了包裝欄位），所以前端以 `JSON.stringify`（緊湊、無多餘空白）送出且通過單段判定的請求，body ≤ 9,500,000＋外層欄位，必然通過 10,000,000 的 body 上限（帶大量空白或 `\uXXXX` 跳脫的手工請求可能先被 body 上限擋下，回的同樣是 413，可接受）——body 上限不會搶先拒絕合法資料，只在 JSON 解析前擋下明顯過大的請求（Workers 記憶體 128MB）。
  Workers 平台本身的請求 body 上限為 100MB（Free／Pro），遠大於此值。

**Alternatives considered**：
- 名單 1,000 位：沒有實際需求支撐，只會放大單次 batch 的成本。
- `/api/import` body 5,000,000：五段皆接近上限的合法請求會被 body 上限先擋下，前端預覽卻判定可匯入，兩端不一致。

### Decision 7：`PlayerWriteSchema` 只在寫入雲端的邊界收緊 id

**Choice**：`@pickball/core/api/players` 匯出 `PlayerWriteSchema = PlayerSchema.extend({ id: z.string().min(1) })`；`PlayerImportRequestSchema` 的元素與 `LocalImportRequestSchema.players` 改用它。`PlayerSchema`、`BackupSchema`、`PlayerListResponseSchema` 不變。

**Rationale（訪客影響評估）**：若直接把 `PlayerSchema.id` 改為 `.min(1)`：
1. `readRoster()` 逐筆降級會把 id 為空字串的參賽者計入 `droppedCount` 並 `writeRoster` 回寫——訪客的參賽者在下次開頁時**被永久刪除**，違反「訪客路徑零變更」。
2. 本機 JSON 還原（`BackupSchema` 整份 parse）會把含該筆的備份整份拒絕，訪客無法還原自己先前匯出的備份。
3. 雲端回應解析（`PlayerListResponseSchema`）會讓 D1 中既有的空 id 列使整份名單載入失敗（本機 D1 可能已有；正式 D1 尚未建立）。
只收緊寫入邊界則三者皆不受影響；空 id 只可能來自手改資料，代價是這類訪客資料匯入雲端時得到 400（見 Open Questions 3）。
`PUT /players/:id` 不需改：Hono 的 `:id` 不匹配空字串（`/api/matchmaker/players/` 不符合該路由），而 route 要求 `data.id === :id`，空 id 本來就進不來。

**Alternatives considered**：
- 收緊 `PlayerSchema`＋本機遷移（為空 id 補 UUID）：id 同時被回合與歷史引用（`playerIds`），補 id 需要連帶改寫三個 key，風險遠大於收益。
- `PlayerWriteSchema` 再加 `.trim()` 或拒絕純空白：範圍外的新規則（B6 紀錄只列空字串），列為 Open Questions 2。

### Decision 8：前端結果分類與文案

**Choice**：
- `LocalImportOutcome` 新增 `{ kind: "too-large" }`：`importLocalData` 在 `rejected` 且 `status === 413` 時回傳；其他 `rejected` 仍為 `failed`。
- `local-import-view.ts`：`LOCAL_IMPORT_MESSAGES.tooLarge = "資料量超過單次匯入上限，本次沒有匯入任何資料。請聯絡管理者協助匯入。"`；`describeImportOutcome` 對 `too-large` 回 `{ tone: "error", text: tooLarge }`。
  兩個入口（匯入本機資料、從 JSON 備份匯入到雲端）都經這個函式，`JsonBackupSection.tsx` 與 `LocalDataImportSection.tsx` 不必修改。
- `remote-transfer.ts`：`REMOTE_TRANSFER_MESSAGES.importTooLarge = "匯入的資料量超過單次上限（一次最多 500 位參賽者），本次沒有匯入任何資料。請將 CSV 分成較小的檔案後再匯入。"`；`importRemoteRoster` 在 POST 回 `rejected` 且 413 時回傳它。
  訊息內的 500 以 `MAX_PLAYERS_PER_IMPORT` 組字串，不另寫數字。
- 預覽階段的 `LOCAL_IMPORT_MESSAGES.oversize`（「本機資料量超過單次匯入上限，請先匯出 JSON 備份後聯絡管理者」）不變。

**Rationale**：送出後的 413 與送出前的 oversize 是不同情境（前者已送出、雲端未寫入），文案分開；413 依靠狀態碼分類，`api-client.ts` 不改。

**Alternatives considered**：
- JSON 備份與 CSV 在送出前也以核心函式預先檢查：可省一次上傳，但多一條分支與測試；後端 413 已給出正確結果與文案，列為 Open Questions 4。

## Risks / Trade-offs

- [Risk] 正式 D1 的 2,000,000 B 是否另含內部開銷無法在本機驗證 → Mitigation：量測對象已是參數本身，另留 5% 餘裕；G1 上線後以正式環境的一次邊界匯入（約 1.9MB）確認，結果寫回 runbook。
- [Risk] Workers Free 方案 CPU 上限 10ms，接近上限的匯入（數 MB JSON 解析、zod 驗證、序列化）可能超時 → Mitigation：本 change 不處理，列為 Open Questions 5（屬 G1 方案選擇）；失敗模式為 Worker 例外，D1 batch 不會部分寫入。
- [Risk] 前端 `payload` 若日後改由不同 schema 解析（與 `LocalImportRequestSchema` 不一致），兩端判定會再分歧 → Mitigation：前端測試以 `LocalImportRequestSchema.parse(payload)` 為對照鎖定一致性（`data-transfer` Scenario「oversize 以後端參數形狀判定且與後端一致」）。
- [Risk] 既有 it 的斷言修改（`errors.test.ts`、`local-import.test.ts` 前後端各一處）可能被誤解為弱化測試 → Mitigation：tasks 檔頭逐條列出授權範圍與理由，Final Code Reviewer 比對 diff 只含這三處。
- [Risk] 計算成本上升：現況只對三段原始陣列 `JSON.stringify` 再以原生 `TextEncoder` 計數；改為五段包裝後序列化，再以 JS 逐字元迴圈計數。`buildLocalImportPayload()` 會即時算 `oversize`，參賽者頁的 `hasImportableLocalData()` 也經由它，所以資料頁與參賽者頁每次掛載都要付這個成本；後端 Worker 對每個匯入請求同樣計算一次 → Mitigation：資料量以單段 1.9MB 為上限，逐字元迴圈為毫秒量級，可接受；若實測（G1 正式環境或低階手機）成本過高，見 Open Questions 7 的短路與延遲計算方案。

## Migration Plan

無 schema 變更、無 migration、無資料遷移。部署順序沿用既有規則（先 hono-pickball 後 nextjs-pickball）；
新後端搭舊前端時，舊前端把 413 歸為「匯入失敗，請稍後再試」（現況行為），無資料風險。回滾：revert 本 change 的 commits 即可。

## 查證紀錄（propose 階段，2026-10-30）

- Context7 `/llmstxt/developers_cloudflare_d1_llms-full_txt`（D1 `platform/limits`）與 Cloudflare 文件搜尋 `developers.cloudflare.com/d1/platform/limits/`：
  Maximum string, BLOB or table row size **2,000,000 bytes (2 MB)**；Maximum SQL statement length **100,000 bytes (100 KB)**；Maximum bound parameters per query **100**；Queries per Worker invocation 1000（Paid）／50（Free）。
  「Limits for individual queries apply to each individual statement contained within a batch」；「The Queries per Worker invocation limit is an exception: a `db.batch()` call counts as a single query against it, not one query per statement」。
  綁定參數不計入 SQL 陳述式長度；本 change 的五條 `json_each` INSERT 陳述式文字為常數、遠小於 100KB。
- Cloudflare 文件 `developers.cloudflare.com/workers/platform/limits/`：Request body size 100 MB（Free／Pro 方案），超過由平台回 413；CPU time 10 ms（Workers Free）／5 min（Paid）；Memory 128 MB。
- Context7 `/websites/hono_dev`（`docs/middleware/builtin/body-limit`）：`bodyLimit({ maxSize, onError })`，先看 `Content-Length`，沒有時讀串流計數。
  已安裝 `hono@4.12.25` 原始碼：預設 `onError` 為 `throw new HTTPException(413, { res: new Response("Payload Too Large", { status: 413 }) })`；有 `Transfer-Encoding` 時忽略 `Content-Length` 改讀串流。

## Open Questions

1. **單筆寫入端點的 body 上限**（建議另開 change）：`PUT /players/:id`、`PUT /round`、`PUT /slots/:matchId`、`PUT /scoreboard/current` 的單筆 `data` 若超過 2MB 會在 D1 失敗（500）。這些端點由前端 store 自動送出、資料量由操作產生，實務上遠低於上限；
   本 change 依需求只處理批次寫入。替代方案：對整個使用者資料 sub-app 套用一個寬鬆的 `jsonBodyLimit`（例如 1,000,000）。
2. **純空白 id**：`PlayerWriteSchema` 只拒絕空字串，`" "` 仍可寫入。B6 紀錄只列空字串；要拒絕純空白需先確認訪客資料不會產生此值（id 皆為 UUID，理論上不會）。替代方案：`z.string().trim().min(1)`（注意 trim 會改寫 id，應改用 `.refine((id) => id.trim().length > 0)`）。
3. **訪客本機有空 id 參賽者時的匯入體驗**：此時 `POST /api/import` 回 400，畫面顯示「匯入失敗，請稍後再試」，重試永遠失敗。只可能來自手改資料，本 change 接受。替代方案：預覽時以 `LocalImportRequestSchema.safeParse(payload)` 偵測並顯示「本機資料有不合法的項目」。
4. **JSON 備份與名單 CSV 的送出前檢查**：兩者目前送出後才由 413 得知超過上限（JSON 備份最多上傳約 10MB 才被拒）。替代方案：`JsonBackupSection` 以 `checkImportLimits(backupToImportRequest(backup)).ok`、`importRemoteRoster` 以 `appended.length > MAX_PLAYERS_PER_IMPORT` 預先阻擋。
5. **Workers Free 方案的 10ms CPU 上限**（亦見 Open Questions 7）：接近上限的匯入可能在 Free 方案超時。屬 G1 的方案選擇（Free／Paid），上線前以正式環境實測一次邊界匯入再決定是否下修 `IMPORT_SEGMENT_LIMIT_BYTES`。
6. **與 `user-data-version-monotonic` 的重疊**（propose 當下仍在 propose 階段）：兩者都 MODIFIED `user-data-sync`「本機資料匯入雲端的 API」，也都改 `hono-pickball/src/import/local-import-repository.ts`（該 change 為參賽者／回合／分槽三段加 version 子查詢，且其 delta 仍保留「超過 2MB 回 500」的舊文）。
   archive 順序由 coordinator 決定；後 archive 者 MUST 在 tasks 1.2 以主 spec 為底重套 delta，本 change 若在後，特別重套「大小與筆數上限」「陳述式上限」兩段與 Scenario「大量資料以常數個陳述式匯入」；程式碼層兩邊對 `importLocalData` 的修改需手動合併（本 change 只動參數來源與 batch 前的判定，不動 SELECT 欄位）。
7. **量測成本的優化**（目前不做）：`checkImportLimits` 可對每段先以字串長度短路——UTF-16 長度 > 上限必然超過；長度 × 3 ≤ 上限必然未超過（每個 UTF-16 單位至多 3 位元組）——只有介於兩者之間才逐字元計算；前端亦可把 `oversize` 改為只在資料頁計算。
   不做的理由：多出的分支增加邊界測試與變異面，而目前沒有實測顯示成本有問題。
