## MODIFIED Requirements

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

## ADDED Requirements

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

**完成狀態不可經 PUT 改變**：`PUT /api/matchmaker/round` 的 `data` 中每一場 `status` 為 `completed` 的場次，MUST 在雲端目前回合中存在同 id、且內容完全相同的已完成場次；
否則回 `400 INVALID_BODY`——場次只能經送出比分端點完成（後端權威），否則評分與歷史不會被寫入。比對以讀出的目前回合為準，
寫入本身是帶版本條件的單一 UPDATE：比對後回合若已被改動，UPDATE 影響 0 列而回 409，因此比對與寫入之間沒有可被利用的競態。

**分槽清理**：`PUT /api/matchmaker/round` 的寫入與「刪除該使用者所有 `match_id` 不屬於（寫入後的）目前回合中**未完成**場次的分槽」MUST 在同一個 batch 內；
刪除條件 MUST 以資料庫中的回合內容推導（`json_each(matchmaker_round.data, '$.matches')`），使「分槽只存在於目前回合的未完成場次」這個不變式由伺服器維護，
不論該次 PUT 成功或因版本不符而未寫入都成立（`round-lifecycle`「重排本輪或重置名單時清除對應計分板進度」在雲端模式的實現）。

**送出比分**：

1. 讀出目前回合與該使用者全部參賽者；回合不存在或 `version !== roundVersion` 時回 409。
2. 以核心 `submitScore({ round, players, matchId, rawScoreA: scoreA, rawScoreB: scoreB, now: 伺服器時間 })` 計算。
   失敗碼為 `empty-field`、`invalid-number`、`negative-score`、`tie` 時回 `400 INVALID_BODY`；`match-not-found`、`already-completed`、`scoring-failed` 時回 409。
3. 以**單一 batch** 依序：整批守衛（回合 version 等於 `roundVersion`，且每位被更新球員的 version 等於步驟 1 讀到的值）→ 插入歷史 → 更新回合（version + 1）→ 逐一更新被更新球員（`rating`、`gamesPlayed`，version + 1）→ 刪除該場分槽 → 刪除守衛列。
   守衛失敗或 `matchmaker_history` 主鍵衝突時回 409，資料不變。
4. 成功回 `200 { round: { data, version }, players: [{ data, version }]（僅被更新者）, historyEntry, boundaryHits }`。

`POST /api/matchmaker/reset` 的 batch MUST 刪除該使用者在 `matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots`、`matchmaker_history` 四張表的列。

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
