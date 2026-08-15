---
name: scoreboard-mobile-safari-overlap-bug
description: /scoreboard 曾在 mobile-safari project (iPhone 12, viewport 390x664) 下版面重疊、按鈕被攔截；根因為 container query 單位寫在容器自身，已於 1cba147 修復
metadata:
  type: project
---

> **狀態：已於 2026-08-14 commit `1cba147` 修復**，根因已確認（見下方「根因（已確認）」）。
> 本檔保留為「診斷路徑」教材：當時的第一版假說是錯的，錯在哪裡值得記住。

2026-08-14 執行 `scoreboard-target-score` change 的 E2E 驗證時，於 **mobile-safari project**（`devices["iPhone 12"]`，預設 viewport **390x664**——`screen` 才是 390x844，見 [[scoreboard-container-query-cqh-self-fallback]]）發現真實版面重疊 bug：TeamPanel 的「贏這球+」按鈕會被下一個 TeamPanel 的標題列（`我方 · N 分制` / `對方 · N 分制`）攔截 pointer events，導致 Playwright `click()` 逾時（`waiting for element to be visible, enabled and stable` 一路重試到 30s timeout）。

**證據**：`test-results/scoreboard--scoreboard-計分器-12934-Dialog-顯示「🏆-我方獲勝」與「11-–-0」-mobile-safari/test-failed-1.png` 清楚顯示「對方 · 11 分制」文字疊在「我方」的「贏這球+」按鈕上（兩個 TeamPanel 沒有正確上下對半分配高度）。

**關鍵事實**：
- 只在 mobile-safari 出現：chromium／firefox／webkit(desktop)／mobile-chrome 五個 project 中另外四個全綠，desktop webkit（大 viewport）也全綠 —— 排除「WebKit 引擎本身不支援」，指向「WebKit + 窄 viewport（390px）」的組合。
- 用 `--browser=chrome`（Chromium）在 390x844 手動截圖完全正常、不重疊，設定列（4 個控制項）在 390px 寬也**沒有折成兩列**、單行放得下 —— 與最初預期的「折兩列」不同，代表折行推論本身不成立，重疊另有原因。
- 影響範圍**不限本 change 新增的 test**：既有的「我方連贏 11 球觸發 GameOverDialog」「Undo」「重置」「localStorage 持久化」四個舊測試在 mobile-safari 也同樣重疊逾時，代表這不是新測試 selector 問題，是真實 CSS/渲染問題。
- 連續兩次完整跑 `scoreboard.spec.ts` 全 5 project，mobile-safari 失敗清單完全一致（6/11 失敗），**非 flaky**。

**根因（已確認，2026-08-14）**：`TeamPanel.tsx` 把 `gap`/`padding` 的 `cqh` 寫在
`@container-size`（`container-type: size`）**容器自己身上**，而 container query 單位
永遠查詢「最近的祖先 container」、容器自己不算，因此那些值 fallback 回小視口單位。
分數字級的 `cqh`（寫在子孫元素上）會隨面板被擠壓而縮小，gap/padding 卻不會跟著縮，
內容總高度超出面板高度後，`justify-content: center` 在沒有 `safe` 關鍵字時會向頭尾
對稱溢出，蓋住相鄰面板的按鈕。修法是多包一層 `h-full` wrapper 把 cqh 降一層，
並加 `overflow-hidden` 作最後防線。完整機制與驗證方式見
[[scoreboard-container-query-cqh-self-fallback]]。

**當時的第一版假說是錯的，錯在哪值得記住**：原假說寫成「WebKit 在
size-containment + dvh 組合上的渲染時序問題」，把它當成引擎專屬的 race condition。
實際上這是**通用 CSS 幾何問題，任何引擎都會發生**——只是 `mobile-safari` project 的
預設 viewport（390x664）剛好矮到踩過臨界值，而 `mobile-chrome`（390x727）高 63px 逃過。
**「只有某一個 project 失敗」不等於「該引擎有 bug」**，更常見的是那個 project 的
viewport 剛好是最嚴苛的一組。下次先用 `devices['<name>'].viewport` 印出實際數字，
再決定要不要往引擎差異的方向查。

**How to apply**：
1. 未來在此 repo 遇到 mobile-safari-only 失敗，**先看是不是這類版面幾何問題**（screenshot 會顯示文字疊在按鈕上）。**不要**歸因「瀏覽器版本落後」——該說法的前提已於 2026-08-15 實測推翻，見 [[tour-e2e-browser-version-mismatch]]。
2. 判斷版本 vs 真實 bug 的分野：版本問題通常是瀏覽器完全無法啟動/連線；這個 bug 是瀏覽器正常啟動、正常導航、正常截圖，只是 DOM 元素互相遮蔽導致 click 逾時——**檢查失敗訊息裡有沒有 `subtree intercepts pointer events`**，有的話幾乎可以排除版本問題。
3. 定位根因的有效手法（本案實際用來破案的那個）：**起 dev server + Playwright 腳本現場量 computed style**，不要只讀 CSS 推論。用 `devices['<name>'].viewport` 印出該 project 的真實高度，再對 `.@container-size` 節點量 children 的 boundingClientRect 與 computed gap/padding。腳本寫法見 [[playwright-core-standalone-script-resolution]]（nextjs-expert 目錄）。
4. 覆蓋缺口的現況（2026-08-15 複查）：主 spec 已補上「面板內容須保留邊界安全餘量」（`openspec/specs/scoreboard/spec.md`，對應 test「面板內容不得貼齊邊界：底部餘量須保留安全值」，自行 `setViewportSize(390, 664)`），**量的是餘量大小而非布林重疊**，因此「防護正在變薄」本身可被偵測。但仍**沒有**通用的「點擊時不應被其他元素攔截」檢查（`elementFromPoint` 之類），其他頁面若出現同類遮蔽仍測不到。

相關：[[tour-e2e-browser-version-mismatch]]、[[scoreboard-container-query-cqh-self-fallback]]、[[playwright-flaky-viewport-measurement-pattern]]
