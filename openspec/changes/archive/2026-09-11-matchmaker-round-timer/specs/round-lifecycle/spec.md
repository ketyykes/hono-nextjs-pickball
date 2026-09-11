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
| `winner` | `"teamA" \| "teamB" \| null` | 勝方；未完成時為 `null` |
| `completedAt` | `string \| null` | 完成時間，ISO 8601；未完成時為 `null` |
| `playerRatings` | `{ playerId, before, after }[]` | 該場每位球員的賽前與賽後分數；`before` 於建立回合時填入，`after` 未完成時為 `null` |

場次狀態的語意（`prd.md` 6.5）：

- `pending`——已排定但尚未開始，是「未完成場次」的唯一可重排對象。
- `scoring`——**進行中**，已開始計分但尚未判定勝負。本 capability SHALL 在 schema 與「未完成」判定中接受此值，但 SHALL NOT 自行產生它——實際的進入時機需要場邊計分的銜接，屬後續 milestone。先納入 schema 是為了避免對 `matchmaker:round:v1` 做破壞性遷移（沿用 `player-roster` 對 `restCount`／`gamesPlayed` 的同一教訓）。
- `completed`——已完成，MUST 同時帶齊 `scores`、`winner`、`completedAt`，且 `playerRatings` 每筆的 `after` MUST 為數字。已完成場次 SHALL NOT 再次送出比分（`prd.md` 6.5）。

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

---

## ADDED Requirements

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
