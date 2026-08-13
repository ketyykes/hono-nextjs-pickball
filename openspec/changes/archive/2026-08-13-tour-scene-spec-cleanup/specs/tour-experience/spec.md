## MODIFIED Requirements

### Requirement: `prefers-reduced-motion` 全域降級

系統 SHALL 提供 `nextjs-pickball/hooks/useReducedMotion.ts`：監聽 `(prefers-reduced-motion: reduce)` media query，回傳目前值；media query 變動時 SHALL 觸發 React 重新渲染；元件卸載時 SHALL 移除事件監聽。

當 `useReducedMotion()` 為 true 時，`useStageProgress` SHALL 回傳 `null`；stage 元件 SHALL 以 `useMotionValue(1)` fallback 配 `useTransform` 直接呈現動畫終點狀態（球場尺寸 counter 收斂至最終值、廚房犯規印章落定且警示紅常駐、CTA 完全可見等），確保使用者看到完整內容而非空白起點。`scroll-snap` 與 progress rail SHALL 保留以利使用者控制節奏與感知位置。

本 Requirement 約束的是「reduced-motion 下終點畫面可讀」這件事，SHALL NOT 以動畫實作常數（特定 opacity、座標、緩動參數）表述終點狀態 —— 那些值會隨每次動畫重做而變動，把它們寫進規格只會製造規格漂移。可驗證性改由 stage 的場景純函式在 `p=1` 的行為承載。

> 前一版本此處寫「（counter=81、廚房紅區 0.85、CTA opacity=1 等）」。其中「廚房紅區 0.85」來自舊版 `KitchenViolationStage.tsx` 的 `useTransform(source, [0, 0.35], [0, 0.85])`（一塊俯視廚房紅區矩形），該物件已於 commit `49ed54a` 的側視場景重做中刪除，現行終點值為 `kitchenScene.ts` 的 `kitchenFlashOpacity(1) = 0.28`。讀者依規格去程式碼找 0.85 的廚房紅區會找不到對應物 —— 這正是「規格不該釘實作常數」的實例。

#### Scenario: useReducedMotion 在 reduce 設定時回 true

- **GIVEN** 測試環境 mock `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 為 true
- **WHEN** 呼叫 `useReducedMotion()`
- **THEN** 回傳 true
- **TEST** `nextjs-pickball/hooks/useReducedMotion.test.ts` 中 `it('在 prefers-reduced-motion: reduce 啟用時回傳 true')`

#### Scenario: useReducedMotion 在偏好變動時更新

- **GIVEN** 元件已掛載 `useReducedMotion()`
- **WHEN** matchMedia 之 change 事件觸發、值改為 true
- **THEN** hook 回傳值更新為 true 並造成 re-render
- **TEST** `nextjs-pickball/hooks/useReducedMotion.test.ts` 中 `it('於 matchMedia change 事件後回傳新值')`

#### Scenario: useReducedMotion 卸載時移除監聽

- **GIVEN** 元件掛載 `useReducedMotion()` 並註冊 listener
- **WHEN** 元件卸載
- **THEN** matchMedia 之 `removeEventListener` 被呼叫
- **TEST** `nextjs-pickball/hooks/useReducedMotion.test.ts` 中 `it('卸載時移除 matchMedia 監聽')`

#### Scenario: reduced motion 下 `/tour` 仍可訪問所有 stage 內容

- **GIVEN** 使用者瀏覽器 `prefers-reduced-motion: reduce` 設定為啟用
- **WHEN** 使用者開啟 `/tour` 並捲動
- **THEN** 6 個 stage 之內容文字皆可讀取，scroll-snap 仍生效，progress rail 仍正常更新

#### Scenario: 廚房 stage 於 p=1 保留可讀的犯規終點畫面

- **GIVEN** reduced-motion 啟用，`KitchenViolationStage` 以 `useMotionValue(1)` fallback 取代進度來源
- **WHEN** 以 `p=1` 求值 `kitchenScene.ts` 的場景純函式
- **THEN** 廚房警戒區保留警示紅色調（`> 0`）、幽靈軌跡與落點標記維持可見，使違規事實在無動畫下仍可判讀
- **TEST** `nextjs-pickball/components/tour/stages/kitchenScene.test.ts` 中 `it('p=1 廚房區保留警示紅色調（終點狀態傳達違規）')` 與 `it('p=1 幽靈軌跡與落點標記保持可見（reduced-motion 終點可讀）')`

#### Scenario: 廚房 stage 於 p=1 不殘留過程中的動態元素

- **GIVEN** reduced-motion 啟用
- **WHEN** 以 `p=1` 求值震動位移、撞擊波紋與全畫面紅閃
- **THEN** 三者皆歸零（位移為 `{ x: 0, y: 0 }`、波紋與紅閃 opacity 為 0），終點畫面乾淨不殘留過場效果
- **TEST** `nextjs-pickball/components/tour/stages/kitchenScene.test.ts` 中 `it('撞擊前（p=0）與 p=1 皆無位移')`、`it('p=1 所有波紋已淡出（終點畫面乾淨）')` 與 `it('p=1 紅閃已完全退去（終點畫面乾淨）')`
