# Design: round-timer-clear

## Context

- 計時的狀態轉換在 `packages/pickball-core/src/matchmaker/round.ts`：`setTimerDuration`（約 :418，鎖定＝任一場次 `status !== "pending"`，成功時產生全新 `timer`、`startedAt` 為 `null`）與 `startTimer`（約 :464）。主 spec 仍寫舊路徑 `nextjs-pickball/lib/matchmaker/round.ts`（模組已搬入核心套件），本 change 不更正該路徑字樣，以免擴大 MODIFIED 範圍。
- 兩個 store 都委派同一個純函式：`hooks/useRoundStore.ts`（約 :350）與 `hooks/useRemoteRoundStore.ts`（約 :498，成功後 `commit` 並在衝突重套時再呼叫一次純函式）。
- UI：`RoundControls.tsx` 的 `handleTimerDurationChange`（約 :161）在回合存在時遇到 `null` 直接 `return`；方向鍵 `handleTimerKeyDown` 也走同一個 handler。鎖定由 `isTargetScoreLocked` 決定、`locked` 時 radio `disabled`。
- 倒數顯示由 `hooks/useRoundTimer.ts` 依 `round.timer` 推導（`timer?.startedAt ?? null`），`timer` 為 `null` 時沒有倒數；「開始計時」按鈕以 `canStartTimer` 推導。
- 後端 `PUT /api/matchmaker/round` 以核心 `RoundSchema` 驗證，`timer` 可為 `null`。

## Goals / Non-Goals

**Goals**：回合存在且未鎖定時，「不計時」能把本輪 `timer` 設回 `null`（含已開始的倒數）；訪客與雲端行為一致。

**Non-Goals**：計時器其他行為、產生下一輪前的確認對話框、設定列跟隨回合（`round-settings-follow-round`）、更正主 spec 舊路徑字樣、後端變更。

## Decisions

### Decision 1：放寬 `setTimerDuration` 接受 `null`，不新增 `clearTimer`

- **選擇**：`setTimerDuration(round, durationMinutes: RoundTimerDurationMinutes | null)`；`null` 時回傳 `{ ...round, timer: null }`，否則維持現行全新 `timer`。鎖定檢查、失敗代碼與訊息完全沿用。
- **替代方案**：新增 `clearTimer(round)` 純函式與對應的 store 方法、`RoundControls` prop、`page.tsx` 接線（coordinator 原建議）。
- **理由**：`RoundControls` 尚無回合時本來就把 `null` 當成合法計時選項（`timerDurationMinutes: RoundTimerDurationMinutes | null`），回合存在時以同一個值域委派最直觀；新增入口要複製一份鎖定判定（spec 明訂 SHALL NOT 另立第二個判定），且多動 `page.tsx` 與兩個 store 的回傳介面，檔案數與風險都較高。放寬後兩個 store 只需改參數型別，衝突重套邏輯自動適用。

### Decision 2：倒數已開始時仍允許取消

- **選擇**：允許；取消即清除整個 `timer`。
- **替代方案**：已開始時拒絕（回傳 `already-started` 之類失敗）。
- **理由**：現行 `setTimerDuration` 在倒數已開始時本就允許改長度（並重置 `startedAt`），取消與之一致；開始計時與比分無關，主持人可能按錯。收尾：倒數與「開始計時」按鈕都由 `round.timer` 推導，`timer` 為 `null` 時自然消失；時間到提示音只在倒數到期時觸發，無倒數即不觸發——apply §1.3 以讀碼確認 `useRoundTimer`／`round-timer-sound.ts` 對 `timer` 由非 `null` 變 `null` 不殘留狀態，若殘留則停止並上報（屬範圍變更）。

### Decision 3：UI 只移除暫行處置

- **選擇**：`handleTimerDurationChange` 回合存在時一律 `commitTimerDuration(durationMinutes)`（含 `null`）；刪除 ⚠️ 暫行處置註解，改寫為一句說明「`null` 代表取消本輪計時、鎖定由純函式與 `locked` 共同守住」。點擊與方向鍵同走此 handler，故兩條路徑一次修好。
- **替代方案**：回合存在時 disable「不計時」並說明原因。
- **理由**：使用者要的是能改回不計時；disable 只是把缺口講清楚，問題仍在，且在 `round-settings-follow-round` 之後會讓計時永久沿用。

### Decision 4：spec 只 MODIFIED `round-lifecycle`

- **選擇**：在「回合計時器」完整區塊內補一段取消計時規範（含 UI 委派一句）與七個 Scenario；`match-stage` 不動。
- **替代方案**：另在 `match-stage` MODIFIED 計時控制項段落。
- **理由**：`match-stage` 只規範選項清單、鎖定共用判定與鎖定時 disabled，與新行為無字面衝突；`round-settings-follow-round` 正以 ADDED 改 `match-stage`，避開同一檔可減少 archive 時的合併衝突。

## Risks / Trade-offs

- [Risk 1] 相依順序：E2E「取消本輪計時後產生下一輪仍為不計時」依賴 `round-settings-follow-round` 的 `resolveRoundSettings`。→ tasks §1.2 確認 `main` 已含該 change；未合併則停止上報，不改寫測試迴避。
- [Risk 2] 型別放寬的連鎖：`SetTimerDurationResult` 與 store 回傳型別不變，但 `RoundControls` 的 `setTimerDuration` prop 與兩個 store 的參數型別要同步放寬，否則 `tsc` 紅。RED 測試傳 `null` 本身就是型別錯誤 → RED 與 GREEN 必須在同一張派工單內完成（Stop hook）。
- [Risk 3] 雲端衝突重套：`useRemoteRoundStore` 重套時再呼叫 `setTimerDurationPure(round, null)`；若遠端回合已開始計分則重套失敗、回傳 `null` 放棄寫入（既有行為），不需新邏輯。
- [Risk 4] 主 spec 舊路徑字樣（`nextjs-pickball/lib/matchmaker/round.ts`）仍不正確，非本 change 範圍。

## Migration Plan

無資料轉換：`timer: null` 本就是合法的既有資料形狀。回退＝還原四個產品檔。

## Open Questions

（無）
