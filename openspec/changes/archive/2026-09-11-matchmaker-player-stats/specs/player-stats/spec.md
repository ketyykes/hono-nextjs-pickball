# Specification: player-stats

## ADDED Requirements

### Requirement: 統計資料的計算範圍與唯讀保證

系統 SHALL 提供純函式 `nextjs-pickball/lib/matchmaker/player-stats.ts` 的
`computePlayerStats(history, players)`，以歷史紀錄各球員的 `id`（`HistoryPlayer.id`，
`nextjs-pickball/lib/matchmaker/history.ts`）為鍵計算每位球員的統計，SHALL NOT 以姓名為鍵——
姓名可改、id 不可改，以姓名為鍵會讓改名前後的紀錄被誤判成兩個人。

統計結果涵蓋的球員範圍 MUST 為「目前參賽者名單（`players`）中的每一位」與「傳入的歷史紀錄
（`history`）中出現過的每一位」兩者的聯集：名單中即使沒有任何出場紀錄的球員 MUST 出現在結果
中（出場數為 0）；已被自名單刪除但仍出現在歷史紀錄中的球員，MUST 仍出現在結果中，SHALL NOT
因為名單查無其 id 而被排除。

本函式 MUST 為純函式：SHALL NOT 修改輸入的 `history` 或 `players` 陣列或其中任何物件，
SHALL NOT 讀寫 LocalStorage，SHALL NOT 取用系統時鐘或發出任何網路請求。

#### Scenario: 名單成員即使無出場紀錄仍列入統計結果

- **GIVEN** 目前名單中有一位球員從未出現在任何歷史紀錄
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 回傳結果中含這位球員，其出場數為 0
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「名單成員即使無出場紀錄仍列入統計結果」

#### Scenario: 已離開名單但曾出現於歷史的球員仍列入統計結果

- **GIVEN** 一筆歷史紀錄中的某位球員 id 不存在於目前傳入的名單
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 回傳結果中仍含這位球員
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「已離開名單但曾出現於歷史的球員仍列入統計結果」

#### Scenario: 計算過程不修改輸入的歷史與名單

- **GIVEN** 一組歷史紀錄與一份名單
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 呼叫前後以 `structuredClone` 深層比對，輸入的 `history` 與 `players` 完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「計算過程不修改輸入的歷史與名單」

---

### Requirement: 出場、勝負與勝率的計算

每位球員的出場數 MUST 為其出現在傳入歷史紀錄中的筆數；勝場與敗場 MUST 依各筆紀錄的
`winner` 欄位（`"teamA"` 或 `"teamB"`）與該球員所屬隊伍判定——該球員所屬隊伍與 `winner`
相同記為勝場，不同記為敗場，SHALL NOT 出現既非勝場亦非敗場的第三種計數。

勝率 MUST 為勝場除以出場數；出場數為 0 時勝率 MUST 為 0，SHALL NOT 產生 `NaN` 或除以零的
未定義結果。

#### Scenario: 出場數、勝場與敗場依歷史紀錄正確加總

- **GIVEN** 某球員參與三場歷史紀錄，其中兩場所屬隊伍為 `winner`、一場不是
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的出場數為 3、勝場為 2、敗場為 1、勝率為 2/3
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「出場數、勝場與敗場依歷史紀錄正確加總」

#### Scenario: 出場數為零時勝率為零

- **GIVEN** 某球員的出場數為 0
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的勝率為 0，而非 `NaN`
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「出場數為零時勝率為零而非 NaN」

---

### Requirement: 目前強度與已離開名單球員的標示

名單內球員的目前強度 MUST 直接取自傳入 `players` 中該球員目前的 `rating`，SHALL NOT 由歷史
紀錄重新推算——`rating` 是名單的即時狀態，歷史紀錄只是過去的快照。

已離開名單（不存在於傳入 `players`）的球員，目前強度 MUST 改取其在傳入 `history` 中**最近
一筆**（依 `playedAt`）紀錄的 `ratingAfter`，且結果 MUST 額外標示該球員已不在名單
（`onRoster: false`），供呈現層加註「已不在名單」。

#### Scenario: 名單內球員的目前強度取自名單目前的 rating

- **GIVEN** 某球員存在於傳入的 `players`，其 `rating` 與該球員歷史紀錄中的任一 `ratingAfter`
  皆不同
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的目前強度等於 `players` 中的 `rating`，`onRoster` 為 `true`
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「名單內球員的目前強度取自名單目前的 rating」

#### Scenario: 已離開名單的球員取歷史最近一筆的 ratingAfter 並標示已不在名單

- **GIVEN** 某球員的 id 不存在於傳入的 `players`，但出現在兩筆時間先後不同的歷史紀錄中
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的目前強度等於**較晚**那筆紀錄的 `ratingAfter`，`onRoster` 為 `false`
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「已離開名單的球員取歷史最近一筆的 ratingAfter 並標示已不在名單」

---

### Requirement: 強度淨變化的計算

每位球員的強度淨變化 MUST 為其所有出場紀錄中 `ratingAfter − ratingBefore` 的加總
（Σ(ratingAfter − ratingBefore)），出場數為 0 時淨變化 MUST 為 0。

#### Scenario: 強度淨變化為所有出場紀錄賽前賽後分數差的加總

- **GIVEN** 某球員參與兩場歷史紀錄，賽前賽後分數差分別為 +0.12 與 −0.05
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的強度淨變化為 0.07
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「強度淨變化為所有出場紀錄賽前賽後分數差的加總」

---

### Requirement: 最常搭檔與最常對手的計算

最常搭檔 MUST 由該球員所有**雙打**歷史紀錄中的隊友逐筆計數，取出現次數最多者的姓名；
次數相同時 MUST 依姓名排序（依 UTF-16 code unit 比較，不使用語系排序）取序位在前者，
SHALL NOT 依紀錄出現順序或其他不穩定依據決定。該球員從未打過雙打時，最常搭檔 MUST 為
`null`，SHALL NOT 回傳空字串或拋出例外。

最常對手 MUST 由該球員所有歷史紀錄（單打與雙打皆計入）中對方隊伍的球員逐筆計數，取出現
次數最多者的姓名，同分時的判定規則與最常搭檔相同。

#### Scenario: 最常搭檔為雙打隊友中出現次數最多者

- **GIVEN** 某球員與球員甲搭檔兩次、與球員乙搭檔一次，皆為雙打
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的最常搭檔為球員甲的姓名
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「最常搭檔為雙打隊友中出現次數最多者」

#### Scenario: 從未打過雙打時最常搭檔為 null

- **GIVEN** 某球員的所有歷史紀錄皆為單打
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的最常搭檔為 `null`
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「從未打過雙打時最常搭檔為 null」

#### Scenario: 最常對手為對戰過的對手中出現次數最多者

- **GIVEN** 某球員與球員丙對戰兩次、與球員丁對戰一次
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 該球員的最常對手為球員丙的姓名
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「最常對手為對戰過的對手中出現次數最多者」

---

### Requirement: 排行榜排序規則

`computePlayerStats` 的回傳結果 MUST 已依下列順序排序，不需呼叫端再另行排序：

1. 目前強度，由高到低
2. 勝率，由高到低
3. 出場數，由多到少
4. 姓名，依 UTF-16 code unit 比較由前到後

#### Scenario: 排行榜依目前強度、勝率、出場數、姓名依序排序

- **GIVEN** 四位球員的目前強度兩兩相同、勝率其中兩位相同、出場數其中兩位又相同，
  最終須以姓名決定順序
- **WHEN** 呼叫 `computePlayerStats`
- **THEN** 回傳陣列的順序依序符合目前強度、勝率、出場數、姓名四層比較規則
- **驗收**：`nextjs-pickball/lib/matchmaker/player-stats.test.ts`，it 名稱「排行榜依目前強度、勝率、出場數、姓名依序排序」

---

### Requirement: 統計依區間篩選

統計頁 SHALL 提供與歷史頁相同的五個區間篩選（今日、本週、本月、上月、更早），實作沿用
`nextjs-pickball/lib/matchmaker/history-range.ts` 的 `filterHistoryByRange` 與
`nextjs-pickball/components/matchmaker/HistoryRangeFilter.tsx`，SHALL NOT 另寫一套區間邏輯。
切換區間時，排行榜 MUST 只反映該區間內的歷史紀錄——出場數、勝負、勝率、強度淨變化、最常
搭檔與最常對手皆須重新以篩選後的歷史紀錄計算；目前強度不受區間篩選影響（見「目前強度與
已離開名單球員的標示」）。初次開啟 MUST 預設選中**今日**，與歷史頁一致（`prd.md` 13.4）。

#### Scenario: 切換區間後排行榜只反映該區間的歷史紀錄

- **GIVEN** `matchmaker:history:v1` 中今日與上月皆有某球員的歷史紀錄
- **WHEN** 開啟 `/matchmaker/stats` 後切換到「上月」
- **THEN** 該球員的出場數只計入上月的紀錄，不含今日的紀錄
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「切換區間後排行榜只反映該區間的歷史紀錄」

---

### Requirement: 統計頁的路由與呈現

系統 SHALL 於 `/matchmaker/stats` 提供球員統計與排行榜頁，實作入口為
`nextjs-pickball/app/matchmaker/stats/page.tsx`，掛載
`nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx` 呈現排行榜。頁面 MUST 可被
直接開啟，不相依任何前一畫面留下的記憶體狀態（比照 `match-history` 的「歷史頁的導覽入口」
既有先例）。

排行榜表格 MUST 依序顯示下列欄位：名次、球員（色塊＋姓名）、目前強度、出場數、勝負、
勝率、強度淨變化、最常搭檔、最常對手。球員色塊 MUST 沿用既有雙色漸層
（`colorFrom`／`colorTo`）與 `nextjs-pickball/lib/matchmaker/colors.ts` 的 `pickTextColor`
決定前景色，SHALL NOT 另寫一套亮度判斷。已不在名單的球員 MUST 於姓名旁顯示可讀的文字標示
（不得只以顏色或樣式區分），標示文字取自
`nextjs-pickball/lib/matchmaker/labels.ts` 的具名常數，SHALL NOT 在元件內寫死字面量。

#### Scenario: 直接開啟 /matchmaker/stats 顯示排行榜表格

- **GIVEN** 已有至少一場歷史紀錄
- **WHEN** 直接在網址列輸入 `/matchmaker/stats`
- **THEN** 頁面載入排行榜表格，且表格標題列同時含名次、球員、強度、出場、勝負、勝率、
  淨變化、常搭檔、常對手九項欄位名稱
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「直接開啟 /matchmaker/stats 可載入排行榜表格」

#### Scenario: 球員色塊沿用既有漸層且已不在名單者有文字標示

- **GIVEN** 排行榜中有一位仍在名單的球員與一位已不在名單的球員
- **WHEN** 渲染 `PlayerStatsTable`
- **THEN** 仍在名單者的色塊背景為其 `colorFrom`→`colorTo` 漸層、前景色等於直接呼叫
  `pickTextColor` 的回傳值；已不在名單者的姓名旁出現可讀的文字標示
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerStatsTable.test.tsx`，it 名稱「球員色塊沿用既有漸層且已不在名單者有文字標示」

---

### Requirement: 空狀態的呈現

`matchmaker:history:v1` 完全沒有任何紀錄時，統計頁 SHALL 顯示
`nextjs-pickball/components/matchmaker/EmptyHistory.tsx` 的引導型空狀態（`range={null}`），
SHALL NOT 顯示只有標題列的空表格——排行榜在完全沒有資料時沒有任何可排序的意義。

#### Scenario: 完全沒有歷史紀錄時顯示引導型空狀態

- **GIVEN** `matchmaker:history:v1` 沒有任何紀錄
- **WHEN** 開啟 `/matchmaker/stats`
- **THEN** 畫面顯示引導型空狀態，不顯示排行榜表格
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「完全沒有歷史紀錄時顯示引導型空狀態」

---

### Requirement: 統計頁的可用性、無障礙與唯讀保證

排行榜表格 MUST 於支援寬度下限 **390px**（與 `site-navbar`／`match-stage` 一致）不造成整頁
橫向溢出（`document.scrollingElement` 的 `scrollWidth <= clientWidth + 1`）；表格本身可於
自身容器內橫向捲動。

色彩 SHALL NOT 作為唯一資訊來源：已不在名單的標示、勝負與排名皆 MUST 有文字或數字表達，
不得只靠色塊或樣式區分（`prd.md` 12.5）。區間篩選控制項 MUST 可由鍵盤操作且具備可存取名稱
（沿用 `HistoryRangeFilter` 既有的 `role="radiogroup"` 實作）。

統計頁 SHALL NOT 呼叫任何 store 的 setter，SHALL NOT 改變回合、名單或歷史等 LocalStorage
資料的**內容**，也 SHALL NOT 發出任何網路請求。

上述唯讀保證的界線：統計頁比照 `/matchmaker` 對戰頁直接持有 `useRosterStore`／
`useRoundStore`，兩個 hook 的 write effect 會在 hydrate 後把三個 LocalStorage key 各自
**重新序列化寫回**（既有 hydration 行為，非統計頁引入）。這種等值的重新序列化 SHALL NOT
被視為「修改」——寫回的是同一份資料經目前 schema 序列化後的形狀，對應用程式自己寫出的
資料而言逐位元組相同。此界線僅涵蓋等值重新序列化，SHALL NOT 據以放寬前段：任何會改變
資料語意內容的寫入仍在禁止之列。

#### Scenario: 排行榜表格於支援寬度下限不造成整頁橫向溢出

- **GIVEN** viewport 為 390x844、已有多筆歷史紀錄
- **WHEN** 開啟 `/matchmaker/stats`
- **THEN** `document.scrollingElement` 的 `scrollWidth` 不大於 `clientWidth + 1`
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「排行榜表格於支援寬度下限不造成整頁橫向溢出」

#### Scenario: 瀏覽統計頁不改動任何持久化資料

- **GIVEN** `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1` 皆已有資料
- **WHEN** 開啟 `/matchmaker/stats` 並依序切換五個區間
- **THEN** 三個 key 的內容與操作前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「瀏覽統計頁不改動任何持久化資料」
