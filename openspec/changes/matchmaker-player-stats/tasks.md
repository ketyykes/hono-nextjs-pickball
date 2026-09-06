> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械
> 核對。
>
> **紅燈要是真的**：`nextjs-pickball/app/matchmaker/stats/page.tsx` 屬本 workspace 的 TDD
> 例外層（見 `nextjs-pickball/CLAUDE.md` 與 design Decision 1），以 E2E 驗收；§6～§8 的
> E2E 紅燈多半來自「路由 404」「表格找不到」，那是真紅燈。若某個測試加入後**立即全綠**，
> MUST 在該項後方誠實標註為 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **本 change 不得新增任何 npm 相依**（design Non-Goals）。需要新套件時回報 BLOCKED。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 的 Open Questions 從假設
> 變成事實，避免 §2 之後整批建立在錯的介面上。

- [x] 1.1 確認目前 cwd 為 environment.md 宣告的 worktree，且 baseline `pnpm test` 全綠；把 baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [x] 1.2 確認 `main` 上 **M10（`matchmaker-stage-gaps`）已合併**：於 `openspec/changes/archive/` 尋找該 change 目錄，或以 `git log --oneline main` 確認其相關 commit 已存在。**不存在則立即停止並回報**，SHALL NOT 在本 change 內補做 M10（見 proposal 的「執行相依」）
- [x] 1.3 讀 `nextjs-pickball/hooks/useRoundStore.ts` 與 `nextjs-pickball/hooks/useRosterStore.ts`，記錄 `UseRoundStoreResult.history`／`UseRosterStoreResult.players` 的實際型別與 `UseRoundStoreOptions` 的必填欄位。與 design Decision 1 的假設逐項比對，**差異一律補記進 design.md 的 Open Questions**，不要默默改實作去遷就；若 `history` 未如假設般存在於回傳值，MUST 依 execution-plan 的升級條件回報人類，SHALL NOT 為了拿資料去改既有 hook 介面
- [x] 1.4 讀 `nextjs-pickball/lib/matchmaker/history.ts`，記錄 `HistoryPlayerSchema`（`id`／`name`／`ratingBefore`／`ratingAfter`）與 `MatchHistoryEntrySchema`（`teamA`／`teamB`／`scoreA`／`scoreB`／`winner`／`format`／`playedAt`）的實際欄位，確認與 design 假設一致
- [x] 1.5 讀 `nextjs-pickball/lib/matchmaker/history-range.ts` 與 `nextjs-pickball/components/matchmaker/HistoryRangeFilter.tsx`，記錄 `filterHistoryByRange(entries, range, now)`／`HISTORY_RANGES`／`HistoryRangeFilterProps` 的實際簽章。§6 的頁面組裝依實際簽章取用，SHALL NOT 重新推導一次區間篩選規則
- [x] 1.6 讀 `nextjs-pickball/lib/matchmaker/section-nav.ts` 與 `nextjs-pickball/lib/matchmaker/section-nav.test.ts`，記錄 `MATCHMAKER_SECTION_HREFS`／`MATCHMAKER_SECTION_LABELS`／`matchmakerSectionTabs()` 的目前內容，以及既有 regression-guard test「分頁清單依序為對戰、參賽者、歷史與資料四筆」的完整斷言內容（§7 需要精確修改這個既有測試）
- [x] 1.7 讀 `nextjs-pickball/lib/matchmaker/colors.ts` 確認 `pickTextColor(colorFrom, colorTo)` 簽章；讀 `nextjs-pickball/lib/matchmaker/labels.ts` 確認目前匯出內容（`TEAM_LABELS`／`TEAM_LABELS_BY_KEY`／`FORMAT_LABEL`／`DOUBLES_COMPOSITION_LABEL` 四個），確認新增 `PLAYER_NOT_ON_ROSTER_LABEL` 不與既有匯出撞名
- [x] 1.8 讀 `nextjs-pickball/lib/matchmaker/types.ts` 確認 `PlayerSchema` 欄位（`id`／`name`／`colorFrom`／`colorTo`／`rating`／`isActive`）；確認 `nextjs-pickball/package.json` 目前無任何圖表或新增相依（本 change 結束時此事實 MUST 不變，Final Review 會以 `git diff package.json` 機械確認）

## 2. 統計計算核心 A：計算範圍、唯讀保證、出場／勝負／勝率（player-stats.ts）

Depends on: §1

- [x] 2.1 RED: 新增 `nextjs-pickball/lib/matchmaker/player-stats.test.ts`，寫入兩個 it：「名單成員即使無出場紀錄仍列入統計結果」、「已離開名單但曾出現於歷史的球員仍列入統計結果」。跑單檔確認紅燈（模組不存在）並貼出輸出
- [x] 2.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/player-stats.ts` 的 `computePlayerStats(history, players)` 骨架：以 `HistoryPlayer.id`／`Player.id` 為鍵，建立「目前名單」與「歷史紀錄中出現過的球員」的聯集，每位球員回傳 `PlayerStat`（`id`／`name`／`colorFrom`／`colorTo`／`onRoster`／`currentRating`／`gamesPlayed`／`wins`／`losses`／`winRate`／`ratingDelta`／`mostFrequentPartner`／`mostFrequentOpponent`，本階段除 `id`／`name`／`onRoster` 外可先給合理預設值）。名單內球員 `onRoster: true`、姓名與色塊取自 `players`；只出現在歷史的球員本階段先給暫定值（§3 補齊）
- [x] 2.3 RED: 補兩個 it：「出場數、勝場與敗場依歷史紀錄正確加總」、「出場數為零時勝率為零而非 NaN」。確認紅燈
- [ ] 2.4 GREEN: 實作出場數（該球員出現的紀錄筆數）、勝場／敗場（依各筆 `winner` 與該球員所屬隊伍判定）、勝率（`wins/gamesPlayed`，`gamesPlayed===0` 時為 `0`）
- [ ] 2.5 RED: 補一個 it：「計算過程不修改輸入的歷史與名單」（以 `structuredClone` 前後深層比對）。跑單檔——若目前實作已無原地操作，本項可能一寫入即綠，**如實標註為 regression guard**，SHALL NOT 為了製造紅燈而刻意讓 2.2／2.4 的實作先寫錯
- [ ] 2.6 GREEN／確認: 若 2.5 為紅燈則修正為不修改輸入（`.slice()`／展開複製而非原地 push／sort）；若為 regression guard 則在本項註明「已確認為 regression guard，原實作未修改輸入」
- [ ] 2.7 REFACTOR: 確認球員聯集的建構只有一處（不在後續 §3／§4 重新掃描一次 `history`／`players`）；確認本檔零 `window`／`document`／`localStorage`／`new Date()`／`fetch`；`PlayerStat` 為可序列化純資料（無函式、無 class 實例）

## 3. 統計計算核心 B：目前強度、已不在名單、強度淨變化（player-stats.ts）

Depends on: §2

- [ ] 3.1 RED: 補兩個 it：「名單內球員的目前強度取自名單目前的 rating」、「已離開名單的球員取歷史最近一筆的 ratingAfter 並標示已不在名單」。確認紅燈
- [ ] 3.2 GREEN: 實作 `currentRating`／`onRoster`：名單內球員直接取 `players` 的 `rating`；不在名單者取其在傳入 `history` 中依 `playedAt` **最近**一筆的 `ratingAfter`（design Decision 4：以 ISO 字串字典序比較，SHALL NOT 依賴輸入陣列的排列順序），`onRoster` 設為 `false`
- [ ] 3.3 RED: 補一個 it：「強度淨變化為所有出場紀錄賽前賽後分數差的加總」。確認紅燈
- [ ] 3.4 GREEN: 實作 `ratingDelta` 為該球員所有出場紀錄的 `ratingAfter - ratingBefore` 加總，`gamesPlayed===0` 時為 `0`
- [ ] 3.5 REFACTOR: 確認「依 `playedAt` 取最近一筆」的比較邏輯只有一個具名 helper（供 §4 的最常搭檔／對手姓名解析共用，design Decision 4 明訂不依賴輸入順序的規則對兩者皆適用）；確認本檔仍零 I/O

## 4. 統計計算核心 C：最常搭檔／最常對手、排行榜排序（player-stats.ts）

Depends on: §3

- [ ] 4.1 RED: 補兩個 it：「最常搭檔為雙打隊友中出現次數最多者」、「從未打過雙打時最常搭檔為 null」。確認紅燈
- [ ] 4.2 GREEN: 實作雙打隊友計數（同隊除自己外的其他球員逐筆計數，只計雙打紀錄）；取次數最多者的姓名，次數相同時依姓名以原生 `<` 排序取前者（design Decision 5，不用 `localeCompare`）；從未出現雙打隊友時為 `null`。姓名解析沿用 §3.5 的最近一次快照 helper（design Decision 4）
- [ ] 4.3 RED: 補一個 it：「最常對手為對戰過的對手中出現次數最多者」。確認紅燈
- [ ] 4.4 GREEN: 實作對方隊伍球員計數（單打與雙打皆計入），取次數最多者的姓名，同分規則與 4.2 相同。SHALL NOT 為對手另寫一份與 4.2 幾乎相同的計數迴圈——兩者共用同一個 tally helper，只有「同隊」或「對方隊」的輸入不同
- [ ] 4.5 RED: 補一個 it：「排行榜依目前強度、勝率、出場數、姓名依序排序」。確認紅燈
- [ ] 4.6 GREEN: 在 `computePlayerStats` 回傳前排序：目前強度 desc → 勝率 desc → 出場數 desc → 姓名（原生 `<`）asc
- [ ] 4.7 REFACTOR: 確認最常搭檔／最常對手的 tally 邏輯共用同一個內部 helper（非兩份幾乎相同的迴圈）；確認排序比較邏輯為單一具名函式；確認 `player-stats.ts` 全檔沒有任何中文顯示字面量（design Decision 2：純資料，文案交給呈現層）

## 5. 排行榜表格元件（PlayerStatsTable.tsx）

Depends on: §4

- [ ] 5.1 RED: 新增 `nextjs-pickball/components/matchmaker/PlayerStatsTable.test.tsx`，寫入一個 it：「球員色塊沿用既有漸層且已不在名單者有文字標示」（傳入一位 `onRoster: true` 與一位 `onRoster: false` 的 `PlayerStat`，斷言在名單者背景為其 `colorFrom→colorTo` 漸層、前景色等於直接呼叫 `pickTextColor` 的回傳值；不在名單者姓名旁出現文字標示）。確認紅燈（元件尚不存在）
- [ ] 5.2 GREEN: 於 `nextjs-pickball/lib/matchmaker/labels.ts` 新增具名常數 `PLAYER_NOT_ON_ROSTER_LABEL = "已不在名單"`（純新增，不改動既有四個匯出）。實作 `nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx`：`"use client"`，props 為 `{ stats: readonly PlayerStat[] }`，使用 `components/ui/table.tsx` 的 `Table`／`TableHeader`／`TableBody`／`TableRow`／`TableCell` 渲染九欄（名次、球員、強度、出場、勝－負、勝率、淨變化、常搭檔、常對手）；球員欄以 `colorFrom`／`colorTo` 內嵌 `linear-gradient` 背景與 `pickTextColor` 前景色呈現色塊，`onRoster===false` 時姓名旁加上 `PLAYER_NOT_ON_ROSTER_LABEL`；`mostFrequentPartner`／`mostFrequentOpponent` 為 `null` 時顯示本檔內具名的佔位符號（單一用途，不進 `labels.ts`）
- [ ] 5.3 REFACTOR: 確認欄位順序與 spec 逐字相符；確認 `PLAYER_NOT_ON_ROSTER_LABEL` 只有這一個消費端且沒有第二份「已不在名單」字面量散在元件內；確認名次為傳入陣列的索引 + 1（`computePlayerStats` 已排序，元件不重新排序）；確認元件不 import 任何 store

## 6. 統計頁掛載：路由、區間整合、空狀態（app/matchmaker/stats/page.tsx）

Depends on: §5

- [ ] 6.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，寫入三個 test：「完全沒有歷史紀錄時顯示引導型空狀態」、「直接開啟 /matchmaker/stats 可載入排行榜表格」、「切換區間後排行榜只反映該區間的歷史紀錄」（種資料方式比照 `matchmaker-history.spec.ts` 的 `seedHistory`／`buildEntry` 慣例，各自在本檔複製一份 fixture helper）。跑該檔確認紅燈（路由不存在／404）並貼出輸出
- [ ] 6.2 GREEN: 實作 `nextjs-pickball/app/matchmaker/stats/page.tsx`：`"use client"`，持有 `const { players, updatePlayer } = useRosterStore();` 與 `const { history } = useRoundStore({ players, updatePlayer });`（design Decision 1，比照 `app/matchmaker/page.tsx` 既有形態，不新增 hook、不新增 View 元件）；以 `useState<HistoryRange>("today")` 持有目前區間；呼叫 `filterHistoryByRange(history, selectedRange, new Date())` 取得篩選後歷史，交給 `computePlayerStats(filteredHistory, players)`；`history.length === 0` 時渲染 `EmptyHistory range={null}`，否則渲染 `HistoryRangeFilter` 與 `PlayerStatsTable`
- [ ] 6.3 REFACTOR: 確認 `page.tsx` 不含任何統計計算或區間篩選邏輯（全數委派既有函式），只做 store 接線與條件渲染；確認頁面標題與說明文字為繁體中文且不與其他 matchmaker 頁面重複措辭

## 7. match-stage：第五個分頁「統計」納入區段導覽

Depends on: §1（可與 §2～§6 並行構思，但仍依「群組間嚴格序列」規定序列執行；§7.3 的 e2e 需要 §6 已完成的頁面才有意義，故排在 §6 之後）

- [ ] 7.1 RED: 修改 `nextjs-pickball/lib/matchmaker/section-nav.test.ts` 既有的 it「分頁清單依序為對戰、參賽者、歷史與資料四筆」——更名為「分頁清單依序為對戰、參賽者、歷史、資料與統計五筆」，並把預期陣列擴充為五筆（新增 `{ label: "統計", href: "/matchmaker/stats", active: false }`）。跑單檔確認紅燈（`matchmakerSectionTabs` 目前仍只回傳四筆），貼出輸出。**這是本 change 對既有測試唯一容許的變動**，見 §9.8
- [ ] 7.2 GREEN: 於 `nextjs-pickball/lib/matchmaker/section-nav.ts` 的 `MATCHMAKER_SECTION_HREFS` 追加 `` `${MATCHMAKER_ROUTE}/stats` ``，`MATCHMAKER_SECTION_LABELS` 追加對應的 `"統計"` 標籤
- [ ] 7.3 RED: 於 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 新增一個 test：「可由對戰頁的區段導覽點擊進入統計頁」（於對戰頁點擊區段導覽的「統計」，斷言導向 `/matchmaker/stats` 且該分頁帶 `aria-current="page"`）。跑該檔確認結果——若 7.2 與 §6 皆已完成，本項**可能一寫入即綠**（連結與導航邏輯皆為既有機制），如實標註為 regression guard，SHALL NOT 為了製造紅燈刻意延後 7.2 的實作
- [ ] 7.4 確認: 若 7.3 為真紅燈則排查原因並修正至綠；若為 regression guard 則在本項註明「已確認為 regression guard，`MatchmakerTabs`／`section-nav.ts` 的既有機制已足夠支援第五分頁」
- [ ] 7.5 REFACTOR: 確認 `section-nav.ts` 的改動僅為兩個陣列各追加一筆，沒有改動既有四筆的順序或內容；確認 `components/matchmaker/MatchmakerTabs.tsx` 未被改動（渲染邏輯完全由 `section-nav.ts` 驅動）

## 8. 唯讀保證與無障礙 E2E

Depends on: §6, §7

- [ ] 8.1 RED: 於 `player-stats.spec.ts` 補兩個 test：「排行榜表格於支援寬度下限不造成整頁橫向溢出」（viewport 390x844，斷言 `document.scrollingElement.scrollWidth <= clientWidth + 1`）、「瀏覽統計頁不改動任何持久化資料」（`matchmaker:roster:v1`／`matchmaker:round:v1`／`matchmaker:history:v1` 皆先種資料，開啟頁面並依序切換五個區間，斷言三個 key 的內容與操作前逐字相同）。跑該檔確認結果——這兩條**很可能加入即綠**（§2～§6 已保證計算與 hook 消費皆為唯讀，`components/ui/table.tsx` 已內建橫向捲動容器），如實標註為 regression guard，SHALL NOT 用「改斷言看紅再改回」偽造紅燈
- [ ] 8.2 確認: 若任一條為真紅燈則排查並修正（例如表格欄位過多需確認 `Table` 的捲動容器確實生效，或發現有遺漏的可存取名稱）；若皆為 regression guard 則如實註明
- [ ] 8.3 REFACTOR: 把 `player-stats.spec.ts` 內「種名單＋種歷史＋開啟頁面」的前置動作收斂為單一 helper（比照 `matchmaker-history.spec.ts` 的 `seedHistory`／`buildEntry` 寫法），本檔全部 test 皆改走該 helper；helper 上方註明「回合／歷史格式來源為 `lib/matchmaker/round-storage.ts` 的 `writeRound`／`writeHistory`，改動請同步」

## 9. 收尾驗證

- [ ] 9.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**
- [ ] 9.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/player-stats`、`--run components/matchmaker/PlayerStatsTable`、`--run lib/matchmaker/section-nav` 全綠，貼出輸出
- [ ] 9.3 `pnpm lint` 通過（0 errors；既有 warning 清單見前一個 change 的紀錄，本 change 不得新增）
- [ ] 9.4 `pnpm typecheck`（`pnpm -r exec tsc --noEmit`）通過
- [ ] 9.5 `pnpm test` 全套通過（確認未破壞 M1～M10 既有測試與 hono-pickball 後端測試）
- [ ] 9.6 `pnpm --filter ./nextjs-pickball test:e2e` 全套通過，**五個 browser project 皆跑**，帶 `--workers=1`；既有 `match-stage.spec.ts`／`matchmaker-history.spec.ts`／`matchmaker-data-transfer.spec.ts`／`visual-export.spec.ts`／`scoreboard-binding.spec.ts` 等既有 spec 原樣通過
- [ ] 9.7 `git diff package.json`、`pnpm-lock.yaml` 為空（本 change 零新增相依）；`git diff --stat` 確認 `hooks/` 零新增、M5～M9 既有元件檔（`MatchStage`／`CourtCard`／`RoundControls`／`RestingPanel`／`ExportActions`／`PrintSheet`／`HistoryView`／`HistoryRecordCard`／`HistoryRangeFilter`／`EmptyHistory`）零改動
- [ ] 9.8 **本 change 唯一容許變動的既有測試**：`nextjs-pickball/lib/matchmaker/section-nav.test.ts` 的 it「分頁清單依序為對戰、參賽者、歷史與資料四筆」→ 更名為「分頁清單依序為對戰、參賽者、歷史、資料與統計五筆」並擴充預期陣列為五筆（§7.1）。**除此之外，其餘既有測試轉紅一律視為迴歸**
- [ ] 9.9 同步 `nextjs-pickball/CLAUDE.md` 的架構總覽：`/matchmaker` 段落補記「`/matchmaker/stats` 提供球員統計與排行榜（milestone M11 = matchmaker-player-stats change）」
- [ ] 9.10 `DO_NOT_TRACK=1 openspec validate matchmaker-player-stats --strict` 通過
- [ ] 9.11 spec 條目重複檢查（依 root `CLAUDE.md` 指定的 python 計數法，**不使用 BSD `uniq`**——它會把內容不同的中文標題誤判為重複），對 `openspec/specs/player-stats/spec.md` 與 `openspec/specs/match-stage/spec.md`（sync 後）分別執行
