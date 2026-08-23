> **RED 階段的事前承諾**。本檔只列「要先寫哪些測試、斷什麼」，**不描述實作邏輯**。
> apply 階段每次要決定「下一個 RED 寫什麼」都回來讀這份。

## ⚠️ 本 change 的 5 個測試全部是 regression guard

`prd.md` 4.1.3 的快速分數**早在 M1 就已實作**（`nextjs-pickball/components/matchmaker/PlayerForm.tsx` 的 `RATING_PRESETS`），只是從未被寫進 spec、也從未被任何測試斷言。因此下列每一個測試在寫入當下**預期就是綠燈**。

依 root `CLAUDE.md` 的紅燈規則：

- 這是 **regression guard 不是 TDD**，`Why first` 欄逐列如實標註，不美化成「golden path」。
- **嚴禁用 mutation check（改斷言看紅 → 再改回）偽造紅燈**，也不得先刪掉 `RATING_PRESETS` 製造紅燈再加回來。
- apply 時**如實貼出實測輸出**（綠燈就貼綠燈），並在 tasks.md 該行標註 `regression guard`。
- 若某個測試實測**意外為紅燈**，代表實作與 delta spec 有出入 —— 此時以 delta 為準修正 `PlayerForm.tsx`，該 GREEN task 就是真的 GREEN，並在 tasks 記錄實際落差。

「預期會綠」不等於「沒有價值」。現況下把 `RATING_PRESETS` 砍成兩組、把 `toFixed(2)` 換成 `String()`、把 `type="button"` 拿掉，**整套測試依然全綠**；下表每一列都指名它擋的是哪一種改壞方式。

## 測試檔與 Tier 慣例

- **unit**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`（Vitest + happy-dom + `@testing-library/react`）。以 `render(<PlayerForm ... />)` 掛載單一元件並直接對 DOM 斷言，不啟動任何 server、不經 `useRosterStore`、不碰 LocalStorage。這是 `components/matchmaker/` 的第一個測試檔。
- **e2e**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`（Playwright，五個 browser project）。走真實頁面 `/matchmaker/players`，驗「常數確實被接到頁面上、送出後名單卡片顯示該分數」。
- **本 change 無 integration tier**：`PlayerForm` 與 `useRosterStore` 之間的接線由既有的 `useRosterStore.test.tsx` 與 E2E 兩端覆蓋，本 change 不新增中間層。
- **Test name 一律使用中文 it／test 名稱，且必須與 delta spec 的「驗收」錨點逐字一致**——`/opsx:verify` 靠這個做機械核對，改一個字（含全形逗號、波浪號、空格）就對不上。
- **斷言工具限制**：repo **沒有** `@testing-library/jest-dom`，不可用 `toBeInTheDocument()`；一律用 `expect(...).toBeTruthy()`、`expect(input.value).toBe("3.00")` 這類原生比對。
- **測試檔必須顯式** `import { describe, it, expect, vi } from "vitest"`（`tsconfig.json` 的 `types` 不含 `vitest/globals`，省略會讓 `tsc --noEmit` 失敗並被 root Stop hook 擋下）。
- 互動一律用 `@testing-library/user-event`（已在 devDependencies，本 change 是第一個使用者），v14 內建 `act()` 包裝，**不需**手動 `act(...)`（design Decision 4）。

## player-roster

### Requirement: 快速帶入強度分數

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 表單提供新手 1.00、中階 3.00、高階 5.00 三顆快速帶入按鈕 | 三個級別的快速帶入按鈕齊備 | `render(<PlayerForm mode="add" ... />)` → 依可及名稱查得三顆按鈕「新手 1.00」「中階 3.00」「高階 5.00」，三者皆存在；三個字面值直接寫死，不從 `RATING_PRESETS` 反查 | **regression guard**：行為已實作，預期一寫就綠。擋的是「級別被砍掉一組」「標籤只留級別名稱而拿掉分數」「標籤與 `prd.md` 4.1.3 的分數對不上」三種改法——目前這三種都不會讓任何測試變紅 | unit |
| 點擊快速帶入按鈕後強度分數欄位填入該級別的兩位小數分數 | 點擊快速帶入按鈕填入該級別分數 | 點「中階 3.00」→ 強度分數欄位 `value` 為 `"3.00"`；續點「高階 5.00」→ `"5.00"`；再點「新手 1.00」→ `"1.00"`（後點者覆蓋前值） | **regression guard**：預期一寫就綠。擋的是把 `toFixed(2)` 改成 `String(value)`（欄位顯示 `3` 而非 `3.00`）與「按鈕標籤對到錯的值」；連點三顆同時鎖住「覆蓋」而非「累加／忽略」 | unit |
| 快速帶入後仍可手動改為 1.00～8.00 範圍內的兩位小數分數並送出 | 快速帶入後仍可手動輸入任意合法分數 | 點「新手 1.00」→ 清空欄位並輸入 `4.25` → 送出 → `onSubmit`（`vi.fn()`）收到的 `rating` 為 `4.25`，且不等於 `1` | **regression guard**：預期一寫就綠。擋的是把欄位改成唯讀／`disabled`，或把 `rating` 收斂成三選一的封閉清單——`prd.md` 4.1.3 明訂「使用者仍可手動輸入」，這是快速分數**不得**變成限制的唯一保障 | unit |
| 快速帶入按鈕不會觸發表單送出 | 快速帶入按鈕不觸發表單送出 | 姓名留白 → 點「高階 5.00」→ `onSubmit`（`vi.fn()`）呼叫次數為 0，且畫面上 `role="alert"` 的錯誤區塊不存在 | **regression guard**：預期一寫就綠。擋的是漏掉 `type="button"`——表單內按鈕預設是 `submit`，漏標會讓點快速分數直接送出未填妥的表單並跳驗證錯誤。這是本組最隱形的一種改壞：目前的 E2E 因為先填姓名，即使漏標也照樣走得完流程 | unit |
| 以快速分數新增的參賽者，卡片顯示對應強度 | 於名單頁以快速分數新增參賽者 | 於 `/matchmaker/players` 開 Dialog → 填姓名 → 點「中階 3.00」→ 送出 → 名單卡片可見文字含「強度 3.00」，且該參賽者姓名可見 | **regression guard**：預期一寫就綠。這是 `prd.md` 13.2「可使用新手／中階／高階快速分數」唯一的端到端證據；刻意用「中階 3.00」而非 helper 預設的「新手 1.00」，讓 helper 壞掉與快速分數壞掉產生**可區分**的紅燈（design Decision 5） | e2e |
