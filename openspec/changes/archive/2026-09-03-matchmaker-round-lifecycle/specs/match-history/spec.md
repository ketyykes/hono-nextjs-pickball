## Purpose

定義「匹克球對戰分配機」歷史賽果的**紀錄欄位 schema** 與**寫入時機**兩件事（`prd.md` 8.2）。歷史是本產品唯一在回合被取代之後仍然留存的資料，也是 CSV 匯出與歷史頁的共同來源——三者同一份 schema，任何一方單獨擴充欄位都會讓另外兩方讀到不完整的資料。

本 capability **刻意只含兩類 requirement**。歷史的五個時間區間切點（`prd.md` 8.1）、空區間文案、排序、歷史頁路由與呈現，皆屬後續 milestone；本 capability 保存的是**追加順序**的原始紀錄，不排序、不去重、不篩選。CSV 匯出（`prd.md` 9.3.1）同樣不在此。

歷史保存的是**球員快照**而非 id 參照，這是本 capability 最重要的一條約束：參賽者可以被刪除或改名，歷史若靠 id 回查名單，一次刪除就會讓過去的賽果變成空白或整筆消失。

## ADDED Requirements

### Requirement: 歷史紀錄欄位 schema

系統 SHALL 以 zod schema 定義單筆歷史紀錄，欄位對應 `prd.md` 8.2：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `matchId` | string | 對戰 ID，對應該場次在回合中的 `id` |
| `courtNumber` | number | 場地編號，1 起算的正整數 |
| `playedAt` | string | 對戰時間，ISO 8601，取該場的完成時間 |
| `format` | `"singles" \| "doubles"` | 對戰方式 |
| `doublesComposition` | 選填 | 雙打組成標示（男雙／女雙／混雙／一般雙打）；單打 MUST NOT 帶此欄位 |
| `teamA` | HistoryTeam | 第一隊 |
| `teamB` | HistoryTeam | 第二隊 |
| `scoreA` | number | 第一隊比分，非負整數 |
| `scoreB` | number | 第二隊比分，非負整數 |
| `winner` | `"teamA" \| "teamB"` | 勝方 |

`HistoryTeam` MUST 含該隊每位球員的快照：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `players[].id` | string | 球員 id，供日後比對，但 SHALL NOT 作為顯示資料的唯一來源 |
| `players[].name` | string | **姓名快照**，寫入當下的名稱 |
| `players[].ratingBefore` | number | 該員賽前分數 |
| `players[].ratingAfter` | number | 該員賽後分數（clamp 後） |
| `rating` | number | 該隊的隊伍分數（賽前，單打為該員 rating、雙打為兩人總和） |

賽前與賽後分數 MUST 為 **per-player**，SHALL NOT 只保存隊伍層級的一個數字——`prd.md` 9.3.1 的 CSV 匯出明列「各員賽前分數與賽後分數」，且雙打同隊兩人的起點不同，只存隊伍值就無法還原任何一位球員的變化。

紀錄 MUST 是**自足的快照**：寫入後即使該球員從名單中被刪除或改名，這筆歷史仍 MUST 能完整顯示當時的姓名、比分與分數變化。SHALL NOT 以 `playerId` 於呈現時回查名單取得姓名（見 design Decision 3）。

單打 MUST NOT 帶 `doublesComposition`，雙打 MUST 帶——與 `match-allocation` 對 `Match` 的約束一致，避免同一個概念在兩處有兩種形狀。

外層容器的 `version` MUST 為字面量 `1`。

實作位於 `nextjs-pickball/lib/matchmaker/history.ts`。

#### Scenario: 合法歷史紀錄通過驗證

- **WHEN** 以完整合法欄位呼叫 `MatchHistoryEntrySchema.safeParse`
- **THEN** `success` 為 `true`
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「合法歷史紀錄通過驗證」

#### Scenario: 缺少必要欄位時驗證失敗

- **WHEN** 紀錄缺少 `winner`、`playedAt` 或 `scoreA`
- **THEN** 驗證失敗
- **AND** `playedAt` 非 ISO 8601、`scoreA` 為負數時亦驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「缺少必要欄位或欄位格式不合法時驗證失敗」

#### Scenario: 每位球員各帶賽前與賽後分數

- **WHEN** 一筆雙打紀錄通過驗證
- **THEN** 兩隊合計 MUST 有 4 位球員，每位皆帶 `ratingBefore` 與 `ratingAfter`
- **AND** 單打紀錄合計 2 位
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「歷史紀錄的每位球員各帶賽前與賽後分數」

#### Scenario: 單打不帶雙打組成標示

- **WHEN** 一筆 `format` 為 `"singles"` 的紀錄帶有 `doublesComposition`
- **THEN** 驗證失敗
- **AND** `format` 為 `"doubles"` 而未帶該欄位時亦驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「單打不得帶雙打組成標示，雙打必須帶」

#### Scenario: 球員自名單刪除後歷史仍完整

- **GIVEN** 一筆已寫入的歷史紀錄
- **WHEN** 其中一位球員自名單中被移除
- **THEN** 該筆紀錄的姓名、比分、賽前與賽後分數 MUST 完全不受影響
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「球員自名單刪除後歷史紀錄的姓名與分數仍完整」

---

### Requirement: 完成場次時寫入一筆歷史

每完成一場對戰，系統 SHALL 追加**恰好一筆**歷史紀錄（`prd.md` 8.2、6.3）。追加 MUST 為不可變操作——回傳新的歷史陣列，SHALL NOT 就地修改傳入的陣列。

寫入時機 MUST 綁定「場次由未完成轉為 `completed`」這一刻，且與評分更新、`gamesPlayed` 累加同屬一次原子的送出流程（見 `round-lifecycle` 的「比分送出的完成流程」）。

同一場次 SHALL NOT 產生第二筆——已完成場次不得再次送出，這是 `prd.md` 6.5 的既有約束，本 capability 依賴它而非另行去重。

歷史 MUST 以**追加順序**保存，SHALL NOT 在寫入時排序或去重。排序、五個時間區間的篩選與呈現屬後續 milestone；在儲存層先做排序會讓「同一秒完成的兩場」順序不穩定，也讓後續的篩選失去原始順序這個唯一可靠的並列基準。

重設或重排未完成場次 SHALL NOT 刪除或修改任何已寫入的歷史（`prd.md` 6.2 明訂重設保留已完成場次的比分與 Elo 結果）。產生新一輪取代目前回合時同理。

歷史屬於「重置名單」的清除範圍（見 `player-roster`）。

實作位於 `nextjs-pickball/lib/matchmaker/history.ts` 與 `nextjs-pickball/lib/matchmaker/round.ts`。

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
