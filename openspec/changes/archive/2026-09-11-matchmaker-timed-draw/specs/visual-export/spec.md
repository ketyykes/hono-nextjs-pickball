# Specification: visual-export

## MODIFIED Requirements

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
| 比分或未完成狀態 | 已完成場次 MUST 顯示最終比分；`winner` 為 `"teamA"` 或 `"teamB"` 時 MUST 顯示對應勝方，`winner` 為 `"draw"` 時 MUST 顯示可判讀的「平手」文字而非任一隊隊名；未完成場次 MUST 顯示可判讀的「未完成」狀態，SHALL NOT 留白 |

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

#### Scenario: 已完成場次為平局時顯示比分與平手而非任一隊勝方

- **WHEN** 場次狀態為 `completed`、比分為 11 比 11、`winner` 為 `"draw"`
- **THEN** 該場地區塊的狀態文字同時含 11、11 與可判讀的「平手」文字
- **AND** 狀態文字不含任一隊的隊伍名稱
- **驗收**：`nextjs-pickball/lib/matchmaker/export-scene.test.ts`，it 名稱「已完成場次為平局時顯示比分與平手而非任一隊勝方」
