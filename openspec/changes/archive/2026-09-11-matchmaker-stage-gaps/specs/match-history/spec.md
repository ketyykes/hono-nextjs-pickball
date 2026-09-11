## ADDED Requirements

### Requirement: 損毀歷史紀錄的可見提示

歷史頁 SHALL 在 `readHistory()`（`nextjs-pickball/lib/matchmaker/round-storage.ts`）回傳的 `droppedCount` 大於 0 時，顯示非阻斷的繁體中文提示，告知使用者有歷史紀錄因損毀被略過，且其餘紀錄不受影響，SHALL NOT 靜默處理（`prd.md` 第 11 節）。提示 MUST 不阻斷正常紀錄的瀏覽——合法紀錄仍照常顯示，五個時間區間篩選仍可正常操作。

`droppedCount` MUST 直接取自 `readHistory()` 既有的回傳欄位，SHALL NOT 於本 capability 重複解析 LocalStorage 或另行計算——該欄位在回合與歷史的持久化與損壞降級機制中已存在（`round-storage.ts` 的逐筆降級：外層合法但個別紀錄不合法時保留合法者、捨棄不合法者並回報丟棄筆數），只是此前尚無任何畫面消費它。

提示樣式與文字語彙 MUST 與 `player-roster` capability 既有的損毀提示一致（`nextjs-pickball/app/matchmaker/players/page.tsx` 的 `droppedCount > 0` 區塊）：帶 `role="alert"`，內容為「有 N 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。」，SHALL NOT 另創第二種樣式或語彙——全站對「本機資料損毀」使用同一套視覺與文案，使用者不必重新學習第二種提示的意思。

`droppedCount` 為 0 時 SHALL NOT 顯示任何損毀提示。

實作位於 `nextjs-pickball/components/matchmaker/HistoryView.tsx`。

#### Scenario: 有損毀歷史紀錄時顯示提示

- **WHEN** 開啟歷史頁時 `readHistory()` 回傳的 `droppedCount` 大於 0
- **THEN** 畫面顯示帶 `role="alert"` 的繁體中文提示，內容含損毀筆數且說明其餘紀錄不受影響
- **AND** 合法的歷史紀錄仍正常顯示
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示」

#### Scenario: 沒有損毀歷史紀錄時不顯示提示

- **WHEN** `droppedCount` 為 0
- **THEN** 畫面不出現任何損毀提示
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「沒有損毀歷史紀錄時不顯示損毀提示」
