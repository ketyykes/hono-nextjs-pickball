# Tasks — matchmaker-round-lifecycle（M4）

> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 verify 階段無法機械核對。
> 每個 RED 括號內列出的字串就是要寫進 `it(...)` 的內容，一字不改。
>
> **紅燈要是真的**：若某條測試加入時立即全綠，如實在該項旁註記為 regression guard，
> 並改以 mutation 驗證（改壞實作看紅、還原看綠）證明它有殺傷力。
> **SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。

## 0. 前置（準備，不產生任何程式碼）

- [x] 0.1 確認 M3（`matchmaker-rating-engine`）已合併回 `main`；讀出 `nextjs-pickball/lib/matchmaker/rating.ts` 的**實際匯出名稱、參數與回傳形狀**，抄寫在本項下方作為 §6 的實作依據。本 change 撰寫時的假設是 `updateRatings(input)` → `{ changes, expectedScores }`（`changes` 依 `teams` 順序攤平的逐人結果，含 `before`／`after`／`delta` 與邊界旗標；輸入不合法時 `throw`）。與實際不符時依 execution-plan 的 Escalation 回報 BLOCKED，**不要自行改 spec**

  **實測結果（2026-08-23，`main` merge commit `e3477eb`「feat(matchmaker): 合併評分引擎（PRD 6.4）」）：假設成立，未 BLOCKED。**

  `nextjs-pickball/lib/matchmaker/rating.ts` 的匯出：

  ```ts
  export function expectedScore(ratingA: number, ratingB: number): number
  export function effectiveK(gamesPlayed: number): number
  export function updateRatings(input: RatingUpdateInput): RatingUpdateResult
  ```

  `nextjs-pickball/lib/matchmaker/rating-types.ts` 的型別與常數：

  ```ts
  export const RATING_D = 3.0;
  export const RATING_K_BASE = 0.15;
  export const RATING_MIN = 1;
  export const RATING_MAX = 8;
  export const K_DECAY_GAMES = 20;

  export interface RatingPlayerInput {
    readonly id: string;          // ← 注意：欄位名是 id，不是 playerId
    readonly rating: number;
    readonly gamesPlayed: number;
  }
  export type Side = readonly RatingPlayerInput[];

  export interface RatingUpdateInput {
    readonly format: MatchFormat;              // "singles" | "doubles"，取自 allocation-types
    readonly teams: readonly [Side, Side];     // [隊伍 A, 隊伍 B]
    readonly winnerIndex: 0 | 1;               // 0 = 隊伍 A 勝
  }

  export interface RatingChange {
    readonly id: string;          // ← 對應輸入的 RatingPlayerInput.id
    readonly before: number;
    readonly after: number;       // 已 round 至兩位小數並 clamp 於 [1, 8]
    readonly delta: number;       // 由 clamp 後的 after 重算，非理論值
    readonly atUpperBound: boolean;  // after === 8，不論本場有無被夾
    readonly atLowerBound: boolean;  // after === 1，不論本場有無被夾
    readonly clamped: boolean;       // 本場理論值超界而被截斷（真的少拿分）
  }

  export interface RatingUpdateResult {
    readonly changes: readonly RatingChange[];              // 依 teams 順序攤平：隊伍 A 的人在前
    readonly expectedScores: readonly [number, number];     // [E_A, 1 - E_A]
  }
  ```

  §6 需要注意的四點：
  1. **欄位名是 `id` 不是 `playerId`**。回合的 `playerRatings[].playerId` 需自行對應，不能直接展開 `RatingChange`。
  2. **`changes` 的順序**是「隊伍 A 全員 → 隊伍 B 全員」，與 `RoundMatch.teams[0].playerIds` ／ `teams[1].playerIds` 的攤平順序一致。
  3. **每隊人數由 `PLAYERS_PER_MATCH[format] / 2` 推導**（單打 1、雙打 2）；人數不符會 `throw`。
  4. **`updateRatings` 對四類不合法輸入會 `throw`**（隊伍人數不符、`rating` 超出 1～8、`gamesPlayed` 非非負整數、同場重複 `id`）——訊息皆為繁體中文。§6.6 的防禦性 try/catch 即為接住這四類。「觸頂／觸底」用 `atUpperBound`／`atLowerBound`（停在界上即 true），「本場真的被截斷」用 `clamped`；test-plan 的「評分觸頂時賽後分數停在 8.00 並回報已達上限」對應的是 `atUpperBound`。

- [x] 0.2 重讀 `main` 上 `openspec/specs/pickleball-guide-page/spec.md` 的「互動行為由三支 hooks 提供且各有 smoke test」Requirement，與本 change `specs/pickleball-guide-page/spec.md` 的 delta 逐行比對。若 `main` 已被其他 change 新增了 hook，MUST 把 delta 全文重新對齊為 union（**只加不刪**）並在本項下方記錄實際對齊了哪些項目（design Decision 9）

  **實測結果（2026-08-23）：delta 已是 union，無需重新對齊。**

  以 python `difflib` 逐行比對「Requirement 起始 → 下一個 `### Requirement:` 之前」的全文（兩側皆 45 行），唯一差異為第 5 行（歸屬清單那一句）：

  ```diff
  -...（`useQuiz` → quiz；`useRosterStore` → player-roster；`useScoreboardStore`、...）。
  +...（`useQuiz` → quiz；`useRosterStore` → player-roster；`useRoundStore` → round-lifecycle；`useScoreboardStore`、...）。
  ```

  - **delta 相對 `main` 只新增了 `` `useRoundStore` → round-lifecycle `` 一項，未刪除任何既有項目**，符合 union（只加不刪）要求。
  - `main` 上該清單目前為 9 支：`useScrollShadow`／`useScrollSpy`／`useScrolledPast`（本 capability）、`useQuiz`、`useRosterStore`、`useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode`、`useEnterAnimationProgress`、`useReducedMotion`。**沒有其他 change 在本 change 規劃後新增過 hook**，與 design Decision 9 末段的實地確認一致（衝突風險為零）。
  - 其餘 44 行（三段散文與 6 個 Scenario）逐字相同，**§8 套用時只需改動這一行**。

- [x] 0.3 依 environment.md 完成 worktree 建立與 baseline 驗證，並把 baseline 結果與 initial commit hash 回填 environment.md 的 Verification 三欄位

  worktree 與 branch 由 coordinator 於本 session 前建立（`change/matchmaker-round-lifecycle`，基於 `main` 的 `e3477eb`），本 session 未重跑 `git worktree add`。於 worktree 內執行 `pnpm install`（exit 0）後跑 `pnpm test`：**PASS**——前端 41 檔／299 測試、後端 4 檔／16 測試，exit code 0。三欄位已回填 environment.md。

## 1. 回合型別與 schema（round-types.ts）

- [ ] 1.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round-types.test.ts`，寫入三個 it：「合法回合通過驗證，roundNumber 非正整數時失敗」、「場次狀態僅接受 pending、scoring、completed」、「completed 場次缺少比分、勝方或完成時間時驗證失敗」。跑單檔確認紅燈並貼出輸出
- [ ] 1.2 GREEN: 新增 `nextjs-pickball/lib/matchmaker/round-types.ts`，定義 `MatchStatusSchema`（三值列舉）、`RoundTeamSchema`（`playerIds` + `rating`）、`PlayerRatingSchema`（`playerId` / `before` / `after` 可為 `null`）、`RoundMatchSchema`、`RoundSchema`。`completed` 場次的欄位完整性以 `superRefine` 表達，不靠呼叫端自律
- [ ] 1.3 RED: 於 `round-types.test.ts` 補兩個 it：「targetScore 僅接受 11、15、21 且不帶預設值」、「目標分數選項與 scoreboard 的 TargetScoreSchema 值域一致」。確認紅燈
- [ ] 1.4 GREEN: 定義 `RoundTargetScoreSchema`（`z.union` 三個字面量，**不加 `.default()`**，理由見 design Decision 4）、`TARGET_SCORE_OPTIONS` 與 `DEFAULT_TARGET_SCORE = 11`。值域一致性的斷言只存在於測試檔，產品程式碼 SHALL NOT import `lib/scoreboard/**`
- [ ] 1.5 REFACTOR: 檢查 `format` 是否沿用 `allocation-types.ts` 的 `MatchFormat` 而非另行定義；型別匯入是否一律 `import type`（`verbatimModuleSyntax`）；跑 `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 確認無誤

## 2. LocalStorage key 與重置範圍（storage-keys.ts、storage.ts）

- [ ] 2.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round-storage.test.ts`，寫入 it「三個 LocalStorage key 名稱由 storage-keys 單一來源匯出」：斷言三個常數的值分別為 `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`，且皆自 `storage-keys.ts` 匯入。確認紅燈
- [ ] 2.2 GREEN: 新增 `nextjs-pickball/lib/matchmaker/storage-keys.ts`，匯出 `ROSTER_STORAGE_KEY`、`ROUND_STORAGE_KEY`、`HISTORY_STORAGE_KEY` 與 `hasLocalStorage()`（由 `storage.ts` 的既有私有實作原樣搬移，行為不變）
- [ ] 2.3 RED: 擴大 `nextjs-pickball/lib/matchmaker/storage.test.ts` 既有 it「重置只移除列舉的 key，不影響 scoreboard 資料」的斷言：預先寫入四個 key，斷言三個 `matchmaker:` key 皆被移除、`scoreboard:current:v1` 仍在。**it 名稱不改**。確認紅燈
- [ ] 2.4 GREEN: `storage.ts` 的 `RESET_KEYS` 擴為三個 key（自 `storage-keys.ts` 匯入）；`hasLocalStorage()` 改為 re-use `storage-keys.ts` 的版本；`STORAGE_KEY` 改為 `export const STORAGE_KEY = ROSTER_STORAGE_KEY` 的 re-export，M1 既有匯入點與測試不得需要改動
- [ ] 2.5 REFACTOR: 確認 `storage.ts` 內已無殘留的私有 `hasLocalStorage` 副本、無 `matchmaker:` 字串硬編、且 `storage.ts` 與 `round-storage.ts` 之間沒有循環匯入（兩者皆單向依賴 `storage-keys.ts`）

## 3. 歷史 schema 與追加（history.ts）
Depends on: §1

- [ ] 3.1 RED: 新增 `nextjs-pickball/lib/matchmaker/history.test.ts`，寫入四個 it：「合法歷史紀錄通過驗證」、「缺少必要欄位或欄位格式不合法時驗證失敗」、「歷史紀錄的每位球員各帶賽前與賽後分數」、「單打不得帶雙打組成標示，雙打必須帶」。確認紅燈
- [ ] 3.2 GREEN: 新增 `nextjs-pickball/lib/matchmaker/history.ts`，定義 `HistoryPlayerSchema`（`id` / `name` / `ratingBefore` / `ratingAfter`）、`HistoryTeamSchema`、`MatchHistoryEntrySchema`（單打／雙打以 discriminated union 表達 `doublesComposition` 的有無）與外層 `HistorySchema`（`version: z.literal(1)`）
- [ ] 3.3 RED: 於 `history.test.ts` 補 it「球員自名單刪除後歷史紀錄的姓名與分數仍完整」：寫入一筆後把該球員自名單陣列移除，斷言紀錄的 `name`／`scoreA`／`ratingBefore`／`ratingAfter` 完全不變。確認紅燈
- [ ] 3.4 GREEN: 確保 `HistoryPlayerSchema` 保存的是**姓名快照**而非只有 id（design Decision 3）。若 3.2 的形狀已滿足此斷言而 3.3 加入時即綠，**如實標註為 regression guard**，並以 mutation 驗證（把 `name` 欄位自 schema 移除 → 應轉紅；還原 → 綠）附上輸出
- [ ] 3.5 RED: 於 `history.test.ts` 補兩個 it：「appendHistoryEntry 回傳新陣列且只增加一筆」（含「原陣列未被就地修改」的斷言）、「多筆歷史依追加順序保存，不重新排序」。確認紅燈
- [ ] 3.6 GREEN: 實作 `appendHistoryEntry(history, entry)`：回傳新陣列，SHALL NOT `push` 到傳入的陣列，SHALL NOT 排序或去重
- [ ] 3.7 REFACTOR: 確認 `history.ts` 不 import `round.ts`（相依方向為 `round.ts → history.ts`），且未重複定義任何已存在於 `allocation-types.ts` 的型別（`MatchFormat`、`DoublesComposition`）

## 4. 產生本輪與休息結算（round.ts）
Depends on: §1, §3

- [ ] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round.test.ts`，寫入三個 it：「首輪回合編號為 1，基準為空且所有場次為 pending」、「產生新一輪時回合編號加 1 並取代目前回合」、「簽章基準以字串陣列保存，呼叫 allocateRound 前轉為 Set」。確認紅燈
- [ ] 4.2 GREEN: 實作 `createRound(input)` 骨幹：呼叫 `allocateRound()` → 把 `Match`（內嵌完整 `Player`）投影成只帶 `playerIds` 與 rating 快照的 `RoundMatch` → 填入 `playerRatings[].before`、`after` 為 `null` → 回合編號由 `previousRound` 推導。`seenSignatures` 在回合物件中為字串陣列，傳給 `allocateRound()` 前轉 `Set`
- [ ] 4.3 RED: 於 `round.test.ts` 補三個 it：「上一輪已完成與進行中的場次納入重複比對基準」、「上一輪未開始的場次不納入基準也不寫入歷史」、「重複比對基準只取上一輪，不累積更早的回合」。確認紅燈
- [ ] 4.4 GREEN: 實作基準推導：以 `duplication.ts` 的 `buildSignatureIndex` 對上一輪的 `completed` + `scoring` 場次建索引，併入上一輪回合自身的 `seenSignatures`；`pending` 場次一律略過。SHALL NOT 累積更早的回合（design Decision 2）
- [ ] 4.5 RED: 於 `round.test.ts` 補四個 it：「產生新一輪時上一輪休息者的 restCount 加 1，出場者不變」、「產生首輪時不結算任何人的 restCount」、「連續產生多輪時同一輪的休息名單只被結算一次」、「暫停出場者不因本輪休息而累加 restCount」。確認紅燈
- [ ] 4.6 GREEN: `createRound` 回傳值新增 `restSettlements`（`{ id, restCount }` patch 陣列），內容為**上一輪** `restingPlayerIds` 各 +1；無上一輪時為空陣列。SHALL NOT 在本函式內修改任何 `Player` 物件（design Decision 1）
- [ ] 4.7 REFACTOR: 確認 `createRound` 只做投影與串接——排序、配對、重複迴避一律由 `allocateRound` 負責，本檔 SHALL NOT 重新實作其中任何一項
- [ ] 4.8 RED: 於 `round.test.ts` 補五個 it：「名單為空時不建立回合並提示新增參賽者」、「單打不足 2 人或雙打不足 4 人時不建立回合」、「全員暫停出場時的訊息與名單為空時不同」、「產生失敗時既有回合與 restCount 皆不受影響」、「場地數不合法時接住例外並轉為失敗結果」。確認紅燈
- [ ] 4.9 GREEN: 實作失敗結果的 discriminated union（`{ ok: false, code, message }`），訊息為繁體中文並說明修正方式；以 try/catch 接住 `allocateRound` 對場地數拋出的 `Error`，轉為同一種失敗結果。失敗時 SHALL NOT 產生 `restSettlements`
- [ ] 4.10 REFACTOR: 邊界檢查集中在 `createRound` 入口一處，錯誤代碼與訊息抽為具名常數，三種空狀態（名單為空／人數不足／全員暫停）各有各的訊息

## 5. 目標分數與重排未完成場次（round.ts）
Depends on: §4

- [ ] 5.1 RED: 於 `round.test.ts` 補兩個 it：「產生本輪時決定目標分數，未指定時採預設 11」、「所有場次皆為 pending 時可改目標分數，已有場次離開 pending 時拒絕」。確認紅燈
- [ ] 5.2 GREEN: `createRound` 接受選填的 `targetScore`（預設 `DEFAULT_TARGET_SCORE`）；實作 `setTargetScore(round, targetScore)`：僅在所有場次皆 `pending` 時回傳新回合，否則回傳失敗結果且原回合不被修改
- [ ] 5.3 RED: 於 `round.test.ts` 補三個 it：「沒有回合或沒有 pending 場次時重排被拒絕」、「重排保留已完成場次的比分、勝方與賽前賽後分數」、「重排的候選池含休息名單成員，已比賽者不再納入」。確認紅燈
- [ ] 5.4 GREEN: 實作 `resetIncompleteMatches(round, players, ids)`：前置條件檢查 → 候選池為「`pending` 場次球員 ∪ `restingPlayerIds`」→ 可用場地數扣除 `completed` 與 `scoring` 佔用者 → 呼叫 `allocateRound` → 保留原有的 `completed` 與 `scoring` 場次（design Decision 5）
- [ ] 5.5 RED: 於 `round.test.ts` 補四個 it：「重排沿用原回合與前一輪的重複比對基準」、「重排把被丟棄的原始組合併入本回合基準」、「重排不改變回合編號、建立時間、對戰方式與目標分數」、「重排未完成場次不觸發休息結算」。確認紅燈
- [ ] 5.6 GREEN: 重排時把被丟棄的 `pending` 場次以 `buildSignatureIndex` 建索引併入 `round.seenSignatures`，並以原有基準作為 `allocateRound` 的輸入；`roundNumber`／`createdAt`／`format`／`targetScore` 原樣沿用；回傳值不含任何 `restCount` patch
- [ ] 5.7 REFACTOR: 抽出 `createRound` 與 `resetIncompleteMatches` 共用的「Match → RoundMatch 投影」與「簽章陣列 ↔ Set 轉換」為內部輔助函式，兩處 SHALL NOT 各寫一份

## 6. 比分驗證與送出流程（round.ts）
Depends on: §3, §5

- [ ] 6.1 RED: 於 `round.test.ts` 補五個 it：「比分欄位空白時拒絕送出並回傳繁體中文訊息」、「比分非有效數字時拒絕送出」、「比分為負數時拒絕送出，0 本身可接受」、「兩隊比分相同時拒絕送出」、「已完成場次再次送出時被拒絕且既有結果不變」。確認紅燈
- [ ] 6.2 GREEN: 實作 `validateScoreInput(match, rawA, rawB)`：回傳 `{ ok: true, scoreA, scoreB }` 或 `{ ok: false, code, message }`。SHALL NOT 用 `Number()` 或 `parseInt()` 單獨判斷（前者把 `""` 變 `0`、後者把 `"1a"` 變 `1`）
- [ ] 6.3 RED: 於 `round.test.ts` 補四個 it：「送出合法比分後場次標記為完成並記錄比分、勝方與完成時間」、「完成場次的 playerRatings 逐一對應該場每位球員的賽前與賽後分數」、「完成場次後評分結果寫回名單，未參賽者不受影響」、「完成場次後該場球員 gamesPlayed 各加 1，其餘人不變」。確認紅燈
- [ ] 6.4 GREEN: 實作 `submitScore({ round, players, matchId, rawScoreA, rawScoreB, now })`，依 0.1 記錄的評分 API 簽章呼叫評分；回傳 `{ ok: true, round, historyEntry, playerPatches, boundaryHits }`。`historyEntry` 以 `history.ts` 的 schema 建立，含姓名快照（design Decision 6）
- [ ] 6.5 RED: 於 `round.test.ts` 補四個 it：「評分觸頂時賽後分數停在 8.00 並回報已達上限」、「送出失敗時回合、名單與歷史皆不變」、「已完成場次重複送出時歷史筆數不變」、「重排未完成場次不刪除也不修改既有歷史」。確認紅燈
- [ ] 6.6 GREEN: 補齊 `boundaryHits` 的傳遞（不寫入回合、不持久化，design Decision 6）與原子性——驗證失敗時**不回傳任何可寫入的東西**，呼叫端因此無從產生部分更新。另加一層**防禦性** try/catch 包住評分 API 的呼叫（M3 對不合法輸入會 `throw`；本函式送進去的資料已由 §6.2 驗證過，正常路徑不會觸發），轉為同一種失敗結果而非讓例外穿透。此為 defence-in-depth，**spec 無對應 Scenario**，如實在本項旁註記
- [ ] 6.7 REFACTOR: 確認勝方判定、比分 parse 與 `RoundMatch → MatchHistoryEntry` 的投影各只有一處實作；`submitScore` 為純函式（不碰 `localStorage`、不呼叫 `Date.now()`、不呼叫 `crypto.randomUUID()`，時間與 id 一律由呼叫端注入）

## 7. 回合與歷史的持久化（round-storage.ts）
Depends on: §1, §2, §3

- [ ] 7.1 RED: 於 `round-storage.test.ts` 補兩個 it：「回合 JSON 解析失敗時清除 key 並回傳無回合」、「回合外層結構或 version 不符時整份清除」。確認紅燈
- [ ] 7.2 GREEN: 實作 `readRound()` / `writeRound(round | null)` / `clearRound()`：外層 `{ version: z.literal(1), round: RoundSchema.nullable() }`；任一層驗證失敗即清除 key 並回傳無回合（回合是單一物件，無筆可救）
- [ ] 7.3 RED: 於 `round-storage.test.ts` 補兩個 it：「歷史單筆損壞時保留其餘 2 筆並回報 droppedCount 為 1」（含回寫後再讀時**同時斷言筆數與內容**）、「歷史 version 不符時整份清除，不走逐筆降級」。確認紅燈
- [ ] 7.4 GREEN: 實作 `readHistory()` / `writeHistory(entries)` / `clearHistory()`：外層容器 schema 的 `entries` 以 `z.array(z.unknown())` 承接、逐筆 `safeParse`，比照 `storage.ts` 的兩段式降級；`droppedCount > 0` 時回寫清理後的結果
- [ ] 7.5 RED: 於 `round-storage.test.ts` 補 it「localStorage 不可用或寫入超出配額時不拋出例外」：分別模擬 `localStorage` 存取拋例外與 `setItem` 拋 `QuotaExceededError`，斷言四個讀寫函式皆不拋出且讀取回空結果。確認紅燈
- [ ] 7.6 GREEN: 四個函式一律先過 `hasLocalStorage()`，寫入包 try/catch 並以 `console.warn` 記錄，SHALL NOT 讓例外穿透中斷呼叫端
- [ ] 7.7 REFACTOR: 抽出「讀 key → JSON.parse → 外層驗證」的共用骨架，回合與歷史兩條路徑只在降級策略上分歧，SHALL NOT 各自複製一份 try/catch 樣板

## 8. store hook（useRoundStore）
Depends on: §4, §5, §6, §7

- [ ] 8.1 RED: 新增 `nextjs-pickball/hooks/useRoundStore.test.tsx`，寫入 it「重新掛載後還原目前回合與歷史」（tier: integration，走真實 `localStorage`）。確認紅燈。**同時預期 `hooks/hooksInventory.test.ts` 的 it「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」在 8.2 建立 `useRoundStore.ts` 後轉紅**——這是真紅燈，貼出輸出
- [ ] 8.2 GREEN: 新增 `nextjs-pickball/hooks/useRoundStore.ts`：`useReducer` + write effect 在前、hydrate effect 在後、`hasHydratedRef` 守門（沿用 `useRosterStore.ts` 的既有結構）；以 roster port `{ players, updatePlayer }` 注入名單（design Decision 7）；`generateRound` 在**同一次 reducer action** 內套用 `restSettlements` 與新回合（design Decision 1）。**同一個 commit 內**依 `specs/pickleball-guide-page/spec.md` 的 delta，把 `` `useRoundStore` → round-lifecycle `` 一項加入 `openspec/specs/pickleball-guide-page/spec.md` 的歸屬清單——**只准加這一項，該 Requirement 的其他文字一個字都不准動**（design Decision 9）。跑 `hooksInventory.test.ts` 確認兩個既有 it 皆轉綠：「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」與「歸屬清單提及的每個 hook 名稱都有對應檔案」
- [ ] 8.3 REFACTOR: 確認 `useRoundStore` 內沒有任何回合邏輯——狀態轉換一律委派 `round.ts` 的純函式，hook 只負責 dispatch、持久化與把 patch 交給 roster port；確認未在 hook 內呼叫 `useRosterStore()`（會產生第二個名單實例，見 design Decision 7 的否決理由）

## 9. 收尾驗證
Depends on: §1, §2, §3, §4, §5, §6, §7, §8

- [ ] 9.1 逐條核對四份 delta spec 的每個「驗收」錨點：檔案路徑存在、it 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 並比對實際 `it("...")`，**不靠目視**。貼出「共找到 N 個錨點 / M 個對上」的輸出。四份 delta 合計 **71 個錨點**，其中 13 個屬於兩個 MODIFIED capability 中**未改動**的 Scenario（`types.test.ts` 6 個、`useScroll*.test.ts` 4 個、`hooksInventory.test.ts` 1 個、`player-roster.spec.ts` 2 個），它們指向本 change 之前就存在的 it，同樣必須逐字對上
- [ ] 9.2 spec 條目重複檢查：依 root `CLAUDE.md` 指定的 python 計數法逐標題計數，**不使用 BSD `uniq`**（`sort | uniq -d` 會把內容不同的中文標題誤判為重複）
- [ ] 9.3 `pnpm lint`（repo root）：0 errors。既有的 3 個 warning（`useQuiz.ts`／`useRosterStore.ts`／`useScoreboardStore.ts`）不算新增；`useRoundStore.ts` 若產生新 warning 需處理或說明
- [ ] 9.4 `pnpm typecheck`（repo root）通過
- [ ] 9.5 `pnpm test`（repo root）全套通過，貼出前後端的檔數與測試數。特別確認 `types.test.ts`、`roster.test.ts`、`storage.test.ts`、`hooksInventory.test.ts` 這四支 M1 既有測試全綠——本 change 動過 `storage.ts` 與主 spec 的歸屬清單
- [ ] 9.6 `pnpm test:e2e` 跑 `tests/e2e/specs/player-roster.spec.ts`：確認重置流程未因 `RESET_KEYS` 擴大而破壞。本 change **不新增任何 e2e**（無 UI）；若沙箱擋住 workerd／miniflare 的 `listen EPERM`，放行後重跑，那不是設定錯誤
- [ ] 9.7 `DO_NOT_TRACK=1 openspec validate matchmaker-round-lifecycle --strict`（repo root）通過，貼出輸出
- [ ] 9.8 確認本 change 的實際改動檔案清單與 proposal 的 Impact 一致，沒有未申報的檔案；`git diff --stat` 中 `openspec/specs/` 的改動 MUST 只有 `pickleball-guide-page/spec.md` 的歸屬清單一行
