## Why

第 1 段（`match-allocation`）已能把名單變成對戰，但比完之後分數不會動——`Player.rating` 目前只能靠手動編輯。少了自動評分，分配演算法賴以運作的「強度接近」就永遠建立在主持人初次估計的數字上，而 PRD 6.4.3 的整個設計目的（讓估錯的人在約 3 個活動夜內回到正確名次）無從發生。

評分公式是**純數值運算**，且 PRD 6.4 已把常數校準到 1.00～8.00 的尺度（`D=3.0`、`K_base=0.15`）並附上每個選擇的理由。這種東西一旦混進 UI 或狀態管理就無法驗證邊界行為（撞上下限、K 遞減、爆冷加分），因此與第 1 段同樣先做成純函式並以單元測試鎖住。

## What Changes

新增 `nextjs-pickball/lib/matchmaker/` 下的評分引擎純函式，涵蓋 PRD 6.4 全部子節：

- **預測勝率**：`E = 1 / (1 + 10^(-(Ra - Rb) / D))`，`D = 3.0`。
- **賽後更新**：`Ra' = Ra + K_eff × (S - E)`，`S` 勝為 1、敗為 0。
- **K 依出場次數遞減**：`K_eff = K_base × (1 + 20 / (20 + 該員累計出場次數))`，`K_base = 0.15`。新加入者（0 場）K 為 2 倍，20 場時 1.5 倍，長期趨近 `K_base`。
- **雙打**：以兩隊**平均分數**計算 `E`，同隊兩人共用同一個 `(S - E)`，各自套用自己的 `K_eff`。
- **邊界**：更新後 clamp 於 1.00～8.00。已達上下限者仍照常參與計算與配對，但分數不再變動；引擎須回傳**可判讀的撞邊界標記**，供 UI 顯示「已達上限／下限」——PRD 6.4.6 明文要求不得靜默卡住讓使用者誤以為功能故障。
- **相對值語意**：模型為零和，但 clamp 會在邊界破壞守恆（見 design Decision 2）。引擎須讓這個偏離**可被觀測**，而非默默發生。

不含：任何 UI、任何 LocalStorage 讀寫、`gamesPlayed` 的實際累加、比分輸入與驗證、歷史紀錄寫入。手動覆蓋（PRD 6.4.7）的編輯入口已存在於 `player-roster` 的 `updatePlayer`，本段只需保證引擎**無狀態**——不快取任何歷史、不因過去比賽而改變同一份輸入的輸出，覆蓋後的分數下一場自然生效。

## Capabilities

### New Capabilities

- `match-rating`：由一場對戰的結果（雙方球員、勝負）計算賽後評分變動的規則，含 Elo 公式與常數校準、K 依出場次數遞減、雙打的隊伍平均、1.00～8.00 的邊界處理與撞邊界標記。

### Modified Capabilities

（無）本段只讀取 `player-roster` 既有的 `Player`（`rating`、`gamesPlayed`），不改變其任何 Requirement。`gamesPlayed` 在 M1 已納入 schema，正是為了避免此處發生破壞性遷移。`match-allocation` 的 `Match`／`Team` 型別本段唯讀取用，亦不修改。

## Impact

- **新增**：`nextjs-pickball/lib/matchmaker/rating.ts` 與對應 `rating.test.ts`
- **重用**：`lib/matchmaker/types.ts` 的 `Player`（唯讀）、`lib/matchmaker/rating-math.ts` 的 `roundRating`（第 1 段末抽出的共用四捨五入）
- **不動**：`allocation.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts`、`roster.ts`、`storage.ts`、`colors.ts` 與 `app/` 下所有既有檔案
- **無外部相依**：純函式、無 I/O、無 React、無新增套件
- **後續段落的相依**：第 3 段（回合與對戰畫面）在送出比分時消費本段輸出，並負責把結果寫回 `Player` 與累加 `gamesPlayed`；第 4 段（歷史紀錄）消費賽前／賽後分數
