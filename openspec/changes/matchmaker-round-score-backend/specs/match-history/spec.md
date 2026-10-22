## MODIFIED Requirements

### Requirement: 完成場次時寫入一筆歷史

每完成一場對戰，系統 SHALL 追加**恰好一筆**歷史紀錄（`prd.md` 8.2、6.3）。追加 MUST 為不可變操作——回傳新的歷史陣列，SHALL NOT 就地修改傳入的陣列。

寫入時機 MUST 綁定「場次由未完成轉為 `completed`」這一刻，且與評分更新、`gamesPlayed` 累加同屬一次原子的送出流程（見 `round-lifecycle` 的「比分送出的完成流程」）。

同一場次 SHALL NOT 產生第二筆——已完成場次不得再次送出，這是 `prd.md` 6.5 的既有約束，本 capability 依賴它而非另行去重。

歷史 MUST 以**追加順序**保存，SHALL NOT 在寫入時排序或去重。排序、五個時間區間的篩選與呈現屬後續 milestone；在儲存層先做排序會讓「同一秒完成的兩場」順序不穩定，也讓後續的篩選失去原始順序這個唯一可靠的並列基準。

重設或重排未完成場次 SHALL NOT 刪除或修改任何已寫入的歷史（`prd.md` 6.2 明訂重設保留已完成場次的比分與 Elo 結果）。產生新一輪取代目前回合時同理。

歷史屬於「重置名單」的清除範圍（見 `player-roster`）。

**雲端模式**（`user-data-sync`「前端依 session 選擇儲存模式」）下，歷史 MUST 由後端在送出比分的同一個 D1 batch 內寫入 `matchmaker_history`
（`round-lifecycle`「回合與送出比分的雲端 API」），前端 SHALL NOT 寫入任何歷史（本機 `matchmaker:history:v1` 亦不寫）。
寫入的 `data` MUST 是核心 `submitScore` 回傳的 `historyEntry` 原樣，`played_at` 欄位 MUST 等於 `historyEntry.playedAt` 換算的毫秒數。
追加順序在雲端以列的插入順序（`rowid`）保存；`(user_id, match_id)` 主鍵是「同一場次 SHALL NOT 產生第二筆」的**第二道防線**——
第一道仍是「已完成場次不得再次送出」，主鍵衝突只在第一道被繞過時發生，且 MUST 使整批回滾並回 409。
雲端模式下回合 PUT（重排、產生新一輪、換人等）與分槽寫入 SHALL NOT 觸碰 `matchmaker_history`。

實作位於 `packages/pickball-core/src/matchmaker/history.ts`、`packages/pickball-core/src/matchmaker/round.ts` 與 `hono-pickball/src/matchmaker/score-repository.ts`。

#### Scenario: 完成一場後歷史增加恰好一筆

- **GIVEN** 歷史目前有 2 筆
- **WHEN** 送出一場合法比分並完成該場
- **THEN** 歷史變為 3 筆，新增那筆的 `matchId`、`courtNumber`、`scoreA`／`scoreB`、`winner` 與該場一致
- **AND** 原陣列未被就地修改
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「appendHistoryEntry 回傳新陣列且只增加一筆」

#### Scenario: 同一場次重複送出不會產生第二筆

- **GIVEN** 一個已 `completed` 的場次
- **WHEN** 再次送出相同比分
- **THEN** 送出被拒絕，歷史筆數不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「已完成場次重複送出時歷史筆數不變」

#### Scenario: 重排未完成場次不影響既有歷史

- **GIVEN** 目前回合有一場已完成並已寫入歷史
- **WHEN** 重排未完成場次
- **THEN** 歷史筆數與內容完全不變
- **驗收**：`nextjs-pickball/lib/matchmaker/round.test.ts`，it 名稱「重排未完成場次不刪除也不修改既有歷史」

#### Scenario: 多場完成時依完成順序追加

- **WHEN** 依序完成場次 A、C、B
- **THEN** 歷史中的 `matchId` 順序 MUST 為 A、C、B
- **AND** SHALL NOT 依場地編號或時間重新排序
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「多筆歷史依追加順序保存，不重新排序」

#### Scenario: 雲端歷史的 data 與 played_at 來自同一筆 historyEntry

- **GIVEN** 已登入，目前回合有 `pending` 的 `m1`
- **WHEN** 送出比分成功
- **THEN** `matchmaker_history` 中 `m1` 那一列的 `data` 與回應的 `historyEntry` 深度相等，`played_at` 等於 `Date.parse(historyEntry.playedAt)`，`version` 為 1
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「雲端歷史的 data 等於回應的 historyEntry 且 played_at 為其毫秒值」

#### Scenario: 雲端回合 PUT 不觸碰歷史

- **GIVEN** 已登入，`matchmaker_history` 已有兩筆
- **WHEN** 以合法版本 PUT 一個全新的回合（產生新一輪）
- **THEN** `matchmaker_history` 仍為那兩筆，內容不變
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 不新增、不修改也不刪除任何歷史」
