# Proposal: round-timer-clear

## Why

對戰頁「本輪設定」的計時控制項在回合存在時，點「不計時」毫無反應：`nextjs-pickball/components/matchmaker/RoundControls.tsx` 的 `handleTimerDurationChange`（約 :161-168）在 `round !== null && durationMinutes === null` 時直接 `return`，程式註解（約 :151-160）自己標明「已知缺口，尚未定案」。原因是核心的 `setTimerDuration`（`packages/pickball-core/src/matchmaker/round.ts` 約 :418）只接受 10／15／20，而主 spec `round-lifecycle`「回合計時器」沒有規定能否把已設定的計時改回不計時。

使用者可見後果：radio 看起來可按、按下去 `aria-checked` 不變也不解釋。尚未 apply 的 `round-settings-follow-round` 讓設定列在回合存在時跟著回合走之後，問題會被放大——只要某一輪設了計時，之後每一輪都沿用，使用者再也沒有辦法改回不計時（以前唯一的辦法是離開頁面讓設定被重置，該 change 會修掉這個「意外的出口」；見其 design Risk 1）。

## What Changes

- 核心 `setTimerDuration(round, durationMinutes)` 的 `durationMinutes` 型別放寬為 `RoundTimerDurationMinutes | null`：`null` 代表取消計時，成功時 `timer` 變為 `null`；鎖定條件（本輪所有場次仍為 `pending`）不變，不另立 `clearTimer` 入口（design Decision 1）。
- 倒數已開始時取消計時仍允許（design Decision 2）。
- `hooks/useRoundStore.ts`、`hooks/useRemoteRoundStore.ts` 的 `setTimerDuration` 參數型別同步放寬（邏輯不變，仍委派純函式；雲端以 `timer: null` 寫入，後端 schema 已接受）。
- `RoundControls.tsx`：`setTimerDuration` prop 型別放寬；回合存在時選「不計時」（點擊或方向鍵）委派 `setTimerDuration(null)`，移除暫行處置與 ⚠️ 註解。鎖定時維持 `disabled` 與既有鎖定說明。
- spec delta：MODIFIED `round-lifecycle`「回合計時器」（完整區塊，補取消計時規範段與七個 Scenario）。`match-stage` 的計時控制項描述與新行為無字面衝突，不動。

### 明確不做

- 計時器的其他行為（倒數、時間到提示音、重排不重置等）。
- 產生下一輪前的確認對話框。
- 設定列跟隨回合／持久化（屬 `round-settings-follow-round`）。
- 不改後端、不新增相依、無 migration、不改 `app/matchmaker/page.tsx`（prop 接線不變）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `round-lifecycle`：MODIFIED「回合計時器」。

## Impact

- **核心套件（一檔）**：`packages/pickball-core/src/matchmaker/round.ts` 的 `setTimerDuration` 簽章與 JSDoc（TDD；其測試依慣例留在 `nextjs-pickball/lib/matchmaker/round.test.ts`）。
- **前端產品程式碼（三檔）**：`nextjs-pickball/hooks/useRoundStore.ts`、`nextjs-pickball/hooks/useRemoteRoundStore.ts`（僅參數型別）、`nextjs-pickball/components/matchmaker/RoundControls.tsx`（handler 與 prop 型別）。
- **後端**：零變更——`PUT /api/matchmaker/round` 以 `RoundPutRequestSchema`（`@pickball/core/api/round`）驗證，`RoundSchema.timer` 為 `RoundTimerObjectSchema.nullable().default(null)`，已接受 `timer: null`。
- **測試**：`round.test.ts` +2、`useRoundStore.test.tsx` +1、`useRemoteRoundStore.test.tsx` +1、`RoundControls.test.tsx` +2、`tests/e2e/specs/round-timer.spec.ts` +2 條（五個 browser project 各 +2）。既有 it／test 一行不改；propose 時查核過沒有既有斷言依賴「回合存在時點不計時無反應」。
- **相依（重要）**：本 change MUST 排在 `round-settings-follow-round` **之後** apply。E2E「取消本輪計時後產生下一輪仍為不計時」需要設定列跟隨回合才會綠（否則設定列仍保有舊的 10 分鐘，下一輪會帶回計時）。若 apply 時該 change 尚未合併進 `main`：停止並上報 coordinator，不得改寫該 E2E 迴避（tasks §1.2）。
- **使用者可見**：回合存在且尚未開始計分時，點「不計時」即可取消本輪計時（含已開始的倒數），下一輪也不再沿用。
