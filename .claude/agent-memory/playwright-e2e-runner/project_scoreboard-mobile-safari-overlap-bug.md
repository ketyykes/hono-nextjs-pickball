---
name: scoreboard-mobile-safari-overlap-bug
description: /scoreboard 在 mobile-safari project (iPhone 12, 390x844) 下有真實版面重疊 bug，導致按鈕被攔截無法點擊；非瀏覽器版本問題
metadata:
  type: project
---

2026-08-14 執行 `scoreboard-target-score` change 的 E2E 驗證時，於 **mobile-safari project**（`devices["iPhone 12"]`，預設 viewport 390x844）發現真實版面重疊 bug：TeamPanel 的「贏這球+」按鈕會被下一個 TeamPanel 的標題列（`我方 · N 分制` / `對方 · N 分制`）攔截 pointer events，導致 Playwright `click()` 逾時（`waiting for element to be visible, enabled and stable` 一路重試到 30s timeout）。

**證據**：`test-results/scoreboard--scoreboard-計分器-12934-Dialog-顯示「🏆-我方獲勝」與「11-–-0」-mobile-safari/test-failed-1.png` 清楚顯示「對方 · 11 分制」文字疊在「我方」的「贏這球+」按鈕上（兩個 TeamPanel 沒有正確上下對半分配高度）。

**關鍵事實**：
- 只在 mobile-safari 出現：chromium／firefox／webkit(desktop)／mobile-chrome 五個 project 中另外四個全綠，desktop webkit（大 viewport）也全綠 —— 排除「WebKit 引擎本身不支援」，指向「WebKit + 窄 viewport（390px）」的組合。
- 用 `--browser=chrome`（Chromium）在 390x844 手動截圖完全正常、不重疊，設定列（4 個控制項）在 390px 寬也**沒有折成兩列**、單行放得下 —— 與最初預期的「折兩列」不同，代表折行推論本身不成立，重疊另有原因。
- 影響範圍**不限本 change 新增的 test**：既有的「我方連贏 11 球觸發 GameOverDialog」「Undo」「重置」「localStorage 持久化」四個舊測試在 mobile-safari 也同樣重疊逾時，代表這不是新測試 selector 問題，是真實 CSS/渲染問題。
- 連續兩次完整跑 `scoreboard.spec.ts` 全 5 project，mobile-safari 失敗清單完全一致（6/11 失敗），**非 flaky**。

**根因假說**（未逐一驗證，僅程式碼比對推論）：`TeamPanel.tsx` 用 `@container-size`（`container-type: size`）搭配 `clamp(2.5rem, min(37cqh, 38cqw), 14rem)` 做分數字級，而 `ScoreboardSetup.tsx` 這次 change 新增了 targetScore radiogroup（第三個控制項），略微壓縮了 panel 可用高度。`container-type: size` 的容器本身不具內在尺寸，必須完全依賴父層 flex 給高度；WebKit（尤其 iOS/窄 viewport 模擬）在此類 size-containment + dvh 組合上曾有已知渲染時序問題，可能導致 panel 容器高度計算成 0 或過小、內容仍照舊尺寸渲染而溢出，造成兩個 panel 視覺重疊。**未在 pre-feature commit（`d251b22`）上重跑驗證是否為本 change 引入的 regression，僅為合理推論**，需要人工或後續 agent 進一步確認 root cause 再決定是否要修。

**How to apply**：
1. 未來在此 repo 遇到 mobile-safari-only 失敗，**先看是不是這個重疊 bug**（screenshot 會顯示文字疊在按鈕上），不要直接套用 [[tour-e2e-browser-version-mismatch]] 的「瀏覽器版本落後」結論——那是另一個 capability（tour）的已知問題，成因不同，不要混用。
2. 判斷版本 vs 真實 bug 的分野：版本問題通常是瀏覽器完全無法啟動/連線；這個 bug 是瀏覽器正常啟動、正常導航、正常截圖，只是 DOM 元素互相遮蔽導致 click 逾時——**檢查失敗訊息裡有沒有 `subtree intercepts pointer events`**，有的話幾乎可以排除版本問題。
3. 若要真正定位根因，建議：(a) 在 pre-feature commit 開一個 worktree 重跑同一支 mobile-safari test 確認是否本來就存在；(b) 用 mobile-safari project 實際截圖（而非用 chrome 模擬窄 viewport 代打）比對佈局差異。
4. 「多 viewport 零捲動」既有測試（`scoreboard.spec.ts`）**測不到這個 bug**——它只驗證 boundingBox 落在 viewport 內，不驗證元素間有無重疊互相遮蔽，是目前 spec 的覆蓋缺口。若之後要補強，可以加一個「點擊時不應被其他元素攔截」的檢查（例如比對 `elementFromPoint` 或直接嘗試 click 並允許失敗即失敗）。

相關：[[tour-e2e-browser-version-mismatch]]
