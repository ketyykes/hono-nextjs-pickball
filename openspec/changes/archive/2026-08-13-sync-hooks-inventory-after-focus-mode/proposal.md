## Why

commit `4c5b724`（計分板專注模式）新增了 `nextjs-pickball/hooks/useFocusMode.ts`，並正確地在
`openspec/specs/scoreboard/spec.md:169` 聲明它屬 scoreboard capability。

但 `nextjs-pickball/hooks/` 這個目錄是**多個 capability 共用**的，而它的跨 capability 歸屬清單
維護在 `pickleball-guide-page` 規格裡。該處沒有同步，於是產生單邊失真：

| 位置 | 現況寫的 | 實際 | 性質 |
|---|---|---|---|
| `openspec/specs/pickleball-guide-page/spec.md:139` | 其餘 hook 清單列 6 支，**無 `useFocusMode`** | 該 hook 存在且歸 scoreboard | 規格與現況矛盾 |
| `openspec/specs/pickleball-guide-page/spec.md:203` | 「目錄下另有 **6 支**」 | 7 支 | 規格與現況矛盾 |
| `nextjs-pickball/CLAUDE.md:65` | 「`hooks/` — 共 **9 支**」 | 10 支 | 文件過期 |
| `nextjs-pickball/README.md:48` | 「**9 支** hooks + tests」 | 10 支 | 文件過期 |

實測（`ls nextjs-pickball/hooks/*.ts | grep -v '\.test\.'`）為 **10 支**：
`useEnterAnimationProgress`、`useFocusMode`、`useFullscreen`、`useOrientation`、`useQuiz`、
`useReducedMotion`、`useScoreboardStore`、`useScrolledPast`、`useScrollShadow`、`useScrollSpy`。

這不是 `4c5b724` 的實作有問題，而是**共用目錄的規格歸屬缺少雙向同步的約定** ——
新增方只更新了自己的 capability，沒人規定它要回頭更新清單的維護方。

## What Changes

**本 change 不改動任何程式碼。**

1. `pickleball-guide-page` 的 hook 歸屬清單補上 `useFocusMode` → scoreboard
2. 同一條 Requirement 明訂：該清單是 `nextjs-pickball/hooks/` 跨 capability 分工的**單一來源**，
   其他 capability 於該目錄新增 hook 時，其 change SHALL 一併更新此清單 ——
   把這次漏更新的根因寫成規則，而不只是補一個名字
3. 拆檔結構 Requirement 的「另有 6 支」去數字化，改為指向上述清單
   （沿用 `2026-08-13-tour-scene-spec-cleanup` 對 `dev-workflow` 的同一判準：
   會隨他人增修而變動的數量不該寫死在規格裡）
4. 同步 `nextjs-pickball/CLAUDE.md` 與 `nextjs-pickball/README.md` 的 hooks 敘述

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `pickleball-guide-page`：2 條 MODIFIED（hook 歸屬清單補 `useFocusMode` 並訂立單一來源規則、拆檔結構的 hook 數量去數字化）

## Impact

- **受影響檔案**
  - spec：`openspec/specs/pickleball-guide-page/spec.md`
  - 文件：`nextjs-pickball/CLAUDE.md`、`nextjs-pickball/README.md`
  - 程式碼：**無**
- **測試影響**：無。本 change 不新增也不修改任何測試
- **風險**：低。純文字變更
- **明確不做**
  - **不動** `openspec/specs/scoreboard/spec.md` —— 它對 `useFocusMode` 的宣告是正確且完整的，
    漏的是清單維護方那一側
  - **不竄改** `changes/archive/` 下 `4c5b724` 對應的 change —— archived delta 是歷史快照
  - 不為 `useFocusMode` 在 `pickleball-guide-page` 補測試錨點 —— 它的驗收屬 scoreboard capability，
    已在 `scoreboard/spec.md:181-202` 有四條 `useFocusMode.test.ts` 的 it 錨點
