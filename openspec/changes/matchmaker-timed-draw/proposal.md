## Why

本 change 是「對戰分配機」交付序的 **milestone M15（計時制平局：S=0.5、歷史與匯出的平手表示）**，位置如下：

```
M10 stage-gaps → M11 player-stats → M12 scoreboard-team-labels
   → M13 player-swap → M14 round-timer → 【M15 計時制平局（本 change）】
```

**執行相依**：`matchmaker-round-timer`（M14）MUST 已合併回 `main`——本 change 的「計時回合」
判定條件（`round.timer !== null`）由 M14 引入，見「執行相依細節」節。

出處：`archive/2026-09-03-matchmaker-rating-engine/design.md` 的 Open Questions 第 1 條：

> **平局路徑**——`prd.md` 13.4 明訂平局不得送出，因此本段不提供 `S = 0.5`。若未來開放平局
> （例如計時制），需另開 change 補 `S = 0.5` 的 Scenario 與 clamp 行為——屆時零和的成立條件
> 不變。

M3（`match-rating`）落地評分公式時，`prd.md` 13.4 的「平局不得送出」是當時唯一存在的規則——
對戰沒有時間上限，比賽必然打到分出勝負。M14 引入計時回合後，這條前提第一次出現例外：時間到
時兩隊比分可能相同，而現行 `validateScoreInput` 對「兩隊比分相同」一律拒絕、`match-rating` 明文
「SHALL NOT 提供平局路徑」，兩者合起來讓計時回合永遠無法把打成平手的一場正式送出——主持人只能
無限期把該場晾在「未完成」，其歷史、匯出的圖與列印稿也永遠少一場。本 change 補上這個路徑：
只在計時回合放行平局送出，`S = 0.5` 的評分計算、歷史紀錄與匯出的「平手」顯示。

## 明確不做（Non-goals）

- **不改計分板**。`scoreboard` 的 Traditional side-out 規則（`openspec/specs/scoreboard/spec.md`
  的「計分規則 — Traditional Side-Out」）要求「贏 2 分」，結構上不可能產生平局；
  `collectFinishedSubmissions`（`lib/matchmaker/scoreboard-binding.ts`）只回填
  `slot.status === "finished"` 的場次，而 `finished` 只在 `isGameWon` 判定某一方獲勝時成立。
  計分板路徑因此永遠不會把相同比分送進 `submitScore`，本 change 不修改 `scoreboard` capability
  的任何 requirement。
- **不做「延長賽」自動流程**。`prd.md` 第 15 章已否決「系統自動判斷延長賽」；本 change 沿用該
  否決——時間到即可送出平局，不新增任何「再打一分決勝」的自動化。
- **不重算既有歷史**。已寫入的歷史紀錄（含舊版備份，`winner` 只有 `"teamA"`／`"teamB"` 兩值）
  維持原樣，本 change 不做任何遷移或重算。
- **不做每場獨立計時**。M14 的計時是**整輪**（`round.timer`）層級，本 change 沿用同一顆判定
  （`round.timer !== null`），不新增「本場獨立倒數」之類的概念。

## What Changes

- `round-lifecycle`：`RoundMatch.winner` 由 `"teamA" | "teamB"` 擴為
  `"teamA" | "teamB" | "draw"`；`validateScoreInput` 新增第四個參數表示「本回合是否為計時制」，
  計時回合下兩隊比分相同 MUST 被接受，非計時回合維持原樣拒絕（`prd.md` 13.4 不變）；
  `submitScore` 於計時回合平局時把 `winner` 記為 `"draw"`、評分改以 `S = 0.5` 計算。
- `match-rating`：`updateRatings` 的 `winnerIndex` 由 `0 | 1` 擴為 `0 | 1 | "draw"`，
  `"draw"` 時雙方 `S = 0.5`；移除「本 capability SHALL NOT 提供平局路徑」的既有禁令，
  改為明文支援；零和的成立條件不變（結構性保證延伸至平局：雙方變動方向仍必定相反或同為零）。
- `match-history`：`MatchHistoryEntry.winner` 由 `"teamA" | "teamB"` 擴為
  `"teamA" | "teamB" | "draw"`；歷史頁的勝方顯示新增「平手」文字。
- `data-transfer`：歷史賽果 CSV 的「勝方」欄位在平手時輸出「平手」；JSON 備份的匯入 schema
  透過 `round-lifecycle`／`match-history` 的 schema 擴充自動接受 `"draw"`，舊備份（`winner`
  僅 `"teamA"`／`"teamB"`）維持可正常匯入。
- `match-stage`：已完成場次為平局時，兩隊皆不顯示「勝」標籤，改顯示「平手」文字標籤；
  手動送出比分於非計時回合遇兩隊比分相同時的錯誤訊息，明確指出「非計時回合不得送出平局」。
- `visual-export`：匯出內容（JPG／PDF 共用的 `ExportScene`）的已完成場次狀態文字，平局時顯示
  「比分　平手」而非「比分　OO隊獲勝」。

### 執行相依細節

M14（`matchmaker-round-timer`）在 `Round` 上引入計時欄位（本 change 以 `round.timer !== null`
表示「本輪為計時制」）。本文件撰寫時 M14 尚未實作於 `main`（M10～M14 依序執行中，本 change 為
最後一棒），因此 `round.timer` 的確切型別與命名是**設計假設**，不是已於 `main` 上驗證的事實
——design.md 的 Open Questions 第 1 條已將「apply Step 0 MUST 以合併後的 `main` 重新對齊」列為
強制項。若 M14 交付的判定條件與本文件假設的欄位名稱不同，MODIFIED spec 與 tasks 的 §1 前置確認
MUST 依實際簽章調整，SHALL NOT 依本文件的假設欄位名稱開工。（補充：`openspec/changes/
matchmaker-round-timer/proposal.md`——propose 階段尚未完成、未 apply、未合併——記載
`Round.timer` 之欄位形狀與本文件假設相符，可作佐證但不能取代上述實測義務，詳見 design.md。）

## Capabilities

### Modified Capabilities

- `round-lifecycle`：「回合資料模型」（`winner` 列舉擴增）、「比分驗證」（計時回合放行平局、
  非計時回合錯誤訊息調整）、「比分送出的完成流程」（平局分支的 `winner`／評分計算）
- `match-rating`：「評分更新公式與常數」（移除平局禁令、納入 `S = 0.5`）、「零和的成立條件」
  （平局下的方向保證）
- `match-history`：「歷史紀錄欄位 schema」（`winner` 列舉擴增）、「歷史紀錄的顯示欄位」
  （平手的顯示文字）
- `data-transfer`：「歷史賽果的 CSV 匯出」（勝方欄的平手輸出）、「JSON 匯入的結構驗證與整份
  原子性」（新增 `draw` 的匯入相容 Scenario）
- `match-stage`：「完成場次的視覺與資訊」（平局無勝方高亮、顯示平手標籤）、「手動輸入比分與
  送出」（非計時回合的錯誤訊息區分）
- `visual-export`：「匯出內容的組成」（已完成場次狀態文字的平手分支）

未列入 Modified 的相鄰 capability：

- `scoreboard`：結構上不可能產生平局（見「明確不做」），零改動。
- `player-roster`：本 change 不新增、不修改任何參賽者欄位。

## Impact

- **修改（程式碼）**：
  - `nextjs-pickball/lib/matchmaker/round-types.ts`（`RoundMatchSchema.winner` 列舉）
  - `nextjs-pickball/lib/matchmaker/round.ts`（`validateScoreInput`／`submitScore`／
    `VALIDATE_SCORE_FAILURE_CODE` 的 `TIE` 訊息、`toHistoryEntry`）
  - `nextjs-pickball/lib/matchmaker/rating-types.ts`（`RatingUpdateInput.winnerIndex`）
  - `nextjs-pickball/lib/matchmaker/rating.ts`（`updateRatings` 的 `s` 計算）
  - `nextjs-pickball/lib/matchmaker/history.ts`（`MatchHistoryEntrySchema.winner` 列舉）
  - `nextjs-pickball/lib/matchmaker/history-csv.ts`（勝方欄輸出）
  - `nextjs-pickball/lib/matchmaker/labels.ts`（新增「平手」具名常數）
  - `nextjs-pickball/lib/matchmaker/export-scene.ts`（`buildStatusText` 的平手分支）
  - `nextjs-pickball/components/matchmaker/CourtCard.tsx`（平手顯示、移除勝方 Badge 的誤判）
  - `nextjs-pickball/components/matchmaker/HistoryRecordCard.tsx`（勝方顯示的平手分支）
- **重用（唯讀，不修改介面）**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`
  （`collectFinishedSubmissions` 結構上不會產生平局送出，零修改）
- **不動**：`hono-pickball/**`、`hooks/`（不新增任何 hook）、`lib/scoreboard/**`、
  `lib/matchmaker/backup.ts`（`BackupSchema` 透過 `RoundSchema`／`MatchHistoryEntrySchema`
  組合複用，`draw` 隨兩者的擴增自動生效，不需修改本檔）
- **無外部相依**：**不新增任何 npm 套件**
