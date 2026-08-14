> 所有指令皆從 repo root 執行。`--run` 前**不可**加 `--`。

## 1. 修復（例外層 — 純呈現型元件，以 E2E 驗收）

- [x] 1.1 `components/scoreboard/ScoreboardSetup.tsx` 的兩個 `SelectContent` 加上 `position="popper"`，並附註解說明 `item-aligned` 為何會被 navbar 遮擋（含實測數值）
  - **不修改** `components/ui/select.tsx` —— shadcn 原生元件，`SelectContent` 本身已接受 `position` prop

## 2. 驗收（例外層 — 不強制三步）

- [x] 2.1 於 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts` 新增 test「下拉選單展開時不被 navbar 遮擋」——分別對「比賽形式」與「先發球方」：先選到第二個選項、再次展開，量測 `[role="listbox"]` 的 `top` 與 navbar 的 `bottom`，斷言 `listboxTop >= navbarBottom`
  - ⚠️ **不可改用「點得到就算過」的驗收方式**：面板被遮一半時選項仍可點擊，Playwright 的 `.click()` 會照常通過。必須直接比較幾何座標（見 delta spec 的 Scenario 理由）
- [x] 2.2 執行 `pnpm --filter ./nextjs-pickball exec playwright test tests/e2e/specs/scoreboard.spec.ts --reporter=line` 全數通過（現況 80 passed，加新 test 後應為 85）
- [x] 2.3 `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 與 `pnpm lint` 通過

## 3. 收尾

- [x] 3.1 `DO_NOT_TRACK=1 openspec validate scoreboard-select-popper` 通過
- [x] 3.2 `/opsx:verify` 三維度驗證通過

---

### 實作狀態誠實標註

**1.1 的程式碼修改在本 change 建立之前即已完成**（使用者回報 bug 後先行修復並驗證，再回頭補提案）。當時已完成的驗證：

- 實測修復前後：面板 `top` 由 **33.8 → 99**，navbar `bottom` 為 56，脫離遮擋範圍
- 截圖確認兩個選項完整可見
- 既有 E2E 80 passed、`tsc` 無錯誤、`lint` 0 errors

此順序不符合「先提案後實作」的常規流程，記錄於此以免日後追溯時誤判。第 2 節的 E2E 驗收尚未撰寫，是本 change 真正待完成的部分。
