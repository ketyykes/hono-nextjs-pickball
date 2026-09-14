## Why

本 change 是 **M15（`matchmaker-timed-draw`，計時制平局）合併後的兩項收尾修正**，不是新功能。
M15 讓 `winner` 第一次可以是 `"draw"`；兩處在 M15 之前以「二元勝負」為前提寫成的既有內容，
因此開始給出錯誤的數字與錯誤的指示。兩者都在 M15 的 archive 收尾階段被發現，當時判定
「不在 M15 的 proposal 範圍內、不得順手改」而留置（紀錄於
`matchmaker-runbook-m10-m15.md` 的「全流程結束」節），本 change 專門處理它們。

**缺陷一：平局被記成雙方各一敗場。**
`nextjs-pickball/lib/matchmaker/player-stats.ts` 的 `tallyGamesAndResults` 以
`entry.winner === winnerKey` 二分勝敗；`winner` 為 `"draw"` 時兩隊的 `winnerKey`
（`"teamA"`／`"teamB"`）都不相等，於是該場**每一位**球員都被記一場敗場。
`/matchmaker/stats` 排行榜的「勝負」欄因此把和局顯示成敗場。
影響範圍要說準：勝率為 `wins ÷ gamesPlayed`、**不讀 `losses`**，排序比較器
（`comparePlayerStatsForRanking`）也只讀目前強度／勝率／出場數／姓名，兩者都**不受影響**；
受損的是**敗場數字本身**與使用者對「我到底輸幾場」的認知。
此外 `player-stats` capability 的「出場、勝負與勝率的計算」Requirement 目前明文
「SHALL NOT 出現既非勝場亦非敗場的第三種計數」——這條在 M15 之後已與資料模型直接矛盾，
MUST 一併修正，否則照 spec 寫出來的實作必定是錯的。

**缺陷二：計時到期的提示文案與現行行為矛盾。**
`nextjs-pickball/lib/matchmaker/labels.ts` 的 `ROUND_TIMER_EXPIRED_MESSAGE`（M14 引入，
由 `match-stage` 的「計時器顯示與時間到提示」Requirement **逐字指定**）目前為
「時間到：領先者勝，平手請再打一球」。M15 之後，計時回合的同分**可以直接送出並永久記為平手**，
「再打一球」是錯誤指示：照做會讓最終送出的比分不再是時間到當下的比分。

## 明確不做（Non-goals）

- **不改勝率公式**。勝率維持「勝場 ÷ 出場數」，和局計入分母、不計入分子，
  SHALL NOT 改為 `(勝場 + 0.5 × 和局) ÷ 出場數` 或把和局排除在分母外——那是產品規則變更，
  不是修 bug，需要另開 change 討論。
- **不新增排行榜欄位**。排行榜維持既有九欄，只把「勝負」欄本身擴為三個數字，
  SHALL NOT 另加一欄「和局」（`prd.md` 12.3 的 390px 寬度下限是硬條件）。
- **不重算、不遷移既有歷史**。`computePlayerStats` 每次都由 `history` 即時計算，
  修好即對既有紀錄回溯生效；本 change 對三個 LocalStorage key 的**內容**零改動。
- **不處理 M14 design.md 的兩個 Open Questions**：第 7 條（回合一旦設定計時長度就無法改回
  「不計時」）與第 11 條（到期後重新整理頁面會再播一次提示音）維持 ⚠️ 待人類決定，
  本 change 不碰。
- **不改 `round-lifecycle`／`match-rating`**。`"draw"` 的產生條件、`S = 0.5` 的評分計算
  皆由 M15 完成且正確，本 change 零改動。

## What Changes

- `player-stats`：`PlayerStat` 與內部 `MutableStat` 新增 `draws: number`；
  `tallyGamesAndResults` 由二分改為三分——所屬隊伍等於 `winner` 記勝場、`winner` 為
  `"draw"` 記和局、其餘記敗場；「出場、勝負與勝率的計算」Requirement 移除
  「SHALL NOT 出現既非勝場亦非敗場的第三種計數」的禁令，改為明文要求和局獨立計數，
  並明訂 `勝場 + 敗場 + 和局 = 出場數`。
- `player-stats`：排行榜「勝負」欄的標題改為「勝負和」，內容由 `勝 - 敗` 改為
  `勝 - 敗 - 和`（三個數字恆常顯示，和局為 0 時亦然）。欄位總數不變，仍為九欄。
- `match-stage`：`ROUND_TIMER_EXPIRED_MESSAGE` 改為
  「時間到：領先者勝，同分可直接送出平手」，「計時器顯示與時間到提示」Requirement 內
  逐字指定的文案同步更新。開頭的「時間到：」前綴刻意保留（既有 E2E 以
  `toContainText("時間到")` 斷言，見 Impact）。

## Capabilities

### Modified Capabilities

- `player-stats`：「出場、勝負與勝率的計算」（和局獨立計數、移除第三種計數的禁令）、
  「統計頁的路由與呈現」（「勝負」欄改為「勝負和」欄與其三數字內容）
- `match-stage`：「計時器顯示與時間到提示」（到期提示文案逐字更新）

未列入 Modified 的相鄰 capability：

- `round-lifecycle`、`match-rating`：`"draw"` 的產生與評分由 M15 完成，本 change 零改動。
- `match-history`、`data-transfer`、`visual-export`：歷史頁、CSV 與匯出的「平手」顯示
  由 M15 完成且正確，本 change 零改動。
- `scoreboard`：Traditional side-out 規則要求「贏 2 分」，結構上不可能產生平局，零改動。

## Impact

- **修改（程式碼）**：
  - `nextjs-pickball/lib/matchmaker/player-stats.ts`（`PlayerStat`／`MutableStat` 的
    `draws` 欄位、`tallyGamesAndResults` 的三分支、`computePlayerStats` 的組裝）
  - `nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx`（欄標題與勝負和欄內容）
  - `nextjs-pickball/lib/matchmaker/labels.ts`（`ROUND_TIMER_EXPIRED_MESSAGE` 的字串值
    與其註解；**不新增常數**）
- **修改（測試）**：
  - `nextjs-pickball/lib/matchmaker/player-stats.test.ts`
  - `nextjs-pickball/components/matchmaker/PlayerStatsTable.test.tsx`
  - `nextjs-pickball/components/matchmaker/RoundTimerBanner.test.tsx`
  - `nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`（九項欄位名稱陣列中的
    「勝負」→「勝負和」，本文件撰寫時位於該檔第 288 行）
- **重用（唯讀，不修改）**：
  - `nextjs-pickball/tests/e2e/specs/round-timer.spec.ts`——既有斷言只比對
    「時間到」子字串（該檔第 194 行的註解已載明此意圖），文案改動後仍通過，零修改。
  - `nextjs-pickball/components/matchmaker/RoundTimerBanner.tsx`——渲染的是
    `ROUND_TIMER_EXPIRED_MESSAGE` 常數本身，文案改動不需要動元件。
- **不動**：`hono-pickball/**`、`hooks/**`、`lib/matchmaker/round.ts`／`rating.ts`／
  `history.ts`／`history-csv.ts`／`export-scene.ts`、`components/matchmaker/CourtCard.tsx`／
  `HistoryRecordCard.tsx`、`lib/scoreboard/**`、`openspec/specs/**` 的主 spec
- **無外部相依**：**不新增任何 npm 套件**
