## Why

**本 change 為 milestone M4**，在整體交付序中位於「引擎完成、UI 尚未開始」的接縫上：M1（`add-player-roster`）交付名單、M2（`matchmaker-allocation-engine`）交付分配純函式、M3（`matchmaker-rating-engine`）交付評分純函式，三者都已是**不記得任何事**的無狀態模組。使用者現在仍然無事可做——沒有任何東西把「名單 + 分配 + 評分」串成一個會前進的活動：沒有回合、沒有比分入口、沒有歷史、重新整理後什麼都不剩。

M4 補的正是這條時間軸：**回合狀態機與持久化**。它讓 `allocateRound()` 的輸出成為一個有編號、有目標分數、有場次狀態、會被寫進 LocalStorage 的「目前回合」，讓比分送出成為一條可驗證的 pipeline（驗證 → 評分 → 標記完成 → 寫入歷史 → 累計出場次數），並回答 M2 刻意留給第 3 段的兩個問題：`restCount` 到底何時 +1、簽章基準怎麼跨輪傳遞。

這一段先做、且必須先於 UI（M5）做，理由與 M2 相同：**回合的狀態轉換是行為邏輯，不是畫面**。`prd.md` 6.2 的「重設只保留已完成場次」、6.3.2 的四條比分驗證、5.3 尾段的「本輪結束後休息次數 +1」，若混在 React 元件裡實作，就只能靠點畫面來驗證；抽成純函式後每一條都能被單元測試逐條釘住，M5 接上時拿到的是已經被證明過的狀態機。

## 執行相依

- **M3（`matchmaker-rating-engine`）MUST 先合併回 `main`**，本 change 的 worktree 才能從 `main` 開出。M4 的「比分送出 pipeline」直接消費 M3 的評分 API（輸入雙方隊伍 rating、各員 `gamesPlayed` 與勝負 → 輸出各員 clamp 至 1.00～8.00 後的新 rating 與是否觸頂／觸底），沒有它 pipeline 的中段無法實作、對應的 RED 測試也無法寫。
- M1、M2 已在 `main`（archive 分別為 `2026-08-17-add-player-roster`、`2026-08-17-matchmaker-allocation-engine`），不需額外等待。
- 本 change **不**相依 M5～M9；反之 M5（對戰畫面）、M6（場邊計分銜接）、M7（歷史頁）、M8（CSV 匯出）都相依本 change 定案的 Round 與歷史 schema。

## What Changes

新增 `nextjs-pickball/lib/matchmaker/` 下的回合狀態機與持久化模組，以及 `nextjs-pickball/hooks/useRoundStore.ts`，涵蓋 `prd.md` 6.1、6.2、6.3.2、6.5、8.2、9.1 與 5.3 尾段：

- **Round 資料模型**：目前回合含回合編號、建立時間、對戰方式、場地數、`targetScore`、對戰清單（各場：場地編號、兩隊球員、隊伍分數、狀態、比分、勝方、完成時間、各員賽前／賽後分數）、休息名單與重複配對簽章基準。以 zod schema 定義，供持久化回讀時逐層驗證。
- **目標分數為每輪設定**（`prd.md` 6.3.1 前半）：值域為 11／15／21，於「產生本輪對戰」時決定，同一輪所有場地共用。**未鎖定時可更改**的語意在本 change 定案；「一旦有場次開始計分即不可更改」的完整鎖定執行需要場邊計分的進行中狀態，屬 M6。
- **產生本輪對戰**（6.1）：消費 M2 的 `allocateRound()`，把輸出投影成可持久化的回合物件；已有上一輪時，上一輪**所有已完成與進行中**的組合納入重複比對基準，未開始的場次則捨棄。
- **休息次數結算**（5.3 尾段）：把「本輪結束」定義成**產生新一輪的那一刻**，於同一次狀態轉換內對上一輪休息名單各 `restCount + 1`。這是本 change 最關鍵的產品決策，理由與被否決的兩個替代方案記於 design。
- **重設／重排未完成場次**（6.2）：僅在目前回合存在且仍有未開始場次時可用；保留已完成場次的比分與評分結果，只重新分配本輪尚未比賽者，沿用原回合與前一輪的重複比對基準，並把被丟棄的原始組合併入基準。
- **比分驗證**（6.3.2）：任一欄位空白、非有效數字、負數、兩隊平局、場次已完成——五者皆 MUST 拒絕送出，並回傳繁體中文且說明修正方式的訊息。
- **比分送出 pipeline**（6.4、6.5）：驗證 → 呼叫 M3 評分 API → 標記完成（最終比分、勝方、完成時間、各員賽前／賽後分數）→ 寫入一筆歷史 → 該場 4（或 2）人 `gamesPlayed + 1`。任一步失敗則整條不生效（原子性）；已完成場次 MUST NOT 再次送出。
- **歷史紀錄 schema 與寫入時機**（8.2）：對戰 ID、場地、對戰時間、對戰方式、雙打組成標示、第一隊、第二隊、比分、勝方、各員賽前分數與賽後分數。歷史保存的是**球員快照**（含姓名與分數），不是 id 參照——球員日後被刪除或改名時歷史仍須完整可讀。
- **持久化**（9.1）：新增 LocalStorage key `matchmaker:round:v1` 與 `matchmaker:history:v1`，損壞降級比照 `lib/matchmaker/storage.ts` 既有做法（回合為單一物件故整份清除；歷史為多筆故逐筆降級並回報丟棄筆數）。LocalStorage 不可用或寫入超出配額時 SHALL NOT 拋出例外中斷操作。
- **邊界處理**（第 11 節相關項）：重置後沒有任何參賽者、單打不足 2 人、雙打不足 4 人、全員暫停出場——皆 MUST 拒絕建立回合並回傳可判讀的繁體中文訊息，SHALL NOT 拋例外，也 SHALL NOT 破壞既有的目前回合。
- **重置範圍擴大**：`resetMatchmakerData()` 的列舉 key 清單納入上述兩個新 key，使 `prd.md` 4.1.5「清除全部參賽者、目前回合與歷史賽果」成立。
- **hooks 歸屬清單同步**：新增 `useRoundStore` 需一併更新 `pickleball-guide-page` 規格的跨 capability hooks 歸屬清單——這不是選配，該清單是唯一來源且已有守衛測試（`hooks/hooksInventory.test.ts`）會轉紅（見 design Decision 9）。

### 不在本次範圍

明確排除相鄰 milestone 的工作，避免 worktree 之間互踩：

- **一切視覺呈現與頁面（M5）**：對戰舞台的滿版色塊、休息名單面板、場地數與對戰方式控制項、空白球場狀態、全站 navbar 的 matchmaker 入口。本 change **不新增任何 `app/**` 路由或 `components/**` 元件**，也不 MODIFY `site-navbar`。
- **場邊計分銜接與 targetScore 鎖定執行（M6）**：`scoreboard:current:v1` 改為可識別所屬對戰、由計分板返回時的回填、場次「進行中（`scoring`）」狀態的實際產生時機。本 change 只在 schema 與「未完成」判定中**預留** `scoring`，SHALL NOT 自行產生該狀態。
- **歷史區間篩選與歷史頁（M7）**：`prd.md` 8.1 的五個區間切點、空區間文案、歷史頁路由與排序呈現。本 capability 只負責「欄位 schema」與「完成時寫入一筆」兩件事，歷史以**追加順序**保存，不排序、不去重。
- **匯入匯出（M8／M9）**：JSON 完整備份、CSV 匯出歷史賽果、CSV 匯入名單、JPG 與 PDF。
- **重算既有歷史**：`prd.md` 6.4.7 明訂手動覆蓋強度分數只影響之後的比賽，本 change SHALL NOT 提供任何回溯重算。

## Capabilities

### New Capabilities

- `round-lifecycle`：目前回合的狀態機與持久化——回合資料模型、目標分數的每輪設定、產生本輪、休息次數結算、重設／重排未完成場次、比分驗證與送出流程、LocalStorage 讀寫與損壞降級、人數不足的邊界行為。
- `match-history`：歷史賽果的**紀錄欄位 schema** 與**完成場次時寫入一筆**兩類規則。區間篩選、排序與頁面呈現屬 M7，本 capability 明確不含。

### Modified Capabilities

- `player-roster`：兩處。① **重置名單與二次確認**——重置的列舉 key 清單納入 `matchmaker:round:v1` 與 `matchmaker:history:v1`，使重置真的清掉「目前回合與歷史賽果」。② **參賽者資料模型**——現行條文寫「`restCount` 與 `gamesPlayed` 的累加分別屬於分配演算法與評分更新」，與 `match-allocation` 規格「本 capability SHALL NOT 修改任何 `Player` 物件，包含 `restCount` 的累加——累加屬於回合結束時的持久化行為」直接矛盾；本 change 把兩個欄位的累加歸屬更正到 `round-lifecycle`。
- `pickleball-guide-page`：**互動行為由三支 hooks 提供且各有 smoke test**——該 Requirement 是 `nextjs-pickball/hooks/` 跨 capability 歸屬清單的**單一來源**，且明文要求「其他 capability 於該目錄新增 hook 時，其 change SHALL 一併更新此清單」。本 change 新增 `useRoundStore`，故將其歸屬 `round-lifecycle` 補入清單。**這是必要而非順帶**：`hooks/hooksInventory.test.ts` 會雙向比對目錄與清單，漏更新即整套測試轉紅。

## Impact

- **新增**：
  - `nextjs-pickball/lib/matchmaker/round-types.ts`（Round／RoundMatch／目標分數／場次狀態的 zod schema 與常數）
  - `nextjs-pickball/lib/matchmaker/round.ts`（回合狀態轉換純函式：建立、設定目標分數、重排未完成、比分驗證與送出）
  - `nextjs-pickball/lib/matchmaker/history.ts`（歷史紀錄 schema 與追加函式）
  - `nextjs-pickball/lib/matchmaker/round-storage.ts`（`matchmaker:round:v1`／`matchmaker:history:v1` 的讀寫與降級）
  - `nextjs-pickball/lib/matchmaker/storage-keys.ts`（三個 LocalStorage key 常數與 `hasLocalStorage()` 的單一來源）
  - `nextjs-pickball/hooks/useRoundStore.ts`
  - 上述各檔對應的 `*.test.ts(x)`
- **修改**：
  - `nextjs-pickball/lib/matchmaker/storage.ts`——`RESET_KEYS` 納入兩個新 key；`hasLocalStorage()` 與 `STORAGE_KEY` 改為由 `storage-keys.ts` 提供（`STORAGE_KEY` 保留 re-export，M1 既有匯入點與測試不受影響）
  - `nextjs-pickball/lib/matchmaker/storage.test.ts`——重置範圍的斷言擴大為三個 key（`RESET_KEYS` 改動的對應測試；test-plan 的「既有測試檔的擴充」已列，apply 的 §9.8 核對時補記於此以免被判為未申報檔案）
  - `openspec/specs/pickleball-guide-page/spec.md` 的 hooks 歸屬清單一句（見 design Decision 9：這是 apply 期間唯一被允許、且範圍限定在本 change delta 內的主 spec 同步）
- **重用（唯讀，不修改）**：`lib/matchmaker/allocation.ts` 的 `allocateRound`、`allocation-types.ts` 的 `Match`／`SignatureIndex`／`PLAYERS_PER_MATCH`、`duplication.ts` 的 `buildSignatureIndex`、`types.ts` 的 `Player`、M3 的評分 API
- **不動**：`roster.ts`、`colors.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts`、`app/matchmaker/**`、`components/matchmaker/**`、`lib/scoreboard/**`
- **無外部相依**：不新增任何 npm 套件；zod、React 皆為既有相依
- **後續 milestone 的相依**：M5 消費 `useRoundStore` 與 Round schema；M6 消費場次 `scoring` 狀態與 `targetScore` 鎖定語意；M7／M8 消費 `MatchHistoryEntry` schema（三者同一份，不得各自擴充）
