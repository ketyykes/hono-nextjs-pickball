# matchmaker-rating-engine（M3）一頁摘要

## Scope

送出比分之後，把「誰贏了」換算成雙方新的強度分數。本 change 只交付 `nextjs-pickball/lib/matchmaker/` 下的**純函式評分引擎**——`prd.md` 6.4 的重新校準版 Elo（`D=3.0`、`K_base=0.15`）、K 依出場次數遞減、雙打的隊伍平均、1.00～8.00 的邊界 clamp 與觸界標示。誰在什麼時候呼叫它、算完之後存到哪裡、畫面怎麼呈現，全都不在本段。

**規模判定：medium。** 影響 1 個 capability（`match-rating`），但預估 tasks 為 20 項（落在 9～20 區間），且**新增一個模組**（`rating.ts` + `rating-types.ts`）——依 schema「medium：影響 2-3 capabilities、tasks 9-20、**或新增一個模組**」取最大命中。

各條件式區塊的判定：

| 條件 | 判定 | 理由 |
|---|:---:|---|
| 前端需求 → UI Mockups | ❌ 不含 | delta spec 的 7 個 Requirement 全部描述純函式的輸入與輸出，沒有任何一條談介面、互動、版面或視覺狀態。觸界標示的**呈現**屬 M5。 |
| 資料庫結構 → Data Model | ❌ 不含 | 本專案為 LocalStorage-only 純前端，無資料庫；且本段不讀寫任何持久化資料。 |
| 資料遷移 → Data Migration | ❌ 不含 | 不動 `matchmaker:roster:v1` 的結構。`gamesPlayed` 在 M1 已納入 schema，本段只讀取。 |
| 跨元件流程 → Sequence Diagram | ❌ 不含 | 單一模組內的同步純函式呼叫，無非同步任務、無 webhook、無排程、無多服務協作。 |

因此本檔只含 Scope、What Changes、Architecture 三個區塊。

## What Changes

- 新增 `rating-types.ts`：`RATING_D`（3.0）、`RATING_K_BASE`（0.15）、`RATING_MIN`（1）、`RATING_MAX`（8）、`K_DECAY_GAMES`（20），以及輸入輸出型別。
- 新增 `rating.ts`：`expectedScore()`、`effectiveK()`、`updateRatings()` 三個純函式。
- 沿用既有的 `rating-math.ts` 的 `roundRating`（**不修改該檔**），不重寫一份兩位小數規則。
- 定案 PRD 未言明的兩處張力：同隊兩人 `gamesPlayed` 不同時**各自用自己的 K_eff**；零和與 clamp 衝突時**clamp 優先**。
- 輸入非法（人數不符／`rating` 越界／`gamesPlayed` 非法／重複 id）時拋繁體中文錯誤，**不靜默夾值**。
- **不含**：任何 UI、任何 LocalStorage、回合狀態、`gamesPlayed` 與 `restCount` 的累加、比分驗證、歷史紀錄寫入。

下圖用一句話說明本 change 補上的是哪一段：`rating` 目前是一條**只進不出**的死路。

```
=== Before (M1 + M2 完成後的現況) ===

  參賽者頁手動編輯 ──► Player.rating ──► 分配引擎 ──► 本輪對戰
       (M1)                  ▲                (M2)

                    打完球之後沒有任何東西會改動 rating
                    -> 分配品質永遠停在第一天的手填估值

=== After (本 change 交付後) ===

  參賽者頁手動編輯 ──► Player.rating ──► 分配引擎 ──► 本輪對戰
       (M1)                  ▲                (M2)          │
                             │                              ▼
                             │                        送出比分 (M4)
                             │                              │
                             └──── updateRatings() ◄────────┘
                                   [本 change 只交付這個純函式;
                                    左右兩端的接線由 M4 負責]
```

## Architecture

下圖表達三件事：本段新增哪些檔案、它們往下依賴誰、以及呼叫端會拿到什麼。
所有箭頭皆為單向，分配引擎不反向依賴本段。

```
呼叫端 (皆不在本 change, 只列出將來會怎麼用)
  M4 回合與比分     送出比分後呼叫 updateRatings, 寫回名單與歷史
  M5 對戰畫面       讀 atUpperBound / atLowerBound 標示已達上下限
  M7 歷史 / M8 CSV  讀 before 與 after 兩欄
        │
        │  RatingUpdateInput
        │  { format, teams: [Side, Side], winnerIndex: 0 | 1 }
        ▼
┌──────────────────────────────────────────────────────────┐
│ rating.ts                                        [新增]  │
└──────────────────────────────────────────────────────────┘
   expectedScore(Ra, Rb)    E = 1 / (1 + 10^(-(Ra - Rb) / D))
   effectiveK(games)        K = K_base * (1 + 20 / (20 + games))
   updateRatings(input)
     1. 驗證輸入; 不合法即 throw, 不夾值也不補值
     2. 算 E; 單打取個人 rating, 雙打取兩隊平均 rating
     3. 逐人取 K_eff; 同隊共用同一個 (S - E)
     4. roundRating 至兩位小數
     5. clamp 於 1.00 ~ 8.00; 產生三個邊界旗標
     6. delta = roundRating(after - before)
        │
        │  RatingUpdateResult
        │  { changes: [{ id, before, after, delta,
        │                atUpperBound, atLowerBound, clamped }],
        │    expectedScores: [E0, E1] }
        ▼
   回傳給呼叫端

依賴 (rating.ts 往下 import, 皆單向)
   ├──► rating-types.ts        [新增] 常數與輸入輸出型別
   │        RATING_D 3.0     RATING_K_BASE 0.15
   │        RATING_MIN 1     RATING_MAX 8     K_DECAY_GAMES 20
   ├──► rating-math.ts         [既有, 不修改]
   │        roundRating()   兩位小數規則的唯一來源
   └──► allocation-types.ts    [既有, 唯讀]
            MatchFormat     PLAYERS_PER_MATCH

無循環: candidates.ts / pairing.ts / duplication.ts /
allocation.ts 皆不 import 本段任何東西。
```
