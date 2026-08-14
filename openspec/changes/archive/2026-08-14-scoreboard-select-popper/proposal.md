## Why

計分板設定列的兩個下拉選單（比賽形式、先發球方）展開時，若目前選中的是第二個選項，選單面板會上移使選中項對齊觸發器，導致面板上緣壓進 navbar、第一個選項被遮掉一半。使用者實際操作「切換單打／雙打」時回報看不到「雙打」。

實測（1280x800，選中「單打」後再次展開）：

| 版本 | 面板 top | navbar bottom | 是否被遮 |
|---|---|---|---|
| `9f17d45`（`scoreboard-target-score` 之前） | 34.6 | 56 | 是 |
| `97f5a4e`（該 change 完成後） | 33.8 | 56 | 是 |

**此為既有缺陷，非 `scoreboard-target-score` 引入**：該 change 將設定列容器 `py-3` 改為 `py-2`（為面板騰出高度預算），使遮擋惡化 0.8px，但根因是 shadcn `SelectContent` 的預設定位模式，自計分板首版即存在。

既有的 80 個 E2E 測試全數通過卻沒抓到這個缺陷 —— Playwright 的 `.click()` 會自動處理捲動與可視性，只有在元素真被攔截 pointer events 時才失敗；「選單被上方元素蓋住一半」是純視覺缺陷，功能上仍可點選，因此測不出來。

## What Changes

- 兩個 `SelectContent` 改用 `position="popper"`，使面板固定在觸發器下方展開並啟用碰撞偵測，不再依選中項位置上移。
- **不修改** `nextjs-pickball/components/ui/select.tsx` —— 該檔為 shadcn 原生元件，專案慣例是不自行修改其結構、更新走 shadcn CLI；`SelectContent` 本身已接受 `position` prop，在使用端傳入即可。
- 新增 E2E 驗收：下拉展開後，面板上緣 MUST 位於 navbar 下緣之下。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `scoreboard`: 「賽前設定與階段鎖定」Requirement 新增一項下拉選單不得被遮擋的約束與對應 Scenario。

## Impact

**程式碼**：`nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx`（兩處 `SelectContent` 各加一個 prop 與說明註解）。

**測試**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts` 新增一個 test。

**無影響**：計分邏輯、持久化、版面高度預算、其他 capability。此變更只影響下拉面板的展開位置，不改變任何選項的值或互動語意。
