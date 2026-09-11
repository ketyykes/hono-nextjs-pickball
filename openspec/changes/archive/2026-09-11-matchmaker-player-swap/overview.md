# Overview: matchmaker-player-swap（M13：臨時換人）

## Scope

讓主持人在對戰頁的單一場地區塊裡，把一位還沒開打的在場球員換成休息名單中的另一位——
不打亂該輪其餘場地。換人後系統自動重算該隊隊伍分數與雙打組成標示，休息名單也同步互換。

**Size**: large — 影響 2 個 capability（`round-lifecycle`、`match-stage`，符合 medium 的
「2-3 capabilities」區間），但 tasks 共 29 項（7 個群組），超過 large 判定門檻的 20 項；
依規模表「取最大命中」，task 數量的訊號蓋過 capability 數量的訊號，判為 large。
（本 change 簡報原預估為 medium；實際落地後 task 數偏高的主因是「五個獨立失敗代碼」與
「兩層判定收斂」各自需要獨立測試覆蓋，而非功能本身複雜，詳見下方 What Changes 與
`design.md` 的 Decisions。）

**Frontend involved**: yes — 每個場地區塊新增一組換人互動控制與其可用／停用／錯誤三種狀態。

**DB schema touched**: no — 不新增、不修改 `Round`／`RoundMatch` 的任何 schema 欄位，換人只
改變既有欄位的值。

**Data migration**: no — 不搬移、不轉換任何既有 LocalStorage 資料。

**Cross-component flow**: yes — 換人的觸發（`CourtCard`）與判定執行（`round-lifecycle` 的
純函式）分屬不同 capability，中間經過 hook 接線與兩層「是否顯示換人操作」的判定收斂
（`status` 與計分板槽），值得畫一次時序圖釐清職責邊界。

---

## What Changes

- 新增純函式 `swapMatchPlayer(round, matchId, outPlayerId, inPlayerId, players)`
  （`lib/matchmaker/round.ts`）：把某個 `pending` 場次的一位在場球員換成休息名單中的一位
  `active` 球員，重算該隊隊伍分數與雙打組成標示，並互換休息名單。
- `hooks/useRoundStore.ts` 新增 `swapMatchPlayer` 動作（呼叫純函式 → 判 `ok` → dispatch）。
- `CourtCard.tsx` 的每個球員格，在該場 `pending` 且尚未於計分板開始計分時提供「換人」操作；
  無可換之人時停用並顯示文字說明；已完成或已開始計分時不顯示。
- `MatchStage.tsx`／`page.tsx` 接線換人回呼與錯誤狀態顯示。
- `labels.ts` 新增換人操作的兩個靜態文案常數。

Before / after 對照（純文字、無 UI 細節）：

```
=== Before ===

  對戰頁 /matchmaker : 產生本輪 / 輸入比分 / 進計分板 / 看休息名單
  想換掉一個人       : 只能「重設／再排」--> 打散所有 pending 場次重排
                       (若某場已候場等待, 不可能為了換一人牽動其他場地)
  資料模型           : RoundTeam.playerIds 只能由 createRound／
                       resetIncompleteMatches 兩個入口寫入

=== After ===

  對戰頁 /matchmaker : 多一種操作 -- 場地區塊的球員格旁 [換人 v]
  想換掉一個人       : 選該球員格的 [換人]，從休息名單挑一位 active 球員，
                       只有這一格變動，其餘場地與該場另一位隊員不受影響
  資料模型           : RoundTeam.playerIds 多一個第三入口
                       swapMatchPlayer(局部修正, 非重新分配)
```

---

## UI Mockups

以下依使用順序列出六個 state。`<-` 之後為註解，不是畫面文字。

第一組是換人操作本身：可用（有候選人）與停用（無候選人）兩種狀態。

```
=== State 1: pending 場次, 休息名單有 active 球員可換 ===

+- 第 1 場地 ------------------------------------------+
|                              [進入計分板]             |
|  第一隊                                第二隊         |
|  +-----------+ [換人 v]      [換人 v] +-----------+  |
|  |  王大明   |                        |  李小華   |  |
|  +-----------+                        +-----------+  |
+--------------------------------------------------------+

=== State 2: 同一場地, 休息名單目前沒有 active 球員 ===

|  +-----------+ [無可換之人]░  [無可換之人]░ +-------+ |
|  |  王大明   |                              | 李小華| |
|  +-----------+                              +-------+ |
                                          <- 停用, 非隱藏
```

點擊某一格的換人觸發器後展開候選人清單，選取後更新畫面。

```
=== State 3: 展開換人候選人清單 ===

              [換人 v]
                 |
                 v
        +-----------------+
        | 陳小美 (休息 2) |
        | 張小龍 (休息 1) |
        +-----------------+
                 |  選取「陳小美」
                 v

=== State 4: 換人完成 ===

|  第一隊                                第二隊         |
|  +-----------+ [換人 v]      [換人 v] +-----------+  |
|  |  陳小美   |  <- 王大明退場          |  李小華   |  |
|  +-----------+     進休息名單          +-----------+  |
```

已完成或已在計分板開打的場次不顯示換人操作；換人被拒絕時顯示錯誤說明。

```
=== State 5: 已完成或已在計分板開打的場次 ===

+- 第 2 場地 ------------------------------------------+
|                            [繼續計分] 計分中 8:5      |
|  第一隊                                第二隊         |
|  +-----------+              (無換人操作) +---------+ |
|  |  張小龍   |                           | 黃小珍  | |
|  +-----------+                           +---------+ |
+--------------------------------------------------------+
                          <- status 可能仍是 pending, 但
                             計分板槽已存在, 換人操作不顯示

=== State 6: 換人被拒絕 ===

|  第一隊                                                |
|  +-----------+ [換人 v]                                |
|  |  王大明   |                                          |
|  +-----------+                                          |
|  (!) 該球員目前非出場狀態，請確認後再試一次   <- role="alert" |
```

---

## Architecture

元件與資料流。重點是**唯一的判定與執行入口是 `swapMatchPlayer`**，`CourtCard` 只做「是否
顯示」的收斂與委派，不自行判斷換人是否合法。

```
   components/matchmaker/CourtCard.tsx
     |  推導候選人 = round.restingPlayerIds 中 active 的 players
     |  顯示條件 = !completed && matchSlot === null
     |
     |  onSwapPlayer(matchId, outId, inId)
     v
   components/matchmaker/MatchStage.tsx  (純轉發 props)
     v
   app/matchmaker/page.tsx  (例外層, 掛載與 state)
     |
     v
   hooks/useRoundStore.ts
     |  swapMatchPlayer(matchId, outId, inId)
     |  呼叫純函式 -> 判 ok -> dispatch
     v
   lib/matchmaker/round.ts
     |  swapMatchPlayer(round, matchId, outId, inId, players)  <- 唯一判定與執行入口
     |    reuses -> pairing.ts   labelDoublesComposition (已匯出, 零改動)
     |    reuses -> rating-math.ts  roundRating
     v
   Round (新的隊伍 playerIds / rating / doublesComposition / restingPlayerIds)

  外部相依 (皆唯讀取用, 本 change 不修改):
    match-allocation : pairing.ts 的 labelDoublesComposition (已是公開匯出)
    player-roster    : Player.isActive
  npm 相依: 零新增
```

---

## Sequence Diagram

換人的成功路徑與失敗路徑各畫一次。重點是「是否顯示」（`CourtCard`）與「是否合法」
（`swapMatchPlayer`）是兩個不同層級的判定，兩者的方向性差集只允許一種（UI 更嚴格）。

```
使用者      CourtCard        page.tsx      useRoundStore     round.ts
  |             |                |                |               |
  | 選候選人 C  |                |                |               |
  |------------>|                |                |               |
  |             | onSwapPlayer(matchId, A, C)      |               |
  |             |-------------------------------->|               |
  |             |                | swapMatchPlayer(matchId, A, C)  |
  |             |                |----------------------------->  |
  |             |                |                |  驗證五個前置條件
  |             |                |                |  依序不成立則回傳
  |             |                |                |  { ok:false, code, message }
  |             |                |                |<-----------------|
  |             |                | { ok:false, message }            |
  |             |                |<---------------|                 |
  |             | swapError = message              |                |
  |<------------| role="alert" 顯示錯誤            |                |
  |             |                |                |                |
--- 成功路徑 (前置條件皆成立) ---
  |             |                |                | { ok:true, round }
  |             |                |                |<-----------------|
  |             |                | dispatch(round)|                  |
  |             |                |<---------------|                  |
  |             | 新 round 經 MatchStage 傳回, tile key 隨 player id 改變, 該格重新掛載
  |<------------|                |                |                  |
```

---

## Task Tree

tasks.md 的分群與相依。§2 是核心純函式群，§3～§6 依序疊上 hook、元件、頁面接線與 E2E；
§7 收尾驗證獨立於實作群組之外。

```
§1 前置確認 (Step 0 的延伸: 確認 M12 已合併、CourtCard/MatchStage/page.tsx 實際內容)
 |
 └─ §2 swapMatchPlayer 純函式  (round-lifecycle, 12 個 Scenario, 7 task)
      |
      └─ §3 useRoundStore 接線  (2 task)              depends §2
           |
           └─ §4 CourtCard 換人操作  (match-stage, 3 task)  depends §2 §3
                |
                └─ §5 MatchStage／page.tsx 接線  (2 task, 例外層)  depends §4
                     |
                     └─ §6 E2E 可存取性驗收  (2 task)  depends §4 §5
                          |
§7 收尾驗證 (8 task: 驗收錨點 / 單元 / 全套 / tsc+lint / e2e / diff 稽核 /
             validate --strict / spec 重複標題)  depends 全部群組
```

---

## Cross-Cutting Impact

| 檔案／模組 | 動作 | 影響面 |
|---|---|---|
| `lib/matchmaker/round.ts` | 修改 | 新增 `swapMatchPlayer` 與其 Result 型別、五個失敗代碼；round-lifecycle 唯一的判定與執行入口 |
| `lib/matchmaker/round.test.ts` | 修改 | 新增 12 個 it，對應 12 個 Scenario |
| `hooks/useRoundStore.ts` | 修改 | 新增 `swapMatchPlayer` 動作，接線純函式 |
| `hooks/useRoundStore.test.tsx` | 修改 | 新增 2 個 it（成功套用／尚無回合防線） |
| `components/matchmaker/CourtCard.tsx` | 修改 | 每個球員格新增換人操作，候選人由既有 props 衍生 |
| `components/matchmaker/CourtCard.test.tsx` | 修改 | 新增 6 個 it |
| `components/matchmaker/MatchStage.tsx` | 修改 | 新增 `onSwapPlayer`／`swapError` props 並下傳（例外層，無單元測試） |
| `app/matchmaker/page.tsx` | 修改 | 新增 `handleSwapPlayer` 與 `swapError` state（例外層） |
| `lib/matchmaker/labels.ts` | 修改 | 新增「換人」／「無可換之人」兩個靜態文案常數 |
| `tests/e2e/specs/match-stage.spec.ts` | 修改 | 新增 1 個 test（可存取名稱與鍵盤操作） |
| `lib/matchmaker/pairing.ts`（`labelDoublesComposition`） | **不動** | 已是公開匯出，直接重用 |
| `lib/matchmaker/allocation.ts`／`duplication.ts`／`candidates.ts` | **不動** | `match-allocation` 的分配邏輯完全不變 |
| `components/matchmaker/PlayerTile.tsx` | **不動** | 維持純呈現定位（design Decision 5） |
| `package.json` | **不動** | 零新增相依 |
| `hooks/`（新增檔案數） | **不動** | 不新增任何 `use*.ts` 檔案，不觸發 `pickleball-guide-page` 的 hooks 歸屬清單義務 |
| `hono-pickball/**` | **不動** | matchmaker 為 LocalStorage-only 純前端功能 |
