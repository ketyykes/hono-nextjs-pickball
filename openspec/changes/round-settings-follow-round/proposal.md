# Proposal: round-settings-follow-round

## Why

對戰頁的「本輪設定」（對戰方式、場地數、目標分數、計時）只存在 `nextjs-pickball/app/matchmaker/page.tsx` 的 `useState(() => createRoundSettings())`（約 :88），頁面每次掛載都回到預設值，與目前回合脫鉤，造成兩個使用者可見的問題：

1. **離開再回來，設定與舞台不一致**：使用者以雙打、2 個場地產生本輪後切到「參賽者」再切回「對戰」，設定列變回單打、1 個場地，舞台上仍是雙打 2 場。此時直接按「產生本輪對戰」會以預設值產生下一輪——賽制與場地數被靜默改掉。
2. **回合存在時改的目標分數／計時不會帶到下一輪**：`components/matchmaker/RoundControls.tsx` 在回合存在時把目標分數（約 :131-137）與計時（約 :161-168）的變更委派給回合，不寫回設定；畫面顯示的是回合的值（約 :99、:103），但「產生本輪對戰」（約 :311）送出的是設定裡的舊值。例如本輪改成 21 分，下一輪靜默回到 11 分。
   另外目標分數的方向鍵導覽（約 :143）以 `settings.targetScore` 起算，而非畫面選中值；計時的方向鍵早已改以畫面選中值起算（既有 it「計時方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」），目標分數漏了同一個修正。

主 spec `match-stage`「本輪設定控制項的預設值與範圍」「目標分數選擇器」「產生本輪與重設／再排的操作入口」只規範「全新的本輪設定」的預設值與「產生時帶入目前設定」，對「回合存在時設定列應顯示什麼」「離開頁面後是否保留」「回合存在時的變更是否帶到下一輪」**沉默**，因此本 change 以 ADDED Requirement 補上，不 MODIFY 既有 Requirement。

## What Changes

- `nextjs-pickball/lib/matchmaker/round-settings.ts` 新增純函式 `resolveRoundSettings(draft, round)`：由「本次掛載後使用者變更過的設定（未變更為 `null`）」與目前回合解析出設定列應顯示、且「產生本輪對戰」應送出的設定：
  - 沒有回合：變更過則取變更值，否則為 `createRoundSettings()` 的預設值。
  - 有回合：對戰方式與場地數取變更值（未變更過則取回合的）；**目標分數與計時一律取回合的**（與畫面顯示值同源）。
- `app/matchmaker/page.tsx`：`useState` 只保存 `draft`（初始 `null`），傳給 `RoundControls` 與 `EmptyStage` 的設定改為 `resolveRoundSettings(draft, round)`。**不新增任何儲存 key**、不加 effect。
- `components/matchmaker/RoundControls.tsx`：目標分數方向鍵的起算值由 `settings.targetScore` 改為畫面選中值 `displayedTargetScore`（一行）。
- 主 spec `match-stage` 的 ADDED Requirement「本輪設定跟隨目前回合」：五個 unit Scenario、兩個 E2E Scenario。
- 訪客（LocalStorage）與登入（雲端回合）兩種模式行為一致：兩者都經 `useRoundStore` 回傳的 `round`；雲端回合載入中時對戰頁以載入提示取代內容（既有行為），設定列在回合就緒後才出現。

### 明確不做

- 不新增儲存 key、不持久化「使用者變更過但尚未產生」的設定（離開頁面即放棄，見 design Decision 2）。
- 不加產生下一輪前的確認對話框。
- 不處理「回合存在時點『不計時』無反應」的既有缺口（`RoundControls.tsx` 約 :156-163 的暫行處置）；本 change 對它的影響見 design Risks 第 1 條。
- 不改「回合存在時對戰方式／場地數是否可改」的規則（維持可改，改的是下一輪的預備值）。
- 不改後端、不改 `packages/pickball-core`、不改 `hooks/**`、不新增相依、無 migration。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `match-stage`：ADDED「本輪設定跟隨目前回合」。

## Impact

- **前端產品程式碼（三檔）**：
  - `nextjs-pickball/lib/matchmaker/round-settings.ts`：新增 `resolveRoundSettings`（TDD）。
  - `nextjs-pickball/app/matchmaker/page.tsx`：設定狀態改為 `draft` 並以 `resolveRoundSettings` 解析（入口檔，TDD 例外層，以 E2E 驗收）。
  - `nextjs-pickball/components/matchmaker/RoundControls.tsx`：目標分數方向鍵起算值一行（TDD）。
- **測試**：
  - `nextjs-pickball/lib/matchmaker/round-settings.test.ts`：新增 4 個 it（皆真紅：函式尚不存在）。
  - `nextjs-pickball/components/matchmaker/RoundControls.test.tsx`：新增 1 個 it（真紅）。
  - `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`：新增 2 條 test（五個 browser project 各 +2，皆真紅）。
  - 既有 it／test **一行不改**；propose 時查核過既有 E2E 與單元測試，沒有任何斷言依賴「回到對戰頁後設定是預設值」（查核方法見 design Risks 第 4 條），因此**無授權修改的既有測試**。
- **文件**：`nextjs-pickball/CLAUDE.md` 的 matchmaker 段若描述本輪設定的保存方式則同步（propose 時查無此類描述，tasks 記錄查核結果）。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **使用者可見**：離開對戰頁再回來，設定列與舞台上的回合一致；回合存在時改的目標分數與計時，下一輪沿用。
