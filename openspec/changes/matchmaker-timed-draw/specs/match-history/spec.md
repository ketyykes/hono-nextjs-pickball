# Specification: match-history

## MODIFIED Requirements

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
| `winner` | `"teamA" \| "teamB" \| "draw"` | 勝方；兩隊比分相同的計時回合為 `"draw"`（見 `round-lifecycle` 的「比分驗證」） |

`HistoryTeam` MUST 含該隊每位球員的快照：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `players[].id` | string | 球員 id，供日後比對，但 SHALL NOT 作為顯示資料的唯一來源 |
| `players[].name` | string | **姓名快照**，寫入當下的名稱 |
| `players[].ratingBefore` | number | 該員賽前分數 |
| `players[].ratingAfter` | number | 該員賽後分數（clamp 後） |
| `rating` | number | 該隊的隊伍分數（賽前，單打為該員 rating、雙打為兩人總和） |

賽前與賽後分數 MUST 為 **per-player**，SHALL NOT 只保存隊伍層級的一個數字——`prd.md` 9.3.1 的 CSV 匯出明列「各員賽前分數與賽後分數」，且雙打同隊兩人的起點不同，只存隊伍值就無法還原任何一位球員的變化。平局時兩隊亦各自保留 per-player 的賽前／賽後分數，與勝負場次的欄位形狀完全一致，不因平局而簡化。

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

#### Scenario: winner 欄位新增 draw 列舉值時通過驗證

- **WHEN** 一筆歷史紀錄的 `winner` 為 `"draw"`，其餘欄位合法
- **THEN** 驗證通過
- **AND** `winner` 為 `"tie"` 這類未列舉的字面量時驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/history.test.ts`，it 名稱「winner 欄位新增 draw 列舉值時通過驗證」

---

### Requirement: 歷史紀錄的顯示欄位

每筆歷史紀錄 SHALL 顯示 `prd.md` 8.2 列舉的全部欄位，對應 M4 `MatchHistoryEntry` 的識別字：對戰 ID（`matchId`）、場地（`courtNumber`）、對戰時間（`playedAt`）、對戰方式（`format`）、雙打組成標示（`doublesComposition`）、第一隊（`teamA`）、第二隊（`teamB`）、比分（`scoreA`／`scoreB`）與勝方（`winner`）。

球員姓名 MUST 取自紀錄內的**姓名快照**（`teamA.players[].name`），SHALL NOT 以 `players[].id` 回查目前名單——參賽者可被刪除或改名，回查會讓過去的賽果變成空白（M4「歷史紀錄欄位 schema」已明訂此約束，本 capability 是它的消費端）。

賽前與賽後分數 MUST **逐位球員**呈現（`players[].ratingBefore` 與 `players[].ratingAfter`）並可辨識其變化方向，SHALL NOT 只顯示其中一側——PRD 13.4 的驗收項要求「歷史紀錄包含賽前／賽後分數」，只顯示賽後分數會讓使用者無從得知該場的評分影響。

雙打組成標示 MUST 只在對戰方式為雙打時顯示；單打紀錄 SHALL NOT 顯示該欄位（單打沒有組成可言，顯示空白或「一般雙打」都是錯誤資訊）。

勝方 MUST 以文字或圖示明確標示，SHALL NOT 僅以顏色區分（`prd.md` 12.5：色彩不得為唯一資訊來源）。`winner` 為 `"draw"` 時 MUST 顯示可判讀的「平手」文字，SHALL NOT 顯示任一隊為勝方，也 SHALL NOT 留白——顯示任一隊會誤導使用者以為該隊真的獲勝，留白則與「未完成」場次的呈現無法區分。

歷史頁 SHALL NOT 重新計算任何分數：賽前／賽後分數、比分與勝方一律照 M4 寫入的值原樣呈現。

實作位於 `nextjs-pickball/components/matchmaker/HistoryRecordCard.tsx`。

#### Scenario: 雙打紀錄顯示 8.2 全部欄位

- **GIVEN** `matchmaker:history:v1` 中有一筆雙打紀錄
- **WHEN** 於歷史頁檢視該筆紀錄
- **THEN** 畫面同時呈現對戰 ID、場地、對戰時間、對戰方式、雙打組成標示、兩隊球員、比分與勝方
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「雙打紀錄顯示 8.2 全部欄位含雙打組成標示」

#### Scenario: 單打紀錄不顯示雙打組成標示

- **GIVEN** `matchmaker:history:v1` 中有一筆單打紀錄
- **WHEN** 於歷史頁檢視該筆紀錄
- **THEN** 該筆不出現任何雙打組成標示
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「單打紀錄不顯示雙打組成標示」

#### Scenario: 每位球員同時顯示賽前與賽後分數

- **GIVEN** 一筆紀錄中某位球員的賽前分數為 4.20、賽後分數為 4.35
- **WHEN** 於歷史頁檢視該筆紀錄
- **THEN** 該球員同時顯示 4.20 與 4.35 兩個值
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「每位球員同時顯示賽前與賽後分數」

#### Scenario: 平局紀錄顯示平手而非任一隊勝方

- **GIVEN** `matchmaker:history:v1` 中有一筆 `winner` 為 `"draw"` 的紀錄
- **WHEN** 於歷史頁檢視該筆紀錄
- **THEN** 畫面顯示可判讀的「平手」文字，且第一隊與第二隊皆不出現「勝」之類的勝方標籤
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「平局紀錄顯示平手而非任一隊勝方」
