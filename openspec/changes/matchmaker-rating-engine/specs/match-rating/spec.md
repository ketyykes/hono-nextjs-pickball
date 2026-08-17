## Purpose

定義「匹克球對戰分配機」賽後評分更新的完整規則：Elo 架構的預測勝率與賽後更新公式、依 1.00～8.00 尺度重新校準的常數（`D = 3.0`、`K_base = 0.15`）、K 依累計出場次數遞減、雙打的隊伍平均、以及分數撞上下限時的處理與標記。

本 capability 全部為**純函式**：不讀寫 LocalStorage、不含 React、不管理回合狀態、不累加 `gamesPlayed`、不寫入 `Player`。它只回答一個問題——「這場比完之後，每個人的分數該變成多少」。實際寫回與累加屬於回合 capability。

評分只保證**群體內的相對排序與相對差距**，其絕對值不對應 DUPR 或任何外部等級制度（`prd.md` 6.4.5）。UI SHALL NOT 將此分數標示為對外通用的技術等級。

## ADDED Requirements

### Requirement: 預測勝率與常數校準

系統 SHALL 以下式計算預測勝率，`D` MUST 為 `3.0`：

```
E = 1 / (1 + 10^(-(Ra - Rb) / D))
```

`D` SHALL NOT 使用標準 Elo 的 `400`——標準值是為西洋棋 1500 分級距設計，套在全距只有 7 的尺度上會使預測勝率退化為約 51%（毫無鑑別度），單場變動亦達 ±15 分，一場即撞頂（`prd.md` 6.4）。

`D = 3.0` 的校準效果 MUST 符合下表（`prd.md` 6.4.2）：

| 分差 | 強者預測勝率 |
|---:|---:|
| 0.5 | ≈ 60% |
| 1.0 | ≈ 68% |
| 2.0 | ≈ 82% |
| 3.0 | ≈ 91% |

`D`、`K_base` 與上下限 SHALL 由本 capability 以具名常數匯出，SHALL NOT 由消費端各自寫死——PRD 15 的產品決策摘要把這些值列為正式規格，散落多處時改動會漏改。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 分數相同時預測勝率為五成

- **WHEN** 兩方分數相同
- **THEN** `E` 為 `0.5`
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「分數相同時預測勝率為 0.5」

#### Scenario: D 為 3.0 的四個校準點

- **WHEN** 分差分別為 0.5、1.0、2.0、3.0
- **THEN** 強者預測勝率依序約為 0.60、0.68、0.82、0.91（誤差在 0.01 以內）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「D 為 3.0 時四個校準點的預測勝率符合規格」

#### Scenario: 預測勝率互補

- **WHEN** 交換兩方順序
- **THEN** 兩次結果相加 MUST 為 `1`
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「交換雙方順序時兩個預測勝率相加為 1」

#### Scenario: 常數以具名方式匯出

- **WHEN** 讀取匯出的常數
- **THEN** `D` 為 `3.0`、`K_base` 為 `0.15`、下限為 `1.0`、上限為 `8.0`
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「D、K_base 與上下限以具名常數匯出且值符合規格」

### Requirement: K 依累計出場次數遞減

系統 SHALL 以下式計算單一球員的有效 K 值（`prd.md` 6.4.3）：

```
K_eff = K_base × (1 + 20 / (20 + 該員累計出場次數))
```

`K_eff` MUST 依 `gamesPlayed` **單調遞減**，且 MUST 恆大於 `K_base`（僅在出場次數趨近無限大時趨近 `K_base`，永不等於）。

此設計的目的是讓主持人初始估錯的人在約 3 個活動夜內回到正確名次，同時使老手的分數不會因單場意外大幅跳動。因此 `K_eff` SHALL 以**該員自己的** `gamesPlayed` 計算，SHALL NOT 取隊伍平均或全場平均——取平均會讓新加入者在雙打中被老手拖慢收斂，本設計的目的即失效（見 design Decision 1）。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 新加入者的 K 為基礎值的兩倍

- **WHEN** `gamesPlayed` 為 0
- **THEN** `K_eff` 為 `0.30`（`K_base` 的 2 倍）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「出場 0 場時 K_eff 為 K_base 的兩倍」

#### Scenario: 累計二十場時的 K

- **WHEN** `gamesPlayed` 為 20
- **THEN** `K_eff` 為 `0.225`（`K_base` 的 1.5 倍）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「出場 20 場時 K_eff 為 K_base 的一點五倍」

#### Scenario: K 隨出場次數單調遞減且恆大於基礎值

- **WHEN** `gamesPlayed` 由 0 遞增至一個很大的值
- **THEN** `K_eff` 嚴格遞減
- **AND** 任何有限的 `gamesPlayed` 下 `K_eff` MUST 恆大於 `K_base`，趨近但不等於
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「K_eff 隨出場次數單調遞減且恆大於 K_base」

### Requirement: 單打賽後更新

系統 SHALL 以下式更新單打雙方的評分（`prd.md` 6.4.1）：

```
Ra' = Ra + K_eff × (S - E)          S：勝 = 1，敗 = 0
```

每位球員的 `K_eff` MUST 取自其自身的 `gamesPlayed`；`E` MUST 取自該員相對於對手的預測勝率。

更新後的分數 MUST 四捨五入至兩位小數（與 `player-roster` 的 `rating` 精度一致），SHALL 使用既有的 `rating-math.ts` 的 `roundRating`，SHALL NOT 各自實作一份——第 1 段已因這條在兩處各寫一份而被 code review 指出。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 勢均力敵時的單場變動趨近正負零點零七五

- **WHEN** 雙方分數相同（`E = 0.5`）且 `gamesPlayed` 極大（`K_eff` 趨近 `K_base`）
- **THEN** 勝方增加、敗方減少的幅度趨近 `0.075`
- **AND** `gamesPlayed` 為 0 時同一情境的變動為 `0.15`（`K_eff` 為 2 倍）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「勢均力敵時單場變動趨近 0.075，新手為 0.15」

#### Scenario: 爆冷獲勝者的加分明顯大於預期內獲勝者

- **WHEN** 弱者擊敗強者，與強者擊敗弱者兩種情境的 `gamesPlayed` 相同
- **THEN** 爆冷獲勝者的加分 MUST 明顯大於預期內獲勝者的加分
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「爆冷獲勝者的加分明顯大於預期內獲勝者」

#### Scenario: 出場次數少者的變動幅度大於出場次數多者

- **WHEN** 兩組情境的分數與勝負完全相同，僅 `gamesPlayed` 不同
- **THEN** `gamesPlayed` 較少者的分數變動幅度 MUST 大於較多者
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「出場次數少者的評分變動幅度大於出場次數多者」

#### Scenario: 勝方增加敗方減少

- **WHEN** 任一場單打分出勝負且未撞上下限
- **THEN** 勝方分數 MUST 增加、敗方分數 MUST 減少
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「勝方分數增加敗方分數減少」

### Requirement: 雙打賽後更新

雙打 SHALL 以兩隊的**平均分數**計算 `E`（`prd.md` 6.4.4），SHALL NOT 使用隊伍總和——總和會讓分差放大一倍，使預測勝率脫離 `D = 3.0` 的校準。

同隊兩人 MUST 共用同一個 `(S - E)` 項，但 MUST 各自套用**自己的** `K_eff`。因此出場次數不同的隊友，其分數變動幅度**不相同**。

> `prd.md` 6.4.4 的字面是「同隊兩人各自加減**同一數值**」，與 6.4.3 的「`K_eff` 依**該員**累計出場次數」在雙打時直接衝突。本規格採後者，理由見 design Decision 1——6.4.3 附有完整的設計目的說明且主詞明確為「該員」，若取隊伍平均，新加入者與老手同隊時收斂速度會被拖慢，該設計目的即失效。「同一數值」在此解讀為「同隊兩人共用同一個 `(S - E)`、同進同退」，而非「變動的絕對數值相同」。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 以兩隊平均分數計算預測勝率

- **WHEN** 勝隊為 `6.0` 與 `4.0`（平均 `5.0`）、敗隊為 `5.5` 與 `4.5`（平均 `5.0`）
- **THEN** 該場的 `E` MUST 為 `0.5`，與兩位 `5.0` 的球員對戰時相同
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙打以兩隊平均分數計算預測勝率」

#### Scenario: 同隊兩人共用同一個勝負期望差

- **WHEN** 同隊兩人的 `gamesPlayed` 相同
- **THEN** 兩人的分數變動 MUST 完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙打同隊兩人出場次數相同時分數變動相同」

#### Scenario: 同隊出場次數不同者變動幅度不同

- **WHEN** 同隊兩人分數相同但 `gamesPlayed` 分別為 0 與 40
- **THEN** 兩人變動方向 MUST 相同，但幅度 MUST 不同，且 `gamesPlayed` 為 0 者幅度較大
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙打同隊出場次數不同時變動方向相同但幅度不同」

#### Scenario: 雙打回傳四位球員的變動

- **WHEN** 完成一場雙打的評分更新
- **THEN** MUST 回傳 4 筆變動，每筆含球員 id、賽前分數、賽後分數
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙打回傳四位球員各自的評分變動」

### Requirement: 上下限與撞邊界標記

更新後的分數 MUST clamp 於 `1.00`～`8.00`（`prd.md` 6.4.6）。

已達上限或下限者 MUST 仍照常參與 `E` 與 `K_eff` 的計算（其分數仍影響對手的變動），但自身分數不再超出邊界。

引擎 MUST 為每筆變動回傳**可判讀的撞邊界標記**與 clamp 前的理論變動量，SHALL NOT 只回傳夾值後的結果——PRD 6.4.6 明文要求 UI 顯示「已達上限／下限」且「不得靜默卡住讓使用者誤以為功能故障」，而 UI 無法從「分數沒變」單獨分辨「撞到邊界」與「計算結果剛好為零」。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 上限處的勝利不再加分但標記已達上限

- **WHEN** 分數為 `8.00` 的球員獲勝
- **THEN** 賽後分數 MUST 仍為 `8.00`
- **AND** 該筆變動 MUST 標記為已達上限，並帶有 clamp 前的理論變動量
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「分數達上限者獲勝後不再加分且標記已達上限」

#### Scenario: 下限處的落敗不再扣分但標記已達下限

- **WHEN** 分數為 `1.00` 的球員落敗
- **THEN** 賽後分數 MUST 仍為 `1.00`
- **AND** 該筆變動 MUST 標記為已達下限
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「分數達下限者落敗後不再扣分且標記已達下限」

#### Scenario: 未撞邊界時不帶標記

- **WHEN** 賽後分數落在 `1.00`～`8.00` 之間
- **THEN** 該筆變動 MUST NOT 帶有撞邊界標記
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「賽後分數在範圍內時不帶撞邊界標記」

#### Scenario: 撞邊界者仍影響對手的變動

- **WHEN** 分數為 `8.00` 的球員擊敗 `5.00` 的球員
- **THEN** 敗方 MUST 照常扣分，其扣分量 MUST 與「勝方為 `8.00` 但未撞邊界」的情境一致
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「撞邊界者仍照常參與計算不影響對手的扣分」

#### Scenario: 接近邊界時只夾到邊界值

- **WHEN** 分數為 `7.99` 的球員獲勝且理論加分超過 `0.01`
- **THEN** 賽後分數 MUST 恰為 `8.00`，SHALL NOT 超出
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「接近上限時賽後分數恰好夾至 8.00 不超出」

### Requirement: 零和的適用範圍

`prd.md` 6.4.5 敘述本模型為零和（一方增加多少、另一方即減少多少，群體總分守恆）。此敘述 MUST 被理解為**有條件成立**，本 capability SHALL 讓偏離可被觀測而非默默發生。

零和 MUST 在下列條件**全部**滿足時成立：

1. 參與者的 `K_eff` 全部相同（即 `gamesPlayed` 全部相同）；
2. 無人撞上下限；
3. 忽略四捨五入至兩位小數造成的殘差。

任一條件不滿足時守恆即被破壞。這是 `prd.md` 內部規格衝突的必然結果，非實作缺陷（見 design Decision 2）：6.4.3 的 K 依**個人**出場次數遞減，與 6.4.5 的守恆敘述在雙方出場次數不同時無法同時成立；6.4.6 的 clamp 亦然。

本 capability SHALL NOT 為了維持守恆而扭曲任一方的變動量——例如把敗方的扣分上限綁到勝方的實際加分。那會讓一個人的損失取決於對手的邊界狀態，無法向使用者解釋。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 出場次數相同且未撞邊界時守恆

- **WHEN** 單打雙方 `gamesPlayed` 相同且賽後分數皆在範圍內
- **THEN** 勝方增加量與敗方減少量 MUST 相等（誤差在四捨五入殘差 `0.01` 以內）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「出場次數相同且未撞邊界時勝方加分等於敗方扣分」

#### Scenario: 出場次數不同時守恆不成立

- **WHEN** 單打雙方 `gamesPlayed` 分別為 0 與 40
- **THEN** 勝方增加量與敗方減少量 MUST NOT 相等
- **AND** 這是 6.4.3 與 6.4.5 衝突的必然結果，SHALL NOT 被視為缺陷
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「出場次數不同時勝方加分不等於敗方扣分」

#### Scenario: 撞邊界時守恆不成立且可被觀測

- **WHEN** 分數為 `8.00` 的球員獲勝
- **THEN** 群體總分 MUST 減少（勝方無法加分、敗方照常扣分）
- **AND** 該筆變動的撞邊界標記使此偏離可被消費端觀測
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「撞邊界時群體總分不守恆且偏離可由標記觀測」

### Requirement: 無狀態與決定性

本 capability MUST 為**無狀態純函式**：不快取任何歷史、不持有模組層級的可變狀態、不讀寫任何外部儲存。

同一份輸入重複呼叫 MUST 產生完全相同的輸出——評分過程 SHALL NOT 使用隨機性或當前時間。

本 capability MUST NOT 修改輸入的 `Player` 物件，包含 `rating` 與 `gamesPlayed`。`gamesPlayed` 的實際累加屬於回合結束時的持久化行為，由回合 capability 負責；本 capability 只**讀取**它作為 `K_eff` 的輸入。

手動覆蓋（`prd.md` 6.4.7）在本層無需特別處理：使用者於參賽者頁編輯分數後，下一場比賽以覆蓋後的值為輸入即自然生效，且本 capability 不重算既有歷史——因為它根本不持有歷史。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 相同輸入產生相同輸出

- **WHEN** 以同一份輸入連續呼叫兩次
- **THEN** 兩次輸出 MUST 完全相等
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「相同輸入產生相同輸出」

#### Scenario: 不修改輸入的參賽者物件

- **WHEN** 完成一次評分更新
- **THEN** 輸入的每個 `Player` 的 `rating` 與 `gamesPlayed` 皆未被更動
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「評分更新不修改輸入的參賽者物件」

#### Scenario: 手動覆蓋後的分數直接作為下一場輸入

- **WHEN** 以某球員被手動覆蓋後的分數作為輸入
- **THEN** 計算 MUST 完全基於該輸入值，與其過去任何比賽結果無關
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「手動覆蓋後的分數直接作為輸入且不受過往比賽影響」

#### Scenario: 每筆變動帶有球員識別與賽前賽後分數

- **WHEN** 完成一次評分更新
- **THEN** 每筆變動 MUST 含球員 id、賽前分數、賽後分數，供歷史紀錄直接取用（`prd.md` 8.2 要求歷史含賽前與賽後分數）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「每筆變動含球員 id 與賽前賽後分數」
