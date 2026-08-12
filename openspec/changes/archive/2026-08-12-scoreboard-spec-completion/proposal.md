## Why

`scoreboard` 是五份 capability spec 中唯一 **`openspec validate` 失敗**的一份，也是唯一
**零檔案路徑錨點**的一份。這兩件事有同一個根因：這份 spec 只寫了 Scenario，沒寫 Requirement 本文。

實測：

```
DO_NOT_TRACK=1 openspec validate --all   → Totals: 4 passed, 1 failed
grep -c "SHALL\|MUST" openspec/specs/scoreboard/spec.md        → 0
grep -c "nextjs-pickball" openspec/specs/scoreboard/spec.md    → 0
```

7 條 Requirement 中有 6 條在 heading 之後直接接 Scenario，完全沒有規範性本文；
唯一有本文的「計分規則」也缺少 SHALL/MUST 關鍵字。對照組：tour spec 提及檔案路徑 17 次、quiz spec 3 次。

後果是這份 spec 只能描述「會發生什麼」，無法表達「為什麼必須這樣」與「在哪裡實作」。
Undo 為何要用 replay 而非反向運算、提示橫幅為何用 sessionStorage 而非 localStorage、
按鈕為何要永遠佔位 —— 這些設計理由目前只存在於程式碼裡，一次重構就會消失。

另有一塊完整功能沒有專屬 Requirement：**賽前設定（`ScoreboardSetup`）**。
`SET_MODE` / `SET_FIRST_SERVER` 的階段鎖定與「重置需二次確認」都已實作、
且 `reducer.test.ts` 與 E2E 已有 8 個對應的測試案例，但 spec 全文沒提過 `ScoreboardSetup` 一次。

> 措辭precision：原稽核寫「spec 零覆蓋 setup/RESET」屬過度陳述。
> spec `:59` 已提到「status 回到 setup」、`:72` 已提到 dispatch RESET。
> 正確說法是「**無專屬 Requirement**，且 `ScoreboardSetup.tsx` 在 spec 中零提及」。

## What Changes

- **7 條 Requirement 全部補上規範性本文**，每條第一行即含 SHALL/MUST
  - ⚠️ openspec 的關鍵字檢查**只看 Requirement 的第一行**（change ① 實測發現），
    第二行才出現 SHALL 仍會判 ERROR
- **本文同時承載設計理由**，不只是把 Scenario 改寫一次：
  - Undo 為何必須 replay（side-out 與 serverNumber 轉移不可逆推）
  - 提示橫幅為何用 sessionStorage（方向偏好不該跨分頁持久保留）
  - Toast 為何只在分數未變時顯示（避免與分數大字資訊重複）
  - 版面穩定性為何是功能需求（快速連點介面的位移會造成誤觸）
  - 全螢幕按鈕為何在不支援時隱藏（不顯示按了沒反應的控制項）
- **新增 Requirement「賽前設定與階段鎖定」**，涵蓋 mode / firstServer 切換、
  playing 與 finished 的鎖定、重置的二次確認與保留欄位
- **補檔案路徑與測試錨點**：每條 Requirement 標明實作檔，14 個 Scenario 附上
  既有的 `reducer.test.ts` it 名稱或 E2E test 名稱
- **修正 `aria-disabled` 誤述**：spec `:64` 稱 Undo 停用以 `aria-disabled` 表達，
  實作 `ActionBar.tsx:27` 用的是原生 `disabled` prop；全 repo 無元件輸出 `aria-disabled`

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `scoreboard`：7 條 MODIFIED（全部補規範性本文與錨點）+ 1 條 ADDED（賽前設定與階段鎖定）

## Impact

- **受影響檔案**：僅 `openspec/specs/scoreboard/spec.md`（archive 時由 delta 套用）
- **程式碼變更**：**零**。本 change 不新增、不修改任何 `.ts` / `.tsx` / `.css`
- **測試變更**：**零**。所有引用的 it 名稱皆為既有測試，已逐一 grep 確認存在
- **驗收硬門檻**：`DO_NOT_TRACK=1 openspec validate --all` → `Totals: N passed, 0 failed`
  這是本批 8 個 change 中唯一有客觀 exit code 可驗收的一個
- **風險**：極低。純文字，且不動任何既有 Scenario 的 WHEN/THEN 語意
- **明確不做**
  - 不補任何新測試 —— `reducer.test.ts:29/37/46/52/61/67/138` 與
    `scoreboard.spec.ts:58` 已完整覆蓋 setup 與 RESET，重複補只會製造冗餘
  - 不改 `ActionBar.tsx` 的 `disabled` 為 `aria-disabled` —— 原生 `disabled` 才是正確做法，
    要修的是 spec 不是實作
