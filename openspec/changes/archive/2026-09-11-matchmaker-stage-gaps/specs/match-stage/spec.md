## ADDED Requirements

### Requirement: 本輪場次為空時的畫面說明

目前回合存在但 `round.matches` 為空陣列時，對戰頁 MUST 顯示可判讀的繁體中文說明與下一步，SHALL NOT 顯示空白的場地網格或任何假資料。此狀態與「空白球場狀態」（`round` 為 `null`）**不同**——後者是「尚未產生任何回合」，本狀態則是「回合已存在，但該輪目前一場對戰都排不出來」，兩者的成因、文案與下一步皆不同，SHALL NOT 沿用「空白球場狀態」既有的元件、`data-testid` 或文案（見 design Decision 1）。

此狀態為**已由程式碼證實可達**的狀態，而非假設性邊界：`nextjs-pickball/lib/matchmaker/round.ts` 的 `resetIncompleteMatches` 在候選池不足以組成任何一場時，依 `nextjs-pickball/lib/matchmaker/candidates.ts` 的 `selectPlaying` 與 `nextjs-pickball/lib/matchmaker/allocation.ts` 既有的邊界行為（「人數不足與空名單 SHALL NOT 拋錯」）回傳空的 `matches` 陣列，`resetIncompleteMatches` 本身**不因此判定失敗**（`ok: true`）。例如：目前回合僅剩一場 `pending` 場次，主持人於按下「重設／再排」前把其中一位對戰中的球員設為暫停出場（或自名單移除），候選池即不足以再組出任何一場，重排後 `round.matches` 為空陣列而 `round` 本身仍非 `null`。

說明 MUST 指出下一步，至少提供前往參賽者名單（`/matchmaker/players`）的入口，SHALL NOT 只顯示技術訊息或留白（`prd.md` 12.3、第 11 節）。

實作位於 `nextjs-pickball/components/matchmaker/EmptyMatches.tsx`（新增，純呈現、無 props）與 `nextjs-pickball/components/matchmaker/MatchStage.tsx`（判斷並掛入）。

#### Scenario: 回合存在但無場次時顯示說明與下一步入口

- **WHEN** 目前回合存在且 `matches` 為空陣列
- **THEN** 畫面顯示繁體中文說明，指出本輪目前沒有任何場次
- **AND** 畫面提供前往參賽者名單的入口
- **AND** 不顯示任何場地卡片
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「回合存在但本輪無場次時顯示說明文字與前往參賽者名單入口」

#### Scenario: 回合存在且有場次時不顯示此說明

- **WHEN** 目前回合存在且至少有一個場次
- **THEN** 不出現本輪場次為空的說明
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「回合存在且有場次時不顯示本輪場次為空的說明」
