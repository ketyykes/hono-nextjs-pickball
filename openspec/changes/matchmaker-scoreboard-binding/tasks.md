# Tasks — matchmaker-scoreboard-binding

> **所有指令從 repo root 執行，cwd 必須在 environment.md 宣告的 worktree 內。**
> 前端單檔測試：`pnpm --filter ./nextjs-pickball test --run <workspace 相對路徑>`
> —— **`--run` 前不可加 `--`**，否則 vitest 收不到路徑會跑完整套，紅燈證據會被既有綠燈淹沒。
>
> **TDD 三步**：① 新增失敗測試並在 shell **實際看到紅燈**（貼出輸出）② 最小實作至綠
> ③ refactor（無壞味道可註記 skipped）。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 verify 無法機械核對。
>
> **關於本 change 的紅燈**：`lib/scoreboard/match-slots.ts` 與 `lib/matchmaker/scoreboard-binding.ts`
> 為全新檔案，第一個測試的紅燈形式為 **import 失敗（模組不存在）**，之後才是斷言失敗，兩者皆為真紅燈。
> `types.ts`／`reducer.ts`／`storage.ts`／`useScoreboardStore.ts` 是既有檔案，新增欄位與參數後
> 相關測試會因「欄位不存在／參數被忽略」而紅——同樣是真紅燈。
> **若某項測試寫下當下即綠，那是既有實作已滿足**：MUST 在該項下如實標註「regression guard」，
> 並補 mutation 驗證（把實作改壞看紅、還原看綠）證明斷言有偵測力。
> **不得**以「改斷言看紅再改回」偽造紅燈（root `CLAUDE.md`「紅燈要是真的」）。

## 0. 上游契約對齊（前置調查，不寫任何程式碼）

> 本節產出的是**填進後續 task 的實際識別字**，不新增、不修改任何檔案，因此無 RED／GREEN 配對。
> 若任一項與 design.md 的假設不符，MUST 停止並依 execution-plan.md 的 Escalation 回報人類，
> SHALL NOT 由本段替 M4／M5 補上缺少的欄位或函式。

- [x] 0.1 讀 M4 產出的回合模組，記下：回合型別名稱、`targetScore` 欄位名、對戰清單欄位名、單場的 id 欄位名、場地編號欄位名、兩隊欄位名、完成狀態欄位名、LocalStorage key（應為 `matchmaker:round:v1`）
- [x] 0.2 讀 M4 的**送出比分 pipeline** 入口：函式名、簽章、是否為純函式（回傳新回合與歷史）或直接持久化。若不可在單元層呼叫，MUST 把 test-plan 中「回填與手動輸入的送出結果逐欄相同」的 Tier 由 `unit` 調整為 `integration` 並在此註記（design.md Open Question 4）
- [x] 0.3 讀 M4 的「重設／重排本輪」與「重置名單」流程入口，確認可在其尾端追加清槽步驟；一併讀 `nextjs-pickball/lib/matchmaker/storage.ts` 的**列舉 key 清單** `RESET_KEYS`（M4 版本應為三個 key）與同檔的 `resetMatchmakerData()`，確認清單可由外部模組 import 常數併入
- [x] 0.4 讀 M5 產出的對戰頁：路由路徑與其常數名、場地色塊元件路徑、手動輸入送出的既有入口、目標分數控制項所在元件**及其既有單元測試檔**（應為 `components/matchmaker/RoundControls.test.tsx`），記下既有的鎖定判斷寫在何處（M5 為「目前回合是否存在」）與 `setTargetScore` 的實際簽章
- [x] 0.5 讀 `node_modules/next/dist/docs/` 中 `searchParams` 的段落，確認 Next.js 16 於 server component 的實際簽章（是否為 Promise、是否需 `await`）——依 `nextjs-pickball/AGENTS.md`，**不得**依訓練資料的記憶書寫（design Decision 3）
- [x] 0.6 把 0.1～0.5 的實際識別字回填到本檔 §3～§8 的括號佔位處

### §0 對齊結果（2026-08-24 實測，路徑皆相對於 repo root）

**0.1 回合模組**（`nextjs-pickball/lib/matchmaker/round-types.ts`）

| 語意 | 實際識別字 |
|---|---|
| 回合型別／schema | `Round` ／ `RoundSchema` |
| 該輪目標分數 | `round.targetScore`，型別 `RoundTargetScore`（`11 \| 15 \| 21`）；另有 `TARGET_SCORE_OPTIONS`、`DEFAULT_TARGET_SCORE` |
| 該輪對戰方式 | `round.format`（`"singles" \| "doubles"`）；單場亦有 `match.format` |
| 對戰清單 | `round.matches`（`RoundMatch[]`） |
| 單場 id | `match.id` |
| 場地編號 | `match.courtNumber` |
| 兩隊 | `match.teams`（tuple `[RoundTeam, RoundTeam]`，各含 `playerIds`／`rating`）；**第一隊為 `teams[0]`** |
| 完成狀態 | `match.status`（`"pending" \| "scoring" \| "completed"`）；另有 `match.scores`（`{ teamA, teamB } \| null`）、`match.winner`（`"teamA" \| "teamB" \| null`）、`match.completedAt` |
| 雙打組成 | `match.doublesComposition`（optional） |
| LocalStorage key | `ROUND_STORAGE_KEY = "matchmaker:round:v1"`（`lib/matchmaker/storage-keys.ts`）✅ 與假設相符 |

**0.2 送出比分 pipeline**：`submitScore(input: SubmitScoreInput): SubmitScoreResult`，位於
`nextjs-pickball/lib/matchmaker/round.ts` 第 825 行，**純函式、不持久化**（與 design Open Question 4 的已結案一致，
故 test-plan 的「回填與手動輸入的送出結果逐欄相同」**維持 `unit` tier**，不需調整）。
`SubmitScoreInput = { round, players, matchId, rawScoreA, rawScoreB, now }`——`rawScoreA`／`rawScoreB` 為**字串**、`now` 為 ISO 字串（時間由呼叫端注入）。
`SubmitScoreSuccess = { ok: true, round, historyEntry, playerPatches, boundaryHits }`。
Hook 層既有包裝為 `useRoundStore().submitScore(matchId, rawScoreA, rawScoreB)`（`hooks/useRoundStore.ts`）。

**0.3 重設本輪／重置名單**：
- 重排本輪純函式 `resetIncompleteMatches(round, players, { newMatchId })`（`round.ts` 第 441 行）；hook 層為 `useRoundStore().resetIncompleteMatches()`（無參數），成功時 `dispatch({ type: "RESET_INCOMPLETE_MATCHES" })`。清槽步驟可在 hook 的 `result.ok` 分支尾端追加。
- 列舉 key 清單為 `RESET_KEYS`，位於 `nextjs-pickball/lib/matchmaker/storage.ts` **第 111 行**（module-private const，非 export），目前為 `[ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY]` 三個，皆 import 自 `storage-keys.ts`；`resetMatchmakerData()` 為同檔第 117 行。✅ 可直接 import `MATCH_SLOTS_KEY` 併入。

**0.4 M5 對戰頁**：
- 路由字面值 `/matchmaker`。**落差**：M5 只有 module-private 的 `MATCHMAKER_SECTION_HREFS`（`lib/matchmaker/section-nav.ts` 第 13 行），**沒有可 import 的路由常數**。處置：於 `section-nav.ts` 補具名匯出 `MATCHMAKER_ROUTE = "/matchmaker"` 並讓 `MATCHMAKER_SECTION_HREFS` 由它組成（比照 `match-stage` delta 對 `TARGET_SCORE_OPTIONS` 的同一原則：「若該 capability 沒有可用的具名匯出，MUST 於其模組補一個再由本 capability 取用」），SHALL NOT 在本段寫死字串。詳見 design.md Open Questions 5。
- 場地色塊元件：`nextjs-pickball/components/matchmaker/CourtCard.tsx`（props：`match`／`players`／`onSubmitScore`／`submitError`）。
- 手動輸入送出既有入口鏈：`components/matchmaker/ScoreEntry.tsx` → `CourtCard.onSubmitScore` → `MatchStage.onSubmitScore` → `app/matchmaker/page.tsx` 的 `handleSubmitScore` → `useRoundStore().submitScore`。
- 目標分數控制項：`nextjs-pickball/components/matchmaker/RoundControls.tsx`；既有單元測試 `nextjs-pickball/components/matchmaker/RoundControls.test.tsx` ✅。既有鎖定判斷在 `RoundControls.tsx` **第 54 行** `const locked = round !== null;`，鎖定說明文案為「本輪已鎖定，換分制請先產生下一輪。」（第 168～170 行）。
- `setTargetScore(round: Round, targetScore: RoundTargetScore): SetTargetScoreResult`（`round.ts` 第 352 行），成功 `{ ok: true, round }`、失敗 `{ ok: false, code: "scoring-started", message }`。✅ 確認為**懸空純函式**：`UseRoundStoreResult` 只有 `round`／`history`／`droppedCount`／`generateRound`／`resetIncompleteMatches`／`submitScore`，無任何套用新回合的對外入口（§8.6 必須先補）。

**0.5 Next.js 16 的 `searchParams`**（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`）：
型別為 `Promise<{ [key: string]: string | string[] | undefined }>`，**MUST 以 `async/await`（或 React `use()`）取值**，同步存取已於 15 起棄用。
文件另載明「`searchParams` is a Request-time API … Using it will opt the page into dynamic rendering at request time」——與 design Risks 第 1 條的預期一致。
本段採 server component `async` + `await searchParams` 並以 prop 注入（design Decision 3）。

## 1. 分槽儲存（`lib/scoreboard/match-slots.ts`）

- [x] 1.1 RED: 新增 `nextjs-pickball/lib/scoreboard/match-slots.test.ts`，寫 it「寫入某場次的槽不影響其他場次與獨立槽」——預置 `m1`（8-5、15 分制）與 `m2`，更新 `m2` 後斷言 `m1` 的分數／history／`targetScore` 完全不變，且 `localStorage.getItem("scoreboard:current:v1")` 為 `null`。跑單檔確認紅燈（模組不存在）並貼出輸出
- [x] 1.2 GREEN: 建立 `nextjs-pickball/lib/scoreboard/match-slots.ts`：匯出 `MATCH_SLOTS_KEY = "scoreboard:matches:v1"`、以 `ScoreboardStateSchema` 組成的 map schema，以及單筆讀寫函式。沿用 `storage.ts` 既有的 `hasLocalStorage()` 守門與 try/catch + `console.warn` 形態
- [x] 1.3 RED: 補 it「單筆損壞只丟該筆並回報 droppedCount，其餘場次保留」——`{ m1: 缺必要欄位, m2: 合法 }` → 回傳只含 `m2`、`droppedCount === 1`、`console.warn` 被呼叫。確認紅燈
- [x] 1.4 GREEN: 實作逐筆降級：整份能解析為物件時逐筆 `safeParse`，只丟不合法的條目（比照 `player-roster` 的「LocalStorage 持久化與逐筆降級」，design Decision 4）
- [x] 1.5 RED: 補 it「整份非 JSON 時清除分槽 key 且不動獨立槽」——分槽 key 內容為 `"{{{"` → 該 key 被移除、回傳空集合、`scoreboard:current:v1` 仍在。確認紅燈
- [x] 1.6 GREEN: 實作整份損壞的清除路徑，且**只**移除分槽 key
- [x] 1.7 RED: 補 it「批次清除只移除指定場次且忽略不存在的 id」——`{m1,m2,m3}` 以 `["m1","m3","nope"]` 清除 → 只剩 `m2`，不拋錯。確認紅燈
- [x] 1.8 GREEN: 實作批次清除與「清空全部條目」兩個函式（`clearAllMatchSlots()` 已於 §1.6 提前實作，因整份損壞清除路徑需要它；本項補上 `clearMatchSlots()` 批次清除）
- [x] 1.9 REFACTOR: skipped——`MATCH_SLOTS_KEY` 與 `console.warn` 前綴 `"[scoreboard]"` 皆各只有一處定義；`hasLocalStorage()` 與 storage.ts 重複但無法共用（storage.ts 未匯出該函式，且本組不得修改 storage.ts），為既有架構限制而非壞味道。**Stage 2 追加**：整份 map schema `MatchSlotsSchema` 已判為 dead export 並移除（commit `a783873`），收斂由 Stage 2 完成而非本項

## 2. 綁定欄位與 reducer 鎖定（`lib/scoreboard/types.ts`、`reducer.ts`）

- [x] 2.1 RED: 於 `nextjs-pickball/lib/scoreboard/storage.test.ts` 補 it「舊版資料缺 matchId 時補為 null 且不清除 key」——寫入不含 `matchId` 的合法舊資料 → `readScoreboard()` 回傳的 `matchId === null`、key 未被移除、分數與 history 完整。確認紅燈
- [x] 2.2 GREEN: `types.ts` 的 `ScoreboardStateSchema` 新增 `matchId: z.string().nullable().default(null)`，並把 `matchId` 併入 `MatchSettings`。**SHALL NOT** bump storage key（既有 spec 的向後相容策略）
- [x] 2.3 RED: 於 `nextjs-pickball/lib/scoreboard/reducer.test.ts` 補 it「綁定場次時 setup 階段 ignore SET_TARGET_SCORE」——`matchId: "m1"`、`targetScore: 15`、`status: "setup"` 下 dispatch `SET_TARGET_SCORE(11)` → state 全等於變更前。確認紅燈
- [x] 2.4 GREEN: `SET_TARGET_SCORE` 於 `state.matchId !== null` 時直接回傳原 state（與既有 `status !== "setup"` 的 guard 併排，不另開分支結構）
- [x] 2.5 RED: 於 `reducer.test.ts` 補 it「UNDO 與 RESET 後保留 matchId，不退回 null」；同時於既有三個 it（「setup 階段可切換 mode…」「setup 階段可切換 firstServer」「setup 階段可切換 targetScore 且保留 mode 與 firstServer」）補上 `matchId` 不變的斷言（**it 名稱不得更動**——它們是 spec 驗收錨點）。確認紅燈
- [x] 2.6 GREEN: `createInitialState` 與 `settingsOf` 帶入 `matchId`，使 UNDO 的 replay 與 RESET 皆保留（design Decision 6）
- [x] 2.7 REFACTOR: 確認 `matchId` 的保留只透過 `MatchSettings` 一條路徑，沒有任何 case 分支自行複製欄位（無壞味道則註記 skipped）
  - **Stage 2 的偵測力補強**（Code-Quality Reviewer 獨立 mutation，35 組／12 存活 → 3 存活）：
    ① 4.1 的測試資料改為 `round.format: "doubles"` 搭配 `match.format: "singles"`（刻意相異），
    並補整體斷言 `expect(seed).toEqual(createInitialState({ mode, targetScore, matchId }))`——原本
    `mode` 誤取 `match.format`、以及覆寫 `firstServer`／`servingTeam`／`serverNumber`／`history`
    等未列欄位時皆不會轉紅；② 4.3 補 `expect(result).toEqual(existing)`——原本只斷言三欄，
    竄改 `mode`／`matchId`／`status`／`firstServer` 不會轉紅；③ 新增 it
    「SSR（無 window）時 ensureMatchSlot 不寫入也不 throw，仍回傳 seed」——`readMatchSlot`／
    `writeMatchSlot` 各自的 SSR 降級已在 §1 測過，但兩者組合後的行為在本模組零覆蓋；
    ④ 實作端移除 `existing as ScoreboardState & { matchId: string }` 型別斷言，改為
    `{ ...existing, matchId: seed.matchId }`（斷言會讓槽內 `matchId` 為 null 的舊資料靜默通過），
    並移除 `createInitialState` overrides 內冗餘的 `matchId`（外層 spread 已覆寫，兩處寫同一件事）。
    以上皆為偵測力／型別強化，不新增生產行為分支，三個驗收錨點 it 名稱未變。
  - **skipped（無壞味道）**：`matchId` 只在 `reducer.ts` 的 `settingsOf()` 與 `createInitialState()` 兩處集中處理，`SET_MODE`／`SET_FIRST_SERVER`／`SET_TARGET_SCORE`／`UNDO`／`RESET` 五個 case 皆經 `createInitialState(settingsOf(state))` 重建，`RALLY_WON` 走 `...afterRally` 全量展開，無任何 case 分支自行複製該欄位。經 Stage 2（opus）獨立核實成立。

## 3. storage 分派與 hook 綁定（`lib/scoreboard/storage.ts`、`hooks/useScoreboardStore.ts`）
Depends on: §1、§2

- [x] 3.1 RED: 於 `nextjs-pickball/hooks/useScoreboardStore.test.tsx` 補 it「未帶 matchId 時沿用獨立槽且不觸碰分槽 key」——預置 `scoreboard:current:v1` 的合法進度，不帶 `matchId` render → state 為該進度、`matchId === null`、綁定狀態為 `standalone`，且分槽 key 全程未被讀寫。確認紅燈（實測：`expected undefined to be 'standalone'`，見 commit 5385f10）
- [x] 3.2 GREEN: `storage.ts` 的 `readScoreboard(matchId)`／`writeScoreboard(state)`／`clearScoreboard(matchId)` 擴充為依 `matchId` 分派（**寫入槽位一律由 `state.matchId` 推導**，不接受槽位參數）；`useScoreboardStore(matchId)` 接受參數並回傳三元組 `[state, dispatch, bindingStatus]`（commit 9c821a8）
- [x] 3.3 RED→regression guard: 補 it「帶 matchId 時 hydrate 自對應槽且只寫回該槽」——寫下當下即為綠燈，因 3.2 的實作已一併涵蓋 bound 路徑（單一 hook 內三種綁定狀態耦合，拆開會產生無意義的半成品）。已以 mutation 測試驗證偵測力：讓 bound 路徑改讀獨立槽 → 轉紅；讓 writeScoreboard 序列化抹掉 matchId → 轉紅（見下方 3.7 mutation 清單）
- [x] 3.4 GREEN: 綁定路徑的 hydrate 與寫回已隨 3.2 完成，無需額外實作
- [x] 3.5 RED→regression guard: 補 it「matchId 無對應槽時回報 missing 且不建立新條目」——同上，寫下當下即為綠燈。已以 mutation 測試驗證：拿掉 missing 時的 write guard → 轉紅；讓 missing 誤回報為 bound/standalone → 轉紅
- [x] 3.6 GREEN: `missing` 狀態的 write guard 已隨 3.2 完成，無需額外實作
- [x] 3.7 REFACTOR: 效果驗證與收斂如下（commit de382f2）：
  - effect 順序（write 在前、read 在後、`hasHydratedRef` 守門、cleanup reset ref）與 Strict Mode 處理**原封不動**，未重排、未改用 `useSyncExternalStore`、未搬進 lazy initializer
  - `matchId` 依賴陣列刻意維持 `[]`（單一頁面生命週期內不會變動），已於程式碼加註解說明
  - **8-A 必做**：新增 `lib/scoreboard/storage-keys.ts` 收斂 `hasLocalStorage()`／`STORAGE_KEY`／`MATCH_SLOTS_KEY`，`storage.ts` 與 `match-slots.ts` 改為單向依賴，避免 storage.ts import match-slots.ts（分派入口）造成循環匯入；既有匯入點以 re-export 保留，兩份「存取 localStorage 即拋例外」測試均保留
  - **8-B 必做**：`writeMatchSlot(matchId, state)` 收斂為 `writeMatchSlot(state: ScoreboardState & { matchId: string })`，槽位一律由 `state.matchId` 推導；同步更新 `match-slots.test.ts` 呼叫點，it 名稱與斷言語意不變
  - **8-C 落盤斷言**：3.3 的 it 已補 `slots.m1.matchId` 欄位層級斷言，並以 mutation（序列化抹掉 matchId）驗證會轉紅
  - **8-D 空字串邊界**：`storage.ts` 的 `isStandaloneMatchId()` 與 `useScoreboardStore` 的 matchId 正規化皆已在 3.2 完成；另補充 it「matchId 為空字串時視為獨立計分板」（`storage.test.ts`，非 test-plan 逐字條目）補上 mutation 缺口
  - 額外修正：`bindingStatus` 改用 `useReducer`（identity reducer）取代 `useState`，避開 ESLint `react-hooks/set-state-in-effect` 對 effect 內同步呼叫 `useState` setter 的限制（`useReducer` dispatch 不受此規則限制，與既有 HYDRATE dispatch 寫法一致）

### §3 Stage 2（Code-Quality Reviewer）獨立 mutation 結果

Implementer 自述做了 8 次 mutation／1 次存活。Stage 2 **未採信、獨立重做 35 組**（涵蓋反向 mutation
與逐分支零覆蓋盤點），實測 **10 組存活**，其中 1 組事後判定為等價 mutant。已補測封住的 7 組：

| 存活 mutation | 缺口 | 處置 |
|---|---|---|
| `clearScoreboard()` 綁定分支整段刪除（改去 `removeItem` 獨立槽） | 該分支**零測試覆蓋**，且失效形式正是「清除範圍過寬」 | 新增 it「clearScoreboard 帶 matchId 時只清該場次分槽，不動獨立槽與其他場次」 |
| `readMatchSlot` 忽略 `matchId`、回傳 map 第一筆 | 既有 it 只斷言 `m1`，而 `m1` 恰為第一筆 | 既有 it「寫入某場次的槽不影響其他場次與獨立槽」**加斷言**（it 名稱不變） |
| hook 邊界拿掉空字串正規化 | `storage.ts` 那層的正規化只保證寫對槽，`bindingStatus` 仍會誤判為 bound／missing | 新增 it「matchId 為空字串時沿用獨立槽並回報 standalone」 |
| read effect cleanup 的 `hasHydratedRef = false` 改成 `true` | 既有測試全在非 Strict Mode 下 render，design Context 指名要守的競態**零覆蓋** | 新增 it「React Strict Mode 二次 mount 不以初始 state 覆蓋既有進度」 |
| `writeMatchSlot` 誤加 `status === "finished"` 早退 guard（反向 mutation） | 「綁定模式打到 finished」的 hook + storage 端到端路徑零覆蓋（§5 待送出清單的上游前提） | 新增 it「綁定模式下打到結束並 UNDO 後仍只寫回該槽」 |
| reducer UNDO replay 掉 `matchId` | §2 只在 reducer 層有防線，hook 層無第二道（Decision 6 的洞在端到端層仍開著） | 同上一個 it（現由 hook 與 reducer 兩層各自擋下） |
| `storage-keys.ts` 內任一 key 字面值改 v1 → v2 | 所有測試都改用匯出常數，**沒有任何一處釘住字面字串**；key 是持久化契約 | 新增 it「兩個 LocalStorage key 名稱由 storage-keys 單一來源匯出」（比照 `lib/matchmaker/round-storage.test.ts` 既有先例） |

判為**等價 mutant、不補測**：`isStandaloneMatchId` 改寫成 `!matchId`——JS 中 `string | null`
只有 `""` 與 `null` 為 falsy（`"0"` 是 truthy），語意完全相同。

**仍存活、刻意不補測並升級給 leader 的 2 組**（見 Stage 2 回報）：
- `bindingStatus` 初始值三元改為恆 `"standalone"`：可測（首次 render 值），但保守初值 `missing`
  意味著**每一次進入合法綁定場次都會先畫一幀「場次已失效」**（`useEffect` 在 paint 之後才跑，
  SSR 輸出亦然）。這是 §7 的呈現決策，現在把初值釘死反而會擋住 §7 可能需要的第四種
  「hydrating」狀態，故不補測，交由 §7 處理。
- read effect 依賴陣列 `[]` 改為 `[matchId]`：等價於「同一頁面生命週期內 matchId 不變」這個
  假設**沒有任何測試佐證**。ESLint 亦以 `react-hooks/exhaustive-deps` 警告（全 repo 唯一一處）。
  §7 的「改用獨立計分板」出口若採 soft navigation，元件不會重新 mount，hook 會永遠停在
  `missing`：計分不落盤、失效畫面不消失。詳見 Stage 2 回報的處置建議。

## 4. 計分板入口的純函式層（`lib/matchmaker/scoreboard-binding.ts`）
Depends on: §1

- [x] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，寫 it「seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手」——15 分制雙打回合 + 未開打場次 → seed 的 `targetScore === 15`、`mode === "doubles"`、`matchId` 為該場 id、分數 0-0、`status === "setup"`。確認紅燈（模組不存在）
- [x] 4.2 GREEN: 實作 `buildMatchSlotSeed(round, match)`：以 `createInitialState` 為基底帶入該輪的 `round.targetScore`、對戰方式（`round.format`，值域與 scoreboard 的 `Mode` 同為 `"singles" | "doubles"`）與 `matchId`（`match.id`），`firstServer` 取預設值
- [x] 4.3 RED: 補 it「已有進度的場次再次進入時保留既有進度不覆蓋」——槽已有 8-5／`playing` → 再次呼叫後分數、history 與 `targetScore` 完全不變。確認紅燈
- [x] 4.4 GREEN: 實作 `ensureMatchSlot`：已有條目則原樣回傳、不寫入
  - **Stage 2 簽章收斂**：實作時為 `ensureMatchSlot(matchId, seed)`（本條原文），Stage 2 的 mutation 實測顯示
    把 `readMatchSlot(matchId)` 改成 `readMatchSlot(seed.matchId)`、以及加上「`seed.matchId !== matchId` 即拋錯」
    的反向 guard **都不會轉紅**——代表兩個參數是同一件事的兩個真實來源、且不一致情境零覆蓋。
    這與 §3 把 `writeMatchSlot(matchId, state)` 收斂為單參數的論證同構，故收斂為
    `ensureMatchSlot(seed)`，槽位由 `seed.matchId` 推導。行為不變、無生產端呼叫者。
- [x] 4.5 RED: 補 it「第一隊對應 us、第二隊對應 them，來回轉換不顛倒」——`{first: 11, second: 7}` → `{us: 11, them: 7}` → 轉回後仍為 `{first: 11, second: 7}`。確認紅燈
- [x] 4.6 GREEN: 實作**單一**的隊伍對應函式（入口與回填共用），SHALL NOT 在兩處各寫一次
- [x] 4.7 REFACTOR: 確認本模組只相依 `lib/scoreboard/match-slots.ts` 與回合型別，**不被** `lib/scoreboard/` 反向 import（design Decision 2 的單向相依）（無壞味道則註記 skipped）
  - **Stage 2 前的自測補強（非 test-plan 逐字條目）**：交件前 mutation 自測發現兩個缺口——`ensureMatchSlot` 的**寫入分支零覆蓋**（既有兩個 it 都只走「已有條目」路徑），以及把 `mode: round.format` 硬編碼為 `"doubles"` 時**仍全綠**（無測試檢查 singles 情境）。因此補 it「尚無條目時 ensureMatchSlot 寫入 seed 並回傳 seed」（`scoreboard-binding.test.ts`），以 singles／21 分制的回合斷言 `seed.mode` 與 `seed.targetScore`，兩個 mutation 補測後皆轉紅。此 it 屬**偵測力補強**、不新增任何生產程式碼分支，不影響三個驗收錨點的 it 名稱與斷言。
  - **Stage 2 的偵測力補強**（Code-Quality Reviewer 獨立 mutation，35 組／12 存活 → 3 存活）：
    ① 4.1 的測試資料改為 `round.format: "doubles"` 搭配 `match.format: "singles"`（刻意相異），
    並補整體斷言 `expect(seed).toEqual(createInitialState({ mode, targetScore, matchId }))`——原本
    `mode` 誤取 `match.format`、以及覆寫 `firstServer`／`servingTeam`／`serverNumber`／`history`
    等未列欄位時皆不會轉紅；② 4.3 補 `expect(result).toEqual(existing)`——原本只斷言三欄，
    竄改 `mode`／`matchId`／`status`／`firstServer` 不會轉紅；③ 新增 it
    「SSR（無 window）時 ensureMatchSlot 不寫入也不 throw，仍回傳 seed」——`readMatchSlot`／
    `writeMatchSlot` 各自的 SSR 降級已在 §1 測過，但兩者組合後的行為在本模組零覆蓋；
    ④ 實作端移除 `existing as ScoreboardState & { matchId: string }` 型別斷言，改為
    `{ ...existing, matchId: seed.matchId }`（斷言會讓槽內 `matchId` 為 null 的舊資料靜默通過），
    並移除 `createInitialState` overrides 內冗餘的 `matchId`（外層 spread 已覆寫，兩處寫同一件事）。
    以上皆為偵測力／型別強化，不新增生產行為分支，三個驗收錨點 it 名稱未變。
  - **skipped（無壞味道）**：機械驗證——`grep -rn "scoreboard-binding" nextjs-pickball/lib/scoreboard/` 無結果（`lib/scoreboard/` 底下沒有任何一行 import 本模組）；`grep -n "^import" nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 顯示僅 import `../scoreboard/reducer`、`../scoreboard/match-slots`、`../scoreboard/types`（型別）與本 workspace 的 `./round-types`（型別），相依方向與 design Decision 2 一致，單向、無需重構。

## 5. 回填清單與目標分數鎖定判定（`lib/matchmaker/scoreboard-binding.ts`）
Depends on: §4

- [x] 5.1 RED: 補 it「只有 finished 的槽才進入待送出清單」——`m1: finished`／`m2: playing`／`m3: 無槽` → 清單只含 `m1`。確認紅燈
- [x] 5.2 GREEN: 實作 `collectFinishedSubmissions(round, slots)`：回傳待送出清單（含 `matchId` 與轉換後的兩隊比分）
- [x] 5.3 RED: 補 it「已完成的場次不重複送出且連續呼叫為冪等」——`m1` 槽為 `finished` 且回合中已完成 → 清單為空；連續呼叫兩次皆為空。確認紅燈
- [x] 5.4 GREEN: 加入「該場尚未完成」條件（冪等的第二道防線，design Decision 5）
- [x] 5.5 RED: 補 it「槽對應的場次已不在回合中時略過且不拋錯」——槽有 `gone` 的 `finished` 條目、回合不含 `gone` → 清單不含 `gone`。確認紅燈
- [x] 5.6 GREEN: 加入「場次仍在回合中」條件
- [x] 5.7 RED: 補 it「回填與手動輸入的送出結果逐欄相同」——同一回合同一場、比分 11-7，兩條路徑各跑一次 → 回合物件與歷史紀錄逐欄相同（比分、勝方、賽前分數、賽後分數、對戰方式、雙打組成標示），僅完成時間可相異。確認紅燈（§0.2 已確認 `submitScore` 為純函式，**Tier 維持 `unit`**）。真紅燈：`TypeError: toSubmitScoreInput is not a function`（commit `3223d79`）
- [x] 5.8 GREEN: 讓回填呼叫 §0.2 找到的**同一個**送出入口 `submitScore(input: SubmitScoreInput)`（`lib/matchmaker/round.ts`），SHALL NOT 另寫平行寫入路徑。新增橋接 `toSubmitScoreInput`（commit `f53343b`）
- [x] 5.9 RED: 補四個 it：「無任何場次完成且無計分板槽時目標分數未鎖定」、「任一場次的計分板槽非 setup 時目標分數鎖定」、「槽存在但仍為 setup 時不視為已開始計分」、「已有場次完成時目標分數鎖定，不論比分來源」。確認紅燈（`TypeError: isTargetScoreLocked is not a function`，commit `c3fee9a`）
- [x] 5.10 GREEN: 實作鎖定判定純函式，輸出布林值與繁體中文的鎖定原因字串（`isTargetScoreLocked`，commit `6729507`）
- [x] 5.11 REFACTOR: `collectFinishedSubmissions` 的三個過濾條件抽為具名 predicate `isEligibleForBackfill`（`match is RoundMatch` 收斂型別）。鎖定判定的兩個條件已各自具名變數（`anyMatchFinished`／`anySlotStarted`），隊伍對應已由 `mapTeamScores` 單一實作，未發現其餘重複邏輯，故該部分 skipped（commit `d25082e`）

### §5 Stage 2（Code-Quality Reviewer）獨立 mutation 結果

Implementer 自述做了 10 次 mutation／0 存活。Stage 2 **未採信、獨立重做 40 組**（含反向 mutation：
把 guard 誤加到不該加的地方），**存活 15 組**（其中 M25／M26 兩組因字串取代命中前一個同形條件，
實為 M07／M08 的重複，去重後為 13 組有效存活）。

**已由 Stage 2 補測封住（12 組）**——新增 7 個 it（皆為偵測力補強，不動生產程式碼、
不改 §4 的 5 個與 §5 的 8 個驗收錨點 it 名稱）：

- 「多個符合條件的槽一次全數回傳且維持走訪順序」→ 封住「迴圈提早 break」「回傳前重新排序」
  「只回傳第一筆」三組（既有 it 的預期結果都只有 0 或 1 筆，無從分辨）
- 「待送出清單的 matchId 取自槽的鍵而非槽內容」→ 封住「改用 `slot.matchId`」
- 「槽為 0-0 卻已 finished 仍列入，slots 為空時回傳空清單」→ 封住「誤加平手排除的第四條件」，
  並補上 `slots` 為空物件（迴圈零次）的零覆蓋路徑
- 「場次為 scoring 尚未完成時仍列入待送出清單」→ 封住「條件三收緊為 `!== "pending"`」
- 「toSubmitScoreInput 的六個欄位分別取自 submission 與 context」→ 封住「matchId 改取
  `round.matches[0].id`」，並直接釘住六個輸出欄位（原本只透過 `submitScore` 的結果間接觀察）
- 「鎖定判定掃描全部場次與全部槽而非只看第一筆」→ 封住「只看第一場」「只看第一個槽」
  「第二條改為 `=== "playing"`／`=== "finished"`」四組
- 「槽已不在回合中但非 setup 時仍判定為鎖定」→ 封住「誤加『槽須在回合中』的一致性檢查」，
  同時把 `isTargetScoreLocked` 對孤兒槽 fail-closed 的取捨明文釘住

**等價 mutation（非缺口，不補測）**：`String(x)` → `String(Number(x))`——`x` 型別已是 `number`，
兩者輸出恆等。

**仍存活、刻意不補測並升級給 leader 的 1 組**：`isTargetScoreLocked` 第一條由
`match.status === "completed"` 改為 `!== "pending"` 仍全綠。這正是 spec「相反方向 SHALL NOT
出現」所指的差集（`scoring` 態時 `setTargetScore` 會拒絕、本判定卻回報未鎖定）。機械驗證確認
目前 `round.ts` 只寫入 `pending`／`completed`（第 109、895 行），故現況不會發生，
但缺一道 guard。補測需改變行為，不在 Stage 2 授權範圍。

### M36：isTargetScoreLocked 與 setTargetScore 方向對齊（Stage 2 升級後補強）

上一節「仍存活、刻意不補測並升級給 leader 的 1 組」經 leader 核可後，以 TDD 三步完成行為對齊，
不再只是升級擱置。

- **裁決**：`isTargetScoreLocked` 第一條由 `match.status === "completed"` 改為 `!== "pending"`，
  與 `setTargetScore`（`lib/matchmaker/round.ts`）的拒絕條件方向對齊，封住 spec 明文禁止的
  「該入口拒絕但本判定未鎖」相反方向（差集精確等於 `status === "scoring"`）。
- 新增 it「場次為 scoring 時目標分數鎖定」**不在 test-plan 中**，屬 Stage 2 升級後的偵測力＋
  行為補強，非原始驗收錨點。
- 紅燈為真（實際輸出）：`AssertionError: expected false to be true // Object.is equality` （斷言
  `expect(result.locked).toBe(true)` 於改動前失敗）。
- 兩個 commit：
  - `0179249` `test(matchmaker): 補場次為 scoring 時目標分數鎖定的紅燈`
  - `3c4cdc0` `feat(matchmaker): 對齊 isTargetScoreLocked 與 setTargetScore 的拒絕方向`

## 6. 清除範圍（`lib/matchmaker/scoreboard-binding.ts` 與 M4 的回合流程）
Depends on: §1、§5

- [x] 6.1 RED: 補 it「重設本輪只清除未完成場次的槽且不動獨立槽」——`m1` 已完成、`m2` 未完成有槽 → 重設後 `m2` 條目被移除、`m1` 的比分／評分／歷史不變、`scoreboard:current:v1` 未被觸碰。確認紅燈（真紅：`clearDiscardedMatchSlots is not a function`）。commit 見下
- [x] 6.2 GREEN: 在 §0.3 找到的「重設／重排本輪」流程（`hooks/useRoundStore.ts` 的 `resetIncompleteMatches()`，內部委派 `round.ts` 的 `resetIncompleteMatches(round, players, { newMatchId })`）尾端追加清槽；清除範圍**僅限**被重排掉的未完成場次。實作為 `scoreboard-binding.ts` 新增具名純函式 `clearDiscardedMatchSlots(previousRound, nextRound)`（以兩份回合比對出消失的 matchId，委派 `clearMatchSlots`），`useRoundStore.ts` 只負責在 `result.ok` 時接線呼叫；另補 hook 層把關測試（TDD 規範要求、不在 test-plan 內）
- [x] 6.3 RED: 於 `nextjs-pickball/lib/matchmaker/storage.test.ts` **更新 M4 既有的 it**「重置只移除列舉的 key，不影響 scoreboard 資料」——改名為「重置只移除列舉的四個 key，不影響獨立計分板資料」，並把斷言擴為：預置 `matchmaker:roster:v1`／`matchmaker:round:v1`／`matchmaker:history:v1`／`scoreboard:matches:v1` 與 `scoreboard:current:v1`，呼叫 `resetMatchmakerData()` 後前四者皆被移除、`scoreboard:current:v1` 仍在（`player-roster` delta 的「重置只清除列舉範圍內的 key」Scenario）。確認紅燈（第四個 key 尚未在清單中）並貼出輸出。真紅：`localStorage.getItem(MATCH_SLOTS_KEY)` 收到內容而非 `null`
- [x] 6.4 GREEN: `nextjs-pickball/lib/matchmaker/storage.ts` 的列舉清單 `RESET_KEYS`（`resetMatchmakerData()` 亦在同檔）加入分槽 key，字面值 **import 自** §1.2 的 `MATCH_SLOTS_KEY`（`lib/scoreboard/match-slots.ts`），SHALL NOT 在 matchmaker 側再寫一次字串
- [x] 6.5 RED: 於 `scoreboard-binding.test.ts` 補 it「重置名單清除全部場次槽但保留獨立槽」——預置多場條目 → 走重置名單流程 → 分槽 key 的全部條目被清除、`scoreboard:current:v1` 未被觸碰。**若因 6.4 已使整個分槽 key 被移除而寫下當下即綠**，如實標註為 regression guard 並補 mutation 驗證（把分槽 key 自清單移除看紅、還原看綠）；**SHALL NOT 為了製造紅燈而在重置流程尾端另寫一次清空呼叫**——`resetMatchmakerData()` 的清除範圍只能有一個定義處（`player-roster` delta 的「四個 key 的名稱 MUST 取自同一個來源模組」）。**寫下當下即綠**（如實標註為 regression guard）：已補 mutation 驗證，把 `RESET_KEYS` 的 `MATCH_SLOTS_KEY` 移除後此 it 真紅（`readMatchSlot("m1")` 收到槽內容而非 `null`），還原後回綠
- [ ] 6.6 REFACTOR: 確認所有「銷毀場次」的路徑都經過同一個清槽函式，沒有任何路徑漏清（design Decision 2 的不變式維持端）；確認「重設本輪」（逐場清）與「重置名單」（整份清）兩條路徑的**清除範圍各自只有一處定義**（無壞味道則註記 skipped）

## 7. 計分板 UI 接線（例外層 — 入口與純呈現元件，以 E2E 驗收）
Depends on: §3

> 依 `nextjs-pickball/CLAUDE.md` 的 TDD 適用範圍：`app/**/page.tsx` 為**入口例外層**、
> 純呈現型元件**不強制單元 TDD**，兩者以 Playwright E2E 驗收。
> 行為邏輯已於 §1～§6 下放到 `lib/` 與 `hooks/` 並各自 TDD，本節不再於元件內放任何判斷邏輯。

- [ ] 7.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，寫兩個 test：「場次失效時顯示繁中說明與兩個出口且不顯示技術錯誤碼」、「失效畫面可切換為獨立計分板並恢復計分」。每個 test 前清空 `scoreboard:matches:v1` 與 `scoreboard:current:v1`。跑 `pnpm --filter ./nextjs-pickball test:e2e --grep "scoreboard-binding"` 確認紅燈並貼出輸出
- [ ] 7.2 GREEN: `app/scoreboard/page.tsx` 讀 `searchParams` 的 `match` 並以 prop 傳入（簽章依 §0.5：頁面改為 `async`，prop 型別 `searchParams: Promise<{ [key: string]: string | string[] | undefined }>`，MUST `await` 後取 `match`；值可能是 `string[]`，需收斂為單一 `string | null`）；`Scoreboard.tsx` 接受 `matchId` prop 並傳給 `useScoreboardStore`；新增 `components/scoreboard/MatchBindingNotice.tsx` 呈現失效說明與「回到對戰頁」「改用獨立計分板」兩個出口。文案為繁體中文且說明可採取的修正方式
- [ ] 7.3 RED: 補兩個 test：「綁定模式設定列以唯讀文字顯示目標分數且無比賽形式下拉」、「綁定模式顯示場地標示且返回對戰可回到對戰頁」。確認紅燈
- [ ] 7.4 GREEN: `ScoreboardSetup.tsx` 加入綁定模式分支——顯示場地標示與「本輪 N 分制」唯讀文字、不渲染比賽形式下拉與目標分數 radiogroup、加入「返回對戰」按鈕（路由常數取自 §0.4 補上的 `MATCHMAKER_ROUTE`，`lib/matchmaker/section-nav.ts`）。獨立模式的既有渲染**逐字不變**（design Decision 8）
- [ ] 7.5 RED: 補 test「綁定模式多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」——四個 viewport（390x844、844x390、768x1024、1024x600）下斷言 `scrollHeight <= clientHeight + 1` 且四顆核心按鈕 boundingBox 完整落在 viewport 內。確認紅燈
- [ ] 7.6 GREEN: 依量測結果調整綁定模式設定列的高度預算。**若 7.5 寫下當下即綠**，如實標註為 regression guard 並補 mutation 驗證（例如暫時把場地標示改為兩行看是否變紅），SHALL NOT 改斷言偽造紅燈
- [ ] 7.7 REFACTOR: 確認綁定模式與獨立模式共用同一個設定列容器與間距係數，沒有為綁定模式另起一套樣式；`MatchBindingNotice` 不含任何判斷邏輯（無壞味道則註記 skipped）

## 8. 對戰頁 UI 接線（例外層 — 純呈現元件，以 E2E 驗收；§8.5～§8.6 為 M5 既有單元測試的更新與其實作）（**例外**：§8.4、§8.6 需改 `hooks/useRoundStore.ts`，該部分屬行為邏輯，MUST 走 TDD 三步，不適用本節的例外層豁免）
Depends on: §4、§5、§6、§7

- [ ] 8.1 RED: 於 `scoreboard-binding.spec.ts` 補三個 test：「計分中的場次顯示計分中標示與當前比分」、「未完成的計分進度可離開後再進入接續」、「多場地同時計分時各場進度互不覆蓋」。前置以真實路徑鋪設（建立參賽者 → 產生本輪對戰）；耗時不可接受時才改用 `page.addInitScript` 直接寫入 `matchmaker:round:v1`，並於檔頭註明 schema 複製來源（design Risks）。確認紅燈
- [ ] 8.2 GREEN: M5 的場地色塊元件加入「進入計分板／繼續計分」入口（點擊時先 `ensureMatchSlot` 再導向 `/scoreboard?match=<matchId>`，順序不可對調）與「計分中」文字標示＋當前比分
- [ ] 8.3 RED: 補兩個 test：「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」、「已完成場次不顯示進入計分板入口」。確認紅燈
- [ ] 8.4 GREEN: 對戰頁在回合資料就緒後執行 reconcile（以「回合已 hydrate」為觸發條件，不用獨立的 mount effect，見 design Risks），把 `collectFinishedSubmissions` 的結果逐筆送進 §0.2 的送出入口（`useRoundStore().submitScore(matchId, rawScoreA, rawScoreB)`，比分需轉為字串）並清槽；已完成場次不渲染入口
- [ ] 8.5 RED: **更新 M5 既有的 `nextjs-pickball/components/matchmaker/RoundControls.test.tsx`**（`match-stage` delta 的 MODIFIED「目標分數選擇器」）：
      ① 把既有 it「目前回合存在時目標分數選擇器 disabled 並顯示已鎖定說明」的名稱改為「本輪已開始計分時目標分數選擇器 disabled 並顯示鎖定原因」，前置改為「回合的目標分數為 15 且該輪已開始計分（任一計分板槽 `status !== "setup"`，或任一場次已完成）」，斷言維持三顆選項 `disabled`、`aria-checked="true"` 者為 15，並改為斷言畫面顯示鎖定判定回傳的原因字串；
      ② 新增 it「回合存在但尚未開始計分時目標分數選擇器 enabled 且變更委派 setTargetScore」——回合存在、所有場次 `pending`、無任何槽離開 `setup` → 三顆選項 enabled、選取 21 後 `setTargetScore` 被以 `21` 呼叫一次、畫面不顯示鎖定說明；
      ③ 既有 it「目標分數選項為 11／15／21 且預設選中 11」**名稱與斷言不動**（仍為 spec 驗收錨點）。
      跑單檔確認紅燈（M5 現行實作為「有回合就鎖」，②必紅）並貼出輸出
- [ ] 8.6 GREEN: 目標分數選擇器的鎖定與否改為委派 §5.10 的判定純函式（SHALL NOT 在元件內以「目前回合是否存在」判斷）並顯示其回傳的繁體中文鎖定原因；未鎖定時的變更委派 §0.4 記下的 `setTargetScore(round: Round, targetScore: RoundTargetScore): SetTargetScoreResult`（`lib/matchmaker/round.ts` 第 352 行），SHALL NOT 於 UI 層直接改寫回合物件。**注意 `setTargetScore` 目前是懸空的純函式**——`lib/matchmaker/round.ts` 有定義，但 M5 未接上任何非測試呼叫端，`hooks/useRoundStore.ts` 的 `UseRoundStoreResult` 只有 `round`／`history`／`droppedCount`／`generateRound`／`resetIncompleteMatches`／`submitScore`，**沒有套用新回合的入口**。因此本步 MUST 先於 `hooks/useRoundStore.ts` 新增 `setTargetScore(targetScore)` 動作（比照 `resetIncompleteMatches` 的「呼叫純函式 → 判 `ok` → dispatch」形態，**屬行為邏輯、必 TDD**），再由 `app/matchmaker/page.tsx` 以 prop 傳給 `RoundControls`
- [ ] 8.7 RED: 補兩個 e2e test：「本輪開始計分後目標分數控制項停用並說明原因」、「手動輸入比分的路徑仍可獨立完成一場」。確認紅燈；**兩者若寫下當下即綠**（前者已由 8.6 實作、後者為 M5 既有行為未被破壞），如實標註為 regression guard 並補 mutation 驗證，**不得為了製造紅燈而先破壞它們**
- [ ] 8.8 GREEN: 依 8.7 的量測補齊對戰頁的鎖定說明呈現（若 8.7 已綠則標註 skipped，不寫任何多餘程式碼）
- [ ] 8.9 REFACTOR: 確認場地色塊與目標分數選擇器都沒有把「該不該顯示入口」「是否計分中」「是否鎖定」的判斷寫在元件內，而是取用 §4／§5 的純函式輸出（無壞味道則註記 skipped）

## 9. 收尾驗證（對應 root `README.md` 部署前手動檢查清單）

- [ ] 9.1 以腳本逐條核對**四份** delta spec（`scoreboard`／`match-stage`／`round-lifecycle`／`player-roster`）的每個「驗收」錨點：檔案存在、it／test 名稱**逐字**相符（不靠目視）。特別確認兩個**改名**的既有測試已改到位：`RoundControls.test.tsx` 的「本輪已開始計分時目標分數選擇器 disabled 並顯示鎖定原因」（§8.5）與 `lib/matchmaker/storage.test.ts` 的「重置只移除列舉的四個 key，不影響獨立計分板資料」（§6.3），且**舊名稱已不存在**於測試檔中。不符即修測試名稱，**不改 spec**
- [ ] 9.2 spec 條目重複檢查：依 root `CLAUDE.md` 指定的 python 計數法逐標題計數，**不使用** BSD `uniq`（macOS 的 `uniq` 會把內容不同的中文標題誤判為重複）
- [ ] 9.3 `pnpm lint` — 0 errors（既有 warning 清單須與變更前一致，不得新增）
- [ ] 9.4 `pnpm typecheck` — 通過
- [ ] 9.5 `pnpm test` 全套 — 前後端皆綠。既有 `scoreboard` 測試須**全數原樣**通過；`player-roster` 除 §6.3 改名並擴充斷言的那一個 it 外無迴歸；M5 的 `match-stage` 測試除 §8.5 更新的那一個 it 與新增的一個 it 外無迴歸（**這三處是本 change 唯一容許變動的既有測試**，其餘既有測試若轉紅一律視為迴歸）
- [ ] 9.6 `pnpm test:e2e` 全套 — 五個 browser project 全綠。既有 `scoreboard.spec.ts` 必須**原樣**通過（證明獨立用法零行為變更）
- [ ] 9.7 `pnpm --filter ./nextjs-pickball preview` — workerd runtime 下開啟 `/scoreboard` 與 `/scoreboard?match=<id>` 皆正常，無 console error
- [ ] 9.8 Rollback 相容性實測（design Migration Plan 要求，不得只憑推論）：以本次變更**前**的 `ScoreboardStateSchema` 解析一份含 `matchId` 欄位的資料，確認 zod 剝除未知欄位而非拒絕；結果如實記錄於此，若為拒絕則 MUST 更新 design.md 的 Rollback 段並提出補救
- [ ] 9.9 `DO_NOT_TRACK=1 openspec validate matchmaker-scoreboard-binding --strict` — 0 error
