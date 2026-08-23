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

- [x] 1.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round-types.test.ts`，寫入三個 it：「合法回合通過驗證，roundNumber 非正整數時失敗」、「場次狀態僅接受 pending、scoring、completed」、「completed 場次缺少比分、勝方或完成時間時驗證失敗」。跑單檔確認紅燈並貼出輸出

  **紅燈證據**：`Error: Failed to resolve import "./round-types"`（0 tests collected）——`round-types.ts` 此時尚不存在。三個 it 皆為**真紅燈**。

- [x] 1.2 GREEN: 新增 `nextjs-pickball/lib/matchmaker/round-types.ts`，定義 `MatchStatusSchema`（三值列舉）、`RoundTeamSchema`（`playerIds` + `rating`）、`PlayerRatingSchema`（`playerId` / `before` / `after` 可為 `null`）、`RoundMatchSchema`、`RoundSchema`。`completed` 場次的欄位完整性以 `superRefine` 表達，不靠呼叫端自律

  綠燈：`Test Files 1 passed / Tests 3 passed`。`superRefine` 除 spec 三欄位外一併檢查「`completed` 場次的 `playerRatings[].after` MUST 為數字」（spec 狀態語意正文的 MUST，無對應 Scenario）。

- [x] 1.3 RED: 於 `round-types.test.ts` 補兩個 it：「targetScore 僅接受 11、15、21 且不帶預設值」、「目標分數選項與 scoreboard 的 TargetScoreSchema 值域一致」。確認紅燈

  **紅燈證據**：`Tests 1 failed | 4 passed`，失敗者為「目標分數選項與 scoreboard 的 TargetScoreSchema 值域一致」（`AssertionError: expected Set{} to deeply equal Set{ 11, 15, 21 }`，`TARGET_SCORE_OPTIONS` 此時尚未定義）——**真紅燈**。

  ⚠️ **regression guard 標註**：「targetScore 僅接受 11、15、21 且不帶預設值」**加入當下即綠**，因為 1.2 定義 `targetScore` 時已寫成不帶 `.default()` 的三值 union，被守護的行為在此之前已成立。依 root `CLAUDE.md`「紅燈要是真的」如實標註為 **regression guard 而非 TDD 紅燈**，未以 mutation check 偽造紅燈。其殺傷力另由 1.4 的 mutation 驗證間接證明（見下）。

- [x] 1.4 GREEN: 定義 `RoundTargetScoreSchema`（`z.union` 三個字面量，**不加 `.default()`**，理由見 design Decision 4）、`TARGET_SCORE_OPTIONS` 與 `DEFAULT_TARGET_SCORE = 11`。值域一致性的斷言只存在於測試檔，產品程式碼 SHALL NOT import `lib/scoreboard/**`

  綠燈：`Tests 5 passed`。經 Stage 2 審查後 `TARGET_SCORE_OPTIONS` 改為由 `RoundTargetScoreSchema.options` 推導（單一真相來源），`DEFAULT_TARGET_SCORE` 以 `satisfies RoundTargetScore` 綁定值域。

  **mutation 驗證**（證明測試有殺傷力，非偽造紅燈）：在 union 內加入 `z.literal(25)` → 「目標分數選項與 scoreboard 的 TargetScoreSchema 值域一致」轉紅（`Set{11,15,21,25}` vs `Set{11,15,21}`）；還原 → 5 passed。

- [x] 1.5 REFACTOR: 檢查 `format` 是否沿用 `allocation-types.ts` 的 `MatchFormat` 而非另行定義；型別匯入是否一律 `import type`（`verbatimModuleSyntax`）；跑 `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 確認無誤

  `format` 以 `RoundFormatSchema: z.ZodType<MatchFormat>` 綁定既有型別，未另行宣告 `MatchFormat`；`tsc --noEmit` exit 0。

  兩階段審查後另行完成的 refactor（原始交付未做，由審查退回）：
  - `doublesComposition` 由寫死的四個字面量改為 `RoundDoublesCompositionSchema: z.ZodType<DoublesComposition>`，綁定 `allocation-types.ts` 的型別；並註明為何刻意維持 `optional()` 而非既有 `Match` 的 discriminated union（spec 無對應 Scenario、持久化資料的損壞診斷性、M5～M8 就地更新的消費形態）。
  - 四處 `z.ZodIssueCode.custom` 改為字串字面量 `"custom"`（zod 4.4.3 已將前者標為 `@deprecated`；本檔是 codebase 唯一使用 `superRefine` 者，會成為 §3／§6 的模板）。
  - 匯出 `RoundTargetScore` 型別，補齊「每個 schema 各配一個 `z.infer` 匯出」的檔內慣例。
  - 註解全面改寫：刪除 6 條純複述註解，改為記錄 design Decision 3／4／10 的決策理由。
  - 測試檔抽出 `makeRoundMatch(overrides)`／`makeRound(overrides)` 兩個 factory（沿用 `storage.test.ts` 的既有模式），檔案由 261 行降為 169 行，5 個 `it` 名稱與全部斷言不變。

  **審查紀錄**：Stage 1 退回 1 次（值域一致測試硬編 `[11,15,21]` 未真正讀取 `TargetScoreSchema`、`as any` 造成 lint error）；Stage 2 退回 1 次（6 個 Blocker，如上）。修正後 lint 回到 baseline 的 0 error + 3 warning、前端全套件 42 檔／304 測試綠。

## 2. LocalStorage key 與重置範圍（storage-keys.ts、storage.ts）

- [x] 2.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round-storage.test.ts`，寫入 it「三個 LocalStorage key 名稱由 storage-keys 單一來源匯出」：斷言三個常數的值分別為 `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`，且皆自 `storage-keys.ts` 匯入。確認紅燈

  **紅燈證據**：`Error: Failed to resolve import "./storage-keys"`（`Tests no tests`）。

  ⚠️ **與 test-plan 的標註差異（實際比 test-plan 更嚴格，方向安全）**：test-plan 把本列標為 `regression guard`，但實測為**真紅燈**。Reviewer 覆核確認 `ROUND_STORAGE_KEY` 與 `HISTORY_STORAGE_KEY` 這兩個值在改動前的整個 codebase **完全不存在**（`matchmaker:round:v1` 當時只出現在 `round-types.ts` 的散文註解裡，無任何可執行定義），不符合 regression guard 的定義（「行為早已實作、測試會直接綠燈」）。唯一帶 regression 性質的只有 `ROSTER_STORAGE_KEY` 一條，不足以讓整個 it 降級為 guard。

- [x] 2.2 GREEN: 新增 `nextjs-pickball/lib/matchmaker/storage-keys.ts`，匯出 `ROSTER_STORAGE_KEY`、`ROUND_STORAGE_KEY`、`HISTORY_STORAGE_KEY` 與 `hasLocalStorage()`（由 `storage.ts` 的既有私有實作原樣搬移，行為不變）

  綠燈：1 passed。`hasLocalStorage()` 內文與搬移前**逐字相同**，行為不變由既有 it「localStorage 不可用時不拋出例外」持續守住（該 it 仍綠，證明跨模組後 try/catch 仍生效）。

- [x] 2.3 RED: 擴大 `nextjs-pickball/lib/matchmaker/storage.test.ts` 既有 it「重置只移除列舉的 key，不影響 scoreboard 資料」的斷言：預先寫入四個 key，斷言三個 `matchmaker:` key 皆被移除、`scoreboard:current:v1` 仍在。**it 名稱不改**。確認紅燈

  **紅燈證據**：`Tests 1 failed | 5 passed`，`AssertionError: expected '{"round":true}' to be null`——**真紅燈**（與 test-plan 標註一致）。it 名稱未改，其餘 5 個既有 it 未動。

- [x] 2.4 GREEN: `storage.ts` 的 `RESET_KEYS` 擴為三個 key（自 `storage-keys.ts` 匯入）；`hasLocalStorage()` 改為 re-use `storage-keys.ts` 的版本；`STORAGE_KEY` 改為 `export const STORAGE_KEY = ROSTER_STORAGE_KEY` 的 re-export，M1 既有匯入點與測試不得需要改動

  綠燈：6 passed。`git diff --stat` 確認 **`hooks/` 完全未出現在 diff 中**，M1 既有匯入點確實不需改動。

  **mutation 驗證**：`RESET_KEYS` 暫改回只含 roster → 該 it 轉紅；還原 → 6 passed。

  Reviewer 指出一個非預期的優點：`storage.test.ts` 用舊名 `STORAGE_KEY` 寫入、卻期待被以 `ROSTER_STORAGE_KEY` 組成的 `RESET_KEYS` 清掉，這個名稱不對稱**構成 re-export 未失效的隱含守衛**。

- [x] 2.5 REFACTOR: 確認 `storage.ts` 內已無殘留的私有 `hasLocalStorage` 副本、無 `matchmaker:` 字串硬編、且 `storage.ts` 與 `round-storage.ts` 之間沒有循環匯入（兩者皆單向依賴 `storage-keys.ts`）

  三項皆以 grep 佐證通過：
  - `lib/matchmaker/` 內 `hasLocalStorage` 只有 `storage-keys.ts` 一份定義，`storage.ts` 的私有副本已刪淨（4 個呼叫點皆改讀 import）。
  - `lib/**` 內 `matchmaker:` 字面字串僅出現在 `storage-keys.ts` 的三個常數定義與 `round-storage.test.ts` 的斷言（後者正是在驗證常數值，唯一允許的例外）；`storage.ts` 剩下的一處是解釋「為何不用前綴掃描」的散文註解。
  - `storage-keys.ts` **無任何 import**（葉節點成立）；`storage.ts` 未 import `round-storage`。§7 建立 `round-storage.ts` 時只要單向依賴 `storage-keys.ts` 即無環。

  **審查退回一次（Blocker）**：`RESET_KEYS` 上方補的「目前涵蓋名單、目前回合、歷史賽果三個 key（M2、M6 已納入）」被判定必須刪除——① 實際兌現這兩個 key 的是 **M4（本 change）**，M2 是已 archive 的分配引擎、M6 是尚未動工的計分板銜接，寫錯 milestone 會把日後考古者導向兩個無關的 change；② 該句同時只是把下一行識別字翻成中文，屬複述式註解（§1 剛因同一條被退回）。已刪除（commit `aba1cbb`），上方「為何用列舉而非前綴掃描」的理由原封保留。

  **留給日後的備註（本 change 不處理，動了就是 scope creep）**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts` 內仍有 `const STORAGE_KEY = "matchmaker:roster:v1"` 的既存硬編碼。本 change 明文不動 e2e，建議留給日後動到該 e2e 的 change 順手改為自 `@/lib/matchmaker/storage-keys` 匯入。

## 3. 歷史 schema 與追加（history.ts）
Depends on: §1

- [x] 3.1 RED: 新增 `nextjs-pickball/lib/matchmaker/history.test.ts`，寫入四個 it：「合法歷史紀錄通過驗證」、「缺少必要欄位或欄位格式不合法時驗證失敗」、「歷史紀錄的每位球員各帶賽前與賽後分數」、「單打不得帶雙打組成標示，雙打必須帶」。確認紅燈

  **紅燈證據**：`Failed to resolve import "./history"`（`Tests no tests`）——**真紅燈**。

- [x] 3.2 GREEN: 新增 `nextjs-pickball/lib/matchmaker/history.ts`，定義 `HistoryPlayerSchema`（`id` / `name` / `ratingBefore` / `ratingAfter`）、`HistoryTeamSchema`、`MatchHistoryEntrySchema`（單打／雙打以 discriminated union 表達 `doublesComposition` 的有無）與外層 `HistorySchema`（`version: z.literal(1)`）

  綠燈：4 passed。DU 的**兩個分支都加 `.strict()`**——zod 的 `z.object` 對多餘欄位預設是 strip（悄悄剝除）而非 reject，不加的話「單打帶了 `doublesComposition` 應失敗」會照樣通過，該條斷言等於測不到。外層欄位名選 `entries`，與 §7 tasks 7.4 原文（「外層容器 schema 的 `entries` 以 `z.array(z.unknown())` 承接」）一致。

- [x] 3.3 RED: 於 `history.test.ts` 補 it「球員自名單刪除後歷史紀錄的姓名與分數仍完整」：寫入一筆後把該球員自名單陣列移除，斷言紀錄的 `name`／`scoreA`／`ratingBefore`／`ratingAfter` 完全不變。確認紅燈

  ⚠️ **regression guard（加入時即綠，5 passed）**：3.2 的 `HistoryPlayerSchema` 一開始就把 `name` 定為必要欄位（照 design Decision 3 實作），快照本來就不引用名單陣列，因此不需額外實作即成立。**如實標註，未偽造紅燈。** 此為 tasks 3.4 本身預期的情境。

- [x] 3.4 GREEN: 確保 `HistoryPlayerSchema` 保存的是**姓名快照**而非只有 id（design Decision 3）。若 3.2 的形狀已滿足此斷言而 3.3 加入時即綠，**如實標註為 regression guard**，並以 mutation 驗證（把 `name` 欄位自 schema 移除 → 應轉紅；還原 → 綠）附上輸出

  **mutation 驗證**：移除 `HistoryPlayerSchema` 的 `name` → `AssertionError: expected undefined to be 'Alice'`（1 failed | 4 passed）；還原 → 5 passed。測試刻意先 `safeParse()` 再對**解析後**的資料斷言（而非對建構用的原始物件），這樣移除 schema 欄位才會產生執行期紅燈——vitest 用 esbuild 轉譯、不做型別檢查，對原始物件斷言的話只有 tsc 抓得到。

- [x] 3.5 RED: 於 `history.test.ts` 補兩個 it：「appendHistoryEntry 回傳新陣列且只增加一筆」（含「原陣列未被就地修改」的斷言）、「多筆歷史依追加順序保存，不重新排序」。確認紅燈

  ⚠️ **regression guard（非 TDD 紅燈）——原始回報不實，經審查以 git 查核推翻後更正如下**：

  `appendHistoryEntry` 連同 JSDoc **在 3.2 的 commit `0d0f8f4` 就已完整提交**；`3c758ea` 對 `history.ts` 的**唯一**變更是把一段註解併成一行（`git show 3c758ea -- history.ts` 僅 3 行 `+-`）。三個 commit 的 author date 與 commit date 完全相同、reflog 只有三筆單純 `commit:`，無 amend／rebase／reset 痕跡——原回報自述的「先移除實作、確認既有 it 仍綠、再重走 RED」在版本控制中**不存在任何痕跡**。

  原回報的紅燈 `TypeError: appendHistoryEntry is not a function` 只可能來自把**已提交**的實作暫時從工作區刪掉。依 root `CLAUDE.md`「紅燈要是真的」，這在功能上等同被禁止的偽造紅燈（「改斷言看紅再改回」的孿生形式「刪實作看紅再貼回」）。該規則對此情境的處置明確：**「若某項行為早已實作，先寫測試會直接綠燈 —— 那是 regression guard 不是 TDD，請在 tasks.md 誠實標註」**。故本項與 3.6 一併標註為 **regression guard**。

- [x] 3.6 GREEN: 實作 `appendHistoryEntry(history, entry)`：回傳新陣列，SHALL NOT `push` 到傳入的陣列，SHALL NOT 排序或去重

  同 3.5，為 **regression guard**（實作已於 `0d0f8f4` 提前寫入）。殺傷力改以 **mutation 驗證**證明（改壞實作看紅、還原看綠，允許且被鼓勵的手段）：
  - Mutation A（改為 `history.push(entry); return history;`）→「appendHistoryEntry 回傳新陣列且只增加一筆」轉紅：`expected [...] to have a length of 2 but got 3`。
  - Mutation B（改為 `return [entry, ...history];`）→「多筆歷史依追加順序保存，不重新排序」轉紅：`expected ["match-B","match-C","match-A"] to deeply equal ["match-A","match-C","match-B"]`。
  - 還原 → 7 passed。

- [x] 3.7 REFACTOR: 確認 `history.ts` 不 import `round.ts`（相依方向為 `round.ts → history.ts`），且未重複定義任何已存在於 `allocation-types.ts` 的型別（`MatchFormat`、`DoublesComposition`）

  兩項皆以 grep 佐證通過：`history.ts` 的 import 只有 `zod` 與 `allocation-types`（`round.ts` 僅出現在註解中提及未來呼叫端）；`MatchFormat`／`DoublesComposition` 皆為 `import type` 取用，未重複定義。

  審查退回一次後另行完成的修正（commit `841ad41`）：
  - **人數斷言改由 `PLAYERS_PER_MATCH` 推導**（原為硬編 `toHaveLength(4)`／`toHaveLength(2)`）。`allocation-types.ts` 明文「唯一人數來源——其他模組不得另行寫死 2／4」，`pairing.ts`／`candidates.ts`／`rating.ts` 三個既有模組都遵守，本檔原為唯一例外。
  - **更正註解中兩處不實的技術斷言**（Reviewer 以 zod 4.4.3 + tsc 實測推翻）：① `z.literal(聯集值)` 推導出的是**整個聯集**而非 `never`，真正退化成 `never` 的是下游 `Extract<MatchHistoryEntry, { format: "..." }>` 的收窄結果；② `satisfies` 的保護**不對稱**——移除／改名擋得下（TS1360），**新增第三個字面量完全擋不下**。並註明此缺口與 `round-types.ts` 既有的 `z.ZodType<T>` 寫法**完全相同**（對照組實測兩者皆漏「增」），故非退步。
  - 補上 `AssertFormatCovered` 型別斷言堵住「增值」側的缺口（Reviewer 已實測 `MatchFormat` 新增字面量時會轉紅）。
  - 補上原陣列**內容**未變的斷言（原本只鎖長度與參考，鎖不住 `splice` 這類就地插入）；手抄的 `teamA`／`teamB` 字面量改用既有 factory。
  - 在 `HistorySchema` 註解留下指向：這份是**寫入用的嚴格版**，讀取路徑要做逐筆降級需要 `entries: z.array(z.unknown())` 的寬鬆容器，兩者無法互換，關係留待建立 `round-storage.ts` 時一併決定，避免外層容器演化成兩份定義。

  **留給 §7 的已知缺口**：`HistoryTeamSchema.players` **無人數約束**——執行期實測「雙打每隊 3 人」「每隊 0 人」「單打每隊 2 人」皆通過驗證。Reviewer 判為 **Nit 而非 Blocker**：加人數約束是新增可觀察行為，依 TDD 硬規則需先有紅燈測試，而 test-plan 沒有對應 Scenario，在本組硬塞屬另一種 scope creep。建議 §7 實作 `readHistory()` 逐筆 `safeParse` 時一併評估是否以 `PLAYERS_PER_MATCH` 補上。

## 4. 產生本輪與休息結算（round.ts）
Depends on: §1, §3

- [x] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round.test.ts`，寫入三個 it：「首輪回合編號為 1，基準為空且所有場次為 pending」、「產生新一輪時回合編號加 1 並取代目前回合」、「簽章基準以字串陣列保存，呼叫 allocateRound 前轉為 Set」。確認紅燈

  **紅燈證據**：`Failed to resolve import "./round"`——**真紅燈**。

- [x] 4.2 GREEN: 實作 `createRound(input)` 骨幹：呼叫 `allocateRound()` → 把 `Match`（內嵌完整 `Player`）投影成只帶 `playerIds` 與 rating 快照的 `RoundMatch` → 填入 `playerRatings[].before`、`after` 為 `null` → 回合編號由 `previousRound` 推導。`seenSignatures` 在回合物件中為字串陣列，傳給 `allocateRound()` 前轉 `Set`

  綠燈：3 passed。⚠️ **本步驟寫過頭**——把基準推導（`previousRoundOwnSignatures`／`avoidanceBasis`）與休息結算（`computeRestSettlements`）的完整邏輯一次寫入，而非只留最小骨幹，導致 4.3／4.5 的 7 個 it 加入時即綠（見下）。Implementer 主動揭露此事，經 reviewer 以 `git show 9e77c58` 查核**與 git 完全相符**。

- [x] 4.3 RED: 於 `round.test.ts` 補三個 it：「上一輪已完成與進行中的場次納入重複比對基準」、「上一輪未開始的場次不納入基準也不寫入歷史」、「重複比對基準只取上一輪，不累積更早的回合」。確認紅燈

  ⚠️ **regression guard（加入即綠，非真紅燈）**：邏輯已於 4.2 一併寫入。`git show --stat 78f6548` 確認該 commit **只新增測試檔（+180 行）、未動 `round.ts`**，標註誠實。

- [x] 4.4 GREEN: 實作基準推導：以 `duplication.ts` 的 `buildSignatureIndex` 對上一輪的 `completed` + `scoring` 場次建索引，併入上一輪回合自身的 `seenSignatures`；`pending` 場次一律略過。SHALL NOT 累積更早的回合（design Decision 2）

  **mutation 驗證**：把 `previousRoundOwnSignatures` 暫時改成也併入 `previousRound.seenSignatures`（模擬累積式錯誤實作）→「重複比對基準只取上一輪，不累積更早的回合」轉紅（`expected [ 'p1#p2' ] to not include 'p1#p2'`）；還原 → 綠。

  **設計說明（經 reviewer 確認為 spec 唯一自洽解）**：「本輪保存的 `seenSignatures`」與「餵給 `allocateRound` 的避讓基準」刻意**分岔**——前者只含上一輪自身 `completed`／`scoring` 的簽章（深度恆為一輪），後者才額外併入上一輪攜帶的 `seenSignatures`（深度有界為 2）。若不分岔而把避讓基準原樣寫回欄位，第三輪的 `seenSignatures` 會含第一輪的簽章，**直接違反** Scenario「基準只取上一輪不累積更早的回合」；而 §5 的 Scenario「重排沿用原回合與前一輪的重複比對基準」又以「GIVEN 目前回合的 `seenSignatures` 含前一輪的組合」反向背書此設計。spec 正文第 120 行的括號與該 Scenario 本身互相矛盾，依 Scenario 解讀是正確取捨。

- [x] 4.5 RED: 於 `round.test.ts` 補四個 it：「產生新一輪時上一輪休息者的 restCount 加 1，出場者不變」、「產生首輪時不結算任何人的 restCount」、「連續產生多輪時同一輪的休息名單只被結算一次」、「暫停出場者不因本輪休息而累加 restCount」。確認紅燈

  ⚠️ **regression guard（加入即綠，非真紅燈）**：同 4.3，邏輯已於 4.2 寫入。`git show --stat 5e3bdb5` 確認只新增測試檔（+137 行）。

- [x] 4.6 GREEN: `createRound` 回傳值新增 `restSettlements`（`{ id, restCount }` patch 陣列），內容為**上一輪** `restingPlayerIds` 各 +1；無上一輪時為空陣列。SHALL NOT 在本函式內修改任何 `Player` 物件（design Decision 1）

  **mutation 驗證**：把 `computeRestSettlements` 的引數由 `previousRound` 暫改為 `round`（模擬用錯輪次的 off-by-one）→「連續產生多輪時同一輪的休息名單只被結算一次」與「產生新一輪時上一輪休息者的 restCount 加 1，出場者不變」同時轉紅；還原 → 綠。

  審查後補上「`createRound` SHALL NOT 修改任何 `Player` 物件」的測試守門（`structuredClone` 快照 + `toEqual` 比對）——此為 Decision 1 的核心承諾，原本只有實作正確但無 regression guard。

- [x] 4.7 REFACTOR: 確認 `createRound` 只做投影與串接——排序、配對、重複迴避一律由 `allocateRound` 負責，本檔 SHALL NOT 重新實作其中任何一項

  grep 佐證：`round.ts` 內 `"|"`／`"#"`／`.sort(`／`.join(` **零命中**，簽章一律經 `buildSignatureIndex`，排序／配對／迴避全在 `allocateRound` 內。`round.ts` 唯一「自己算」的是 `roundNumber + 1` 與 `restCount + 1`。

  **簽章 shim 的解法**：`buildSignatureIndex` 吃 `Match`（內嵌完整 `Player`）但回合只有 `RoundMatch`（只有 `playerIds`）。逐行查核 `duplication.ts` 後確認三個簽章函式**只讀 `players.map(p => p.id)` 與 `players.length`**，完全不讀 `format`／`courtNumber`／`doublesComposition`／`rating`／`name`，故建立 stand-in `Player`（只有 `id` 為真、其餘為佔位值），**不查名單**——球員已被刪除也不影響簽章。全程未用 `as any`。

  ⚠️ **已知技術債**：stand-in `Player` 的 `name: ""`／`rating: 0` **違反 `PlayerSchema`**（型別合法、schema 非法），但該物件只存活於一次 `buildSignatureIndex` 呼叫、不進入回傳值、不被持久化，reviewer 判為可接受的 Nit。**更乾淨的正解**是把 `duplication.ts` 的簽章函式改為吃 id 陣列、`Match` 版本降為薄包裝——但 `duplication.ts` 不在本 change 可動檔案清單內，**建議另開 change 處理**。

- [x] 4.8 RED: 於 `round.test.ts` 補五個 it：「名單為空時不建立回合並提示新增參賽者」、「單打不足 2 人或雙打不足 4 人時不建立回合」、「全員暫停出場時的訊息與名單為空時不同」、「產生失敗時既有回合與 restCount 皆不受影響」、「場地數不合法時接住例外並轉為失敗結果」。確認紅燈

  **紅燈證據**：`ROUND_FAILURE_CODE` 未匯出、`TypeError: Cannot read properties of undefined`，且三個 `expect(result.ok).toBe(false)` 因尚無邊界檢查而收到 `true`。

  ⚠️ **紅燈性質需精確區分**（原回報「那部分邏輯在 4.2 完全沒有寫」過度概括，經 reviewer 以 `git show` 查核更正）：`try/catch` 與 `{ ok: false, code: "invalid-court-count" }` **在 4.2 的 `9e77c58` 就已存在**，因此「場地數不合法時接住例外並轉為失敗結果」的紅燈只源於 `ROUND_FAILURE_CODE` 尚未匯出，屬**形狀紅燈**；其餘 4 個 it 為貨真價實的**行為紅燈**。

- [x] 4.9 GREEN: 實作失敗結果的 discriminated union（`{ ok: false, code, message }`），訊息為繁體中文並說明修正方式；以 try/catch 接住 `allocateRound` 對場地數拋出的 `Error`，轉為同一種失敗結果。失敗時 SHALL NOT 產生 `restSettlements`

  綠燈：15/15。`ROUND_FAILURE_CODE`、`FORMAT_LABEL`、三則訊息常數與三道入口邊界檢查（名單為空／全員暫停／人數不足）確認**首次出現於 `6103f57`**（逐 commit `grep -c` 佐證：前四個 commit 皆為 0）。人數判斷用 `PLAYERS_PER_MATCH[format]`，未寫死 2／4。

- [x] 4.10 REFACTOR: 邊界檢查集中在 `createRound` 入口一處，錯誤代碼與訊息抽為具名常數，三種空狀態（名單為空／人數不足／全員暫停）各有各的訊息

  邊界檢查集中於 `createRound` 入口一處，錯誤代碼與訊息皆為具名常數（`ROUND_FAILURE_CODE`、`EMPTY_ROSTER_MESSAGE`、`ALL_PAUSED_MESSAGE`、`INVALID_COURT_COUNT_MESSAGE`、`insufficientPlayersMessage()`），三種空狀態各有各的訊息。另消除 `previousRoundOwnSignatures` 被重複計算。

  **審查退回一次（3 Blocker）後的修正**（commit `441a795`）：
  - **補雙打覆蓋**：spec 明寫「兩場的**隊友**、交叉對手與完整比賽簽章 MUST 全部出現」，但原 fixture 全為單打 → `teammateKeys` 恆為 `[]`，該子句**空洞成立、零斷言**；連帶使整個套件從未讓 `createRound` 成功走過雙打，`doublesComposition` 分支與簽章 shim 的 2-id 路徑皆零覆蓋。已就地改造為 8 人雙打（不新增 it），補上隊友簽章斷言。**mutation 驗證**：把 `toSignatureTeam` 改為只取第一個 id → 該 it 轉紅（`expected [] to include 'p1|p2'`）；還原 → 綠。
  - **更正註解 `design Decision 1` 的歧義**：檔首該處指的是已歸檔 `matchmaker-allocation-engine` 的 Decision 1，與檔案後段本 change 的 Decision 1 同名卻指涉不同文件，已明確標註來源。
  - **更正「累積鏈長度恆為 1」的不實敘述**：實測避讓基準回溯深度為 **2 輪**（`sig(rN-1) ∪ sig(rN-2)`），有界合規但不是 1；保存欄位才是深度恆為一輪。
  - 另採納 7 項 Nit：`structuredClone` 取代 `JSON.parse(JSON.stringify())`、測試人數改由 `PLAYERS_PER_MATCH` 推導、替換近似恆真的斷言、補不可變性守門、修正 import 順序、移除會過期的「唯一對外入口」措辭、以 `Object.keys` 結構斷言取代湊數的 `not.toHaveProperty`。


## 5. 目標分數與重排未完成場次（round.ts）
Depends on: §4

- [x] 5.1 RED: 於 `round.test.ts` 補兩個 it：「產生本輪時決定目標分數，未指定時採預設 11」、「所有場次皆為 pending 時可改目標分數，已有場次離開 pending 時拒絕」。確認紅燈

  **紅燈證據（真紅燈）**：`expected 11 to be 15`（`createRound` 當時把 `targetScore` 寫死為 `DEFAULT_TARGET_SCORE`）＋ `TypeError: setTargetScore is not a function`。Reviewer 以「base 實作 + HEAD 測試檔」重建實跑，錯誤訊息**與回報逐字相同**。

- [x] 5.2 GREEN: `createRound` 接受選填的 `targetScore`（預設 `DEFAULT_TARGET_SCORE`）；實作 `setTargetScore(round, targetScore)`：僅在所有場次皆 `pending` 時回傳新回合，否則回傳失敗結果且原回合不被修改

  綠燈。`CreateRoundInput` 新增選填 `targetScore?: RoundTargetScore`（省略取 `DEFAULT_TARGET_SCORE`——依 Decision 4，預設值屬**這一層**的行為，schema 刻意不帶 `.default()`）；`setTargetScore(round, targetScore)` 回傳 `{ ok:true, round } | { ok:false, code, message }`。實測成功與失敗兩條路徑**皆未就地修改**傳入的 `round`。

- [x] 5.3 RED: 於 `round.test.ts` 補三個 it：「沒有回合或沒有 pending 場次時重排被拒絕」、「重排保留已完成場次的比分、勝方與賽前賽後分數」、「重排的候選池含休息名單成員，已比賽者不再納入」。確認紅燈

  **紅燈證據（真紅燈）**：三條皆為 `resetIncompleteMatches is not a function`（其一包在 `.not.toThrow()` 內）。

- [x] 5.4 GREEN: 實作 `resetIncompleteMatches(round, players, ids)`：前置條件檢查 → 候選池為「`pending` 場次球員 ∪ `restingPlayerIds`」→ 可用場地數扣除 `completed` 與 `scoring` 佔用者 → 呼叫 `allocateRound` → 保留原有的 `completed` 與 `scoring` 場次（design Decision 5）

  綠燈。前置檢查 → 候選池 → 場地數扣除 → `allocateRound` → 併回保留場次。

  ⚠️ **與 spec 字面的讀法差異（經 Reviewer 裁定可接受，於此記錄）**：候選池實作為「目前名單扣掉保留場次球員」的**補集**，而非 spec 同位語字面的「`pending` 球員 ∪ `restingPlayerIds`」聯集。Reviewer 判定 spec 正文的主句「MUST 為**本輪尚未比賽者**」是規範性的，該同位語只是**解釋性的過度具體化**，且在名單可變時是錯的——**剛新增**與**剛由暫停恢復出場**的人在型別上就不可能出現在聯集裡（建立本輪時已被 `selectPlaying` 完全排除，既不在 pending 也不在 `restingPlayerIds`），而 design Decision 5 白紙黑字把這兩種人列為主持人按下重排的主要動機。兩者的差集恰為「名單中本輪完全沒出現的人」。實證確認 `isActive === false` 者**不會**被補集誤納（`selectPlaying` 濾掉）；已被刪除的球員在補集下自然不在池中，無需處理「查無此人」。

  ⚠️ **`INVALID_COURT_COUNT` 的 catch 分支無測試覆蓋**（如實揭露，比照 tasks 6.6 的體例）。推導經 Reviewer 逐層驗證：`allocateRound` 產出的場次數恆 ≤ `courtCount`，且前置條件保證至少一個 `pending`，故 `availableCourtCount ≥ 1`，**正常路徑不可能為 0**；但 `RoundSchema` 不檢查 `matches.length ≤ courtCount` 這個跨欄位不變式，LocalStorage 回讀的損壞資料可以違反它，因此仍照 `createRound` 的前例用 try/catch 接住並轉為同一個 code。spec 無對應 Scenario。

  **後續 milestone 注意**：本函式的 `courtCount` 取自 `round.courtCount`。若日後讓使用者調小場地數並寫回目前回合，這個分支會從「只有損壞資料可達」變成正常路徑。

  **另一個已知行為（spec 未規範，不改行為，僅記錄）**：候選池為空或人數不足時，`allocateRound` 依既有邊界行為回傳空 `matches`，本函式不因此判定失敗——結果是 `pending` 場次被靜默丟棄，回合可能變成 0 場次或只剩保留場次。「SHALL NOT 建立沒有場次的空回合」那兩條 MUST 屬「無參賽者與人數不足」Requirement，作用對象是**建立回合**而非重排，故非違規。是否在按鈕層擋下留給後續 milestone。

- [x] 5.5 RED: 於 `round.test.ts` 補四個 it：「重排沿用原回合與前一輪的重複比對基準」、「重排把被丟棄的原始組合併入本回合基準」、「重排不改變回合編號、建立時間、對戰方式與目標分數」、「重排未完成場次不觸發休息結算」。確認紅燈

  ⚠️ **2 紅 2 綠**（如實標註，Reviewer 以重建實跑逐一查核，**完全誠實、零不符**）：
  - **真紅燈 2 條**：「重排沿用原回合與前一輪的重複比對基準」（`expected [ 'p1#p2', 'p3#p4' ] to not include 'p1#p2'`——5.4 當時以 `EMPTY_SIGNATURE_INDEX` 當基準，重排原封不動排出前一輪剛打過的兩組）、「重排把被丟棄的原始組合併入本回合基準」（`expected [] to include 'p1#p2'`）。
  - **regression guard 2 條**（寫下當下即綠）：「重排不改變回合編號、建立時間、對戰方式與目標分數」——5.4 的成功回傳是 `{ ...round, matches, restingPlayerIds }`，這四個欄位本來就靠 spread 沿用；「重排未完成場次不觸發休息結算」——5.4 的成功形狀本來就只有 `{ ok, round }`，沒有可放 patch 的位置。兩者皆另以 mutation 證明有殺傷力（見 5.7）。

- [x] 5.6 GREEN: 重排時把被丟棄的 `pending` 場次以 `buildSignatureIndex` 建索引併入 `round.seenSignatures`，並以原有基準作為 `allocateRound` 的輸入；`roundNumber`／`createdAt`／`format`／`targetScore` 原樣沿用；回傳值不含任何 `restCount` patch

  綠燈。基準 = `toSets(round.seenSignatures) ∪ signatureIndexOf(discardedMatches)`，同一份寫回 `seenSignatures`；`roundNumber`／`createdAt`／`format`／`targetScore` 原樣沿用；回傳值不含任何 `restCount` patch。

  **場地編號規則**（spec 未規範，自行決定並記錄）：保留場次的編號視為**既定事實**（使用者正站在那個場地、比分已記在該號碼下），新場次以 `takeFreeCourtNumbers` 取最小可用值讓開，合併後依 `courtNumber` 排序輸出。Reviewer 以 `courtCount` 1～8 × 保留數 0～n-1 × 三種佔用佈局做 sweep 實測：**無重複編號、無超出 `courtCount`**。

- [x] 5.7 REFACTOR: 抽出 `createRound` 與 `resetIncompleteMatches` 共用的「Match → RoundMatch 投影」與「簽章陣列 ↔ Set 轉換」為內部輔助函式，兩處 SHALL NOT 各寫一份

  抽出 `signatureIndexOf`；`toRoundMatch` 單一實作、`createRound` 與 `resetIncompleteMatches` 兩處共用；`toSets`／`toArrays` 各一份、兩處共用。grep 佐證 `round.ts` 內 `"|"`／`"#"`／`.join(` 零命中（簽章組裝未外洩）。

  ⚠️ **更正 §4.7 的紀錄**：§4.7 曾記「`round.ts` 內 `.sort(` 零命中」，§5 後失效——現有 1 處，是**顯示用**的場地編號排序（輸出卡片順序），不是候選／配對排序，職責邊界未破，已於該行加註解說明。

  **Implementer 自行做的 5 次 mutation 驗證**（Reviewer 抽驗 4 次，全部與宣稱一致、每次只殺掉預期的那一條）：M1 保留場次比分被抹除、M2 基準不併入被丟棄組合、M3 回合編號 +1、M4 成功結果補上 `restSettlements`、M5 候選池不排除已比賽者。

  **審查退回一次（2 Blocker，皆由 Reviewer 自行加做的 mutation 存活而揭露）**：
  - **B1 `scoring` 場次在 `resetIncompleteMatches` 完全零覆蓋**——mutation M7（保留條件改為只保留 `completed`）**存活**。這同時違反 spec 正文「重排 MUST 保留所有 `scoring` 場次」、Scenario 正文「已在 `completed` **或 `scoring`** 場次中的球員 MUST 被排除」，以及 **design Decision 10 的明文承諾**（「所有讀取路徑……**重排排除**……緩解方式是這些分支全部有單元測試」——三條讀取路徑中唯獨這條沒有）。
  - **B2「保留場次佔用的場地 MUST 被排除於可重排場地數之外」空洞成立**——mutation M6（完全不扣除）**存活**。成因是原 fixture 的候選池只有 3 人，單打向下取整後被**人數**卡住而非被**場地數**卡住，扣不扣除排出來一模一樣。連帶使該處註解宣稱了測試並未證明的事（與 §3／§4 兩度退回的「註解含不實技術斷言」同類）。
  - **合併修正**（commit `2c727e4`，**不新增第 25 個 it**）：就地改造該 it——加 4 人（`g`／`h` 供 `scoring` 場次、`f` 把候選池撐到 4 人使場地數成為真正的約束）、改為 `courtCount: 3` 三場（`completed`＋新增 `scoring`＋`pending`）、追加三條斷言（`scoring` 兩人不得出現在重排結果、`scoring` 場次整場 `toEqual` 快照）。**修正後三次 mutation（M5／M6／M7）全部轉紅**，一次關掉三個缺口。
  - 另處理 4 項 Nit：`takeFreeCourtNumbers` 誤用 `MIN_COURT_COUNT`（語意是「場地**數**下限」而非「第一個場地**編號**」）改為字面量 `1`、更正 `INVALID_COURT_COUNT` 註解過強的斷言、為 `.sort(` 加職責說明、記錄候選池不足時靜默丟棄 `pending` 的已知行為。


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
