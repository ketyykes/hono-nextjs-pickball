## MODIFIED Requirements

### Requirement: 純函式契約與輸入驗證

評分更新 MUST 為純函式：相同輸入 MUST 產生相同輸出，SHALL NOT 使用亂數、時間或任何 I/O，SHALL NOT 修改傳入的物件或陣列（輸入 MUST 被視為唯讀），SHALL NOT 讀寫 LocalStorage，SHALL NOT 累加 `gamesPlayed` 或 `restCount`。

本 capability SHALL NOT 直接取用 `player-roster` 的 `Player` 型別作為輸入，而 MUST 定義只含 `id`、`rating`、`gamesPlayed` 三個欄位的輸入型別——評分只需要這三項，且 `match-allocation` 的 `Team.rating` 是隊內**總和**，若直接吃 `Team` 極易誤把總和當平均（見 design Decision 2）。`Player` 在結構型別上滿足此輸入型別，消費端仍可直接傳入。

下列情況 MUST 拋出錯誤，SHALL NOT 靜默夾值、補值或忽略（`prd.md` 第 11 節；與 `player-roster` 對 `rating` 的「SHALL NOT 靜默夾值」、`match-allocation` 對場地數的立場一致）：

- 任一隊人數與對戰方式不符（單打每隊非 1 人、雙打每隊非 2 人）。
- 任一球員的 `rating` 超出 1.00～8.00。
- 任一球員的 `gamesPlayed` 為負數或非整數。
- 同一場中出現重複的球員 `id`。

錯誤訊息 MUST 為繁體中文，MUST 說明可採取的修正方式並附上實際輸入值，SHALL NOT 只顯示技術錯誤碼。

評分的**唯一實作**是核心套件的這個純函式：本機模式由前端呼叫、雲端模式由後端的送出比分端點呼叫（經核心 `submitScore`，見 `round-lifecycle`「比分送出的完成流程」）。
後端 SHALL NOT 另寫一份公式、常數或四捨五入規則——兩份實作在 `D`、`K_base`、K 遞減或 clamp 任一處分岔，同一場比賽在登入前後就會得到不同的評分，且無法事後辨識。

實作位於 `packages/pickball-core/src/matchmaker/rating.ts`。

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

#### Scenario: 雲端送出比分的評分與核心純函式逐位一致

- **GIVEN** 已登入；四位球員的 rating 與 `gamesPlayed` 各不相同（含一位 7.98 的觸頂邊界）
- **WHEN** 送出 `11` 比 `3`
- **THEN** 寫入 `matchmaker_players` 的四個 `rating` 與在測試中直接呼叫核心 `submitScore`（相同輸入）得到的 `playerPatches` 逐位相等；回應的 `boundaryHits` 與其相同
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「雲端寫入的評分與核心 submitScore 的結果逐位相等並回報觸界」
