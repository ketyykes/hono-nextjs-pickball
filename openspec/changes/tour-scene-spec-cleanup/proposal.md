## Why

commit `49ed54a` 把 `/tour` 的廚房 stage 從俯視圖重做為側視凌空攔截場景。動畫敘事本身不該進規格，
但它作廢了規格裡一個被點名的實作常數：

`openspec/specs/tour-experience/spec.md:67` 寫

> 「stage 元件 SHALL 以 `useMotionValue(1)` fallback 配 `useTransform` 直接呈現動畫終點狀態
> （counter=81、**廚房紅區 0.85**、CTA opacity=1 等）」

逐項查證這三個舉例：

| 舉例值 | 現況 | 依據 |
|---|---|---|
| `counter=81` | 仍成立 | `components/tour/stages/CourtSizeStage.tsx:24` `useTransform(source, [0, 1], [260, 81])` |
| `CTA opacity=1` | 仍成立 | `ClosingStage` 於 `source=1` 時 CTA 完全可見 |
| **廚房紅區 0.85** | **已不存在** | 舊值來自 `git show 49ed54a^:...KitchenViolationStage.tsx:31` 的 `useTransform(source, [0, 0.35], [0, 0.85])`（一塊俯視廚房紅區矩形）；該物件已刪除，現行終點為 `kitchenScene.ts:249` 的 `kitchenFlashOpacity(1) = 0.28` |

讀規格的人拿著「廚房紅區 0.85」去程式碼裡找，找不到對應物。

**根因不是這次改動，是規格寫法。** 把動畫實作常數釘進規格，等於保證每次動畫調整都製造一次規格漂移。
所以本 change 的修法是**去數值化**，不是把 `0.85` 改寫成 `0.28`。

同一類問題還有兩處，一併處理（都是「規格引用了會自然變動的值」）：

- `openspec/specs/dev-workflow/spec.md:21` 寫「而非完整套件的 **15 檔**」。本 change 撰寫時實跑 `pnpm --filter ./nextjs-pickball test --run` 已是 **28 檔 161 測**（歷程：15 檔 77 測 → 19 檔 93 測 → 28 檔 161 測）。每補一次測試，這條驗收就過期一次 —— 光是本 change 撰寫期間，main 上的 `4c5b724` 就讓它從 27 檔 157 測變成 28 檔 161 測
- `openspec/specs/tour-experience/spec.md:7` 指向的 design doc 路徑 `nextjs-pickball/docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md` 已不存在 —— docs 樹在 `752a0b5` 合併後實際位於 repo root 的 `docs/superpowers/specs/`（實測 `ls` 確認）

## What Changes

**本 change 不改動任何程式碼**，只修規格與設定檔的文字。

1. `tour-experience` 的 reduced-motion Requirement：
   - 括號舉例去數值化 →「球場尺寸 counter 收斂至最終值、廚房犯規印章落定且警示紅常駐、CTA 完全可見等」
   - 明訂本 Requirement **SHALL NOT 以動畫實作常數表述終點狀態**，並說明理由
   - 補 2 條 Scenario，把「reduced-motion 終點可讀」錨定到 `kitchenScene.test.ts` 已存在的 5 個 `p=1` 終點測試 —— 這些測試斷言的是**性質**（`> 0`、`= 0`、`{ x: 0, y: 0 }`）而非特定常數，正合規格所需
2. `dev-workflow` 的單檔測試指令 Requirement：
   - 「而非完整套件的 15 檔」→「而非完整套件的全部測試檔」
   - 新增規範：驗收條件 SHALL NOT 引用完整套件的檔數或測試數
3. 直接編輯主 spec 的非 Requirement 內容（delta 機制無法承載）：
   - `tour-experience/spec.md:7` 的 design doc 路徑改為 root `docs/superpowers/specs/...`
   - `openspec/config.yaml:58` 的「（實測 15 檔 77 測）」標註為當時實測

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `tour-experience`：1 條 MODIFIED（reduced-motion 全域降級：終點狀態去數值化 + 2 條新 Scenario）
- `dev-workflow`：1 條 MODIFIED（單檔測試指令：移除寫死檔數 + 禁止以套件統計值作驗收）

## Impact

- **受影響檔案**
  - spec：`openspec/specs/tour-experience/spec.md`、`openspec/specs/dev-workflow/spec.md`
  - 設定：`openspec/config.yaml`（第 58 行的括號註記）
  - 程式碼：**無**
- **測試影響**：無新增、無修改。2 條新 Scenario 錨定 `components/tour/stages/kitchenScene.test.ts` 既有的 5 個 it，性質為 regression guard
- **風險**：低。純文字變更，無行為影響
- **明確不做**
  - **不為 `kitchenScene.ts` / `closingScene.ts` 的純函式逐一立 Requirement**。這兩個模組算的是球的飛行軌跡、拍面角度、粒子座標 —— 寫進規格就是實作日誌，下次微調又漂移。`tour-experience` 現有 6 個 TEST 標註全部指向 `hooks/` 與 `data/`，指向 `components/**` 的是 0 個，本 change 維持該分界（唯一例外是上述 2 條 Scenario，因為它們服務的是規格既有的 reduced-motion 承諾，不是動畫敘事本身）
  - **不為 commit `2b7662c`（ClosingStage 重做）開任何 delta**。主規格從未描述 ClosingStage 的 SVG 敘事，其約束的「準備好開始了嗎？」標題、「回到完整指南」按鈕、`nav-back` 過場三項在該 commit 前後逐字未變 —— 規格沒說 ≠ 規格矛盾
  - 不動 `dev-workflow/spec.md:30`、`:173`、`:178` 的 `docs/superpowers/` 引用 —— 那三處用的已是正確的 root 路徑
