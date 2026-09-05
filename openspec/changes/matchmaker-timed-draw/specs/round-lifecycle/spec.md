# Specification: round-lifecycle

## MODIFIED Requirements

### Requirement: 回合資料模型

系統 SHALL 以 zod schema 定義「目前回合」，欄位對應 `prd.md` 6.1 與 6.5：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `roundNumber` | number | 1 起算的正整數，每產生一輪 +1 |
| `createdAt` | string | ISO 8601，由呼叫端注入 |
| `format` | `"singles" \| "doubles"` | 沿用 `match-allocation` 的 `MatchFormat`，SHALL NOT 另行定義 |
| `courtCount` | number | 1～8 的整數 |
| `targetScore` | `11 \| 15 \| 21` | 每輪設定，見「目標分數為每輪設定」 |
| `matches` | RoundMatch[] | 本輪對戰清單，見下表 |
| `restingPlayerIds` | string[] | 本輪休息名單（僅 id） |
| `seenSignatures` | `{ teammateKeys, opponentKeys, fullMatchKeys }` | 三組字串陣列，本輪分配所用的重複比對基準 |

單一場次 `RoundMatch` 的欄位：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `id` | string | 場次識別碼，由呼叫端注入 |
| `courtNumber` | number | 1 起算的正整數 |
| `format` | `"singles" \| "doubles"` | 與所屬回合一致 |
| `doublesComposition` | 選填 | 僅雙打場次帶有，沿用 `match-allocation` 的事後標示 |
| `teams` | `[RoundTeam, RoundTeam]` | 第一隊與第二隊，各含 `playerIds` 與 `rating`（隊伍分數） |
| `status` | `"pending" \| "scoring" \| "completed"` | 見下方狀態語意 |
| `scores` | `{ teamA, teamB } \| null` | 最終比分，非負整數；未完成時為 `null` |
| `winner` | `"teamA" \| "teamB" \| "draw" \| null` | 勝方；兩隊比分相同的計時回合為 `"draw"`（見「比分驗證」），SHALL NOT 於非計時回合出現；未完成時為 `null` |
| `completedAt` | `string \| null` | 完成時間，ISO 8601；未完成時為 `null` |
| `playerRatings` | `{ playerId, before, after }[]` | 該場每位球員的賽前與賽後分數；`before` 於建立回合時填入，`after` 未完成時為 `null` |

場次狀態的語意（`prd.md` 6.5）：

- `pending`——已排定但尚未開始，是「未完成場次」的唯一可重排對象。
- `scoring`——**進行中**，已開始計分但尚未判定勝負。本 capability SHALL 在 schema 與「未完成」判定中接受此值，但 SHALL NOT 自行產生它——實際的進入時機需要場邊計分的銜接，屬後續 milestone。先納入 schema 是為了避免對 `matchmaker:round:v1` 做破壞性遷移（沿用 `player-roster` 對 `restCount`／`gamesPlayed` 的同一教訓）。
- `completed`——已完成，MUST 同時帶齊 `scores`、`winner`、`completedAt`，且 `playerRatings` 每筆的 `after` MUST 為數字。已完成場次 SHALL NOT 再次送出比分（`prd.md` 6.5）。`winner` 為 `"draw"` 時同樣視為「已帶有 winner」（非 `null`），不觸發「completed 場次必須帶有 winner」的驗證失敗。

回合的球員只保存 **id 與該輪的分數快照**，SHALL NOT 內嵌整個 `Player` 物件——姓名、顏色、`isActive` 等欄位由名單即時解析。回合與名單雙寫同一份資料會在使用者於回合進行中改名或改分數時產生兩個互相矛盾的真相（見 design Decision 3）。

實作位於 `nextjs-pickball/lib/matchmaker/round-types.ts`。

#### Scenario: 合法回合通過驗證

- **WHEN** 以完整合法欄位呼叫 `RoundSchema.safeParse`
- **THEN** `success` 為 `true`
- **AND** `roundNumber` 為 `0` 或負數時驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「合法回合通過驗證，roundNumber 非正整數時失敗」

#### Scenario: 場次狀態僅接受三個列舉值

- **WHEN** `status` 為 `"pending"`、`"scoring"` 或 `"completed"`
- **THEN** 驗證通過
- **AND** 為 `"done"` 這類未列舉的值時驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「場次狀態僅接受 pending、scoring、completed」

#### Scenario: 完成場次必須帶齊比分、勝方與完成時間

- **WHEN** `status` 為 `"completed"` 但 `scores`、`winner` 或 `completedAt` 其中之一為 `null`
- **THEN** 驗證失敗
- **AND** `status` 為 `"pending"` 且三者皆為 `null` 時驗證通過
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「completed 場次缺少比分、勝方或完成時間時驗證失敗」

#### Scenario: winner 欄位新增 draw 列舉值

- **WHEN** 一個 `completed` 場次的 `winner` 為 `"draw"`、`scores` 兩隊比分相同，其餘欄位合法
- **THEN** 驗證通過
- **AND** `winner` 為 `"tie"` 這類未列舉的字面量時驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「winner 欄位新增 draw 列舉值且 completed 場次可帶 draw」

---

### Requirement: 比分驗證

每場 SHALL 提供兩個比分欄位，分別代表第一隊與第二隊，比分 MUST 為**非負數字**。以下情況 MUST 拒絕送出（`prd.md` 6.3.2）：

- 任一欄位未填寫（空字串或僅空白）。
- 任一欄位不是有效數字。
- 任一欄位為負數。
- 兩隊比分相同（平局）**且本回合非計時制**。
- 場次已完成（`status === "completed"`）。

`validateScoreInput` MUST 接受第四個參數 `isTimedRound: boolean`，表示本回合是否為計時制
（呼叫端由 `round.timer !== null` 推導——`timer` 欄位本身由 `matchmaker-round-timer`／M14
引入，不屬本 Requirement 定義範圍）。`isTimedRound` 為 `true` 時，兩隊比分相同 MUST 被接受，
`scoreA`／`scoreB` 一併回傳；`isTimedRound` 為 `false` 時維持既有行為，兩隊比分相同 MUST 被
拒絕（`prd.md` 13.4 對非計時回合「平局不得送出」不變，計時制平局為本 capability 新增的唯一
例外，見 `matchmaker-timed-draw`）。

拒絕時 MUST 回傳**可判讀的失敗結果**（含具名的錯誤代碼與繁體中文訊息），SHALL NOT 拋出例外、SHALL NOT 只回傳布林值——`prd.md` 第 11 節要求錯誤訊息說明可採取的修正方式，只回布林值的介面在型別上就沒有訊息可傳給 UI。

驗證 MUST 在任何狀態變更之前完成；失敗時回合、名單與歷史 SHALL NOT 有任何改變。

實作位於 `nextjs-pickball/lib/matchmaker/round.ts`。

#### Scenario: 比分欄位空白

- **WHEN** 任一比分欄位為 `""` 或 `"   "`
- **THEN** 送出被拒絕，錯誤訊息以繁體中文說明兩隊比分皆須填寫
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「比分欄位空白時拒絕送出並回傳繁體中文訊息」

#### Scenario: 比分非有效數字

- **WHEN** 任一比分欄位為 `"abc"`、`"1a"` 或 `"NaN"`
- **THEN** 送出被拒絕
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「比分非有效數字時拒絕送出」

#### Scenario: 比分為負數

- **WHEN** 任一比分欄位為 `"-1"`
- **THEN** 送出被拒絕
- **AND** `"0"` 本身 MUST 被接受（非負含 0）
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「比分為負數時拒絕送出，0 本身可接受」

#### Scenario: 兩隊比分相同

- **GIVEN** 本回合非計時制（`isTimedRound` 為 `false`）
- **WHEN** 兩隊比分皆為 `11`
- **THEN** 送出被拒絕，錯誤訊息以繁體中文明確指出「非計時回合不得送出平局」、兩隊比分相同時無法判定勝方
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「兩隊比分相同時拒絕送出」

#### Scenario: 計時回合兩隊比分相同時允許送出為平局

- **GIVEN** 本回合為計時制（`isTimedRound` 為 `true`）
- **WHEN** 兩隊比分皆為 `11`
- **THEN** 送出被接受（`ok` 為 `true`），回傳的 `scoreA`／`scoreB` 皆為 `11`
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「計時回合兩隊比分相同時允許送出」

#### Scenario: 場次已完成

- **GIVEN** 一個 `status` 為 `"completed"` 的場次
- **WHEN** 再次送出比分
- **THEN** 送出被拒絕，該場次的既有比分與評分結果不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「已完成場次再次送出時被拒絕且既有結果不變」

---

### Requirement: 比分送出的完成流程

驗證通過後，系統 SHALL 依**固定順序**完成一場對戰（`prd.md` 6.3、6.4、6.5、8.2）：

1. 呼叫評分 API 取得該場每位球員 clamp 至 1.00～8.00 後的新 rating，以及是否觸頂／觸底。
2. 將場次標記為 `completed`，寫入最終比分、勝方、完成時間，並把每位球員的賽前分數與賽後分數填入 `playerRatings`。
3. 追加**一筆**歷史紀錄（欄位與寫入時機見 `match-history`）。
4. 該場出賽的 4 位（雙打）或 2 位（單打）球員 `gamesPlayed` 各 +1。

勝方 MUST 為比分較高的一隊；**兩隊比分相同時（僅計時回合可能發生，見「比分驗證」），勝方 MUST 為 `"draw"`，且評分 API 的呼叫 MUST 以雙方 `S = 0.5` 計算**（`match-rating` 的「評分更新公式與常數」）。賽前分數 MUST 取「送出當下該員在名單中的 rating」，賽後分數 MUST 取評分 API clamp 後的結果，平局時亦同。觸頂或觸底時 rating MUST 停在邊界值，且流程 MUST 保留評分 API 回報的觸界訊息供 UI 提示（`prd.md` 6.4.6 要求 UI 明確標示「已達上限／下限」，SHALL NOT 靜默卡住）。

本流程 MUST 為**原子**：任一步驟失敗時，回合、名單與歷史三者 SHALL NOT 有任何部分變更——只寫了歷史卻沒更新評分（或反之）會產生無法自我修復的不一致資料。

`gamesPlayed` 的累加 MUST 只發生在此處，SHALL NOT 於產生回合或重排時發生——`gamesPlayed` 的用途是評分的信賴度加權（`prd.md` 6.4.3），未打完的場次不構成出場經驗；平局同樣計入出場經驗，累加規則不因平局而不同。

本 capability SHALL NOT 自行實作 Elo 公式；`D`、`K_base` 與 K 遞減皆屬評分 capability。

實作位於 `nextjs-pickball/lib/matchmaker/round.ts`。

#### Scenario: 送出合法比分後場次標記為完成

- **GIVEN** 一個 `pending` 的單打場次
- **WHEN** 送出比分 `11` 比 `7`
- **THEN** 該場 `status` 為 `"completed"`，`scores` 為 `{ teamA: 11, teamB: 7 }`，`winner` 為 `"teamA"`，`completedAt` 為注入的時間
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「送出合法比分後場次標記為完成並記錄比分、勝方與完成時間」

#### Scenario: 賽前與賽後分數逐一對應該場每位球員

- **WHEN** 完成一場雙打
- **THEN** `playerRatings` MUST 恰有 4 筆，每筆的 `playerId` 對應該場一位球員，`before` 為送出當下的 rating，`after` 為評分後的 rating
- **AND** 單打時恰有 2 筆
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「完成場次的 playerRatings 逐一對應該場每位球員的賽前與賽後分數」

#### Scenario: 評分結果寫回名單

- **WHEN** 完成一場對戰
- **THEN** 該場每位球員在名單中的 `rating` MUST 更新為評分後的值
- **AND** 未參與該場的參賽者 rating 不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「完成場次後評分結果寫回名單，未參賽者不受影響」

#### Scenario: 該場球員的累計出場次數加 1

- **WHEN** 完成一場雙打
- **THEN** 該場 4 位球員的 `gamesPlayed` 各 +1
- **AND** 休息者與其他場次的球員 `gamesPlayed` 不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「完成場次後該場球員 gamesPlayed 各加 1，其餘人不變」

#### Scenario: 觸頂或觸底時停在邊界並回報

- **GIVEN** 一位 rating 已達 `8.00` 的球員獲勝
- **WHEN** 送出比分
- **THEN** 該員的賽後分數 MUST 為 `8.00`
- **AND** 送出結果 MUST 回報該員已達上限，SHALL NOT 靜默處理
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「評分觸頂時賽後分數停在 8.00 並回報已達上限」

#### Scenario: 驗證失敗時回合、名單與歷史皆不變

- **GIVEN** 本回合非計時制（`round.timer` 為 `null`）
- **WHEN** 以平局比分送出
- **THEN** 回合物件、名單中所有 `rating` 與 `gamesPlayed`、歷史筆數 MUST 與送出前完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「送出失敗時回合、名單與歷史皆不變」

#### Scenario: 計時回合送出平局比分後場次標記為完成且 winner 為 draw

- **GIVEN** 一個計時回合（`round.timer !== null`）中 `pending` 的單打場次
- **WHEN** 送出比分 `11` 比 `11`
- **THEN** 該場 `status` 為 `"completed"`，`scores` 為 `{ teamA: 11, teamB: 11 }`，`winner` 為 `"draw"`，`completedAt` 為注入的時間
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「計時回合送出平局比分後場次標記為完成且 winner 為 draw」

#### Scenario: 計時回合平局時 playerRatings 仍逐一對應該場每位球員

- **GIVEN** 一個計時回合的雙打場次
- **WHEN** 送出平局比分
- **THEN** `playerRatings` MUST 恰有 4 筆，每筆的 `before`／`after` 皆為以 `S = 0.5` 計算後的結果
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「計時回合平局時 playerRatings 仍逐一對應該場每位球員」
