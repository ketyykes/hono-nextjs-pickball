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

---

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

實作位於 `nextjs-pickball/lib/matchmaker/roster-csv.ts`。

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

---

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

---

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
