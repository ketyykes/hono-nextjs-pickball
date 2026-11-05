# Proposal: scoreboard-bound-game-over

## Why

由對戰頁進入的綁定計分板（`/scoreboard?match=<id>`）打完一場後，比賽結束對話框（`GameOverDialog`）只提供「關閉」與「再來一局」；「再來一局」未經確認就 `RESET`，把該場分槽改回 `setup`、分數清空——對戰頁靠分槽的 `finished` 狀態自動回填比分，按下去這場比分就無法回填，只能回對戰頁手動重填（登入時還會把清空後的分槽 `PUT` 到雲端）。
另外，專注模式不渲染設定列，設定列上的「返回對戰」跟著消失，比賽結束後沒有直接回對戰頁的路。主 spec `scoreboard`「賽前設定與階段鎖定」寫明 RESET「MUST 經二次確認才執行」，但對話框的「再來一局」未經確認——字面上與規格衝突，而規格對對話框的按鈕完全沒有規定。

## What Changes

- **綁定模式**（`Scoreboard` 收到非 null 的 `matchId` prop）：比賽結束對話框**不顯示**「再來一局」，主要動作改為「返回對戰」（連到 `/matchmaker` 的連結，寫法與設定列既有「返回對戰」相同）；「關閉」保留，讓使用者檢視終局分數。按「返回對戰」只導航，SHALL NOT 觸發 RESET 或任何分槽寫入，對戰頁照既有規則自動回填。
- **專注模式**：對話框是 portal，不受設定列隱藏影響，因此上述行為在專注模式下相同——順帶補上專注模式比賽結束後回對戰頁的路。
- **獨立模式**（`matchId` 為 null）：行為完全不變（「關閉」＋「再來一局」）。
- **規格**：新增 Requirement「比賽結束對話框的動作」明訂兩種模式的按鈕；修改「賽前設定與階段鎖定」的 RESET 二次確認那一句，把獨立模式比賽結束對話框的「再來一局」明文列為唯一例外，消除字面衝突。
- 無 **BREAKING**：獨立模式零變更；綁定模式移除的「再來一局」本來就會讓該場比分無法回填，沒有正當用途。

### 明確不做

- 不改 reducer、不改分槽儲存（`useScoreboardStore`、`useRemoteMatchSlotStore`）、不改後端、不改對戰頁、不新增相依。
- 不為「再來一局」補二次確認（獨立模式維持現狀，改以規格明文列為例外）。
- 不改「對戰場次綁定與失效處理」中設定列返回入口在專注模式下隱藏的規則。
- 不改場次失效畫面（`MatchBindingNotice`）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `scoreboard`：
  - 新增 Requirement「比賽結束對話框的動作」：綁定模式為「關閉」＋「返回對戰」、獨立模式為「關閉」＋「再來一局」，以 `matchId` prop 判斷；專注模式下相同；「返回對戰」不觸發 RESET 與分槽寫入。
  - 修改 Requirement「賽前設定與階段鎖定」：RESET 二次確認規則加上「獨立模式比賽結束對話框的再來一局」這個唯一例外（其餘段落與全部 Scenario 原樣保留）。

## Impact

- **前端產品程式碼（兩檔）**：`nextjs-pickball/components/scoreboard/GameOverDialog.tsx`（新增可選 prop `matchId`、依綁定模式切換按鈕）、`nextjs-pickball/components/scoreboard/Scoreboard.tsx`（把既有 `matchId` prop 傳給 `GameOverDialog`，一行）。
- **測試**：
  - 新增 it：`nextjs-pickball/components/scoreboard/GameOverDialog.test.tsx`（3 個；其中 2 個預期為 regression guard）。
  - 新增 E2E：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`（2 個 test，沿用該檔 `/matchmaker 對戰頁的計分板接線` describe 內的 helper）。
  - 既有 it／test **一行不改**（`GameOverDialog` 的新 prop 為可選，既有 it 的 `render` 呼叫不需變動；`scoreboard.spec.ts` 不改）。
- **文件**：`nextjs-pickball/CLAUDE.md` 目前沒有描述 `GameOverDialog` 或比賽結束後動線的段落，依 coordinator 指示不新增（apply 時複查並記錄）。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **訪客／登入**：綁定模式不論訪客或登入都改變（對話框不再提供 RESET 入口，登入時因此少一個會把分槽清空並 `PUT` 的路徑）；獨立計分板 DOM 零變更。
