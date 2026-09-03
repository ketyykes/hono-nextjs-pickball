# visual-export Specification

## Purpose
TBD - created by archiving change matchmaker-visual-export. Update Purpose after archive.

## Requirements

### Requirement: 對戰頁的匯出入口與可用狀態

對戰頁（`/matchmaker`）SHALL 提供「匯出 JPG」與「列印 PDF」兩個匯出入口，實作為
`nextjs-pickball/components/matchmaker/ExportActions.tsx`，掛載於
`nextjs-pickball/app/matchmaker/page.tsx`（`prd.md` 9.4、9.5、第 2 節「資料可攜」）。

本 Requirement 以本 capability 自身描述入口的存在，**SHALL NOT 修改 `match-stage`
capability 的任何既有 Requirement**——M6～M9 為並行 worktree，同時改寫同一條規格文字會造成
規格層級的合併衝突。

目前回合不存在時，兩個入口 MUST 帶 `disabled` 屬性，並 MUST 顯示繁體中文說明指出目前為何
無法匯出與下一步該做什麼（`prd.md` 12.3）。SHALL NOT 隱藏入口——隱藏會讓使用者以為本產品
沒有匯出功能（理由與被否決的替代方案見 design Decision 5）。

目前回合存在時，兩個入口 MUST 可被點擊，且 SHALL NOT 要求任何前置設定。

#### Scenario: 尚無目前回合時入口停用並說明原因

- **WHEN** 目前回合為 `null` 時渲染匯出入口
- **THEN** 「匯出 JPG」與「列印 PDF」兩顆按鈕皆帶 `disabled` 屬性
- **AND** 畫面出現繁體中文說明，指出需先產生本輪對戰才能匯出
- **驗收**：`nextjs-pickball/components/matchmaker/ExportActions.test.tsx`，it 名稱「尚無目前回合時匯出 JPG 與列印 PDF 皆為 disabled 並顯示繁體中文說明」

#### Scenario: 目前回合存在時入口可用

- **WHEN** 傳入一個含至少一場對戰的匯出內容時渲染匯出入口
- **THEN** 兩顆按鈕皆未帶 `disabled` 屬性
- **驗收**：`nextjs-pickball/components/matchmaker/ExportActions.test.tsx`，it 名稱「目前回合存在時匯出 JPG 與列印 PDF 皆可點擊」

#### Scenario: 匯出入口可於對戰頁找到

- **GIVEN** 已產生一輪對戰
- **WHEN** 開啟 `/matchmaker`
- **THEN** 頁面上同時存在「匯出 JPG」與「列印 PDF」兩個入口
- **驗收**：`nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，test 名稱「對戰頁提供匯出 JPG 與列印 PDF 兩個入口」

---

### Requirement: 匯出內容的組成

系統 SHALL 以純函式 `nextjs-pickball/lib/matchmaker/export-scene.ts` 由「目前回合 + 參賽者
名單」推導出**單一份**匯出內容（`ExportScene`），JPG 與 PDF 兩條匯出路徑 MUST 共用這同一份
內容，SHALL NOT 各自組裝一份——兩份組裝必然漂移，使同一輪的圖與列印稿顯示不同資訊
（見 design Decision 2）。

匯出內容 MUST 至少包含 `prd.md` 9.4 明列的全部項目：

| 項目 | 規格 |
|---|---|
| App 名稱 | 由本模組以具名常數提供，SHALL NOT 由各呼叫端各自寫死 |
| 回合編號 | 取自目前回合的 `roundNumber` |
| 對戰方式 | 單打／雙打，取自目前回合的 `format` |
| 場地編號 | 每個場地區塊 MUST 標示其 `courtNumber` |
| 球員色塊 | 每格 MUST 帶該員的 `colorFrom` → `colorTo` 雙色漸層 |
| 姓名 | 每格 MUST 顯示該員姓名 |
| 比分或未完成狀態 | 已完成場次 MUST 顯示最終比分與勝方；未完成場次 MUST 顯示可判讀的「未完成」狀態，SHALL NOT 留白 |

每格的前景文字色 MUST 由 `nextjs-pickball/lib/matchmaker/colors.ts` 的 `pickTextColor`
決定，SHALL NOT 另寫一套亮度判斷（`prd.md` 4.1.1）。每格的隊伍歸屬與列欄位置 MUST 取自
`match-allocation`／`match-stage` 已提供的版面推導（`nextjs-pickball/lib/matchmaker/stage-layout.ts`），
SHALL NOT 在本模組重新推導一次單打／雙打的排列規則。

回合只保存球員 id，姓名與顏色需由名單解析。名單中**找不到**該 id 時（該員已被刪除），
系統 MUST 以可判讀的替代文字呈現該格並照常輸出其餘內容，SHALL NOT 拋錯、SHALL NOT 產生
空白格（`prd.md` 第 11 節的錯誤處理精神）。

匯出內容 MUST 自帶畫布尺寸（`width`／`height`）與底色，且 `height` MUST 依場地數與對戰方式
推導——雙打每場四格，其區塊高度 MUST 大於單打的兩格。

#### Scenario: 標題含 App 名稱、回合編號與對戰方式

- **WHEN** 以第 3 輪、雙打的回合呼叫 `buildExportScene`
- **THEN** 回傳的標題同時含 App 名稱、「第 3 輪」與「雙打」三項資訊
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「匯出標題含 App 名稱、回合編號與對戰方式」

#### Scenario: 每個場地含場地編號與該場全部球員格

- **WHEN** 以含 2 個場地的雙打回合呼叫 `buildExportScene`
- **THEN** 回傳 2 個場地區塊，`courtNumber` 依序為 1、2
- **AND** 每個區塊含 4 格，每格帶該員姓名與所屬隊伍索引
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「每個場地含場地編號與該場全部球員格」

#### Scenario: 已完成場次顯示最終比分與勝方

- **WHEN** 場次狀態為 `completed`、比分為 11 比 7、勝方為第一隊
- **THEN** 該場地區塊的狀態文字同時含 11、7 與勝方所屬隊伍
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「已完成場次顯示最終比分與勝方」

#### Scenario: 未完成場次顯示未完成狀態

- **WHEN** 場次尚未完成（`scores` 為 `null`）
- **THEN** 該場地區塊的狀態文字為可判讀的「未完成」文字，且不含任何比分數字
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「未完成場次顯示未完成狀態而非空白比分」

#### Scenario: 球員格帶雙色漸層與自動對比前景

- **WHEN** 某位球員的 `colorFrom` 與 `colorTo` 為兩個相異 hex 色碼
- **THEN** 該格帶有這兩個色碼作為漸層起訖
- **AND** 該格的前景色等於 `pickTextColor(colorFrom, colorTo)` 的回傳值
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「球員格帶該員雙色漸層與 pickTextColor 前景色」

#### Scenario: 名單中找不到球員時以替代文字呈現

- **WHEN** 回合中某場次的球員 id 不存在於傳入的名單
- **THEN** 該格以可判讀的替代文字呈現，其餘格與場地照常輸出
- **AND** 呼叫不拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「名單中找不到該球員時以替代文字呈現且不拋錯」

#### Scenario: 畫布高度依場地數與對戰方式推導

- **WHEN** 分別以 1 個場地與 3 個場地的同一種對戰方式呼叫
- **THEN** 3 個場地的 `height` 大於 1 個場地的 `height`
- **AND** 同為 1 個場地時，雙打的 `height` 大於單打的 `height`
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「畫布高度依場地數與對戰方式遞增」

---

### Requirement: JPG 檔案的產生與下載

系統 SHALL 以瀏覽器內建 Canvas API 將匯出內容繪製為圖片，並以 `image/jpeg` 編碼供使用者
下載（`prd.md` 9.4、13.5）。SHALL NOT 為此引入任何 DOM 轉圖或影像處理的外部套件
（評估與被否決的替代方案見 design Decision 1）。

檔名 MUST 由純函式 `nextjs-pickball/lib/matchmaker/export-filename.ts` 組成，格式為
`matchmaker-round-<回合編號>-<YYYY-MM-DD>.jpg`。日期 MUST 由呼叫端注入
（`exportedAt`），SHALL NOT 於函式內部呼叫 `new Date()` 或 `Date.now()`——內部取時間會讓
測試只能寬鬆斷言，也讓同一份輸入產生不同輸出。

匯出內容的底色 MUST 為**不透明**色。JPEG 沒有 alpha 通道，未先填底色會使透明區域在部分
瀏覽器編碼為黑色，整張圖變成黑底（見 design Decision 9）。

繪製與編碼的實作位於 `nextjs-pickball/lib/matchmaker/scene-canvas.ts`；該檔為純瀏覽器 API
呼叫、無分支決策，屬本 workspace 的 TDD 例外層，以 E2E 驗收（見 design Decision 7）。

#### Scenario: 檔名依回合編號與注入日期組成

- **WHEN** 以 `roundNumber` 為 3、`exportedAt` 為 `2026-08-23T01:02:03.000Z` 呼叫檔名函式
- **THEN** 回傳 `matchmaker-round-3-2026-08-23.jpg`
- **驗收**：`nextjs-pickball/lib/matchmaker/export-filename.test.ts`，it 名稱「JPG 檔名依回合編號與注入日期組成」

#### Scenario: 匯出內容以不透明底色繪製

- **WHEN** 呼叫 `buildExportScene`
- **THEN** 回傳的底色為不透明色值（不含 alpha 通道、非 `transparent`）
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「匯出場景以不透明白色為底色」

#### Scenario: 點擊匯出 JPG 會下載 JPEG 檔案

- **GIVEN** 已產生一輪對戰
- **WHEN** 點擊「匯出 JPG」
- **THEN** 瀏覽器觸發下載，檔名符合 `matchmaker-round-<數字>-<YYYY-MM-DD>.jpg`
- **AND** 下載的檔案開頭為 JPEG 的位元組標記（`FF D8 FF`）且大小大於 0
- **驗收**：`nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，test 名稱「匯出 JPG 會下載檔名含回合編號與日期的 JPEG 檔案」

---

### Requirement: PDF 以瀏覽器列印流程輸出

系統 SHALL 以**瀏覽器列印流程**產生 PDF（`prd.md` 9.5）：由使用者點擊「列印 PDF」觸發
`window.print()`，由瀏覽器的列印對話框輸出為 PDF。SHALL NOT 引入任何 PDF 產生套件，也
SHALL NOT 另開新視窗重繪一份 HTML（理由見 design Decision 3）。

列印時的版面 MUST 由 `nextjs-pickball/components/matchmaker/PrintSheet.tsx` 提供，其內容
MUST 來自與 JPG 相同的那一份匯出內容，且 MUST 包含目前回合與**各場次**的對戰資訊。

列印樣式 MUST 集中於 `nextjs-pickball/app/globals.css` 的 `@media print` 區塊，並以
`data-print` 屬性作為選擇器，SHALL NOT 散落於各元件的 utility class——列印要關掉的東西
橫跨全站導覽與對戰頁控制項兩個不同擁有者，集中一處才追得動。列印媒體下：

- 全站導覽與對戰頁的操作控制項 MUST 隱藏。
- 列印版內容 MUST 顯示（螢幕上則 MUST 隱藏）。
- 每個場地區塊 MUST 設定為不跨頁切斷（`break-inside: avoid`），SHALL NOT 讓同一個場地的
  球員被拆到兩頁。

#### Scenario: 列印版含目前回合與各場次

- **WHEN** 以含 2 個場地的匯出內容渲染列印版
- **THEN** 出現回合標題，且兩個場地各自出現場地編號、該場球員姓名與比分或未完成狀態
- **驗收**：`nextjs-pickball/components/matchmaker/PrintSheet.test.tsx`，it 名稱「列印版顯示回合標題與每個場地的球員與比分」

#### Scenario: 點擊列印 PDF 觸發瀏覽器列印

- **WHEN** 點擊「列印 PDF」
- **THEN** 瀏覽器的列印函式恰好被呼叫一次
- **驗收**：`nextjs-pickball/components/matchmaker/ExportActions.test.tsx`，it 名稱「點擊列印 PDF 會呼叫注入的列印函式一次」
- **驗收**：`nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，test 名稱「點擊列印 PDF 會呼叫瀏覽器列印一次」

#### Scenario: 列印媒體下隱藏導覽與操作控制項

- **GIVEN** 已產生一輪對戰的對戰頁
- **WHEN** 將媒體模擬為 `print`
- **THEN** 全站導覽與帶 `data-print="hide"` 的操作控制項皆為隱藏
- **AND** 列印版內容為可見
- **驗收**：`nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，test 名稱「列印媒體下隱藏全站導覽與操作控制項並顯示列印版內容」

#### Scenario: 場地區塊不跨頁切斷

- **GIVEN** 已產生一輪對戰的對戰頁
- **WHEN** 將媒體模擬為 `print` 並讀取列印版中場地區塊的 computed style
- **THEN** 其 `break-inside` 為 `avoid`
- **驗收**：`nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，test 名稱「列印版的每個場地區塊設定為不跨頁切斷」

---

### Requirement: 列印被阻擋時的繁體中文提示

列印無法進行時，系統 MUST 顯示繁體中文提示，指出可**開啟彈出視窗權限**後重試，或改用
瀏覽器選單的列印功能（`prd.md` 9.5、第 11 節）。訊息 SHALL NOT 只顯示技術錯誤碼，MUST
說明可採取的修正方式。

判定 MUST 抽為純函式 `nextjs-pickball/lib/matchmaker/print-guard.ts` 並於該層 TDD，
列印函式 MUST 由呼叫端注入，SHALL NOT 在該模組內直接讀取 `window`——直接讀取會讓這段
判定只能靠 E2E 驗證，而 E2E 無法穩定重現「被阻擋」這個狀態。

判定 MUST 涵蓋兩種失敗形態：① 列印函式呼叫時拋出例外；② 執行環境根本未提供列印能力
（`window.print` 不存在或不是函式）。兩者 MUST 回傳相同語意的被阻擋結果。

提示 MUST 帶 `role="alert"` 使讀屏能即時播報（`prd.md` 12.5）；列印成功時 MUST NOT 顯示
任何錯誤訊息。

#### Scenario: 列印函式拋錯時判定為被阻擋

- **WHEN** 以一個呼叫即拋錯的列印函式呼叫判定函式
- **THEN** 回傳結果為「被阻擋」，且帶有提及彈出視窗權限的繁體中文訊息
- **驗收**：`nextjs-pickball/lib/matchmaker/print-guard.test.ts`，it 名稱「列印函式拋錯時判定為被阻擋並回傳繁體中文訊息」

#### Scenario: 環境未提供列印能力時判定為被阻擋

- **WHEN** 以 `undefined` 或非函式的值呼叫判定函式
- **THEN** 回傳結果為「被阻擋」，訊息與拋錯情境相同
- **驗收**：`nextjs-pickball/lib/matchmaker/print-guard.test.ts`，it 名稱「環境未提供列印函式時判定為被阻擋」

#### Scenario: 列印成功時不回報錯誤

- **WHEN** 以一個正常回傳的列印函式呼叫判定函式
- **THEN** 回傳結果為成功，且不帶任何訊息
- **AND** 該列印函式恰好被呼叫一次
- **驗收**：`nextjs-pickball/lib/matchmaker/print-guard.test.ts`，it 名稱「列印成功時回報 ok 且不帶訊息」

#### Scenario: 被阻擋提示顯示於對戰頁

- **WHEN** 注入一個會拋錯的列印函式並點擊「列印 PDF」
- **THEN** 匯出入口區域出現帶 `role="alert"` 的繁體中文提示
- **AND** 訊息內容說明可開啟彈出視窗權限或改用瀏覽器選單列印
- **驗收**：`nextjs-pickball/components/matchmaker/ExportActions.test.tsx`，it 名稱「列印被阻擋時以 role alert 顯示繁體中文提示」

---

### Requirement: 匯出為純前端唯讀操作

匯出 SHALL 為唯讀操作：MUST NOT 修改參賽者名單、目前回合、歷史紀錄或任何 LocalStorage
資料，也 MUST NOT 觸發評分更新（`prd.md` 6.4 的更新時機只有「送出比分」）。

匯出 MUST 完全在瀏覽器本機完成，SHALL NOT 將任何參賽者資料送往後端或第三方服務——
`prd.md` 12.4 明訂本版不傳送參賽者資料至後端，而匯出的圖片正是含全部姓名與分數的資料。

匯出內容的組裝函式 MUST 將輸入的回合與名單視為唯讀，SHALL NOT 就地修改。

#### Scenario: 組裝匯出內容不修改輸入

- **WHEN** 以某回合與名單呼叫 `buildExportScene`
- **THEN** 呼叫前後的回合與名單以深層比對完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「組裝匯出內容不修改輸入的回合與名單」

#### Scenario: 匯出後回合與本機資料不變

- **GIVEN** 已產生一輪對戰
- **WHEN** 完成一次 JPG 匯出後重新整理頁面
- **THEN** 目前回合的場地數、場次狀態與比分與匯出前完全相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，test 名稱「匯出 JPG 後目前回合與本機資料保持不變」

#### Scenario: 匯出不發出網路請求

- **GIVEN** 已產生一輪對戰且頁面載入完成
- **WHEN** 完成一次 JPG 匯出與一次列印觸發
- **THEN** 期間未發出任何 `fetch` 或 `XHR` 請求
- **驗收**：`nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，test 名稱「匯出過程不發出任何網路請求」

---

### Requirement: 匯出入口的可用性與無障礙

兩個匯出入口 MUST 具備可辨識的文字或 `aria-label`，且 MUST 可由鍵盤操作，SHALL NOT 只能
以滑鼠觸發（`prd.md` 12.3、12.5）。停用狀態 MUST 以 `disabled` 屬性表達，SHALL NOT 只把
視覺變淡而仍可被點擊或被 Tab 聚焦。

JPG 匯出進行中時，該入口 MUST 暫時停用，避免重複點擊產生多份下載——繪製與編碼是非同步
操作，連點兩次會下載兩個同名檔案而使用者無從得知哪一份是完整的。

#### Scenario: 匯出入口具備可存取名稱且可由鍵盤操作

- **GIVEN** 已產生一輪對戰的對戰頁
- **WHEN** 以 Tab 走到兩個匯出入口
- **THEN** 兩者皆能取得 focus 並具備非空的可存取名稱
- **驗收**：`nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，test 名稱「匯出入口具備可存取名稱且可由鍵盤操作」

#### Scenario: 匯出進行中時入口暫時停用

- **WHEN** JPG 匯出尚在進行中
- **THEN** 「匯出 JPG」入口帶 `disabled` 屬性
- **AND** 匯出結束後恢復可用
- **驗收**：`nextjs-pickball/components/matchmaker/ExportActions.test.tsx`，it 名稱「匯出進行中時匯出 JPG 入口暫時停用避免重複觸發」
