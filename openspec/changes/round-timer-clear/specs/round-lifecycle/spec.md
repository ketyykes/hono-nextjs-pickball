## MODIFIED Requirements

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

回合存在時把計時改回不計時（以下稱「取消計時」）MUST 同樣委派 `setTimerDuration`，以
`durationMinutes` 為 `null` 呼叫，SHALL NOT 另立第二個入口（例如 `clearTimer`）而複製一份鎖定判定。
成功時本輪 `timer` MUST 變為 `null`——整個 `timer` 清除，不保留 `durationMinutes` 或 `startedAt`；
鎖定條件與變更計時長度**完全相同**（該輪所有場次仍為 `pending` 時才允許），被拒絕時 MUST 回傳
可判讀的失敗結果且原回合 SHALL NOT 被修改。倒數已開始（`startedAt !== null`）時取消計時 MUST
仍被允許——開始計時與比分無關，主持人可能按錯；取消後倒數顯示、「開始計時」操作與時間到提示
MUST 隨 `timer` 為 `null` 一併消失，SHALL NOT 另行保留任何計時狀態。對戰頁在回合存在且未鎖定時，
計時控制項的「不計時」選項（點擊或方向鍵）MUST 委派取消計時；鎖定時維持 `disabled` 並顯示既有的
鎖定說明。訪客模式與雲端回合 MUST 經同一個純函式，雲端回合以 `timer: null` 寫入回合。

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

#### Scenario: 回合存在時可把計時改回不計時

- **WHEN** 本輪所有場次皆為 `pending`，`timer` 為 `{ durationMinutes: 10, startedAt: null }` 或已開始倒數，呼叫 `setTimerDuration(round, null)`
- **THEN** 回傳成功，新回合的 `timer` 為 `null`
- **AND** 原回合物件未被修改
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「setTimerDuration 傳入 null 時把本輪改回不計時，計時已開始亦同」

#### Scenario: 已開始計分後拒絕取消計時

- **WHEN** 本輪任一場次已離開 `pending`，呼叫 `setTimerDuration(round, null)`
- **THEN** 回傳失敗結果，`code` 為 `scoring-started`
- **AND** 原回合與其 `timer` 未被修改
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「已有場次離開 pending 時 setTimerDuration 傳入 null 亦拒絕且不改動回合」

#### Scenario: 訪客模式取消計時寫回儲存

- **WHEN** 訪客模式下回合存在且帶計時，經 `useRoundStore` 呼叫 `setTimerDuration(null)`
- **THEN** store 回傳的 `round.timer` 為 `null`，且寫回 LocalStorage 的回合 `timer` 為 `null`
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「訪客模式 setTimerDuration(null) 取消本輪計時並寫回儲存」

#### Scenario: 雲端回合取消計時以 timer 為 null 寫入

- **WHEN** 登入模式下雲端回合存在且帶計時，經 `useRemoteRoundStore` 呼叫 `setTimerDuration(null)`
- **THEN** 送往 `PUT /api/matchmaker/round` 的回合 `timer` 為 `null`
- **AND** store 回傳的 `round.timer` 為 `null`
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「雲端回合 setTimerDuration(null) 以 timer 為 null 寫入回合」

#### Scenario: 對戰頁回合存在時點選不計時委派取消計時

- **WHEN** 回合存在、未鎖定且帶計時，使用者點擊計時控制項的「不計時」，或以方向鍵移到「不計時」
- **THEN** 注入的 `setTimerDuration` 以 `null` 被呼叫一次
- **AND** `onSettingsChange` 未被呼叫
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「回合存在且未鎖定時點選不計時委派 setTimerDuration(null)」與「回合存在且未鎖定時方向鍵移到不計時亦委派 setTimerDuration(null)」

#### Scenario: E2E 取消已開始的本輪計時

- **WHEN** 訪客以 10 分鐘計時產生本輪並按下「開始計時」，再點選「不計時」
- **THEN** 「不計時」為選中，倒數顯示與「開始計時」按鈕皆不存在
- **AND** 重新載入對戰頁後仍為不計時
- **驗收**：`nextjs-pickball/tests/e2e/specs/round-timer.spec.ts`，test 名稱「回合存在時選不計時可取消已開始的本輪計時」

#### Scenario: E2E 取消計時後產生下一輪仍為不計時

- **WHEN** 訪客以 10 分鐘計時產生本輪、點選「不計時」，再按「產生本輪對戰」
- **THEN** 新一輪的計時控制項選中「不計時」，且不顯示「開始計時」按鈕
- **驗收**：`nextjs-pickball/tests/e2e/specs/round-timer.spec.ts`，test 名稱「取消本輪計時後產生下一輪仍為不計時」

