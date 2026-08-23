## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構與 TDD 流程的現狀與約束。

- **本 change 是 spec backfill，不是新功能**。`prd.md` 4.1.3 的快速分數已完整實作於 `nextjs-pickball/components/matchmaker/PlayerForm.tsx`（`RATING_PRESETS` 三組級別 + `onClick={() => setRatingText(preset.value.toFixed(2))}` + `type="button"`），但 `openspec/specs/player-roster/spec.md` 無任何對應 Requirement。本 change 補的是**規格與測試**，不是行為。
- **`components/matchmaker/` 目前零測試檔**。已有的元件測試在 `components/guide/`（`TocBar`、`PriceStars`、`Section`）、`components/layout/`（`SiteNavbar`）、`components/tour/`，全部是 render-only 斷言；**整個 repo 沒有任何一個測試模擬過使用者點擊**（`grep -rn "userEvent\|fireEvent"` 於 `nextjs-pickball/**` 命中 0 筆）。本 change 會是第一個。
- **`@testing-library/user-event@^14.6.1` 已在 devDependencies 但無人使用**，`@testing-library/react@^16.3.2` 已被既有測試使用。**沒有 `@testing-library/jest-dom`**，因此斷言一律用 `expect(...).toBeTruthy()`／直接比對 DOM 屬性值，**不可**用 `toBeInTheDocument()`。
- **Vitest 環境為 happy-dom**（`nextjs-pickball/vitest.config.ts`），`tests/setup.ts` 只做 `afterEach(cleanup)`。`globals: true` 只在執行期成立——`tsconfig.json` 的 `types` 不含 `vitest/globals`，測試檔**必須顯式** `import { describe, it, expect, vi } from "vitest"`。
- **`PlayerForm` 內含 shadcn/ui 的 `Select`（Radix primitive）**。本 change 的測試只點擊一般 `Button` 與輸入強度分數欄位，**不開啟 Select 下拉**，但元件掛載時 Radix 仍會執行（見 Risks 第一項）。
- **既有 E2E 已間接依賴快速分數**：`tests/e2e/specs/player-roster.spec.ts` 的 helper `addPlayerViaDialog` 點的就是「新手 1.00」，且檔頭註解寫明「用預設強度按鈕而非直接操作 number input，避免各瀏覽器對 `type="color"` / `type="number"` 的 fill 行為差異」。也就是說整份 roster E2E 都建立在這顆按鈕上，卻沒有任何一條斷言保護它。
- **`PlayerForm` 的強度分數是字串 state（`ratingText`）**，送出時才 `Number()` 轉數字。快速帶入寫入的是 `"3.00"` 這個**字串**，這是「填入後仍可手動編輯」得以成立的前提（受控 number input 若存數字，`3.` 這類中繼輸入會被吃掉——該理由已寫在 `PlayerForm.tsx` 的既有註解裡）。

## Goals / Non-Goals

**Goals:**

- 讓 `prd.md` 13.2 的驗收項「可使用新手／中階／高階快速分數」**有規格背書**，archive 後成為 `player-roster` 主 spec 的一部分。
- 讓「改壞了會有測試轉紅」成立：砍按鈕、拿掉 `toFixed(2)`、拿掉 `type="button"`、把標籤與填入值改到對不上，任一項都必須讓測試變紅。
- 在**不偽造紅燈**的前提下完成 TDD 流程，並把「這些測試是 regression guard 而非 RED」誠實寫進 test-plan 與 tasks（root `CLAUDE.md` 的紅燈規則）。
- 與 M3～M9 七個平行 change **零衝突**：只 ADDED 新 Requirement，不碰任何既有 Requirement。

**Non-Goals:**

- 不改變任何既有行為。產品程式碼的預期 diff 是 **0 行**。
- 不重構 `PlayerForm.tsx`（不抽子元件、不把 `RATING_PRESETS` 搬去 `lib/`）——見 Decision 4。
- 不補 `components/matchmaker/` 其餘元件的測試覆蓋。
- 不調整級別數量或分數值（產品決策，需另開 change 並回頭改 `prd.md` 4.1.3）。
- 不建立共用的元件測試基礎建設（不動 `tests/setup.ts`、不裝 `jest-dom`）——見 Risks 第一項的緩解策略。

## Decisions

### Decision 1：這是 spec backfill，用 ADDED 而非 MODIFIED

`openspec/specs/player-roster/spec.md` 現有七條 Requirement，沒有任何一條的主題是「表單如何填入分數」：最接近的「參賽者資料模型」管的是 `rating` 的**定義域**（1.00～8.00、兩位小數、超界即驗證失敗），「參賽者的新增、編輯與刪除」管的是 `addPlayer`／`updatePlayer`／`removePlayer` 三個**純函式**。快速帶入是**表單層的輸入捷徑**，兩者都不涵蓋。

schema 對此有明文指引：「If adding new concerns without changing existing behavior, use ADDED instead」，並警告 MODIFIED 若只貼部分內容會在 archive 時丟失細節。因此本 change 建立一條全新的 `### Requirement: 快速帶入強度分數` 放在 `## ADDED Requirements` 下。

這個選擇同時是**並行安全的關鍵**：M4 與 M6 的 `player-roster` delta 都是 MODIFIED（「參賽者資料模型」與「重置名單與二次確認」），archive 時它們替換既有段落、本 change 追加新段落，三者作用在主 spec 的不同區塊，合併順序不拘。

**替代方案**：(a) 把快速分數塞進「參賽者資料模型」的 MODIFIED —— 否決：那條 Requirement 的主詞是 zod schema 與持久化欄位，塞進 UI 行為會讓它同時管兩件事，且必須整段複製貼上，與 M4 的同一條 MODIFIED **直接撞在同一段文字上**，把零衝突變成必然衝突；(b) 新開一個 `player-form` capability —— 否決：`prd.md` 4.1 整節都是「參賽者」，拆出去會讓 `player-roster` 的 Purpose（「新增／編輯／刪除、出場狀態、雙色漸層、空白初始狀態、重置與持久化」）與實際覆蓋範圍脫節，且 capability 數量膨脹沒有換到任何隔離價值。

### Decision 2：測試放在元件層（`PlayerForm.test.tsx`），不下放到 `hooks/` 或 `lib/`

`nextjs-pickball/CLAUDE.md` 的 TDD 節寫著「**純呈現型元件**不強制單元 TDD（以 Playwright E2E 驗收）；行為邏輯下放 `hooks/`、`lib/` 再對其做 TDD」。本 change 刻意**不**照那條下放，理由有二：

1. **`PlayerForm` 不是純呈現型元件**。它持有 5 個 `useState`、做 zod 驗證、把 zod issue 轉譯成繁中訊息、決定 `colorFrom`／`colorTo` 要不要一起送出。它早就是行為元件，只是一直沒有測試。
2. **要守的行為就在元件邊界上**。`type="button"`（不觸發 submit）與「填入值會出現在輸入框裡」這兩件事，本質是 DOM 行為；把 `RATING_PRESETS` 搬到 `lib/` 只能測到「常數是三組」，測不到「點了會填進去」，也測不到「點了不會送出表單」——而後兩者正是最可能被改壞且最沒人發現的部分。

E2E 則補上「常數確實被接到真實頁面」這一層（Decision 3）。

**替代方案**：(a) 只寫 E2E —— 否決：五個 browser project 各跑一次、需要前後端兩個 server，把「點按鈕會填字」這種毫秒級判斷放進去，回饋迴圈慢上兩個數量級；且 E2E 測不到「`onSubmit` 沒有被呼叫」這類需要 spy 的斷言；(b) 只寫單元測試 —— 否決：`prd.md` 13.2 是給人逐項打勾的驗收清單，需要一條真的走完「開 Dialog → 點快速分數 → 送出 → 卡片顯示 3.00」的證據；(c) 把 `RATING_PRESETS` 搬到 `lib/matchmaker/` 並只測常數 —— 否決：這是為了遷就測試工具而改動產品程式碼，違反本 change「產品程式碼 0 行 diff」的前提，而且測到的東西最少。

### Decision 3：紅燈規則的誠實處理——全數標為 regression guard，嚴禁 mutation check

本 change 的 5 個測試在寫入當下**預期全部直接綠燈**，因為它們描述的行為早在 M1 就實作完成。依 root `CLAUDE.md`：

> **紅燈要是真的**。若某項行為早已實作，先寫測試會直接綠燈 —— 那是 regression guard 不是 TDD，請在 tasks.md 誠實標註，**不要用 mutation check（改斷言看紅再改回）偽造紅燈**。

因此本 change 的處理方式為：

- **test-plan.md 的 `Why first` 欄**：5 列全部寫 `regression guard`，並附一句說明它守的是哪一種改壞方式。
- **tasks.md**：保留 schema 強制的 `RED:` / `GREEN:` 前綴（schema 的 Mandatory structure 明文要求，不自創前綴），但在每個 RED task 的內文明確寫「**預期直接綠燈（regression guard），如實記錄實測輸出**」，並在檔頭放一段總說明。
- **GREEN task 的定位改為「確認既有實作已滿足規格」**，預期為 no-op；task 內文明寫「若 RED 實測為綠，本 task 標註 `skipped` 並貼出綠燈輸出，**不要**為了讓這一行有東西可寫而重構無關程式碼」。
- **若 RED 實測意外為紅燈**，代表實作與本 delta 有出入。此時**以 delta 為準**修正 `PlayerForm.tsx`（此時 GREEN 是真的 GREEN），並在 tasks 該行記錄實際落差——那也意味著 proposal 的「產品程式碼 0 行 diff」預期需要更新。

「明知會綠還是要寫」的價值，在 proposal 的 Why 已量化：目前把 `RATING_PRESETS` 砍成兩組、把 `toFixed(2)` 改成 `String()`、把 `type="button"` 拿掉，整套測試都照樣全綠。這 5 個測試把那三種改法各自變成一次紅燈。

**替代方案**：(a) 用 mutation check 製造紅燈（改斷言 → 看紅 → 改回）—— 明文禁止，且它證明的是「測試會失敗」而非「實作是對的」，兩者不是同一件事；(b) 先把 `RATING_PRESETS` 刪掉、看到紅燈、再把它加回來 —— 同樣是偽造：那是把已通過的實作暫時破壞來表演流程，且中途的 commit 會讓 `main` 上出現一個功能壞掉的狀態；(c) 不寫測試、只補 spec（`seo-metadata-spec-backfill` 當時的作法）—— 否決：那個 change 的對象是 `export const metadata`（靜態物件，改壞了 build 就會有型別錯誤），本 change 的對象是有互動行為的元件，且**現況是零覆蓋**，只補 spec 等於留下一條沒有任何機制保護的規格。

### Decision 4：用 `@testing-library/user-event`，不用 `fireEvent`

`@testing-library/user-event@^14.6.1` 已在 devDependencies（本 change 之前無人使用，**不新增依賴**）。選它的理由：

- v14 的 API 全部回傳 Promise 且**內建 `act()` 包裝**，React 19 下不需要在測試裡手動 `act(...)`（既有的 `useRosterStore.test.tsx` 因為直接呼叫 dispatch 才需要 `act`）。
- `userEvent.click()` 會依序送出 `pointerdown → mousedown → focus → pointerup → mouseup → click`，**因此「按鈕漏標 `type="button"` 會觸發表單送出」這個行為在測試中會如實重現**；`fireEvent.click()` 只送一個 `click`，雖然也會觸發 submit，但對 Radix 這類依賴 pointer 事件序列的元件行為較不真實。
- `userEvent.clear()` + `type()` 能真實重現「使用者把 `1.00` 選起來改成 `4.25`」的流程，而 `fireEvent.change()` 是直接覆寫 value——後者測不出受控元件把中繼輸入吃掉的問題。

**替代方案**：(a) `fireEvent` —— 否決理由如上；(b) 直接呼叫元件的內部 handler —— 否決：`handleSubmit` 等函式未匯出，且那等於繞過本 change 最想守的 DOM 行為（`type="button"`）。

### Decision 5：E2E 只加 1 個 test，並以**選填參數**擴充既有 helper

既有 helper 簽章為 `addPlayerViaDialog(page, name)`，內部固定點「新手 1.00」。新 test 需要點「中階 3.00」（刻意不用「新手 1.00」——它是 helper 的預設值，若新 test 也用它，helper 壞掉與快速分數壞掉會產生同一種紅燈，分不出是哪個壞了）。

作法：把 helper 改為 `addPlayerViaDialog(page, name, presetLabel = "新手 1.00")`，既有 4 個 test 的呼叫端**一字不改**。

**替代方案**：(a) 新 test 自己複製一份 Dialog 操作流程 —— 否決：同一份開 Dialog／填姓名／送出的步驟出現兩份，日後 Dialog 改版要改兩處；(b) 把 helper 改成必填參數 —— 否決：要動既有 4 個 test 的呼叫端，把「零風險追加」變成「碰到既有測試」，也增加與 M5 的文字衝突面積。

## Risks / Trade-offs

- **[`PlayerForm` 內含 Radix `Select`，happy-dom 可能缺 `ResizeObserver`／`hasPointerCapture` 而導致掛載即失敗]** → 本 change 的測試**不開啟下拉**，Radix 的 Popper 與相關 API 只在開啟時才會被觸及，預期不會踩到。若實測掛載即拋錯，緩解方式是**在 `PlayerForm.test.tsx` 檔內**補最小 stub（例如 `globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} }`）並註明原因，**不要**改 `tests/setup.ts`——那是全域測試基礎建設，動它會影響所有既有測試檔，超出本 change 的範圍。

- **[全部 5 個測試都是 regression guard，流程上「沒有真紅燈」]** → 這是本 change 的性質使然，不是偷工。緩解方式是**把它寫在紙上**：test-plan 的 `Why first` 欄逐列標註、tasks 檔頭與各 RED task 內文標註、execution-plan 給 subagent 的 contract 內含「紅燈誠實條款」，讓 apply 階段的 Implementer 與兩位 Reviewer 都拿到同一份說明，不會有人以為自己該去「弄出紅燈」。

- **[「產品程式碼 0 行 diff」可能被 Implementer 當成「可以順手改一點」]** → execution-plan 的「不給」清單明列 `PlayerForm.tsx` 為**唯讀**，Final Code Reviewer 的 checklist 含一條 `git diff --stat` 確認：只有 `PlayerForm.test.tsx`（新增）與 `player-roster.spec.ts`（修改）兩個檔案。

- **[E2E 檔尾端追加 test，可能與同樣動該檔的其他 change 產生 git 文字衝突]** → M5 的 tasks 只**讀取**該檔（檢查有無位置性斷言），目前沒有任何 change 會寫入它。若日後仍發生衝突，語意上兩邊互不重疊，解法固定為「兩邊新增的 test 都保留」。

- **[本 change 是 repo 第一個帶互動的元件測試，可能被當成「元件測試從此變成常態」的先例]** → 本 change **不建立**共用的元件測試 helper、不動 `tests/setup.ts`、不裝 `jest-dom`，把足跡限制在單一測試檔內。`nextjs-pickball/CLAUDE.md` 的「純呈現型元件不強制單元 TDD」仍然有效，本 change 是「行為元件」的個案處理（Decision 2），不是慣例變更。

- **[三個級別的分數寫死在測試裡，日後產品若調整級別會有兩處要改]** → 這是刻意的。斷言若改成從 `RATING_PRESETS` 讀值再比對（`expect(input.value).toBe(preset.value.toFixed(2))`），實作與測試會共用同一個真相來源，把值改錯時測試照樣全綠——那正是本 change 要修的病。測試必須寫死 `1.00`／`3.00`／`5.00` 這三個來自 `prd.md` 4.1.3 的字面值。

## Migration Plan

不適用。無資料結構變更、無 LocalStorage schema 變更、無部署順序要求。archive 時把本 delta 的 `## ADDED Requirements` 追加進 `openspec/specs/player-roster/spec.md` 即可；回滾方式為 `git revert`（只影響一個新增的測試檔與一個既有測試檔）。

## Open Questions

- **是否應在編輯模式下也顯示快速帶入按鈕？** 現況是顯示（`RATING_PRESETS` 的渲染不分 `mode`），本 delta 的 Requirement 沿用現況寫成「新增與編輯參賽者的表單」。若日後認為編輯既有球員時不該出現粗略級距（會覆蓋掉評分引擎算出的精確分數，例如 `4.37` 被一鍵蓋成 `3.00`），需另開 change 調整——屆時是**行為變更**，不是回填。
- **快速分數與 M3 評分引擎的關係**：M3（`matchmaker-rating-engine`）之後 `rating` 會由 `updateRatings` 自動更新，快速分數僅作為**初始估值**的輸入捷徑。`prd.md` 6.4.7 的手動覆蓋由 `updatePlayer` 提供，兩者不衝突。本 change 不預先為此加任何限制。
