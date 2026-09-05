# Specification: data-transfer

## MODIFIED Requirements

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
