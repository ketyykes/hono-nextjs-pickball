# match-history Specification

## Purpose
定義「匹克球對戰分配機」歷史賽果的**紀錄欄位 schema** 與**寫入時機**兩件事（`prd.md` 8.2）。歷史是本產品唯一在回合被取代之後仍然留存的資料，也是 CSV 匯出與歷史頁的共同來源——三者同一份 schema，任何一方單獨擴充欄位都會讓另外兩方讀到不完整的資料。

本 capability **刻意只含兩類 requirement**。歷史的五個時間區間切點（`prd.md` 8.1）、空區間文案、排序、歷史頁路由與呈現，皆屬後續 milestone；本 capability 保存的是**追加順序**的原始紀錄，不排序、不去重、不篩選。CSV 匯出（`prd.md` 9.3.1）同樣不在此。

歷史保存的是**球員快照**而非 id 參照，這是本 capability 最重要的一條約束：參賽者可以被刪除或改名，歷史若靠 id 回查名單，一次刪除就會讓過去的賽果變成空白或整筆消失。

## Requirements

### Requirement: 歷史紀錄欄位 schema

系統 SHALL 以 zod schema 定義單筆歷史紀錄，欄位對應 `prd.md` 8.2：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `matchId` | string | 對戰 ID，對應該場次在回合中的 `id` |
| `courtNumber` | number | 場地編號，1 起算的正整數 |
| `playedAt` | string | 對戰時間，ISO 8601，取該場的完成時間 |
| `format` | `"singles" \| "doubles"` | 對戰方式 |
| `doublesComposition` | 選填 | 雙打組成標示（男雙／女雙／混雙／一般雙打）；單打 MUST NOT 帶此欄位 |
| `teamA` | HistoryTeam | 第一隊 |
| `teamB` | HistoryTeam | 第二隊 |
| `scoreA` | number | 第一隊比分，非負整數 |
| `scoreB` | number | 第二隊比分，非負整數 |
| `winner` | `"teamA" \| "teamB" \| "draw"` | 勝方；兩隊比分相同的計時回合為 `"draw"`（見 `round-lifecycle` 的「比分驗證」） |

`HistoryTeam` MUST 含該隊每位球員的快照：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `players[].id` | string | 球員 id，供日後比對，但 SHALL NOT 作為顯示資料的唯一來源 |
| `players[].name` | string | **姓名快照**，寫入當下的名稱 |
| `players[].ratingBefore` | number | 該員賽前分數 |
| `players[].ratingAfter` | number | 該員賽後分數（clamp 後） |
| `rating` | number | 該隊的隊伍分數（賽前，單打為該員 rating、雙打為兩人總和） |

賽前與賽後分數 MUST 為 **per-player**，SHALL NOT 只保存隊伍層級的一個數字——`prd.md` 9.3.1 的 CSV 匯出明列「各員賽前分數與賽後分數」，且雙打同隊兩人的起點不同，只存隊伍值就無法還原任何一位球員的變化。平局時兩隊亦各自保留 per-player 的賽前／賽後分數，與勝負場次的欄位形狀完全一致，不因平局而簡化。

紀錄 MUST 是**自足的快照**：寫入後即使該球員從名單中被刪除或改名，這筆歷史仍 MUST 能完整顯示當時的姓名、比分與分數變化。SHALL NOT 以 `playerId` 於呈現時回查名單取得姓名（見 design Decision 3）。

單打 MUST NOT 帶 `doublesComposition`，雙打 MUST 帶——與 `match-allocation` 對 `Match` 的約束一致，避免同一個概念在兩處有兩種形狀。

外層容器的 `version` MUST 為字面量 `1`。

實作位於 `nextjs-pickball/lib/matchmaker/history.ts`。

#### Scenario: 合法歷史紀錄通過驗證

- **WHEN** 以完整合法欄位呼叫 `MatchHistoryEntrySchema.safeParse`
- **THEN** `success` 為 `true`
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「合法歷史紀錄通過驗證」

#### Scenario: 缺少必要欄位時驗證失敗

- **WHEN** 紀錄缺少 `winner`、`playedAt` 或 `scoreA`
- **THEN** 驗證失敗
- **AND** `playedAt` 非 ISO 8601、`scoreA` 為負數時亦驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「缺少必要欄位或欄位格式不合法時驗證失敗」

#### Scenario: 每位球員各帶賽前與賽後分數

- **WHEN** 一筆雙打紀錄通過驗證
- **THEN** 兩隊合計 MUST 有 4 位球員，每位皆帶 `ratingBefore` 與 `ratingAfter`
- **AND** 單打紀錄合計 2 位
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「歷史紀錄的每位球員各帶賽前與賽後分數」

#### Scenario: 單打不帶雙打組成標示

- **WHEN** 一筆 `format` 為 `"singles"` 的紀錄帶有 `doublesComposition`
- **THEN** 驗證失敗
- **AND** `format` 為 `"doubles"` 而未帶該欄位時亦驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「單打不得帶雙打組成標示，雙打必須帶」

#### Scenario: 球員自名單刪除後歷史仍完整

- **GIVEN** 一筆已寫入的歷史紀錄
- **WHEN** 其中一位球員自名單中被移除
- **THEN** 該筆紀錄的姓名、比分、賽前與賽後分數 MUST 完全不受影響
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「球員自名單刪除後歷史紀錄的姓名與分數仍完整」

#### Scenario: winner 欄位新增 draw 列舉值時通過驗證

- **WHEN** 一筆歷史紀錄的 `winner` 為 `"draw"`，其餘欄位合法
- **THEN** 驗證通過
- **AND** `winner` 為 `"tie"` 這類未列舉的字面量時驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「winner 欄位新增 draw 列舉值時通過驗證」

---

### Requirement: 完成場次時寫入一筆歷史

每完成一場對戰，系統 SHALL 追加**恰好一筆**歷史紀錄（`prd.md` 8.2、6.3）。追加 MUST 為不可變操作——回傳新的歷史陣列，SHALL NOT 就地修改傳入的陣列。

寫入時機 MUST 綁定「場次由未完成轉為 `completed`」這一刻，且與評分更新、`gamesPlayed` 累加同屬一次原子的送出流程（見 `round-lifecycle` 的「比分送出的完成流程」）。

同一場次 SHALL NOT 產生第二筆——已完成場次不得再次送出，這是 `prd.md` 6.5 的既有約束，本 capability 依賴它而非另行去重。

歷史 MUST 以**追加順序**保存，SHALL NOT 在寫入時排序或去重。排序、五個時間區間的篩選與呈現屬後續 milestone；在儲存層先做排序會讓「同一秒完成的兩場」順序不穩定，也讓後續的篩選失去原始順序這個唯一可靠的並列基準。

重設或重排未完成場次 SHALL NOT 刪除或修改任何已寫入的歷史（`prd.md` 6.2 明訂重設保留已完成場次的比分與 Elo 結果）。產生新一輪取代目前回合時同理。

歷史屬於「重置名單」的清除範圍（見 `player-roster`）。

**雲端模式**（`user-data-sync`「前端依 session 選擇儲存模式」）下，歷史 MUST 由後端在送出比分的同一個 D1 batch 內寫入 `matchmaker_history`
（`round-lifecycle`「回合與送出比分的雲端 API」），前端 SHALL NOT 寫入任何歷史（本機 `matchmaker:history:v1` 亦不寫）。
寫入的 `data` MUST 是核心 `submitScore` 回傳的 `historyEntry` 原樣，`played_at` 欄位 MUST 等於 `historyEntry.playedAt` 換算的毫秒數。
追加順序在雲端以列的插入順序（`rowid`）保存；`(user_id, match_id)` 主鍵是「同一場次 SHALL NOT 產生第二筆」的**第二道防線**——
第一道仍是「已完成場次不得再次送出」，主鍵衝突只在第一道被繞過時發生，且 MUST 使整批回滾並回 409。
雲端模式下回合 PUT（重排、產生新一輪、換人等）與分槽寫入 SHALL NOT 觸碰 `matchmaker_history`。

實作位於 `packages/pickball-core/src/matchmaker/history.ts`、`packages/pickball-core/src/matchmaker/round.ts` 與 `hono-pickball/src/matchmaker/score-repository.ts`。

#### Scenario: 完成一場後歷史增加恰好一筆

- **GIVEN** 歷史目前有 2 筆
- **WHEN** 送出一場合法比分並完成該場
- **THEN** 歷史變為 3 筆，新增那筆的 `matchId`、`courtNumber`、`scoreA`／`scoreB`、`winner` 與該場一致
- **AND** 原陣列未被就地修改
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「appendHistoryEntry 回傳新陣列且只增加一筆」

#### Scenario: 同一場次重複送出不會產生第二筆

- **GIVEN** 一個已 `completed` 的場次
- **WHEN** 再次送出相同比分
- **THEN** 送出被拒絕，歷史筆數不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「已完成場次重複送出時歷史筆數不變」

#### Scenario: 重排未完成場次不影響既有歷史

- **GIVEN** 目前回合有一場已完成並已寫入歷史
- **WHEN** 重排未完成場次
- **THEN** 歷史筆數與內容完全不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排未完成場次不刪除也不修改既有歷史」

#### Scenario: 多場完成時依完成順序追加

- **WHEN** 依序完成場次 A、C、B
- **THEN** 歷史中的 `matchId` 順序 MUST 為 A、C、B
- **AND** SHALL NOT 依場地編號或時間重新排序
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「多筆歷史依追加順序保存，不重新排序」

#### Scenario: 雲端歷史的 data 與 played_at 來自同一筆 historyEntry

- **GIVEN** 已登入，目前回合有 `pending` 的 `m1`
- **WHEN** 送出比分成功
- **THEN** `matchmaker_history` 中 `m1` 那一列的 `data` 與回應的 `historyEntry` 深度相等，`played_at` 等於 `Date.parse(historyEntry.playedAt)`，`version` 為 1
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「雲端歷史的 data 等於回應的 historyEntry 且 played_at 為其毫秒值」

#### Scenario: 雲端回合 PUT 不觸碰歷史

- **GIVEN** 已登入，`matchmaker_history` 已有兩筆
- **WHEN** 以合法版本 PUT 一個全新的回合（產生新一輪）
- **THEN** `matchmaker_history` 仍為那兩筆，內容不變
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 不新增、不修改也不刪除任何歷史」

### Requirement: 歷史區間切點計算

系統 SHALL 提供純函式 `computeRangeCutoffs(now)`，依 `prd.md` 8.1 由近至遠計算四個切點：

```
C0 = 今天 00:00
C1 = min(本週一 00:00, C0)
C2 = min(當月 1 日 00:00, C1)
C3 = min(上月 1 日 00:00, C2)
```

四個切點 MUST 取**當地時區**的 00:00，SHALL NOT 使用 UTC 的 00:00——使用者在台北晚上 23:00 打完的一場，UTC 已是隔日，若以 UTC 切點判定會被歸到「明天」而完全落出五個區間之外。

週起始 MUST 為**週一**。週日 MUST 視為該週的最後一天，其「本週一」為六天前而非隔天。

`min()` MUST 逐層套用，使四個切點**單調不遞增**（`C3 <= C2 <= C1 <= C0`）。此性質是區間互斥的唯一來源：少了任何一層 `min()`，跨月週就會產生重疊或空洞（見 design Decision 1）。

「現在」MUST 由呼叫端以參數注入，本模組 SHALL NOT 於函式內呼叫 `new Date()`、`Date.now()` 或任何取用系統時鐘的 API——PRD 的兩個驗算例都綁定特定日期，函式若自行取時間就無法被決定性地驗證（沿用 `player-roster` 的 `addPlayer({ id, now })` 注入慣例）。

實作位於 `nextjs-pickball/lib/matchmaker/history-range.ts`。

#### Scenario: 一般情形的四個切點（PRD 驗算一）

- **WHEN** 「現在」為 2026-08-15（週六）的當地時間
- **THEN** `C0` 為 2026-08-15 00:00、`C1` 為 2026-08-10 00:00、`C2` 為 2026-08-01 00:00、`C3` 為 2026-07-01 00:00
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「一般情形下四個切點依序為今天、本週一、當月 1 日與上月 1 日」

#### Scenario: 跨月週時當月切點退回本週一（PRD 驗算二）

- **WHEN** 「現在」為 2026-08-01（週六，該週的週一落在 2026-07-27）的當地時間
- **THEN** `C0` 為 2026-08-01 00:00、`C1` 為 2026-07-27 00:00
- **AND** `C2` 為 2026-07-27 00:00（`min(8/1, 7/27)` 取本週一，而非當月 1 日）
- **AND** `C3` 為 2026-07-01 00:00
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「跨月週時當月切點取本週一而非當月 1 日」

#### Scenario: 四個切點單調不遞增

- **WHEN** 以任一日期計算切點
- **THEN** `C3 <= C2 <= C1 <= C0` 恆成立
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「四個切點單調不遞增」

#### Scenario: 週起始為週一，週日屬於前一週

- **WHEN** 「現在」為 2026-08-16（週日）
- **THEN** `C1` 為 2026-08-10 00:00（六天前的週一），而非 2026-08-17
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「週起始為週一，週日的本週一為六天前」

#### Scenario: 切點為當地時區 00:00

- **WHEN** 「現在」為當地時間 2026-08-15 23:30
- **THEN** `C0` 等於當地時間 2026-08-15 00:00 的時間戳
- **AND** `C0` 的當地小時、分鐘、秒與毫秒皆為 0
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「切點為當地時區 00:00 而非 UTC 00:00」

#### Scenario: 上月切點跨年

- **WHEN** 「現在」為 2027-01-05
- **THEN** `C3` 為 2026-12-01 00:00
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「一月時上月切點落在去年 12 月 1 日」

#### Scenario: 切點依注入的現在計算而非系統時鐘

- **GIVEN** 以假時鐘把系統時間設為 2030-03-03
- **WHEN** 以 `now` 為 2026-08-15 呼叫 `computeRangeCutoffs`
- **THEN** 回傳的切點對應 2026-08-15，與系統時鐘無關
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「切點依注入的 now 計算，與系統時鐘無關」

---

### Requirement: 五個區間互斥且完整覆蓋

系統 SHALL 提供純函式 `rangeOfTime(time, now)`，回傳該時間點所屬的區間，型別為 `"today" | "thisWeek" | "thisMonth" | "lastMonth" | "earlier"` 五者之一。

區間 MUST 依下列半開區間定義（`C0`～`C3` 見「歷史區間切點計算」）：

| 區間 | 範圍 |
|---|---|
| 今日 | `[C0, +∞)` |
| 本週 | `[C1, C0)` |
| 本月 | `[C2, C1)` |
| 上月 | `[C3, C2)` |
| 更早 | `(-∞, C3)` |

任一時間點 MUST 恰好落入其中一個區間：五者 SHALL 互斥（不得同時成立兩個）且 SHALL 完整覆蓋（不得有任何時間點落不進任何一個）。這是 `prd.md` 8.1 與 13.5 的硬性要求——落空的賽果不會顯示，也不會報錯，是**靜默漏失**。

時間點恰等於某個切點時 MUST 歸入**較新**的那一個區間（半開區間的左端點屬於自己）。

「今日」的上界 MUST 為正無限大，SHALL NOT 以「現在」為上界。`prd.md` 8.1 表格寫的是 `[C0, 現在]`，但裝置時鐘被調整或紀錄時間有毫秒級超前時，晚於「現在」的紀錄會落不進任何區間，直接違反同節「必須完整覆蓋」的硬性要求。以 `+∞` 為上界時，該紀錄仍歸入今日，語意與使用者預期一致（見 design Decision 3）。

`rangeOfTime` SHALL NOT 拋出例外：任何可轉為時間戳的輸入都 MUST 得到一個區間。

實作位於 `nextjs-pickball/lib/matchmaker/history-range.ts`。

#### Scenario: 任一時間點恰好落入一個區間

- **GIVEN** 「現在」為 2026-08-15，並取一組橫跨五個區間的時間點（含 1970 年與 2100 年兩個極端值）
- **WHEN** 對每個時間點逐一判定其是否落入五個區間的範圍
- **THEN** 每個時間點恰有一個區間成立，且與 `rangeOfTime` 的回傳值一致
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「任一時間點恰好落入五個區間中的一個」

#### Scenario: 時間點恰為切點時歸入較新的區間

- **GIVEN** 「現在」為 2026-08-15
- **WHEN** 時間點恰為 `C0`、`C1`、`C2`、`C3`
- **THEN** 依序歸入今日、本週、本月、上月
- **AND** 時間點為 `C3` 的前一毫秒時歸入更早
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「時間點恰為切點時歸入較新的區間」

#### Scenario: 晚於現在的時間點仍歸入今日

- **GIVEN** 「現在」為 2026-08-15 20:00
- **WHEN** 時間點為 2026-08-15 23:59（晚於「現在」）
- **THEN** 回傳今日，SHALL NOT 落空或拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「晚於現在的時間點仍歸入今日而非落空」

#### Scenario: 跨月週時本月為空區間

- **GIVEN** 「現在」為 2026-08-01（該週的週一落在 2026-07-27）
- **WHEN** 對橫跨 7/1 至 8/1 的時間點逐一判定
- **THEN** 沒有任何時間點回傳本月（`C2` 與 `C1` 相等，本月為空區間）
- **AND** 7/27～7/31 的時間點回傳本週，7/1～7/26 的時間點回傳上月
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「跨月週時沒有任何時間點落入本月」

---

### Requirement: 歷史紀錄依區間篩選與排序

系統 SHALL 提供純函式 `filterHistoryByRange(records, range, now)`，回傳指定區間內的歷史紀錄。

判定依據 MUST 是每筆紀錄的**對戰時間**（M4 的 `MatchHistoryEntry.playedAt`，ISO 8601 字串），並 MUST 透過單一取值點取得，SHALL NOT 在多處各自讀取該欄位——紀錄 schema 由 M4 定案且 M7／M8 共用同一份，集中取值可使日後對齊只需改一處（見 design Decision 4）。本 capability SHALL NOT 自行定義歷史紀錄型別。

結果 MUST 依對戰時間**由新到舊**排序：歷史頁的使用情境是「剛打完回頭看」，最近一場應在最上方。

本函式 MUST 為純函式：SHALL NOT 修改輸入的 `records` 陣列或其中任何紀錄物件，SHALL NOT 讀寫 LocalStorage，SHALL NOT 取用系統時鐘（「現在」由參數注入）。

歷史頁 SHALL 提供今日、本週、本月、上月、更早五個篩選，且 MUST 於初次開啟時預設選中**今日**（`prd.md` 13.4）。目前選取的區間屬於畫面狀態，SHALL NOT 持久化到 LocalStorage。

實作位於 `nextjs-pickball/lib/matchmaker/history-range.ts`、`nextjs-pickball/components/matchmaker/HistoryRangeFilter.tsx` 與 `nextjs-pickball/components/matchmaker/HistoryView.tsx`。

#### Scenario: 篩選結果依對戰時間由新到舊排序

- **GIVEN** 同一區間內有三筆對戰時間先後不同的紀錄，且以時間亂序傳入
- **WHEN** 呼叫 `filterHistoryByRange`
- **THEN** 回傳順序為對戰時間由新到舊
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「篩選結果依對戰時間由新到舊排序」

#### Scenario: 篩選不修改輸入的紀錄陣列

- **GIVEN** 一組亂序的歷史紀錄
- **WHEN** 呼叫 `filterHistoryByRange`
- **THEN** 輸入陣列的長度、元素順序與各紀錄內容皆與呼叫前相同
- **AND** 回傳值與輸入陣列不是同一個參照
- **驗收**：`nextjs-pickball/lib/matchmaker/history-range.test.ts`，it 名稱「篩選不修改輸入的紀錄陣列」

#### Scenario: 開啟歷史頁預設顯示今日

- **GIVEN** `matchmaker:history:v1` 中同時存在今日與更早的紀錄
- **WHEN** 開啟 `/matchmaker/history`
- **THEN** 今日篩選為選中狀態，畫面只列出今日的紀錄
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「開啟歷史頁預設顯示今日區間」

#### Scenario: 切換區間後只顯示該區間的紀錄

- **GIVEN** `matchmaker:history:v1` 中今日與上月各有紀錄
- **WHEN** 切換到「上月」篩選
- **THEN** 畫面只列出上月的紀錄，今日的紀錄不再出現
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「切換區間後只顯示該區間的紀錄」

---

### Requirement: 歷史紀錄的顯示欄位

每筆歷史紀錄 SHALL 顯示 `prd.md` 8.2 列舉的全部欄位，對應 M4 `MatchHistoryEntry` 的識別字：對戰 ID（`matchId`）、場地（`courtNumber`）、對戰時間（`playedAt`）、對戰方式（`format`）、雙打組成標示（`doublesComposition`）、第一隊（`teamA`）、第二隊（`teamB`）、比分（`scoreA`／`scoreB`）與勝方（`winner`）。

球員姓名 MUST 取自紀錄內的**姓名快照**（`teamA.players[].name`），SHALL NOT 以 `players[].id` 回查目前名單——參賽者可被刪除或改名，回查會讓過去的賽果變成空白（M4「歷史紀錄欄位 schema」已明訂此約束，本 capability 是它的消費端）。

賽前與賽後分數 MUST **逐位球員**呈現（`players[].ratingBefore` 與 `players[].ratingAfter`）並可辨識其變化方向，SHALL NOT 只顯示其中一側——PRD 13.4 的驗收項要求「歷史紀錄包含賽前／賽後分數」，只顯示賽後分數會讓使用者無從得知該場的評分影響。

雙打組成標示 MUST 只在對戰方式為雙打時顯示；單打紀錄 SHALL NOT 顯示該欄位（單打沒有組成可言，顯示空白或「一般雙打」都是錯誤資訊）。

勝方 MUST 以文字或圖示明確標示，SHALL NOT 僅以顏色區分（`prd.md` 12.5：色彩不得為唯一資訊來源）。`winner` 為 `"draw"` 時 MUST 顯示可判讀的「平手」文字，SHALL NOT 顯示任一隊為勝方，也 SHALL NOT 留白——顯示任一隊會誤導使用者以為該隊真的獲勝，留白則與「未完成」場次的呈現無法區分。

歷史頁 SHALL NOT 重新計算任何分數：賽前／賽後分數、比分與勝方一律照 M4 寫入的值原樣呈現。

實作位於 `nextjs-pickball/components/matchmaker/HistoryRecordCard.tsx`。

#### Scenario: 雙打紀錄顯示 8.2 全部欄位

- **GIVEN** `matchmaker:history:v1` 中有一筆雙打紀錄
- **WHEN** 於歷史頁檢視該筆紀錄
- **THEN** 畫面同時呈現對戰 ID、場地、對戰時間、對戰方式、雙打組成標示、兩隊球員、比分與勝方
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「雙打紀錄顯示 8.2 全部欄位含雙打組成標示」

#### Scenario: 單打紀錄不顯示雙打組成標示

- **GIVEN** `matchmaker:history:v1` 中有一筆單打紀錄
- **WHEN** 於歷史頁檢視該筆紀錄
- **THEN** 該筆不出現任何雙打組成標示
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「單打紀錄不顯示雙打組成標示」

#### Scenario: 每位球員同時顯示賽前與賽後分數

- **GIVEN** 一筆紀錄中某位球員的賽前分數為 4.20、賽後分數為 4.35
- **WHEN** 於歷史頁檢視該筆紀錄
- **THEN** 該球員同時顯示 4.20 與 4.35 兩個值
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「每位球員同時顯示賽前與賽後分數」

#### Scenario: 平局紀錄顯示平手而非任一隊勝方

- **GIVEN** `matchmaker:history:v1` 中有一筆 `winner` 為 `"draw"` 的紀錄
- **WHEN** 於歷史頁檢視該筆紀錄
- **THEN** 畫面顯示可判讀的「平手」文字，且第一隊與第二隊皆不出現「勝」之類的勝方標籤
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「平局紀錄顯示平手而非任一隊勝方」

### Requirement: 空區間的友善空狀態

某個區間沒有任何紀錄時，歷史頁 SHALL 顯示繁體中文的友善空狀態，SHALL NOT 顯示錯誤訊息、空白畫面或技術錯誤碼（`prd.md` 8.2、11）。

跨月週使「本月」成為空區間時，該空狀態 MUST 被視為**正常結果**（`prd.md` 13.5：「本週一落在上個月時，該週賽果歸入『本週』，『本月』顯示空狀態而非錯誤」）。

`matchmaker:history:v1` 完全沒有資料時 SHALL 顯示引導型空狀態，說明先完成一場對戰才會有紀錄，SHALL NOT 只顯示「無資料」四個字。

實作位於 `nextjs-pickball/components/matchmaker/EmptyHistory.tsx`。

#### Scenario: 跨月週時本月顯示空狀態而非錯誤

- **GIVEN** 假時鐘設為 2026-08-01（該週的週一落在 2026-07-27），且 7/27～7/31 有紀錄
- **WHEN** 切換到「本月」篩選
- **THEN** 顯示友善空狀態，畫面不出現任何錯誤字樣
- **AND** 切換到「本週」時該批紀錄如常列出
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「跨月週時本月顯示空狀態而非錯誤」

#### Scenario: 沒有任何歷史紀錄時顯示引導空狀態

- **GIVEN** LocalStorage 中不存在 `matchmaker:history:v1`
- **WHEN** 開啟 `/matchmaker/history`
- **THEN** 顯示引導型空狀態，說明完成對戰後才會有紀錄
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「沒有任何歷史紀錄時顯示引導空狀態」

---

### Requirement: 歷史頁的導覽入口

歷史頁 SHALL 可從 matchmaker 區段的既有導覽以連結抵達，SHALL NOT 只能靠手動輸入網址。

該入口 MUST 由本 capability 自行提供，SHALL NOT 修改 `site-navbar` 或對戰畫面 capability 的既有 requirement——全站 navbar 的 matchmaker 入口屬於其他 milestone 的職責範圍，並行變更同一條 requirement 會造成規格衝突（見 design Decision 6）。

`/matchmaker/history` MUST 可被直接開啟：路由不得相依於任何前一個畫面留下的記憶體狀態。

實作位於 `nextjs-pickball/app/matchmaker/history/page.tsx` 與 matchmaker 區段的既有導覽。

#### Scenario: 可由 matchmaker 區段的連結進入歷史頁

- **WHEN** 於 matchmaker 區段點擊歷史紀錄連結
- **THEN** 進入 `/matchmaker/history` 並顯示歷史頁內容
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「可由對戰頁的連結進入歷史頁」

#### Scenario: 直接開啟網址即可載入歷史頁

- **WHEN** 直接在網址列輸入 `/matchmaker/history`
- **THEN** 歷史頁正常載入並顯示五個區間篩選
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「直接開啟 /matchmaker/history 可載入歷史頁」

---

### Requirement: 歷史頁唯讀消費既有紀錄

歷史頁 SHALL 只**讀取**歷史，SHALL NOT 寫入、修改、刪除或回寫任何歷史紀錄，亦 SHALL NOT 觸發評分更新或回合狀態變更。

**本機模式**下讀取來源為 `matchmaker:history:v1`（本 Requirement 以下各段）；**雲端模式**（`user-data-sync`「前端依 session 選擇儲存模式」）下讀取來源為 `GET /api/matchmaker/history`（見「登入時歷史以雲端為準」），歷史頁 MUST 只發出該 GET，SHALL NOT 發出任何寫入請求，也 SHALL NOT 讀寫 `matchmaker:history:v1`。

讀取 MUST 透過 M4 的 `readHistory()`（`nextjs-pickball/lib/matchmaker/round-storage.ts`）進行，SHALL NOT 自行 `JSON.parse(localStorage.getItem(...))`，也 SHALL NOT 於本 capability 重複寫死 key 字串（key 常數由 `nextjs-pickball/lib/matchmaker/storage-keys.ts` 單一來源匯出）——繞過 reader 會讓損壞資料的逐筆降級規則出現第二套實作，兩套一旦不一致就是資料靜默漏失。

讀取 MUST 在 client 端的 effect 中進行，首次伺服器輸出 SHALL 為空狀態；SHALL NOT 於 render 期間直接讀 LocalStorage 或取用系統時鐘，否則 SSR 與 CSR 的輸出必然不一致而產生 hydration 錯誤（沿用 `player-roster` 的 HYDRATE 模式）。

LocalStorage 不可用（SSR、私密模式）或無資料時 SHALL 顯示空狀態，SHALL NOT 拋出例外中斷畫面。

實作位於 `nextjs-pickball/components/matchmaker/HistoryView.tsx`（本機）與 `nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx`（雲端）；`nextjs-pickball/app/matchmaker/history/page.tsx` 依儲存模式擇一渲染。

#### Scenario: 瀏覽與切換區間不改動持久化資料

- **GIVEN** `matchmaker:history:v1` 中已有數筆紀錄
- **WHEN** 開啟歷史頁並依序切換五個區間
- **THEN** `matchmaker:history:v1` 的內容與操作前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「瀏覽與切換區間後 matchmaker:history:v1 內容不變」

#### Scenario: 紀錄於 hydration 後才出現且無 console error

- **GIVEN** `matchmaker:history:v1` 中已有今日的紀錄
- **WHEN** 開啟 `/matchmaker/history` 並等待載入完成
- **THEN** 紀錄正確顯示
- **AND** 整個載入過程沒有任何 console error（含 hydration mismatch 警告）
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「紀錄於 hydration 後顯示且無 console error」

#### Scenario: 歷史頁唯讀：登入時瀏覽歷史頁只發出 GET 且不寫入本機

- **GIVEN** 以測試帳號登入，雲端已有一筆今日的歷史；本機 `matchmaker:history:v1` 有一份訪客歷史
- **WHEN** 開啟 `/matchmaker/history` 並依序切換五個區間
- **THEN** 對 `/api/matchmaker/*` 的請求全部為 GET；本機 `matchmaker:history:v1` 的內容與操作前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入時瀏覽歷史頁只發出 GET 且不改動本機歷史」

### Requirement: 損毀歷史紀錄的可見提示

歷史頁 SHALL 在 `readHistory()`（`nextjs-pickball/lib/matchmaker/round-storage.ts`）回傳的 `droppedCount` 大於 0 時，顯示非阻斷的繁體中文提示，告知使用者有歷史紀錄因損毀被略過，且其餘紀錄不受影響，SHALL NOT 靜默處理（`prd.md` 第 11 節）。提示 MUST 不阻斷正常紀錄的瀏覽——合法紀錄仍照常顯示，五個時間區間篩選仍可正常操作。

`droppedCount` MUST 直接取自 `readHistory()` 既有的回傳欄位，SHALL NOT 於本 capability 重複解析 LocalStorage 或另行計算——該欄位在回合與歷史的持久化與損壞降級機制中已存在（`round-storage.ts` 的逐筆降級：外層合法但個別紀錄不合法時保留合法者、捨棄不合法者並回報丟棄筆數），只是此前尚無任何畫面消費它。

提示樣式與文字語彙 MUST 與 `player-roster` capability 既有的損毀提示一致（`nextjs-pickball/app/matchmaker/players/page.tsx` 的 `droppedCount > 0` 區塊）：帶 `role="alert"`，內容為「有 N 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。」，SHALL NOT 另創第二種樣式或語彙——全站對「本機資料損毀」使用同一套視覺與文案，使用者不必重新學習第二種提示的意思。

`droppedCount` 為 0 時 SHALL NOT 顯示任何損毀提示。

**雲端模式**下 `droppedCount` MUST 取自 `GET /api/matchmaker/history` 回應的同名欄位（後端逐列驗證後略過的筆數，見「登入時歷史以雲端為準」），提示的樣式與文案 MUST 與本機模式相同；後端 SHALL NOT 因此刪除或改寫任何列——雲端沒有「回寫清理」的對應行為，損毀列保留以便日後以新版 schema 救回。

實作位於 `nextjs-pickball/components/matchmaker/HistoryView.tsx` 與 `nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx`。

#### Scenario: 有損毀歷史紀錄時顯示提示

- **WHEN** 開啟歷史頁時 `readHistory()` 回傳的 `droppedCount` 大於 0
- **THEN** 畫面顯示帶 `role="alert"` 的繁體中文提示，內容含損毀筆數且說明其餘紀錄不受影響
- **AND** 合法的歷史紀錄仍正常顯示
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示」

#### Scenario: 沒有損毀歷史紀錄時不顯示提示

- **WHEN** `droppedCount` 為 0
- **THEN** 畫面不出現任何損毀提示
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「沒有損毀歷史紀錄時不顯示損毀提示」

#### Scenario: 損毀提示：雲端回應的 droppedCount 大於 0 時顯示相同提示

- **GIVEN** 雲端模式，`GET /api/matchmaker/history` 回 `{ items: [一筆合法紀錄], total: 3, droppedCount: 2 }`
- **WHEN** 渲染 `RemoteHistoryView`
- **THEN** 畫面有 `role="alert"` 且內容為「有 2 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。」；那一筆合法紀錄仍顯示
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`，it 名稱「雲端回應的 droppedCount 大於 0 時顯示與本機相同的損毀提示」

### Requirement: 登入時歷史以雲端為準

後端 SHALL 於 `/api/matchmaker/*` sub-app 提供 `GET /api/matchmaker/history`（授權、停用閘門與錯誤碼依 `user-data-sync`；SQL MUST 帶 `user_id = c.var.user.id`）。
本端點位於既有 sub-app 之下，因此受 `use("*", localAuth, requireSession, requireExpectedUser)` 保護（`user-data-sync`「使用者資料請求的預期帳號守衛」）：
`X-Expected-User-Id` 缺少、為空或與 session 不符時 MUST 回 `401 { "error": "ACCOUNT_MISMATCH" }` 且不回傳任何歷史；
`hono-pickball/test/expected-user-guard.test.ts` 的樣本表 MUST 補一條 `GET /api/matchmaker/history`，列舉出的使用者資料路由由 13 條變為 14 條。
歷史只增不改：本端點是 `user-data-sync`「多筆使用者資料的逐筆版本化契約」的**列出子集**，SHALL NOT 提供 PUT、DELETE 或批次附加。

查詢參數（皆選填，以核心 `@pickball/core/api/history` 的 `HistoryQuerySchema` 驗證；不合法時回 `400 INVALID_BODY`）。
`from`／`to` MUST 為只含十進位數字的字串（`/^\d+$/`）再轉為數字，且 MUST 為安全整數；SHALL NOT 使用 `z.coerce.number()`——它對空字串得 0、對 `" 12 "`、`"1e3"`、`"0x10"` 亦會轉成數字（design「apply §1 查證紀錄」）：

| 參數 | 規格 |
|---|---|
| `from` | 非負整數毫秒；只回 `played_at >= from` 的列 |
| `to` | 非負整數毫秒；只回 `played_at < to` 的列；同時給 `from` 時 MUST `from <= to`；`from === to` 為合法的空區間（`rangeBounds` 在週一的「本週」、本週一落在上個月時的「本月」會產生），MUST 回 200、`items` 為空、`total` 照算 |
| `order` | `desc`（預設）或 `asc` |

回應 MUST 為 `200 { items: [{ data: MatchHistoryEntry, version: 1 }], total: <本人全部歷史列數>, droppedCount: <本次範圍內略過的列數> }`。
`desc` MUST 依 `played_at` 由新到舊、同一 `played_at` 依插入順序（`rowid` 遞增）排列——與 `filterHistoryByRange` 對追加順序做穩定排序的結果相同；
`asc` MUST 依 `played_at` 由舊到新、同一 `played_at` 依插入順序（等同完成順序，供匯出使用）。
每一列的 `data` MUST 以 `MatchHistoryEntrySchema` 驗證：不合法者 SHALL NOT 出現在 `items`、MUST 計入 `droppedCount`，且 SHALL NOT 被刪除或改寫。

**區間界線在前端計算**：核心 `history-range.ts` SHALL 新增純函式 `rangeBounds(range, now)`，回傳 `{ from: number | null, to: number | null }`（`null` 表示無界）：
`today` 為 `[c0, ∞)`、`thisWeek` 為 `[c1, c0)`、`thisMonth` 為 `[c2, c1)`、`lastMonth` 為 `[c3, c2)`、`earlier` 為 `(-∞, c3)`，其中 `c0..c3` 為既有 `computeRangeCutoffs(now)` 的切點。
對任何時間 `t`，`rangeOfTime(t, now) === r` MUST 等價於 `t` 落在 `rangeBounds(r, now)` 內——五個區間的定義仍只有一份（「歷史區間切點計算」「五個區間互斥且完整覆蓋」）。
後端 SHALL NOT 自行計算區間切點：Workers runtime 以 UTC 執行，與使用者裝置的本地時區不同（design Decision 1）。

前端 `hooks/useRemoteHistory.ts`（`{ enabled, userId, range, onUnauthorized }` → `{ items, total, droppedCount, syncStatus }`）MUST：
在 effect 中取一次 `new Date()`、以 `rangeBounds` 算出界線並 `GET`（`loading` → `synced`）；`range` 改變時重新 GET，且只採用**最後一次**請求的結果；
失敗為 `load-failed`；401（含 `ACCOUNT_MISMATCH`）呼叫 `onUnauthorized`；`enabled` 為 false、或 `enabled` 為 true 而 `userId` 為 `null` 時不發請求。
請求 MUST 經 `nextjs-pickball/lib/sync/history-api.ts`（`fetchRemoteHistory(expectedUserId, query)`，以 `expectedUserId` 為第一參數，一律經 `requestJson`）。

本 hook 是 `user-data-sync`「雲端 store 以登入帳號為界」所稱「之後的 change 新增者」：主 effect 依賴含 `userId`，每次請求以該次 effect 的 `userId` 作為 `expectedUserId`；
hook MUST 記錄目前結果所屬的 `userId`（擁有者標記），render 時若與 options 的 `userId` 不同，MUST 回傳 `{ items: [], total: 0, droppedCount: 0, syncStatus: "loading" }`——
換帳號的那一次 render 起就不顯示前一帳號的歷史；舊帳號在途請求的結果 MUST 被忽略。
`RemoteHistoryView` 與 `RemoteStatsContent` MUST 以 `useSession()` 快照中的 user id（`status` 非 `ready` 或無 user 時為 `null`）作為 `userId`、`refresh` 作為 `onUnauthorized`，比照選擇器 hook 的接線。

`RemoteHistoryView` 與 `RemoteStatsContent` 在 `syncStatus` 為 `loading`／`load-failed` 時以 `SyncStatusNotice` 取代內容；`total === 0` 時顯示引導型空狀態（`EmptyHistory range={null}`），
`total > 0` 但 `items` 為空時顯示該區間的空狀態（`EmptyHistory range={range}`）。根元素帶 `data-sync-status`。

#### Scenario: 雲端歷史：auth 停用時歷史端點回 404

- **WHEN** 以 auth 停用且無 DB binding 的 env 呼叫 `GET /api/matchmaker/history`
- **THEN** 回 404
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「auth 停用且無 DB binding 時歷史端點回 404」

#### Scenario: 雲端歷史：未登入時歷史端點回 401

- **WHEN** 未帶 session 呼叫 `GET /api/matchmaker/history`
- **THEN** 回 `401 { "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「未登入呼叫歷史端點回 401」

#### Scenario: 雲端歷史：他人的歷史不可見

- **GIVEN** 使用者 A 有兩筆歷史
- **WHEN** 使用者 B 呼叫 `GET /api/matchmaker/history`
- **THEN** B 得到 `{ items: [], total: 0, droppedCount: 0 }`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「B 看不到 A 的歷史且 total 為 0」

#### Scenario: 雲端歷史：預期帳號缺少或不符時歷史端點回 401 且不回傳歷史

- **GIVEN** 使用者 A、B 各有歷史；以 B 的 cookie 呼叫
- **WHEN** `GET /api/matchmaker/history` 的 `X-Expected-User-Id` 為 A 的 id、B 的 id 加尾碼、缺少或空字串
- **THEN** 皆回 `401 { "error": "ACCOUNT_MISMATCH" }`，回應不含任何歷史；兩人的資料不變
- **AND** `app.routes` 列舉出的使用者資料路由含 `GET /api/matchmaker/history`，與樣本表一致（共 14 條）
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`（樣本表補 `GET /api/matchmaker/history`），it 名稱「每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變」「缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變」「列舉出的使用者資料路由恰與守衛樣本表一致」

#### Scenario: 雲端歷史：預設由新到舊、同時間依插入順序

- **GIVEN** 依序插入 `played_at` 為 100、300、300、200 的四筆（第二、三筆同時間）
- **WHEN** 不帶參數 GET
- **THEN** `items` 的順序為 300（第二筆）、300（第三筆）、200、100；`total` 為 4
- **AND** `order=asc` 時順序為 100、200、300（第二筆）、300（第三筆）
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「預設依 played_at 由新到舊且同時間依插入順序，asc 為由舊到新」

#### Scenario: 雲端歷史：依 from 與 to 篩選且 total 不受篩選影響

- **GIVEN** `played_at` 為 100、200、300 的三筆
- **WHEN** 以 `from=200&to=300` GET
- **THEN** `items` 只有 200 那筆（`from` 含、`to` 不含）；`total` 為 3
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「from 含、to 不含地篩選 played_at，total 仍為全部筆數」

#### Scenario: 雲端歷史：不合法的查詢參數

- **WHEN** 分別以 `from=abc`、`from=-1`、`from=300&to=200`、`order=random`、`from=`（空字串）GET
- **THEN** 五者皆回 400 `INVALID_BODY`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「from、to 或 order 不合法時回 400」

#### Scenario: 雲端歷史：from 等於 to 時為空區間

- **GIVEN** `played_at` 為 100、200、300 的三筆
- **WHEN** 以 `from=200&to=200` GET
- **THEN** 回 200 `{ items: [], total: 3, droppedCount: 0 }`——與本機在該區間顯示空狀態一致，SHALL NOT 回 400
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「from 等於 to 時回 200、items 為空且 total 為全部筆數」

#### Scenario: 雲端歷史：損毀列被略過並計數但不刪除

- **GIVEN** 以 SQL 直接插入一筆 `data` 缺少 `winner` 的列與一筆合法列
- **WHEN** GET 兩次
- **THEN** 兩次皆只回合法那筆、`droppedCount` 為 1、`total` 為 2；資料表仍有兩列
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「不合 schema 的歷史列被略過並計入 droppedCount 且不被刪除」

#### Scenario: 雲端歷史：data 不是合法 JSON 的列同樣被略過並計數

- **GIVEN** 以 SQL 直接插入一筆 `data` 為非 JSON 文字（例：`{not json`）的列與一筆合法列
- **WHEN** GET
- **THEN** 回 200、只回合法那筆、`droppedCount` 為 1、`total` 為 2；該列的原始文字未被改寫——單一列損毀 SHALL NOT 使整個端點失敗（否則歷史頁、統計頁與匯出全部無法使用）
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「data 不是合法 JSON 的歷史列同樣被略過並計數而不使端點失敗」

#### Scenario: 雲端歷史：rangeBounds 與 rangeOfTime 對任意時間判定一致

- **GIVEN** 固定的 `now`（含跨月週與月初的情境）與涵蓋五個區間及各切點前後 1 毫秒的時間樣本
- **WHEN** 對每個樣本 `t` 與每個區間 `r` 比較「`rangeOfTime(t, now) === r`」與「`t` 落在 `rangeBounds(r, now)`」
- **THEN** 兩者全部一致
- **驗收**：`packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`，it 名稱「rangeBounds 與 rangeOfTime 對任意時間判定一致」

#### Scenario: 雲端歷史：五個區間的界線首尾相接

- **WHEN** 對同一個 `now` 取五個區間的 `rangeBounds`
- **THEN** `today.from === thisWeek.to`、`thisWeek.from === thisMonth.to`、`thisMonth.from === lastMonth.to`、`lastMonth.from === earlier.to`；`today.to` 與 `earlier.from` 為 `null`
- **驗收**：`packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`，it 名稱「五個區間的 rangeBounds 首尾相接且兩端無界」

#### Scenario: 雲端歷史：rangeBounds 產生的界線皆為合法查詢

- **GIVEN** 固定的 `now` 樣本（含週一——本週為空區間——與跨月週——本月為空區間）
- **WHEN** 對每個 `now` 與五個區間，把 `rangeBounds` 的非 `null` 界線轉為十進位字串交給 `HistoryQuerySchema`
- **THEN** 全部解析成功（前端送出的任何區間查詢都不會被後端以 400 拒絕）
- **驗收**：`packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`，it 名稱「rangeBounds 產生的每個區間界線皆通過 HistoryQuerySchema」

#### Scenario: 雲端歷史：共用的歷史查詢與回應 schema

- **WHEN** 以 `HistoryQuerySchema` 解析 `{ from: "300", to: "200" }` 與 `{ from: "100", order: "asc" }`，以 `HistoryListResponseSchema` 解析含 `winner: "draw"` 的回應
- **THEN** 前者失敗；後兩者通過且 `from` 轉為數字 100
- **驗收**：`packages/pickball-core/test/api/history.test.ts`，it 名稱「HistoryQuerySchema 拒絕 from 大於 to 且 HistoryListResponseSchema 接受平局紀錄」

#### Scenario: 雲端歷史：歷史 API 包裝的請求形狀

- **WHEN** 以 `"user-a"` 為第一參數，`{ from: 1, to: 2 }`、`{ order: "asc" }` 與 `{}` 為第二參數呼叫 `fetchRemoteHistory`
- **THEN** `requestJson` 依序收到 `GET /api/matchmaker/history?from=1&to=2`、`?order=asc`、無查詢字串的路徑，且帶回應 schema 與 `expectedUserId: "user-a"`
- **驗收**：`nextjs-pickball/lib/sync/history-api.test.ts`，it 名稱「歷史 API 包裝以正確的查詢字串呼叫 requestJson」

#### Scenario: 雲端歷史：依區間載入雲端歷史

- **GIVEN** `enabled: true`、`userId: "user-a"`、`range: "today"`，假時鐘固定 `now`
- **WHEN** hook mount，之後 `range` 改為 `"lastMonth"`
- **THEN** 第一次 GET 的 `from`／`to` 等於 `rangeBounds("today", now)`、第二次等於 `rangeBounds("lastMonth", now)`；兩次皆帶 `X-Expected-User-Id: user-a`；狀態依序 `loading` → `synced`；回傳 `items`、`total`、`droppedCount` 為最後一次回應
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「依 range 以 rangeBounds 的界線載入雲端歷史並在 range 改變時重新載入」

#### Scenario: 雲端歷史：只採用最後一次請求的結果

- **GIVEN** `range` 由 `"today"` 快速改為 `"thisWeek"`，第一次請求比第二次晚回應
- **WHEN** 兩個回應都到達
- **THEN** 回傳的 `items` 為第二次（`thisWeek`）的回應
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「range 快速切換時只採用最後一次請求的結果」

#### Scenario: 雲端歷史：載入失敗、401 與停用

- **WHEN** GET 回 500；另一次 mount 時 GET 回 401；再一次以 `enabled: false` mount；再一次以 `enabled: true`、`userId: null` mount
- **THEN** 依序為 `load-failed`、呼叫 `onUnauthorized` 一次、後兩次 fetch 皆未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「GET 失敗時為 load-failed，401 時呼叫 onUnauthorized，停用時不發請求」

#### Scenario: 雲端歷史：換帳號時以新帳號重新載入且不顯示前一帳號的歷史

- **GIVEN** `enabled: true`、`userId: "user-a"`、`range: "today"`，已載入 A 的一筆歷史（`total: 1`）
- **WHEN** 以 `userId: "user-b"` rerender，B 的 GET 尚未回應
- **THEN** rerender 後立即讀到 `{ items: [], total: 0, droppedCount: 0, syncStatus: "loading" }`；新 GET 帶 `X-Expected-User-Id: user-b`
- **AND** B 的 GET 回應後 `items` 為 B 的歷史、`syncStatus` 為 `synced`；A 世代晚到的回應不影響結果
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「userId 變更時以新帳號重新載入歷史且不顯示前一帳號的歷史」

#### Scenario: 雲端歷史：兩種空狀態

- **WHEN** 分別以 `{ items: [], total: 0 }` 與 `{ items: [], total: 5 }` 渲染 `RemoteHistoryView`（`range: "thisMonth"`）
- **THEN** 前者顯示引導型空狀態，後者顯示「本月」的區間空狀態
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`，it 名稱「total 為 0 時顯示引導型空狀態，否則顯示區間空狀態」

#### Scenario: 雲端歷史：登入後完成的對戰出現在歷史頁

- **GIVEN** 以測試帳號登入、雲端資料已清空，名單有四位
- **WHEN** 產生一輪、送出一場比分、開啟 `/matchmaker/history`
- **THEN** 「今日」區間顯示該場紀錄（姓名、比分與分數變化）；本機 `matchmaker:history:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入後完成的對戰由雲端顯示在歷史頁且不寫入本機」

#### Scenario: 雲端歷史：載入失敗時歷史頁顯示錯誤

- **GIVEN** 以 `page.route` 讓 `GET /api/matchmaker/history*` 回 500
- **WHEN** 開啟 `/matchmaker/history`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，區間篩選不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「雲端歷史載入失敗時歷史頁顯示錯誤提示」
