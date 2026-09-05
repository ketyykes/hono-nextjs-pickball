# Design: matchmaker-timed-draw

## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- **本 change 移除一條長期存在的產品禁令，不是新增一個全新的路徑分支**。`prd.md` 13.4「平局
  不得送出」自 M3（`matchmaker-rating-engine`）起就是 `match-rating` 明文的 Non-Goal（該
  capability 主 spec 現有一句「本 capability SHALL NOT 提供平局路徑（`S = 0.5`）」），
  `round-lifecycle` 的「比分驗證」也把「兩隊比分相同」列為五種必拒條件之一。本 change 的核心
  工作是把這條**全域禁令**改成**條件式豁免**（僅計時回合），而非設計一個全新概念。
- **`round.timer` 由 M14（`matchmaker-round-timer`）引入，本文件撰寫時尚未存在於 `main`**。
  M10～M14 依序執行、逐棒合併，本 change 是最後一棒；`main @ 3fa2d22`（本 change 開分支的
  基準）上 `grep -rn "timer" nextjs-pickball/lib/matchmaker/*.ts` 完全無命中。因此
  「計時回合」的判定條件 `round.timer !== null` 是**設計假設**，不是已驗證的事實——見
  Open Questions 第 1 條，apply Step 0 MUST 以屆時合併後的 `main` 重新核對欄位名稱與型別。
  **補充佐證（非驗證依據）**：本 session 撰寫期間，`openspec/changes/matchmaker-round-timer/`
  已由另一個平行 session 產出 proposal.md／design.md／specs（**尚無 tasks.md／
  execution-plan.md／environment.md，propose 階段本身尚未完成，遑論 apply 或合併**）。
  其 proposal.md 明訂 `Round.timer` 為
  `{ durationMinutes: 10 | 15 | 20; startedAt: string | null } | null`，與本文件的假設
  `round.timer !== null` 逐字相符，且其「明確不做」一節明文把「平局判定與『時間到但平手』
  的處理規則」劃給本 change（M15）。這**強化**了本文件假設的可信度，但**不能取代** apply
  Step 0 的實測義務——propose 階段的姐妹 change 內容在其自身完成 apply 並合併回 `main`
  之前，隨時可能因該 change 自己的 Stage 1／Stage 2 審查或人類裁決而改變欄位名稱或型別。
  SHALL NOT 因為讀過這份未合併的 proposal 就跳過 Open Questions 第 1 條要求的 `main`
  實測重新核對。
- **`validateScoreInput(match, rawScoreA, rawScoreB)` 目前只接受 `match`，不接受 `round`**
  （`nextjs-pickball/lib/matchmaker/round.ts:634`）。是否允許平局是**回合層級**的屬性
  （`timer` 掛在 `Round` 不掛在 `RoundMatch`），該函式現有簽章拿不到這項資訊，必須新增參數
  （Decision 2）。
- **`submitScore` 已經持有整個 `round`**（`SubmitScoreInput.round: Round`），且
  `hooks/useRoundStore.ts` 呼叫 `submitScorePure` 時本來就傳入 `state.round` 整包——因此
  「計時回合」判定條件要從 `page.tsx`／`CourtCard.tsx`／`useRoundStore.ts` 一路往下傳的疑慮
  並不存在：`submitScore` 內部即可由 `input.round.timer` 推導出 `isTimedRound`，再往下傳給
  `validateScoreInput`。UI 層（`CourtCard.tsx`／`ScoreEntry.tsx`）完全不需要感知這個判定
  （見 Decision 6）。
- **`updateRatings` 的 `winnerIndex: 0 | 1`**（`nextjs-pickball/lib/matchmaker/rating-types.ts`）
  是目前唯一表達「誰贏」的欄位；`rating.ts` 內 `const s = winnerIndex === teamIndex ? 1 : 0;`
  是唯一讀取它的地方。`S = 0.5` 必須能經由同一個輸入表達（Decision 1）。
- **`winner` 欄位目前是二值列舉，出現在四個獨立的 zod schema**：`RoundMatchSchema.winner`
  （`round-types.ts`）、`MatchHistoryEntrySchema.winner`（`history.ts`），兩者皆為
  `z.enum(["teamA", "teamB"]).nullable()` 或 `.enum(["teamA","teamB"])`（史紀錄不可為
  `null`，已完成才會有紀錄）。`BackupSchema`（`transfer-types.ts`）**不**重新宣告 `winner`，
  而是直接 `import`／組合 `RoundSchema` 與 `MatchHistoryEntrySchema`——這代表本 change
  只需要改兩處 schema 定義，`backup.ts` 與 `transfer-types.ts` 零修改（見 Decision 5）。
- **三個「勝方文案」消費點各自用二元判斷，皆會在不修改的情況下把 `"draw"` 誤判為
  `"teamB"`**：`history-csv.ts:129` 的
  `entry.winner === "teamA" ? TEAM_LABELS[0] : TEAM_LABELS[1]`、
  `CourtCard.tsx:106-113` 的 `match.winner === winnerKey`（此處相對安全——兩個 key 都不等於
  `"draw"`，兩隊「勝」標籤自然雙雙不顯示，但**沒有**「平手」的替代顯示，色彩之外沒有任何
  文字告知使用者這場打平了）、`HistoryRecordCard.tsx:89,95` 的 `entry.winner === "teamA"`／
  `"teamB"`（與 `CourtCard` 同型，兩者皆為 `false` 但同樣缺「平手」顯示）。
  `export-scene.ts:172` 的 `TEAM_LABELS_BY_KEY[match.winner]` 是三者中**類型上會直接壞掉**
  的一處——`TEAM_LABELS_BY_KEY` 的型別是 `Record<"teamA" | "teamB", string>`，`winner` 型別
  一旦擴為三值，這行在 `winner === "draw"` 時的查表會是 `undefined`，且 `tsc --noEmit`
  MUST 因型別不符而報錯（這是好事——逼實作者在型別層面就正視這個分支，而非等到執行期才顯示
  `undefined獲勝`）。
- **`scoreboard`（M6 場邊計分）結構上不可能產生平局**：`openspec/specs/scoreboard/spec.md`
  的「計分規則 — Traditional Side-Out」要求「贏 2 分」（`isGameWon` 的 `targetScore`／
  win-by-2 判定），`lib/matchmaker/scoreboard-binding.ts` 的
  `collectFinishedSubmissions`／`isEligibleForBackfill` 只回填 `slot.status === "finished"`
  的場次，而 `finished` 只在 `isGameWon` 判定某一方獲勝時才會成立。因此計分板路徑永遠不會把
  相同比分送進 `submitScore`；`scoreboard` capability 零改動，也不需要為它另開一條
  平局測試（詳見 Risks「計分板路徑天然排除」）。

## Goals

- 讓計時回合下「時間到、兩隊比分相同」這個場景可以被正式送出並完整走完既有的送出流程
  （評分更新 → 標記完成 → 寫入歷史），不再永遠卡在「未完成」。
- 讓 `S = 0.5` 的評分計算延續既有零和結構性保證（`match-rating` 的「零和的成立條件」），
  不另立一套平局專屬的計算公式。
- 讓「平手」在歷史、CSV、JPG／PDF 匯出、對戰頁四個既有的「勝方顯示」位置**同步**出現，
  不遺漏任何一處——四處目前都是各自獨立的二元判斷，遺漏一處就會讓使用者在不同畫面看到
  不一致的資訊（有些顯示平手、有些沉默、有些誤判成某隊獲勝）。
- 非計時回合維持 `prd.md` 13.4 的既有行為，一位元不變；本 change 是**新增條件式例外**，
  不是放寬全域規則。
- 在**不新增任何 npm 相依**、**不修改 `scoreboard`／`player-roster`／`hono-pickball`**的
  前提下完成。

## Non-Goals

- **不做「延長賽」自動流程**。`prd.md` 第 15 章已否決「系統自動判斷延長賽」；時間到即可送出
  平局是本 change 的全部範圍，不新增任何「差距 2 分才算數」之類的規則到計時回合。
- **不重算既有歷史**。已寫入的歷史紀錄（含舊版備份）維持原樣；本 change 不提供任何批次遷移
  或重算工具。
- **不做每場獨立計時**。`round.timer` 是整輪層級（M14 的既有設計），本 change 沿用同一顆
  判定，不新增「本場單獨倒數」的概念。
- **不修改 `scoreboard` 的任何 Requirement**（見 Context 最後一點）。
- **不對「哪一隊在計分板上先達標」之類的爭議做任何裁決**——那從結構上不會發生。

## Decisions

### Decision 1：`RatingUpdateInput.winnerIndex` 由 `0 | 1` 擴為 `0 | 1 | "draw"`

**Choice**：`winnerIndex: "draw"` 時，兩隊的 `s` 皆為 `0.5`：

```ts
const s = winnerIndex === "draw" ? 0.5 : (winnerIndex === teamIndex ? 1 : 0);
```

**Rationale**：`winnerIndex` 已經是唯一的「結果」輸入，公式本身（`Ra' = Ra + K_eff × (S - E)`）
只需要 `S` 這一個數字，`"draw"` 作為第三個字面量選項比任何額外欄位都更貼近「這就是第三種
結果，不是第二個獨立的旗標」的語意。本 repo 也有現成的同型前例：`MatchStatus` 從 M1 的兩值
（`pending`／`completed`）在 M4 擴為三值（加入 `scoring`）時，走的就是同一條「擴增字面量
聯集」的路，而非另立 `isScoring: boolean`。

**Alternatives considered**：
- **另加 `isDraw: boolean` 旗標，`winnerIndex` 維持 `0 | 1`**：否決——會產生兩個可能互相矛盾
  的欄位（`winnerIndex: 0` 但 `isDraw: true` 時該信哪個？），且呼叫端必須記得同時維護兩個
  欄位的一致性。這正是本 repo 在別處反覆否決的「兩份真相來源」模式（例如
  `round-types.ts` 對「回合與名單不得雙寫同一份資料」的既有論證）。
- **判別聯集 `{ type: "decisive"; winnerIndex: 0 | 1 } | { type: "draw" }`**：型別上最嚴謹，
  但 `submitScore`／既有測試 fixture 的建構語法全數要改（`{ winnerIndex: 0 }` 變成
  `{ type: "decisive", winnerIndex: 0 }`），改動面遠大於字面量擴增，且本 capability 目前
  沒有其他判別聯集的先例（`RoundMatchSchema` 甚至為了避免判別聯集的收斂成本刻意選擇
  `optional()`，見該檔既有註解）。與既有風格不符，否決。

### Decision 2：`validateScoreInput` 新增第四個參數 `isTimedRound: boolean`（呼叫端注入）

**Choice**：

```ts
export function validateScoreInput(
  match: RoundMatch,
  rawScoreA: string,
  rawScoreB: string,
  isTimedRound: boolean,
): ValidateScoreResult
```

`submitScore` 內部以 `input.round.timer !== null` 算出這個布林值再往下傳，本函式本身
**不**接觸 `Round` 或 `timer` 欄位。

**Rationale**：
1. **最小知情原則**。`validateScoreInput` 需要的資訊只有「這是不是計時回合」這一個布林值，
   不需要 `timer` 的其餘欄位（開始時間、時長等，屬 M14 的內部細節）。傳一個布林值而非整個
   `Round` 或 `timer` 物件，讓本函式的測試 fixture 不必知道 M14 的欄位形狀，也讓本 change
   與 M14 的實際欄位命名解耦——即使 M14 交付的欄位名稱與本文件假設的 `timer` 不同，
   只要呼叫端（`submitScore`）那一行的推導式改掉，`validateScoreInput` 本身完全不受影響。
2. **與現有函式簽章的擴增風格一致**。本檔案已有先例：`toRatingInput`／`resolveTeamPlayers`
   等函式一律只取用「當下這一步驟真正需要」的最小子集，不整包傳遞上游物件。
3. **呼叫端已經持有 `Round`，不需要多穿一層參數**。`submitScore` 本來就收到完整
   `SubmitScoreInput.round`，計算 `isTimedRound` 只是多一行 `const isTimedRound =
   round.timer !== null;`，不需要改變任何呼叫鏈上游（`useRoundStore.ts`／`CourtCard.tsx`
   零改動，見 Context 第三點）。

**Alternatives considered**：
- **改傳整個 `round: Round` 取代 `match: RoundMatch`**：否決——`validateScoreInput` 現有的
  唯一必要輸入是「這一場」的狀態（`match.status`），改傳整個 `round` 等於讓函式對外暴露
  「我可能會用到回合的其他欄位」這個錯誤訊號，且既有 20+ 個呼叫點（`round.test.ts`）的
  fixture 全部要從「一個 match」改造成「一個 match + 一個 round」，改動面不成比例。
- **在 `RoundMatch` 上冗餘存一份 `isTimedRound`**：否決——回合的計時狀態理論上可能在一輪
  進行到一半時被使用者關閉／開啟（M14 的行為屬其自身範圍，本 change 不假設它不可變），
  在每個 `RoundMatch` 上各存一份等於引入 N 份可能與 `Round.timer` 不同步的拷貝。

### Decision 3：`winner` 由 `"teamA" | "teamB"` 擴為 `"teamA" | "teamB" | "draw"`，`RoundMatchSchema` 與 `MatchHistoryEntrySchema` 各自獨立擴增

**Choice**：兩個 schema 的 `winner` 列舉各自加上 `"draw"` 字面量，不抽出共用的
`WinnerSchema` 匯出物件。

**Rationale**：`round-types.ts` 與 `history.ts` 目前對「同一個概念在兩處是否共用 schema」
已有明確且一致的既有立場——`RoundFormatSchema`／`HistoryDoublesCompositionSchema` 都是
「各自宣告、值域以測試耦合而非程式碼 import 耦合」（`round-types.ts` 頂部註解：
「分屬不同 capability、語意不同，不要合併」）。`winner` 延續同一條線：兩者的值域必須一致，
但 `RoundMatch.winner` 是**可為 `null`** 的「進行中欄位」，`MatchHistoryEntry.winner` 是
**必填**的「已發生事實欄位」，两者的 nullable 語意本來就不同，共用一個 schema 反而要多一層
`.nullable()` 的條件判斷。

**Alternatives considered**：
- **抽出 `export const WinnerSchema = z.enum(["teamA", "teamB", "draw"])` 供兩處
  import**：曾考慮，但會是本 change 對兩個既有檔案「刻意各自宣告」慣例的第一次偏離，且
  `round-types.ts` 開宗明義已否決過同類合併（`RoundFormatSchema` 的既有註解）。維持一致性
  優先於省兩行程式碼，否決。

### Decision 4：非計時回合的 TIE 失敗維持同一個錯誤代碼，只更新訊息文字

**Choice**：`VALIDATE_SCORE_FAILURE_CODE.TIE` 保留原代碼與原五種失敗代碼的集合不變；
`TIE_MESSAGE` 的文字改為明確指出「非計時回合不得送出平局」（與 `match-stage` 的「手動輸入
比分與送出」Requirement 要求的字面文案一致，見該 delta spec）。

**Rationale**：本 change 之後，`TIE` 失敗**只可能**在非計時回合發生（計時回合的兩隊比分
相同已改道成功路徑，不再落入 `TIE` 分支）。既然「導致 `TIE` 失敗」與「非計時回合」在此之後
是同一件事,不需要新增第二個代碼去區分兩種原本就不會同時存在的情境——新增代碼只會讓
`SubmitScoreFailureCode` 的聯集多一個永遠與既有 `TIE` 互斥的值，徒增下游 `switch`／型別窮舉
的分支數卻不承載新資訊。真正需要改的只有訊息文字本身（brief 要求「錯誤訊息區分『非計時回合
不得平局』」），因此只動 `TIE_MESSAGE` 常數。

**Alternatives considered**：
- **新增 `VALIDATE_SCORE_FAILURE_CODE.DRAW_NOT_ALLOWED_UNTIMED` 取代 `TIE`**：否決——
  `TIE`／`ALREADY_COMPLETED` 等既有代碼名稱皆描述「觸發條件」而非「哪個 capability
  的規則」，`TIE` 已精確描述「兩隊比分相同」這個觸發條件，改名不會讓語意更清楚，反而讓
  現有測試（`round.test.ts` 既有斷言 `code === VALIDATE_SCORE_FAILURE_CODE.TIE`）全部改名，
  純粹的無謂改動。

### Decision 5：`data-transfer` 的 `backup.ts`／`transfer-types.ts` 零修改，`"draw"` 透過 schema 組合自動生效

**Choice**：不修改 `nextjs-pickball/lib/matchmaker/backup.ts` 與
`nextjs-pickball/lib/matchmaker/transfer-types.ts` 任何一行程式碼；`data-transfer` 的
delta spec 僅新增一條「備份內回合或歷史含平局時仍通過驗證」Scenario 作為**回歸保護**
（regression guard，寫入當下即綠），驗證 Decision 3 的擴增確實透過 `RoundSchema`／
`MatchHistoryEntrySchema` 的 import 鏈傳導到 `BackupSchema`。

**Rationale**：`transfer-types.ts` 現有註解已明文「巢狀 schema 全部 import 自既有模組，
不重新宣告任何欄位——重新宣告等於製造第二個真相來源」。`BackupSchema.currentRound` 直接是
`RoundSchema.nullable()`、`BackupSchema.history` 直接是 `z.array(MatchHistoryEntrySchema)`，
Decision 3 的兩處擴增因此是 `BackupSchema` 值域的**子集擴增**的自動結果，不需要在
`backup.ts` 另寫任何平局專屬邏輯。這正是 M8 設計本檔時的既有目標達成的效果——本 change
不需要驗證「匯入時要不要特別處理 draw」，因為根本沒有特別處理的分支可寫。

**Alternatives considered**：
- **在 `backup.ts` 額外寫一段「匯入時偵測 draw 並記錄警告」的邏輯**：否決——沒有任何 spec
  或 `prd.md` 條文要求匯入平局紀錄要有額外提示，這會是無來源的 scope creep。

### Decision 6：UI 層（`CourtCard.tsx`／`ScoreEntry.tsx`）不感知 `round.timer`，維持現有「原樣往上傳」的分層

**Choice**：`ScoreEntry.tsx`／`CourtCard.tsx` 完全不新增任何與 `timer` 或 `isTimedRound`
相關的 props 或邏輯；「兩隊比分相同是否可送出」100% 交給 `round.ts` 的
`validateScoreInput` 判斷，UI 只負責把 `submitError` 原樣顯示。

**Rationale**：`ScoreEntry.tsx` 現有註解已明文「比分驗證規則……歸屬回合 capability 的送出
pipeline，本元件 SHALL NOT 複製一份」，這條分層原則在本 change 前就已確立。`CourtCard.tsx`
的 `onSubmitScore` 只轉發 `(matchId, rawScoreA, rawScoreB)` 三個值，`round: Round` 雖然是
`CourtCardProps` 的既有欄位，但只用於 `buildMatchSlotSeed`（計分板入口），**不需要**因為
本 change 新增一條「把 `round.timer` 也傳給 `onSubmitScore`」的路徑——`useRoundStore.ts`
的 `submitScore(matchId, rawScoreA, rawScoreB)` 內部本來就持有 `state.round`（見 Context
第三點），往下傳給 `submitScorePure` 時原樣帶著整個 `round`，`isTimedRound` 的推導點
自然落在 `round.ts` 的 `submitScore` 內部，不需要任何一層 UI 元件知道這件事的存在。

**Alternatives considered**：
- **`CourtCard.tsx` 讀 `round.timer` 後把 `isTimedRound` 當 prop 傳給
  `ScoreEntry`，由 `ScoreEntry` 決定是否允許等值送出**：否決——這會在 UI 層重新實作一次
  「比分相同時能不能送」的判斷，正是 `ScoreEntry.tsx` 既有註解明文禁止的重複。且會讓
  「這場能不能平局」這個規則有兩個地方要保持同步（UI 的 disabled 邏輯與 `round.ts` 的
  `validateScoreInput`），任一處漏改就會出現「UI 允許送出但 pipeline 拒絕」或反過來的不一致。

### Decision 7：新增 `labels.ts` 具名常數 `DRAW_LABEL`，四個既有消費點改用同一份文案

**Choice**：`nextjs-pickball/lib/matchmaker/labels.ts` 新增：

```ts
/** 平手的顯示文案，計時回合平局時使用（見 matchmaker-timed-draw）。 */
export const DRAW_LABEL = "平手";
```

`history-csv.ts`（勝方欄）、`export-scene.ts`（`buildStatusText`）、`CourtCard.tsx`
（平手標籤）、`HistoryRecordCard.tsx`（平手標籤）四處皆改用此常數，SHALL NOT 各自寫死
「平手」字面量。

**Rationale**：`labels.ts` 檔頭註解已明文「對戰文案常數的單一來源」，且是 2026-09-03（M9
Final Review F-5 收斂後）才剛統一的檔案——本 change 若在四個消費點各自寫死「平手」，等於
在剛收斂完的檔案旁邊立刻製造第六份、第七份重複文案，與該檔存在的理由直接衝突。

**Alternatives considered**：
- **併入既有 `TEAM_LABELS_BY_KEY`，把它的型別放寬為
  `Record<"teamA" | "teamB" | "draw", string>`**：曾考慮，但 `TEAM_LABELS_BY_KEY` 現有的
  消費語意是「輸入一個**隊伍** key，取得該隊的顯示名稱」（`teamA` → 「第一隊」），
  `"draw"` 不是一支隊伍，把它塞進同一個查表物件會讓型別的意圖變得混淆（呼叫端看到
  `TEAM_LABELS_BY_KEY["draw"]` 時無法直觀判斷這是「第三支隊伍叫平手」還是「平手是特殊值」）。
  獨立常數更清楚地表達「平手不是一支隊伍」這個事實，否決合併方案。

## Risks / Trade-offs

- **[Round 的整份損壞降級語意，讓平局比賽在版本回退時的資料損失範圍大於歷史]** →
  `round-lifecycle` 既有「回合與歷史的持久化與損壞降級」Requirement（本 change 不修改）
  規定：`Round` 是單一物件，**任何一處欄位不合法就整份清除**；`History` 是逐筆降級，只丟棄
  不合法的那一筆。這代表若使用者在含一場平局的計時回合進行中，因某種原因（例如錯誤的部署
  回退）改跑到一個**早於本 change**的舊版本，該版本的 `RoundMatchSchema.winner` 列舉只有
  `"teamA"`／`"teamB"` 兩值，讀到 `winner: "draw"` 的那一場會讓 `RoundSchema.safeParse`
  整體失敗——**不只是那一場，是整個目前回合（含其他還沒平局的場次）都會被清除**，而非
  歷史那種「只丟一筆」。歷史紀錄則只丟失那一筆平局紀錄，其餘場次的歷史不受影響。
  → **Mitigation**：接受此風險。理由：① 這是 `Round` 單一物件降級語意的既有代價（本 change
  之前，任何一個新欄位不合法都會有同樣後果，並非本 change 獨有），修改該語意超出本 change
  範圍且會動到未列入 Modified 的 Requirement；② 「回退到比本 change 更舊的版本」屬於部署
  異常而非正常升級路徑，正常的單向部署（先 M15 上線）不會遇到；③ 已完成的平局場次即使回合
  整份被清除，仍有機會透過歷史紀錄追溯（除非該筆歷史剛好也在同一次讀取中被降級丟棄）。
  Migration Plan 一節要求對此**實測**而非只憑推論。

- **[`export-scene.ts` 的 `TEAM_LABELS_BY_KEY[match.winner]` 在 `winner` 擴為三值後型別不再
  相容]** → 這是**預期內、刻意保留**的編譯期訊號：Decision 3 擴增 `winner` 列舉後，
  `buildStatusText` 若不新增 `winner === "draw"` 分支就直接查表，`tsc --noEmit` MUST 因
  `Record<"teamA"|"teamB", string>` 缺少 `"draw"` 索引簽章而報錯，逼實作者在型別層面就處理
  這個分支，而非讓它在執行期悄悄印出 `undefined`。不視為風險，是設計刻意利用的安全網。

- **[平局的 `S = 0.5` 使兩隊觸界標示 `atUpperBound`／`atLowerBound` 的語意組合是全新的]** →
  過去「該員賽後分數等於邊界」只會發生在「勝方被夾在上限」或「敗方被夾在下限」，
  `applyDelta` 的邏輯本身不需要知道 s 是 1、0 還是 0.5——它只需要一個數字算出
  `theoreticalAfter`，clamp 與旗標判定完全不變。因此觸界邊界情境（例如平局但某方賽前已在
  `8.00`）在計算上與既有 win/lose 路徑走同一段程式碼，不需要新增分支。**Mitigation**：
  test-plan 為此仍新增專屬 Scenario（「平局時勢均力敵雙方變動皆為零」「平局時實力不同雙方
  變動方向相反」）驗證這個「不需要改動也仍然正確」的推論，而非只憑代碼審閱信任它。

- **[「計時回合可以平局」的判定依賴 M14 尚未存在的欄位，本文件對其形狀的假設可能與 M14 實際
  交付不符]** → 見 Open Questions 第 1 條；已在 proposal.md、tasks.md §1 明訂 apply 階段
  的強制重新核對步驟，此處不重複。

- **[計分板路徑天然排除平局，但沒有任何測試「證明」這件事，只是結構推論]** → `scoreboard`
  的 `isGameWon` 要求 win-by-2、`collectFinishedSubmissions` 只送 `finished` 的槽，兩者
  組合起來確實不可能產生相同比分。**Mitigation**：不在 `scoreboard` 或
  `scoreboard-binding.ts` 新增任何測試——這是「明確不做」範圍內的判斷；但 design 在此明文
  記錄這條推論鏈的依據（`openspec/specs/scoreboard/spec.md` 的「計分規則 — Traditional
  Side-Out」Requirement 與 `lib/matchmaker/scoreboard-binding.ts` 的
  `isEligibleForBackfill`），供日後 `scoreboard` 若改變計分規則時可回頭檢查本假設是否
  仍然成立。

## Migration Plan

本 change 不涉及資料庫或後端遷移（matchmaker 為 LocalStorage-only 純前端功能），但涉及
**schema 值域擴增對舊版讀取端的相容性**，因此仍需一份對稱的前向／回退檢查：

- **前向相容（新版寫、舊版讀）**：不適用於一般升級路徑——本產品部署走「先合併、後手動部署」
  （root `CLAUDE.md` 的部署順序），不存在「新版資料被舊版讀到」的正常情境，唯一觸發方式是
  部署回退。已於 Risks 一節記錄「Round 整份清除」的資料損失範圍，MUST 於 apply 收尾驗證中
  **實測**：手動建立一個含 `winner: "draw"` 的 `matchmaker:round:v1`，以**不含本 change**
  的 build（即 `git stash` 本 change 的程式碼變更或切到合併前的 commit）啟動前端，確認
  `readRound()` 回傳「無目前回合」而非拋出例外或顯示壞資料；對 `matchmaker:history:v1`
  同樣手動建立一筆 `winner: "draw"` 的紀錄，確認舊版只丟棄那一筆（`droppedCount` 增加 1），
  其餘紀錄照常顯示。
- **回退相容（本 change 上線後，使用者的瀏覽器本機資料本來就只由目前版本寫入與讀取）**：
  一般情況下不存在「同一使用者的資料同時被新舊版本讀寫」的情境（LocalStorage 綁定單一
  瀏覽器，且部署後所有請求打到同一個 Worker 版本），此節只為對稱記錄，非本 change 需要
  另外實作的行為。
- **舊備份的匯入相容**：`data-transfer` 的「JSON 匯入的結構驗證與整份原子性」新增的
  「備份內回合或歷史含平局時仍通過驗證」Scenario 已涵蓋「新備份格式可被新版讀取」；
  「舊備份（`winner` 僅兩值）仍可正常匯入」屬既有 Scenario（「合法備份通過驗證」）的
  既有覆蓋範圍，`winner` 列舉擴增（新增選項）不影響既有子集的合法性，不需要新增測試，
  但 apply 收尾驗證 MUST 以一份 M8 時期產生的真實備份檔（若有保留）或手工建構的
  「`winner` 僅含 `"teamA"`／`"teamB"`」備份物件實測一次，確認確實原樣通過。

## Open Questions

1. **`round.timer` 的實際欄位名稱、型別與 null 語意，待 M14 合併後才能確認**——本文件全篇
   以 `round.timer !== null` 表示「本輪為計時制」，這是**設計假設**，來源是本 change 簡報
   對 M14 的轉述，非本 session 於 `main` 上 grep 驗證所得（`main @ 3fa2d22` 尚無 M14）。
   **補充**：本 session 撰寫期間額外發現 `openspec/changes/matchmaker-round-timer/`
   （M14）已由另一平行 session 產出 proposal／design／specs（propose 階段尚未完成，
   無 tasks／execution-plan／environment，更未 apply 或合併），其 proposal.md 記載
   `Round.timer` 為 `{ durationMinutes: 10 | 15 | 20; startedAt: string | null } | null`，
   與本文件假設逐字相符，可作為**佐證**但不構成**驗證**——該姐妹 change 自身仍可能在其
   Stage 1／Stage 2 審查或後續人類裁決中變更欄位名稱或型別。**apply §0 仍 MUST 以合併後
   的 `main` 重新對齊本 change 引用 M14 之處**，SHALL NOT 以讀過這份未合併 proposal 為由
   省略下列步驟：
   - 確認 M14 交付的判定條件是否確實名為 `round.timer` 且以 `!== null` 表示「計時制」
     （若 M14 改用其他欄位名稱、或用布林值而非 nullable 物件表示，本 change 的
     `round-lifecycle`／`match-stage` 兩份 MODIFIED delta spec 中所有寫死 `round.timer`
     字樣之處 MUST 同步改名，SHALL NOT 依本文件的假設欄位名稱開工）。
   - 確認 M14 是否已對 `round-lifecycle` 的「回合資料模型」Requirement 做過 MODIFIED
     （新增 `timer` 欄位的表格列）——若已修改，本 change 的「回合資料模型」MODIFIED 區塊
     MUST 以 M14 合併後的版本為基礎重新複製、再疊加本 change 的 `winner` 欄位擴增，
     SHALL NOT 以本文件寫作時（M14 尚未存在）的舊版本文字為準，否則會在 archive 時
     覆寫掉 M14 已合併的 `timer` 欄位描述。
   - 若 M14 交付的計時語意比「整輪二元開關」更複雜（例如「已過期」與「進行中」是不同狀態），
     MUST 停下並回報人類決定「計時制平局」該對應哪一種狀態，SHALL NOT 自行擴大解讀。

2. **「平手」文案是否需要在 JPG／列印稿以外的方式強調（例如額外的顏色或圖示）**——本 change
   選擇與既有「勝」標籤同等視覺權重的純文字標籤（design Decision 5、7），未額外設計特殊
   配色。若使用者回饋「平手」在密集畫面中不夠醒目，屬後續 UI 微調，非本 change 阻塞項。

3. **M14 若在 `RoundMatch` 或 `Round` 上引入了本 change 未預期的欄位（例如逐場獨立計時），
   是否需要重新評估「計時回合」的判定粒度是整輪還是逐場**——本 change 的 proposal 明確假設
   「整輪」（`round.timer`），若 M14 實際交付逐場計時，需回到「明確不做」一節重新確認
   「不做每場獨立計時」的排除是否仍然成立，或本 change 的判定條件需改為逐場檢查。
   **傾向解決（未合併前不視為定案）**：M14 proposal.md 的「明確不做」一節明文「本輪所有
   場地共用同一個倒數，不提供逐場地各自的計時器」，與本文件假設一致；apply §0 仍 MUST
   以合併後的 `main` 確認此假設在 M14 實際 apply 完成後未被 Stage 1／Stage 2 審查推翻。
