---
name: scoreboard-orientation-hint-proxy-signal
description: OrientationHint 的 visible prop 與 TeamPanel 排列方向共用同一個 isLandscape 變數，可當作 E2E 測試等待 client orientation 切換完成的可靠 proxy signal
type: project
---

## 背景

`nextjs-pickball/hooks/useOrientation.ts` 用 `useSyncExternalStore` 讀
`matchMedia("(orientation: landscape)")`；`getServerSnapshot` 永遠回
`"portrait"`（避免 hydration mismatch），故任何橫式 viewport 首次 SSR render
都是 portrait，要等 client hydration 完成後才會切到實際的 landscape 值。

`nextjs-pickball/components/scoreboard/Scoreboard.tsx` 內：
```ts
const isLandscape = orientation === "landscape";
...
<OrientationHint visible={!isLandscape} />
...
isLandscape ? "flex-row divide-x" : "flex-col divide-y"
```
`OrientationHint`（「💡 建議橫向使用，體驗更好」文字，`role="status"`）的
`visible` prop 與下方兩個 `TeamPanel` 的排列方向（flex-row 並排 vs flex-col
堆疊）**共用同一個 `isLandscape` 變數、同一次 render**。

## 用法

E2E 測試若要斷言橫式 viewport 下的排版幾何（例如兩面板 x/y 座標），在量測
前先等待這個 hint 確實消失，即可保證版面已切換為 landscape，不是巧合式的
時序 hack：

```ts
await expect(
  page.getByRole("status").filter({ hasText: "建議橫向使用" }),
).toBeHidden();
```

**適用範圍**：只在「viewport 實際是 landscape（width > height）」時才需要
這個等待——SSR 預設本來就是 portrait，portrait viewport 不需要切換，等待
hint 消失反而會 hang（hint 本來就該顯示）。判斷式：`vp.width > vp.height`。

**已知會用到這個 proxy 的測試**（`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`）：
- 「橫式 viewport 兩隊面板左右並排」（2026-08-14 commit `42b5eb9` 修的
  flaky 測試，根因就是缺這個等待，導致 firefox/webkit 在序列與並行執行下
  都各中過一次）
- 「多 viewport 零捲動」測試迴圈內對 landscape viewport 也加了同款等待
  （防禦性加固，尚未觀察到因此失敗，但同樣依賴 client orientation state）

**不需要這個等待的測試**：任何只斷言文字內容/存在性（不斷言排列方向或座標）
的測試——文字本身不受 orientation 影響，例如「隊伍面板顯示目標分數」用
`toHaveCount(2)`，這類斷言本身就是 auto-retry，不會被 hydration 時序卡住。

## 延伸原則

`page.evaluate()` 做一次性幾何量測（`getBoundingClientRect` 等）搭配純值
`expect(value).toBeLessThan(...)` **沒有 Playwright auto-retry**，若量測依賴
任何 client-side 才會 settle 的狀態（orientation、CSS container query、字型
載入等），單次量測可能剛好卡在過渡態。修法是把量測函式包進
`expect.poll(fn).toBeXxx()`，且**每次 poll 都要重新執行量測**（不能只 poll
快取的舊值）。詳見 `[[playwright-flaky-viewport-measurement-pattern]]`（若尚未
建檔）。
