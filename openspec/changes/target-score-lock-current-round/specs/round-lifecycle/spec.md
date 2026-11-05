# Specification: round-lifecycle

## MODIFIED Requirements

### Requirement: 開始計分後鎖定本輪目標分數

本輪的目標分數（11／15／21）SHALL 於「產生本輪對戰」時決定、同一輪所有場地共用；**該輪一旦有任一場次開始計分即 MUST 不可更改**（`prd.md` 6.3.1）。

「已開始計分」MUST 判定為下列任一成立：

- 該輪任一場次已完成（不論比分來自手動輸入或計分板）。
- 該輪任一場次的計分板槽存在且 `status !== "setup"`——「該輪場次的槽」指槽集合中**鍵**（`matchId`）等於目前回合 `matches` 某一場 `id` 的條目。

**不屬於本輪場次的計分板槽 SHALL NOT 計入第二條**，不論其 `status` 為何：例如前一輪打到一半、改用手動送出或直接產生下一輪而殘留的槽，或重排時清除失敗而留下的已丟棄場次的槽。比對 MUST 以槽集合的鍵為準（與「計分板結果的自動回填共用送出 pipeline」的回填條件 2 相同），SHALL NOT 改讀槽內容的 `matchId` 欄位——兩處以不同來源判定「是否屬於本輪」，會對同一個槽給出相反答案。非本輪的槽不可能影響本輪任何場地的分制：本輪場地的計分板入口只以本輪場次 `id` 建立與讀取槽，回填也只認本輪場次；把它計入只會讓新一輪一產生就被鎖死，而使用者在畫面上看不到、也沒有任何手段清除那個殘留的槽。

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

#### Scenario: 前一輪殘留的計分板槽不鎖定新一輪的目標分數

- **GIVEN** 本輪只有 `m1`（`pending`）且 `m1` 沒有計分板槽；槽集合中另有鍵為 `old`（不在本輪）的條目，`status === "playing"`
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳未鎖定，`reason` 為 `null`
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「前一輪殘留的計分板槽不鎖定新一輪的目標分數」

#### Scenario: 本輪場次的槽仍為 setup 時非本輪的 finished 槽不使其鎖定

- **GIVEN** 本輪只有 `m1`（`pending`），`m1` 的槽為 `status === "setup"`；槽集合中另有鍵為 `old`（不在本輪）的條目，`status === "finished"`、比分 11-5
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳未鎖定
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「本輪場次的槽仍為 setup 時非本輪的 finished 槽不使其鎖定」

#### Scenario: 本輪場次的槽已開始時仍鎖定且不受殘留槽影響

- **GIVEN** 本輪有 `m1`、`m2`（皆 `pending`），`m2` 的槽為 `status === "playing"`；槽集合中另有鍵為 `old`（不在本輪）的條目，`status === "playing"`
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳已鎖定，`reason` 為「本輪已開始計分，目標分數不可更改。」
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」

#### Scenario: 以槽集合的鍵判定是否屬於本輪

- **GIVEN** 本輪只有 `m1`（`pending`）
- **WHEN** 槽集合只有鍵為 `old`、內容 `matchId` 欄位為 `"m1"`、`status === "playing"` 的條目時呼叫鎖定判定；以及槽集合只有鍵為 `m1`、內容 `matchId` 欄位為 `"other"`、`status === "playing"` 的條目時呼叫鎖定判定
- **THEN** 前者回傳未鎖定、後者回傳已鎖定
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「鎖定判定以槽集合的鍵比對本輪場次而非槽內容的 matchId」

#### Scenario: E2E 前一輪殘留的計分板進度不鎖定新一輪的設定

- **GIVEN** 訪客模式，目前回合為 11 分制，使用者已進入場地 1 的計分板打了一球後按「返回對戰」，畫面顯示「本輪已開始計分，目標分數不可更改。」
- **WHEN** 使用者不送出該場比分，直接按「產生本輪對戰」產生下一輪
- **THEN** 新一輪的目標分數三顆選項與計時四顆選項皆為 enabled，畫面不顯示「本輪已開始計分，目標分數不可更改。」與「本輪已開始計分，計時設定不可更改。」
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「前一輪殘留的計分板進度不鎖定新一輪的目標分數與計時設定」

#### Scenario: 鎖定時 UI 停用並說明原因

- **GIVEN** 該輪已有場次開始計分
- **WHEN** 檢視對戰頁的目標分數控制項
- **THEN** 控制項為原生 `disabled`，且畫面顯示繁體中文說明「本輪已開始計分，目標分數不可更改」
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「本輪開始計分後目標分數控制項停用並說明原因」

