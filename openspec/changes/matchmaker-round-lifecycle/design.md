## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- `lib/matchmaker/` 目前為**扁平佈局**（`types.ts`、`roster.ts`、`colors.ts`、`storage.ts`、`allocation-types.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts`、`allocation.ts`、`rating-math.ts`，各自鄰近一份 `*.test.ts`）。本 change 沿用，不新增子目錄。
- M2 交付的 `allocateRound(input)` 為純函式，輸入 `{ players, format, courtCount, seenSignatures }`、輸出 `{ matches, resting }`。`Match` 內嵌**完整的 `Player` 物件**（`Team.players: readonly Player[]`），因為它是 in-memory 的函式回傳值而非持久化紀錄。本 change 必須把它投影成可序列化的回合物件。
- M2 的 `SignatureIndex` 三個欄位是 `ReadonlySet<string>`，且 `allocation-types.ts` 的註解已明文寫著「持久化時另以字串陣列表示，由第 3 段在讀取 LocalStorage 時轉換為 Set、寫回前轉換回陣列」——那個「第 3 段」就是本 change。
- M2 的 `allocateRound` 對場地數不合法會**拋出**（`assertValidCourtCount`）；人數不足則自然回傳空 `matches`，不拋錯。本 change 是唯一的呼叫端，必須把這兩種行為統一成同一種可判讀的失敗結果。
- `lib/matchmaker/storage.ts` 的 `RESET_KEYS` 註解已預留「加入 rounds 對應的 key／加入 history 對應的 key」；`hasLocalStorage()` 目前是該檔的私有函式。
- `hooks/useRosterStore.ts` 已建立本專案的 store 慣例：`useReducer` + 兩個 `useEffect`（write effect 在前、read/hydrate effect 在後、以 `hasHydratedRef` 守門），且把「本次是否跳過持久化」折進 reducer state 而非 ref（避免 React automatic batching 造成的靜默資料遺失）。本 change 的 `useRoundStore` 沿用同一套結構。
- `hooks/hooksInventory.test.ts` 會讀 `openspec/specs/pickleball-guide-page/spec.md` 雙向比對 hooks 歸屬清單。**新增任何 `hooks/use*.ts(x)` 都會讓它轉紅**，直到主 spec 的清單同步為止（見 Decision 9）。
- 專案 `tsconfig.json` 開 `strict` 與 `verbatimModuleSyntax`，型別匯入須用 `import type`；vitest 的 `globals` 只在執行期成立，測試檔必須顯式 `import { describe, it, expect } from "vitest"`。

## Goals / Non-Goals

**Goals:**

- 把 `prd.md` 6.1、6.2、6.3.2、6.5 的每一條狀態轉換做成**可被單元測試逐條驗證的純函式**，讓 M5 接 UI 時拿到的是已經被證明過的狀態機，而不是「畫面看起來對」。
- 為 5.3 尾段的「本輪結束後休息次數 +1」給出**唯一且不會重複累加**的操作性定義。這是整個公平分配承諾的最後一塊——`restCount` 若不會前進，M2 的「休息次數多者優先」就永遠對著一組不變的 0。
- 讓回合、歷史與名單三份持久化資料在任何失敗路徑下都**不會出現部分更新**。
- 一次定案 M5／M6／M7／M8 都要消費的兩份 schema（Round 與 MatchHistoryEntry），避免後續 milestone 各自擴充而產生破壞性遷移。

**Non-Goals:**

- 不做任何 UI。本 change 完成後 `/matchmaker` 底下仍然只有 `players` 一個路由。
- 不做 undo／redo。`prd.md` 沒有要求回合層級的復原，計分板自己的 Undo 屬 scoreboard capability。
- 不做多回合並存或回合歷史瀏覽。「目前回合」永遠只有一個；過去的回合以歷史紀錄的形式存在，這是 `prd.md` 6.1 與 8.2 的既有分工。
- 不做效能最佳化。8～40 人、每輪至多 8 場，所有操作都是一次線性掃描。
- 不重算既有歷史（`prd.md` 6.4.7）。

## Decisions

### Decision 1：「本輪結束」＝產生新一輪的那一刻

`prd.md` 5.3 只寫「其餘人員進入休息名單並於**本輪結束後**休息次數 +1」，沒有定義「本輪結束」。三個候選：

| 方案 | 定義 | 判定 |
|---|---|---|
| **A（採用）** | 產生新一輪時，先結算上一輪的休息名單，再取代目前回合 | 採用 |
| B | 本輪**所有場次都完成**時結算 | 否決 |
| C | 產生本輪時**立即**對本輪休息名單 +1 | 否決 |

**否決 B 的理由是致命的**：現場活動不會把每一場都送出比分——有人臨時離場、時間到直接換下一輪、主持人忘了填。只要有一場停在 `pending`，「所有場次都完成」就永遠不成立，`restCount` 永遠不前進，於是 M2 的候選排序看到的是一組恆為初始值的休息次數，出場人選退化成「依 rating 排序的固定前 N 名」——這正是 `prd.md` 5.1 註解裡描述的死鎖，只是換了個成因。

**否決 C 的理由有二**：其一，`prd.md` 7.4 要求休息名單顯示「目前累計休息次數」，C 會讓使用者在本輪還在進行時就看到已經 +1 的數字，那個數字宣稱的事情（他休息了這一輪）此刻還沒發生。其二也更關鍵——C 與「重排未完成場次」相衝：重排會改變休息名單成員（Decision 5），已經加過的那一次必須被撤銷，於是需要一套「哪些人已因本輪被加過」的補償紀錄，複雜度遠高於 A。

A 的代價是**最後一輪的休息次數永遠不會被計入**（活動結束後不再產生新一輪）。這無害：`restCount` 的唯一用途是下一輪的排序，而沒有下一輪。

**恰好一次的保證**來自「結算與取代是同一次狀態轉換」：`createRound()` 是純函式，一次回傳 `{ round, restSettlements }`；`useRoundStore` 在同一個 reducer action 內套用兩者。不採用「在回合物件上放一個 `restSettled` 旗標再分兩步做」——旗標式的兩步做法在中途失敗時會留下「已加過但回合沒換」的狀態，而那個狀態從外觀上與「還沒加過」無法區分。

### Decision 2：重複比對基準只取上一輪，不累積全部歷史

`prd.md` 6.1 寫「若已有上一輪，**上一輪**的所有已完成與進行中組合都納入重複比對基準」，5.6 列舉需記錄的項目也止於「本輪已完成及進行中的場次，以及重設前的原始對戰組合」。因此基準的作用範圍是**兩輪之間**，不是整場活動。

替代方案是把每一輪的簽章都 append 進一個累積索引。否決理由有三：① 12 人打 6 輪之後，兩兩組合幾乎已被窮盡，`countRepeats` 對任何配對都回傳「重複」，`avoidRepeats` 的所有候選都無法讓重複數下降，迴避退化為 no-op——付出全部搜尋成本、得到零效果；② 該索引會無界成長並被寫進 LocalStorage，逼近配額；③ 它會讓「重複」這個詞的意思從「上一輪剛打過」漂移成「今天打過」，而後者根本不是使用者感受得到的問題（同一批人一晚上打 8 輪，本來就會再遇到）。

**上一輪 `pending` 的場次不納入基準**：那些對戰從未發生。把沒打過的組合當成已配過，等於用假資料限制新一輪的配對空間。

### Decision 3：回合存 id 快照、歷史存姓名快照——兩者刻意相反

| | 保存什麼 | 為什麼 |
|---|---|---|
| Round（`matchmaker:round:v1`） | 只存 `playerIds` 與該輪的 rating 快照 | 回合與名單**同時活著**。內嵌整個 `Player` 會在使用者於回合進行中改名、改分數、切暫停時產生兩個互相矛盾的真相，而 UI 不知道該信哪個 |
| History（`matchmaker:history:v1`） | 存 `name`、`ratingBefore`、`ratingAfter` 的完整快照 | 歷史必須**比名單活得久**。球員被刪除是本產品明列的功能（`prd.md` 4.1 增刪改），若歷史靠 id 回查姓名，刪一個人就會讓過去所有賽果出現空白，甚至整筆無法顯示 |

同一個專案裡兩種相反的做法看起來不一致，但兩者的**生命週期不同**：回合是「現在」，歷史是「過去」。快照的代價（無法反映後續改名）在歷史正是想要的性質，在回合則是 bug。

`playerRatings` 的 `before` 於**建立回合時**就填入（`prd.md` 6.1 明列「每輪需保存……賽前分數」），而非等到送出比分時才抓——否則使用者在本輪進行中手動改了某人的分數，賽前分數就會變成「改完之後的值」，歷史上那場比賽的分差記錄與當時實際發生的不符。

### Decision 4：目標分數不與 scoreboard 共用 schema，但以測試釘住值域一致

`lib/scoreboard/types.ts` 已有 `TargetScoreSchema`（`11 | 15 | 21`，帶 `.default(11)`）。不直接 import 的理由：

- `.default(11)` 是 scoreboard 為了**既有持久化資料的向後相容**而加的（該檔註解明寫）。回合的 `targetScore` 一律在建立時明確決定，若帶 default，一份 `targetScore` 欄位損壞的回合資料會被靜默補成 11 而非被判為損壞——`prd.md` 6.3.1 說該值決定整輪所有場地的分制，靜默改值是使用者無從察覺的錯誤。
- 既有先例：`allocation-types.ts` 的 `MatchFormat` 與 scoreboard 的 `Mode` 同為 `"singles" | "doubles"`，該檔註解明訂「分屬不同 capability、語意不同，不要合併」。

但**值域必須一致**——M6 會把回合的目標分數交給計分板，兩邊分歧就會出現「回合設 21、計分板跑 11」。因此在 `round-types.test.ts` 加一條斷言，直接比對兩個 schema 的可接受值集合。這條測試把耦合放在測試層而非產品程式碼層：值域漂移會轉紅，但兩個 capability 的執行期程式碼互不 import。

替代方案是把 `TargetScoreSchema` 抽到共用模組。否決理由：那需要決定共用模組屬於哪個 capability，而在 M6 真的把兩者接起來之前，這個歸屬問題沒有正確答案；先抽反而會讓 M6 沒有選擇餘地。

### Decision 5：重排的候選池含休息名單成員，不只在 `pending` 場次內洗牌

`prd.md` 6.2 的原文是「只重新分配**尚未比賽的參賽者**」，不是「重新配對未完成的場次」。兩種讀法的差別在於休息名單成員算不算：

- **採用**：候選池 = `pending` 場次的球員 ∪ 本輪休息名單成員，重新套用 M2 的完整優先序；`completed` 與 `scoring` 場次的球員與其佔用的場地一併排除。
- 否決：只在 `pending` 場次的球員之間重新配對。

否決的理由是**它解決不了使用者按下重排的動機**。主持人按「重排未完成」最常見的情境是：有人臨時離場（切暫停）、有人剛到（新增或恢復出場）、或第一次排出來的組合現場覺得不合適。前兩種情境都需要候選池重算，只在原本那批人之間洗牌完全無效。

採用方案的一個令人安心的性質是：`restCount` 在本輪尚未結算（Decision 1），所以重排時的排序輸入與產生本輪時**完全相同**，結果通常穩定——不會出現「按一下重排就把一堆人無故換下場」的觀感。真正會改變的只有暫停狀態變動的人，而那正是使用者剛剛做的事。

**被丟棄的原始 `pending` 組合必須併入基準**（`prd.md` 5.6 明列「重設前的原始對戰組合」）。少了這一步，重排在輸入完全沒變的情況下會產生一模一樣的結果，使用者按下去看到畫面沒動，會判定功能壞掉。

### Decision 6：送出比分為單一原子純函式，回傳「回合 + 歷史一筆 + 名單 patch」三者

`submitScore()` 是純函式，簽章大致為：

```
submitScore({ round, players, matchId, rawScoreA, rawScoreB, now })
  → { ok: true, round, historyEntry, playerPatches, boundaryHits }
  | { ok: false, code, message }
```

驗證在最前面、任何計算之前；只要回傳 `ok: false`，呼叫端就沒有拿到任何可寫入的東西——**原子性由「失敗時無輸出」保證，而不是由呼叫端記得回滾**。

替代方案是讓 `submitScore` 直接操作 store（更新回合 state、append 歷史、呼叫 `updatePlayer`）。否決理由：那會讓三份資料的更新散在三個 side effect 裡，任何一個丟出例外就留下部分更新，而部分更新的狀態（例如歷史寫了但 rating 沒更新）沒有任何自我修復的路徑——使用者只會看到分數對不上，不會知道發生過什麼。

`playerPatches` 而非直接回傳新的 `Player[]`：本函式不擁有名單，回傳整份名單等於宣稱它有權決定名單的其他部分。patch 形狀（`{ id, rating, gamesPlayed }`）與 `useRosterStore.updatePlayer(id, patch)` 直接對接。

`boundaryHits` 不進回合物件、不持久化：它是**本次送出的一次性訊息**（`prd.md` 6.4.6 要求 UI 標示「已達上限／下限」）。持久化它等於宣稱「這個人現在在邊界上」，而那是可以從 rating 本身讀出來的衍生資訊，存兩份就會有兩份不同步的風險。

### Decision 7：`useRoundStore` 不擁有名單，以 roster port 注入

`useRoundStore` 需要讀 `players`（排序輸入、賽前分數）也需要寫（rating、`gamesPlayed`、`restCount`），但名單的**所有權屬於 `player-roster`**。因此：

```
useRoundStore({ players, updatePlayer })
```

`updatePlayer` 的簽章與 `useRosterStore` 匯出的同名函式**逐字相同**，頁面層（M5）直接把後者的回傳值傳進來即可，不需要 adapter。

替代方案有二，皆否決：① 讓 `useRoundStore` 內部自己呼叫 `useRosterStore()`——會產生第二個名單 reducer 實例，兩個實例各自寫回同一個 LocalStorage key，最後一個寫的贏，是典型的靜默資料遺失；② 引入 React Context 把兩個 store 合併——本專案目前沒有任何 Context provider，為兩個 store 引入一層全域狀態框架，成本與風險都超過它解決的問題。

注入式 port 還有一個測試上的好處：`useRoundStore.test.tsx` 可以傳入一個受控的 `players` 陣列與一個 spy，直接斷言「產生新一輪時 `updatePlayer` 被以哪些 patch 呼叫」，不需要同時掛起兩個 store。

### Decision 8：新增 `storage-keys.ts` 作為三個 key 與 `hasLocalStorage()` 的單一來源

重置範圍是以**列舉 key 清單**實作的（`player-roster` 的既有決策），而 `RESET_KEYS` 位於 `storage.ts`。新增兩個 key 後，若 key 名稱寫在 `round-storage.ts`、清單寫在 `storage.ts`，就會出現 `storage.ts → round-storage.ts` 的匯入；而 `round-storage.ts` 又需要 `storage.ts` 目前私有的 `hasLocalStorage()`——形成循環匯入。

因此新增 `lib/matchmaker/storage-keys.ts`，集中：

- `ROSTER_STORAGE_KEY`、`ROUND_STORAGE_KEY`、`HISTORY_STORAGE_KEY`
- `hasLocalStorage()`

`storage.ts` 保留 `export const STORAGE_KEY = ROSTER_STORAGE_KEY` 作為 re-export，M1 既有的匯入點與 `storage.test.ts` 完全不需改動。

替代方案是直接在 `storage.ts` 的 `RESET_KEYS` 內寫死兩個字串。否決理由：key 名稱會有兩處來源，改名時漏改一處的失敗模式是**沉默的**——重置看起來成功了，殘留的回合要到下一次產生對戰時才以「上一輪納入基準」的形式冒出來，而那時已經很難追溯成因。

### Decision 9：`pickleball-guide-page` 的 hooks 歸屬清單必須在**同一個 commit** 內同步主 spec

這是本 change 唯一觸碰 `openspec/specs/` 主 spec 的地方，需要明確記錄理由與範圍。

`hooks/hooksInventory.test.ts` 讀的是**主 spec**（`openspec/specs/pickleball-guide-page/spec.md`），不是 change 底下的 delta。因此在 worktree 內一旦建立 `hooks/useRoundStore.ts`，該守衛測試立刻轉紅，而唯一能讓它轉綠的動作就是同步主 spec 的那一句清單。「等 archive 再同步」在此不可行——中間所有 task 的 GREEN 都會被這條紅燈汙染，`pnpm test` 再也無法作為「本 task 是否成功」的訊號。

因此本 change 的做法是：

1. `specs/pickleball-guide-page/spec.md` 的 MODIFIED delta 是**權威**，它記錄了完整更新後的 Requirement 全文。
2. 建立 `hooks/useRoundStore.ts` 的那個 GREEN task **必須在同一個 commit 內**把該 delta 的清單那一句套用到主 spec，範圍嚴格限定為新增 `` `useRoundStore` → round-lifecycle `` 這一項，SHALL NOT 順手改動該 Requirement 的任何其他文字。
3. Archive 時 delta 會再套用一次，內容相同，因此是冪等的。

**並行 worktree 的衝突風險**：M5／M7／M8 若也新增 hook，會 MODIFY 同一個 Requirement。若對方先合併回 `main`，本 change 的 delta（寫於對方合併之前）就成了舊全文，直接套用會**把對方新增的 hook 從清單裡刪掉**。緩解方式寫在 apply 的 Step 0：worktree 從 `main` 開出後，MUST 重讀主 spec 的該 Requirement，把本 change 的 delta 全文重新對齊到當時的 `main`（union，只加不刪），再開始跑 task。這條檢查放在 environment.md 的注意事項與 tasks 的第 0 節，不能只寫在這裡。

撰寫本 change 時實地確認過並行的 matchmaker change：目前**只有本 change** 帶 `specs/pickleball-guide-page/` 的 delta。M7（`matchmaker-history-page`）的 design Decision 5 已決定**不新增** `hooks/useMatchHistory`（畫面狀態留在 `HistoryView.tsx`），因此不需要 `pickleball-guide-page` delta；本批七個 change 中只有本 change 動到 `hooks/`（M5 的 Decision 3、M8 的 Decision 6 同樣明文不新增 hook，M6 只擴充既有的 `useScoreboardStore.ts`、不新增檔案，M9 不動 `hooks/`），`hooks/hooksInventory.test.ts` 不會因其他 change 轉紅，衝突風險為零。

即使如此，tasks §0.2 的「重讀 `main` 上的清單並把 delta 對齊為 union（只加不刪）」仍 MUST 執行——它防的是規劃之後才發生的變動，成本只有一次閱讀。

替代方案是把 `useRoundStore` 延後到 M5（UI milestone）一起做。否決理由：持久化是本 change 的核心承諾之一（`prd.md` 9.1「重新整理後還原」），把 store 拆到下一個 milestone 等於本 change 交付一組沒有人接的純函式，`prd.md` 9.1 的驗收在 M4 完成時仍無法成立。

### Decision 10：場次狀態預留 `scoring`，但本 change 不產生它

`prd.md` 6.1 與 5.6 都提到「進行中」的場次，但「進行中」只有在場邊計分接上之後才會真的出現（M6）。兩個選擇：

- **採用**：`MatchStatusSchema` 現在就是三值列舉 `pending | scoring | completed`，本 change 的所有寫入路徑只產生 `pending` 與 `completed`，但所有讀取路徑（未完成判定、基準納入、重排排除、目標分數鎖定）都已正確處理 `scoring`。
- 否決：先做兩值列舉，M6 再擴充。

否決的理由是 M1 已經付過一次學費並留下明確結論：`restCount`／`gamesPlayed` 在 M1 就納入 schema「正是為了避免此處發生破壞性遷移」。狀態列舉一旦擴值，所有已存在使用者瀏覽器裡的 `matchmaker:round:v1` 都要跨版本處理，而本產品沒有後端、沒有遷移視窗，唯一的補救就是清掉使用者進行中的回合。

代價是本 change 有幾條 `scoring` 分支在合併時無法被端到端驗證。緩解方式是這些分支全部有單元測試——測試可以直接構造一個 `status: "scoring"` 的 fixture，不需要 M6 存在。

## Risks / Trade-offs

- **[M3 的評分 API 形狀在本 change 撰寫時尚未合併]** → 本 change 的 **spec 一律以行為描述**（「呼叫評分 API 取得 clamp 後的新 rating 與是否觸界」），不把函式名寫進 spec；函式名只出現在 design 與 tasks，改起來不影響規格。apply 的 Step 0 之後、第一個消費評分的 task 之前，MUST 先讀 `main` 上 M3 交付的模組，把實際簽章補進該 task 的 GREEN 說明。這一步寫在 tasks 的 §0.1。

- **[並行 worktree 對 `pickleball-guide-page` 的 delta 衝突]** → 見 Decision 9 的緩解。這是本 change 最可能在合併時出事的地方，且失敗模式是**測試會轉紅**（守衛測試雙向比對），不會靜默——這一點讓它從「危險」降級為「會被擋下的麻煩」。

- **[Round schema 一旦持久化，日後改型別即是破壞性遷移]** → 這是 M1 `restCount`／M2 `Match` 教訓的第三次延續。因此 `RoundMatch` 一次帶齊 `prd.md` 6.1／6.5／8.2 列舉的全部欄位（含 `scoring` 狀態、`playerRatings` 的 `after`、`doublesComposition`），即使本 change 有些欄位只會寫 `null`。

- **[`submitScore` 的原子性只涵蓋純函式邊界，不涵蓋 LocalStorage 寫入]** → 若 `writeRound()` 成功而 `writeHistory()` 因配額失敗，記憶體是一致的、磁碟是不一致的（回合說完成、歷史少一筆）。**不做兩階段提交**：LocalStorage 沒有交易，任何模擬都只是把不一致換個位置。實際處理是：寫入失敗時 SHALL NOT 拋例外中斷操作（`prd.md` 第 11 節），並讓丟棄／失敗可被回報給 UI。配額在本產品的資料量下（數十人、數百筆歷史）距離 5MB 極遠，這是防禦而非常見路徑。

- **[重排會改變休息名單成員，使用者可能困惑]** → Decision 5 已論證輸入不變時結果穩定。真正會動的只有暫停狀態剛被改過的人。M5 在設計重排按鈕的提示文案時應說明「會重新分配尚未比賽的人」，這一點記在此處供 M5 取用，本 change 不做文案。

- **[「本輪結束」採 A 方案後，最後一輪的休息次數不計入]** → 見 Decision 1。無害且刻意。記錄於此以免日後有人看到「活動結束後 `restCount` 對不上場次數」而誤判為 bug。

- **[`scoring` 分支在本 change 無法端到端驗證]** → 見 Decision 10。以單元測試 fixture 覆蓋；M6 接上後應補一條端到端驗證，該項屬 M6 範圍。

## Migration Plan

無資料遷移。`matchmaker:round:v1` 與 `matchmaker:history:v1` 皆為**全新 key**，既有使用者的瀏覽器中不存在；`matchmaker:roster:v1` 的 schema 完全不變（本 change 只更正規格條文對 `restCount`／`gamesPlayed` 累加歸屬的描述，不動 schema）。

回滾策略：本 change 全部為新增檔案，加上 `storage.ts` 的兩處小改（`RESET_KEYS` 與 `hasLocalStorage` 的來源）與主 spec 的一句清單。revert commit 即可完整回滾；已寫入使用者瀏覽器的兩個新 key 會成為孤兒資料，不影響 M1 的任何行為（`readRoster()` 只讀自己的 key）。

## Open Questions

1. **M3 評分 API 的確切回傳形狀**——依 M3 change（`matchmaker-rating-engine`）當前的 artifact，入口為 `nextjs-pickball/lib/matchmaker/rating.ts` 的 `updateRatings(input)`，回傳 `{ changes, expectedScores }`，其中 `changes` 是**依 `teams` 順序攤平的逐人結果**（含 `before`／`after`／`delta` 與三個邊界旗標），且**輸入不合法時會 `throw`**。本 change 據此設計 `submitScore`：`playerRatings` 直接由 `changes` 對應、`boundaryHits` 由邊界旗標取得、對 `updateRatings` 的呼叫比照 `allocateRound` 包在同一層防禦性 try/catch 內。**M3 尚未合併，上述形狀仍可能變動**，apply 的 §0.1 MUST 以 `main` 上的實際實作為準（見 Risks 第一項）。
2. **`scoring` 狀態的進入與離開時機**——本 change 只預留列舉值。由誰在什麼時候把場次設為 `scoring`、由計分板返回但尚未結束時如何保留進度，皆屬 M6。
3. **回合是否需要自己的 `id`**——目前以「同時只有一個目前回合」為前提，`roundNumber` 已足夠識別。若 M7 日後要讓歷史紀錄回指所屬回合，需要一個穩定的回合 id；屆時新增欄位屬非破壞性變更（歷史紀錄目前保存 `matchId` 而非 `roundNumber`，已足以識別單場）。
4. **重排是否應提供「只換這一場」的更細粒度操作**——`prd.md` 6.2 只描述「重排未完成」這一種粒度，本 change 照做。現場若出現「只想換某一場」的需求，屬新的產品決策，需另立 change。
