# data-transfer Specification

## Purpose
TBD - created by archiving change matchmaker-data-transfer. Update Purpose after archive.

## Requirements

### Requirement: 資料工具頁與其導覽入口

系統 SHALL 提供資料工具頁 `/matchmaker/data`，集中放置 JSON 完整備份、歷史賽果 CSV 匯出、
參賽者名單 CSV 匯入與清除本機資料四個功能區塊。該頁 SHALL 可從 matchmaker 區段的導覽抵達。

本頁 MUST 以自身的入口描述導覽可達性，SHALL NOT 改寫其他 capability 既有的導覽 requirement
——匯出入是與對戰舞台、歷史頁平行的第三個功能面，各自宣告入口才能讓多個 milestone 並行交付
而不互相覆寫規格。

頁面 SHALL 明確標示「CSV 匯出與匯入處理的是不同的東西，不構成 round-trip；需要完整還原請用
JSON」（`prd.md` 9.3 前言）。此說明 MUST 出現在畫面上，SHALL NOT 只寫在程式碼註解——
使用者若誤以為 CSV 可完整備份，會在清除本機資料後才發現回合與歷史無法還原。

實作位於 `nextjs-pickball/app/matchmaker/data/page.tsx`。

#### Scenario: 從 matchmaker 區段導覽抵達資料頁

- **WHEN** 使用者在 matchmaker 區段點擊「資料匯入匯出」入口
- **THEN** 瀏覽器停在 `/matchmaker/data`，且頁面顯示四個功能區塊的標題
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「可從 matchmaker 區段導覽抵達資料頁並看到四個功能區塊」

#### Scenario: 頁面標示 CSV 匯出入不對稱

- **WHEN** 開啟 `/matchmaker/data`
- **THEN** 畫面上可讀到「CSV 匯出的是歷史賽果、匯入的是參賽者名單，兩者不構成 round-trip」的說明
- **AND** 該說明 MUST 同時指出完整還原請使用 JSON
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「資料頁標示 CSV 匯出入不對稱且完整還原請用 JSON」

---

### Requirement: JSON 完整備份的匯出內容

系統 SHALL 提供純函式 `buildBackup(snapshot, context)`，由目前的本機資料快照產生一份完整
備份物件。備份 MUST 包含下列五項（`prd.md` 9.2）：

| 欄位 | 內容 | 來源 |
|---|---|---|
| `version` | 備份格式版本號，本次為字面量 `1` | 本 capability |
| `players` | 全部參賽者 | `matchmaker:roster:v1` |
| `currentRound` | 目前回合；不存在時為 `null` | `matchmaker:round:v1` |
| `history` | 全部歷史賽果 | `matchmaker:history:v1` |
| 重複配對簽章 | **隨 `currentRound` 一併備份**（回合物件本身即帶有本輪所用的重複比對基準），SHALL NOT 另設一個頂層欄位 | `currentRound` 內 |

重複配對簽章 SHALL NOT 在備份中出現第二份拷貝：回合資料模型已把該輪所用的基準保存在回合物件
內，另設頂層欄位會產生兩個真相來源——使用者手改檔案或未來欄位演進時，兩者不一致就沒有任何規則
能判定該信哪一個。沒有目前回合時本來就不存在任何基準（首輪的基準為空），因此不會有資料遺漏。

`version` MUST 為字面量而非開放的 `z.number()`，理由與 `player-roster` 的 `RosterSchema`
相同——開放型別會讓未來的 v2 檔案通過外層驗證後在內層整批落空，使用者看到的是「還原後資料
莫名變少」而非明確的版本不符。

備份物件 MUST 為**可序列化的純資料**：簽章在記憶體中的表示法為 `Set`，寫入備份前 MUST 為
字串陣列（`match-allocation` 已明訂持久化以陣列表示）。

`exportedAt` 與檔名中的日期 MUST 由呼叫端注入，SHALL NOT 於函式內部呼叫 `new Date()`——
內部產生會使回傳值每次不同，測試只能寬鬆斷言而失去驗證力（沿用 `player-roster` 的同一原則）。

沒有任何資料時（空名單、無回合、無歷史）系統 SHALL 仍能產生合法備份，SHALL NOT 拒絕匯出。

實作位於 `nextjs-pickball/lib/matchmaker/backup.ts` 與
`nextjs-pickball/lib/matchmaker/transfer-types.ts`。

#### Scenario: 備份涵蓋五個區塊

- **WHEN** 以含 2 位參賽者、1 個進行中回合、3 筆歷史與 2 組簽章的快照呼叫 `buildBackup`
- **THEN** 回傳物件的 `version` 為 `1`，`players`、`currentRound`、`history` 三者的內容與快照一致，且重複配對簽章可在 `currentRound` 內取得
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「buildBackup 產生的備份含版本號、參賽者、目前回合、歷史與重複配對簽章」

#### Scenario: 無回合與無歷史時仍可匯出

- **WHEN** 以空名單、`currentRound` 為 `null`、空歷史的快照呼叫 `buildBackup`
- **THEN** 仍回傳合法備份物件，`players` 與 `history` 為空陣列、`currentRound` 為 `null`，且不拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「空資料時仍產生合法備份而非拒絕匯出」

#### Scenario: 簽章以字串陣列而非 Set 寫入備份

- **WHEN** 快照中的簽章索引以 `Set` 表示
- **THEN** 備份的 `currentRound` 內對應欄位為字串陣列（三組皆是），且 `JSON.stringify` 後再 `JSON.parse` 的結果與原內容相等
- **AND** SHALL NOT 出現 `Set` 被 `JSON.stringify` 序列化成 `{}` 而靜默丟失全部簽章的情況
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「簽章以字串陣列寫入備份，JSON 往返後內容不變」

#### Scenario: 匯出檔名含注入的日期

- **WHEN** 以 `exportedAt` 為 `"2026-08-23T01:02:03.000Z"` 呼叫 `backupFileName`
- **THEN** 檔名為 `matchmaker-backup-2026-08-23.json`
- **AND** 函式 SHALL NOT 內部呼叫 `new Date()`
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「backupFileName 依注入時間產生含日期的檔名」

---

### Requirement: JSON 匯入的結構驗證與整份原子性

系統 SHALL 提供純函式 `parseBackup(text)`，以 zod schema 驗證匯入檔的結構，比照
`nextjs-pickball/lib/matchmaker/types.ts` 既有的 schema 撰寫模式（schema 與型別成對匯出、
巢狀結構重用既有 schema 而非重新宣告欄位）。

驗證失敗時系統 MUST **整份不匯入**，SHALL NOT 覆蓋現有資料，也 SHALL NOT 只匯入通過驗證的
部分（`prd.md` 9.2）。此處刻意**不採**名單持久化的逐筆降級策略：備份檔是一份互相參照的整體
（回合中的球員 id 指向 `players`、歷史的賽前分數對應當時的名單），丟掉其中幾筆會留下指向不存在
球員的回合，那比整份拒絕更難修復。

`parseBackup` MUST 回傳可判讀的結果物件而非拋出例外，失敗時 MUST 附帶**繁體中文**錯誤訊息，
並說明可採取的修正方式（`prd.md` 第 11 節）。訊息 SHALL NOT 只顯示 zod 的原始英文 issue。

匯入的寫入 MUST 為**先全部驗證、再一次寫入**：任一 key 寫入前 MUST 已確認整份備份合法。

`BackupSchema` 直接重用 `round-lifecycle` 的 `RoundSchema` 與 `match-history` 的
`MatchHistoryEntrySchema`（不重新宣告 `winner` 欄位，見 `nextjs-pickball/lib/matchmaker/backup.ts`
的既有慣例），因此備份中回合場次或歷史紀錄的 `winner` MUST 接受 `"draw"`——此為兩份巢狀
schema 各自擴增列舉值後的**自動結果**，`parseBackup` 本身不需要新增任何平局專屬的判斷分支。
既有備份（`winner` 僅 `"teamA"`／`"teamB"`）不受影響，仍可正常匯入。

實作位於 `nextjs-pickball/lib/matchmaker/backup.ts`、
`nextjs-pickball/lib/matchmaker/transfer-types.ts` 與
`nextjs-pickball/lib/matchmaker/transfer-storage.ts`。

#### Scenario: 合法備份通過驗證

- **WHEN** 以 `buildBackup` 產生的備份序列化後餵給 `parseBackup`
- **THEN** 回傳成功結果，且其內容與原快照相等（round-trip）
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「buildBackup 的輸出經 JSON 往返後可被 parseBackup 還原為相同快照」

#### Scenario: JSON 語法錯誤

- **WHEN** 匯入內容為 `"{ 不是合法 JSON"`
- **THEN** 回傳失敗結果，訊息為繁體中文且指出檔案不是合法的 JSON
- **AND** SHALL NOT 拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「JSON 語法錯誤時回傳繁體中文失敗訊息而非拋錯」

#### Scenario: 版本號不符

- **WHEN** 匯入內容為結構完整但 `version` 為 `2` 的備份
- **THEN** 回傳失敗結果，訊息指出備份版本不支援
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「version 不是 1 時整份拒絕並說明版本不支援」

#### Scenario: 單筆參賽者不合法時整份拒絕

- **GIVEN** 備份含 3 位參賽者，其中 1 位的 `rating` 為 `99`（超出 1.00～8.00）
- **WHEN** 呼叫 `parseBackup`
- **THEN** 回傳失敗結果，SHALL NOT 保留另外 2 位（不走逐筆降級）
- **AND** 訊息 MUST 指出是參賽者資料有誤
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「單筆參賽者不合法時整份拒絕，不走逐筆降級」

#### Scenario: 匯入失敗時現有資料不被覆蓋

- **GIVEN** LocalStorage 已有名單、回合與歷史
- **WHEN** 以不合法的備份內容呼叫匯入流程
- **THEN** 三個 key 的內容與匯入前完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「匯入驗證失敗時三個 key 的內容完全不變」

#### Scenario: 匯入成功後參賽者、回合與歷史一併還原

- **GIVEN** 已清空本機資料
- **WHEN** 於資料頁選擇一份合法備份檔並確認匯入
- **THEN** 參賽者頁顯示備份中的參賽者，歷史資料同步還原
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「匯入合法 JSON 備份後參賽者與歷史一併還原」

#### Scenario: 備份內回合或歷史含平局時仍通過驗證

- **GIVEN** 一份備份的 `currentRound.matches` 或 `history` 中，有一筆的 `winner` 為 `"draw"`
- **WHEN** 呼叫 `parseBackup`
- **THEN** 回傳成功結果，該筆的 `winner` 於還原後仍為 `"draw"`
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「備份內回合或歷史含平局的 winner 為 draw 時仍通過驗證」

### Requirement: 歷史賽果的 CSV 匯出

系統 SHALL 提供純函式，把歷史賽果轉為 CSV 文字。標題列 MUST 至少包含 `prd.md` 9.3.1 列舉的
全部欄位，且順序固定：

```
日期,時間,對戰方式,雙打組成,場地,第一隊球員,第二隊球員,比分,勝方,賽前分數,賽後分數
```

輸出 MUST 能被 Excel 與 Google Sheets 正確辨識中文（`prd.md` 9.3.1）。因此 CSV 文字
MUST 以 UTF-8 BOM（`﻿`）開頭——Excel 在無 BOM 時會以系統預設編碼開啟 UTF-8 檔案，
中文欄位會變成亂碼，而亂碼的 CSV 對使用者等同於匯出失敗。

含逗號、雙引號或換行的欄位值 MUST 以雙引號包住，且值內的雙引號 MUST 以兩個雙引號跳脫
（RFC 4180）。參賽者姓名由使用者自由輸入，含逗號是完全合理的輸入。

歷史為空時系統 SHALL 仍輸出只有標題列的 CSV，SHALL NOT 拒絕匯出或輸出空字串——空檔案無法
讓使用者確認欄位格式，也無法在試算表中建立表頭。

球員姓名與賽前／賽後分數 MUST 取自歷史紀錄本身的**快照欄位**，SHALL NOT 以球員 id 回查目前
名單——歷史紀錄被設計成自足快照正是為了讓球員被刪除或改名後仍能完整呈現；在匯出時回查名單，
會讓已刪除球員的那幾列變成空白，等於把該設計作廢。

「勝方」欄 MUST 依 `entry.winner` 三種值輸出對應文字：`"teamA"` 輸出第一隊隊名、`"teamB"`
輸出第二隊隊名、`"draw"` MUST 輸出「平手」——SHALL NOT 把 `"draw"` 誤判為任一隊（例如以
`winner === "teamA" ? 隊A : 隊B` 的二元判斷會把平局靜默算成第二隊獲勝，是使用者事後對帳時
最難察覺的一種錯誤）。

本 requirement 只負責「把全部歷史轉成 CSV」，SHALL NOT 實作任何時間區間篩選（那屬歷史頁）。

實作位於 `nextjs-pickball/lib/matchmaker/csv.ts` 與
`nextjs-pickball/lib/matchmaker/history-csv.ts`。

#### Scenario: 標題列涵蓋 9.3.1 的全部欄位

- **WHEN** 對任意歷史資料呼叫歷史 CSV 匯出
- **THEN** 第一列（去除 BOM 後）逐字為上述 11 個欄位名稱，順序一致
- **驗收**：`nextjs-pickball/lib/matchmaker/history-csv.test.ts`，it 名稱「標題列涵蓋 9.3.1 的 11 個欄位且順序固定」

#### Scenario: 一筆雙打歷史輸出完整欄位值

- **GIVEN** 一筆雙打歷史，含場地、對戰時間、雙打組成標示、雙方球員、比分、勝方與各員賽前／賽後分數
- **WHEN** 匯出 CSV
- **THEN** 該列的日期與時間由對戰時間拆出，雙方球員以可讀分隔符串接，賽前與賽後分數對應到各員
- **驗收**：`nextjs-pickball/lib/matchmaker/history-csv.test.ts`，it 名稱「雙打歷史輸出日期時間、雙方球員與各員賽前賽後分數」

#### Scenario: 檔案以 UTF-8 BOM 開頭

- **WHEN** 產生任一份 CSV 文字
- **THEN** 首個字元為 `﻿`
- **驗收**：`nextjs-pickball/lib/matchmaker/csv.test.ts`，it 名稱「CSV 文字以 UTF-8 BOM 開頭」

#### Scenario: 含逗號、雙引號或換行的欄位被正確跳脫

- **WHEN** 某位參賽者姓名為 `王小明, Jr.`、另一位為 `他說"讚"`、另一位含換行
- **THEN** 三者在 CSV 中皆被雙引號包住，且值內的雙引號成為兩個雙引號
- **AND** 以本模組的解析函式讀回時，取得的值與原始輸入逐字相同
- **驗收**：`nextjs-pickball/lib/matchmaker/csv.test.ts`，it 名稱「含逗號、雙引號或換行的欄位以 RFC 4180 規則跳脫並可原樣讀回」

#### Scenario: 歷史為空時仍輸出標題列

- **WHEN** 歷史為空陣列
- **THEN** 輸出只含標題列（加 BOM）的 CSV，SHALL NOT 為空字串
- **驗收**：`nextjs-pickball/lib/matchmaker/history-csv.test.ts`，it 名稱「歷史為空時仍輸出只有標題列的 CSV」

#### Scenario: 平局歷史的勝方欄輸出平手

- **GIVEN** 一筆 `winner` 為 `"draw"` 的歷史紀錄
- **WHEN** 匯出 CSV
- **THEN** 該列的「勝方」欄為「平手」，不含第一隊或第二隊的隊名
- **驗收**：`nextjs-pickball/lib/matchmaker/history-csv.test.ts`，it 名稱「平局歷史的勝方欄輸出平手而非任一隊隊名」

---

### Requirement: 參賽者名單 CSV 的解析與逐列驗證

系統 SHALL 提供純函式 `parseRosterCsv(text)`，解析參賽者名單 CSV 並逐列驗證。欄位規格對應
`prd.md` 9.3.2：

| 欄位 | 必填 | 規格 |
|---|---:|---|
| 名稱 | 是 | trim 後不可為空白 |
| 性別 | 是 | 男／女／其他，MUST 接受常見寫法 |
| 強度分數 | 是 | 1.00～8.00 的數字 |
| 顏色起點 | 否 | `#RRGGBB`；未提供時由系統自動配色 |
| 顏色終點 | 否 | 同上 |

性別欄 MUST 接受常見寫法並正規化為 `player-roster` 的 `Gender`：`男`／`male`／`M`
對應 `male`，`女`／`female`／`F` 對應 `female`，`其他`／`不指定`／`other` 對應 `other`；
比對 MUST 忽略大小寫與前後空白。無法對應的值 MUST 記為該列錯誤，SHALL NOT 靜默歸類為 `other`
——靜默歸類會讓使用者拿到一份性別全錯卻沒有任何提示的名單。

解析結果 MUST 同時回傳「可新增的列」與「有問題的列」。每筆錯誤 MUST 指出**列號、欄位、原因**
（`prd.md` 9.3.2），列號 MUST 以使用者在試算表看到的行號為準（標題列為第 1 列，第一筆資料為
第 2 列），SHALL NOT 使用 0 起算的陣列索引——使用者要拿這個數字回試算表找那一行。

必填標題欄缺漏時 MUST 整份拒絕並指出缺哪一欄，SHALL NOT 逐列回報同一個結構性錯誤。

`colorFrom` 與 `colorTo` MUST **同時提供**才視為使用者指定配色；只提供其中一端時該端
SHALL 被忽略，整組改走自動配色——此規則與 `player-roster` 的 `addPlayer` 一致，
SHALL NOT 在本 capability 另立一套不同的顏色判定。

實作位於 `nextjs-pickball/lib/matchmaker/roster-csv.ts` 與
`nextjs-pickball/lib/matchmaker/csv.ts`。

#### Scenario: 合法 CSV 解析為可新增的列

- **WHEN** 解析含標題列與 3 筆合法資料的 CSV
- **THEN** 回傳 3 筆可新增的列、0 筆錯誤，且各列的 `gender` 已正規化為 `male`／`female`／`other`
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「合法 CSV 解析出對應筆數且性別已正規化」

#### Scenario: 性別接受常見寫法

- **WHEN** 性別欄分別為 `男`、`female`、` M `、`不指定`
- **THEN** 依序正規化為 `male`、`female`、`male`、`other`
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「性別欄接受中英文常見寫法並忽略大小寫與前後空白」

#### Scenario: 無法對應的性別記為該列錯誤

- **WHEN** 某列性別欄為 `貓`
- **THEN** 該列被記為錯誤，SHALL NOT 靜默歸類為 `other`
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「無法對應的性別記為該列錯誤而非靜默歸為 other」

#### Scenario: 錯誤指出列號、欄位與原因

- **GIVEN** CSV 的第 3 列（試算表行號）名稱為空白、第 5 列強度分數為 `9`
- **WHEN** 呼叫 `parseRosterCsv`
- **THEN** 錯誤清單含兩筆，分別標示列號 3／欄位「名稱」與列號 5／欄位「強度分數」，且原因為繁體中文
- **AND** 列號 MUST 為試算表行號（標題列為第 1 列），SHALL NOT 為 0 起算索引
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「每筆錯誤指出試算表列號、欄位與繁體中文原因」

#### Scenario: 缺少必填標題欄時整份拒絕

- **WHEN** CSV 的標題列缺少「強度分數」
- **THEN** 回傳結構性錯誤並指出缺少的欄位名稱，SHALL NOT 逐列回報
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「缺少必填標題欄時回傳結構性錯誤並指出欄位名稱」

#### Scenario: 只提供漸層的單一端點

- **WHEN** 某列只填「顏色起點」而「顏色終點」留空
- **THEN** 該列視為未指定配色，已填的那一端被忽略
- **驗收**：`nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，it 名稱「只提供顏色起點或終點其中一端時整組改走自動配色」

---

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

### Requirement: 清除本機資料與其確認流程

資料頁 SHALL 提供「清除本機資料」操作。按下後 MUST 顯示明確確認提示，載明**資料無法復原**
並**建議先匯出 JSON 備份**（`prd.md` §10、12.4）。使用者取消時 SHALL NOT 改變任何資料。

確認提示 MUST 額外說明「JSON 備份不包含 `/scoreboard` 進行中的逐球計分進度」——清除範圍含
計分板資料，但 JSON 備份的五個區塊不含它，不講清楚等於讓使用者以為備份已涵蓋全部。此句
**涵蓋計分板的全部進度**：獨立計分板的進度，以及（若 `scoreboard` capability 已引入分槽）
由對戰場次進入的各場進度，兩者皆不在備份的五個區塊內。因此分槽 key 出現後**不需**另加第二句
文案，只需確認本句仍為真。

本操作與 `player-roster` 的「重置名單」是 `prd.md` §10 表格中**不同的兩列**，MUST 各自
獨立：入口不同（資料頁 vs 參賽者頁）、清除範圍不同（全部本機資料 vs matchmaker 資料）、
確認文案不同。本 requirement SHALL NOT 改寫「重置名單」的行為。

清除範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `localStorage.clear()`，也
SHALL NOT 使用前綴掃描。清單的**涵蓋範圍 MUST 為「本 app 寫入 LocalStorage 的全部 key」**
（`prd.md` §10「清除本機資料 → 全部 LocalStorage 資料」）；本 requirement 承諾的是**結果**
（本 app 的資料被清乾淨），列舉只是達成結果的手段，SHALL NOT 被理解為固定筆數的白名單。

撰寫本 spec 時已知的 key 為下列四個：

| key | 匯出該常數的模組 |
|---|---|
| `matchmaker:roster:v1` | `nextjs-pickball/lib/matchmaker/storage-keys.ts` |
| `matchmaker:round:v1` | 同上 |
| `matchmaker:history:v1` | 同上 |
| `scoreboard:current:v1` | `nextjs-pickball/lib/scoreboard/storage.ts` |

計分板的**分槽 key**（`scoreboard:matches:v1`，由
`nextjs-pickball/lib/scoreboard/match-slots.ts` 匯出）為**硬前置**：清單 MUST 一併納入該 key，
它不是「若已存在才納入」的選配項。該模組不存在時，實作 MUST 停止並回報，
SHALL NOT 靜默地只納入上表四個 key。
漏掉它的失敗模式是「清除本機資料」留下全部分場計分槽——那正是分槽 capability 自己警告的
孤兒條目與 LocalStorage 無界累積，也與本操作「回到空白狀態」的承諾及 `prd.md` §10 的
「全部 LocalStorage 資料」相違。

每個 key 的字面值 MUST 取自上述模組匯出的常數，SHALL NOT 在本 capability 重複寫死字串——
key 名稱多一處來源就多一處漏改，而漏改的失敗模式是「清除看起來成功了，殘留資料要到下次
使用時才冒出來」。

`localStorage.clear()` 會一併刪除本 app 從未寫入的 key（其他來源寫入本網域的資料、未來的
純顯示偏好），而使用者無從檢視被刪掉了什麼；列舉清單則強制在新增任何資料域時主動決定它是否
屬於清除範圍，與 `player-roster` 重置範圍的既有原則一致。

**不屬清除範圍的 key**：`auth` 的上次登入提示（`auth:signed-in-hint:v1`，常數 `SIGNED_IN_HINT_STORAGE_KEY` 匯出自 `nextjs-pickball/lib/auth/session-hint.ts`）
SHALL NOT 列入清單。它不是使用者資料（只存固定值、不含任何個資），生命週期跟隨 session——登入確認時寫入、登出或確認未登入時清除（`auth`「上次登入提示的儲存與清除」）；
「清除本機資料」不會登出，登入中清掉它只會在下一次 session 確認時被寫回，徒增一次重新整理時的本機畫面閃現。上述「涵蓋本 app 寫入 LocalStorage 的全部 key」的承諾以本段為唯一例外。

清除完成後參賽者頁與場次頁 MUST 呈現空白狀態（`prd.md` §10）。

實作位於 `nextjs-pickball/lib/matchmaker/transfer-storage.ts` 與
`nextjs-pickball/components/matchmaker/ClearLocalDataDialog.tsx`。

#### Scenario: 確認提示載明無法復原並建議先匯出

- **WHEN** 在資料頁按下「清除本機資料」
- **THEN** 出現確認提示，內容同時包含「無法復原」與「建議先匯出 JSON 備份」
- **AND** 提示 MUST 說明 JSON 備份不含 `/scoreboard` 的計分進度
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「清除本機資料的確認提示載明無法復原、建議先匯出並說明備份不含計分進度」

#### Scenario: 確認後本 app 寫入的全部已知 key 皆被移除

- **GIVEN** LocalStorage 中本 app 會寫入的全部 key 皆有內容——該集合由
  `nextjs-pickball/lib/matchmaker/storage-keys.ts` 與 `nextjs-pickball/lib/scoreboard/`
  下各 storage 模組**匯出的 key 常數**逐一取得，而非在測試中另抄一份字面值
- **WHEN** 呼叫 `clearAllLocalData()`
- **THEN** 該集合中的 key 全數被移除
- **AND** 測試 MUST 另行斷言「`CLEAR_ALL_KEYS` 的集合與上述來源模組匯出的 key 常數集合相等」，
  SHALL NOT 斷言固定的 key 數量——寫死數量時，新增資料域（例如計分板分槽 key）而忘了納入
  清單的情況仍會是綠燈，此 Scenario 就失去它唯一的偵測力
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「clearAllLocalData 移除本 app 寫入的全部 LocalStorage key」

#### Scenario: 清除不動列舉範圍以外的 key

- **GIVEN** LocalStorage 另有一個不屬於清單的 key
- **WHEN** 呼叫 `clearAllLocalData()`
- **THEN** 該 key 的內容完全不變
- **AND** 實作 MUST NOT 呼叫 `localStorage.clear()`
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「clearAllLocalData 不呼叫 clear，列舉範圍外的 key 完全不受影響」

#### Scenario: 取消清除不動任何資料

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 按下「清除本機資料」後於確認提示中取消
- **THEN** 參賽者頁的名單與清除前完全相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「取消清除本機資料後名單維持不變」

#### Scenario: 清除後回到空白狀態

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 確認清除本機資料
- **THEN** 參賽者頁顯示空白狀態與新增入口
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，test 名稱「確認清除本機資料後參賽者頁回到空白狀態」

#### Scenario: 清除本機資料不移除上次登入提示

- **GIVEN** LocalStorage 有上次登入提示（`SIGNED_IN_HINT_STORAGE_KEY` 為 `"1"`）與名單資料
- **WHEN** 呼叫 `clearAllLocalData()`
- **THEN** 名單 key 被移除；上次登入提示仍為 `"1"`；`CLEAR_ALL_KEYS` 不含 `SIGNED_IN_HINT_STORAGE_KEY`
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「regression guard：clearAllLocalData 不移除上次登入提示」

### Requirement: 匯入匯出的錯誤處理與 LocalStorage 邊界

系統 MUST 在下列情況回傳可判讀的繁體中文訊息並說明可採取的修正方式，SHALL NOT 拋出例外
中斷操作，也 SHALL NOT 只顯示技術錯誤碼（`prd.md` 第 11 節）：

| 情況 | 行為 |
|---|---|
| 匯入檔案不是合法 JSON／CSV | 整份不匯入，訊息指出檔案格式問題 |
| 匯入檔案結構不符預期 | 整份不匯入，訊息指出缺少或不合法的部分 |
| LocalStorage 不可用（SSR、私密模式） | 匯出仍可完成；匯入回報無法寫入並建議改用其他瀏覽器 |
| 寫入超出配額 | 不拋出例外，回報寫入失敗並建議先清除舊資料或減少匯入筆數 |

「LocalStorage 不可用」的偵測 MUST **重用**既有的 `hasLocalStorage()`（由
`nextjs-pickball/lib/matchmaker/storage-keys.ts` 匯出），SHALL NOT 在本 capability 另寫一套
判斷——同一個 SSR／私密模式防護有兩份實作時，只改其中一份的失敗模式是沉默的。

匯出路徑 MUST 不因 LocalStorage 不可用而失敗到無法產生檔案——讀不到資料時匯出的是空備份，
這仍比讓使用者卡在錯誤畫面好。

實作位於 `nextjs-pickball/lib/matchmaker/transfer-storage.ts` 與
`nextjs-pickball/lib/matchmaker/backup.ts`。

#### Scenario: LocalStorage 不可用時匯出與匯入皆不拋錯

- **GIVEN** 存取 `window.localStorage` 會拋出例外
- **WHEN** 依序呼叫讀取快照與寫入快照
- **THEN** 兩者皆不拋出例外；讀取回傳空快照，寫入回報失敗並附繁體中文訊息
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「localStorage 不可用時讀寫皆不拋出例外並回報可判讀結果」

#### Scenario: 寫入超出配額時回報而非拋錯

- **GIVEN** `localStorage.setItem` 會拋出 quota 相關例外
- **WHEN** 寫入一份合法備份
- **THEN** 不拋出例外，回傳失敗結果，訊息以繁體中文說明可先清除舊資料或減少匯入筆數
- **驗收**：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，it 名稱「寫入超出配額時回報失敗並提供繁體中文的修正建議」

#### Scenario: 錯誤訊息一律為繁體中文且含修正方式

- **WHEN** 逐一取得本 capability 定義的全部錯誤訊息
- **THEN** 每則訊息皆不含未翻譯的 zod 原始 issue 字串，且皆包含使用者可採取的下一步
- **驗收**：`nextjs-pickball/lib/matchmaker/backup.test.ts`，it 名稱「所有錯誤訊息為繁體中文且各自包含可採取的修正方式」

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
