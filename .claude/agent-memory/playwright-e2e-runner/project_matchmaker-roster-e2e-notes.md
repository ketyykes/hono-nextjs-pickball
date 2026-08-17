---
name: project_matchmaker-roster-e2e-notes
description: /matchmaker/players 參賽者名單頁的 E2E selector 與行為細節（storage key、Dialog/AlertDialog accessible name、hydration 模式），供後續 matchmaker E2E（對戰、輪次、歷史）延續寫法
metadata:
  type: project
---

撰寫 `nextjs-pickball/tests/e2e/specs/player-roster.spec.ts` 時，因 playwright-cli 在本環境
不可用（見 [[env_playwright-cli-not-installed]]），改用 `@playwright/test` 的 chromium
直接跑一支探索腳本確認以下事實，記下來給下一個要寫 matchmaker E2E 的人（`lib/matchmaker/
storage.ts` 的 `RESET_KEYS` 註解已預告 M2 會加 rounds、M6 會加 history，之後大機率還有更多
matchmaker 頁面要補 E2E）：

## 頁面與路由

- `/matchmaker/players` **刻意不在全站 navbar**（見 `app/matchmaker/players/page.tsx` 檔頭
  註解），E2E 一律 `page.goto("/matchmaker/players")` 直接進，不能靠 navbar 連結。

## Storage

- key 為 `matchmaker:roster:v1`（`lib/matchmaker/storage.ts` 的 `STORAGE_KEY`），格式
  `{ version: 1, players: [...] }`。
- 重置（`resetMatchmakerData()`）只刪 `RESET_KEYS` 列舉的 key，目前只有這一個，**不會動到
  `scoreboard:current:v1`**——這是本 change 的核心保證之一，寫 E2E 時 beforeEach 清 storage
  務必用 `localStorage.removeItem(具體 key)`，不可用 `.clear()`。

## Hydration 模式

- 沿用 `useScoreboardStore` 的 `hasHydratedRef` 模式：首次 render 一律空名單，`useEffect`
  讀完 localStorage 才 dispatch `HYDRATE`。E2E 斷言用 `expect(...).toBeVisible()` 的內建重試
  即可涵蓋這個時序，不需要額外 `waitForTimeout`。實測（chromium，dev 模式）全程無
  console error/warning，沒有 hydration mismatch。

## Selector 陷阱（實測用 ariaSnapshot 確認過）

- 頁首固定渲染「新增參賽者」按鈕（不受名單是否為空影響），**同時** EmptyRoster 也有一顆
  「新增第一位參賽者」按鈕——兩者開同一個 Dialog。用 `exact: true` 精確比對「新增參賽者」
  才不會誤中「新增第一位參賽者」。
- 新增 Dialog 的**標題**與**送出鈕**文字都是「新增參賽者」（與頁首觸發鈕撞名）：shadcn/
  Radix 的 `DialogTitle` 有自動 wiring `aria-labelledby`，`page.getByRole("dialog", { name:
  "新增參賽者" })` 抓得到；送出鈕改用 `dialog.getByRole("button", { name: "新增參賽者", exact:
  true })`（scope 在 dialog 子樹內）跟頁首鈕區隔開。編輯 Dialog 標題是「編輯參賽者」，不撞名。
- AlertDialog（重置）同理：`page.getByRole("alertdialog", { name: "重置參賽者名單" })`，
  按鈕為「確定重置」／「取消」。
- 強度分數輸入用 `type="number"` 的 spinbutton，各瀏覽器 `.fill()` 行為有落差；表單同時提供
  三顆預設按鈕（「新手 1.00」「中階 3.00」「高階 5.00」，`type="button"`，只改 state 不送出
  表單），E2E 優先用這些預設按鈕設定強度分數，比直接操作 number input 更穩。
- PlayerCard 才會渲染「編輯」「刪除」「設為暫停／恢復出場」按鈕與「強度 X.XX」文字；斷言
  「名單為空」時可用 `getByRole("button", { name: "編輯" })` 等 `toHaveCount(0)` 做防線。

## 環境雜訊

- Next dev 模式下 `<div role="alert">` 會出現在 body（Next.js 內建的 route announcer，
  `aria-live` 用於無障礙路由變更通知），內容恆為空字串，**跟 `droppedCount > 0` 那個帶文字
  的 `role="alert"` 提示無關**，用 `getByRole("alert")` 斷言時記得排除或改用文字比對。
