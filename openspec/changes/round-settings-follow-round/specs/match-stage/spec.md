# Specification: match-stage

## ADDED Requirements

### Requirement: 本輪設定跟隨目前回合

對戰頁的本輪設定列（對戰方式、場地數、目標分數、計時）顯示的值，與按下「產生本輪對戰」時送出的值 MUST 為同一份設定，
且 MUST 由「目前回合」與「使用者於本次進入對戰頁後變更過的設定」兩者解析而來，SHALL NOT 在每次進入對戰頁時無條件回到預設值——
否則使用者離開對戰頁再回來時，設定列會與舞台上的回合不一致，直接產生下一輪等於靜默改掉賽制、場地數與分制。

解析規則 MUST 由純函式 `nextjs-pickball/lib/matchmaker/round-settings.ts` 的 `resolveRoundSettings(draft, round)` 承載並於該層 TDD，
`draft` 為使用者於本次進入對戰頁後變更過的設定（尚未變更過為 `null`），`round` 為目前回合（不存在為 `null`）：

- **目前回合不存在**：`draft` 不為 `null` 時取 `draft`；否則為一組全新的本輪設定（預設值見「本輪設定控制項的預設值與範圍」）。
- **目前回合存在**：對戰方式與場地數在 `draft` 不為 `null` 時取 `draft` 的值，否則取目前回合的 `format` 與 `courtCount`；
  目標分數 MUST 取目前回合的 `targetScore`，計時 MUST 取目前回合的計時長度（回合為不計時則為不計時），不論 `draft` 為何——
  回合存在時這兩個控制項顯示的本來就是回合的值，且變更委派回合 capability 寫入回合，下一輪 MUST 沿用畫面上看到的值。

頁面層 MUST 以該函式的回傳值同時作為設定列的顯示值與「產生本輪對戰」的輸入，SHALL NOT 另外保存一份會與目前回合分岔的完整設定。
本 Requirement SHALL NOT 新增任何儲存 key：使用者變更過但尚未用來產生回合的設定，在離開對戰頁後即不保留。
訪客模式與登入（雲端回合）模式 MUST 行為一致；雲端回合載入完成前不得以預設值取代回合的設定。

目標分數選擇器的方向鍵導覽 MUST 以畫面上選中的值起算（目前回合存在時即為回合的目標分數），SHALL NOT 以設定物件內的值起算——
與計時控制項的方向鍵導覽一致。

#### Scenario: 回合存在且未變更過設定時取回合的設定

- **GIVEN** 目前回合為雙打、3 個場地、目標分數 21、計時 15 分鐘（尚未開始）
- **AND** 使用者於本次進入對戰頁後尚未變更過設定
- **WHEN** 解析本輪設定
- **THEN** 結果為雙打、3 個場地、目標分數 21、計時 15 分鐘
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「回合存在且未變更過設定時取回合的對戰方式、場地數、目標分數與計時」

#### Scenario: 回合不計時時解析結果為不計時

- **GIVEN** 目前回合的計時為不計時（`timer` 為 `null`）
- **AND** 使用者變更過的設定計時為 10 分鐘
- **WHEN** 解析本輪設定
- **THEN** 結果的計時為不計時
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「回合不計時時解析出的計時為不計時，不論變更過的設定為何」

#### Scenario: 變更過的對戰方式與場地數優先於回合

- **GIVEN** 目前回合為單打、1 個場地、目標分數 21、計時 20 分鐘
- **AND** 使用者變更過的設定為雙打、2 個場地、目標分數 15、不計時
- **WHEN** 解析本輪設定
- **THEN** 結果為雙打、2 個場地、目標分數 21、計時 20 分鐘
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「變更過設定時對戰方式與場地數取變更值，目標分數與計時仍取回合」

#### Scenario: 沒有回合時取變更過的設定或預設值

- **GIVEN** 目前回合不存在
- **WHEN** 使用者尚未變更過設定時解析本輪設定
- **THEN** 結果等於一組全新的本輪設定
- **AND** 使用者變更過的設定為雙打、2 個場地、目標分數 15、計時 10 分鐘時，結果與之相同
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「沒有回合時取變更過的設定，未變更過則為預設值」

#### Scenario: 目標分數方向鍵以畫面選中值起算

- **GIVEN** 目前回合的目標分數為 15、所有場次皆為 `pending` 且沒有計分板槽
- **AND** 傳入元件的設定物件目標分數為 11
- **WHEN** 於目標分數群組按下方向鍵右鍵
- **THEN** 回合 capability 的 `setTargetScore` 被以 `21` 呼叫一次，focus 落在 21
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「目標分數方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」

#### Scenario: E2E 離開對戰頁再回來時設定列與目前回合一致

- **GIVEN** 訪客以雙打、2 個場地、目標分數 15 產生本輪
- **WHEN** 經區段導覽切到「參賽者」再切回「對戰」
- **THEN** 對戰方式「雙打」為選中、減少場地數按鈕可用（場地數為 2）、目標分數 15 為選中
- **AND** 直接按下「產生本輪對戰」後，新一輪仍為 2 個場地
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「離開對戰頁再回來時本輪設定與目前回合一致」

#### Scenario: E2E 回合存在時變更的目標分數與計時沿用到下一輪

- **GIVEN** 訪客以預設設定產生本輪（目標分數 11、不計時），且尚未開始計分
- **WHEN** 在本輪改選目標分數 21 與計時 10 分鐘後按下「產生本輪對戰」
- **THEN** 新一輪的目標分數 21 與計時 10 分鐘為選中，且顯示「開始計時」
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「回合存在時變更的目標分數與計時沿用到下一輪」
