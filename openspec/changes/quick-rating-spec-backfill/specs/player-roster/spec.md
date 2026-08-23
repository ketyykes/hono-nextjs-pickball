## ADDED Requirements

### Requirement: 快速帶入強度分數

新增與編輯參賽者的表單 SHALL 提供三顆快速帶入按鈕，級別與分數對應 `prd.md` 4.1.3：

| 級別 | 分數 |
|---|---:|
| 新手 | 1.00 |
| 中階 | 3.00 |
| 高階 | 5.00 |

按鈕的可及名稱 MUST 同時包含級別名稱與該級別的分數（例如「中階 3.00」），SHALL NOT 只顯示級別名稱 —— 主持人替一位不熟的球友估分時，需要看到級別實際換算成幾分才能判斷要不要改；只寫「中階」等於要求使用者記住 `prd.md` 的對照表。

點擊任一按鈕後，系統 SHALL 將該級別分數以**小數點後兩位**的格式填入強度分數欄位（`3` MUST 顯示為 `3.00`）—— 該欄位的內容是使用者接下來要繼續編輯的文字，格式必須與「參賽者資料模型」對 `rating` 的兩位小數定義一致，否則使用者會誤以為快速分數與手填分數是兩種不同的東西。連續點擊不同級別時，後點者 MUST 覆蓋前一次填入的值。

快速帶入 MUST 只是輸入捷徑，SHALL NOT 取代或限縮手動輸入：填入後使用者 SHALL 仍可將欄位改為 1.00～8.00 範圍內、小數點後兩位的任意值，該值 MUST 沿用「參賽者資料模型」既有的 `rating` 驗證規則（超出範圍時驗證失敗，SHALL NOT 靜默夾值）。三個級別 SHALL NOT 構成可選分數的封閉清單。

快速帶入按鈕 MUST 宣告為 `type="button"`，SHALL NOT 觸發表單送出 —— HTML 表單內的按鈕預設型別是 `submit`，一旦漏標，使用者點下「中階 3.00」會直接送出一張尚未填妥姓名的表單並看到驗證錯誤，快速帶入反而成為障礙。

三組級別與分數 MUST 定義為**單一常數**並由其渲染出全部按鈕（實作為 `PlayerForm.tsx` 的 `RATING_PRESETS`），SHALL NOT 在 JSX 內逐顆寫死 —— 逐顆寫死會讓「調整某級別的分數」變成三處各改一次，且按鈕標籤與實際填入值可能各自漂移（標籤寫「中階 3.00」卻填入 `3.5` 不會有任何機制擋下）。

實作位於 `nextjs-pickball/components/matchmaker/PlayerForm.tsx`。

#### Scenario: 三個級別的快速帶入按鈕齊備

- **WHEN** 開啟新增參賽者表單
- **THEN** 強度分數欄位旁出現三顆按鈕，可及名稱分別為「新手 1.00」、「中階 3.00」、「高階 5.00」
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「表單提供新手 1.00、中階 3.00、高階 5.00 三顆快速帶入按鈕」

#### Scenario: 點擊快速帶入按鈕填入該級別分數

- **WHEN** 點擊「中階 3.00」
- **THEN** 強度分數欄位的值為 `"3.00"`
- **AND** 接著點擊「高階 5.00」後為 `"5.00"`、點擊「新手 1.00」後為 `"1.00"`，後點擊者覆蓋前一次的值
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「點擊快速帶入按鈕後強度分數欄位填入該級別的兩位小數分數」

#### Scenario: 快速帶入後仍可手動輸入任意合法分數

- **GIVEN** 已點擊「新手 1.00」使欄位為 `"1.00"`
- **WHEN** 將欄位改為 `4.25` 並送出表單
- **THEN** 送出的 `rating` 為 `4.25`，SHALL NOT 被改回 `1.00`，也 SHALL NOT 被限制為三個級別之一
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「快速帶入後仍可手動改為 1.00～8.00 範圍內的兩位小數分數並送出」

#### Scenario: 快速帶入按鈕不觸發表單送出

- **GIVEN** 姓名欄位仍為空白
- **WHEN** 點擊「高階 5.00」
- **THEN** 表單未被送出（送出處理常式未被呼叫）
- **AND** 畫面 SHALL NOT 出現任何驗證錯誤訊息
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「快速帶入按鈕不會觸發表單送出」

#### Scenario: 於名單頁以快速分數新增參賽者

- **GIVEN** 於 `/matchmaker/players` 開啟新增參賽者 Dialog 並填入姓名
- **WHEN** 點擊「中階 3.00」後送出
- **THEN** 名單卡片顯示該參賽者的強度為 `3.00`
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「以快速分數新增的參賽者，卡片顯示對應強度」
