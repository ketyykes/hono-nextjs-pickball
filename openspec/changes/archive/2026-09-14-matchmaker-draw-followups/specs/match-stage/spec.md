# Specification: match-stage

## MODIFIED Requirements

### Requirement: 計時器顯示與時間到提示

對戰頁 SHALL 提供「開始計時」操作入口與倒數顯示，實作為新元件
`nextjs-pickball/components/matchmaker/RoundTimerBanner.tsx`，由
`nextjs-pickball/app/matchmaker/page.tsx` 掛載並傳入 `round?.timer ?? null`。
掛載 SHALL NOT 外包一層「目前回合是否存在」的條件式——該元件自行處理 `timer` 為 `null`
（不計時）與 `startedAt` 為 `null`（尚未開始）兩種早退並回傳 `null`，畫面結果相同；
而外包條件式會在回合有無之間製造 unmount／remount，把「同一次到期只播一次」所倚賴的
`useRef` 旗標清掉。

「開始計時」按鈕 MUST 位於 `RoundControls.tsx` 的計時設定區塊，**僅在**本輪已設定計時長度
（`timer !== null`）且尚未開始（`timer.startedAt === null`）時才顯示且可點擊，點擊 MUST
委派 `round-lifecycle` 的 `startTimer` 入口（經 `hooks/useRoundStore.ts` 接線）。`timer`
為 `null`（不計時）或已開始時，MUST **不顯示**該按鈕，SHALL NOT 顯示一顆恆為 `disabled`
且無說明文字的按鈕——這與目標分數選擇器「`disabled` 必須解釋原因」的精神不同：「開始計時」
是一次性操作而非持續可見的設定，不計時模式下永遠沒有「開始」這個動作可做，顯示一顆說明不出
理由的 `disabled` 按鈕反而製造疑惑。

倒數顯示 MUST 呈現剩餘時間的 `mm:ss`（`nextjs-pickball/lib/matchmaker/round-timer.ts` 的
`formatRemaining`），每秒更新一次，更新來源 MUST 為
`nextjs-pickball/hooks/useRoundTimer.ts`——本 hook 是本 change 唯一以 `setInterval`
持續取樣目前時間的位置，`round-timer.ts` 與其餘元件 SHALL NOT 各自另起計時器或直接讀取
目前時間。`startTimer` 的一次性 `now` 由 `useRoundStore` 注入（比照既有
`generateRound`／`submitScore`），不受本條約束。

倒數期間的畫面更新 SHALL NOT 使用 `aria-live`——每秒宣讀一次剩餘秒數對螢幕報讀器使用者是
干擾而非幫助。時間到（剩餘秒數為 `0`）時 MUST 改為顯示大字「時間到」與繁體中文提示文案
「時間到：領先者勝，同分可直接送出平手」（`nextjs-pickball/lib/matchmaker/labels.ts` 的具名
常數 `ROUND_TIMER_EXPIRED_MESSAGE`），並 MUST 以 `role="alert"` 呈現使讀屏能即時播報。

該提示文案 MUST 與 `round-lifecycle` 目前實際接受的送出行為一致：計時回合的同分**可以直接
送出並永久記為平手**，因此文案 SHALL NOT 要求主持人再加賽（例如「平手請再打一球」）——
再打一球會讓最終送出的比分不再是時間到當下的比分，與計時制的意義相反。文案開頭的
「時間到：」前綴 MUST 保留，既有 E2E 以該子字串定位此區塊。文案中的「平手」二字是句子的一
部分，SHALL NOT 以樣板字串拼接 `DRAW_LABEL`——`DRAW_LABEL` 的語意是「某一場的結果標籤」，
與本句的敘述用字不是同一件事，綁在一起會讓其中一邊改字時意外波及另一邊。

時間到的瞬間 MUST 播放一段由 Web Audio API 產生的短提示音，實作為例外層純瀏覽器 API 呼叫
`nextjs-pickball/lib/matchmaker/round-timer-sound.ts`（無分支決策，比照
`nextjs-pickball/lib/matchmaker/scene-canvas.ts` 的既有分層先例，以 E2E 驗收），SHALL NOT
加入任何音檔資產或第三方音效相依。同一次時間到 MUST 只播放一次，SHALL NOT 隨每次畫面重新
渲染而重複播放。

時間到的視覺呈現 MUST 為**靜態**文字，SHALL NOT 使用任何閃爍或脈動動畫——不製造動畫即完整
滿足「動態效果須尊重使用者的 `prefers-reduced-motion` 偏好」的精神（`prd.md` 12.5），
優於「先加一個動畫、再想辦法在 reduced motion 下關掉」的做法。

時間到 MUST NOT 自動結束任何場次或改變任何場次的 `status`——時間到只是提示，勝負仍由主持人
送出比分決定，`round-lifecycle` 既有的完成流程（手動輸入與計分板回填皆同）不受影響。

#### Scenario: 已設定計時長度且尚未開始時顯示開始計時按鈕

- **GIVEN** 回合已產生，`timer` 為 `{ durationMinutes: 10, startedAt: null }`
- **WHEN** 檢視 `RoundControls` 的計時區塊
- **THEN** 顯示「開始計時」按鈕且未帶 `disabled` 屬性
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「已設定計時長度且尚未開始時顯示可點擊的開始計時按鈕」

#### Scenario: 不計時或已開始時不顯示開始計時按鈕

- **WHEN** `timer` 為 `null`，或 `timer.startedAt` 已有值
- **THEN** 「開始計時」按鈕皆不存在於畫面中
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「不計時或計時已開始時不顯示開始計時按鈕」

#### Scenario: 點擊開始計時委派 startTimer

- **WHEN** 點擊「開始計時」
- **THEN** 注入的 `startTimer` 被呼叫一次
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「點擊開始計時會呼叫注入的 startTimer 一次」

#### Scenario: 倒數期間顯示剩餘時間且每秒遞減

- **GIVEN** `timer` 為 `{ durationMinutes: 10, startedAt: <目前時間> }`
- **WHEN** 經過 30 秒
- **THEN** 畫面顯示的剩餘時間從 `10:00` 遞減
- **驗收**：`nextjs-pickball/components/matchmaker/RoundTimerBanner.test.tsx`，it 名稱「倒數期間顯示 mm:ss 格式的剩餘時間且每秒遞減」

#### Scenario: 時間到顯示大字時間到與繁體中文提示

- **GIVEN** `timer` 已開始，且經過的時間達到 `durationMinutes`
- **WHEN** 檢視倒數顯示
- **THEN** 出現帶 `role="alert"` 的「時間到」大字與 `ROUND_TIMER_EXPIRED_MESSAGE` 文字
- **驗收**：`nextjs-pickball/components/matchmaker/RoundTimerBanner.test.tsx`，it 名稱「時間到時顯示帶 role alert 的時間到大字與繁體中文提示文案」

#### Scenario: 時間到提示文案說明同分可直接送出平手而非再打一球

- **GIVEN** `timer` 已開始，且經過的時間達到 `durationMinutes`
- **WHEN** 讀取 `role="alert"` 區塊內的提示文案文字
- **THEN** 文字含「同分」與「平手」，且不含「再打一球」
- **驗收**：`nextjs-pickball/components/matchmaker/RoundTimerBanner.test.tsx`，it 名稱「時間到提示文案說明同分可直接送出平手而非再打一球」

#### Scenario: 時間到播放提示音且同一次到期只播放一次

- **GIVEN** 注入的音效函式為可計數的假函式
- **WHEN** 計時由未到期轉為到期，且元件因其他狀態變動而重新渲染
- **THEN** 音效函式恰被呼叫一次
- **驗收**：`nextjs-pickball/components/matchmaker/RoundTimerBanner.test.tsx`，it 名稱「時間到時播放提示音，同一次到期不因重新渲染而重複播放」

#### Scenario: 計時到期不自動結束任何場次

- **GIVEN** 已產生一輪 10 分鐘計時的回合並開始計時
- **WHEN** 快轉至計時到期後，檢視各場地的場次狀態
- **THEN** 所有場次的狀態與到期前完全相同，仍可手動送出比分
- **驗收**：`nextjs-pickball/tests/e2e/specs/round-timer.spec.ts`，test 名稱「計時到期不自動結束任何場次，仍可手動送出比分」

#### Scenario: 開始計時後快轉至到期會顯示時間到並觸發一次提示音

- **GIVEN** 已產生一輪 10 分鐘計時的回合
- **WHEN** 點擊「開始計時」並以測試時鐘快轉至到期
- **THEN** 畫面出現帶 `role="alert"` 的「時間到」
- **AND** 已注入的 `AudioContext` 建構呼叫次數恰為 1
- **驗收**：`nextjs-pickball/tests/e2e/specs/round-timer.spec.ts`，test 名稱「開始計時後快轉至到期會顯示時間到並觸發一次提示音」
