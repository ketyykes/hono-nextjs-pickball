## Context

shadcn 的 `SelectContent` 預設 `position = "item-aligned"`（`nextjs-pickball/components/ui/select.tsx:56`），這是 Radix Select 的原生行為：展開時移動面板，使**目前選中項**對齊觸發器位置。

```
選中第一項（雙打）                選中第二項（單打）
┌──────────┐ ← 觸發器            ┌──────────┐
│ 雙打  ✓  │                     │ 雙打     │ ← 上移一格，撞進 navbar
│ 單打     │                     ├──────────┤ ← 觸發器
└──────────┘                     │ 單打  ✓  │
   面板向下                        └──────────┘
```

計分板的設定列緊貼在 navbar 下方（`Scoreboard.tsx` 外層 `pt-(--site-nav-h)`），觸發器 top 約 67px、navbar bottom 為 56px，僅有 11px 間隙。選中第二項時面板上移約 33px，上緣落到 34 附近，被 navbar 覆蓋。

### 模組的 TDD 歸屬

| 模組 | 歸屬 | 驗收方式 |
|---|---|---|
| `components/scoreboard/ScoreboardSetup.tsx` | 例外層（純呈現型元件） | Playwright E2E |
| `tests/e2e/specs/scoreboard.spec.ts` | 例外層（測試基礎建設） | 不強制三步 |

本 change 不涉及任何行為邏輯模組，因此無 TDD 三步要求。

## Goals / Non-Goals

**Goals:**

- 兩個下拉選單展開時，所有選項皆完整可見、不被 navbar 或其他元素遮擋。
- 建立自動化驗收，使此類「純視覺遮擋」缺陷日後能被測出。

**Non-Goals:**

- 修改 `components/ui/select.tsx`。它是 shadcn 原生元件，專案慣例為不自行修改結構、更新走 shadcn CLI。
- 改變設定列的位置、高度或 navbar 的 z-index。
- 全站其他 `Select` 使用處的定位模式（本 change 只處理計分板設定列；其他頁面的 Select 未緊貼 navbar，不受此問題影響）。

## Decisions

### Decision 1：在使用端傳 `position="popper"`，不動 shadcn 元件

`SelectContent` 已接受 `position` prop 並在 `popper` 模式下套用對應的位移與尺寸變數（`select.tsx:66-84`），因此使用端傳入即可，無需改動原生元件。

`popper` 模式的行為：面板固定在觸發器**下方**展開（空間不足時自動翻轉到上方），並帶碰撞偵測。選中項不再影響面板位置，第二項被遮的情況因此消失。

**替代方案**：
- 改 `select.tsx` 的預設值為 `popper` —— 會影響全站所有 Select，且違反「不修改 shadcn 原生元件」的專案慣例。
- 提高 `SelectContent` 的 z-index 蓋過 navbar —— 面板仍會超出設定列往上跑，視覺上浮在 navbar 之上更怪，且不解決極端情況下溢出視口頂端的問題。
- 調整設定列位置或 navbar 高度 —— 動到與此問題無關的版面骨架，影響面大得多。

### Decision 2：驗收改測「面板上緣 vs navbar 下緣」，而非依賴點擊成功

既有 80 個 E2E 全綠卻沒抓到此缺陷，原因是 Playwright 的 `.click()` 會自動捲動並只在 pointer events 真被攔截時失敗。面板被遮住一半時選項仍可點擊，功能測試因此無感。

新增的驗收 MUST 直接比較幾何：展開後量測 `[role="listbox"]` 的 `top` 與 navbar 的 `bottom`，斷言前者不小於後者。這與「核心按鈕不得被其他元素遮蔽」Scenario（`scoreboard-target-score` 引入）是同一類思路 —— **可互動 ≠ 可見**，兩者要分別驗收。

## Risks / Trade-offs

- **[popper 模式下面板可能遮住觸發器下方的內容]** → 面板本來就是浮層，展開時覆蓋下方內容是預期行為；且面板關閉後即恢復。實測面板 top=99、bottom=169，落在分數面板的空白區，不影響操作。
- **[空間不足時 popper 會自動翻轉到上方，可能再次接近 navbar]** → 計分板設定列下方有整片分數面板區域（視口高度的絕大部分），不會觸發翻轉。極端矮視口（如 320x568）本就不在支援範圍（見 `scoreboard` spec 的「RWD 排版」Requirement）。
- **[只修計分板、未掃全站]** → 其他頁面的 Select 未緊貼 navbar，無此問題。若日後有新的 Select 置於視口頂端，需自行評估；本 change 的 Scenario 已記錄判準。

## Migration Plan

無資料、無 API、無部署順序相依。純前端呈現變更，使用者無需任何動作。

回滾即還原兩個 prop，行為回到現況（有遮擋但功能正常）。

## Open Questions

無。
