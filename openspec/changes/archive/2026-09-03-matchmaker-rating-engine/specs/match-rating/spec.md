## Purpose

定義「匹克球對戰分配機」在送出比分後更新雙方強度分數的完整計算規則：預測勝率與更新公式、依 1.00～8.00 尺度重新校準的常數、K 依出場次數遞減、雙打的隊伍平均與同隊同幅、零和的成立條件、邊界 clamp 與觸界標示，以及輸入驗證。

本 capability 的核心是 `prd.md` 6.4 的**重新校準版 Elo**。標準 Elo 的 `D=400`、`K=32` 是為西洋棋 1500 分級距設計，直接套在全距只有 7 的尺度上會使預測勝率退化為約 51%（毫無鑑別度）、單場變動達 ±15 分（一場即撞頂）。因此 `D` 與 `K_base` 是**規格的一部分**，不是可任意調整的實作細節。

本 capability 全部為**純函式**：不讀寫 LocalStorage、不含 React、不建立回合、不驗證比分、不累加 `gamesPlayed` 或 `restCount`、不寫入歷史紀錄。回合與比分的狀態管理、`gamesPlayed` 的累加、歷史紀錄的持久化與呈現，都屬於其他 capability。`prd.md` 6.4.7 的手動覆蓋由 `player-roster` 的 `updatePlayer` 提供，本 capability 不重複實作；「覆蓋不重算既有歷史」在此為結構上的必然——本 capability 無狀態，沒有任何路徑能回頭重算。

## ADDED Requirements

### Requirement: 評分更新公式與常數

系統 SHALL 以下列公式計算單場評分更新（`prd.md` 6.4.1）：

```
預測勝率   E = 1 / (1 + 10^(-(Ra - Rb) / D))
賽後更新   Ra' = Ra + K_eff × (S - E)          S：勝 = 1，敗 = 0
```

級距常數 `D` MUST 為 `3.0`、基礎幅度常數 `K_base` MUST 為 `0.15`（`prd.md` 6.4.2）。這兩個常數與評分上下限 `1.00`／`8.00` SHALL 由本 capability 以**具名常數**匯出供消費端取用，SHALL NOT 由 UI、回合流程或測試各自寫死——寫死會讓「常數依尺度重新校準」這件事散落多處，改動時漏改一處即與規格不符。

`D = 3.0` 對應的級距 MUST 使分差 0.5 得到約 60% 勝率、1.0 約 68%、2.0 約 82%、3.0 約 91%。同一場對戰的雙方 MUST 共用**同一個** `E`：一方為 `E`，另一方為 `1 - E`。

本 capability SHALL NOT 提供平局路徑（`S = 0.5`）——`prd.md` 13.4 明訂平局不得送出，比分驗證屬於回合與比分 capability。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts` 與 `nextjs-pickball/lib/matchmaker/rating-types.ts`。

#### Scenario: 常數以具名常數匯出

- **WHEN** 讀取匯出的評分常數
- **THEN** 級距常數為 `3.0`、基礎幅度常數為 `0.15`
- **AND** 評分下限為 `1`、上限為 `8`、K 遞減的錨點場次為 `20`
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「評分常數以具名常數匯出，D 為 3.0、K_base 為 0.15」

#### Scenario: 分差對應的預測勝率

- **WHEN** 以分差 0、0.5、1.0、2.0、3.0 計算預測勝率
- **THEN** 依序約為 0.500、0.595、0.683、0.823、0.909
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「分差對應的預測勝率符合 D=3.0 的級距」

#### Scenario: 雙方預測勝率互補

- **WHEN** 對任意一組分數計算兩個方向的預測勝率
- **THEN** 兩者相加為 1
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「同一場雙方的預測勝率相加為 1」

### Requirement: K 依出場次數遞減

系統 SHALL 依下式計算每位球員的有效更新幅度（`prd.md` 6.4.3）：

```
K_eff = K_base × (1 + 20 / (20 + 該員累計出場次數))
```

`K_eff` MUST **逐人計算**：同一場對戰中每位球員各自依**自己的** `gamesPlayed` 取值，SHALL NOT 以全場平均、隊伍平均或任一方的 `gamesPlayed` 統一代入。此設計讓主持人初始估錯的人在約三個活動夜內回到正確名次，同時使老手的分數不會因單場意外大幅跳動。

`K_eff` MUST 隨 `gamesPlayed` 遞增而單調遞減，且恆大於 `K_base`（趨近但不等於）。

本 capability SHALL NOT 累加 `gamesPlayed`——累加屬於回合結束時的持久化行為，由回合與比分 capability 負責；本 capability 只**讀取**該值。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: K_eff 在關鍵出場次數的取值

- **WHEN** `gamesPlayed` 為 0、20、60
- **THEN** `K_eff` 依序為 `0.30`（`K_base` 的 2 倍）、`0.225`（1.5 倍）、`0.1875`（1.25 倍）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「K_eff 在 0 場為 K_base 的 2 倍、20 場為 1.5 倍、60 場為 1.25 倍」

#### Scenario: K_eff 單調遞減且恆大於 K_base

- **WHEN** 以遞增的 `gamesPlayed` 序列取 `K_eff`
- **THEN** 序列嚴格遞減
- **AND** 每一項皆大於 `K_base`
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「K_eff 隨出場次數單調遞減且恆大於 K_base」

#### Scenario: 出場次數少者變動幅度較大

- **WHEN** 兩位分數相同（皆 4.00）的球員對戰，一方 `gamesPlayed` 為 0、另一方為 60
- **THEN** `gamesPlayed` 為 0 的一方變動幅度為 `0.15`，`gamesPlayed` 為 60 的一方為 `0.09`
- **AND** 前者的變動幅度 MUST 大於後者（`prd.md` 13.4「K 遞減生效」）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「出場次數少者的評分變動幅度大於出場次數多者」

### Requirement: 單打評分更新

單打 SHALL 以雙方球員各自的 `rating` 直接計算 `E`，勝方 `S = 1`、敗方 `S = 0`，兩人各自以自己的 `K_eff` 套用 `Ra' = Ra + K_eff × (S - E)`。

更新結果 MUST 以**依隊伍順序攤平**的清單回傳（第一隊的球員在前），每筆 MUST 至少包含：球員 `id`、賽前分數、賽後分數、變動值、是否已達上限、是否已達下限、是否因邊界被夾。變動值 MUST 由「賽後分數減賽前分數」重算，SHALL NOT 直接回傳未經四捨五入與 clamp 的理論變動值——否則變動值與賽後分數在觸界時會互相矛盾。

輸出 MUST 一併帶出兩隊的預測勝率，供上層判斷「爆冷」與顯示用途；本 capability SHALL NOT 自行定義何謂爆冷。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 勢均力敵時各變動 K_eff 的一半

- **WHEN** 兩位球員皆為 `rating` 4.00、`gamesPlayed` 0，第一位獲勝
- **THEN** 勝方賽後為 `4.15`、敗方為 `3.85`（`E = 0.5`，`K_eff = 0.30`，變動 `±0.15`）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「單打勢均力敵時勝方與敗方各變動 K_eff 的一半」

#### Scenario: 爆冷獲勝的加分明顯較大

- **WHEN** `rating` 6.00 與 3.00（`gamesPlayed` 皆 20）對戰
- **THEN** 低分方獲勝時加分為 `0.20`（賽後 3.20），高分方獲勝時加分為 `0.02`（賽後 6.02）
- **AND** 前者 MUST 明顯大於後者（`prd.md` 13.4「爆冷加分較大」）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「爆冷獲勝的加分明顯大於預期內獲勝的加分」

#### Scenario: 輸出形狀與順序

- **WHEN** 完成一次單打評分更新
- **THEN** 回傳的變動清單長度為 2，順序為「第一隊球員、第二隊球員」
- **AND** 每筆含 `id`、賽前分數、賽後分數、變動值與三個邊界旗標
- **AND** 一併帶出兩隊的預測勝率
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「輸出依隊伍順序攤平，每筆含 id、賽前分數、賽後分數與變動值」

### Requirement: 雙打評分更新

雙打 SHALL 以兩隊的**平均** `rating` 計算 `E`（`prd.md` 6.4.4），SHALL NOT 以隊伍總和計算——總和會把分差放大為兩倍，等同把級距 `D` 悄悄砍半，使預測勝率失真。

同隊兩人 MUST 共用同一個 `(S - E)`（來自隊伍平均，與個人分數無關），並各自以自己的 `K_eff` 放大。因此：

- 同隊兩人 `gamesPlayed` **相同**時，兩人 MUST 加減**同一數值**（`prd.md` 6.4.4 的字面要求）。
- 同隊兩人 `gamesPlayed` **不同**時，兩人的變動方向 MUST 相同、幅度 MUST 依各自 `K_eff` 而不同（`prd.md` 6.4.3 的逐人要求優先於 6.4.4 的字面「同一數值」，見 design Decision 3）。

每隊人數 MUST 由對戰方式決定（單打每隊 1 人、雙打每隊 2 人），且 SHALL 由 `match-allocation` 既有的 `PLAYERS_PER_MATCH` 常數推導，SHALL NOT 另行寫死 1 或 2。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 以隊伍平均而非總和計算預測勝率

- **WHEN** 第一隊為 6.00 與 4.00（平均 5.00、總和 10.00）、第二隊為 4.50 與 3.50（平均 4.00、總和 8.00），`gamesPlayed` 皆 0
- **THEN** 第一隊的預測勝率約為 0.683（以平均差 1.00 計算），而非約 0.823（以總和差 2.00 計算）
- **AND** 第一隊獲勝時四人賽後分數為 `6.10`、`4.10`、`4.40`、`3.40`
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙打以兩隊平均分數計算預測勝率，而非以總和」

#### Scenario: 同隊兩人出場次數相同時加減同一數值

- **WHEN** 同隊兩人 `gamesPlayed` 皆為 0 但賽前分數不同（6.00 與 4.00）
- **THEN** 兩人的變動值完全相同（皆為 `+0.10`）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙打同隊兩人出場次數相同時加減同一數值」

#### Scenario: 同隊兩人出場次數不同時各自套用自己的 K_eff

- **WHEN** 兩隊四人 `rating` 皆 4.00，每隊各有一人 `gamesPlayed` 為 0、另一人為 60，第一隊獲勝
- **THEN** 第一隊的兩人變動值為 `+0.15` 與 `+0.09`，第二隊為 `-0.15` 與 `-0.09`
- **AND** 同隊兩人的變動方向 MUST 相同
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙打同隊兩人出場次數不同時各自套用自己的 K_eff」

### Requirement: 零和的成立條件

`prd.md` 6.4.5 稱本模型為零和。本 capability SHALL 以「同一場雙方共用同一個 `E`、變動方向必定相反」作為**結構性保證**；數值上的總分守恆 MUST 僅在「雙方 `K_eff` 相同**且**無人觸界」時成立。

當雙方 `K_eff` 不同（`gamesPlayed` 不同）或任一方觸及 1.00／8.00 時，總分 SHALL NOT 守恆，且系統 SHALL NOT 事後調整任一方的分數以強制守恆——事後補償會讓「新手 K 較大」（6.4.3）與「觸界者分數不再變動」（6.4.6）兩條規則被悄悄抵銷，使規格互相矛盾（見 design Decision 4）。

6.4.5 的實質約束因此為：評分只保證**群體內的相對排序與相對差距**，其絕對值不對應 DUPR 或任何外部等級制度。上層 UI SHALL NOT 將此分數標示為對外通用的技術等級，也 SHALL NOT 對使用者宣稱群體總分恆定。

#### Scenario: K_eff 相同且未觸界時總分守恆

- **WHEN** `rating` 5.00 與 4.00、`gamesPlayed` 皆 0 的兩人對戰，高分方獲勝
- **THEN** 賽後為 `5.10` 與 `3.90`
- **AND** 賽前總和 9.00 與賽後總和 9.00 相等
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙方 K_eff 相同且未觸界時總分守恆」

#### Scenario: K_eff 不同時總分不守恆且不做事後補償

- **WHEN** `rating` 皆 4.00、`gamesPlayed` 分別為 0 與 60 的兩人對戰，`gamesPlayed` 為 0 的一方獲勝
- **THEN** 賽後為 `4.15` 與 `3.91`，總和由 8.00 變為 8.06
- **AND** 系統 SHALL NOT 為了守恆而縮減勝方加分或放大敗方扣分
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「雙方 K_eff 不同時總分不守恆且不做事後補償」

#### Scenario: 觸界時 clamp 優先於零和

- **WHEN** 兩位皆為 `rating` 8.00、`gamesPlayed` 0 的球員對戰
- **THEN** 敗方照常降為 `7.85`，勝方被夾在 `8.00`（變動值 0）
- **AND** 總和由 16.00 變為 15.85，系統 SHALL NOT 為了守恆而少扣敗方的分數
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「觸界時 clamp 優先於零和，總分不守恆」

### Requirement: 邊界 clamp 與觸界標示

賽後分數 MUST 先四捨五入至小數第 2 位、再 clamp 於 1.00～8.00（含兩端）（`prd.md` 6.4.6）。順序不可顛倒：`rating` 的定義域本身就是「兩位小數且落在 1.00～8.00」（見 `player-roster` 的參賽者資料模型），先夾再捨入會讓「捨入後本來就等於 8.00」的情況被誤報為被截斷（見 design Decision 5）。

四捨五入 SHALL 沿用 `nextjs-pickball/lib/matchmaker/rating-math.ts` 既有的 `roundRating`，SHALL NOT 另行實作一份兩位小數規則。

每筆更新結果 MUST 帶出三個可判讀的旗標：

- **已達上限**：賽後分數等於 8.00。
- **已達下限**：賽後分數等於 1.00。
- **已被夾值**：四捨五入後的理論值超出 1.00～8.00，因而實際變動值小於理論變動值。

已達上限或下限者 MUST 仍照常參與計算：往界內方向的變動 MUST 正常生效，只有越界的部分被夾。UI 需依這些旗標明確標示「已達上限／下限」，SHALL NOT 靜默卡住讓使用者誤以為功能故障——但**顯示本身不屬本 capability**。

賽後分數 MUST 恆為兩位小數且落在 1.00～8.00，使其能直接寫回 `player-roster` 的 `PlayerSchema` 而不觸發驗證失敗。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 更新後超過上限時夾為 8.00

- **WHEN** 兩位皆為 `rating` 7.95、`gamesPlayed` 0 的球員對戰
- **THEN** 勝方理論值 8.10 被夾為 `8.00`，實際變動值為 `0.05`
- **AND** 該筆標示已達上限與已被夾值，敗方為 `7.80` 且三個旗標皆為 false
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「更新後超過 8.00 時夾為 8.00 並標示已達上限」

#### Scenario: 更新後低於下限時夾為 1.00

- **WHEN** 兩位皆為 `rating` 1.05、`gamesPlayed` 0 的球員對戰
- **THEN** 敗方理論值 0.90 被夾為 `1.00`，實際變動值為 `-0.05`
- **AND** 該筆標示已達下限與已被夾值
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「更新後低於 1.00 時夾為 1.00 並標示已達下限」

#### Scenario: 未觸界時旗標皆為 false

- **WHEN** 兩位皆為 `rating` 4.00、`gamesPlayed` 0 的球員對戰
- **THEN** 兩筆結果的已達上限、已達下限、已被夾值三個旗標皆為 false
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「未觸界時上下限與夾值旗標皆為 false」

#### Scenario: 已達上限者落敗時照常下降

- **WHEN** 賽前已為 `rating` 8.00 的球員落敗（對手亦為 8.00、`gamesPlayed` 皆 0）
- **THEN** 該員賽後為 `7.85`，變動值為 `-0.15`
- **AND** 該筆的已達上限與已被夾值旗標皆為 false（分數已離開上限）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「已達上限者落敗時分數照常下降且不再標示已達上限」

#### Scenario: 賽後分數可寫回名單

- **WHEN** 取一組會產生無限小數的更新（`rating` 6.00 對 3.00、`gamesPlayed` 皆 20）
- **THEN** 每筆賽後分數四捨五入後與自身相等（即恆為兩位小數），且落在 1.00～8.00
- **AND** 以該賽後分數組成的 `Player` MUST 通過 `PlayerSchema` 驗證
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「賽後分數為兩位小數且可通過 PlayerSchema 的 rating 驗證」

### Requirement: 純函式契約與輸入驗證

評分更新 MUST 為純函式：相同輸入 MUST 產生相同輸出，SHALL NOT 使用亂數、時間或任何 I/O，SHALL NOT 修改傳入的物件或陣列（輸入 MUST 被視為唯讀），SHALL NOT 讀寫 LocalStorage，SHALL NOT 累加 `gamesPlayed` 或 `restCount`。

本 capability SHALL NOT 直接取用 `player-roster` 的 `Player` 型別作為輸入，而 MUST 定義只含 `id`、`rating`、`gamesPlayed` 三個欄位的輸入型別——評分只需要這三項，且 `match-allocation` 的 `Team.rating` 是隊內**總和**，若直接吃 `Team` 極易誤把總和當平均（見 design Decision 2）。`Player` 在結構型別上滿足此輸入型別，消費端仍可直接傳入。

下列情況 MUST 拋出錯誤，SHALL NOT 靜默夾值、補值或忽略（`prd.md` 第 11 節；與 `player-roster` 對 `rating` 的「SHALL NOT 靜默夾值」、`match-allocation` 對場地數的立場一致）：

- 任一隊人數與對戰方式不符（單打每隊非 1 人、雙打每隊非 2 人）。
- 任一球員的 `rating` 超出 1.00～8.00。
- 任一球員的 `gamesPlayed` 為負數或非整數。
- 同一場中出現重複的球員 `id`。

錯誤訊息 MUST 為繁體中文，MUST 說明可採取的修正方式並附上實際輸入值，SHALL NOT 只顯示技術錯誤碼。

實作位於 `nextjs-pickball/lib/matchmaker/rating.ts`。

#### Scenario: 隊伍人數與對戰方式不符

- **WHEN** 對戰方式為單打但某一隊有 2 人，或對戰方式為雙打但某一隊只有 1 人
- **THEN** 拋出繁體中文錯誤，訊息含實際人數
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「隊伍人數與對戰方式不符時拒絕輸入」

#### Scenario: rating 超出合法範圍

- **WHEN** 任一球員的 `rating` 為 `0.99` 或 `8.01`
- **THEN** 拋出繁體中文錯誤
- **AND** 邊界值 `1` 與 `8` 本身 MUST 被接受（範圍為 inclusive），系統 SHALL NOT 把 `8.01` 靜默夾為 `8.00` 後照常計算
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「rating 超出 1.00～8.00 時拒絕輸入而非靜默夾值」

#### Scenario: gamesPlayed 非法

- **WHEN** 任一球員的 `gamesPlayed` 為 `-1` 或 `1.5`
- **THEN** 拋出繁體中文錯誤
- **AND** `0` MUST 被接受
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「gamesPlayed 為負數或非整數時拒絕輸入」

#### Scenario: 同一場出現重複球員

- **WHEN** 同一個球員 `id` 同時出現在兩隊，或同時出現在同一隊的兩個位置
- **THEN** 拋出繁體中文錯誤
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「同一場出現重複的 player id 時拒絕輸入」

#### Scenario: 不修改輸入物件

- **WHEN** 完成一次評分更新
- **THEN** 輸入的陣列與其中每個球員物件的 `rating`、`gamesPlayed` 皆未被更動
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「評分更新不修改輸入的球員物件」

#### Scenario: 相同輸入產生相同輸出

- **WHEN** 以同一份輸入連續呼叫兩次
- **THEN** 兩次結果深度相等
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「相同輸入產生相同輸出」

#### Scenario: 不累加出場與休息次數

- **WHEN** 完成一次評分更新
- **THEN** 回傳結果 SHALL NOT 包含任何 `gamesPlayed` 或 `restCount` 的新值
- **AND** 輸入球員的 `gamesPlayed` 維持原值
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「評分更新不累加 gamesPlayed 與 restCount」
