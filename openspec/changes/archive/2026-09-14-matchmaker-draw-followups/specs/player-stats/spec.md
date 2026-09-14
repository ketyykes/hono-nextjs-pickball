# Specification: player-stats

## MODIFIED Requirements

### Requirement: 出場、勝負與勝率的計算

每位球員的出場數 MUST 為其出現在傳入歷史紀錄中的筆數；勝場、敗場與和局 MUST 依各筆紀錄的
`winner` 欄位（`"teamA"`、`"teamB"` 或 `"draw"`）與該球員所屬隊伍判定——該球員所屬隊伍與
`winner` 相同記為勝場；`winner` 為 `"draw"` 記為和局，且該場**雙方**球員 MUST 同時記和局；
其餘記為敗場。

`"draw"` SHALL NOT 被歸入敗場：`"draw"` 與 `"teamA"`／`"teamB"` 皆不相等，以二元
「相同記勝、不同記敗」判定會讓平局的雙方各被誤記一場敗場。勝場、敗場與和局三者 MUST 互斥
且窮盡——`勝場 + 敗場 + 和局` MUST 等於出場數。

勝率 MUST 為勝場除以出場數；和局計入分母、SHALL NOT 計入分子，SHALL NOT 折算為半場勝場。
出場數為 0 時勝率 MUST 為 0，SHALL NOT 產生 `NaN` 或除以零的未定義結果。

排行榜排序規則（見「排行榜排序規則」Requirement）SHALL NOT 讀取和局數——和局只影響顯示與
敗場數的正確性，不影響名次。

#### Scenario: 出場數、勝場與敗場依歷史紀錄正確加總

- **GIVEN** 某球員參與三場歷史紀錄，其中兩場所屬隊伍為 `winner`、一場不是
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的出場數為 3、勝場為 2、敗場為 1、勝率為 2/3
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「出場數、勝場與敗場依歷史紀錄正確加總」

#### Scenario: 平局紀錄計為和局而非雙方各一敗場

- **GIVEN** 兩位球員對戰兩場，一場的 `winner` 為其中一方、另一場的 `winner` 為 `"draw"`
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 獲勝那方的出場數為 2、勝場為 1、敗場為 0、和局為 1、勝率為 1/2
- **AND** 落敗那方的出場數為 2、勝場為 0、敗場為 1、和局為 1
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「平局紀錄計為和局而非雙方各一敗場」

#### Scenario: 出場數為零時勝率為零

- **GIVEN** 某球員的出場數為 0
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的勝率為 0，而非 `NaN`
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「出場數為零時勝率為零而非 NaN」

---

### Requirement: 統計頁的路由與呈現

系統 SHALL 於 `/matchmaker/stats` 提供球員統計與排行榜頁，實作入口為
`nextjs-pickball/app/matchmaker/stats/page.tsx`，掛載
`nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx` 呈現排行榜。頁面 MUST 可被
直接開啟，不相依任何前一畫面留下的記憶體狀態（比照 `match-history` 的「歷史頁的導覽入口」
既有先例）。

排行榜表格 MUST 依序顯示下列欄位：名次、球員（色塊＋姓名）、目前強度、出場數、勝負和、
勝率、強度淨變化、最常搭檔、最常對手。球員色塊 MUST 沿用既有雙色漸層
（`colorFrom`／`colorTo`）與 `nextjs-pickball/lib/matchmaker/colors.ts` 的 `pickTextColor`
決定前景色，SHALL NOT 另寫一套亮度判斷。已不在名單的球員 MUST 於姓名旁顯示可讀的文字標示
（不得只以顏色或樣式區分），標示文字取自
`nextjs-pickball/lib/matchmaker/labels.ts` 的具名常數，SHALL NOT 在元件內寫死字面量。

勝負和欄 MUST 依序顯示勝場、敗場與和局三個數字，三者 MUST 恆常顯示（值為 0 時顯示 `0`），
SHALL NOT 在和局為 0 時隱藏第三個數字——同一欄在不同列有不同數量的數字會讓讀者無法判斷
哪個數字是哪一項。欄位總數 MUST 維持九欄，SHALL NOT 為和局另闢第十欄（寬度下限 390px 為
硬條件，見「統計頁的可用性、無障礙與唯讀保證」）。

#### Scenario: 直接開啟 /matchmaker/stats 顯示排行榜表格

- **GIVEN** 已有至少一場歷史紀錄
- **WHEN** 直接在網址列輸入 `/matchmaker/stats`
- **THEN** 頁面載入排行榜表格，且表格標題列同時含名次、球員、強度、出場、勝負和、勝率、
  淨變化、常搭檔、常對手九項欄位名稱
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「直接開啟 /matchmaker/stats 可載入排行榜表格」

#### Scenario: 勝負和欄依序顯示勝場敗場與和局三個數字

- **GIVEN** 一位球員的勝場為 2、敗場為 1、和局為 1
- **WHEN** 渲染 `PlayerStatsTable`
- **THEN** 該列的勝負和欄依序含 `2`、`1`、`1` 三個數字
- **AND** 表格標題列的該欄名稱為「勝負和」
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerStatsTable.test.tsx`，it 名稱「勝負和欄依序顯示勝場敗場與和局三個數字」

#### Scenario: 球員色塊沿用既有漸層且已不在名單者有文字標示

- **GIVEN** 排行榜中有一位仍在名單的球員與一位已不在名單的球員
- **WHEN** 渲染 `PlayerStatsTable`
- **THEN** 仍在名單者的色塊背景為其 `colorFrom`→`colorTo` 漸層、前景色等於直接呼叫
  `pickTextColor` 的回傳值；已不在名單者的姓名旁出現可讀的文字標示
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerStatsTable.test.tsx`，it 名稱「球員色塊沿用既有漸層且已不在名單者有文字標示」
