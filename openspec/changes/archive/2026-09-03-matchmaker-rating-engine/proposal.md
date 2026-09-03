> **Milestone M3**（對戰分配機交付序第 3 段）。
> 已完成並歸檔者：**M1** `add-player-roster`（參賽者名單）、**M2** `matchmaker-allocation-engine`（分配引擎）。
> 本段之後為 **M4** 回合與比分狀態、**M5** 對戰畫面與導覽、**M6** 場邊計分銜接、
> **M7** 歷史紀錄頁、**M8** 資料匯入匯出（JSON／CSV／清除本機資料）、**M9** JPG／PDF 匯出。

## Why

M1 讓使用者能維護名單、M2 能把名單變成對戰，但**比賽結果目前無處可去**——打完一場之後強度分數不會動，下一輪的分配仍以主持人最初手填的估值排序。`prd.md` 5.1 的「強度接近」與 5.3 的候選排序全都吃 `rating`，若 `rating` 永遠不更新，分配品質會停在第一天的估值，愈打愈失真。

`prd.md` 6.4 的評分模型是**重新校準過的 Elo**（`D=3.0`、`K_base=0.15`），常數依 1.00～8.00 的尺度重算——直接套標準 Elo 的 `D=400`／`K=32` 會讓預測勝率退化為約 51%（毫無鑑別度）且單場變動 ±15 分（一場撞頂）。這種「常數選對才有意義」的數學，以及 6.4.5 零和與 6.4.6 clamp 之間的取捨，若混進 UI 或狀態管理裡實作將無法被有效驗證。因此先以**純函式**定型並用單元測試把公式、K 遞減、邊界與零和成立條件逐條鎖住，M4（回合與比分）接上時才有可信賴的計算核心。

先做 M3 還有一個排程理由：M4 消費本段輸出，**本段必須是本批平行 change 中最先合併回 `main` 的一個**。

## What Changes

新增 `nextjs-pickball/lib/matchmaker/` 下的評分引擎純函式，涵蓋 `prd.md` 6.4.1～6.4.7：

- **預測勝率與更新公式**（6.4.1）：`E = 1 / (1 + 10^(-(Ra - Rb) / D))`、`Ra' = Ra + K_eff × (S - E)`，勝 `S = 1`、敗 `S = 0`。
- **常數**（6.4.2）：`D = 3.0`、`K_base = 0.15`，以具名常數匯出，消費端不得各自寫死。
- **K 依出場次數遞減**（6.4.3）：`K_eff = K_base × (1 + 20 / (20 + gamesPlayed))`，**每位球員各自依自己的 `gamesPlayed` 計算**。新手（0 場）為 2 倍、20 場為 1.5 倍，長期趨近 `K_base`。
- **雙打**（6.4.4）：以兩隊的**平均**分數計算 `E`（不是總和）；同隊兩人共用同一個 `(S - E)`，各自以自己的 `K_eff` 放大——`gamesPlayed` 相同時兩人加減同一數值，不同時幅度不同。這是 6.4.4 與 6.4.3 之間的張力，由 design Decision 3 定案。
- **零和的成立條件**（6.4.5）：同一場雙方 MUST 共用同一個 `E`，變動方向必定相反；**數值上的總分守恆只在雙方 `K_eff` 相同且未觸界時成立**，其餘情況 SHALL NOT 事後補償以強制守恆（design Decision 4）。
- **邊界處理**（6.4.6，亦為 `prd.md` 第 11 節「評分更新後撞到 1.00 或 8.00 邊界」）：更新值先四捨五入至兩位小數、再 clamp 於 1.00～8.00；**clamp 優先於零和**。回傳值帶 `atUpperBound`／`atLowerBound`／`clamped` 三個旗標，讓 M5 能依 6.4.6 明確標示「已達上限／下限」而非靜默卡住。
- **輸入驗證**：隊伍人數與對戰方式不符、`rating` 超出 1.00～8.00、`gamesPlayed` 非非負整數、同一場出現重複 player id 時 MUST 拋出繁體中文錯誤，**SHALL NOT 靜默夾值**（沿用 M1 對 `rating`、M2 對 `courtCount` 的一致立場）。

**不在本次範圍**（相鄰 milestone 的東西在此明確排除）：

- **M4（回合與比分）**：回合物件與 `matchmaker:round:v1`／`matchmaker:history:v1` 的讀寫、`gamesPlayed` 與 `restCount` 的**實際累加**、比分驗證（空白／非數字／平局）、`targetScore` 決定與鎖定、歷史紀錄欄位的寫入。本段只**讀取** `gamesPlayed` 當作 `K_eff` 的輸入，不回寫任何欄位。
- **M5（對戰畫面與導覽）**：「已達上限／下限」的視覺標示、爆冷加分的呈現、全站 navbar 的 matchmaker 入口。本段只**回傳可判讀的旗標**，不決定它長什麼樣。
- **M7／M8（歷史與匯出）**：賽前／賽後分數的呈現與 CSV 匯出。本段回傳的 `before`／`after` 是那些欄位的**來源**，但寫入與呈現不在此。
- **6.4.7 手動覆蓋**：使用者在參賽者頁直接編輯強度分數，**M1 的 `updatePlayer` 已完全滿足**（`nextjs-pickball/lib/matchmaker/roster.ts`，覆寫語意），本段不重複實作、也不新增任何覆蓋 API。6.4.7 的「覆蓋只影響之後的比賽，不重算既有歷史」在本段是**結構上的必然**——評分引擎為無狀態純函式，沒有任何路徑能回頭重算歷史。
- 任何 UI、任何 LocalStorage 讀寫、任何 React、任何後端呼叫。

## Capabilities

### New Capabilities

- `match-rating`：送出比分後更新雙方強度分數的計算規則，含 Elo 公式與重新校準的常數、K 依出場次數遞減、雙打的隊伍平均與同隊同幅、零和的成立條件、1.00～8.00 的邊界 clamp 與觸界標示，以及輸入驗證。

### Modified Capabilities

（無）本段只**唯讀取用** `player-roster` 既有的 `rating` 與 `gamesPlayed` 欄位語意，以及 `match-allocation` 既有的 `MatchFormat` 型別與 `PLAYERS_PER_MATCH` 常數，不改動這兩個 capability 的任何 Requirement。`gamesPlayed` 在 M1 已納入 `PlayerSchema`（只初始化不累加），正是為了讓本段不需要破壞性遷移。

## Impact

- **新增**：
  - `nextjs-pickball/lib/matchmaker/rating-types.ts`（型別與常數，無執行期邏輯）
  - `nextjs-pickball/lib/matchmaker/rating.ts`（`expectedScore`、`effectiveK`、`updateRatings`）
  - `nextjs-pickball/lib/matchmaker/rating.test.ts`
- **重用（唯讀，不修改）**：
  - `nextjs-pickball/lib/matchmaker/rating-math.ts` 的 `roundRating`——兩位小數的四捨五入規則已存在，本段沿用而非重寫（見 design Decision 1）
  - `nextjs-pickball/lib/matchmaker/allocation-types.ts` 的 `MatchFormat` 與 `PLAYERS_PER_MATCH`
  - `nextjs-pickball/lib/matchmaker/types.ts` 的 `PlayerSchema`（僅測試用於交叉驗證賽後分數可寫回名單）
- **不動**：`roster.ts`、`storage.ts`、`colors.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts`、`allocation.ts`、`hooks/**`、`app/matchmaker/**`
- **無外部相依**：純函式、無 I/O、無 React、無新增 npm 套件
- **執行相依（worktree 開出的前提）**：**無**。本 change 可直接從 `main` 開 worktree，與 M4～M9 平行進行。
- **合併順序**：**本 change 必須最先合併回 `main`**——M4 的回合／比分流程直接呼叫 `updateRatings`，M5 顯示觸界旗標，兩者的 worktree 都需要先有本段的輸出才能從 `main` 開出並整合。
