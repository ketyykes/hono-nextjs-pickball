## MODIFIED Requirements

### Requirement: 本輪設定控制項的預設值與範圍

對戰頁 SHALL 提供本輪設定控制項：對戰方式、場地數、計時。預設對戰方式 MUST 為單打、預設場地數
MUST 為 1、場地數合法範圍 MUST 為 1～8（含兩端）（`prd.md` 4.2、4.3、13.3）；預設計時 MUST
為不計時。

上述預設值與範圍 MUST 取自 `match-allocation` capability 已匯出的具名常數
（`DEFAULT_FORMAT`、`DEFAULT_COURT_COUNT`、`MIN_COURT_COUNT`、`MAX_COURT_COUNT`），
SHALL NOT 在 UI 層另行寫死——該 capability 的規格已明訂「SHALL 由本 capability 以具名常數
匯出，供上層 UI 取用，SHALL NOT 由 UI 各自寫死」。

場地數的加減與夾值 MUST 由純函式模組 `nextjs-pickball/lib/matchmaker/round-settings.ts`
承載並於該層 TDD。加減按鈕在觸及上下限時 MUST 為 `disabled`，SHALL NOT 讓超界值傳入分配
引擎——引擎對超界 `courtCount` 是拋錯而非夾值，UI 讓它有機會被觸發等於把程式錯誤丟給使用者。

對戰方式 MUST 只有單打與雙打兩個選項，SHALL NOT 出現任何以性別篩選出場人選的模式
（僅混雙／僅男雙／僅女雙），與 `prd.md` 4.2 的產品決策一致。

計時控制項 MUST 提供四個選項（不計時、10、15、20 分鐘），選項清單 MUST 取自
`round-lifecycle` capability 匯出的具名常數（`ROUND_TIMER_DURATION_OPTIONS`），
SHALL NOT 在元件內另寫一份 `[10, 15, 20]` 字面量。計時控制項的**是否鎖定**
MUST 與目標分數選擇器共用同一個判定——`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`
的 `isTargetScoreLocked`（見 `round-lifecycle` capability 的「回合計時器」與「開始計分後
鎖定本輪目標分數」兩個 Requirement），SHALL NOT 在本 capability 為計時另判一次「是否已
開始計分」。鎖定生效時計時控制項 MUST 為 `disabled` 並顯示繁體中文鎖定原因，SHALL NOT
只把控制項變灰而不解釋——與目標分數選擇器的既有精神一致（`prd.md` 12.3）。

#### Scenario: 預設為單打與 1 個場地

- **WHEN** 建立一組全新的本輪設定
- **THEN** 對戰方式為 `DEFAULT_FORMAT`（單打）、場地數為 `DEFAULT_COURT_COUNT`（1）
- **AND** 這兩個值取自 `match-allocation` 匯出的常數而非字面量
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「預設為單打與 1 個場地且取用分配引擎匯出的常數」

#### Scenario: 場地數加減夾在合法範圍內

- **WHEN** 對場地數 8 再加一、或對場地數 1 再減一
- **THEN** 結果仍分別為 8 與 1，且回報「不可再加」／「不可再減」
- **AND** 場地數 4 加一為 5、減一為 3
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「場地數加減夾在 1～8 並回報是否已達邊界」

#### Scenario: 邊界時加減按鈕為 disabled

- **WHEN** 場地數為 1
- **THEN** 減號按鈕帶 `disabled` 屬性、加號按鈕可用
- **AND** 場地數為 8 時加號按鈕帶 `disabled` 屬性、減號按鈕可用
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「場地數為 1 時減號 disabled、為 8 時加號 disabled」

#### Scenario: 對戰方式只有單打與雙打

- **WHEN** 檢視對戰方式控制項的可選項目
- **THEN** 只有「單打」與「雙打」兩個選項，不存在任何性別限定模式
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「對戰方式只提供單打與雙打且無性別限定模式選項」

#### Scenario: 計時選項為不計時／10／15／20 分鐘且預設不計時

- **WHEN** 尚無目前回合時檢視計時控制項
- **THEN** 顯示不計時、10、15、20 分鐘四個選項，`aria-checked="true"` 者為不計時
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「計時選項為不計時／10／15／20 分鐘且預設選中不計時」

#### Scenario: 本輪已開始計分時計時設定鎖定

- **GIVEN** 目前回合的計時為 10 分鐘，且該輪已開始計分（任一場次已完成，或任一計分板槽的 `status !== "setup"`）
- **WHEN** 檢視計時控制項
- **THEN** 四顆選項皆帶 `disabled` 屬性，`aria-checked="true"` 者為 10 分鐘
- **AND** 畫面顯示繁體中文鎖定原因
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「本輪已開始計分時計時控制項 disabled 並顯示鎖定原因」

---

## ADDED Requirements

### Requirement: 計時器顯示與時間到提示

對戰頁 SHALL 提供「開始計時」操作入口與倒數顯示，實作為新元件
`nextjs-pickball/components/matchmaker/RoundTimerBanner.tsx`，由
`nextjs-pickball/app/matchmaker/page.tsx` 掛載（僅在目前回合存在時掛載，並傳入
`round.timer`）。

「開始計時」按鈕 MUST 位於 `RoundControls.tsx` 的計時設定區塊，**僅在**本輪已設定計時長度
（`timer !== null`）且尚未開始（`timer.startedAt === null`）時才顯示且可點擊，點擊 MUST
委派 `round-lifecycle` 的 `startTimer` 入口（經 `hooks/useRoundStore.ts` 接線）。`timer`
為 `null`（不計時）或已開始時，MUST **不顯示**該按鈕，SHALL NOT 顯示一顆恆為 `disabled`
且無說明文字的按鈕——這與目標分數選擇器「`disabled` 必須解釋原因」的精神不同：「開始計時」
是一次性操作而非持續可見的設定，不計時模式下永遠沒有「開始」這個動作可做，顯示一顆說明不出
理由的 `disabled` 按鈕反而製造疑惑。

倒數顯示 MUST 呈現剩餘時間的 `mm:ss`（`nextjs-pickball/lib/matchmaker/round-timer.ts` 的
`formatRemaining`），每秒更新一次，更新來源 MUST 為
`nextjs-pickball/hooks/useRoundTimer.ts`——本 hook 是本 change 唯一呼叫 `setInterval`／
`new Date()` 的位置，`round-timer.ts` 與其餘元件 SHALL NOT 各自另起計時器或直接讀取目前
時間。

倒數期間的畫面更新 SHALL NOT 使用 `aria-live`——每秒宣讀一次剩餘秒數對螢幕報讀器使用者是
干擾而非幫助。時間到（剩餘秒數為 `0`）時 MUST 改為顯示大字「時間到」與繁體中文提示文案
「時間到：領先者勝，平手請再打一球」（`nextjs-pickball/lib/matchmaker/labels.ts` 的具名
常數 `ROUND_TIMER_EXPIRED_MESSAGE`），並 MUST 以 `role="alert"` 呈現使讀屏能即時播報。

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
