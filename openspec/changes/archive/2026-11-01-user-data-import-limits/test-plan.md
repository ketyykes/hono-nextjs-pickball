# Test Plan: user-data-import-limits

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（核心套件 node；前端 `lib/**`、`components/**` happy-dom）、`integration`（`hono-pickball/test/**`，workerd＋D1）、
> `e2e`（`tests/e2e/user-data/**`，只在 `user-data` project；需 `.dev.vars`）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**「Why first」標 `regression guard` 者預期加入即綠，MUST 誠實標註，SHALL NOT 以改斷言偽造紅燈。
>
> **後端 API 授權覆蓋表**：本 change **不新增端點**，兩個受影響端點的四類授權測試皆已存在（`test/matchmaker-players.test.ts`、`test/local-import.test.ts`、`test/expected-user-guard.test.ts`），原樣通過即可。
> 新的 body 上限 middleware 掛在路由層（`post(path, jsonBodyLimit(…), zValidator(…), handler)`），sub-app 的 `use("*", localAuth, requireSession, requireExpectedUser)` 在結構上必先執行；既有授權 it 的樣本 body 遠小於上限，只證明掛上 middleware 後授權行為不變，**不**證明順序（順序由 Stage 2 以變異「middleware 改掛到守衛之前」確認）。

## user-data-sync

### Requirement: 本機資料匯入雲端的 API（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）auth 停用且無 DB binding 時匯入端點回 404；未登入呼叫匯入端點回 401；B 的匯入不受 A 的資料影響且不改動 A；匯入五段資料後各自為 version 1 且保留原順序；四張對戰分配機表任一有資料時回 409 且整份不寫入；同一份資料重複匯入時第二次回 409 且歷史不重複；雲端已有獨立計分板時略過該段且不覆寫；重複 id、孤兒分槽、空匯入或版本不符的請求回 400 且不寫入；預期帳號缺少或與 session 不符時匯入回 401 ACCOUNT_MISMATCH 且雲端不寫入；匯入的歷史可被歷史端點依區間與兩種排序讀回 | 對應的十個既有 Scenario | 原樣通過、名稱與斷言一行不改 | regression guard：repository 改用核心 `segments` 後，五段寫入的內容、順序與 `played_at` 不得改變 | integration |
| （既有，授權修改）300 位參賽者與 2000 筆歷史可一次匯入 | 匯入 API：大量資料以常數個陳述式匯入 | 300／2000 筆原樣通過；約 2.4MB 歷史段由 `500` 改為 `413 { error: "PAYLOAD_TOO_LARGE" }`，該使用者各表與 `sync_batch_guards` 零列 | 目前回 500 → 真紅；行為依本 change 改變（tasks 檔頭例外 ②） | integration |
| （既有）LocalImportRequestSchema 拒絕重複 id、孤兒分槽與空匯入 | 匯入 API：共用的匯入請求 schema | 原樣通過 | regression guard：`players` 改用 `PlayerWriteSchema` 不得放寬既有拒絕 | unit |
| （既有）守衛樣本表三個 it | 匯入 API：守衛樣本表含匯入端點 | 原樣通過（15 條） | regression guard：不新增路由 | integration |
| 單段 JSON 參數恰為上限時匯入成功，超過一位元組時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入 | 匯入 API：單段參數恰為上限時匯入、超過時回 413 且不寫入 | 歷史段恰 1,900,000 B → 200 且歷史已寫入；歷史段 +1 B、參賽者段 +1 B → 413＋body；該使用者各表與守衛表零列 | 邊界：本機 miniflare 約到 2.1～2.2MB 仍成功，目前 +1 B 仍回 200 → 真紅 | integration |
| 參賽者恰為 500 位時匯入成功，501 位時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入 | 匯入 API：參賽者超過 500 位時回 413 且不寫入 | 500 → 200 且 500 列；501 → 413＋body、零列 | 筆數上限；目前 501 回 200 → 真紅 | integration |
| 請求 body 超過匯入上限時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入 | 匯入 API：請求 body 超過上限時回 413 且不寫入 | 合法請求＋約 10MB 未知欄位 → 413＋body；零列 | 未知欄位會被 zod 剝除，目前回 200 → 真紅；證明 body 上限在 validator 之前 | integration |
| 超過上限的匯入不呼叫 D1 batch | 匯入 API：超過上限時不送出 D1 batch | 501 位 → 413；替身 `batch` 呼叫次數 0 | 「碰 D1 前拒絕」的直接證據；目前替身 batch 拋錯 → 500 → 真紅 | integration |
| batch 拋出非守衛錯誤時匯入回 500 而非 409 | 匯入 API：batch 的非守衛錯誤回 500 而非 409 | 替身 `batch` 拋一般錯誤 → 500 | **regression guard**（現行 catch 已照常拋出）：承接原本由 2.4MB→500 兼任的「非守衛錯誤不吞成 409」證據；catch 改為一律 conflict 時轉紅 | integration |
| 參賽者 id 為空字串的匯入請求回 400 且不寫入 | 匯入 API：參賽者 id 為空字串時回 400 且不寫入 | 400 `INVALID_BODY`；零列 | **regression guard**：§2（2.4）已收緊核心 schema，寫入時預期先綠；真紅證據為 2.3 的 schema 單元測試 | integration |
| serializeImportSegments 產生後端 json_each 參數的五段 JSON | 匯入 API：共用的匯入參數形狀與位元組數 | 五段字串分別等於約定形狀的 `JSON.stringify`；`currentRound`／`current` 為 null 時為 `"[]"`；`sortOrder` 為索引、`playedAt` 為 `Date.parse` | 形狀只有一份的契約；函式不存在 → 真紅 | unit |
| utf8ByteLength 與 TextEncoder 的位元組數一致 | 匯入 API：共用的匯入參數形狀與位元組數 | ASCII／é／中／emoji／單獨代理字元與混合字串，皆等於 `new TextEncoder().encode(s).length` | 核心不能用 TextEncoder，自寫實作需對照；函式不存在 → 真紅 | unit |
| checkImportLimits 依後端參數形狀判定，五段各自恰為上限時通過、多一位元組即超過 | 匯入 API：共用的上限判定 | 五段逐一：恰 1,900,000 B → `ok: true` 且 `segments` 等於 `serializeImportSegments`；+1 B → `ok: false` | 邊界；函式不存在 → 真紅 | unit |
| checkImportLimits 拒絕超過 500 位參賽者且不以各段加總判定 | 匯入 API：共用的上限判定 | 500 位 true、501 位 false；兩段各約 1.2MB → true | 筆數與「各段分別計算」；函式不存在 → 真紅 | unit |

### Requirement: 使用者資料請求的預期帳號守衛（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| API_ERROR_CODES 恰為五個錯誤碼且值等於鍵名 | 預期帳號守衛：錯誤碼常數含 ACCOUNT_MISMATCH | 鍵集合為五個（含 `PAYLOAD_TOO_LARGE`）；值等於鍵名 | 既有 it 改名改斷言（tasks 檔頭例外 ①）；缺 `PAYLOAD_TOO_LARGE` → 真紅 | unit |
| （既有）預期帳號守衛其餘七個 it（`expected-user-guard.test.ts` 六個、`headers.test.ts` 一個） | 其餘七個既有 Scenario | 原樣通過 | regression guard：body 上限 middleware 的位置不得改變守衛的優先順序 | integration |

### Requirement: 批次寫入端點的筆數與 body 上限（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 共用 body 上限 middleware 超過上限時回 413 PAYLOAD_TOO_LARGE 且不執行下一層 | 批次寫入上限：共用 body 上限 middleware 回 413 JSON | 上限 16：16 B → 200；17 B（有 Content-Length）與 17 B 串流（無 Content-Length）→ 413＋body，下一層 handler 未執行 | 自訂 `onError` 是錯誤碼的唯一來源（預設回純文字）；模組不存在 → 真紅 | integration |
| 批次寫入的上限常數皆小於 D1 單一字串上限 | 批次寫入上限：錯誤碼與上限常數由核心匯出 | 四個常數值；`IMPORT_SEGMENT_LIMIT_BYTES`、`PLAYER_IMPORT_BODY_LIMIT_BYTES` < 2,000,000 | 數值的唯一來源；常數不存在 → 真紅 | unit |

## player-roster

### Requirement: 參賽者雲端 API（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）`matchmaker-players.test.ts` 的十五個 Scenario 對應 it | 十五個既有 Scenario | 原樣通過 | regression guard：`PlayerImportRequestSchema` 改元素 schema、加 middleware 後既有行為不變 | integration |
| 匯入恰 500 位參賽者成功，501 位時回 413 PAYLOAD_TOO_LARGE 且不寫入 | 名單匯入超過 500 位時回 413 且不寫入 | 500 → 200 且 GET 500 位；501 → 413＋body、GET 空 | 目前 501 回 200 → 真紅 | integration |
| 匯入請求 body 超過上限時回 413 PAYLOAD_TOO_LARGE 且不寫入 | 名單匯入的 body 超過上限時回 413 且不寫入 | 單一位 `name` 使 body > 1,000,000 B → 413＋body、GET 空 | `name` 無長度上限，目前回 200 → 真紅 | integration |
| 匯入含 id 為空字串的參賽者時回 400 且不寫入 | 名單匯入的參賽者 id 為空字串時回 400 | 400 `INVALID_BODY`、GET 空 | **regression guard**：同上，真紅證據為 2.3 | integration |
| PlayerWriteSchema 拒絕空字串 id 而 PlayerSchema 照舊接受 | 寫入雲端的參賽者 schema 只在邊界收緊 id | `PlayerSchema` 通過；`PlayerWriteSchema`／`PlayerImportRequestSchema`／`LocalImportRequestSchema` 失敗；`id: "p1"` 時兩 schema 輸出相同 | 邊界 schema 不存在 → 真紅；同 it 內 `PlayerSchema` 通過的斷言是訪客零變更的守門 | unit |
| id 為空字串的參賽者照常讀回且不被捨棄 | 訪客本機名單照舊保留 id 為空字串的參賽者 | 兩位讀回、`droppedCount` 0、key 內容未變 | **regression guard**（`PlayerSchema` 不變故先綠）：防止日後有人直接收緊 `PlayerSchema` | unit |

## data-transfer

### Requirement: 登入後匯入本機資料到雲端（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有，授權修改）本機沒有資料時回報 isEmpty，任一段超過上限時回報 oversize | 匯入本機資料：本機沒有資料或資料過大 | 三段邊界改以 `utf8ByteLength(serializeImportSegments(payload)[段])` 量測：恰 1,900,000 → false、+1 → true；`LIMIT_BYTES` 改取核心常數；其餘斷言（isEmpty、多位元組、加總不算、去重後量測、停用者照量）不變 | 包裝後 +1 B 時原始陣列仍未超過，目前為 false → 真紅（tasks 檔頭例外 ③） | unit |
| oversize 以後端 json_each 參數的形狀判定，與後端對同一份請求的判定一致 | 匯入本機資料：oversize 以後端參數形狀判定且與後端一致 | 原始 ≤ 上限、包裝後 > 上限的歷史 → true；歷史段恰上限／+1 時 `oversize === !checkImportLimits(LocalImportRequestSchema.parse(payload)).ok` | B9 的實際缺口；目前為 false → 真紅 | unit |
| 本機參賽者超過 500 位時回報 oversize | 匯入本機資料：本機參賽者超過 500 位時為資料過大 | 500 → false、501 → true；兩者 `hasImportableLocalData()` 為 true | 目前不檢查筆數 → 真紅 | unit |
| importLocalData 在 413 時回報資料過大且不改動本機 | 匯入本機資料：413 分類為資料過大 | 413 → `{ kind: "too-large" }`；400 仍為 `failed`；本機五 key 不變 | 目前 413 為 `failed` → 真紅 | unit |
| 資料過大的匯入結果對應到超過上限的錯誤文案 | 匯入本機資料：資料過大的結果文案 | `{ tone: "error", text: LOCAL_IMPORT_MESSAGES.tooLarge }`；與 failed／cloudNotEmpty／unauthorized 皆不同 | 目前落入 failed 文案 → 真紅 | unit |
| 雲端 JSON 匯入遇到 413 時顯示資料量超過上限且不寫入本機 | 匯入本機資料：雲端 JSON 匯入遇到 413 時顯示資料量超過上限 | alert 文字為 `tooLarge`；無成功訊息；`refresh` 0 次；本機 key 不變 | 目前顯示 failed 文案 → 真紅 | unit（元件，happy-dom） |
| 登入時以超過 500 位參賽者的 JSON 備份匯入雲端時顯示資料量超過上限且雲端不寫入 | 匯入本機資料：登入時以超過上限的 JSON 備份匯入雲端 | 資料頁顯示 `tooLarge`；參賽者頁雲端名單為空 | **例外層（E2E 驗收）**：經前端 proxy 與 service binding 的端到端 413；寫於前後端皆完成之後，預期加入即綠 | e2e |
| （既有）buildLocalImportPayload 讀取本機五個 key 並略過孤兒分槽與重複歷史；importLocalData 依回應分類為已匯入、雲端已有資料、未授權或失敗且不改動本機；JSON 備份轉為匯入請求時計分板為空；hasImportableLocalData 只在任一 key 有資料時為 true；匯入以點擊當下的帳號送出且未授權時刷新 session；E2E 五條（登入後匯入…、重複匯入…、參賽者頁提示…、本機沒有資料…、登入時以 JSON 備份匯入…） | 對應的十個既有 Scenario | 原樣通過 | regression guard | unit／e2e |

### Requirement: 參賽者 CSV 匯入的預覽、附加寫入與整份原子性（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雲端 CSV 匯入遇到 413 時回傳超過上限的訊息且不視為成功 | 雲端 CSV 匯入超過上限 | `{ ok: false, message: REMOTE_TRANSFER_MESSAGES.importTooLarge }`，無未授權標示；GET＋POST 共 2 次請求 | 目前為 importFailed → 真紅 | unit |
| （既有）`roster-csv.test.ts`、`remote-transfer.test.ts`、E2E 的十個既有 Scenario 對應測試 | 十個既有 Scenario | 原樣通過（「雲端 CSV 匯入失敗時回傳錯誤且不視為成功」的 400 仍為 importFailed） | regression guard | unit／e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 | 指令 | 期望 |
|---|---|---|---|
| C1 | 型別 | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | lint | `pnpm lint` | 0 errors、warning 不多於基線 |
| C3 | 單元 | `pnpm test` | 三組皆綠；數字寫在 tasks |
| C4 | 建置 | `pnpm build` | exit 0 |
| C5 | migration | `pnpm --filter ./hono-pickball db:generate` 後 `git status --porcelain hono-pickball/drizzle` | 為空（本 change 不改 schema） |
| C6 | E2E | 依 project 分開跑：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p>`（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`） | 既有 test 全數通過；user-data 新增 1 條 passed；五個 browser project 數量與基線相同；無因缺帳密 skip |
| C7 | 規格 | `DO_NOT_TRACK=1 openspec validate user-data-import-limits --strict` | valid |
| C8 | 形狀只有一份 | `grep -c "JSON.stringify" hono-pickball/src/import/local-import-repository.ts`；`grep -rn --exclude='*.test.*' "1_900_000\|1900000\|10_000_000\|1_000_000" nextjs-pickball/lib nextjs-pickball/components hono-pickball/src` | 前者 0；後者無輸出（產品程式碼的上限數字只在核心；測試檔既有的填充長度不在此限） |
| C9 | 訪客零變更 | `git diff main --stat -- packages/pickball-core/src/matchmaker nextjs-pickball/lib/matchmaker/storage.ts nextjs-pickball/lib/matchmaker/round-storage.ts nextjs-pickball/lib/scoreboard nextjs-pickball/lib/matchmaker/backup.ts nextjs-pickball/lib/matchmaker/transfer-storage.ts nextjs-pickball/lib/matchmaker/roster-csv.ts nextjs-pickball/lib/sync/api-client.ts` | 無輸出 |

## Checklist

- [x] 每個 Requirement 至少一列（ADDED 1、MODIFIED 5）
- [x] 每個 Scenario 至少一列（既有 Scenario 以「（既有）」列合併）
- [x] 每列皆有 Tier；unit 與 integration 未混在同一列
- [x] 預期先綠者已標 regression guard（「batch 拋出非守衛錯誤…」「id 為空字串的參賽者照常讀回…」、後端兩條「id 為空字串…回 400」與各既有列）；E2E 標例外層
- [x] 授權修改的既有測試只有三處（`errors.test.ts`、`local-import.test.ts` 後端一條斷言、前端一個 it 的邊界段），見 tasks 檔頭
