# Overview: matchmaker-timed-draw

## Scope

計時回合（`round.timer !== null`，M14 引入）時間到、兩隊比分相同的場次，目前永遠卡在
「未完成」——`round-lifecycle` 的比分驗證與 `match-rating` 皆明文拒絕平局。本 change 開一條
條件式例外：只有計時回合可以把相同比分送出為「平局」，評分改以 `S = 0.5` 計算，並讓歷史、
CSV、對戰頁與 JPG／PDF 匯出四處既有的「勝方顯示」都同步補上「平手」文字，不遺漏任一處。

**Size**: large — 影響 6 個 capability（`round-lifecycle`、`match-rating`、`match-history`、
`data-transfer`、`match-stage`、`visual-export`），tasks 預估遠超過 20 項。
**Frontend involved**: yes — `CourtCard.tsx`（對戰頁完成場次顯示、送出委派）與
`HistoryRecordCard.tsx`（歷史頁勝方顯示）皆需新增「平手」的視覺呈現。
**DB schema touched**: no — matchmaker 為 LocalStorage-only 純前端功能，不涉及任何資料庫。
**Data migration**: no — 不搬移、不轉換任何既有資料；`winner` 列舉值域擴增，既有資料（僅
`"teamA"`／`"teamB"`）不受影響、仍為合法子集。
**Cross-component flow**: yes — 「送出平局比分」是一條跨三個純函式模組的順序敏感流程
（`validateScoreInput` 判定可否平局 → `submitScore` 決定 `winner` → `updateRatings` 以
`S = 0.5` 計算），且四個顯示消費點（歷史頁、CSV、對戰頁、JPG／PDF）各自獨立呈現同一份
`winner` 值，值得畫一次時序圖釐清誰在什麼時機讀到什麼。

---

## What Changes

- `round-lifecycle`：`RoundMatch.winner` 新增 `"draw"`；`validateScoreInput` 新增
  `isTimedRound` 參數，計時回合下兩隊比分相同轉為成功路徑；`submitScore` 平局時寫入
  `winner: "draw"` 並以 `S = 0.5` 呼叫評分。
- `match-rating`：`updateRatings` 的 `winnerIndex` 新增 `"draw"` 選項，`S = 0.5`；零和的
  結構性保證（方向必反）延伸至平局，含 `E = 0.5` 時雙方變動皆為零的邊界情形。
- `match-history`：`MatchHistoryEntry.winner` 新增 `"draw"`；歷史頁顯示「平手」文字。
- `data-transfer`：CSV「勝方」欄平局輸出「平手」；JSON 匯入透過既有 schema 組合自動接受
  `"draw"`，`backup.ts` 零程式碼修改。
- `match-stage`：已完成場次為平局時不顯示任一隊「勝」標籤，改顯示「平手」標籤；UI 送出流程
  不新增任何「兩隊比分相同」的攔截邏輯，一律委派 `round-lifecycle` 判定。
- `visual-export`：`ExportScene` 的已完成場次狀態文字，平局時顯示「比分　平手」。

```
=== Before ===

  計時回合、時間到、比分 11:11
    → validateScoreInput 一律拒絕（TIE，無論是否計時制）
    → 該場永遠卡在「未完成」
    → 歷史／CSV／對戰頁／JPG／PDF 皆無平局可顯示（因為送不出去）

=== After ===

  計時回合、時間到、比分 11:11
    → validateScoreInput 見 isTimedRound=true → 放行
    → submitScore 寫入 winner:"draw"，evaluateRatings 以 S=0.5 計算
    → 歷史一筆新紀錄（winner:"draw"）
    → 對戰頁：兩隊皆無「勝」標籤，改顯示「平手」
    → 歷史頁／CSV／JPG／PDF：四處同步顯示「平手」

  非計時回合、比分 11:11
    → validateScoreInput 見 isTimedRound=false → 依舊拒絕（訊息明確指出非計時回合）
    → 行為與 Before 完全相同（prd.md 13.4 不變）
```

---

## UI Mockups

以下三組 state，依「非計時回合維持原樣」「計時回合的成功路徑」「四個顯示消費點」的順序呈現。
`←` 之後為註解，不是畫面文字。

```
=== State 1: 非計時回合，兩隊比分相同時仍被拒絕（不變） ===

┌─ 第 1 場地 ───────────────────────────────────────┐
│ 第一隊比分 [11]   第二隊比分 [11]   [送出比分]     │
│ (!) 非計時回合不得送出平局，兩隊比分相同時無法     │
│     判定勝方，請確認比分後再試一次；若要允許平手， │
│     請改用計時制回合。               ← role="alert" │
└─────────────────────────────────────────────────────┘

=== State 2: 計時回合，兩隊比分相同時成功送出 ===

┌─ 第 1 場地（計時制）─────────────────────────────┐
│ 第一隊比分 [11]   第二隊比分 [11]   [送出比分]     │
└─────────────────────────────────────────────────────┘
                    │  送出
                    ▼
┌─ 第 1 場地 ───────────────────────────────────────┐
│ 第一隊             第二隊       ← 兩者皆無「勝」   │
│ 11  :  11                       ← 平手比分         │
│ [平手]                          ← 新增的平手標籤   │
│ 14:32                           ← 完成時間         │
└─────────────────────────────────────────────────────┘

=== State 3: 平手在四個既有顯示點同步出現 ===

┌─ 歷史頁 HistoryRecordCard ────────────────────────┐
│ 2026-09-10 14:32 · 單打 · 第 1 場地               │
│ 第一隊 王大明          第二隊 李小華                │
│ 11 : 11        [平手]           ← 新增             │
└─────────────────────────────────────────────────────┘

CSV 匯出（歷史賽果.csv）：
  ...,比分,勝方,...
  ...,11：11,平手,...              ← 新增，非「第二隊」

JPG／PDF 匯出（ExportScene 狀態文字）：
  第 1 場地      11 : 11　平手      ← 新增，非「OO隊獲勝」
```

---

## Architecture

平局送出橫跨三個純函式模組、四個顯示消費點；`ExportScene` 與 `HistoryRecordCard`／
`history-csv.ts` 皆為 `winner` 的**唯讀消費端**，本 change 只在它們既有的二元判斷上補一個
分支，不新增任何資料流向。

```
  CourtCard.tsx (UI, 不感知 timer)
       │ onSubmitScore(matchId, "11", "11")
       ▼
  useRoundStore.submitScore()          ← 零修改：已持有 state.round
       │ submitScorePure({ round, players, matchId, rawScoreA, rawScoreB, now })
       ▼
  round.ts submitScore()
       │ isTimedRound = round.timer !== null      ← 本 change 新增的推導
       ├─► validateScoreInput(match, "11", "11", isTimedRound)   round-lifecycle
       │        │ ok:true, scoreA:11, scoreB:11
       │        ▼
       ├─► winner = scoreA===scoreB ? "draw" : (scoreA>scoreB?"teamA":"teamB")
       │        ▼
       └─► updateRatings({ format, teams, winnerIndex })   match-rating
                （winner==="draw" ? "draw" : ...）
                │ S=0.5（draw）或 S=1/0（既有路徑）
                ▼
       toHistoryEntry(..., winner, ...)           match-history
                │
                ▼
       appendHistoryEntry() → matchmaker:history:v1

  唯讀消費端（winner:"draw" 讀出後各自補一個顯示分支）:
    CourtCard.tsx（對戰頁「平手」標籤）           match-stage
    HistoryRecordCard.tsx（歷史頁「平手」文字）    match-history
    history-csv.ts（CSV「勝方」欄「平手」）        data-transfer
    export-scene.ts（ExportScene 狀態文字「平手」） visual-export
    backup.ts（BackupSchema 組合既有 schema，零修改）      data-transfer

  外部相依（唯讀取用，本 change 不修改）:
    matchmaker-round-timer / M14 : round.timer（判定依據，見 design Open Questions 1）
  npm 相依: 零新增
```

---

## Sequence Diagram

計時回合送出平局比分的端到端順序，與非計時回合送出平局比分的失敗分支對照。

```
使用者      CourtCard      useRoundStore     round.ts        rating.ts
  │             │                │              │                │
  │ 填 11/11    │                │              │                │
  │ [送出比分]  │                │              │                │
  ├────────────►│                │              │                │
  │             │ onSubmitScore  │              │                │
  │             ├───────────────►│              │                │
  │             │                │ submitScorePure({round,...})  │
  │             │                ├─────────────►│                │
  │             │                │              │ isTimedRound = │
  │             │                │              │  round.timer!==null
  │             │                │              ├──┐             │
  │             │                │              │◄─┘             │
  │             │                │              │ validateScoreInput(
  │             │                │              │   match,"11","11",
  │             │                │              │   isTimedRound)
  │             │                │              ├──┐ true→ok      │
  │             │                │              │◄─┘             │
  │             │                │              │ winner="draw"  │
  │             │                │              │ updateRatings({
  │             │                │              │   winnerIndex:"draw"})
  │             │                │              ├───────────────►│
  │             │                │              │◄────────────────┤ S=0.5 両隊
  │             │                │              │ toHistoryEntry(...,"draw")
  │             │                │              ├──┐             │
  │             │                │              │◄─┘             │
  │             │                │◄─────────────┤ { ok:true, round,
  │             │                │              │   historyEntry,
  │             │                │              │   playerPatches }
  │             │                │ dispatch SUBMIT_SCORE ＋ updatePlayer ×N
  │             │                ├──┐           │                │
  │             │                │◄─┘           │                │
  │             │◄───────────────┤              │                │
  │  畫面顯示   │                │              │                │
  │  「平手」   │                │              │                │
  │◄────────────┤                │              │                │

--- 非計時回合的失敗分支（不變） ---

使用者      CourtCard                          round.ts
  │             │                                  │
  │ 填 11/11    │                                  │
  ├────────────►│                                  │
  │             │ onSubmitScore ──────────────────►│
  │             │                                  │ isTimedRound=false
  │             │                                  │ validateScoreInput
  │             │                                  ├──┐ TIE，非計時回合
  │             │                                  │◄─┘ 訊息說明原因
  │             │◄─────────── submitError ─────────┤
  │  role=alert │                                  │
  │  非計時回合  │                                  │
  │  不得送出平局│                                  │
  │◄────────────┤                                  │
```

---

## Task Tree

`§1` 為前置確認（含 M14 欄位重新對齊，見 design Open Questions 1）；`§2～§4` 為三個各自獨立
的 schema／型別擴增（純函式模組，可依序快速推進）；`§5` 是唯一需要等**三個**上游都就緒才能
開工的整合點（`round.ts` 的 `submitScore` 同時消費 §2 的 `RoundMatch.winner`、§3 的
`RatingUpdateInput.winnerIndex`、§4 的 `MatchHistoryEntry.winner`——`toHistoryEntry` 的
回傳型別即為 §4 的型別，三者缺一即無法通過型別檢查）；`§6～§9` 為四個唯讀顯示消費點；
`§10` 收尾驗證。

```
§1 前置確認（含 M14 timer 欄位重新對齊、baseline 回填）
 │
 ├─ §2 round-lifecycle：round-types.ts winner 擴增           （leaf）
 ├─ §3 match-rating：rating-types.ts／rating.ts winnerIndex  （leaf）
 ├─ §4 match-history：history.ts winner 擴增（schema）       （leaf）
 │      │
 │      └─ §5 round-lifecycle：round.ts
 │             validateScoreInput／submitScore／toHistoryEntry
 │             depends §2, §3, §4（三者的型別擴增全部消費到）
 │             │
 │             ├─ §6 visual-export：export-scene.ts
 │             │      buildStatusText 平手分支      depends §2
 │             │
 │             └─ §7 match-stage：CourtCard.tsx
 │                    平手標籤 + UI pass-through 驗證  depends §2, §5
 │
 ├─ §8 match-history：HistoryRecordCard.tsx 平手顯示     depends §4
 └─ §9 data-transfer：history-csv.ts 勝方欄
        + backup.ts 回歸保護                            depends §4, §2

§10 收尾驗證（depends §2～§9 全部完成）
```

---

## Cross-Cutting Impact

| 檔案／模組 | 動作 | 影響面 |
|---|---|---|
| `lib/matchmaker/round-types.ts` | 修改 | `RoundMatchSchema.winner` 列舉擴增為三值 |
| `lib/matchmaker/round.ts` | 修改 | `validateScoreInput` 新增 `isTimedRound` 參數、`TIE_MESSAGE` 更新、`submitScore` 的 `winner` 判定與 `updateRatings` 呼叫、`toHistoryEntry` 的 `winner` 型別 |
| `lib/matchmaker/rating-types.ts` | 修改 | `RatingUpdateInput.winnerIndex` 擴為 `0 \| 1 \| "draw"` |
| `lib/matchmaker/rating.ts` | 修改 | `updateRatings` 的 `s` 計算新增 `"draw"` 分支（`S = 0.5`） |
| `lib/matchmaker/history.ts` | 修改 | `MatchHistoryEntrySchema.winner` 列舉擴增為三值 |
| `lib/matchmaker/history-csv.ts` | 修改 | 「勝方」欄的三值判斷 |
| `lib/matchmaker/labels.ts` | 修改 | 新增具名常數 `DRAW_LABEL`，四個消費點改用同一份文案 |
| `lib/matchmaker/export-scene.ts` | 修改 | `buildStatusText` 新增 `winner === "draw"` 分支 |
| `components/matchmaker/CourtCard.tsx` | 修改 | 新增「平手」文字標籤；`onSubmitScore` 委派邏輯零改動（design Decision 6） |
| `components/matchmaker/HistoryRecordCard.tsx` | 修改 | 新增「平手」文字標籤 |
| `lib/matchmaker/backup.ts`、`transfer-types.ts` | **不動** | `winner` 擴增透過既有 import 鏈自動生效（design Decision 5），機械確認 `git diff` 為空 |
| `components/matchmaker/ScoreEntry.tsx` | **不動** | 比分驗證規則 100% 委派回合 capability，UI 不新增任何判斷（design Decision 6） |
| `lib/scoreboard/**`、`scoreboard-binding.ts` | **不動** | side-out 規則結構上不可能產生平局，零改動（design Risks） |
| `hooks/` | **不動** | 不新增任何 hook |
| `hono-pickball/**` | **不動** | matchmaker 為 LocalStorage-only 純前端功能 |
| `package.json` | **不動** | 零新增相依，收尾驗證機械確認 |
