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
| `winner` | `"teamA" \| "teamB"` | 勝方 |

`HistoryTeam` MUST 含該隊每位球員的快照：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `players[].id` | string | 球員 id，供日後比對，但 SHALL NOT 作為顯示資料的唯一來源 |
| `players[].name` | string | **姓名快照**，寫入當下的名稱 |
| `players[].ratingBefore` | number | 該員賽前分數 |
| `players[].ratingAfter` | number | 該員賽後分數（clamp 後） |
| `rating` | number | 該隊的隊伍分數（賽前，單打為該員 rating、雙打為兩人總和） |

賽前與賽後分數 MUST 為 **per-player**，SHALL NOT 只保存隊伍層級的一個數字——`prd.md` 9.3.1 的 CSV 匯出明列「各員賽前分數與賽後分數」，且雙打同隊兩人的起點不同，只存隊伍值就無法還原任何一位球員的變化。

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

---

### Requirement: 完成場次時寫入一筆歷史

每完成一場對戰，系統 SHALL 追加**恰好一筆**歷史紀錄（`prd.md` 8.2、6.3）。追加 MUST 為不可變操作——回傳新的歷史陣列，SHALL NOT 就地修改傳入的陣列。

寫入時機 MUST 綁定「場次由未完成轉為 `completed`」這一刻，且與評分更新、`gamesPlayed` 累加同屬一次原子的送出流程（見 `round-lifecycle` 的「比分送出的完成流程」）。

同一場次 SHALL NOT 產生第二筆——已完成場次不得再次送出，這是 `prd.md` 6.5 的既有約束，本 capability 依賴它而非另行去重。

歷史 MUST 以**追加順序**保存，SHALL NOT 在寫入時排序或去重。排序、五個時間區間的篩選與呈現屬後續 milestone；在儲存層先做排序會讓「同一秒完成的兩場」順序不穩定，也讓後續的篩選失去原始順序這個唯一可靠的並列基準。

重設或重排未完成場次 SHALL NOT 刪除或修改任何已寫入的歷史（`prd.md` 6.2 明訂重設保留已完成場次的比分與 Elo 結果）。產生新一輪取代目前回合時同理。

歷史屬於「重置名單」的清除範圍（見 `player-roster`）。

實作位於 `nextjs-pickball/lib/matchmaker/history.ts` 與 `nextjs-pickball/lib/matchmaker/round.ts`。

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

勝方 MUST 以文字或圖示明確標示，SHALL NOT 僅以顏色區分（`prd.md` 12.5：色彩不得為唯一資訊來源）。

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

---

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

歷史頁 SHALL 只**讀取** `matchmaker:history:v1`，SHALL NOT 寫入、修改、刪除或回寫任何歷史紀錄，亦 SHALL NOT 觸發評分更新或回合狀態變更。

讀取 MUST 透過 M4 的 `readHistory()`（`nextjs-pickball/lib/matchmaker/round-storage.ts`）進行，SHALL NOT 自行 `JSON.parse(localStorage.getItem(...))`，也 SHALL NOT 於本 capability 重複寫死 key 字串（key 常數由 `nextjs-pickball/lib/matchmaker/storage-keys.ts` 單一來源匯出）——繞過 reader 會讓損壞資料的逐筆降級規則出現第二套實作，兩套一旦不一致就是資料靜默漏失。

讀取 MUST 在 client 端的 effect 中進行，首次伺服器輸出 SHALL 為空狀態；SHALL NOT 於 render 期間直接讀 LocalStorage 或取用系統時鐘，否則 SSR 與 CSR 的輸出必然不一致而產生 hydration 錯誤（沿用 `player-roster` 的 HYDRATE 模式）。

LocalStorage 不可用（SSR、私密模式）或無資料時 SHALL 顯示空狀態，SHALL NOT 拋出例外中斷畫面。

實作位於 `nextjs-pickball/components/matchmaker/HistoryView.tsx`。

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
