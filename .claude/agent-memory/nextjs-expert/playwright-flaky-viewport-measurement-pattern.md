---
name: playwright-flaky-viewport-measurement-pattern
description: page.evaluate() 一次性幾何量測搭配純值 expect 沒有 auto-retry，是本 repo E2E flaky 的固定成因；修法是抽成量測函式 + expect.poll 每次重試重新讀 DOM
type: project
---

## 失敗模式

Playwright 的 **locator 斷言**（`expect(locator).toBeVisible()`、`toHaveCount()` 等）
內建 auto-retry，會等到條件成立或逾時。但

```ts
const boxes = await page.evaluate(() => /* getBoundingClientRect 等 */);
expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(5);
```

這種寫法**完全沒有重試**：`page.evaluate()` 只在呼叫的那一瞬間量一次，
`expect(純值)` 也不會重跑量測。只要版面在量測當下還沒收斂，就是紅燈——
而「有沒有收斂」取決於機器負載與並發，因此表現為 flaky 而非穩定失敗。

本 repo 已知會讓版面延後收斂的來源：

- **client orientation 切換**：`useOrientation` 的 `getServerSnapshot` 永遠回
  `"portrait"`，橫式 viewport 必須等 hydration 後才切成 landscape
  （見 [[scoreboard-orientation-hint-proxy-signal]]）
- **CSS container query 單位**：`cqh`/`cqw` 要等容器尺寸確定後才算得出來
  （見 [[scoreboard-container-query-cqh-self-fallback]]）
- **進場動畫**：`zoom-in-95` 之類的 enter animation 期間座標一直在變
- **字型載入**：字級/行高在 web font swap 後會再變一次

## 修法

把量測抽成函式，讓 `expect.poll` 的**每一次重試都重新執行量測**，而不是 poll 一個
已經快取住的舊值：

```ts
// 抽成函式讓 expect.poll 每次重試都重新讀取 DOM
const measurePositions = () =>
  page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll(".\\@container-size"));
    return panels.map((panel) => {
      const rect = panel.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
  });

await expect
  .poll(
    async () => {
      const [first, second] = await measurePositions();
      return Math.abs(first.y - second.y);
    },
    { message: "橫式排版下兩面板應在同一水平帶（並排而非上下堆疊）" },
  )
  .toBeLessThan(5);
```

**常見寫錯**：`const boxes = await measure(); await expect.poll(() => boxes[0].y)...`
——poll 的是同一份快照，重試一萬次也是同一個值。poll 的 callback 內必須含量測本身。

## 出處與現存實例

2026-08-14 commit `42b5eb9`（`test(scoreboard): 修正橫式並排測試的 orientation 競態`）
是本 repo 第一次系統性套用此手法，根因為「量在 hydration 前的直式版面」，
firefox/webkit 在序列與並行執行下都各中過一次。

`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts` 目前有三處採用（行號會漂移，用
`grep -n "expect.poll"` 找）：

- 多 viewport 邊界餘量量測（`measureMargins`）——該頁面其實不需 orientation 切換，
  是**防禦性**比照，因為量測手法屬同一類脆弱寫法
- 橫式兩面板並排（`measurePositions`）——真正修 flaky 的那個
- 下拉選單不被 navbar 遮擋（`assertPanelBelowNavbar`）——防的是進場動畫過渡座標

## 何時**不**需要這招

只斷言文字內容或存在性（`toHaveText`／`toHaveCount`／`toBeVisible`）時不需要，
那些 locator 斷言本身就會 auto-retry。硬加 `expect.poll` 只會讓測試更難讀。

判準很單純：**斷言的對象是不是 Playwright locator**。是 → 已有重試；
是我自己從 `page.evaluate()` 拿回來的數字 → 需要 `expect.poll`。
