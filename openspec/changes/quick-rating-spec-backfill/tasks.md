> ## ⚠️ 讀這段再開始：本 change 的 6 個 task 全部預期綠燈
>
> `prd.md` 4.1.3 的快速分數**早在 M1 就實作完成**（`nextjs-pickball/components/matchmaker/PlayerForm.tsx`
> 的 `RATING_PRESETS`），只是從未寫進 spec、也從未被任何測試斷言。因此下列每個 `RED:` task
> 寫進去的測試，**在寫入當下預期就是綠燈**——那是 **regression guard 不是 TDD**。
>
> 依 root `CLAUDE.md` 的紅燈規則：
>
> - **如實記錄**：跑測試、貼出實測輸出，綠燈就寫綠燈，並在該行末標註 `regression guard`。
> - **嚴禁偽造紅燈**：不得改斷言看紅再改回（mutation check），也不得先刪掉 `RATING_PRESETS`
>   或 `type="button"` 製造紅燈再加回來。
> - `RED:` 前綴是 schema 強制的 task 命名格式（Mandatory structure），**保留前綴不代表宣稱看到紅燈**；
>   真正的狀態以該行記錄的實測輸出為準。
> - **若實測意外為紅燈**：代表實作與 delta spec 有出入。以 spec 為準修正 `PlayerForm.tsx`
>   （此時對應的 GREEN 是真的 GREEN），並在該行明確記錄落差——同時要回頭更新 `proposal.md`
>   的「產品程式碼預期 0 行 diff」。
>
> ## GREEN task 在本 change 的定位
>
> 每個 GREEN task 都是「**確認既有實作已滿足該批斷言**」，預期為 **no-op**。
> 若對應的 RED 實測全綠，該 GREEN 標註 `skipped` 並把綠燈輸出記錄在該行，
> **不要**為了讓這一行有東西可寫而重構無關的程式碼（本 change 明訂不重構 `PlayerForm.tsx`）。
>
> ## 檔案權限
>
> - **新增**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`
> - **修改**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`
> - **唯讀**：`nextjs-pickball/components/matchmaker/PlayerForm.tsx`（唯一例外見上方「若實測意外為紅燈」）
> - **禁止修改**：`tests/setup.ts`、`vitest.config.ts`、`package.json`、`lib/**`、`hooks/**`、`app/**`、
>   `components/matchmaker/` 其餘元件、`openspec/specs/` 下的主 spec
>
> ## 指令
>
> - 單檔（unit）：`pnpm --filter ./nextjs-pickball test --run components/matchmaker/PlayerForm.test.tsx`
> - 單檔（e2e）：`pnpm --filter ./nextjs-pickball test:e2e tests/e2e/specs/player-roster.spec.ts`
> - **`--run` 前不可加 `--`**——加了會讓 vitest 收不到路徑而跑完整套。
> - it／test 名稱必須與 delta spec 的「驗收」錨點**逐字一致**，否則 `/opsx:verify` 無法機械核對。

## 1. PlayerForm 快速帶入強度分數（unit）

> 全部四個 it 寫在同一個新檔 `nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`。
> 這是 `components/matchmaker/` 的第一個測試檔，也是本 repo 第一個模擬使用者點擊的元件測試。
>
> ⚠️ **共通約定（兩個 RED task 都適用）**：
> - 互動一律用 `@testing-library/user-event`（已在 devDependencies，`await` 每次呼叫；v14 內建
>   `act()` 包裝，**不要**再手動 `act(...)`）。
> - 強度分數輸入框以 `getByLabelText("強度分數")` 取得（`PlayerForm` 用 `useId()` + `htmlFor` 建立
>   關聯），**不要**用 `container.querySelector("input")`——那會抓到姓名或兩個 `type="color"` 的其中之一。
> - 期望值一律寫**死字面值**（`"1.00"`、`"3.00"`、`"5.00"`、`4.25`），**不得**寫成
>   `preset.value.toFixed(2)` 或從 `RATING_PRESETS` 反查——共用同一個真相來源會讓「值被改錯」照樣全綠。
> - `onSubmit`／`onCancel` 用 `vi.fn()`；四個 it 共用同一個 render helper 與 props fixture。
> - 顯式 `import { describe, it, expect, vi } from "vitest"`（`tsconfig` 的 `types` 不含 `vitest/globals`）。
> - repo **沒有** `@testing-library/jest-dom`：用 `expect(...).toBeTruthy()`、`expect(input.value).toBe("3.00")`，
>   **不可**用 `toBeInTheDocument()`。
> - 若元件在 happy-dom 掛載即拋錯（Radix `Select` 相關），把最小 stub 寫在**本測試檔內**並加繁中註解，
>   **不要**改 `tests/setup.ts`（design Risks 第 1 項）。

- [ ] 1.1 RED: 新增 `nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，寫入兩個 it：
  - 「表單提供新手 1.00、中階 3.00、高階 5.00 三顆快速帶入按鈕」——以 `mode="add"` 掛載，依可及名稱查得三顆按鈕「新手 1.00」「中階 3.00」「高階 5.00」，三者皆存在
  - 「點擊快速帶入按鈕後強度分數欄位填入該級別的兩位小數分數」——點「中階 3.00」後 `getByLabelText("強度分數")` 的 `value` 為 `"3.00"`；續點「高階 5.00」→ `"5.00"`；再點「新手 1.00」→ `"1.00"`（驗證後點者**覆蓋**前值）
  跑單檔並**如實貼出實測輸出**。⚠️ **預期直接綠燈（regression guard）**，請照實記錄，不得偽造紅燈
- [ ] 1.2 GREEN: 確認 `PlayerForm.tsx` 既有的 `RATING_PRESETS`（三組 `{ label, value }`）與 `onClick={() => setRatingText(preset.value.toFixed(2))}` 已滿足 1.1 的兩個 it，**預期為 no-op**。若 1.1 實測全綠，本行標註 `skipped` 並貼上綠燈輸出；若 1.1 出現紅燈，依 delta spec 的「三顆按鈕齊備」與「以兩位小數填入、後點者覆蓋」兩個 Scenario 做**最小**修正，並記錄實際落差
- [ ] 1.3 RED: 於同檔補兩個 it：
  - 「快速帶入後仍可手動改為 1.00～8.00 範圍內的兩位小數分數並送出」——點「新手 1.00」→ `clear()` 強度分數欄位 → `type("4.25")` → 填入姓名 → 點送出鈕 → 斷言 `onSubmit` 收到的物件 `rating` 為 `4.25`（且不等於 `1`）
  - 「快速帶入按鈕不會觸發表單送出」——**姓名留白**，只點「高階 5.00」→ 斷言 `onSubmit` 的呼叫次數為 `0`，且畫面上 `role="alert"` 的錯誤區塊**不存在**（`queryByRole("alert")` 為 `null`）
  跑單檔並**如實貼出實測輸出**。⚠️ **預期直接綠燈（regression guard）**，請照實記錄，不得偽造紅燈
- [ ] 1.4 GREEN: 確認 `PlayerForm.tsx` 既有的 `ratingText` 字串 state（受控 `Input`，使用者可繼續編輯）與快速帶入按鈕的 `type="button"` 已滿足 1.3 的兩個 it，**預期為 no-op**。若 1.3 實測全綠，本行標註 `skipped` 並貼上綠燈輸出；若出現紅燈，依 delta spec 的「快速帶入後仍可手動輸入任意合法分數」與「快速帶入按鈕不觸發表單送出」兩個 Scenario 做**最小**修正，並記錄實際落差

## 2. 名單頁端到端驗收（e2e）

Depends on: §1

> 修改既有檔 `nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`：**追加**一個 test，
> 並把既有 helper `addPlayerViaDialog(page, name)` 擴充為
> `addPlayerViaDialog(page, name, presetLabel = "新手 1.00")`——**既有 4 個 test 的呼叫端一字不改**
> （design Decision 5）。
>
> ⚠️ 新 test 刻意用「中階 3.00」而非 helper 預設的「新手 1.00」：若兩者用同一顆按鈕，
> 「helper 壞掉」與「快速分數壞掉」會產生同一種紅燈，分不出是哪個壞了。
>
> 新 test 沿用該檔既有慣例：`beforeEach` 只 `removeItem("matchmaker:roster:v1")`（**不可** `clear()`）、
> 用 `trackConsoleIssues(page)` 收集 console error／warning 並在結尾斷言為空陣列。
> 卡片的強度顯示格式為 `{性別} · 強度 {rating.toFixed(2)}`（見 `PlayerCard.tsx`），
> 斷言用 `page.getByText("強度 3.00")` 這類子字串比對即可。

- [ ] 2.1 RED: 於 `tests/e2e/specs/player-roster.spec.ts` 追加 test「以快速分數新增的參賽者，卡片顯示對應強度」——`goto` `/matchmaker/players` → 開新增 Dialog → 填姓名 → 點「中階 3.00」→ 送出 → 斷言名單出現該姓名且可見文字含「強度 3.00」，並斷言 `consoleIssues` 為空。同時把 helper 的 `presetLabel` 選填參數加上。跑單檔 e2e 並**如實貼出實測輸出**。⚠️ **預期直接綠燈（regression guard）**，請照實記錄，不得偽造紅燈
- [ ] 2.2 GREEN: 確認 `/matchmaker/players` 既有流程（`PlayerForm` 快速帶入 → `useRosterStore.addPlayer` → `PlayerCard` 顯示 `rating.toFixed(2)`）已滿足 2.1，**預期為 no-op**。若 2.1 實測全綠，本行標註 `skipped` 並貼上綠燈輸出；若出現紅燈，先確認是否為 dev server／service binding 的環境問題（見 `environment.md` 的注意事項與 root `CLAUDE.md` 的 port 診斷順序），排除環境因素後才依 delta spec 的「於名單頁以快速分數新增參賽者」Scenario 做最小修正

## REFACTOR

**全數 skipped，理由：本 change 不新增任何產品程式碼**（`PlayerForm.tsx` 唯讀、預期 0 行 diff），沒有可重構的實作。測試檔本身的重複（render helper、props fixture）在 1.3 寫入第二批 it 時就地共用同一份，不另立 REFACTOR task——這一點由 execution-plan 的 Stage 2 checklist「測試資料由單一 fixture／helper 產生」把關。

若 apply 過程中因「RED 實測意外紅燈」而實際修改了 `PlayerForm.tsx`，請在此節補一個 REFACTOR task 並走 Stage 2 審查。
