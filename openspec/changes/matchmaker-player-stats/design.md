# Design: matchmaker-player-stats

## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- **本 change 是 matchmaker 第一個「彙總計算」段落**。M1～M9 的資料模組多半是「一對一」的
  推導（一場對戰 → 一筆歷史、一份回合 → 一份匯出內容）；本段第一次要把**多筆**歷史紀錄
  折算成**每位球員一筆**的彙總數字，且彙總的球員範圍不等於任何一份既有陣列的原樣子集
  （見下方 Goals 的「聯集」）。
- `nextjs-pickball/lib/matchmaker/history.ts` 的 `HistoryPlayerSchema` 已含
  `id`／`name`／`ratingBefore`／`ratingAfter`，`MatchHistoryEntrySchema` 另帶
  `courtNumber`／`playedAt`／`teamA`／`teamB`／`scoreA`／`scoreB`／`winner`／`format`／
  （雙打限定）`doublesComposition`。本 change 所需的原始資料**已經齊全**，不需要新增或
  修改任何欄位。
- `nextjs-pickball/lib/matchmaker/types.ts` 的 `PlayerSchema` 提供目前名單的即時狀態：
  `id`／`name`／`colorFrom`／`colorTo`／`rating`／`isActive` 等。`isActive`（暫停出場）
  與「已被刪除」是兩種不同狀態——暫停出場的球員仍存在於 `players` 陣列，本 change
  的球員範圍聯集判斷只在意「id 是否存在於 `players`」，不特別處理 `isActive`。
- **本 workspace 的 TDD 分層規範**（`nextjs-pickball/CLAUDE.md`）：`app/**/page.tsx` 屬例外層
  （不強制單元 TDD，以 E2E 驗收）；行為邏輯 MUST 下放 `lib/` 再對其做 TDD。本段的
  「可 TDD 的東西」是 `player-stats.ts` 的彙總計算；`app/matchmaker/stats/page.tsx` 的
  store 接線與畫面組裝屬例外層。
- **既有先例可直接重用，不必重新設計**：
  - 區間篩選：`lib/matchmaker/history-range.ts` 的 `filterHistoryByRange`／
    `HISTORY_RANGES`，與 `components/matchmaker/HistoryRangeFilter.tsx`（M7）。
  - 空狀態：`components/matchmaker/EmptyHistory.tsx`（M7），支援 `range: null` 的
    「完全沒有資料」引導文案。
  - 色塊與前景色：`lib/matchmaker/colors.ts` 的 `pickTextColor`（M1）。
  - 文案常數的單一來源：`lib/matchmaker/labels.ts`（2026-09-03 由 M9 Final Review F-5
    收斂而成，目前含 `TEAM_LABELS`／`TEAM_LABELS_BY_KEY`／`FORMAT_LABEL`／
    `DOUBLES_COMPOSITION_LABEL` 四個匯出）。
- **資料取得的既有兩種形態**：M7 的歷史頁（`app/matchmaker/history/page.tsx` +
  `HistoryView.tsx`）是「server component 入口 + 一個做 hydration 的 client 元件」，
  直接呼叫 `lib/matchmaker/round-storage.ts` 的 `readHistory()`，不經過任何 hook。
  M5 的對戰頁（`app/matchmaker/page.tsx`）則是「`page.tsx` 本身即 `"use client"`」，
  直接持有 `useRosterStore()` 與 `useRoundStore({ players, updatePlayer })` 兩個 hook。
  本 change 需要**同時**取得「目前名單」與「歷史」，且 `useRoundStore` 的
  `history` 欄位本來就存在（M4／M6 已提供，見 `hooks/useRoundStore.ts` 的
  `UseRoundStoreResult.history`），採用 M5 的形態可以不新增任何 hook、不重寫一次
  hydration，見 Decision 1。
- `hooks/useRoundStore.ts` 的 `UseRoundStoreOptions` 要求 `players` 與 `updatePlayer` 兩者
  皆為必填——即使本頁完全不呼叫任何會變動狀態的動作，仍必須把 `useRosterStore()` 的
  `updatePlayer` 原樣傳入，這是既有介面的形狀，不是本 change 引入的耦合。

## Goals

- 讓 M1～M9 已經記錄下來的歷史資料變成一頁「看了就懂」的排行榜，不需要使用者自己心算。
- 統計計算與呈現分層：`player-stats.ts` 只回傳結構化資料（可逐條單元測試），欄位標題、
  「已不在名單」之類的文案交給呈現層與 `labels.ts`。
- 球員範圍為「目前名單」與「歷史紀錄」的**聯集**，讓排行榜同時回答「現在這些人排得怎樣」與
  「以前打過的人後來去哪了」，而不是兩者的交集（否則暫停出場或已刪除的球員會憑空消失）。
- 完全重用 M7 已驗證過的區間篩選與空狀態元件，不重寫第二套。
- 全程唯讀，不新增任何寫入路徑、不新增任何 hook、不新增任何 npm 相依。

## Non-Goals

- **不畫任何圖表或走勢線**。`prd.md` 8.2 未要求視覺化，新增圖表相依會打破 matchmaker
  全段零外部相依的既有狀態（詳見 proposal 的「明確不做」）。
- **不做排行榜的匯出**（JPG／PDF／CSV）。M9 的匯出範圍明訂為「目前回合」，排行榜匯出若有
  需求，需要重新走一輪選型與版面決策，留待後續 change。
- **不做跨裝置或帳號**。矩陣同 M1～M9，本版排行榜只反映目前這台裝置的 LocalStorage。
- **不新增第二套區間篩選、第二套空狀態或第二套色塊/前景色演算法**——全部重用既有模組。
- **不處理「同名不同人」的辨識**。統計以 `HistoryPlayer.id` 為鍵，只要 id 一致即視為同一人；
  id 本身的產生與唯一性由 M1（`crypto.randomUUID()`）保證，不在本段重新討論。

## Decisions

### Decision 1：統計頁比照 M5 對戰頁的形態，`page.tsx` 直接持有兩個既有 hook，不新增 View 元件、不新增 hook

`app/matchmaker/stats/page.tsx` 標 `"use client"`，直接呼叫：

```ts
const { players, updatePlayer } = useRosterStore();
const { history } = useRoundStore({ players, updatePlayer });
```

再以 `useState` 持有目前選取的區間（比照 `HistoryView.tsx` 的 `selectedRange` state），
呼叫 `filterHistoryByRange(history, selectedRange, now)` 取得篩選後的歷史，交給
`computePlayerStats(filteredHistory, players)` 得到排行榜資料，最後渲染
`HistoryRangeFilter` 與（`history.length === 0` 時的 `EmptyHistory`，否則
`PlayerStatsTable`）。

**替代方案**：比照 M7 的「server component `page.tsx` + 專屬 `PlayerStatsView.tsx`
client 元件」形態，`PlayerStatsView` 自行呼叫 `readHistory()`／`readRoster()`。

**否決理由**：
1. `readRoster()`（`lib/matchmaker/storage.ts`）與 `readHistory()`
   （`lib/matchmaker/round-storage.ts`）各自是獨立的 hydration 實作，若本頁重新呼叫兩者，
   等於在 `useRosterStore`／`useRoundStore` 之外又長出第三、第四份 hydration 邏輯，
   且兩者各自的 `droppedCount`（讀取時被丟棄的損壞筆數）需要另外接手處理，否則使用者在
   本頁看不到「有資料損毀」的既有提示。
2. `useRoundStore` 早已把 `history` 暴露在其回傳值中（`UseRoundStoreResult.history`），
   這是 M4／M6 為對戰頁保留即時歷史所留下的既有欄位，本 change 只是**第二個**消費它的頁面，
   不需要繞道 `readHistory()`。
3. 比起「server `page.tsx` + client View」的兩檔形態，直接讓 `"use client"` 的 `page.tsx`
   持有 hook 少一個檔案；M5 已示範這個形態同樣可行且可被完整 E2E 驗收，兩種形態在本 repo
   皆有先例，選較精簡的一種。

**代價**：`page.tsx` 因此不是 server component，首屏無法在伺服器端渲染排行榜內容
（與 M5 對戰頁相同的既有取捨，非本 change 新增）。

### Decision 2：`player-stats.ts` 回傳結構化資料，不內嵌任何顯示文案

`computePlayerStats` 回傳 `PlayerStat[]`，每個元素只有資料欄位（`id`／`name`／`colorFrom`／
`colorTo`／`onRoster`／`currentRating`／`gamesPlayed`／`wins`／`losses`／`winRate`／
`ratingDelta`／`mostFrequentPartner`／`mostFrequentOpponent`），`mostFrequentPartner`／
`mostFrequentOpponent` 為找到搭檔／對手時的**姓名字串**，找不到時為 `null`——**不是**
「尚無紀錄」之類的顯示文字。「已不在名單」的標示文字、「尚無紀錄」的表格佔位符號皆由
`PlayerStatsTable.tsx` 依 `onRoster`／`null` 判斷後才決定要顯示什麼字。

**理由**：沿用 M9 Decision 2（`ExportScene` 不含 CSS 或 canvas 概念）與 M8 對純函式的既有
要求——`lib/` 只回傳資料，文案與呈現決策留給消費端，才能讓 `player-stats.test.ts` 專注在
「算得對不對」而不必斷言中文字串的措辭；措辭要改時也只需要動呈現層，不必碰計算邏輯。

**替代方案**：`computePlayerStats` 直接回傳「已不在名單」「尚無紀錄」等最終顯示字串。
**否決理由**：文案改動（例如未來想把「已不在名單」改成「已退出」）會被迫在純函式的測試裡
斷言中文字串，且會有兩個地方（`player-stats.ts` 與 `labels.ts`）各自決定同一段文案，
與 `nextjs-pickball/CLAUDE.md` 的「對戰文案常數一律加在 `labels.ts`」原則衝突。

### Decision 3：已離開名單球員的色塊使用獨立的中性色常數，不引用 `export-scene.ts` 的模組私有常數

`HistoryPlayerSchema` 不含 `colorFrom`／`colorTo`（歷史快照只留 `id`／`name`／
`ratingBefore`／`ratingAfter`），因此已離開名單的球員在 `player-stats.ts` 內沒有任何顏色
可用。`nextjs-pickball/lib/matchmaker/export-scene.ts`（M9）已有相同情境的既有解法
（`PLACEHOLDER_COLOR_FROM`／`PLACEHOLDER_COLOR_TO`，中性灰），但兩者皆為模組私有常數
（未 `export`），無法被本 change import。

**選擇**：在 `player-stats.ts` 內另訂一組同樣語意的中性色常數（沿用相近的灰階配色），
與 `export-scene.ts` 的常數各自獨立、各自的具名常數各自維護。

**理由**：這與 M9 design Decision 6（檔名格式與 M8 對齊但各自實作、不跨 change import）
是同一條線——兩個模組的「找不到球員時要有備援視覺」是**巧合的相似需求**，不是共用的
業務規則；把它們合併成共用常數會讓 `export-scene.ts`（視覺匯出、canvas 用色）與
`player-stats.ts`（排行榜表格、CSS 用色）產生一條不必要的耦合，日後任一邊想微調色階
都要考慮另一邊會不會被連動影響。

**替代方案**：把 `PLACEHOLDER_COLOR_FROM`／`PLACEHOLDER_COLOR_TO` 從 `export-scene.ts`
改為 `export`，本 change 直接 import。**否決理由**：`visual-export` capability 的既有
Final Review 已認定該檔的私有常數屬於「例外層之外、`ExportScene` 資料層」的內部實作細節，
本 change 若要它改變可見度，等於要求 M9 的既有檔案為了迎合一個不相關的呼叫端而調整封裝，
與「本 change 不動任何 M5～M9 既有元件與模組」的既有原則衝突。

### Decision 4：最常搭檔／最常對手的姓名以「該 id 最近一次出現的姓名快照」決定，不依賴輸入陣列的排列順序

同一位球員的姓名在不同歷史紀錄中可能不同（改名後，`history.ts` 的姓名快照設計就是為了
保留當時的姓名）。計算某位球員 P 的最常搭檔／最常對手時，若同一個對象 id 在多筆紀錄中
出現、且姓名快照不同，`player-stats.ts` MUST 取其中 `playedAt` **最近**的一筆姓名作為
顯示值，比較依據是 ISO 8601 字串本身的字典序（與 `history-range.ts` 的既有慣例一致，
不额外 `new Date()` 解析）。

**理由**：純函式的輸出不應相依於呼叫端傳入陣列的排列順序（呼叫端傳入的可能是
`filterHistoryByRange` 排序過的陣列，也可能是任意順序的測試 fixture）。若簡化成「以陣列
迭代順序最後出現者為準」，函式的行為會隨呼叫端排序方式而改變，這種相依在測試中不易察覺，
卻會在「呼叫端剛好換了排序方式」時產生無法歸因的顯示差異。以 `playedAt` 明確比較則與輸入
順序無關，行為完全由資料本身決定。

**替代方案**：只取任一次出現的姓名（例如第一次見到即定案，之後忽略）。**否決理由**：
若某人改名，舊姓名會一直顯示到重新整理歷史紀錄順序的巧合發生，使用者會看到明顯過期的
名字，且無法解釋為什麼。

### Decision 5：排序的姓名比較採 UTF-16 code unit（原生 `<`／`.sort()`），不使用 `localeCompare`

排行榜排序第四層（姓名）與「最常搭檔／最常對手」同分時的姓名 tie-break，皆使用 JavaScript
原生字串比較，SHALL NOT 使用 `localeCompare`。

**理由**：沿用 `nextjs-pickball/lib/matchmaker/duplication.ts` 既有的具名決策
（`sortedJoin` 的檔頭註解：「用內建 `.sort()`（依 UTF-16 code unit 比較）而非
`localeCompare`：… 且能避開 CLAUDE.md 記錄過的 locale-aware 排序在中文環境下不穩定的
地雷」）。`duplication.ts` 該處排序的是不透明 id，本段排序的是姓名（真正的中文文字），
理應更需要語系排序，但既有教訓是 locale-aware 排序在本專案的執行環境下不穩定
（不同機器／Node 版本可能得到不同順序），而排行榜的名次必須是**決定性、可重現**的——
兩位球員的相對順序不能因為跑測試的機器不同而改變。因此排序穩定性優先於語系排序的
「正確筆畫／拼音順序」，與既有 `duplication.ts` 的判斷保持一致。

### Decision 6：`mostFrequentOpponent` 進入表格為第九欄，不是只算不顯示的暗資料

`computePlayerStats` 同時輸出 `mostFrequentPartner` 與 `mostFrequentOpponent`
兩個欄位，`PlayerStatsTable.tsx` 的欄位 MUST 兩者都顯示（常搭檔、常對手各一欄，
共九欄：名次、球員、強度、出場、勝負、勝率、淨變化、常搭檔、常對手）。

**理由**：M9 Final Review 的既有 checklist 明文要求「`ExportScene` 的欄位全數有消費端，
零 dead data」；若 `mostFrequentOpponent` 只被計算卻從不顯示，就是同一種問題在本 change
重演。九欄在 390px 寬度下會需要表格自身捲動（`components/ui/table.tsx` 的 `Table`
元件已內建 `overflow-x-auto` 容器，見 Decision 7），這是可接受的代價——比起讓一個欄位
的計算變成無人消費的暗資料，捲動是更小的成本。

### Decision 7：RWD 不寫獨立的三斷點 CSS，直接沿用 `components/ui/table.tsx` 內建的橫向捲動容器

`match-stage` 的「對戰頁的響應式三斷點」Requirement 是為了「場地內容＋休息名單」兩塊
需要換位置的版面而寫的正式三斷點規則（桌面左右並排／平板上下堆疊／手機單欄）。排行榜
是單一表格，沒有「兩塊內容換位置」的版面問題，唯一的 RWD 風險是「欄位太多，窄螢幕放不下」
——這正是 `components/ui/table.tsx` 的 `Table` 元件已經解決的問題：其 `data-slot=
"table-container"` 外層 `div` 內建 `overflow-x-auto`，表格本身可以在容器內橫向捲動而不會
撐開頁面。

**選擇**：不另寫斷點特化的 CSS 或版面切換邏輯，只驗證「頁面本身不因表格而橫向溢出」這一條
（與 `match-stage` 相同的支援寬度下限 390px），表格內容在窄螢幕上依賴內建捲動即可完整讀到。

**替代方案**：仿照 `match-stage` 訂出三個明確斷點各自的欄位增減規則（例如手機只顯示部分
欄位）。**否決理由**：目前只有 9 欄，不像 `match-stage` 的場地／休息名單那樣是「兩個獨立
區塊要換位置」的結構性問題；為了 9 欄表格另訂三套欄位增減規則會讓「排行榜欄位有時看得到
有時看不到」，且要另外維護一份「哪個斷點該藏哪一欄」的清單，成本大於直接讓表格捲動。

## Risks / Trade-offs

- **[已離開名單球員沒有已知色塊，Decision 3 的中性色與 `export-scene.ts` 是視覺上巧合的
  重複]** → 已於 Decision 3 說明為刻意的獨立實作，不跨 change import。緩解：兩處常數皆有
  清楚註解記錄「為什麼是灰色、為什麼不共用」，日後若要統一為共用調色盤，屬於後續 change
  的重構工作，不影響任何一方目前的正確性。

- **[九欄表格在小螢幕需要橫向捲動才能看到全部欄位]** → 見 Decision 6／7。緩解：`名次`／
  `球員`（含色塊與姓名）固定在表格最前面兩欄，使用者捲動時至少能持續辨認「這一列是誰」。

- **[`player-stats.ts` 的聯集邏輯若名單或歷史其中一份為空陣列時容易被忽略邊界]** →
  test-plan 已把「名單成員 0 出場」「已離開名單」兩種聯集邊界各自列為獨立 Scenario，
  且兩者的資料來源分別只需要 `players` 或 `history` 其中一份非空，天然涵蓋「另一份為空」
  的情況。

- **[目前強度不受區間篩選影響，可能讓使用者誤以為「篩選沒有生效」]** → 這是 Decision 1 與
  `player-stats.ts` 契約下的必然結果：目前強度描述的是「這個人現在多強」，不是「這段期間
  多強」，篩選只改變出場數／勝負／淨變化／搭檔對手這些**期間內**的統計。緩解：spec 的
  「目前強度與已離開名單球員的標示」Requirement 已明文這條規則，且欄位標題為「目前強度」
  而非「本期強度」，文案本身已避免這個誤解。

- **[本 change 撰寫時 M10 尚未確認合併，`main` 上的實際檔案可能已有調整]** → 見下方
  Open Questions 第 1 條，apply §0 MUST 以合併後的 `main` 重新對齊。

## Open Questions

1. **M10（`matchmaker-stage-gaps`）是否觸及本 change 消費的任一檔案？**
   撰寫本文件時 `main` HEAD 為 `3fa2d22`，M10 尚未開跑，本 change 依 proposal 的「執行相依」
   假設 M10 不觸及 `lib/matchmaker/section-nav.ts`、`lib/matchmaker/history.ts`、
   `lib/matchmaker/history-range.ts`、`hooks/useRoundStore.ts`、`hooks/useRosterStore.ts`、
   `lib/matchmaker/colors.ts`、`lib/matchmaker/labels.ts`、`components/matchmaker/
   HistoryRangeFilter.tsx`、`components/matchmaker/EmptyHistory.tsx`。**apply 的 §0 前置
   確認 MUST 以合併後的 `main` 重新讀過這些檔案的實際簽章與內容**，若與本文件所述不符，
   一律以 `main` 實況為準並把差異補記於本節，不得依本文件撰寫時的假設開工；若 M10 使
   `section-nav.ts` 的內容與本 change 的 `match-stage` MODIFIED 區塊不再逐字相符
   （例如 M10 也改了同一個 Requirement 或同一個檔案），MUST 重新對齊該 MODIFIED 區塊
   後才能繼續，SHALL NOT 直接套用本文件寫定的版本覆蓋 M10 的變動。

   **【apply §1 對齊結論，2026-09-06 實測，base = `main` HEAD `5e564ee`】**

   M10 已合併（merge commit `56331b0`）。以 `git show --stat 56331b0` 機械確認 M10 觸及的
   檔案僅五個：`components/matchmaker/EmptyMatches.tsx`（新增）、
   `components/matchmaker/HistoryView.tsx`、`components/matchmaker/MatchStage.tsx`、
   `tests/e2e/specs/match-stage.spec.ts`、`tests/e2e/specs/matchmaker-history.spec.ts`
   （其餘為 M10 自身的 openspec 文件）。**本 change 消費的九個檔案 M10 全數未觸及**，
   `match-stage` 的 MODIFIED 區塊無需重新對齊。逐項核對結果：

   - `hooks/useRoundStore.ts`：`UseRoundStoreOptions` 為 `{ players: readonly Player[];
     updatePlayer: (id, patch) => void }` 兩者皆必填；`UseRoundStoreResult` 確實含
     `history: MatchHistoryEntry[]` 與 `droppedCount: number`。**與 Decision 1 假設一致**。
   - `hooks/useRosterStore.ts`：`UseRosterStoreResult` 含 `players: Player[]` 與
     `updatePlayer(id, patch)`。**與假設一致**。
   - `lib/matchmaker/history.ts`：`HistoryPlayerSchema` 為
     `{ id, name, ratingBefore, ratingAfter }`；`HistoryEntryBaseSchema` 為
     `{ matchId, courtNumber, playedAt, teamA, teamB, scoreA, scoreB, winner }`，
     `winner` 為 `z.enum(["teamA","teamB"])`，`format` 由 discriminated union 提供。
     `HistoryTeamSchema` 為 `{ players: HistoryPlayer[], rating: number }`
     ——**注意隊伍球員在 `team.players` 底下，不是 `teamA` 直接是陣列**。
   - `lib/matchmaker/history-range.ts`：`filterHistoryByRange(entries, range, now)` 簽章
     一致，回傳已依 `playedAt` 由新到舊排序後再篩選；`HISTORY_RANGES` 為
     `["today","thisWeek","thisMonth","lastMonth","earlier"]`。
   - `components/matchmaker/HistoryRangeFilter.tsx`：`HistoryRangeFilterProps` 為
     `{ value: HistoryRange; onChange: (range) => void }`，`role="radiogroup"`
     且 `aria-label="歷史區間"`。
   - `components/matchmaker/EmptyHistory.tsx`：`EmptyHistoryProps` 為
     `{ range: HistoryRange | null }`，`range === null` 走引導型空狀態分支。
   - `lib/matchmaker/section-nav.ts`：`MATCHMAKER_SECTION_HREFS` 與
     `MATCHMAKER_SECTION_LABELS` **皆為模組私有（未 `export`）**，僅
     `MATCHMAKER_ROUTE`／`matchmakerSectionTabs()`／`MatchmakerSectionTab` 對外匯出。
     §7.2 只需在這兩個私有陣列／物件各追加一筆，不需要調整可見度。
   - `lib/matchmaker/colors.ts`：`pickTextColor(colorFrom, colorTo): string` 簽章一致。
   - `lib/matchmaker/labels.ts`：目前僅四個匯出（`TEAM_LABELS`／`TEAM_LABELS_BY_KEY`／
     `FORMAT_LABEL`／`DOUBLES_COMPOSITION_LABEL`），新增
     `PLAYER_NOT_ON_ROSTER_LABEL` 不撞名。
   - `lib/matchmaker/types.ts`：`PlayerSchema` 為
     `{ id, name, colorFrom, colorTo, rating: z.number().min(1).max(8), isActive, ... }`。
   - `components/ui/table.tsx`：外層 `data-slot="table-container"` 的 `div` 帶
     `relative w-full overflow-x-auto`，Decision 7 的前提成立；匯出含
     `Table`／`TableHeader`／`TableBody`／`TableRow`／`TableHead`／`TableCell` 等。
   - `nextjs-pickball/package.json`：目前無任何圖表相依，`dependencies` 13 筆
     （`@opennextjs/cloudflare`／兩個 radix／`class-variance-authority`／`clsx`／
     `lucide-react`／`motion`／`next`／`radix-ui`／`react`／`react-dom`／
     `tailwind-merge`／`zod`）。本 change 結束時此清單 MUST 不變。
   - `app/matchmaker/` 目前有 `data`／`history`／`players` 三個子路由與
     `layout.tsx`／`page.tsx`，**尚無 `stats/`**（§6 為全新目錄）。

   **偏離記錄**：本批依 coordinator 指示不使用 git worktree，直接在主 repo 的
   `change/matchmaker-player-stats` 分支上執行（見 environment.md 的 Verification）。
   execution-plan 與本檔中所有「worktree 絕對路徑」一律改讀為
   `/Users/m2_24gb/Desktop/project/nextjs-pickball`。

1-b. **【apply §5 裁決，2026-09-06】delta spec 內部字面矛盾：「勝－負」vs「勝負」**

   `specs/player-stats/spec.md` 的 Requirement prose 原本把第五欄寫成「**勝－負**」，但同一份
   spec 的 Scenario「直接開啟 /matchmaker/stats 顯示排行榜表格」要求 §6 的 E2E 能在標題列比對到
   「**勝負**」這個連續子字串——帶破折號的標題不含「勝負」，兩者不可能同時滿足。

   對照可知 Scenario 的九個詞**全部都是欄位全名的子字串**（「強度」⊂「目前強度」、「出場」⊂
   「出場數」、「淨變化」⊂「強度淨變化」、「常搭檔」⊂「最常搭檔」），唯獨「勝負」⊄「勝－負」
   ——破折號是 prose 敘述時的便利寫法，不是 UI 文案規定。

   **裁決**（§5 Stage 1 Reviewer 判定，leader 採納）：Scenario 是可執行、可機械驗證的契約，
   prose 是自然語言描述；實作採「勝負」是正確的。已把 `specs/player-stats/spec.md`、本檔
   Decision 6、`proposal.md` 三處的「勝－負」一併更正為「勝負」，避免 archive 時把這個自相矛盾
   同步進主 spec。`tasks.md` 的 5.2 保留原始指派文字作為歷史紀錄，不回頭改寫。

1-c. **【apply §6～§8 發現，coordinator 已追認處置，archive 前仍需複核 spec 措辭】
   統計頁實際上會把三個 LocalStorage key 重新序列化寫回**

   spec「統計頁的可用性、無障礙與唯讀保證」寫的是「統計頁 SHALL NOT 修改回合、名單或任何
   LocalStorage 資料，SHALL NOT 呼叫任何 store 的 setter」。**前半句與實作不符，後半句相符。**

   **事實**（leader 逐行複驗 + §8 mutation 實驗確證，不是推測）：Decision 1 選的 hook 形態下，
   `hooks/useRosterStore.ts` 與 `hooks/useRoundStore.ts` 的 write effect 以 `hasHydratedRef`
   守門——mount 時跳過，但 hydrate effect 一 dispatch `HYDRATE`，state 就變動，write effect
   隨即觸發 `writeRoster`／`writeRound`／`writeHistory`。§8 的 mutation M4a／M4b／M4c 各自對
   一個 key 種入「合法但非 schema 序列化順序」的資料，三次都在**對應的那個 key** 上轉紅
   ——這正面證明了三個 key 都真的被回寫（否則非正規化的種入值會原封不動留著、比對照樣通過）。

   **這不是 M11 引入的**：`/matchmaker` 對戰頁（M5）採同一形態、同樣會回寫。
   `HistoryView`（M7）只呼叫 `readHistory()`、從不碰 roster／round，所以歷史頁的同名唯讀 test
   能真的成立，統計頁不能照抄。

   **處置**（leader 於 §8 開工前裁決，coordinator 於 2026-09-06 回覆「方案①合理，追認」）：
   維持 Decision 1，照 spec 的 Scenario **字面實作**——以應用程式自己寫出的正規化形狀種資料
   （真實使用者資料一律如此，因為都是這兩個 store 自己寫的），此時回寫是逐位元組相同的重新
   序列化，「逐字相同」的斷言成立。並在 `tests/e2e/specs/player-stats.spec.ts` 該 test 上方
   寫明「這條斷言證明了什麼」（切換區間與瀏覽本身不會改變持久化內容，能抓到誤觸 store setter
   的迴歸）與「它沒有證明什麼」（頁面確實會回寫；逐字相同成立的前提是種入資料已正規化，
   若資料被手動編輯過或來自舊版格式，回寫會使其正規化而讓逐字比對失敗）。

   **archive 前仍需複核的一點**：上述追認來自 coordinator（派工方），**不等同專案使用者對 spec
   措辭的核可**。delta spec 這句話會在 archive 時同步進主 spec，屆時主 spec 將帶有一句與實作
   有落差的 SHALL NOT。是否要補一句限定（例如「store hydration 造成的等值重新序列化不視為
   修改」），或維持現狀並以本條 Open Question 作為說明，留待人類決定。

2. **Elo 走勢圖是否值得做成獨立 change？** 本 change 的 Non-Goals 已排除圖表；若使用者
   日後認為排行榜的「淨變化」不足以呈現趨勢，需另外評估圖表庫選型（是否比照 M9 的
   canvas 手繪零相依路線，或首次為 matchmaker 引入一個圖表套件）。這是產品優先序問題，
   不在本 change 決定。

3. **九欄表格是否該提供「隱藏常搭檔／常對手欄」之類的個人化設定？** 目前判斷不需要
   （見 Decision 6／7 的成本評估），但若使用者實際使用後反映窄螢幕捲動體驗不佳，
   可能需要重新評估，不在本 change 處理。
