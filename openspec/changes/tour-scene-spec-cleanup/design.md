## Context

本 change 是純規格文字修正，零程式碼變更。設計上只有一個真正的判斷題：
**廚房 stage 重做之後，規格該補到什麼程度？**

一端是「什麼都不補，只把失效的 0.85 拿掉」，另一端是「為 `kitchenScene.ts` 的 10 個純函式立完整 Requirement」。
兩端都不對，理由見 D2。

## TDD 分層判定（依 `openspec/config.yaml` 前端 TDD 範圍）

| 項目 | 分類 | 依據 |
|---|---|---|
| `openspec/specs/**` 的 spec 文字 | **例外層** | 非程式碼 |
| `openspec/config.yaml` 的註記 | **例外層** | 設定檔文字 |
| `components/tour/stages/kitchenScene.test.ts` | 行為邏輯，**但已完成** | `49ed54a` 已含 25 個 it，本 change 只引用不修改 |

**本 change 沒有三步 TDD task。**

## 關鍵決策

### D1｜去數值化，不是把 0.85 改寫成 0.28

最省事的修法是把 `廚房紅區 0.85` 改成 `廚房警示紅 0.28`。不採用。

理由：那會讓規格在下一次動畫微調時再次失效，而動畫微調是**預期會發生**的事
（`49ed54a` 與 `2b7662c` 兩週內就重做了兩個 stage）。
規格該約束的是「reduced-motion 下使用者看得到完整內容」這個**對使用者的承諾**，
不是達成該承諾的某個 opacity 數值。

因此本 change 除了改掉舉例，還在 Requirement 本文明訂
「SHALL NOT 以動畫實作常數表述終點狀態」—— 把這次的教訓寫成規則，而不只是修一次症狀。

保留的 `counter=81` 是資料語意（匹克球場 81 平方英尺 vs 網球場 260），不是動畫實作常數，
但為了措辭一致也改為「球場尺寸 counter 收斂至最終值」。

### D2｜補 2 條 Scenario，但**不**為 scene 純函式立完整 Requirement

`kitchenScene.ts` 有 10 個匯出純函式、25 個單元測試。全部寫進規格是錯的：
它們算的是球的飛行軌跡、拍面角度、幽靈球位置、粒子座標 —— 典型的實作細節。
`tour-experience` 現有 6 個 TEST 標註全部指向 `hooks/` 與 `data/`，指向 `components/**` 的是 **0 個**，
這是既有的一致分界，不因這次重做而改變。

但完全不補也是錯的：規格 `:67` **已經對 reduced-motion 終點狀態做出承諾**，
而該承諾現在整個由 `kitchenScene` 的 `p=1` 行為實現。承諾沒有可驗證的錨點，就是規格債。

分界線因此劃在：**服務既有承諾的測試才進規格，動畫敘事的測試不進。**

挑中的 5 個 it 全是 `p=1` 終點斷言，且斷言的是**性質**而非常數：

```
kitchenFlashOpacity(1)   → toBeGreaterThan(0)        // 不是 toBe(0.28)
landingMarkerOpacity(1)  → toBe(1)
shakeOffset(1)           → toEqual({ x: 0, y: 0 })
impactRingPose(1, *)     → opacity toBe(0)
vignetteOpacity(1)       → toBe(0)
```

這正是 D1 想要的形狀 —— 測試本身就沒釘實作常數，所以引用它們不會把常數帶回規格。

### D3｜`2b7662c`（ClosingStage 重做）不開任何 delta

同樣的判準套到收尾 stage，結論是**零漂移**：

- 規格對 ClosingStage 的約束只有三項 —— 「準備好開始了嗎？」標題、「回到完整指南」按鈕（`spec.md:25-29`）、
  `router.push` 帶 `nav-back` transitionTypes（`spec.md:120`）—— 三項在 commit 前後逐字未變
- 主規格從未描述 ClosingStage 的 SVG 敘事。舊的「球員收拍」敘事只出現在**已封存**的 change tasks.md 裡，
  那是歷史執行紀錄，不是規格
- `closingScene.ts` 全部是動畫幾何（貝茲控制點、壓扁比例、14 個軌跡點、12 顆粒子），依 D2 的分界不進規格
- 它也沒有承接任何規格既有承諾：reduced-motion 的「CTA 完全可見」由 `ClosingStage` 元件層直接保證，
  不需要下沉到 scene 函式

「規格沒說」不等於「規格矛盾」。硬開一個 change 只會產出空的 delta。

### D4｜design doc 路徑與 config.yaml 註記必須直接改主檔

`tour-experience/spec.md:7` 的路徑修正位於 Purpose 之後、`## Requirements` 之前的
「實作注意」引言區塊，`openspec/config.yaml:58` 更不在任何 spec 內。
delta 機制只能承載 `### Requirement:` 層級的內容，兩者都得直接編輯主檔
（沿用 `2026-08-12-fix-guide-and-quiz-spec-drift/tasks.md` D1 的處理方式）。

tasks.md 因此把它們獨立成一節，避免被誤認為可以靠 archive 自動套用。
