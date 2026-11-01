# round-lifecycle Specification

## Purpose
定義「匹克球對戰分配機」目前回合的完整生命週期：回合資料模型與目標分數、產生本輪對戰、休息次數的結算時機、重設／重排未完成場次、比分驗證與送出後的完成流程，以及回合與歷史的 LocalStorage 持久化與損壞降級。

本 capability 是 `match-allocation`（純函式分配引擎）與評分引擎之間的**時間軸**：分配引擎不記得任何事，評分引擎只算單場結果，而回合把兩者串成一個會前進、會被保存、可以被重設的活動狀態機。`prd.md` 5.3 尾段的「本輪結束後休息次數 +1」在此被賦予操作性定義——「本輪結束」即「產生新一輪的那一刻」。

本 capability **不含任何視覺呈現**：對戰舞台、休息名單面板、控制項與空白狀態皆屬對戰畫面 capability。場邊計分的銜接（含 `scoring` 狀態的實際產生與目標分數的完整鎖定判定）屬後續 milestone，本 capability 只在 schema 與判定邏輯中預留。歷史的區間篩選、排序與頁面呈現屬 `match-history` 之外的後續 milestone。

## Requirements

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
| `timer` | `{ durationMinutes, startedAt } \| null` | 本輪計時設定；預設（不計時）為 `null`，見「回合計時器」 |

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

`timer` 欄位於本 capability（M14）新增，型別為 `{ durationMinutes: 10 | 15 | 20; startedAt: string | null } | null`。SHALL 以 `.nullable().default(null)` 定義，使既有（不含本欄位的）`matchmaker:round:v1` 資料仍可通過驗證且被判讀為「不計時」，SHALL NOT 因新增本欄位而 bump storage key 版本——`scoreboard` capability 的「向後相容策略」與 M6 對 `courtNumber` 的 delta 已為此模式立下先例。完整的行為定義（設定、鎖定、開始、倒數判定、重排與新一輪時的重置語意）見「回合計時器」Requirement。

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

#### Scenario: 舊資料缺少 timer 欄位時以 null 通過驗證

- **GIVEN** 一份合法回合資料，但不含 `timer` 欄位（模擬 M14 之前寫入的既有資料）
- **WHEN** 以 `RoundSchema.safeParse` 驗證
- **THEN** `success` 為 `true`，且解析結果的 `timer` 為 `null`
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「回合資料缺少 timer 欄位時以 null 通過驗證，向後相容既有資料」

#### Scenario: winner 欄位新增 draw 列舉值

- **WHEN** 一個 `completed` 場次的 `winner` 為 `"draw"`、`scores` 兩隊比分相同，其餘欄位合法
- **THEN** 驗證通過
- **AND** `winner` 為 `"tie"` 這類未列舉的字面量時驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「winner 欄位新增 draw 列舉值且 completed 場次可帶 draw」

---

### Requirement: 目標分數為每輪設定

目標分數 SHALL 為**每輪設定**，同一輪的所有場地共用，值域 MUST 為 `11`、`15`、`21` 三個字面量，並於「產生本輪對戰」時決定（`prd.md` 6.3.1）。預設值 MUST 為 `11`，且 SHALL 由本 capability 以具名常數匯出，SHALL NOT 由上層 UI 各自寫死。

該輪一旦有場次開始計分即不可更改。本 capability SHALL 提供「該輪所有場次皆為 `pending` 時可更改目標分數」的能力，並在已有場次離開 `pending` 時 MUST 拒絕更改並回傳繁體中文訊息。**完整的鎖定判定**（含場邊計分開始的時機）需要 `scoring` 狀態的實際產生，屬後續 milestone；本 capability 只以「是否仍全為 `pending`」作為鎖定條件。

目標分數的三個字面量 MUST 與 `nextjs-pickball/lib/scoreboard/types.ts` 的 `TargetScoreSchema` 值域一致——後續 milestone 會把該輪的目標分數直接交給計分板，兩邊值域一旦分歧就會出現「回合設 21、計分板跑 11」的靜默錯誤。但兩者 SHALL NOT 共用同一個 schema 物件：計分板的 `TargetScoreSchema` 帶 `.default(11)`，那是為了讓該欄位加入前寫入的計分板資料仍能通過驗證；回合的目標分數一律在建立時明確決定，帶 default 會讓損壞資料被靜默補成 11 而非被判為損壞（見 design Decision 4）。

實作位於 `nextjs-pickball/lib/matchmaker/round-types.ts` 與 `nextjs-pickball/lib/matchmaker/round.ts`。

#### Scenario: 目標分數僅接受 11、15、21

- **WHEN** `targetScore` 為 `11`、`15` 或 `21`
- **THEN** 驗證通過
- **AND** 為 `9`、`13` 或未提供時驗證失敗（SHALL NOT 靜默補為預設值）
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「targetScore 僅接受 11、15、21 且不帶預設值」

#### Scenario: 目標分數選項與計分板值域一致

- **WHEN** 比對本 capability 匯出的目標分數選項常數與 `lib/scoreboard/types.ts` 的 `TargetScoreSchema` 可接受的值
- **THEN** 兩者的可接受值集合 MUST 完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「目標分數選項與 scoreboard 的 TargetScoreSchema 值域一致」

#### Scenario: 產生本輪時決定目標分數

- **WHEN** 以 `targetScore: 15` 產生本輪對戰
- **THEN** 回合的 `targetScore` 為 `15`，該輪所有場次共用此值
- **AND** 未指定時採預設值 `11`
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「產生本輪時決定目標分數，未指定時採預設 11」

#### Scenario: 尚未開始計分時可更改，已開始後拒絕

- **GIVEN** 目前回合的所有場次皆為 `pending`
- **WHEN** 呼叫 `setTargetScore(round, 21)`
- **THEN** 回傳的回合 `targetScore` 為 `21`，其餘欄位不變
- **AND** 若該輪已有任一場次為 `scoring` 或 `completed`，MUST 拒絕更改並回傳繁體中文訊息，原回合 SHALL NOT 被修改
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「所有場次皆為 pending 時可改目標分數，已有場次離開 pending 時拒絕」

---

### Requirement: 產生本輪對戰

按下「產生本輪對戰」時，系統 SHALL 依目前設定建立新回合（`prd.md` 6.1）：呼叫 `match-allocation` 的 `allocateRound()`，並把其輸出投影成可持久化的回合物件。本 capability SHALL NOT 自行實作任何排序、配對或重複迴避邏輯——那全部屬於 `match-allocation`。

回合編號 MUST 為：目前無回合時 `1`，否則為目前回合的 `roundNumber + 1`。新回合 MUST **取代**目前回合（同時間只有一個目前回合）；上一輪的已完成場次早已於送出比分時寫入歷史，不因取代而遺失。

上一輪存在時，重複比對基準 MUST 為**上一輪所有已完成（`completed`）與進行中（`scoring`）場次**的三類簽章，併入上一輪回合物件本身攜帶的 `seenSignatures`（該欄位在重設時會被併入被丟棄的原始組合，見「重設與重排未完成場次」）。上一輪**未開始（`pending`）的場次 SHALL NOT 納入基準**——那些對戰從未發生，把它們當成「已配過」會無謂地限制新一輪的配對空間。未開始的場次也 SHALL NOT 寫入歷史。

基準 MUST **只取上一輪**，SHALL NOT 累積更早的所有回合（`prd.md` 5.6 列舉的記錄範圍即為上一輪與本輪）。累積全部歷史會使數輪之後幾乎每組配對都命中，重複迴避退化為必然放棄，白白付出搜尋成本。

`seenSignatures` 在回合物件中以**三組字串陣列**保存（可 JSON 序列化）；呼叫 `allocateRound()` 前 MUST 轉換為 `match-allocation` 所要求的 `ReadonlySet` 形式，回寫時再轉回陣列。此轉換是 `match-allocation` 明文交給本 capability 的持久化邊界。

實作位於 `nextjs-pickball/lib/matchmaker/round.ts`。

#### Scenario: 首輪以空基準產生且回合編號為 1

- **GIVEN** 目前沒有回合
- **WHEN** 產生本輪對戰
- **THEN** 回合編號為 `1`，`seenSignatures` 的三組陣列皆為空
- **AND** 所有場次的 `status` 為 `"pending"`，`scores`、`winner`、`completedAt` 皆為 `null`
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「首輪回合編號為 1，基準為空且所有場次為 pending」

#### Scenario: 產生新一輪時編號加 1 並取代目前回合

- **GIVEN** 目前回合的 `roundNumber` 為 `3`
- **WHEN** 再次產生本輪對戰
- **THEN** 新回合的 `roundNumber` 為 `4`，且成為唯一的目前回合
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「產生新一輪時回合編號加 1 並取代目前回合」

#### Scenario: 上一輪的已完成與進行中場次納入基準

- **GIVEN** 上一輪有一場 `completed` 與一場 `scoring`
- **WHEN** 產生新一輪
- **THEN** 兩場的隊友、交叉對手與完整比賽簽章 MUST 全部出現在新回合的 `seenSignatures` 中
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「上一輪已完成與進行中的場次納入重複比對基準」

#### Scenario: 上一輪未開始的場次不納入基準

- **GIVEN** 上一輪有一場 `pending` 場次從未被送出比分
- **WHEN** 產生新一輪
- **THEN** 該場的簽章 SHALL NOT 出現在新回合的 `seenSignatures` 中
- **AND** 該場 SHALL NOT 產生任何歷史紀錄
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「上一輪未開始的場次不納入基準也不寫入歷史」

#### Scenario: 基準只取上一輪不累積更早的回合

- **GIVEN** 連續產生三輪，且第一輪有一場已完成
- **WHEN** 產生第三輪
- **THEN** 第三輪的 `seenSignatures` MUST NOT 包含第一輪那場的簽章
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重複比對基準只取上一輪，不累積更早的回合」

#### Scenario: 簽章基準以字串陣列保存並在分配前轉為 Set

- **WHEN** 檢視回合物件的 `seenSignatures`
- **THEN** 三個欄位皆為字串陣列，`JSON.stringify` 後再 `JSON.parse` 內容不變
- **AND** 傳給 `allocateRound()` 的 `seenSignatures` 三個欄位皆為 `Set`
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「簽章基準以字串陣列保存，呼叫 allocateRound 前轉為 Set」

---

### Requirement: 休息次數於產生新一輪時結算

`prd.md` 5.3 規定休息者「於本輪結束後休息次數 +1」。本 capability SHALL 把「本輪結束」定義為**產生新一輪的那一刻**：產生新回合時，MUST 先對**上一輪休息名單**中的每位參賽者 `restCount + 1`，再以新回合取代目前回合。

此累加與回合取代 MUST 在**同一次狀態轉換**內完成，SHALL NOT 拆成兩個可各自失敗的步驟——拆開後若第二步失敗，上一輪仍是目前回合而休息次數已加過，下次再產生就會重複累加，出場輪轉的公平性被靜默破壞。

暫停出場（`isActive === false`）者不在休息名單內（`match-allocation` 已保證），因此 MUST NOT 因本輪休息而累加（`prd.md` 4.1.2）。

「重設／重排未完成場次」SHALL NOT 觸發結算——本輪尚未結束。

實作位於 `nextjs-pickball/lib/matchmaker/round.ts` 與 `nextjs-pickball/hooks/useRoundStore.ts`。

#### Scenario: 產生新一輪時上一輪休息者的休息次數加 1

- **GIVEN** 上一輪的休息名單為 C 與 D，兩人 `restCount` 皆為 `2`
- **WHEN** 產生新一輪
- **THEN** C 與 D 的 `restCount` 皆變為 `3`
- **AND** 上一輪出場者的 `restCount` 不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「產生新一輪時上一輪休息者的 restCount 加 1，出場者不變」

#### Scenario: 產生首輪時不結算任何人

- **GIVEN** 目前沒有回合
- **WHEN** 產生本輪對戰
- **THEN** 沒有任何參賽者的 `restCount` 被更動
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「產生首輪時不結算任何人的 restCount」

#### Scenario: 同一輪的休息名單只結算一次

- **GIVEN** 第 1 輪的休息者為 C
- **WHEN** 連續產生第 2 輪與第 3 輪
- **THEN** C 因第 1 輪而增加的 `restCount` MUST 恰為 1（第 3 輪結算的是第 2 輪的休息名單，不是第 1 輪的）
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「連續產生多輪時同一輪的休息名單只被結算一次」

#### Scenario: 暫停出場者不因本輪休息而累加

- **GIVEN** 名單中有 `isActive === false` 的成員
- **WHEN** 產生新一輪並結算上一輪
- **THEN** 該成員的 `restCount` 不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「暫停出場者不因本輪休息而累加 restCount」

#### Scenario: 重排未完成場次不觸發休息結算

- **GIVEN** 目前回合仍有 `pending` 場次
- **WHEN** 呼叫重排未完成場次
- **THEN** 沒有任何參賽者的 `restCount` 被更動
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排未完成場次不觸發休息結算」

---

### Requirement: 重設與重排未完成場次

系統 SHALL 只在**目前回合存在且至少有一個 `pending` 場次**時，允許「重設／再排」或「重排未完成」（`prd.md` 6.2）。不符合條件時 MUST 回傳可判讀的拒絕結果，SHALL NOT 拋出例外，也 SHALL NOT 產生新回合。

重排 MUST 保留：

- 所有 `completed` 場次，含最終比分、勝方、完成時間與各員賽前／賽後分數（Elo 更新結果不得被撤銷或重算）。
- 所有 `scoring` 場次（已開始計分者不屬「尚未比賽」）。
- 回合編號、建立時間、對戰方式與目標分數。

重排的候選池 MUST 為**本輪尚未比賽者**——即 `pending` 場次的球員與本輪休息名單成員的聯集，並重新套用 `match-allocation` 的完整優先序。已在 `completed` 或 `scoring` 場次中的球員 MUST 被排除，其佔用的場地也 MUST 被排除於可重排的場地數之外。只在 `pending` 場次的球員之間洗牌是不夠的：主持人按下重排最常見的動機正是有人臨時離場或加入，若休息名單成員永遠進不來，重排解決不了那個問題（見 design Decision 5）。

重排 MUST 沿用原回合與前一輪的重複比對基準，並把**被丟棄的原始 `pending` 組合**併入本回合的 `seenSignatures`（`prd.md` 5.6 明列「重設前的原始對戰組合」為需記錄的項目）——否則重排極可能原封不動地重現同一組合，操作等同無效。

實作位於 `nextjs-pickball/lib/matchmaker/round.ts`。

#### Scenario: 沒有回合或沒有未開始場次時不可重排

- **WHEN** 目前沒有回合，或目前回合的所有場次皆為 `completed`
- **THEN** 重排 MUST 被拒絕並回傳繁體中文訊息，SHALL NOT 拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「沒有回合或沒有 pending 場次時重排被拒絕」

#### Scenario: 重排保留已完成場次的比分與評分結果

- **GIVEN** 目前回合有一場 `completed`（比分 11:7）與一場 `pending`
- **WHEN** 重排未完成場次
- **THEN** 該 `completed` 場次的 `scores`、`winner`、`completedAt` 與 `playerRatings` 完全不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排保留已完成場次的比分、勝方與賽前賽後分數」

#### Scenario: 重排的候選池含休息名單成員但排除已比賽者

- **GIVEN** 目前回合有一場 `completed`（球員 A、B）、一場 `pending`（球員 C、D），休息名單為 E（`restCount` 最高）
- **WHEN** 重排未完成場次
- **THEN** A 與 B MUST NOT 出現在重排後的任何場次
- **AND** E MUST 依「休息次數多者優先」進入重排後的出場名單
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排的候選池含休息名單成員，已比賽者不再納入」

#### Scenario: 重排沿用原回合與前一輪的重複比對基準

- **GIVEN** 目前回合的 `seenSignatures` 含前一輪的組合
- **WHEN** 重排未完成場次
- **THEN** 重排時使用的基準 MUST 包含那些既有簽章，SHALL NOT 從空基準重新開始
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排沿用原回合與前一輪的重複比對基準」

#### Scenario: 被丟棄的原始組合併入本回合基準

- **GIVEN** 目前回合有一場 `pending` 場次的組合為 X
- **WHEN** 重排未完成場次
- **THEN** 重排後回合的 `seenSignatures` MUST 包含組合 X 的簽章
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排把被丟棄的原始組合併入本回合基準」

#### Scenario: 重排不改變回合編號與該輪設定

- **GIVEN** 目前回合為第 2 輪、雙打、目標分數 15
- **WHEN** 重排未完成場次
- **THEN** `roundNumber`、`createdAt`、`format` 與 `targetScore` 皆不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排不改變回合編號、建立時間、對戰方式與目標分數」

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

**計算與寫入的位置依儲存模式而定**（`user-data-sync`「前端依 session 選擇儲存模式」）：

- **本機模式**：前端以核心套件的純函式 `submitScore` 計算，`useLocalRoundStore` 依序套用新回合、歷史與名單（既有行為不變）。
- **雲端模式**：**後端為權威**。前端 SHALL NOT 自行寫入評分、回合完成狀態或歷史，MUST 改呼叫 `POST /api/matchmaker/round/matches/:matchId/score`（見「回合與送出比分的雲端 API」）；
  後端以**同一個**核心純函式 `submitScore`（完成時間取伺服器時間）計算，並以**單一 D1 batch** 寫入四位（單打兩位）球員的 `rating` 與 `gamesPlayed`、新回合、一筆歷史，
  並刪除該場的計分板分槽。原子性由 `user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」保證：回合版本、每位參與球員的版本任一不符時整批不寫入。
  平局語意（`winner: "draw"`、`S = 0.5`）由同一個純函式產生，後端 SHALL NOT 另寫判定。

實作位於 `packages/pickball-core/src/matchmaker/round.ts`（純函式）與 `hono-pickball/src/matchmaker/score-repository.ts`（雲端模式的 batch）。

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

#### Scenario: 雲端送出比分在單一 batch 內寫入評分、回合與歷史並清除分槽

- **GIVEN** 已登入；雲端名單有四位、目前回合（version 3）有一場 `pending` 雙打 `m1`，`m1` 有分槽
- **WHEN** 以 `{ scoreA: "11", scoreB: "7", roundVersion: 3 }` 呼叫送出比分
- **THEN** 回 200；回應的回合 version 為 4 且 `m1` 為 `completed`；四位球員的 `rating` 與核心 `submitScore` 以相同輸入計算的結果相同、`gamesPlayed` 各 +1、version 各 +1；
  `matchmaker_history` 新增恰好一筆 `matchId` 為 `m1` 的紀錄；`m1` 的分槽已刪除
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「送出比分在單一 batch 內更新評分、回合與歷史並刪除該場分槽」

#### Scenario: 雲端計時回合平局完整保留 draw 語意

- **GIVEN** 已登入；目前回合為計時回合，`m1` 為 `pending` 單打
- **WHEN** 以 `{ scoreA: "9", scoreB: "9" }` 送出
- **THEN** 回 200；回合中 `m1.winner` 與新歷史的 `winner` 皆為 `"draw"`；兩位球員的賽後分數等於核心 `updateRatings` 以 `"draw"` 計算的結果
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「計時回合的平局在雲端送出後 winner 為 draw 且評分以 S 等於 0.5 計算」

#### Scenario: 回合版本不符時整批不寫入

- **GIVEN** 已登入；目前回合 version 為 3
- **WHEN** 以 `roundVersion: 2` 送出比分
- **THEN** 回 409 `VERSION_CONFLICT`；名單、回合、歷史、分槽四者皆與送出前逐列相同
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「roundVersion 不符時回 409 且名單、回合、歷史與分槽皆不變」

#### Scenario: 參與球員的版本在計算後被改動時整批不寫入

- **GIVEN** 已登入；目前回合與四位球員皆已讀出（repository 層以注入的「讀後鉤子」模擬：計算完成、batch 送出前，其中一位球員被另一個請求更新，version 由 1 變 2）
- **WHEN** repository 送出 batch
- **THEN** 結果為版本衝突；四位球員（含被改動者的新值）、回合、歷史、分槽皆不含本次送出的任何寫入
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「計算後任一參與球員版本變動時整批守衛使 batch 不寫入任何資料」

#### Scenario: 回合在計算後被刪除時整批不寫入

- **GIVEN** 同上，但讀後鉤子改為以重置刪除該使用者的回合
- **WHEN** repository 送出 batch
- **THEN** 結果為版本衝突；`matchmaker_history` 與 `matchmaker_players` 皆不含本次送出的任何寫入
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「計算後回合被刪除時整批守衛使 batch 不寫入任何資料」

### Requirement: 回合與歷史的持久化與損壞降級

**本機模式**（訪客或 session 未就緒，`user-data-sync`「前端依 session 選擇儲存模式」）下，系統 SHALL 將目前回合保存於 LocalStorage key `matchmaker:round:v1`、歷史賽果保存於 `matchmaker:history:v1`，並在重新整理後還原（`prd.md` 9.1）。
雲端模式下回合與歷史的保存見「登入時回合與場次分槽以雲端為準」，`useRemoteRoundStore` SHALL NOT 讀寫這兩個 key。
兩個 key 的名稱 MUST 由單一來源匯出，SHALL NOT 於各檔各自寫死字串——重置範圍是以列舉 key 實作的，key 名稱多一處來源就多一處漏改而導致重置漏清的風險。

`hasLocalStorage()` 的 SSR／私密模式防護 MUST 比照 `nextjs-pickball/lib/matchmaker/storage.ts` 既有模式；LocalStorage 不可用或寫入超出配額時 SHALL NOT 拋出例外中斷操作（`prd.md` 第 11 節）。

損壞資料的降級策略 MUST 依資料形狀分開處理：

- **回合**是單一物件，任何一處損壞都無法只救一部分——JSON 解析失敗、外層結構不合法或 `version` 不符時 MUST 清除該 key 並回傳「無目前回合」。
- **歷史**是多筆各自獨立的紀錄，MUST 採**逐筆降級**：外層合法時保留可通過驗證者、丟棄不合法者、回報丟棄筆數，並把清理後的結果寫回使損壞不再累積；外層 JSON 解析失敗或 `version` 不符時才整份清除。這與 `player-roster` 對名單的處理同理——歷史是活動累積的資料，因單筆損壞而清空整份的損失不成比例。

丟棄筆數大於 0 時 SHALL 對外回報，SHALL NOT 靜默處理。

外層容器的 `version` MUST 為字面量 `1`，SHALL NOT 使用開放的 `z.number()`（沿用 `player-roster` 的同一理由：開放型別會讓未來的 v2 結構通過外層驗證再整批落空）。

實作位於 `nextjs-pickball/lib/matchmaker/round-storage.ts`、`nextjs-pickball/lib/matchmaker/storage-keys.ts` 與 `nextjs-pickball/hooks/useRoundStore.ts`（`useLocalRoundStore`）。

#### Scenario: 重整後還原目前回合與歷史

- **GIVEN** 已產生一個回合並完成一場對戰
- **WHEN** 重新讀取持久化資料
- **THEN** 回合內容與歷史筆數與寫入前相同
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「重新掛載後還原目前回合與歷史」

#### Scenario: 回合資料 JSON 解析失敗時清除並回傳無回合

- **GIVEN** `matchmaker:round:v1` 的內容為 `"{ 不是合法 JSON"`
- **WHEN** 呼叫 `readRound()`
- **THEN** 回傳無目前回合，且該 key 已被移除
- **驗收**：`nextjs-pickball/lib/matchmaker/round-storage.test.ts`，it 名稱「回合 JSON 解析失敗時清除 key 並回傳無回合」

#### Scenario: 回合外層結構或版本不符時整份清除

- **GIVEN** `matchmaker:round:v1` 的內容為 `{ version: 2, round: {...合法回合} }`
- **WHEN** 呼叫 `readRound()`
- **THEN** 回傳無目前回合，且該 key 已被移除
- **AND** 內容為合法 JSON 但非預期結構（如 `[1, 2, 3]`）時結果相同
- **驗收**：`nextjs-pickball/lib/matchmaker/round-storage.test.ts`，it 名稱「回合外層結構或 version 不符時整份清除」

#### Scenario: 歷史單筆損壞時保留其餘紀錄

- **GIVEN** `matchmaker:history:v1` 含 3 筆，其中 1 筆缺少 `winner`
- **WHEN** 呼叫 `readHistory()`
- **THEN** 回傳另外 2 筆，`droppedCount` 為 `1`，且 key **不被清除**
- **AND** 回寫後再次讀取時，MUST 同時斷言筆數與內容仍為那 2 筆，SHALL NOT 只斷言 `droppedCount` 為 0——回寫時把歷史整個寫丟的 `droppedCount` 同樣是 0，只驗它會讓該 regression 溜過
- **驗收**：`nextjs-pickball/lib/matchmaker/round-storage.test.ts`，it 名稱「歷史單筆損壞時保留其餘 2 筆並回報 droppedCount 為 1」

#### Scenario: 歷史外層版本不符時整份清除

- **GIVEN** `matchmaker:history:v1` 的內容為 `{ version: 2, entries: [三筆合法紀錄] }`
- **WHEN** 呼叫 `readHistory()`
- **THEN** 回傳空歷史、`droppedCount` 為 `0`，且該 key 已被移除
- **AND** SHALL NOT 走逐筆降級路徑
- **驗收**：`nextjs-pickball/lib/matchmaker/round-storage.test.ts`，it 名稱「歷史 version 不符時整份清除，不走逐筆降級」

#### Scenario: LocalStorage 不可用或寫入超出配額時不拋出例外

- **GIVEN** `window.localStorage` 的存取會拋出例外，或 `setItem` 拋出 `QuotaExceededError`
- **WHEN** 呼叫 `readRound()`、`writeRound()`、`readHistory()` 與 `writeHistory()`
- **THEN** 四者皆不拋出，讀取回傳空結果，寫入靜默失敗且不中斷呼叫端
- **驗收**：`nextjs-pickball/lib/matchmaker/round-storage.test.ts`，it 名稱「localStorage 不可用或寫入超出配額時不拋出例外」

#### Scenario: 三個 LocalStorage key 名稱由單一來源匯出

- **WHEN** 讀取 key 常數
- **THEN** 名單、回合與歷史的 key 分別為 `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`
- **AND** 三者 MUST 由同一個模組匯出，SHALL NOT 在其他檔案重複寫死同樣的字串
- **驗收**：`nextjs-pickball/lib/matchmaker/round-storage.test.ts`，it 名稱「三個 LocalStorage key 名稱由 storage-keys 單一來源匯出」

#### Scenario: 雲端模式不寫入本機回合與歷史

- **GIVEN** mock `useSession` 為已登入，`GET /api/matchmaker/round` 回 `{ data: null, version: 0 }`
- **WHEN** `useRoundStore()` mount 後產生一輪對戰
- **THEN** `matchmaker:round:v1` 與 `matchmaker:history:v1` 皆不存在；`PUT /api/matchmaker/round` 被呼叫一次
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「雲端模式下產生對戰不寫入本機回合與歷史」

---

### Requirement: 無參賽者與人數不足時的邊界行為

可用人數不足以組成任何場次時，系統 MUST 拒絕建立回合，回傳**可判讀的失敗結果**（具名錯誤代碼與繁體中文訊息，說明可採取的修正方式），SHALL NOT 拋出例外、SHALL NOT 建立一個沒有任何場次的空回合、也 SHALL NOT 破壞既有的目前回合（`prd.md` 第 11 節）。

涵蓋的邊界：

- 名單為空（含「重置後沒有任何參賽者」）。
- 單打可用人數 < 2；雙打可用人數 < 4。
- 全部參賽者皆暫停出場（可用人數為 0）。

「全員暫停」與「名單為空」MUST 給出**不同**的訊息：兩者的修正方式完全不同（前者要恢復出場、後者要新增參賽者），共用一句話會讓使用者對著滿滿一頁參賽者被告知「請先新增參賽者」。

場地數超出 1～8 或非整數時，`match-allocation` 已定義為輸入錯誤並拋出。本 capability MUST 接住該例外並轉為同一種可判讀的失敗結果，SHALL NOT 讓例外穿透到 UI 層。

實作位於 `nextjs-pickball/lib/matchmaker/round.ts`。

#### Scenario: 名單為空時不建立回合

- **GIVEN** 名單為空陣列（例如剛完成重置）
- **WHEN** 產生本輪對戰
- **THEN** 回傳失敗結果，訊息提示先新增參賽者，SHALL NOT 拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「名單為空時不建立回合並提示新增參賽者」

#### Scenario: 可用人數不足以組成任何場次時不建立回合

- **WHEN** 單打且可用人數為 `1`
- **THEN** 回傳失敗結果，SHALL NOT 建立沒有場次的空回合
- **AND** 雙打且可用人數為 `3` 時結果相同
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「單打不足 2 人或雙打不足 4 人時不建立回合」

#### Scenario: 全員暫停出場時給出專屬訊息

- **GIVEN** 名單有 6 位成員但全部 `isActive === false`
- **WHEN** 產生本輪對戰
- **THEN** 回傳失敗結果，且訊息 MUST 與「名單為空」不同，提示恢復出場狀態
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「全員暫停出場時的訊息與名單為空時不同」

#### Scenario: 產生失敗時既有的目前回合不受影響

- **GIVEN** 目前已有第 2 輪回合，隨後所有參賽者被設為暫停
- **WHEN** 產生本輪對戰而失敗
- **THEN** 目前回合仍為原本的第 2 輪，內容完全不變
- **AND** 沒有任何參賽者的 `restCount` 被結算
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「產生失敗時既有回合與 restCount 皆不受影響」

#### Scenario: 場地數不合法時轉為可判讀的失敗結果

- **WHEN** 以場地數 `0`、`9` 或 `1.5` 產生本輪對戰
- **THEN** MUST 回傳失敗結果而非讓 `allocateRound()` 的例外穿透
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「場地數不合法時接住例外並轉為失敗結果」

### Requirement: 計分板結果的自動回填共用送出 pipeline

系統 SHALL 於使用者回到對戰頁時，把該輪中已判定勝負的計分板進度自動回填為該場的最終比分。回填 MUST 呼叫**與手動輸入完全相同的送出比分入口**（驗證 → 評分更新 → 寫入歷史 → 標示完成 → 記錄完成時間），SHALL NOT 另寫一條平行的寫入路徑——`prd.md` 6.3 明訂兩種完成方式「產生相同的後續結果」，兩條路徑各自實作必然在評分四捨五入、歷史欄位或完成時間的其中一處分岔，而分岔後的歷史紀錄無法事後辨識是由哪條路徑寫入的。

判定與轉換 MUST 抽為純函式（`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`），輸入為目前回合與計分板槽集合，輸出為「待送出清單」；實際送出仍由回合模組的既有入口執行。此分工使「回填與手動輸入結果一致」能以單元測試逐欄比對，而非只能靠 E2E 目視。

**回填條件**（三者皆成立才列入待送出清單）：

1. 該 `matchId` 的計分板槽存在且 `status === "finished"`。
2. 該 `matchId` 仍存在於目前回合的對戰清單中。
3. 該場次**尚未完成**。

已完成的場次 MUST 被略過，SHALL NOT 重複送出——重複送出會二次更新評分，使一場比賽對雙方 rating 造成兩倍變動，且歷史會出現兩筆同一場的紀錄（`prd.md` 6.5）。回填必須是**冪等**的：同一組回合與槽集合連續呼叫兩次，第二次的待送出清單 MUST 為空。

比分轉換 MUST 使用與計分板入口相同的隊伍對應（第一隊 ⟷ `us`、第二隊 ⟷ `them`，見 `match-stage` capability）。

回填成功後，該場次的計分板槽 MUST 被清除——保留已回填的槽會讓下一次回到對戰頁時再度命中條件 1，只靠條件 3 擋著；一旦回合資料因任何原因重建，就會發生重複送出。

#### Scenario: 回填與手動輸入產生逐欄相同的結果

- **GIVEN** 同一個回合與同一場次，比分為 11-7（第一隊勝）
- **WHEN** 分別以「手動輸入 11 與 7 後送出」與「該場計分板 `status === "finished"`、`scores` 為 `{ us: 11, them: 7 }` 後回到對戰頁」兩條路徑各跑一次
- **THEN** 兩者產生的回合物件與歷史紀錄逐欄相同（比分、勝方、賽前分數、賽後分數、對戰方式、雙打組成標示皆一致），僅完成時間可因取用時刻不同而相異
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「回填與手動輸入的送出結果逐欄相同」

#### Scenario: 只回填已判定勝負且尚未完成的場次

- **GIVEN** 該輪三場：`m1` 的槽為 `finished`、`m2` 的槽為 `playing`、`m3` 無槽
- **WHEN** 計算待送出清單
- **THEN** 清單只含 `m1`，`m2` 與 `m3` 皆不在其中
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「只有 finished 的槽才進入待送出清單」

#### Scenario: 已完成場次不重複送出

- **GIVEN** `m1` 的槽為 `finished`，且 `m1` 在回合中已標示為已完成
- **WHEN** 計算待送出清單
- **THEN** 清單為空；連續呼叫兩次的結果皆為空
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「已完成的場次不重複送出且連續呼叫為冪等」

#### Scenario: 槽對應的場次已不在回合中時略過

- **GIVEN** `scoreboard:matches:v1` 有 `gone` 的 `finished` 條目，但目前回合的對戰清單不含 `gone`
- **WHEN** 計算待送出清單
- **THEN** 清單不含 `gone`，且不拋錯
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「槽對應的場次已不在回合中時略過且不拋錯」

#### Scenario: 回填後清除該場次的計分板槽

- **GIVEN** `m1` 的槽為 `finished` 且該場尚未完成
- **WHEN** 完成回填送出
- **THEN** `scoreboard:matches:v1` 內 `m1` 的條目被移除，其他場次的條目不受影響
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」

#### Scenario: E2E 由計分板完成一場並回填

- **GIVEN** 目前回合為 11 分制，場地 1 尚未完成
- **WHEN** 使用者進入場地 1 的計分板連續得分至 11-0、按「返回對戰」
- **THEN** 對戰頁的場地 1 顯示最終比分 11-0、勝方為第一隊、樣式為已完成，且該場不再提供「進入計分板」入口
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」

### Requirement: 開始計分後鎖定本輪目標分數

本輪的目標分數（11／15／21）SHALL 於「產生本輪對戰」時決定、同一輪所有場地共用；**該輪一旦有任一場次開始計分即 MUST 不可更改**（`prd.md` 6.3.1）。

「已開始計分」MUST 判定為下列任一成立：

- 該輪任一場次已完成（不論比分來自手動輸入或計分板）。
- 該輪任一場次的計分板槽存在且 `status !== "setup"`。

槽存在但仍為 `"setup"`（使用者點進計分板卻一球未打）SHALL NOT 視為已開始——否則誤觸一次入口就永久鎖死該輪的分制，而使用者沒有任何解除手段。

鎖定生效時，UI 的目標分數控制項 MUST 以原生 `disabled` 表達，且變更目標分數的行為 MUST 被忽略（不只是視覺上停用）；同時 MUST 顯示繁體中文說明鎖定原因（形如「本輪已開始計分，目標分數不可更改」），SHALL NOT 只停用而不解釋——沉默的 disabled 會被讀成功能故障（`prd.md` §11：錯誤訊息需說明可採取的修正方式）。

判定 MUST 抽為純函式（`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`），輸入為目前回合與計分板槽集合，輸出為布林值與鎖定原因。此純函式是鎖定與否的**唯一來源**：對戰頁的目標分數選擇器 MUST 委派它（見 `match-stage` capability 的「目標分數選擇器」Requirement，該 Requirement 於本 change 一併 MODIFIED，把鎖定條件由「目前回合存在即鎖」放寬為本 Requirement 的判定），SHALL NOT 在元件內另判一次。

未鎖定時實際變更目標分數 MUST 經由本 capability 既有的 `setTargetScore(round, n)`（見「目標分數為每輪設定」Requirement）。本判定與該入口的拒絕條件 MUST **方向一致**：該入口以場次 `status`（`scoring`／`completed`）判定，本判定另納入計分板槽的狀態，因此差集只可能出現在一個方向——「槽已離開 `"setup"` 但場次 `status` 仍為 `pending`」時本判定已鎖、該入口仍會接受；UI 在本判定回報已鎖時 SHALL NOT 呼叫該入口，而該入口的拒絕仍是最後一道防線。相反方向（該入口拒絕但本判定未鎖）SHALL NOT 出現。

本段**不**為場次 `status` 新增任何轉換規則：「進行中」由計分板槽表達（`status !== "setup"`），場次的 `"scoring"` 值仍如 M4 所載由後續 milestone 定義其產生時機。若實作為了對戰頁呈現而讓場次進入 `"scoring"`，該值 MUST 同時被納入本判定的第一條，否則兩處會對同一個狀態給出相反答案。

#### Scenario: 尚未開始計分時可更改目標分數

- **GIVEN** 該輪所有場次皆未完成，且沒有任何計分板槽
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳未鎖定，UI 的目標分數控制項為 enabled
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「無任何場次完成且無計分板槽時目標分數未鎖定」

#### Scenario: 有場次的計分板已開打時鎖定

- **GIVEN** 該輪某場次的計分板槽為 `status === "playing"`
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳已鎖定
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「任一場次的計分板槽非 setup 時目標分數鎖定」

#### Scenario: 槽存在但一球未打時不鎖定

- **GIVEN** 該輪某場次的計分板槽存在但 `status === "setup"`、比分 0-0，且無任何場次已完成
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳未鎖定
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「槽存在但仍為 setup 時不視為已開始計分」

#### Scenario: 手動輸入完成一場後亦鎖定

- **GIVEN** 該輪沒有任何計分板槽，但已有一場以手動輸入完成
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳已鎖定
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「已有場次完成時目標分數鎖定，不論比分來源」

#### Scenario: 鎖定時 UI 停用並說明原因

- **GIVEN** 該輪已有場次開始計分
- **WHEN** 檢視對戰頁的目標分數控制項
- **THEN** 控制項為原生 `disabled`，且畫面顯示繁體中文說明「本輪已開始計分，目標分數不可更改」
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「本輪開始計分後目標分數控制項停用並說明原因」

### Requirement: 重排本輪或重置名單時清除對應計分板進度

重排本輪（`resetIncompleteMatches` 丟棄未完成場次）或重置名單時，系統 MUST 一併清除對應場次在 `scoreboard:matches:v1` 的條目。

此清除是 `scoreboard` capability「該 `matchId` 有條目 ⟺ 綁定有效」不變式的維持者：不清除的話，使用者從舊分頁或書籤回到 `/scoreboard?match=<舊 id>` 會看到一個仍可計分、但分數永遠回填不到任何地方的計分板，而畫面上沒有任何跡象顯示它已成孤兒。孤兒條目同時會無界累積在 LocalStorage 中（`prd.md` §11：LocalStorage 寫入超出配額）。

重設本輪時 MUST **只**清除被重排掉的未完成場次的條目，已完成場次的比分、評分結果與歷史紀錄 SHALL NOT 被影響（`prd.md` 6.2）。清除 SHALL NOT 觸碰 `scoreboard:current:v1`——獨立計分板的進度與回合無關，一併清掉會讓使用者正在進行的個人比賽無故歸零。

「重置名單」的清除範圍不由本 capability 列舉：它是 `player-roster` capability「重置名單與二次確認」Requirement 的**列舉 key 清單**，該 Requirement 於本 change 一併 MODIFIED，把 `scoreboard:matches:v1` 納入清單。本 capability SHALL NOT 另行列舉一份 key 清單——同一個 `resetMatchmakerData()` 只能有一個清除範圍的定義處，兩處各列一次的失敗模式是沉默的（重置看起來成功了，殘留的槽要到使用者從舊連結回到計分板時才顯現）。

#### Scenario: 重設本輪清除未完成場次的計分板槽

- **GIVEN** 該輪 `m1` 已完成、`m2` 未完成且有計分板槽
- **WHEN** 使用者重設／重排本輪
- **THEN** `m2` 的條目被移除；`m1` 的比分、評分結果與歷史紀錄不變；`scoreboard:current:v1` 不被觸碰
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「重設本輪只清除未完成場次的槽且不動獨立槽」

#### Scenario: 回到已失效場次的計分板時顯示說明

- **GIVEN** 使用者於場地 2 的計分板計到 5-2，另一個分頁重設了本輪
- **WHEN** 使用者回到該計分板分頁並重新整理
- **THEN** 顯示繁體中文說明（該輪已重設或該場次已被刪除）與「回到對戰頁」「改用獨立計分板」兩個出口，SHALL NOT 顯示技術錯誤碼
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「重設本輪後回到舊計分板連結顯示失效說明」

#### Scenario: 重置名單清除全部計分板槽

- **GIVEN** 該輪有多個場次的計分板槽
- **WHEN** 使用者於參賽者頁確認「重置名單」（清除全部參賽者、目前回合與歷史賽果）
- **THEN** `scoreboard:matches:v1` 的全部條目被清除；`scoreboard:current:v1` 不被觸碰
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「重置名單清除全部場次槽但保留獨立槽」

### Requirement: 臨時換人（球員與休息名單互換）

系統 SHALL 提供純函式 `swapMatchPlayer(round, matchId, outPlayerId, inPlayerId, players)`
（`nextjs-pickball/lib/matchmaker/round.ts`），把某場尚未開始的場次中一位在場球員換成該輪
休息名單中的另一位球員（`prd.md` 6.3：「主持人可能……臨時換人代打」）。回傳值為與既有
`SetTargetScoreResult`／`ResetIncompleteMatchesResult` 同形的 discriminated union：
`{ ok: true; round: Round } | { ok: false; code; message }`。

換人 MUST 同時滿足下列全部前置條件，任一不成立即拒絕並回傳可判讀的失敗結果，SHALL NOT
拋出例外、SHALL NOT 修改原回合：

- `matchId` 對應的場次 MUST 存在於該回合。
- 該場次的 `status` MUST 為 `"pending"`——已完成或已開始計分的場次 SHALL NOT 被換人
  （已完成場次的結果不可回溯更動；已開始計分者換人會讓正在進行的實體比賽與資料脫節）。
- `outPlayerId` MUST 為該場次目前兩隊任一隊伍 `playerIds` 的成員。
- `inPlayerId` MUST 存在於該輪的 `restingPlayerIds`。
- `inPlayerId` 於 `players` 中解析出的球員 MUST `isActive === true`——休息名單成員可能在
  換人當下已被使用者於名單頁切換為暫停出場（`player-roster` 的出場狀態切換與本輪休息名單
  是兩個獨立時刻的資料，換人操作 MUST 以當下狀態為準）。

換人成功時，系統 MUST 依序完成：

1. **替換球員**：`outPlayerId` 所在隊伍的 `playerIds` 中，`outPlayerId` MUST 被
   `inPlayerId` 取代，隊伍內其餘成員與另一隊伍的組成完全不變。
2. **重算該隊隊伍分數**：換人後該隊的 `rating` MUST 為該隊全體成員（換人後）`rating` 的
   總和，經 `nextjs-pickball/lib/matchmaker/rating-math.ts` 的 `roundRating` 正規化——
   與 `match-allocation` 建隊時的既有算法一致（`pairing.ts` 的 `buildTeam`：單打隊伍為
   該員 rating、雙打隊伍為兩人 rating 總和），本 Requirement SHALL NOT 另訂一套計算方式。
3. **雙打場次重算組成標示**：若該場次為雙打，`doublesComposition` MUST 以換人後兩隊共四位
   球員重新呼叫 `nextjs-pickball/lib/matchmaker/pairing.ts` 已匯出的
   `labelDoublesComposition`，SHALL NOT 沿用換人前的標示、也 SHALL NOT 另寫一套判定邏輯。
   若四位球員中有任一位無法從 `players` 解析（已被移除），MUST 沿用換人前的
   `doublesComposition` 值——`labelDoublesComposition` 的簽章要求四位皆為已解析的
   `Player`，不接受部分輸入。
4. **休息名單互換**：`outPlayerId` MUST 加入 `restingPlayerIds`，`inPlayerId` MUST 自
   `restingPlayerIds` 移除。

換人 SHALL NOT 影響下列欄位：

- **`restCount`**：休息次數只在「產生新一輪」時結算（見「休息次數於產生新一輪時結算」
  Requirement）；本輪內的臨時換人不是「本輪結束」，`restCount` 的加總留給下一輪產生時
  自然正確地反映這段期間誰實際休息了較久。
- **`seenSignatures`**：重複比對基準只在「產生本輪對戰」與「重排本輪」時建立或更新
  （見對應 Requirement）；本輪內換人不重建基準——換人是對已產生對戰的局部修正，不是重新
  分配，若把換後的新組合也計入基準，會讓「這一場沒發生過的組合」被誤記為已發生。
- 該場次以外的其餘場次、休息名單以外的其餘欄位、回合編號、建立時間、對戰方式、目標分數。

實作位於 `nextjs-pickball/lib/matchmaker/round.ts`。

#### Scenario: 換人成功時替換該場次的在場球員

- **GIVEN** 某場 `pending` 場次的第一隊含球員 A，該輪休息名單含 active 球員 C
- **WHEN** 以 `outPlayerId = A`、`inPlayerId = C` 呼叫 `swapMatchPlayer`
- **THEN** 回傳 `ok: true`，該場第一隊的 `playerIds` 以 C 取代 A，其餘成員與第二隊不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「換人成功時以休息名單球員取代該場的在場球員」

#### Scenario: 單打場次換人後重算隊伍分數

- **GIVEN** 單打場次，換入球員 C 的 rating 為 `5.5`
- **WHEN** 換人成功
- **THEN** 該隊 `rating` 更新為 `5.5`（`roundRating` 正規化後）
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「單打場次換人後重算該隊隊伍分數為換入球員的 rating」

#### Scenario: 雙打場次換人後重算隊伍分數

- **GIVEN** 雙打場次，該隊留任隊員 rating 為 `4.20`，換入球員 rating 為 `3.10`
- **WHEN** 換人成功
- **THEN** 該隊 `rating` 更新為 `roundRating(4.20 + 3.10)`
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「雙打場次換人後重算該隊隊伍分數為兩位隊員 rating 總和」

#### Scenario: 雙打場次換人後重算組成標示

- **GIVEN** 雙打場次換人前為混雙，換人後兩隊四位球員的性別皆為男性
- **WHEN** 換人成功
- **THEN** `doublesComposition` 更新為男雙，SHALL NOT 沿用換人前的混雙標示
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「雙打場次換人後以換人後四位球員重新判定組成標示」

#### Scenario: 換人後休息名單互換

- **GIVEN** 換人前 `restingPlayerIds` 含 C，不含 A
- **WHEN** 以 `outPlayerId = A`、`inPlayerId = C` 換人成功
- **THEN** 換人後 `restingPlayerIds` 含 A、不含 C
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「換人後換出者進入休息名單、換入者自休息名單移除」

#### Scenario: 換人不影響休息次數與重複比對基準

- **GIVEN** 換人前的 `restCount`（於 `players` 中）與 `round.seenSignatures`
- **WHEN** 換人成功
- **THEN** 換人不修改任何 `Player` 物件（`restCount` 由呼叫端的名單狀態決定，本函式不回傳
  任何名單 patch），且回傳回合的 `seenSignatures` 與換人前完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「換人不影響 restCount 與 seenSignatures」

#### Scenario: 有隊友已從名單移除時組成標示維持原值

- **GIVEN** 雙打場次的另一隊有一位球員的 id 已不存在於 `players`（已被移除但仍留在該場次）
- **WHEN** 換人成功
- **THEN** `doublesComposition` MUST 維持換人前的值，SHALL NOT 拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「雙打場次有隊友已從名單移除時組成標示維持換人前的值」

#### Scenario: 場次不存在時拒絕換人

- **WHEN** 以不存在於該回合的 `matchId` 呼叫 `swapMatchPlayer`
- **THEN** 回傳 `ok: false`，錯誤代碼為場次不存在，原回合不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「matchId 不存在於該回合時拒絕換人」

#### Scenario: 場次非 pending 時拒絕換人

- **GIVEN** 該場次 `status` 為 `"completed"`
- **WHEN** 呼叫 `swapMatchPlayer`
- **THEN** 回傳 `ok: false`，原回合不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「場次非 pending 時拒絕換人」

#### Scenario: outPlayerId 不在該場時拒絕換人

- **GIVEN** `outPlayerId` 不是該場次任一隊伍 `playerIds` 的成員
- **WHEN** 呼叫 `swapMatchPlayer`
- **THEN** 回傳 `ok: false`，原回合不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「outPlayerId 不在該場次的任一隊伍時拒絕換人」

#### Scenario: inPlayerId 不在休息名單時拒絕換人

- **GIVEN** `inPlayerId` 不存在於該輪的 `restingPlayerIds`（例如該員本來就在場上）
- **WHEN** 呼叫 `swapMatchPlayer`
- **THEN** 回傳 `ok: false`，原回合不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「inPlayerId 不在該輪休息名單時拒絕換人」

#### Scenario: inPlayerId 非 active 時拒絕換人

- **GIVEN** `inPlayerId` 存在於 `restingPlayerIds`，但於 `players` 中解析出的 `isActive` 為 `false`
- **WHEN** 呼叫 `swapMatchPlayer`
- **THEN** 回傳 `ok: false`，原回合不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「inPlayerId 存在於休息名單但非 active 時拒絕換人」

### Requirement: 回合計時器

系統 SHALL 提供「本輪計時」設定：選項為不計時、10、15、20 分鐘，預設 MUST 為不計時
（`Round.timer` 為 `null`）。計時設定與目標分數同屬**每輪設定**，於「產生本輪對戰」時決定，
並沿用與目標分數**完全相同**的鎖定條件——SHALL NOT 另立第二個「是否已開始計分」判定。
鎖定判定 MUST 委派既有的 `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的
`isTargetScoreLocked`（該輪任一場次已完成，或任一計分板槽的 `status !== "setup"` 時鎖定；
判定條件見「開始計分後鎖定本輪目標分數」Requirement），SHALL NOT 於本 capability 另寫一個
結構相同的判定函式。

尚未鎖定時，變更計時設定 MUST 委派純函式 `setTimerDuration(round, durationMinutes)`
（`nextjs-pickball/lib/matchmaker/round.ts`），SHALL NOT 在 UI 層直接改寫回合物件；鎖定條件
與 `setTargetScore` 相同（該輪所有場次仍為 `pending` 時才允許）。變更計時長度 MUST 產生一個
**全新**的 `timer` 物件（`startedAt` 重置為 `null`）——變更長度代表使用者想要一段新的倒數，
沿用舊的 `startedAt` 會讓剩餘時間依新長度立即重新計算，等同於在使用者不知情的情況下悄悄跳秒。

「開始計時」操作 MUST 委派純函式 `startTimer(round, now)`：本輪已設定計時長度
（`timer !== null`）且尚未開始（`timer.startedAt === null`）時，寫入 `startedAt` 為呼叫當下
時間；本輪尚未設定計時長度、或已經開始計時，MUST 拒絕並回傳可判讀的失敗結果，SHALL NOT
拋出例外。本操作 SHALL NOT 依賴「是否已開始計分」的鎖定判定——開始計時與比分無關，主持人
可能在任何一場開打前就先啟動倒數。

倒數與時間到的判定 MUST 抽為純函式（`nextjs-pickball/lib/matchmaker/round-timer.ts`：
`remainingSeconds(timer, nowIso)`、`isExpired(timer, nowIso)`、`formatRemaining(seconds)`），
「現在時間」一律由呼叫端以 ISO 字串注入，本模組 SHALL NOT 呼叫 `new Date()` 或 `Date.now()`
——高頻率（每秒）呼叫端才能各自決定何時取樣，且同一組輸入必須產生同一份輸出以利測試。
時間到（剩餘秒數為 `0`）時 MUST NOT 自動結束任何場次或變更任何場次狀態——時間到只是提示，
勝負仍由主持人送出比分決定，`round-lifecycle` 既有的完成流程不變。

「重排未完成場次」SHALL NOT 重置計時：`timer` 隨其餘未變動的欄位原樣保留。「產生本輪對戰」
（含產生下一輪）MUST 一律產生一個全新的 `timer`（`startedAt` 為 `null`），不沿用上一輪的
計時狀態——即使兩輪選擇了相同的 `durationMinutes`，倒數也必須從頭開始。

實作位於 `nextjs-pickball/lib/matchmaker/round-types.ts`（schema）、
`nextjs-pickball/lib/matchmaker/round-settings.ts`（每輪設定的預設值）、
`nextjs-pickball/lib/matchmaker/round.ts`（狀態轉換）與
`nextjs-pickball/lib/matchmaker/round-timer.ts`（倒數與時間到的純函式判定）。

#### Scenario: 計時長度僅接受 10、15、20 分鐘

- **WHEN** `durationMinutes` 為 `10`、`15` 或 `20`
- **THEN** 驗證通過
- **AND** 為 `5`、`30` 或 `0` 時驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/round-types.test.ts`，it 名稱「計時長度僅接受 10、15、20 分鐘」

#### Scenario: 每輪設定預設為不計時

- **WHEN** 建立一組全新的本輪設定
- **THEN** `timerDurationMinutes` 為 `null`（不計時）
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「每輪設定預設計時為不計時」

#### Scenario: 產生本輪時依設定決定計時長度

- **WHEN** 以 `timerDurationMinutes: 15` 產生本輪對戰
- **THEN** 回合的 `timer` 為 `{ durationMinutes: 15, startedAt: null }`
- **AND** 未指定或為 `null` 時 `timer` 為 `null`
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「產生本輪時依設定決定計時長度，未指定時 timer 為 null」

#### Scenario: 尚未開始計分時可更改計時設定，已開始後拒絕

- **GIVEN** 目前回合的所有場次皆為 `pending`
- **WHEN** 呼叫 `setTimerDuration(round, 20)`
- **THEN** 回傳的回合 `timer` 為 `{ durationMinutes: 20, startedAt: null }`（即使變更前已開始計時，變更後 `startedAt` 亦重置為 `null`）
- **AND** 若該輪已有任一場次為 `scoring` 或 `completed`，MUST 拒絕更改並回傳繁體中文訊息，原回合 SHALL NOT 被修改
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「所有場次皆為 pending 時可改計時設定並重置為未開始，已有場次離開 pending 時拒絕」

#### Scenario: 開始計時寫入 startedAt

- **GIVEN** 目前回合的 `timer` 為 `{ durationMinutes: 10, startedAt: null }`
- **WHEN** 呼叫 `startTimer(round, "2026-09-03T01:00:00.000Z")`
- **THEN** 回傳的回合 `timer.startedAt` 為 `"2026-09-03T01:00:00.000Z"`，`durationMinutes` 不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「已設定計時長度且尚未開始時，開始計時寫入 startedAt」

#### Scenario: 未設定計時或計時已開始時拒絕再次開始

- **WHEN** 目前回合的 `timer` 為 `null`，或 `timer.startedAt` 已有值
- **THEN** 呼叫 `startTimer` 皆被拒絕並回傳可判讀的失敗結果，SHALL NOT 拋出例外，原回合 SHALL NOT 被修改
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「未設定計時長度或計時已開始時拒絕再次開始並回傳可判讀訊息」

#### Scenario: 剩餘秒數依經過時間遞減且不為負

- **GIVEN** `timer` 為 `{ durationMinutes: 10, startedAt: "2026-09-03T01:00:00.000Z" }`
- **WHEN** 分別以開始後 30 秒與開始後 11 分鐘的時間呼叫 `remainingSeconds`
- **THEN** 前者回傳 `570`，後者回傳 `0`（不為負數）
- **驗收**：`nextjs-pickball/lib/matchmaker/round-timer.test.ts`，it 名稱「剩餘秒數依經過時間遞減，超過設定長度後夾在 0 不為負數」

#### Scenario: 剩餘秒數格式化為兩位數的 mm:ss

- **WHEN** 分別以 `596` 秒與 `0` 秒呼叫 `formatRemaining`
- **THEN** 回傳 `"09:56"` 與 `"00:00"`
- **驗收**：`nextjs-pickball/lib/matchmaker/round-timer.test.ts`，it 名稱「剩餘秒數格式化為兩位數的 mm:ss」

#### Scenario: remainingSeconds 與 isExpired 為純函式，不修改輸入

- **WHEN** 以 `structuredClone` 留底後呼叫 `remainingSeconds` 與 `isExpired`
- **THEN** 呼叫後 `timer` 物件與呼叫前深層比對完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/round-timer.test.ts`，it 名稱「remainingSeconds 與 isExpired 皆為純函式，不修改輸入的 timer」

#### Scenario: useRoundTimer 每秒更新剩餘秒數並在到期時回報 expired

- **GIVEN** `timer` 為 `{ durationMinutes: 10, startedAt: <目前時間> }`
- **WHEN** 以 `vi.useFakeTimers()` 前進 30 秒
- **THEN** hook 回傳的 `remainingSeconds` 已較初始值遞減，`expired` 為 `false`
- **AND** 再前進至超過 10 分鐘後，`expired` 為 `true`
- **驗收**：`nextjs-pickball/hooks/useRoundTimer.test.ts`，it 名稱「每秒更新剩餘秒數，超過設定長度後 expired 回傳 true」

#### Scenario: 重排未完成場次不重置計時

- **GIVEN** 目前回合的 `timer` 為 `{ durationMinutes: 15, startedAt: "2026-09-03T01:00:00.000Z" }`，且有 `pending` 場次
- **WHEN** 重排未完成場次
- **THEN** 重排後回合的 `timer` 與重排前完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排未完成場次不重置計時」

#### Scenario: 開始計時後重新掛載仍保留已開始的計時進度

- **GIVEN** 已產生回合並呼叫 `startTimer` 後，`round.timer.startedAt` 已寫入且已持久化
- **WHEN** 重新掛載 `useRoundStore`（模擬重新整理頁面）
- **THEN** 還原後的 `round.timer` 與寫入前完全相同，`startedAt` 不被重置——倒數的經過時間由 `remainingSeconds` 依 `startedAt` 與目前時間即時算出，不需要額外的續跑狀態
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「重新掛載後仍保留已開始計時的 timer，startedAt 不被重置」

#### Scenario: 產生新一輪時一律產生全新的 timer

- **GIVEN** 目前回合的 `timer` 為 `{ durationMinutes: 10, startedAt: "2026-09-03T01:00:00.000Z" }`
- **WHEN** 以相同的 `timerDurationMinutes: 10` 產生新一輪
- **THEN** 新回合的 `timer` 為 `{ durationMinutes: 10, startedAt: null }`
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「產生新一輪時即使沿用相同計時長度，timer 仍重新起算且 startedAt 為 null」

### Requirement: 回合與送出比分的雲端 API

後端 SHALL 於 `/api/matchmaker/*` sub-app（B6，`localAuth`＋`requireSession`）提供下列端點，授權、停用閘門與錯誤碼依 `user-data-sync`；所有 SQL MUST 帶 `user_id = c.var.user.id`：

| 端點 | 契約 |
|---|---|
| `GET /api/matchmaker/round` | 單筆契約：`{ data: Round \| null, version }` |
| `PUT /api/matchmaker/round` | 單筆契約，`data` 以核心 `RoundSchema` 驗證；另加下列「完成狀態不可經 PUT 改變」與「分槽清理」規則 |
| `GET /api/matchmaker/slots` | 多筆契約的列出：`{ items: [{ data: ScoreboardState, version }] }`，依 `match_id` 遞增排列 |
| `GET /api/matchmaker/slots/:matchId` | 單筆讀取：`{ data: ScoreboardState \| null, version }`（不存在時 `null`／`0`） |
| `PUT /api/matchmaker/slots/:matchId` | 多筆契約的建立或更新；`data.matchId` MUST 等於 `:matchId`；建立（version 0）的前置條件：該場次存在於目前回合且尚未 `completed`，否則 409 |
| `POST /api/matchmaker/round/matches/:matchId/score` | body `{ scoreA: string, scoreB: string, roundVersion: 正整數 }`；見下 |

分槽不提供批次附加與 DELETE（多筆契約的子集）：分槽的刪除一律由伺服器在回合 PUT、送出比分與重置的 batch 內完成。

**完成狀態不可經 PUT 改變**：`PUT /api/matchmaker/round` MUST 同時滿足兩個方向的規則：

1. **正向（新資料 → 目前回合）**：`data` 中每一場 `status` 為 `completed` 的場次，MUST 在雲端目前回合中存在同 id、且內容完全相同的已完成場次——場次只能經送出比分端點完成（後端權威），否則評分與歷史不會被寫入。
2. **反向（目前回合 → 新資料）**：雲端目前回合中每一場 `status` 為 `completed` 的場次，`data` 中**每一場**與其同 id 的場次 MUST 仍為 `completed` 且內容完全相同（`data` 含重複 id 時逐場檢查，不只看第一場）——已完成的場次不得經 PUT 回到未完成（`pending` 或 `scoring`）而被重新計分。
   同 id 的場次完全不出現在 `data` 中時不受此限：產生新一輪時以場次 id 全新的回合整輪替換、前一輪的已完成場次整個消失，是合法操作；只移除部分已完成場次同樣不受此限。

依下述判定順序，違反任一方向時回 `400 INVALID_BODY`，且 SHALL NOT 送出 batch（回合、分槽與版本下限皆不變）。「內容完全相同」的比較不受 JSON 鍵順序影響。

**判定順序**：先檢查正向規則（不論版本）；反向規則只在讀出的目前回合存在、且其 version 等於請求的 `version` 時檢查；兩者皆通過（或反向規則因版本不符而不檢查）時，才送出帶版本條件的 batch。
通過正向規則的版本不符請求，因此一律由帶版本條件的寫入判為 409，不會因反向規則先得到 400——停在舊回合的裝置（另一裝置已對其仍顯示為未完成的場次送出比分）得到 409 並整份重新載入，而不是被拒絕後停在舊狀態。
比對以讀出的目前回合為準，寫入本身是帶版本條件的單一陳述式（更新為 `UPDATE … WHERE version = <請求的 version>`，建立為 `INSERT … ON CONFLICT DO NOTHING`）：比對後回合若已被改動，寫入影響 0 列而回 409；反向規則只在版本相符時檢查，所以它比對的正是該寫入要取代的那一版。

**分槽清理**：`PUT /api/matchmaker/round` 的寫入與「刪除該使用者所有 `match_id` 不屬於（寫入後的）目前回合中**未完成**場次的分槽」MUST 在同一個 batch 內；
刪除條件 MUST 以資料庫中的回合內容推導（`json_each(matchmaker_round.data, '$.matches')`），使「分槽只存在於目前回合的未完成場次」這個不變式由伺服器維護，
不論該次 PUT 成功或因版本不符而未寫入都成立（`round-lifecycle`「重排本輪或重置名單時清除對應計分板進度」在雲端模式的實現）。
同一個 batch MUST 在回合寫入之後、分槽刪除之前，以與刪除**相同的條件**提高版本下限（`user-data-sync`「刪除後重建的使用者資料版本不得重複」），因此該 batch 為三條陳述式；
下限陳述式放在回合寫入之後，才能以寫入後的回合判定哪些分槽將被刪除。

**送出比分**：

1. 讀出目前回合與該使用者全部參賽者；回合不存在或 `version !== roundVersion` 時回 409。
2. 以核心 `submitScore({ round, players, matchId, rawScoreA: scoreA, rawScoreB: scoreB, now: 伺服器時間 })` 計算。
   失敗碼為 `empty-field`、`invalid-number`、`negative-score`、`tie` 時回 `400 INVALID_BODY`；`match-not-found`、`already-completed`、`scoring-failed` 時回 409。
3. 以**單一 batch** 依序：整批守衛（回合 version 等於 `roundVersion`，且每位被更新球員的 version 等於步驟 1 讀到的值）→ 插入歷史 → 更新回合（version + 1）→ 逐一更新被更新球員（`rating`、`gamesPlayed`，version + 1）→ 提高版本下限（該場分槽的 version；`user-data-sync`「刪除後重建的使用者資料版本不得重複」）→ 刪除該場分槽 → 刪除守衛列。
   守衛失敗或 `matchmaker_history` 主鍵衝突時回 409，資料不變。
4. 成功回 `200 { round: { data, version }, players: [{ data, version }]（僅被更新者）, historyEntry, boundaryHits }`。

`POST /api/matchmaker/reset` 的 batch MUST 刪除該使用者在 `matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots`、`matchmaker_history` 四張表的列；
該 batch 的第一條 MUST 先以 `matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots` 中該使用者列的最大 version 提高版本下限（`user-data-sync`「刪除後重建的使用者資料版本不得重複」）。

請求與回應的 schema 由核心套件 `@pickball/core/api/round` 匯出，前後端共用。

#### Scenario: auth 停用時回合、分槽與送出比分端點回 404

- **WHEN** 以 auth 停用且無 DB binding 的 env 呼叫本 Requirement 表中六個端點
- **THEN** 六者逐一回 404
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404」

#### Scenario: 未登入時回合、分槽與送出比分端點回 401

- **WHEN** 未帶 session 呼叫六個端點
- **THEN** 六者逐一回 `401 { "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「未登入呼叫回合、分槽與送出比分端點皆回 401」

#### Scenario: 他人的回合與分槽不可見也不可改

- **GIVEN** 使用者 A 有回合（version 1）與 `m1` 的分槽
- **WHEN** 使用者 B 呼叫 `GET /round`、`GET /slots`、`GET /slots/m1`，並以 version 1 PUT 回合與 `m1` 的分槽
- **THEN** B 的三個 GET 為空（`null`／空清單）；B 的分槽 PUT 回 409（`m1` 不在 B 的回合中）；B 的回合 PUT（version 1）回 409；A 的回合與分槽不變
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「B 看不到也改不到 A 的回合與分槽」

#### Scenario: 他人無法對本人的場次送出比分

- **GIVEN** 使用者 A 的回合（version 1）有 `pending` 的 `m1`
- **WHEN** 使用者 B 以 `roundVersion: 1` 對 `m1` 送出比分
- **THEN** 回 409；A 的名單、回合、歷史皆不變
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「B 對 A 的場次送出比分回 409 且 A 的資料不變」

#### Scenario: 回合的單筆版本化讀寫

- **WHEN** 依序 GET（無資料）、以 version 0 PUT、以 version 1 PUT、再以 version 1 PUT
- **THEN** 依序得到 `{ data: null, version: 0 }`、`{ version: 1 }`、`{ version: 2 }`、409
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合依單筆契約建立、更新並在版本不符時回 409」

#### Scenario: 回合 PUT 不得改變場次的完成狀態

- **GIVEN** 雲端回合中 `m1` 為 `pending`、`m2` 為 `completed`
- **WHEN** 分別 PUT「把 `m1` 改為 `completed`」與「把 `m2` 的比分改掉」的回合
- **THEN** 兩者皆回 400 `INVALID_BODY`；雲端回合不變
- **AND** 以 version 0 建立一個含 `completed` 場次的回合同樣回 400
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 改變場次完成狀態或已完成場次內容時回 400」

#### Scenario: 回合 PUT 把已完成場次改回未完成時回 400 且不寫入

- **GIVEN** 雲端回合（version 1）中 `m1` 為 `pending`、`m2` 為 `completed`、`m3` 為 `pending`，`m1` 與 `m3` 各有分槽
- **WHEN** 以 version 1 分別 PUT「`m1`、改為 `pending` 的 `m2`（移除 `m3`）」「`m1`、改為 `scoring` 的 `m2`、`m3`」與「`m1`、內容相同的已完成 `m2`、再一場同 id 但為 `pending` 的 `m2`、`m3`」的回合
- **THEN** 三者皆回 400 `INVALID_BODY`
- **AND** 雲端回合仍為原內容與 version 1；`m1` 與 `m3` 的分槽皆保留；該使用者沒有版本下限列（未送出 batch）
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 把已完成場次改回未完成時回 400 且不寫入」

#### Scenario: 回合 PUT 在多場已完成場次中只把其中一場改回未完成時仍回 400

- **GIVEN** 雲端回合（version 1）中 `m0` 為 `completed`、`m1` 為 `pending`、`m2` 為 `completed`
- **WHEN** 以 version 1 PUT「內容相同的已完成 `m0`、`m1`、改為 `pending` 的 `m2`」的回合
- **THEN** 回 400 `INVALID_BODY`，雲端回合仍為原內容與 version 1
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 在多場已完成場次中只把其中一場改回未完成時仍回 400」

#### Scenario: 回合 PUT 整輪替換（前一輪完成場次不出現在新資料）時接受

- **GIVEN** 雲端回合（version 1）中 `m1` 為 `pending`（有分槽）、`m2` 為 `completed`
- **WHEN** 以 version 1 PUT 只含全新場次 `n1`、`n2` 的下一輪回合
- **THEN** 回 200 且 version 為 2，`GET /round` 取回新回合；`m1` 的分槽已被清除
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 整輪替換時前一輪的已完成場次可不出現在新資料」

#### Scenario: 回合 PUT 只移除部分已完成場次時接受

- **GIVEN** 雲端回合（version 1）中 `m1`、`m2` 為 `completed`，`m3` 為 `pending`
- **WHEN** 以 version 1 PUT 只含「內容相同的已完成 `m2`」與「同 id 但改到 2 號場地的 `pending` `m3`」的回合（`m1` 不出現）
- **THEN** 回 200 且 version 為 2，`GET /round` 取回該回合
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 只移除部分已完成場次時接受」

#### Scenario: 版本過期的回合 PUT 以 409 優先於反向完成狀態檢查

- **GIVEN** 雲端回合為 version 2，其中 `m1` 為 `pending`、`m2` 為 `completed`（另一裝置已送出 `m2` 的比分）
- **WHEN** 停在 version 1 的裝置以 version 1 PUT 一個 `m2` 仍為 `pending` 的回合；另以 version 0 與 version 3 各 PUT 同一個回合
- **THEN** 三者皆回 409 `VERSION_CONFLICT`（不是 400）
- **AND** 雲端回合仍為原內容與 version 2
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「版本過期的回合 PUT 把已完成場次改回未完成時回 409 而非 400」

#### Scenario: 回合 PUT 在同一 batch 內清除不屬於新回合的分槽

- **GIVEN** 雲端回合有 `m1`、`m2`，兩者皆有分槽
- **WHEN** PUT 一個只含 `m1` 與新場次 `m3` 的回合（重排）
- **THEN** `m1` 的分槽保留、`m2` 的分槽已刪除
- **AND** 以過期 version PUT（回 409）時，分槽清單仍與雲端目前回合一致
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 刪除不屬於新回合的分槽且衝突時分槽仍與雲端回合一致」

#### Scenario: 分槽只能為目前回合的未完成場次建立

- **GIVEN** 雲端回合有 `pending` 的 `m1` 與 `completed` 的 `m2`
- **WHEN** 分別以 version 0 PUT `m1`、`m2` 與不存在的 `m9` 的分槽
- **THEN** `m1` 回 200 且 version 為 1；`m2` 與 `m9` 回 409 且未寫入
- **驗收**：`hono-pickball/test/matchmaker-slots.test.ts`，it 名稱「分槽只能為目前回合中未完成的場次建立」

#### Scenario: 分槽的逐筆版本化更新與讀取

- **GIVEN** `m1` 的分槽 version 為 1
- **WHEN** 以 version 1 PUT 新比分、再以 version 1 PUT，最後 `GET /slots/m1` 與 `GET /slots`
- **THEN** 第一次回 version 2、第二次回 409；兩個 GET 皆回 version 2 的資料；`GET /slots` 依 `match_id` 遞增排列
- **驗收**：`hono-pickball/test/matchmaker-slots.test.ts`，it 名稱「分槽依版本更新並可單筆或整份讀取」

#### Scenario: 不合法的分槽寫入

- **WHEN** PUT 的 `data.matchId` 與 path 不同、`data.matchId` 為 `null`、或 `data` 不合 `ScoreboardState`
- **THEN** 三者皆回 400 `INVALID_BODY`
- **驗收**：`hono-pickball/test/matchmaker-slots.test.ts`，it 名稱「分槽的 matchId 與 path 不一致或資料不合法時回 400」

#### Scenario: 比分格式錯誤回 400、場次狀態不符回 409

- **WHEN** 分別以空字串、非數字、負數、非計時回合的同分、不存在的場次、已完成的場次送出比分
- **THEN** 前四者回 400 `INVALID_BODY`，後二者回 409 `VERSION_CONFLICT`；六者皆不寫入任何資料
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「送出比分的格式錯誤回 400、場次不存在或已完成回 409，且皆不寫入」

#### Scenario: 同一場次重複送出只寫入一筆歷史

- **GIVEN** `m1` 已以 version 3 送出成功（回合變為 version 4）
- **WHEN** 以 `roundVersion: 4` 再次對 `m1` 送出
- **THEN** 回 409；`matchmaker_history` 中 `m1` 仍只有一筆，四位球員的 `gamesPlayed` 只加過一次
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「同一場次重複送出時回 409 且歷史只有一筆」

#### Scenario: 重置刪除名單、回合、分槽與歷史

- **GIVEN** 使用者在四張表皆有資料；另一位使用者也有資料
- **WHEN** 呼叫 `POST /api/matchmaker/reset`
- **THEN** 回 204；本人四張表皆為空；另一位使用者的資料不變
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「重置在同一 batch 內刪除本人的名單、回合、分槽與歷史」

#### Scenario: 共用的回合與送出比分 schema

- **WHEN** 以 `SubmitScoreRequestSchema` 解析「`roundVersion` 為 0」「缺 `scoreB`」「合法輸入」
- **THEN** 只有合法輸入通過
- **驗收**：`packages/pickball-core/test/api/round.test.ts`，it 名稱「SubmitScoreRequestSchema 要求兩個比分字串與正整數 roundVersion」

#### Scenario: 回合雲端 API：回合 PUT 以單一 batch 寫入、提高下限並清除分槽

- **WHEN** 以記錄 `batch()` 呼叫的 D1 替身注入 env，以 `version: 0` 建立回合後，再以同一個（已過期的）body PUT 一次
- **THEN** 前者回 200、後者回 409；兩次各只送出一次 `batch()`，各含三條陳述式（回合寫入、提高版本下限、清除分槽）
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出」（既有 it，斷言由 `[2, 2]` 改為 `[3, 3]`）

### Requirement: 登入時回合與場次分槽以雲端為準

`useRoundStore(options)` SHALL 為選擇器：`resolveStorageMode(useSession())` 為 `"remote"` 時回傳 `hooks/useRemoteRoundStore.ts` 的結果，否則回傳本機實作
`useLocalRoundStore`（同檔，函式本體與本 change 前的 `useRoundStore` 相同）。回傳物件 MUST 保留既有的 `round`、`history`、`droppedCount` 與七個操作（簽章不變），另加：

- `syncStatus: SyncStatus`（本機模式恆為 `"local"`）。
- `remoteMatchSlots: Record<string, ScoreboardState> | null`：雲端模式為雲端目前回合的分槽；本機模式恆為 `null`（呼叫端沿用既有的 `readMatchSlots()`）。

`UseRoundStoreOptions` 加入 `applyRemotePlayers: (items: { data: Player; version: number }[]) => void` 與 `reloadRemotePlayers: () => void`（皆由 `useRosterStore` 提供，見 `player-roster`）。

雲端實作 `useRemoteRoundStore({ enabled, players, updatePlayer, applyRemotePlayers, reloadRemotePlayers, onUnauthorized })` MUST：

1. `enabled` 由 false 變 true 時同時 `GET /api/matchmaker/round` 與 `GET /api/matchmaker/slots`（`loading`）；兩者皆成功後以回應取代狀態（`synced`），SHALL NOT 立即寫回。任一失敗為 `load-failed`，之後所有操作 MUST 不送出請求、不改變狀態。
2. `history` 恆為空陣列、`droppedCount` 恆為 0（歷史的讀取上雲屬 B8）。
3. 回合變更操作（`generateRound`、`resetIncompleteMatches`、`setTargetScore`、`setTimerDuration`、`startTimer`、`swapMatchPlayer`）MUST 以既有純函式在目前顯示的回合上計算並**同步**回傳結果；
   成功時樂觀更新畫面，並把「對回合套用此操作」的**命令**排入命令佇列（`lib/sync/round-command-queue.ts`），SHALL NOT 直接排入計算好的回合資料。
4. 命令佇列 MUST 單一在途、先進先出；送出時以**最新已確認的雲端回合**重新套用命令（連續的回合變更命令合併為一次 `PUT /api/matchmaker/round`，帶已確認的 version）——
   因此送出比分回應中的回合不會被其後排隊的回合 PUT 以舊資料覆蓋。重新套用失敗（例：換人對象已不在休息名單）的命令 MUST 被丟棄。
   `generateRound` 的休息次數結算（`restSettlements`）MUST 在該次回合 PUT 成功後才經 `updatePlayer` 套用；回合 PUT 衝突時丟棄。
5. `submitScore(matchId, rawScoreA, rawScoreB)` MUST 先以核心 `submitScore` 在目前顯示的回合與名單上預先驗證並同步回傳結果；失敗時不排入佇列。
   成功時排入**不合併**的送出命令（同一 `matchId` 已在佇列中時不重複排入），樂觀顯示該場完成；送出時以 `POST /api/matchmaker/round/matches/:matchId/score` 帶已確認的回合 version。
   回應成功後 MUST 以回應的回合取代已確認回合、從 `remoteMatchSlots` 移除該場，並以 `applyRemotePlayers(response.players)` 寫入名單——SHALL NOT 經 `updatePlayer` 逐人 PUT 評分。
6. 任一命令收到 409 → 清空佇列、重新載入回合與分槽、`conflict`，並 MUST 呼叫 `reloadRemotePlayers()`（另一裝置送出比分時評分也已改變）；401 → `onUnauthorized` 並停止；
   `failed` 依 `createLatestWinsSaver` 相同的退避表重試（`retrying`）；`rejected` 停止並回報 `rejected`。
7. 回合 PUT 成功後 MUST 從 `remoteMatchSlots` 移除不屬於新回合的場次（與伺服器 batch 的清理一致）。

對戰頁（`app/matchmaker/page.tsx`）在雲端模式 MUST 以 `remoteMatchSlots` 作為自動回填與目標分數鎖定（`isTargetScoreLocked`）的分槽來源；
自動回填 MUST 呼叫 `submitScore`（同一入口），SHALL NOT 呼叫 `clearMatchSlots`——伺服器已在送出比分的 batch 內刪除該分槽（滿足「計分板結果的自動回填共用送出 pipeline」的「回填成功後清除分槽」）。
`syncStatus` 為 `loading`／`load-failed` 時以 `SyncStatusNotice` 取代主要內容，其餘非 `local` 狀態疊加提示；`local` 時不渲染任何同步元素（與 B6 相同）。

`CourtCard` 在雲端模式導向 `/scoreboard?match=<id>` 前 MUST 先以 `PUT /api/matchmaker/slots/:matchId`（version 0，種子資料沿用 `buildMatchSlotSeed`）建立分槽並等待結果：
成功或 409（分槽已存在）即導向；其他結果 MUST 顯示繁體中文錯誤且不導向。本機模式沿用既有 `ensureMatchSlot`。

回合、分槽與送出比分的請求 MUST 經 `nextjs-pickball/lib/sync/round-api.ts` 的薄包裝（一律經 `requestJson`）。

#### Scenario: 回合 API 包裝的請求形狀

- **WHEN** 分別呼叫回合、分槽與送出比分的包裝函式
- **THEN** `requestJson` 依序收到正確的方法、路徑（`/api/matchmaker/round`、`/api/matchmaker/slots`、`/api/matchmaker/slots/<id>`、`/api/matchmaker/round/matches/<id>/score`）、body 與回應 schema
- **驗收**：`nextjs-pickball/lib/sync/round-api.test.ts`，it 名稱「回合 API 包裝以正確的方法、路徑與 body 呼叫 requestJson」

#### Scenario: 命令佇列單一在途並合併連續的回合變更

- **GIVEN** 一個 PUT 在途
- **WHEN** 依序排入回合變更 A、B 與送出比分 S，之後在途的 PUT 成功
- **THEN** 下一個請求為一次 PUT，其資料為「已確認回合依序套用 A、B」的結果；之後才送出 S
- **驗收**：`nextjs-pickball/lib/sync/round-command-queue.test.ts`，it 名稱「單一在途且連續的回合變更合併為一次 PUT，送出比分不合併」

#### Scenario: 命令以最新已確認回合重新套用

- **GIVEN** 佇列為 [送出比分 S（`m1`）, 回合變更 T（改計時長度）]
- **WHEN** S 成功，回應的回合中 `m1` 為 `completed`
- **THEN** T 的 PUT 資料以該回應回合為基礎（`m1` 仍為 `completed`），version 為回應的 version
- **驗收**：`nextjs-pickball/lib/sync/round-command-queue.test.ts`，it 名稱「排隊中的回合變更以最新已確認回合重新套用，不覆蓋送出比分的結果」

#### Scenario: 命令佇列的失敗分類

- **WHEN** 分別讓請求回 `conflict`、`unauthorized`、`rejected`、`failed`
- **THEN** 前三者清空佇列並各自回報；`failed` 依退避表重試同一請求
- **驗收**：`nextjs-pickball/lib/sync/round-command-queue.test.ts`，it 名稱「衝突、未授權與拒絕時清空佇列，網路失敗時依退避表重試」

#### Scenario: 已登入時改用雲端回合

- **GIVEN** mock `useSession` 為已登入，GET 回合回 version 2 的回合、GET 分槽回一筆
- **WHEN** `useRoundStore()` mount
- **THEN** `round` 為雲端回合、`remoteMatchSlots` 含該分槽、`syncStatus` 為 `synced`、`history` 為空陣列
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「已登入時改用雲端回合並回傳 syncStatus 與雲端分槽」

#### Scenario: 訪客或 session 載入中時走本機回合

- **GIVEN** mock `useSession` 為 `loading` 或訪客
- **WHEN** `useRoundStore()` mount 並產生一輪
- **THEN** `syncStatus` 為 `local`、`remoteMatchSlots` 為 `null`；`matchmaker:round:v1` 有資料；沒有任何 `/api/matchmaker/*` 請求
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「session 載入中或訪客時走本機回合且 syncStatus 為 local」

#### Scenario: 雲端產生對戰後休息次數在回合儲存成功後才結算

- **GIVEN** `enabled: true`，雲端無回合
- **WHEN** `generateRound(...)`，回合 PUT 回 ok
- **THEN** `generateRound` 同步回傳成功並立即顯示新回合；`updatePlayer` 只在 PUT 成功後才以休息次數被呼叫
- **AND** 若 PUT 回 409，`updatePlayer` 不被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「generateRound 樂觀顯示並在回合 PUT 成功後才結算休息次數」

#### Scenario: 雲端送出比分以回應更新回合與名單且不逐人 PUT

- **GIVEN** `enabled: true`，回合 version 3 有 `pending` 的 `m1`
- **WHEN** `submitScore("m1", "11", "7")`，POST 回 200（version 4、四位球員）
- **THEN** 同步回傳 `ok: true`；POST body 為 `{ scoreA: "11", scoreB: "7", roundVersion: 3 }`；`applyRemotePlayers` 以回應的四位被呼叫一次；`updatePlayer` 未被呼叫；沒有任何對 `/api/matchmaker/players` 的 PUT
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「submitScore 以 POST 送出並以回應更新回合與名單，不逐人 PUT 評分」

#### Scenario: 雲端送出比分的預先驗證失敗時不送出

- **WHEN** `submitScore("m1", "", "7")`
- **THEN** 同步回傳 `ok: false`、`code` 為 `empty-field`；沒有任何 POST
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「submitScore 預先驗證失敗時同步回傳錯誤且不送出請求」

#### Scenario: 同一場次重複送出只排入一次

- **WHEN** POST 尚在途時再次 `submitScore("m1", "11", "7")`
- **THEN** POST 只被呼叫一次
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「同一場次的送出在佇列中時不重複排入」

#### Scenario: 雲端回合衝突時整份重新載入

- **WHEN** 回合 PUT 回 409，重新 GET 回另一份回合與分槽
- **THEN** `round` 與 `remoteMatchSlots` 為重新載入的值、`syncStatus` 為 `conflict`、`reloadRemotePlayers` 被呼叫一次；佇列中其餘命令不再送出
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「回合 PUT 或送出比分回 409 時清空佇列、重新載入並回報 conflict」

#### Scenario: 雲端回合載入失敗與 401

- **WHEN** GET 回 500；另一次 mount 時 GET 回 401
- **THEN** 前者 `load-failed` 且之後的操作不送出請求；後者 `onUnauthorized` 被呼叫一次
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「載入失敗時回報 load-failed 且不送出，401 時呼叫 onUnauthorized」

#### Scenario: 停用時不發回合請求

- **WHEN** 以 `enabled: false` mount 並呼叫各操作
- **THEN** fetch 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「enabled 為 false 時不發出任何回合請求」

#### Scenario: 登入後產生的回合由雲端還原且另一裝置看到相同回合

- **GIVEN** 以測試帳號登入、雲端資料已清空，名單有四位
- **WHEN** 在對戰頁產生一輪、等到 `[data-sync-status="synced"]`、重新整理；再以同一 storage state 開另一個 context
- **THEN** 兩者都看到相同的場次組合；本機 `matchmaker:round:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「登入後產生的回合在重新整理與另一個 context 中由雲端還原」

#### Scenario: 登入時經計分板完成的場次寫入雲端並清除分槽

- **GIVEN** 以測試帳號登入，已產生一輪
- **WHEN** 從場地卡進入計分板、打到一方獲勝、回到對戰頁並等到同步完成
- **THEN** 該場顯示為已完成；參賽者頁中勝方的強度高於送出前；`GET /api/matchmaker/slots` 不含該場
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「登入時經計分板完成的場次由雲端寫入評分並清除分槽」

#### Scenario: 另一裝置先送出同一場比分時顯示衝突提示

- **GIVEN** context A 與 B 都已載入同一回合
- **WHEN** A 對 `m1` 送出比分並同步完成，之後 B 也對 `m1` 送出不同比分
- **THEN** B 顯示「資料已在其他裝置更新，已重新載入最新資料」，`m1` 的比分為 A 送出的那個
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「另一裝置先送出同一場比分時顯示衝突提示並載入最新回合」

#### Scenario: 雲端回合載入失敗時對戰頁顯示錯誤

- **GIVEN** 以 `page.route` 讓 `GET /api/matchmaker/round` 回 500
- **WHEN** 開啟 `/matchmaker`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，產生對戰的按鈕不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「雲端回合載入失敗時對戰頁顯示錯誤提示」
