## ADDED Requirements

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
