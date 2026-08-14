## Why

計分板目前把「11 分」寫死在 `nextjs-pickball/lib/scoreboard/rules.ts` 的勝利判定中，但 2026 USA Pickleball 官方規則除了標準的 11 分之外，賽會亦可採 15 或 21 分（同樣 win by 2）。使用者實際到球場計分時無法用本工具記錄 15／21 分制的比賽，只能改用紙筆或其他 App。

站內的測驗題（`nextjs-pickball/data/quiz/questions.ts:149`）本身已載明「部分賽事採 15 或 21 分制」，工具卻做不到——內容與工具的落差本身就是本次要補上的缺口。

## What Changes

- 計分板新增「目標分數」賽前設定，可選 **11／15／21**，預設 11；win by 2 的延長賽規則不變，三種分制一致適用且不設分數上限（cap）。
- 勝利判定由「達 11 分」改為「達使用者設定的目標分數」。
- 目標分數與既有的比賽形式、先發球方同屬賽前設定，**僅能在 `status === "setup"` 期間調整**，`playing` 與 `finished` 階段一律忽略；比賽中要改分制只能經二次確認的重置。
- Undo 與重置後 MUST 保留目標分數設定（現行 replay 機制由初始 state 重建，不處理會靜默退回 11 分制）。
- localStorage 既有的 `scoreboard:current:v1` 資料**不做破壞性遷移**：新欄位以 schema 預設值補齊，舊資料視為 11 分制，SHALL NOT 因驗證失敗被清除。**非 BREAKING**。
- 專注模式不渲染設定列，故隊伍面板的名稱行需一併顯示當前分制（如「我方 · 15 分制」），使目標分數在任何模式下皆可見。

不在本次範圍：

- rally scoring（落地得分制）與 side-out 的切換——規則引擎需分岔，另案處理。
- 指南頁 `ScoringSection` 的「標準比賽打到 11 分」文案——該敘述本身正確，屬 `pickleball-guide-page` capability，維持不動。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `scoreboard`: 四項 Requirement 的行為改變——
  - 「計分規則 — Traditional Side-Out」：勝利門檻由固定 11 分改為可設定的目標分數
  - 「localStorage 持久化」：新增欄位的相容性策略（以 schema 預設值補值，不 bump storage key）
  - 「賽前設定與階段鎖定」：設定項由兩項增為三項，三項一致鎖定
  - 「RWD 排版」：設定列新增第三個控制項後的零捲動驗收範圍

## Impact

**程式碼**（皆位於 `nextjs-pickball/`）：

| 檔案 | 影響 |
|---|---|
| `lib/scoreboard/types.ts` | 新增 `TargetScoreSchema` 與 state 欄位、新增 `SET_TARGET_SCORE` action |
| `lib/scoreboard/rules.ts` | `isGameWon` 新增第二個參數 |
| `lib/scoreboard/reducer.ts` | `createInitialState` 的設定參數收斂、四處呼叫點、新增 action case |
| `lib/scoreboard/storage.ts` | 無需改碼，相容性由 zod schema 預設值承擔（須以測試確認） |
| `components/scoreboard/ScoreboardSetup.tsx` | 新增第三個控制項 |
| `components/scoreboard/TeamPanel.tsx` | 名稱行顯示分制 |
| `components/scoreboard/Scoreboard.tsx` | 傳遞新的 dispatch handler |

**測試**：`lib/scoreboard/rules.test.ts`、`reducer.test.ts`、`storage.test.ts` 需擴充；`tests/e2e/specs/scoreboard.spec.ts` 需新增非 11 分制流程，並確認設定列增為三項後多 viewport 零捲動驗收仍通過。

**使用者資料**：既有 `localStorage["scoreboard:current:v1"]` 保持可讀，進行中的比賽不會因本次更新而遺失。

**無影響**：後端 `hono-pickball`、部署設定、其他 capability。
