# Overview — matchmaker-round-lifecycle（M4）

## Scope

把 M2 的分配引擎與 M3 的評分引擎串成一條**會前進、會被保存、可以被重設**的時間軸：目前回合的資料模型與目標分數、產生本輪、休息次數結算、重設／重排未完成場次、比分驗證與送出後的完成流程，以及回合與歷史的 LocalStorage 持久化。同時把「歷史紀錄長什麼樣、什麼時候寫」定案，供 M7 的歷史頁與 M8 的 CSV 匯出共用。本 change **完全不做 UI**。

**規模判定：large。** 影響 4 個 capability（新增 `round-lifecycle`、`match-history`，修改 `player-roster`、`pickleball-guide-page`），預估 tasks 超過 20 項，且新增兩個 LocalStorage 資料域。

條件式區塊判定：

| 條件 | 判定 | 理由 |
|---|---|---|
| 前端需求 → UI Mockups | **不命中** | 本 change 不新增任何 `app/**` 路由或 `components/**` 元件；所有 requirement 都描述純函式與 store 行為，沒有任何一條談版面、互動或視覺狀態。對戰舞台與控制項屬 M5。 |
| 資料庫結構 → Data Model | **命中** | 新增兩個 LocalStorage 資料域（`matchmaker:round:v1`、`matchmaker:history:v1`）與其完整 schema，且回合對名單有 id 參照關係、歷史刻意不建立參照。 |
| 資料遷移 → Data Migration | **不命中** | 兩個 key 皆為全新，既有瀏覽器中不存在；`matchmaker:roster:v1` 的 schema 一個欄位都沒動。無 backfill、無格式轉換。 |
| 跨元件流程 → Sequence Diagram | **命中** | 「送出比分」是一條順序敏感的多步流程（驗證 → 評分 → 標記完成 → 寫歷史 → 累計出場），跨 store、純函式模組與兩份持久化資料，且有明確的失敗分支；「產生新一輪」的休息結算也必須與回合取代同一次轉換完成。 |

## What Changes

- 新增 `round-lifecycle` capability：回合資料模型、目標分數為每輪設定、產生本輪、休息結算、重設／重排、比分驗證、送出流程、持久化與降級、人數不足邊界，共 9 個 Requirement。
- 新增 `match-history` capability：只含「紀錄欄位 schema」與「完成時寫入一筆」兩個 Requirement；區間篩選與歷史頁屬 M7。
- 修改 `player-roster`：重置範圍納入回合與歷史兩個 key；更正 `restCount`／`gamesPlayed` 累加歸屬的敘述。
- 修改 `pickleball-guide-page`：hooks 歸屬清單新增 `useRoundStore` → `round-lifecycle`。
- 新增 6 個實作檔（`round-types.ts`、`round.ts`、`history.ts`、`round-storage.ts`、`storage-keys.ts`、`hooks/useRoundStore.ts`）與 5 份新測試檔。

下圖是 before / after 的資料流對照。重點在於：M3 之後三個模組彼此不認識，所有結果算完就丟；M4 補上中間那層狀態機，讓結果回流到名單並落地到 LocalStorage。

```
=== Before: M3 完成後 ===

  roster.ts          allocation.ts         rating (M3)
  (localStorage)  -> allocateRound()  ->   updateRatings()
                     pure, stateless       pure, stateless
                          |                     |
                          v                     v
                       discarded            discarded

  no round / no score entry / no history / nothing survives reload


=== After: M4 完成後 ===

  roster.ts <------------------------------------+
  (localStorage)                                 | rating
       |                                         | restCount
       | players                                 | gamesPlayed
       v                                         |
  +----------------------------------------------+------+
  | round-lifecycle                                     |
  |   createRound / setTargetScore / resetIncomplete     |
  |   validateScore / submitScore                        |
  +--+------------------+------------------+-------------+
     |                  |                  |
     v                  v                  v
  allocation.ts      rating (M3)       history.ts
  allocateRound()    updateRatings()   appendHistoryEntry()
     |                                    |
     v                                    v
  matchmaker:round:v1              matchmaker:history:v1
  (localStorage)                   (localStorage)
```

## Data Model

LocalStorage 的每個 key 在此視為一張 table。下圖左為本 change 之前、右為之後；`matchmaker:roster:v1` 的欄位一個都沒改，只是多了兩個寫入者。

```
=== Before ===

+-- matchmaker:roster:v1 --+     +-- scoreboard:current:v1 --+
| version = 1              |     | (...)                     |
| players[]                |     +---------------------------+
|   id              PK     |
|   name                   |     這兩者互不干涉；重置範圍的
|   gender                 |     列舉清單此時只含左邊那一個
|   colorFrom / colorTo    |
|   rating                 |
|   restCount              |
|   gamesPlayed            |
|   isActive               |
|   createdAt              |
+--------------------------+


=== After ===

+-- matchmaker:roster:v1 --+
| version = 1              |
| players[]                |
|   id              PK     |<---------+
|   name                   |          |
|   gender                 |          | N---1
|   colorFrom / colorTo    |          | playerIds / restingPlayerIds
|   rating          (w)    |          | 參照 roster.id
|   restCount       (w)    |          |
|   gamesPlayed     (w)    |          |
|   isActive               |          |
|   createdAt              |          |
+--------------------------+          |
   (w) = 本 change 新增的寫入者        |
         schema 本身不變               |
                                       |
+-- matchmaker:round:v1 ---------------+---------------+
| version = 1                                          |
| round | null                                         |
|   roundNumber        int >= 1                        |
|   createdAt          ISO 8601                        |
|   format             singles | doubles               |
|   courtCount         1..8                            |
|   targetScore        11 | 15 | 21                    |
|   restingPlayerIds[]                     FK -> id    |
|   seenSignatures     teammate/opponent/full: str[]   |
|   matches[]                                          |
|     id               PK                              |
|     courtNumber      int >= 1                        |
|     format           singles | doubles               |
|     doublesComposition  only when doubles            |
|     teams[2]         playerIds[] FK -> id, rating    |
|     status           pending | scoring | completed   |
|     scores           {teamA, teamB} | null           |
|     winner           teamA | teamB | null            |
|     completedAt      ISO 8601 | null                 |
|     playerRatings[]  playerId FK, before, after|null |
+------------------------------------------------------+

+-- matchmaker:history:v1 -----------------------------+
| version = 1                                          |
| entries[]            append-only, no sort, no dedupe |
|   matchId            PK                              |
|   courtNumber                                        |
|   playedAt           ISO 8601                        |
|   format             singles | doubles               |
|   doublesComposition only when doubles               |
|   teamA / teamB                                      |
|     rating                                           |
|     players[]        id, name,                       |
|                      ratingBefore, ratingAfter       |
|   scoreA / scoreB    int >= 0                        |
|   winner             teamA | teamB                   |
+------------------------------------------------------+
   注意：history 的 players 是「快照」，刻意 **不** 與 roster
   建立 FK 關聯。球員被刪除或改名後，歷史仍須完整可讀
   (design Decision 3)。round 則相反，只存 id。
```

## Architecture

模組相依為單向：hook 只認識 `round.ts` 與 `round-storage.ts`；`round.ts` 認識分配、評分與歷史三個純函式模組；沒有任何一條箭頭往回指。名單的所有權留在 `player-roster`，以注入的 roster port 進出。

```
        app/matchmaker/**  +  components/matchmaker/**
                      (M5，本 change 不做)
                                |
                                v
        +---------------------------------------------+
        | hooks/useRoundStore.ts                       |
        |   useReducer + write effect + hydrate effect |
        |   roster port: { players, updatePlayer }     |
        +------+--------------------------------+------+
               |                                |
               v                                v
   +-----------------------+      +--------------------------+
   | lib/matchmaker/       |      | lib/matchmaker/          |
   |   round.ts            |      |   round-storage.ts       |
   |   - createRound       |      |   - readRound/writeRound |
   |   - setTargetScore    |      |   - readHistory/write... |
   |   - resetIncomplete   |      +------------+-------------+
   |   - validateScore     |                   |
   |   - submitScore       |                   v
   +--+------+------+------+      +--------------------------+
      |      |      |             | lib/matchmaker/          |
      |      |      |             |   storage-keys.ts        |
      |      |      |             |   3 keys + hasLocalStor. |
      |      |      |             +------------+-------------+
      |      |      |                          ^
      |      |      |                          |
      |      |      |             +--------------------------+
      |      |      |             | lib/matchmaker/          |
      |      |      |             |   storage.ts  (M1)       |
      |      |      |             |   RESET_KEYS x3          |
      |      |      |             +--------------------------+
      |      |      |
      v      v      v
  allocation.ts  rating (M3)   history.ts
  duplication.ts               round-types.ts
  (M2, 唯讀)                   (本 change 新增)
```

## Sequence Diagram

兩條順序敏感的流程。第一條是送出比分——**驗證必須在任何計算之前**，失敗時三份資料都不能有任何改變；第二條是產生新一輪——休息結算與回合取代必須在同一次狀態轉換內完成，否則會重複累加。

```
=== A. 送出比分 (成功與失敗兩條路徑) ===

 UI(M5)   useRoundStore   round.ts   rating(M3)  history.ts  roster
   |            |             |          |           |         |
   |--submit--->|             |          |           |         |
   |            |--submitScore--------->|            |         |
   |            |             |          |           |         |
   |            |             |-- validate 6.3.2 --+ |         |
   |            |             |<-------------------+ |         |
   |            |             |          |           |         |
   |            |<--ok:false--|  失敗即返回；round / history /  |
   |<--message--|             |  roster 三者皆未被觸碰          |
   |            |             |          |           |         |
   |            |             |--rating->|           |         |
   |            |             |<--new rating +-------|         |
   |            |             |   boundaryHits       |         |
   |            |             |          |           |         |
   |            |             |-- mark completed --+ |         |
   |            |             |<-------------------+ |         |
   |            |             |--append entry------->|         |
   |            |             |<---------------------|         |
   |            |<--ok:true---|                      |         |
   |            |   {round, historyEntry, patches}   |         |
   |            |                                    |         |
   |            |--updatePlayer(id, {rating, gamesPlayed}) x N->|
   |            |--writeRound / writeHistory--> localStorage    |
   |<--done-----|                                    |         |


=== B. 產生新一輪 (休息結算的原子性) ===

 UI(M5)   useRoundStore   round.ts   allocation.ts   roster
   |            |             |            |           |
   |--generate->|             |            |           |
   |            |--createRound----------->|             |
   |            |             |            |           |
   |            |             |-- 上一輪 completed +    |
   |            |             |    scoring 場次 -> 簽章 |
   |            |             |            |           |
   |            |             |--allocateRound (Set)--->|
   |            |             |<--{matches, resting}----|
   |            |             |            |           |
   |            |<--{round, restSettlements}|           |
   |            |                          |           |
   |            |  ==== 同一次 reducer action ====      |
   |            |  1. 套用 restSettlements (上一輪休息者 +1)
   |            |  2. 以新回合取代目前回合               |
   |            |  兩者不可分開；分開後中途失敗會留下     |
   |            |  「加過但沒換回合」的不可分辨狀態       |
   |            |                          |           |
   |            |--updatePlayer(id, {restCount+1}) x N->|
   |            |--writeRound--> localStorage           |
   |<--done-----|                          |           |
```

## Task Tree

tasks.md 的分組與相依，共 10 個章節。§1 是所有人的地基；回合狀態轉換拆成 §4→§5→§6 三段依序推進，§4～§7 全數完成後才輪得到 §8 的 store，§9 是收尾。派工單位就是這裡的 `§`（見 execution-plan 的 Mode），其中 §0 由 orchestrator 自己執行、§9 併入 Final Code Review，兩者都不派 Implementer。

```
§0 前置 (不產生程式碼，由 orchestrator 自己執行)
 |   0.1  確認 M3 已在 main，讀出評分 API 實際簽章
 |   0.2  重讀主 spec 的 hooks 歸屬清單，對齊 delta 全文
 |   0.3  依 environment.md 建立 worktree，回填 baseline
 |
 +-- §1 回合型別與 schema (round-types.ts)
 |     1.1-1.5  round-types.ts + round-types.test.ts
 |
 +-- §2 LocalStorage key 與重置範圍
 |     2.1-2.5  storage-keys.ts、storage.ts 的 RESET_KEYS
 |
 +-- §3 歷史 schema 與追加 (history.ts)       <-- Depends on §1
 |     3.1-3.7  schema + appendHistoryEntry
 |
 +-- §4 產生本輪與休息結算 (round.ts)         <-- Depends on §1, §3
 |     4.1-4.4   createRound + 重複比對基準推導
 |     4.5-4.7   休息結算 restSettlements
 |     4.8-4.10  名單、人數與場地數邊界
 |
 +-- §5 目標分數與重排未完成場次 (round.ts)   <-- Depends on §4
 |     5.1-5.2  setTargetScore
 |     5.3-5.7  resetIncompleteMatches + 共用投影抽出
 |
 +-- §6 比分驗證與送出流程 (round.ts)         <-- Depends on §3, §5
 |     6.1-6.2  validateScoreInput
 |     6.3-6.7  submitScore + 評分回寫 + 原子性
 |
 +-- §7 回合與歷史的持久化 (round-storage.ts) <-- Depends on §1, §2, §3
 |     7.1-7.7  read/write/clear + 兩段式降級
 |
 +-- §8 store hook (useRoundStore)     <-- Depends on §4, §5, §6, §7
 |     8.1-8.3  useRoundStore + hooks 歸屬清單同步
 |
 +-- §9 收尾驗證 (併入 Final Code Review)     <-- Depends on §1-§8
       9.1-9.8  錨點核對、lint/typecheck/test/e2e、validate
```

## Cross-Cutting Impact

| 檔案 | 動作 | 所屬 capability | 備註 |
|---|---|---|---|
| `nextjs-pickball/lib/matchmaker/round-types.ts` | 新增 | round-lifecycle | Round／RoundMatch／狀態／目標分數的 zod schema 與常數 |
| `nextjs-pickball/lib/matchmaker/round-types.test.ts` | 新增 | round-lifecycle | 7 個 it |
| `nextjs-pickball/lib/matchmaker/round.ts` | 新增 | round-lifecycle | 5 個對外純函式，本 change 的核心 |
| `nextjs-pickball/lib/matchmaker/round.test.ts` | 新增 | round-lifecycle | 33 個 it（含 3 個掛在 match-history 的錨點） |
| `nextjs-pickball/lib/matchmaker/round-storage.ts` | 新增 | round-lifecycle | 兩個 key 的讀寫與降級 |
| `nextjs-pickball/lib/matchmaker/round-storage.test.ts` | 新增 | round-lifecycle | 6 個 it |
| `nextjs-pickball/lib/matchmaker/storage-keys.ts` | 新增 | round-lifecycle | 3 個 key 常數與 `hasLocalStorage()` 的單一來源 |
| `nextjs-pickball/lib/matchmaker/history.ts` | 新增 | match-history | 歷史 schema 與 `appendHistoryEntry` |
| `nextjs-pickball/lib/matchmaker/history.test.ts` | 新增 | match-history | 6 個 it |
| `nextjs-pickball/hooks/useRoundStore.ts` | 新增 | round-lifecycle | roster port 注入；沿用 `useRosterStore` 的 effect 結構 |
| `nextjs-pickball/hooks/useRoundStore.test.tsx` | 新增 | round-lifecycle | 1 個 it（integration tier） |
| `nextjs-pickball/lib/matchmaker/storage.ts` | 修改 | player-roster | `RESET_KEYS` 擴為 3 個；`hasLocalStorage`／`STORAGE_KEY` 改由 `storage-keys.ts` 提供 |
| `nextjs-pickball/lib/matchmaker/storage.test.ts` | 修改 | player-roster | 既有 it「重置只移除列舉的 key…」擴大斷言 |
| `openspec/specs/pickleball-guide-page/spec.md` | 修改 | pickleball-guide-page | 僅歸屬清單一句；範圍與理由見 design Decision 9 |
| `nextjs-pickball/lib/matchmaker/allocation*.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts` | **不動** | match-allocation | 唯讀取用 |
| `nextjs-pickball/lib/matchmaker/roster.ts`、`colors.ts`、`types.ts` | **不動** | player-roster | 唯讀取用 |
| `nextjs-pickball/app/**`、`components/**`、`lib/scoreboard/**` | **不動** | — | UI 屬 M5、計分板銜接屬 M6 |
