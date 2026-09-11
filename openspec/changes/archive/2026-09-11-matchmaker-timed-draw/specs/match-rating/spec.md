# Specification: match-rating

## MODIFIED Requirements

### Requirement: 評分更新公式與常數

系統 SHALL 以下列公式計算單場評分更新（`prd.md` 6.4.1）：

```
預測勝率   E = 1 / (1 + 10^(-(Ra - Rb) / D))
賽後更新   Ra' = Ra + K_eff × (S - E)          S：勝 = 1，敗 = 0，平 = 0.5
```

級距常數 `D` MUST 為 `3.0`、基礎幅度常數 `K_base` MUST 為 `0.15`（`prd.md` 6.4.2）。這兩個常數與評分上下限 `1.00`／`8.00` SHALL 由本 capability 以**具名常數**匯出供消費端取用，SHALL NOT 由 UI、回合流程或測試各自寫死——寫死會讓「常數依尺度重新校準」這件事散落多處，改動時漏改一處即與規格不符。

`D = 3.0` 對應的級距 MUST 使分差 0.5 得到約 60% 勝率、1.0 約 68%、2.0 約 82%、3.0 約 91%。同一場對戰的雙方 MUST 共用**同一個** `E`：一方為 `E`，另一方為 `1 - E`。

本 capability SHALL 支援平局路徑（`S = 0.5`）：`updateRatings` 的輸入 `winnerIndex` 由
`0 | 1` 擴為 `0 | 1 | "draw"`，`winnerIndex` 為 `"draw"` 時雙方的 `S` 皆為 `0.5`。是否允許
以平局送出（是否為計時回合）屬 `round-lifecycle` 的比分驗證職責，本 capability SHALL NOT
判斷「這場能不能平局」，只負責在收到 `winnerIndex: "draw"` 時正確計算——`prd.md` 13.4 對
非計時回合的「平局不得送出」由呼叫端把關（見 `matchmaker-timed-draw`）。

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

#### Scenario: 平局時雙方 S 皆為 0.5

- **WHEN** 以 `winnerIndex: "draw"` 呼叫 `updateRatings`
- **THEN** 兩隊的變動值皆依 `S = 0.5` 計算（各自的 `K_eff × (0.5 - E)`），SHALL NOT 有一方以 `S = 1` 或 `S = 0` 計算
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「平局時雙方 S 皆為 0.5 而非任一方視為勝負」

---

### Requirement: 零和的成立條件

`prd.md` 6.4.5 稱本模型為零和。本 capability SHALL 以「同一場雙方共用同一個 `E`、變動方向必定相反」作為**結構性保證**；數值上的總分守恆 MUST 僅在「雙方 `K_eff` 相同**且**無人觸界」時成立。此保證延伸至平局（`S = 0.5`）：雙方的 `(S - E)` 恆為相反號（一方為 `0.5 - E`、另一方為 `0.5 - (1 - E) = E - 0.5`），僅當 `E = 0.5`（雙方勢均力敵）時兩者皆恰為 `0`——此邊界情形是「兩者皆不變動」，而非其中一方為正、另一方為負，SHALL NOT 被誤判為「方向保證失效」。

當雙方 `K_eff` 不同（`gamesPlayed` 不同）或任一方觸及 1.00／8.00 時，總分 SHALL NOT 守恆，且系統 SHALL NOT 事後調整任一方的分數以強制守恆——事後補償會讓「新手 K 較大」（6.4.3）與「觸界者分數不再變動」（6.4.6）兩條規則被悄悄抵銷，使規格互相矛盾（見 design Decision 4）。此原則同樣適用於平局：雙方 `K_eff` 不同或任一方觸界時，平局的總分變動同樣不必守恆，系統 SHALL NOT 為了守恆而調整。

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

#### Scenario: 平局時勢均力敵雙方變動皆為零

- **WHEN** `rating` 皆 4.00、`gamesPlayed` 皆 0 的兩人以平局送出（`winnerIndex: "draw"`）
- **THEN** 雙方賽後分數皆與賽前相同（`E = 0.5`、`S = 0.5`，變動值為 `0`）
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「平局時勢均力敵雙方 E 與 S 皆為 0.5 而變動值為零」

#### Scenario: 平局時實力不同雙方變動方向相反

- **WHEN** `rating` 6.00 與 4.00（`gamesPlayed` 皆 0）的兩人以平局送出
- **THEN** 高分方（`E > 0.5`）賽後分數**下降**，低分方（`E < 0.5`）賽後分數**上升**，兩者變動值互為相反數
- **驗收**：`nextjs-pickball/lib/matchmaker/rating.test.ts`，it 名稱「平局時實力不同的雙方變動方向相反，高分方下降低分方上升」
