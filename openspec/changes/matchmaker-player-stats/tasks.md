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
- [x] 2.4 GREEN: 實作出場數（該球員出現的紀錄筆數）、勝場／敗場（依各筆 `winner` 與該球員所屬隊伍判定）、勝率（`wins/gamesPlayed`，`gamesPlayed===0` 時為 `0`）
- [x] 2.5 RED: 補一個 it：「計算過程不修改輸入的歷史與名單」（以 `structuredClone` 前後深層比對）。**已確認為 regression guard**：寫入當下即綠（5 tests passed），`buildRosterUnion`／`tallyGamesAndResults` 全程只讀取 `history`／`players` 的欄位值並寫入另外配置的 `MutableStat`，未曾對輸入陣列或物件做 push／sort／賦值等原地操作，故未刻意讓 2.2／2.4 先寫錯來製造紅燈
- [x] 2.6 GREEN／確認: 已確認為 regression guard，原實作未修改輸入——`grep -n "push\|\.sort(\|\[.*\] ="` 對 `player-stats.ts` 全檔無命中，2.7 的 mutation 測試另行複驗
- [x] 2.7 REFACTOR: 確認球員聯集的建構只有一處（不在後續 §3／§4 重新掃描一次 `history`／`players`）；確認本檔零 `window`／`document`／`localStorage`／`new Date()`／`fetch`；`PlayerStat` 為可序列化純資料（無函式、無 class 實例）

> **§2 兩階段審查結論（2026-09-06）**
> - Stage 1（規格）：`APPROVED`，必須修正項零。5 個 it 名稱與 delta spec 驗收錨點逐字相符；
>   2.1／2.3 的紅燈宣稱以 `git show <commit>^:<path>` 複驗屬實；2.5／2.6 的 regression guard
>   標註屬實。
> - Stage 2（品質）：`APPROVED`。獨立跑 17 個變異，**修正前有 8 個存活**——Implementer 自述的
>   「3 次 mutation、零存活」屬取樣過窄（非造假）。Stage 2 依授權在 `5eb37f2` 內補斷言，
>   殺掉其中 6 個（`onRoster` 兩分支、名單／歷史兩處姓名來源、名單色塊來源與 `colorFrom`／
>   `colorTo` 對調、聯集去重路徑），並把測試 fixture 的 `as MatchHistoryEntry` 改為既有
>   codebase 樣板 `Partial<Omit<Extract<MatchHistoryEntry, { format: "singles" }>, "format">>`
>   （原斷言會放行「單打 fixture 帶 doublesComposition」這種非法組合）。未動任何產品程式碼。
> - **剩餘 2 個存活變異**：① 中性灰的確切色碼——Decision 3 只要求常數存在且有註解、不指定色值，
>   斷言色碼會變成 change-detector test，視覺驗收落在 §5.1；② 名單分支 `currentRating` 取自
>   `players.rating`——屬 §3 的既定範圍，**§3.1 的 it「名單內球員的目前強度取自名單目前的
>   rating」MUST 真的殺掉這個變異**（見 §3 前的交棒註記）。
>
> **§2 → §3 交棒（Stage 2 指定，MUST 執行）**
> 1. §3.1 的 RED MUST 在「名單分支 `currentRating: player.rating` 改成 `0`」這個變異下轉紅，
>    否則代表該 it 的斷言不足。
> 2. `player-stats.ts` 的 `MutableStat` 與 `buildRosterUnion` JSDoc 目前含「§3.2 會改用…」
>    「§3／§4 補齊」等指向未完成章節的臨時說明，§3／§4 落地後 MUST 一併更新，
>    否則會留下與實作不符的過期註解。

## 3. 統計計算核心 B：目前強度、已不在名單、強度淨變化（player-stats.ts）

Depends on: §2

- [x] 3.1 RED: 補兩個 it：「名單內球員的目前強度取自名單目前的 rating」、「已離開名單的球員取歷史最近一筆的 ratingAfter 並標示已不在名單」。確認紅燈。「已離開名單」該筆為真紅燈（`expected +0 to be 7`）；「名單內球員」該筆因 §2 已實作 `currentRating: player.rating` 而立即綠燈，屬 regression guard，但已依交棒事項對「roster 分支改成 0」的變異做 mutation 驗證並確認轉紅（見 §3 mutation 紀錄）
- [x] 3.2 GREEN: 實作 `currentRating`／`onRoster`：名單內球員直接取 `players` 的 `rating`；不在名單者取其在傳入 `history` 中依 `playedAt` **最近**一筆的 `ratingAfter`（design Decision 4：以 ISO 字串字典序比較，SHALL NOT 依賴輸入陣列的排列順序），`onRoster` 設為 `false`。新增 `pickValueAtLatestPlayedAt`／`latestRatingAfterByPlayer` 兩個具名 helper
- [x] 3.3 RED: 補一個 it：「強度淨變化為所有出場紀錄賽前賽後分數差的加總」。確認紅燈（`expected +0 to be close to 0.07`）
- [x] 3.4 GREEN: 實作 `ratingDelta` 為該球員所有出場紀錄的 `ratingAfter - ratingBefore` 加總，`gamesPlayed===0` 時為 `0`。新增 `tallyRatingDelta`
- [x] 3.5 REFACTOR: 已確認「依 `playedAt` 取最近一筆」邏輯只有 `pickValueAtLatestPlayedAt` 這一個具名 helper（`latestRatingAfterByPlayer` 呼叫它取得 off-roster 的 `ratingAfter`，供 §4 姓名解析共用同一份比較邏輯）；本檔仍零 `window`／`document`／`localStorage`／`new Date()`／`fetch`，無壞味道需處理

> **§3 兩階段審查結論（2026-09-06）**
> - Stage 1（規格）：`APPROVED`，必須修正項零。3.1／3.3 的紅燈宣稱以
>   `git show <commit>^:<path>` 複驗屬實（`787b801^` 的 off-roster 分支 `currentRating` 固定為
>   0、`59a3767^` 回傳的 `ratingDelta` 固定為 0）；3.1 的「名單內球員…」如實標註為
>   regression guard；§2 既有 5 個 it 的斷言逐行未動。
>   **觀察項**：spec prose 有「出場數為 0 時淨變化 MUST 為 0」，但 test-plan／delta spec 的
>   Scenario 清單只列 golden path 一列，屬上游 artifact 的覆蓋缺口，非 Implementer 責任。
> - Stage 2（品質）：`APPROVED`。獨立跑 20 個變異（18 次實跑），**修正前 3 個存活**
>   （`latestRatingAfterByPlayer` 只掃 teamA、`tallyRatingDelta` 只掃 teamA、`!stat` 守衛移除）。
>   Stage 2 依授權於 `7451aea` 只改測試檔補斷言，殺掉前兩個，並順手處理 Stage 1 的觀察項
>   （在既有 it「出場數為零時勝率為零而非 NaN」內補 `ratingDelta === 0`，**未新增也未改名任何
>   `it`**，總數維持 8 個，驗收錨點逐字不變）。
>   **剩餘 1 個存活變異判定為 equivalent mutant**：`tallyRatingDelta`／`tallyGamesAndResults` 的
>   `if (!stat) continue` 守衛——`buildRosterUnion` 已把 `history` 中每一位球員收進 union，
>   而兩個 tally 掃的是同一份 `history`，`stats.get(id)` 在所有可達輸入下必定有值；該守衛是
>   `Map.get(): T | undefined` 的型別收窄手段，移除它只會被迫改寫成 `!` 或 `as`，更差。
> - §3.5 的單一 helper 要求已機械確認：全檔 `playedAt` 的比較只在
>   `pickValueAtLatestPlayedAt` 內一處，且其簽章為泛型
>   `<T>(candidates: readonly { playedAt: string; value: T }[]): T | undefined`，
>   §4 可直接傳 `{ playedAt, value: name }` 解析姓名，未硬綁 `ratingAfter`。
>
> **§3 → §4 交棒（Stage 2 指定，MUST 處理）**
> 1. **不要把「先建 `Map<id, candidates[]>` 再逐一取最大」的收集骨架抄第三次**。§4 若為姓名
>    再抄一份，本檔就會有兩份幾乎相同的 map-building。建議在 §4.7 REFACTOR 把收集也抽成
>    泛型 helper，並讓 `latestRatingAfterByPlayer` 一併改走它。
> 2. **`playedAt` 完全相同的兩筆紀錄目前由陣列順序決勝**（`>` 為嚴格大於，先遇者留下），
>    嚴格說仍與 design Decision 4 的「不依賴輸入陣列排列順序」有張力。§4.2／§4.7 MUST 擇一：
>    ① 加一層確定性 tie-break（同 `playedAt` 時取姓名 UTF-16 較前者，正好與 Decision 5 同調），
>    或 ② 在 helper 的 JSDoc 明文記載「同 `playedAt` 視為不可區分、取先遇者」為已知且可接受
>    的行為。SHALL NOT 沉默略過。
> 3. **§4 的測試 fixture MUST 讓受測球員同時出現在 `teamA` 與 `teamB` 的紀錄**。§3 實測證明
>    「只掃 teamA」這類漏半邊的變異，在 fixture 全部集中於 teamA 時會存活。

## 4. 統計計算核心 C：最常搭檔／最常對手、排行榜排序（player-stats.ts）

Depends on: §3

- [x] 4.1 RED: 補兩個 it：「最常搭檔為雙打隊友中出現次數最多者」、「從未打過雙打時最常搭檔為 null」。確認紅燈。前者為真紅燈（`expected null to be '甲'`）；後者為 regression guard（實作固定回傳 `null`，寫入當下即綠）
- [x] 4.2 GREEN: 實作雙打隊友計數（同隊除自己外的其他球員逐筆計數，只計雙打紀錄）；取次數最多者的姓名，次數相同時依姓名以原生 `<` 排序取前者（design Decision 5，不用 `localeCompare`）；從未出現雙打隊友時為 `null`。姓名解析沿用 §3.5 的最近一次快照 helper（design Decision 4）
- [x] 4.3 RED: 補一個 it：「最常對手為對戰過的對手中出現次數最多者」。確認紅燈（`expected null to be '丙'`）
- [x] 4.4 GREEN: 實作對方隊伍球員計數（單打與雙打皆計入），取次數最多者的姓名，同分規則與 4.2 相同。SHALL NOT 為對手另寫一份與 4.2 幾乎相同的計數迴圈——兩者共用同一個 tally helper（`tallyPairs`），只有「同隊」或「對方隊」的輸入不同
- [x] 4.5 RED: 補一個 it：「排行榜依目前強度、勝率、出場數、姓名依序排序」。確認紅燈——名單陣列刻意打亂排列（不依期望順序），避免聯集插入順序巧合符合期望而偽造綠燈
- [x] 4.6 GREEN: 在 `computePlayerStats` 回傳前排序：目前強度 desc → 勝率 desc → 出場數 desc → 姓名（原生 `<`）asc
- [x] 4.7 REFACTOR: 確認最常搭檔／最常對手的 tally 邏輯共用同一個內部 helper（非兩份幾乎相同的迴圈）；確認排序比較邏輯為單一具名函式；確認 `player-stats.ts` 全檔沒有任何中文顯示字面量（design Decision 2：純資料，文案交給呈現層）。另依交棒事項新增 `collectCandidatesByPlayer` 泛型 helper 收斂候選收集骨架，並在 `pickValueAtLatestPlayedAt` JSDoc 記錄 `playedAt` 同值 tie-break 決策（擇方案②文件化）。自我 mutation 測試找到 2 個存活並已補斷言修正（詳見交件回報）

> **§4 兩階段審查結論（2026-09-06）**
> - Stage 1（規格）：`APPROVED`，必須修正項零。四條紅燈宣稱複驗屬實（`c6ae3de^`／`7fe0143^` 的
>   兩欄硬編 `null`、`a0a6757^` 全檔無 `.sort(`）；「從未打過雙打時最常搭檔為 null」的
>   regression guard 標註屬實；`localeCompare` 全檔零實際呼叫（唯一命中是註解中的禁令文字）。
>   Stage 1 另裁定 **4.5 的 fixture 擴為 8 人是必要補強**：若嚴格照 Scenario 字面「四位球員且
>   強度兩兩相同」出題，全員 rating 相同，**根本測不出「強度層優先於其他層」**。
> - Stage 2（品質）：`APPROVED`。獨立跑 **27 個變異，首輪 5 個存活**：
>   ① `pickMostFrequentName` 的 `>` 放寬為 `>=`（既有平手測試的正解恰為後遇者，巧合答對）；
>   ② 移除排序第 3 層 `gamesPlayed`（原 fixture 的出場數層與姓名層期望順序一致，**該層等於完全
>   沒被測到**）；③ `latestNameByPlayer` 改成取最早姓名快照（**design Decision 4 的 MUST 在 §4
>   原本零覆蓋**——§3 的測試只涵蓋 `ratingAfter`，不涵蓋姓名）；④ `mostFrequentOpponent` 無紀錄
>   時回 `""`（對手欄的 `null` 邊界原本無任何斷言）；⑤ 等價變異（見下）。
>   Stage 2 依授權於 `6fa95c9` 只改測試檔補齊前四項，並把 `collectCandidatesByPlayer` 的參數
>   型別由索引存取鏈改為具名 `HistoryPlayer`（語意零變更）。
>   **剩餘 1 個存活變異判定為 equivalent mutant**：`pickMostFrequentName` 對未知姓名的防禦分支
>   不可達——`counts` 的 key 必由 `extractPairs` 從同一份 `history` 產生，而 `nameById` 涵蓋該
>   `history` 每一隊每一位球員，`nameById.get(id)` 在合法輸入下永不為 `undefined`；移除它會逼出
>   非空斷言，反而更差。
> - Stage 2 另判定 **`player-stats.ts` 不拆檔**（399 行、12 個函式，低於 `round.ts` 的 915 行、
>   與 `duplication.ts` 的 328 行同量級；且 §5～§8 產出的是元件與頁面，不會再往本檔加程式碼，
>   本檔已近終態）。
> - `efd8464` 對 §3 既有 `latestRatingAfterByPlayer` 的泛型重構經 `git show 8f7d7e9:` 逐行對照，
>   確認為**語意等價**（迴圈逐字相同，只把 `historyPlayer.ratingAfter` 換成 `valueOf(historyPlayer)`），
>   型別未變鬆（泛型 `<T>`，無 `any`、無新增 `as`）。
>
> **§4 → §5 交棒（Stage 2 指定，MUST 遵守）**
> 1. `mostFrequentPartner`／`mostFrequentOpponent` 的 `null` 現在有雙欄斷言守住。
>    `PlayerStatsTable.tsx` MUST 自行把 `null` 轉成顯示用的佔位文字（Decision 2），
>    **SHALL NOT** 回頭要求 `player-stats.ts` 直接回傳文案。
> 2. `computePlayerStats` 的回傳**已排序完成**，§5 的元件 **SHALL NOT 再排一次**；「名次」欄直接
>    用陣列索引 +1。元件內若出現第二處 `.sort()`，4.7 的「單一具名函式」要求即被打破。
> 3. `player-stats.ts` 已近終態，§5～§8 **不應再往本檔加程式碼**——這是「不拆檔」判定的前提。
> 4. 已知等價變異（`pickMostFrequentName` 的未知姓名防禦分支不可達）已文件化，§5 不需為它補測試。

## 5. 排行榜表格元件（PlayerStatsTable.tsx）

Depends on: §4

- [x] 5.1 RED: 新增 `nextjs-pickball/components/matchmaker/PlayerStatsTable.test.tsx`，寫入一個 it：「球員色塊沿用既有漸層且已不在名單者有文字標示」（傳入一位 `onRoster: true` 與一位 `onRoster: false` 的 `PlayerStat`，斷言在名單者背景為其 `colorFrom→colorTo` 漸層、前景色等於直接呼叫 `pickTextColor` 的回傳值；不在名單者姓名旁出現文字標示）。確認紅燈（元件尚不存在）。另補 5 個 it 覆蓋 mutation 缺口（見交件回報「偏離」欄），該錨點 it 名稱逐字未變
- [x] 5.2 GREEN: 於 `nextjs-pickball/lib/matchmaker/labels.ts` 新增具名常數 `PLAYER_NOT_ON_ROSTER_LABEL = "已不在名單"`（純新增，不改動既有四個匯出）。實作 `nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx`：`"use client"`，props 為 `{ stats: readonly PlayerStat[] }`，使用 `components/ui/table.tsx` 的 `Table`／`TableHeader`／`TableBody`／`TableRow`／`TableCell` 渲染九欄（名次、球員、強度、出場、勝－負、勝率、淨變化、常搭檔、常對手）；球員欄以 `colorFrom`／`colorTo` 內嵌 `linear-gradient` 背景與 `pickTextColor` 前景色呈現色塊，`onRoster===false` 時姓名旁加上 `PLAYER_NOT_ON_ROSTER_LABEL`；`mostFrequentPartner`／`mostFrequentOpponent` 為 `null` 時顯示本檔內具名的佔位符號（單一用途，不進 `labels.ts`）。標題列儲存格用 `TableHead`（非文字列出的 `TableCell`），理由見交件回報「偏離」欄
- [x] 5.3 REFACTOR: 確認欄位順序與 spec 逐字相符；確認 `PLAYER_NOT_ON_ROSTER_LABEL` 只有這一個消費端且沒有第二份「已不在名單」字面量散在元件內；確認名次為傳入陣列的索引 + 1（`computePlayerStats` 已排序，元件不重新排序）；確認元件不 import 任何 store。逐項機械核對通過，無需改動程式碼

> **§5 兩階段審查結論（2026-09-06）**
> - Stage 1（規格）：`APPROVED`，必須修正項零。紅燈複驗屬實（`b181ef2^` 無此元件）；錨點 it
>   名稱逐字相符；`PlayerStat` **13 個欄位逐一盤點確認全數有消費端、零 dead data**（Decision 6）。
>   Stage 1 另裁決兩件事：① **「勝－負」vs「勝負」為 delta spec 內部矛盾**——Scenario 的九個詞
>   全都是欄位全名的子字串（「強度」⊂「目前強度」等），唯獨「勝負」⊄「勝－負」，破折號是 prose
>   敘述便利寫法而非 UI 文案規定；實作採「勝負」正確，leader 已於 `6ff2247` 更正 spec／design／
>   proposal 三處（詳見 design.md Open Questions 第 1-b 條）。② **「已不在名單」不加全形括號可接受**
>   ——spec 只要求「可讀的文字標示」、未規定標點形式，不構成「為了測試好寫而改動產品輸出」。
> - Stage 2（品質）：`APPROVED`。獨立跑 **36 個變異體，補斷言前 4 個存活**：
>   ① **球員欄從未斷言「顯示的是姓名」**（色塊內容換成 `stat.id` 竟全綠）——屬規格欄位無斷言覆蓋的
>   實質缺口；② `formatRatingDelta` 的 `delta > 0` 放寬為 `>=`（0 也補正號）；③ 勝率的
>   `Math.round` 換成 `floor`／`ceil`；④ `pickTextColor` 兩引數對調。
>   Stage 2 依授權於 `977a6fc` 補 4 個 it 殺掉前三項，並**補上表格的可存取名稱**
>   （`aria-label="球員排行榜"`，先寫測試看到真紅燈再實作）。
>   **剩餘 1 個存活變異判定為 equivalent mutant**：`colors.ts` 的 `pickTextColor` 內部是
>   `Math.min(contrastRatio(colorFrom, fg), contrastRatio(colorTo, fg))`，`Math.min` 對兩引數
>   對稱，`pickTextColor(a,b) === pickTextColor(b,a)` 恆成立，**任何測試都不可能殺掉它**。
> - Stage 2 對三項判斷題的結論：① **不共用 `tile-style.ts` 的 `playerTileStyle` 成立**——該函式
>   簽名要求完整 `Player`（含 `gender`／`rating` 等），且 `completed` 參數在排行榜無意義；且
>   `components/matchmaker/PlayerCard.tsx:39` **既有先例本來就內嵌漸層字串**，三處角度與格式零漂移，
>   並已有 mutation 護欄。放寬 `playerTileStyle` 參數屬後續重構 change，不在 M11 範圍。
>   ② 數值格式化與全 repo 一致（`toFixed(2)` 見 `PlayerTile`／`PlayerCard`／`PlayerForm`／
>   `HistoryRecordCard`，`history-csv.ts` 更有 `RATING_DECIMAL_PLACES = 2` 的具名先例）。
>   ③ `data-testid` 命名 `<語意>-${id}` 與既有 `resting-player-${id}`／`player-tile-${id}`／
>   `history-record-${matchId}-score` 同型，且 §6 的 E2E 本來就需要。
> - 無障礙：色塊 `<span>` 承載姓名文字且**沒有**被標 `aria-hidden`（有別於 `RestingPanel` 的純裝飾
>   色點刻意標了 `aria-hidden`），處理正確。`pickTextColor` **不保證 WCAG AA**（`colors.ts` 檔頭
>   JSDoc 明寫「即使兩者最小對比皆低於 4.5:1，仍取較高者、不阻擋」）——那是 M1 的既定全域取捨，
>   非本 change 新增的缺陷。
>
> **§5 → §6 交棒（Stage 2 指定，MUST 遵守）**
> 1. `<Table>` 現在帶 `aria-label="球員排行榜"`。E2E 定位表格用
>    `page.getByRole("table", { name: "球員排行榜" })` 最穩，**勿假設表格無名稱**。
> 2. 可用的 `data-testid`：`player-stat-row-${stat.id}`、`player-stat-badge-${stat.id}`。
>    元件實際渲染的九個標題為「名次／球員／**目前強度**／**出場數**／**勝負**／勝率／
>    **強度淨變化**／**最常搭檔**／**最常對手**」——Scenario 要比對的
>    `強度`／`出場`／`淨變化`／`常搭檔`／`常對手` 皆為其子字串，可直接用 `toContainText`。
> 3. **`PlayerStatsTable` 的 props 只有 `stats`**，元件不吃 `history`／`players`、不做 null 防護、
>    也**不處理空狀態**（`stats` 為空時只渲染標題列）。spec 要求「完全沒有紀錄時顯示 `EmptyHistory`
>    而非空表格」，**這個分流責任完全在 §6 的 `page.tsx`**，不要期待元件內有 fallback。
> 4. Decision 7 的 390px 不溢出由 `table.tsx` 內建 `overflow-x-auto` 提供；§6 的頁面外層若加了
>    自己的 padding／grid，MUST 確認沒有把捲動容器撐破——元件端已零斷點 CSS、零 `min-width`。
> 5. **窄螢幕隱藏欄位一事，§6 SHALL NOT 自行處理**——那牽動 Decision 6／7 與 Open Question 3，
>    屬人類決策，遇到問題回報 `BLOCKED`。

## 6. 統計頁掛載：路由、區間整合、空狀態（app/matchmaker/stats/page.tsx）

Depends on: §5

- [x] 6.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，寫入三個 test：「完全沒有歷史紀錄時顯示引導型空狀態」、「直接開啟 /matchmaker/stats 可載入排行榜表格」、「切換區間後排行榜只反映該區間的歷史紀錄」（種資料方式比照 `matchmaker-history.spec.ts` 的 `seedHistory`／`buildEntry` 慣例，各自在本檔複製一份 fixture helper）。跑該檔確認紅燈（路由不存在／404）並貼出輸出。另補 2 個非錨點 test 覆蓋 mutation 缺口（見交件回報「偏離」欄），三個錨點 test 名稱逐字未變
- [x] 6.2 GREEN: 實作 `nextjs-pickball/app/matchmaker/stats/page.tsx`：`"use client"`，持有 `const { players, updatePlayer } = useRosterStore();` 與 `const { history } = useRoundStore({ players, updatePlayer });`（design Decision 1，比照 `app/matchmaker/page.tsx` 既有形態，不新增 hook、不新增 View 元件）；以 `useState<HistoryRange>("today")` 持有目前區間；呼叫 `filterHistoryByRange(history, selectedRange, new Date())` 取得篩選後歷史，交給 `computePlayerStats(filteredHistory, players)`；`history.length === 0` 時渲染 `EmptyHistory range={null}`，否則渲染 `HistoryRangeFilter` 與 `PlayerStatsTable`
- [x] 6.3 REFACTOR: 確認 `page.tsx` 不含任何統計計算或區間篩選邏輯（全數委派既有函式），只做 store 接線與條件渲染；確認頁面標題與說明文字為繁體中文且不與其他 matchmaker 頁面重複措辭。逐項機械核對通過，無需改動程式碼

> **§6 實作紀錄（2026-09-06）**
> - 紅燈：`4c8863d` 當下 `/matchmaker/stats` 路由不存在，五條 test 全數 `element(s) not found`（chromium）。
> - 綠燈：`01ef639` 後 **25/25 通過（五個 browser project 全跑）**。
> - Mutation：自跑 **11 個變異體，全數轉紅、零存活**（含指示清單的 7 條，另加
>   「`HistoryRangeFilter` 移出條件式」「`computePlayerStats` 第二引數換空陣列」
>   「`new Date()` 換 `new Date(0)`」「`value={selectedRange}` 寫死 `"today"`」四條）。
> - 非錨點補強 test 兩條：「名單內球員取名單姓名與目前強度，已離開名單者標示且取歷史最後一筆」
>   （鎖住 `computePlayerStats` 第二引數確實接上 `useRosterStore`）、「統計頁載入後無 console error」
>   （本頁在 render 期間呼叫 `new Date()`，此條為「不會 hydration mismatch」的實證）。
> - 交棒事項 1～5 全數遵守：表格一律以 `getByRole("table", { name: "球員排行榜" })` 定位；
>   九個欄位子字串直接 `toContainText`；空狀態分流寫在 `page.tsx`（元件端無 fallback）；
>   頁面外層沿用其他 matchmaker 頁既有的 `max-w-5xl … px-4 py-8`，未加任何會撐破
>   `table.tsx` 捲動容器的水平內距或 grid；窄螢幕隱藏欄位未自行處理。

> **§6 兩階段審查結論（2026-09-06）**
> - Stage 1（規格）：`APPROVED`，必須修正項零。紅燈複驗屬實（`4c8863d` 這個 RED commit 本身
>   也不含 `page.tsx`，只新增 spec 檔）。三個錨點 test 名稱逐字相符。逐行證據：
>   ① 空狀態 test 是**正面斷言表格不存在**，擋得住「同時渲染空表格」的退化；
>   ② 「直接開啟」是真的 `page.goto`，九個欄位名稱全部針對**標題列**斷言而非整頁；
>   ③ 「切換區間」斷言的是**出場數的具體數值**（2 → 1）並雙向可逆；
>   ④ **空狀態判定用的是未篩選的 `history`**（第 45 行），不是 `filteredHistory`；
>   ⑤ E2E fixture 已逐欄比對 zod schema（含 DU 兩分支的 `.strict()` 欄位集合與 `HexColorSchema`
>   正則），確認能通過驗證而非被當成損毀資料丟棄；
>   ⑥ 「初次開啟預設今日」的 MUST 落在「切換區間」test 的
>   `getByRole("radio", { name: "今日", checked: true })`。
>   Stage 1 確認 **spec 完全未規範時鐘取樣方式**，明文把 `new Date()` 議題移交 Stage 2。
> - Stage 2（品質）：`APPROVED`。獨立跑 14 個變異（只在 chromium），**2 個存活**：
>   ① `history.length === 0` 換成 `filteredHistory.length === 0` 竟全綠——三條錨點 test 的斷言
>   時點都落在「目前區間有資料」，測不到這個分岔；該退化會讓空區間**謊稱使用者從未打過**且
>   **連區間篩選器一起消失**（使用者切不回去）。② 整個頁面標題區被刪除也全綠（6.3 明文要求
>   標題與說明文字，卻零保護）。Stage 2 依授權於 `742804a` 補一條非錨點 test
>   「切換到沒有紀錄的區間時不顯示引導型空狀態」與兩條標題斷言，兩者復驗轉紅、存活歸零。
> - **`new Date()` render-time 呼叫的裁決：維持現狀，可接受**。實際查證 `useRoundStore.ts` 的
>   `createInitialState()` 回傳 `history: []`、hydrate 只發生在 `useEffect`，故 SSR 首次輸出與
>   client hydration 當下皆走空狀態分支，**時鐘取值從未進入 DOM**，安全論證成立。與兩處先例的
>   衝突是表面而非實質：`HistoryView.tsx` 自己呼叫 `readHistory()`，「只取樣一次」是它必須自備的
>   保證；`app/matchmaker/page.tsx` 的既有註解講的是 `exportedAt`——一個**會被 render 進輸出**
>   （檔名）的值。唯一實質差異是「跨午夜後本頁下一次 render 會重新判定今日、歷史頁維持開頁當下
>   的判定」，兩者皆未被 spec 規範，已於 `f4a890a` 補進 `page.tsx` 註解。
>   **`useMemo` 判定不應加**：唯一會觸發 render 的輸入就是 `history`／`selectedRange`，省不下實質
>   重算；而把 `new Date()` 關進依賴陣列等於凍結時鐘成「首次 render 取樣一次」，**那是行為變更
>   而非最佳化**。
> - **`droppedCount` 未接手的判定：可接受的範圍外項目，非 §6 缺陷**。Decision 1 的否決理由說的是
>   「自行 `readRoster()`／`readHistory()` 會讓 `droppedCount` **需要另外接手處理**」——那是在陳述
>   被否決方案的額外成本，不是承諾本頁會顯示提示；選 hook 形態確實讓 `droppedCount` 零成本可得，
>   理由未落空。且本頁與它抄的先例完全一致：`app/matchmaker/page.tsx`（M5）同樣不消費
>   `droppedCount`，`useRoundStore.ts` 已明文記為「已知缺口」。**但存在使用者可見的不一致**：
>   同一份損毀歷史，開 `/matchmaker/history` 看得到提示、開 `/matchmaker/stats` 只是靜默少了幾筆
>   統計——與 `storage.ts` Decision 3「SHALL NOT 靜默處理」的 repo 級慣例相左。**留給人類裁示。**
> - E2E 測試碼品質全數 PASS，含一項 Stage 2 實際驗算的結論：**「上月」的 fixture 用固定第 15 日
>   而非「今天減 30 天」**，不受 1/31、2/28 等月長差異影響；1 月時 `m-1` 由 `Date` 自動正規化為
>   去年 12 月，跨年安全；且對照 `history-range.ts` 的 `c3 = min(上月1日, c2)`，要讓它失效需
>   「本週一早於上月 15 日」，而本週一最多只能回推 6 天，**數學上不可能**。
>
> **⚠️ §6 → §8 的升級項（Stage 2 提出，已回報 coordinator 裁示，§8 開工前 MUST 有結論）**
>
> **統計頁實際上會寫回 LocalStorage**，可能讓 §8 的唯讀 E2E 假綠。
> spec「統計頁的可用性、無障礙與唯讀保證」明訂「統計頁 SHALL NOT 修改回合、名單或任何
> LocalStorage 資料」，Scenario 要求三個 key「逐字相同」。但 Decision 1 選的 hook 形態**天生會
> 寫回**：`useRosterStore.ts` 與 `useRoundStore.ts` 的 write effect 以 `hasHydratedRef` 守門，
> HYDRATE dispatch 後 state 變動即觸發 `writeRoster`／`writeRound`／`writeHistory`（leader 已逐行
> 複驗此行為屬實）。`HistoryView` 只呼叫 `readHistory()`、**從不碰 roster／round**，所以歷史頁的
> 同名 test 能真的成立，統計頁**不能照抄**。
>
> Stage 2 的實測（臨時探針，已刪除）：
> - 種入**與 schema 宣告順序完全一致**的資料 → 三個 key 皆逐字相同 → **§8 若照
>   `matchmaker-history.spec.ts` 的既有寫法種資料，測試會綠，但頁面其實有寫。**
> - 種入**欄位順序不同、且多一個未知欄位 `legacyNote`** 的 roster → **不相同**，回寫後
>   `legacyNote` 被靜默丟棄、key 順序被重排。
>
> 待裁示的選項：① 維持 Decision 1，並把 spec 措辭澄清為「不改變任何持久化資料的**語意內容**」
> （理由：頁面本身呼叫零個 store setter，寫回是既有 hydration pattern 的性質，M5 對戰頁同樣如此，
> 非 M11 引入）；② 改 Decision 1 的資料路徑（回到被否決的 server page + View 形態，會重新引入
> `droppedCount` 的問題）；③ §8 的 test 改用非正規化形狀種資料（**會直接紅**，等於暴露 spec 未達成）。

## 7. match-stage：第五個分頁「統計」納入區段導覽

Depends on: §1（可與 §2～§6 並行構思，但仍依「群組間嚴格序列」規定序列執行；§7.3 的 e2e 需要 §6 已完成的頁面才有意義，故排在 §6 之後）

- [x] 7.1 RED: 修改 `nextjs-pickball/lib/matchmaker/section-nav.test.ts` 既有的 it「分頁清單依序為對戰、參賽者、歷史與資料四筆」——更名為「分頁清單依序為對戰、參賽者、歷史、資料與統計五筆」，並把預期陣列擴充為五筆（新增 `{ label: "統計", href: "/matchmaker/stats", active: false }`）。跑單檔確認紅燈（`matchmakerSectionTabs` 目前仍只回傳四筆），貼出輸出。**這是本 change 對既有測試唯一容許的變動**，見 §9.8
- [x] 7.2 GREEN: 於 `nextjs-pickball/lib/matchmaker/section-nav.ts` 的 `MATCHMAKER_SECTION_HREFS` 追加 `` `${MATCHMAKER_ROUTE}/stats` ``，`MATCHMAKER_SECTION_LABELS` 追加對應的 `"統計"` 標籤
- [x] 7.3 RED: 於 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 新增一個 test：「可由對戰頁的區段導覽點擊進入統計頁」（於對戰頁點擊區段導覽的「統計」，斷言導向 `/matchmaker/stats` 且該分頁帶 `aria-current="page"`）。跑該檔確認結果——若 7.2 與 §6 皆已完成，本項**可能一寫入即綠**（連結與導航邏輯皆為既有機制），如實標註為 regression guard，SHALL NOT 為了製造紅燈刻意延後 7.2 的實作 —— **實測一寫入即綠（chromium 20/20 passed），如實標註為 regression guard**
- [x] 7.4 確認: 若 7.3 為真紅燈則排查原因並修正至綠；若為 regression guard 則在本項註明「已確認為 regression guard，`MatchmakerTabs`／`section-nav.ts` 的既有機制已足夠支援第五分頁」 —— **已確認為 regression guard，`MatchmakerTabs`／`section-nav.ts` 的既有機制已足夠支援第五分頁**；並以 mutation 驗證該 test 非空轉（拿掉 `aria-current`、無條件加上 `aria-current`、元件只渲染前四個分頁，三種變異皆轉紅）
- [x] 7.5 REFACTOR: 確認 `section-nav.ts` 的改動僅為兩個陣列各追加一筆，沒有改動既有四筆的順序或內容；確認 `components/matchmaker/MatchmakerTabs.tsx` 未被改動（渲染邏輯完全由 `section-nav.ts` 驅動）

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
- [ ] 9.12 **補登審查階段新增的非錨點測試**：apply 過程中為了殺掉 mutation 存活缺口，新增了 16 個
      不在 delta spec 驗收錨點內的 `it`（皆對應 spec prose 的 MUST 子句或 design Decision，
      經 §4 Stage 1／Stage 2 判定為正當而非測試膨脹）。archive 前 MUST 把它們補登進
      `test-plan.md`，避免日後稽核誤判為未經規劃的測試膨脹：
      ① 「單打紀錄即使隊伍帶兩名球員也不計入最常搭檔（僅雙打計數）」（對應「最常搭檔 MUST 由該
      球員所有**雙打**歷史紀錄中的隊友逐筆計數」）
      ② 「最常搭檔次數平手時取姓名 UTF-16 code unit 較前者」（對應 Decision 5 的 tie-break）
      ③ 「最常搭檔的顯示姓名取該對象 playedAt 最近一次的姓名快照」（對應 Decision 4 的 MUST，
      §4 Stage 2 發現該條 MUST 原本零覆蓋）
      —— 以上三個在 `lib/matchmaker/player-stats.test.ts`。
      §5 的 `components/matchmaker/PlayerStatsTable.test.tsx` 另有九個：
      ④ 「表格標題列依序顯示九個欄位名稱」（對應 spec 的九欄順序 MUST 與 Decision 6 的零 dead data）
      ⑤ 「名次為傳入陣列的索引加一，不重新排序也不使用索引本身」（對應 5.3 與 §4→§5 交棒事項 2）
      ⑥ 「各欄位如實顯示球員統計資料」（對應九欄的欄位對應正確性）
      ⑦ 「強度淨變化為負值時顯示負號，不強制補上正號」（呈現層決策的護欄）
      ⑧ 「最常搭檔與最常對手為 null 時顯示佔位符號而非空字串」（對應 Decision 2 的 null→文案分工）
      ⑨ 「球員欄的色塊內容為姓名本身」（§5 Stage 2 發現：球員欄原本從未斷言顯示的是姓名）
      ⑩ 「強度淨變化為零時不補正號」（`formatRatingDelta` 的具名顯示決策原本無護欄）
      ⑪ 「勝率以四捨五入取整數百分比呈現」（同上）
      ⑫ 「表格具備可存取名稱」（§5 Stage 2 補的 a11y 行為，spec「色彩非唯一資訊來源」的延伸）
      §6 的 `tests/e2e/specs/player-stats.spec.ts` 另有四個：
      ⑬ 「名單內球員取名單姓名與目前強度，已離開名單者標示且取歷史最後一筆」（鎖住 `page.tsx`
      把 `players` 傳給 `computePlayerStats` 第二引數的接線，unit test 不可能覆蓋）
      ⑭ 「統計頁載入後無 console error」（hydration 層級行為，render 期間取時鐘的實證）
      ⑮ 「切換到沒有紀錄的區間時不顯示引導型空狀態」（§6 Stage 2 補：空狀態判定必須依據整份
      `history` 而非 `filteredHistory`，否則空區間會謊稱使用者從未打過且篩選器一起消失）
      ⑯ 註：§6 Stage 2 另在既有錨點 test「直接開啟 /matchmaker/stats 可載入排行榜表格」內補了
      頁面標題與說明文字的兩條斷言（未新增 it，不需另外補登）
