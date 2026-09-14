# Design: matchmaker-draw-followups

## Context

M15（`matchmaker-timed-draw`）於 2026-09-11 合併並 archive，`RoundMatch.winner` 與
`MatchHistoryEntry.winner` 自此為 `"teamA" | "teamB" | "draw"` 三值。M15 的 Final Code Review
逐一盤點了「平手」的**顯示**消費點（歷史卡、CSV、匯出、對戰頁），但**沒有**盤點「以 `winner`
做二元判斷」的**計算**消費點——`player-stats.ts` 在 M15 的 diff 中為零改動，因此不在 M15 任何
一個群組的審查範圍內。

本 change 撰寫時已就 `main` 實測，證據如下。

**證據一：`player-stats.ts` 是 production 程式碼中唯一未處理 `"draw"` 的 `winner` 判斷點。**

```
$ grep -rn 'winner === \|winner !== ' nextjs-pickball --include="*.ts" --include="*.tsx" | grep -v '\.test\.'
components/matchmaker/HistoryRecordCard.tsx:99   isWinner={entry.winner === "teamA"}
components/matchmaker/HistoryRecordCard.tsx:100  isDraw={entry.winner === "draw"}
components/matchmaker/HistoryRecordCard.tsx:106  isWinner={entry.winner === "teamB"}
components/matchmaker/HistoryRecordCard.tsx:107  isDraw={entry.winner === "draw"}
components/matchmaker/CourtCard.tsx:188          {completed && match.winner === winnerKey && (
components/matchmaker/CourtCard.tsx:296          {match.winner === "draw" && (
lib/matchmaker/history-csv.ts:133                entry.winner === "teamA" ? ... : entry.winner === "teamB" ? ... : DRAW_LABEL
lib/matchmaker/round.ts:1002                     winnerIndex: winner === "draw" ? "draw" : winner === "teamA" ? 0 : 1
lib/matchmaker/player-stats.ts:304               if (entry.winner === winnerKey) {   ← 唯一未處理 draw 者
lib/matchmaker/export-scene.ts:175               if (match.winner === "draw") {
```

`CourtCard.tsx:188` 看似也是二元判斷，但它的語意是「這一隊是不是勝方」，`"draw"` 下兩隊皆為
`false` 是正確結果，且第 296 行另有平手標籤；M15 已在該檔第 184 行留下註解說明。
`player-stats.ts:304` 的 `else` 分支則直接把「不是勝方」等同於「敗方」，這是本 change 要修的點。

**證據二：受損的是敗場，不是勝率或名次。**
`computePlayerStats` 中 `winRate: winRateOf(stat.wins, stat.gamesPlayed)` 不讀 `losses`；
`comparePlayerStatsForRanking` 只讀 `currentRating`／`winRate`／`gamesPlayed`／`name`。
因此平局的錯誤**只出現在 `losses` 這個數字與它在畫面上的呈現**，不影響排序，也不影響任何
LocalStorage 內容（統計是純計算，不落地）。

**證據三：現行呈現與現行文案。**
`PlayerStatsTable.tsx` 第 54 行標題為 `<TableHead>勝負</TableHead>`，第 89 行內容為
`{stat.wins} - {stat.losses}`。`labels.ts` 第 73 行為
`export const ROUND_TIMER_EXPIRED_MESSAGE = "時間到：領先者勝，平手請再打一球";`。

**證據四：既有測試對這兩處的釘法。**
`RoundTimerBanner.test.tsx` 第 57 行以 `getByText(ROUND_TIMER_EXPIRED_MESSAGE)` 斷言——
**它 import 常數本身，因此改字串不會讓任何既有測試轉紅**（恆真斷言的一種）。
`tests/e2e/specs/player-stats.spec.ts` 第 283～295 行以 `toContainText(columnName)`
逐一比對九個欄名，**子字串**比對——把標題改成「勝負和」後，`toContainText("勝負")`
**依然會通過**。這兩點決定了本 change 的 RED 要放在哪裡（Decision 6）。

## Goals

- 平局在 `/matchmaker/stats` 上被計為和局，敗場數字回到正確值。
- 計時到期提示文案與 M15 之後 `round-lifecycle` 實際接受的送出行為一致。
- 兩項修正皆不改變勝率、名次、評分、歷史資料與任何 LocalStorage 內容。

## Non-Goals

- 不改勝率公式（維持 `勝場 ÷ 出場數`）。
- 不新增第十欄，不改變排行榜的欄位總數。
- 不重算、不遷移既有歷史；不動 `round-lifecycle`／`match-rating`／`scoreboard`。
- 不處理 M14 design.md 的 Open Questions 第 7 條（計時長度無法改回「不計時」）與
  第 11 條（到期後重新整理會再播一次提示音）。

## Decisions

### Decision 1：`PlayerStat` 新增 `draws: number`，和局仍計入出場數

和局是**打過的一場**，出場數 MUST 包含它——把和局排除在 `gamesPlayed` 之外會讓
「這人打了幾場」這個最直白的數字失真，而且與 `ratingDelta`（`tallyRatingDelta` 逐筆加總，
本來就含平局場次）互相矛盾。

因此採「三分互斥」：`勝場 + 敗場 + 和局 = 出場數`。`MutableStat` 同步新增 `draws`，
初值 0，四個建構點（`buildRosterUnion` 的名單分支與歷史分支）各補一個 `draws: 0`。

**否決的替代方案**：只把 `"draw"` 從 `losses` 扣掉、不新增欄位。這會讓
`勝場 + 敗場 ≠ 出場數`，使用者看到「出場 3、2 勝 0 敗」時無從得知第三場去哪了。

### Decision 2：勝率公式維持 `勝場 ÷ 出場數`，和局計入分母不計入分子

`player-stats` spec 現行的「勝率 MUST 為勝場除以出場數」在本 change 前後**逐字不變**。
和局讓勝率下降，這與「和局不是勝場」一致。

**否決的替代方案**：`(勝場 + 0.5 × 和局) ÷ 出場數`（足球式積分感）或
`勝場 ÷ (出場數 − 和局)`（排除和局）。兩者都是**產品規則變更**而非修 bug，且都會改動既有
Scenario「出場數、勝場與敗場依歷史紀錄正確加總」以外的計算行為；要做應另開 change 討論，
不該夾帶在缺陷修正裡。

### Decision 3：沿用既有欄位，標題改為「勝負和」、內容改為 `勝 - 敗 - 和`

排行榜共九欄，`player-stats` spec 的「統計頁的可用性、無障礙與唯讀保證」明訂 390px 寬度下限
不得整頁橫向溢出。新增第十欄會直接壓縮這條硬條件的餘裕；而既有「勝負」欄的內容
（`2 - 1`）本來就是「用分隔號串起多個數字」的形狀，擴為 `2 - 1 - 1` 是同一種形狀的自然延伸，
不引入新的閱讀規則。

標題「勝負和」的字序與內容 `勝 - 敗 - 和` 的數字順序一致——標題本身就是這三個數字的圖例，
不需要另加說明文字。

**否決的替代方案**：內容改為帶單位的「2勝 1敗 1和」。可讀性較好，但字寬約為原本的兩倍，
在 390px 下風險最高的就是這一欄；且既有的 `2 - 1` 已使用數年、使用者已習慣。列為 Open Question。

### Decision 4：三個數字恆常顯示，SHALL NOT 在和局為 0 時隱藏第三個數字

條件渲染會讓同一欄在不同列出現兩個或三個數字，讀者必須逐列判斷「這第二個數字是敗場還是
和局」。恆常顯示 `2 - 1 - 0` 雖然多一個零，但欄位語意固定。這同時讓元件少一個分支、
少一條需要覆蓋的路徑。

### Decision 5：`ROUND_TIMER_EXPIRED_MESSAGE` 只換字串值

常數名稱、匯出位置、`RoundTimerBanner.tsx` 的渲染方式全部不變——文案是資料，不是結構。

三項約束寫進 spec：

1. **保留「時間到：」前綴**。`tests/e2e/specs/round-timer.spec.ts` 第 194 行的既有斷言以
   `toContainText("時間到")` 定位該區塊（該行註解已載明此意圖）；保留前綴讓該 E2E 零修改。
2. **SHALL NOT 以 `DRAW_LABEL` 拼接**。`DRAW_LABEL`（M15 引入）的語意是「某一場的結果標籤」，
   本句的「平手」是敘述句的一部分。M15 的 tasks 10.13 已就這一點做過裁決（明文記載
   `ROUND_TIMER_EXPIRED_MESSAGE` 內嵌的「平手」屬不同訊息、非重複定義），本 change 沿用，
   不重新討論。
3. **新文案為「時間到：領先者勝，同分可直接送出平手」**。第二個子句維持**指示句**，
   不改成陳述句——原文案告訴主持人下一步做什麼（再打一球），新文案同樣告訴主持人下一步
   做什麼（直接送出）。若改成純陳述（例如「同分為平手」），主持人會停在「那我現在要按什麼」。

### Decision 6：為兩處各補一條**新** Scenario，而不是只改既有 Scenario 的斷言

Context 證據四指出：既有的 `RoundTimerBanner.test.tsx` 斷言 import 常數本身，既有的 E2E
以子字串比對欄名。**若只改實作、不補測試，兩處都會靜默全綠**——沒有紅燈，也沒有任何測試
真正釘住新行為。

因此：

- 文案：新增 it「時間到提示文案說明同分可直接送出平手而非再打一球」，斷言渲染出的文字
  **含「同分」與「平手」、不含「再打一球」**。這條在改字串前是**真紅燈**（現行文案含
  「再打一球」）。斷言用語意片段而非整句逐字比對，是為了避免下次微調用字時整條測試失效，
  同時仍能擋住「改回舊文案」這個唯一要防的退化。
- 欄位：新增 it「勝負和欄依序顯示勝場敗場與和局三個數字」，同時斷言標題為「勝負和」。
  這條在改元件前也是真紅燈。E2E 第 283～295 行的欄名陣列同步改為「勝負和」——該項**改完
  即綠**（子字串仍命中），MUST 在 tasks 誠實標註為 regression guard，SHALL NOT 宣稱紅燈。

### Decision 7：兩個缺陷合為一個 change，不拆兩個

兩者的根因是同一件事——M15 引入 `"draw"` 後，兩處以二元勝負為前提的既有內容失效——
且都極小（各一個檔案的實作改動）。拆成兩個 change 會付兩份 artifact 與兩輪 verify／archive
成本，而它們的 spec 沒有任何交互作用（分屬 `player-stats` 與 `match-stage`，可獨立審查）。

## Risks / Trade-offs

- **`draws` 是 `PlayerStat` 的新必填欄位**，任何以物件字面量建構 `PlayerStat` 的測試 helper
  會在 `tsc --noEmit` 直接報錯。這是**刻意的編譯期安全網**，不是要規避的錯誤——它會逐一指出
  所有需要跟進的建構點。開工前先 `grep -rn "PlayerStat" nextjs-pickball` 盤點。
- **390px 溢出風險**。勝負和欄多一個數字與一組分隔號。既有 E2E Scenario
  「排行榜表格於支援寬度下限不造成整頁橫向溢出」已覆蓋這條線，**MUST 實跑**該 E2E
  而非只看元件測試。若確實溢出，先縮該欄的內距或字級，SHALL NOT 改回兩個數字。
- **既有 E2E 的子字串比對會遮蔽退化**。改完 E2E 陣列後，「勝負」與「勝負和」都會通過該
  斷言，因此該 E2E **無法**單獨證明標題已改名；證明責任在
  `PlayerStatsTable.test.tsx` 的新 it（Decision 6）。Stage 2 MUST 以 mutation
  （把標題改回「勝負」）確認新 it 真的會紅。
- **文案斷言用語意片段**。若未來有人把文案改成「同分算平手」，新 it 仍會通過。這是刻意的
  取捨（見 Decision 6）：唯一要防的退化是「改回含『再打一球』的舊文案」，而 spec 已逐字
  記載完整文案供人工比對。

## Migration Plan

**無資料遷移。** `computePlayerStats(history, players)` 是純函式，每次載入統計頁都由
`matchmaker:history:v1` 即時重算，因此修正一上線即對**所有既有平局紀錄回溯生效**，
使用者不需要做任何事。

三個 LocalStorage key 的 schema 與內容零變動；`ROUND_TIMER_EXPIRED_MESSAGE` 不落地。
舊版程式讀新資料、新版程式讀舊資料皆不受影響——本 change 沒有改動任何持久化格式。

## Open Questions

1. **勝負和欄是否改用帶單位的「2勝 1敗 1和」？**（Decision 3 的否決方案）
   目前決議維持 `2 - 1 - 1` 三個裸數字，理由是 390px 寬度下限。若使用者在真機上覺得
   三個裸數字難以辨讀，應另開 change 處理呈現，SHALL NOT 在本 change 內臨時改動。
   ⚠️ 待使用者實測後決定。
2. **M14 design.md 的 Open Questions 第 7 條與第 11 條仍未解。** 第 7 條：回合一旦設定計時
   長度就無法改回「不計時」。第 11 條：到期後重新整理頁面會再播一次提示音。兩者皆與本
   change 的文案修正相鄰（同一個 `RoundTimerBanner` 路徑），但屬行為變更而非缺陷修正，
   本 change 明確不處理。⚠️ 待使用者決定是否另開 change。
