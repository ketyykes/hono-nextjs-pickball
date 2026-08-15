---
name: e2e-webserver-cold-start-chunkloaderror
description: E2E 冷啟動時 ChunkLoadError 只出現在 WebKit 引擎（webkit／mobile-safari）project 的整輪中後段；已用 production build 對照證實為 dev-only 噪音（dev 19～90 次 vs production 0 次），與產品程式碼無關
type: project
---

## 更正說明（2026-08-14 深入調查後）

本記憶先前版本聲稱「chromium 最先跑的幾個 test 會中 ChunkLoadError」——**這個說法是錯的**，
已用 7 次完整保留 log 的實測推翻。若之後又看到類似現象，以本次更新後的內容為準，
不要再引用舊版「chromium 最先幾個 test」的說法。

## 現象（用 7 次冷啟動實測 log 驗證，log 完整保留於
`/private/tmp/claude-501/-Users-danny-Desktop-project-hono-nextjs-pickball/<session>/scratchpad/`
的 `e2e-full.log`、`e2e-par3.log`、`e2e-cold.log`、`e2e-serial.log`、
`e2e-investigation/full-suite-cold-1.log`、`e2e-investigation/scoreboard-cold-w8.log`）

`playwright.config.ts` 的 `webServer` 自己冷啟動 hono-pickball + Next.js dev 時：

- **ChunkLoadError 100% 只出現在 `webkit` 與 `mobile-safari` 這兩個 project**
  （兩者皆由 Playwright 內建的 WebKit engine 驅動）。`chromium`、`firefox`、
  `mobile-chrome`（Chromium/Gecko 系）在 5 次預設並發（`workers=4`，未指定時
  Playwright 在此機器＝8 核取的近似值）的冷啟動全量執行中**一次都沒出現過**。
- **不是集中在整輪的開頭**，而是集中在**整輪測試的中後段**——即 webkit／
  mobile-safari 排到的那個區段（例如 80 tests 中的 test #33 之後、160 tests
  中的 test #83 之後）。此時 chromium／firefox 早就把同樣的路由與 chunk
  請求過幾十次，Turbopack 的編譯快取必然是熱的——**這排除了「首次編譯競態」
  這個假設**，根因不是「dev server 還沒編譯完」。
- 錯的 chunk 固定是 Next 的**非同步／延遲載入**片段：
  `[turbopack]/browser/dev/hmr-client/hmr-client.ts`（本身就標記
  `async loader`）與 Next 內建的 `global-error` boundary chunk（RSC client
  reference 的延遲 import），**從未看過關鍵首屏 bundle 本身載入失敗**。
- **並發是必要條件**：`--workers=1`（序列執行）跑完全部 80 test（含 webkit）
  一次 ChunkLoadError 都沒有；預設 `workers=4` 每次跑 19～31 次；刻意超額
  訂閱到 `--workers=8`（等於本機邏輯核心數，但還要跟兩個 dev server process
  搶 CPU）時暴增到 90 次。

## 根因判斷（由證據推論，非官方文件佐證，MECHANISM 未經瀏覽器原始碼驗證）

每個 spec 的 test 都在極短時間內連續兩次 `page.goto()`
（`beforeEach` 先 `goto("/")` 再 `evaluate` 清 localStorage，測試本體緊接著
`goto(<route>)`，中間幾乎無停留）。`page.goto()` 只等到 `load` 事件，但
Turbopack 的 HMR client／RSC runtime 在 `load` 之後仍會**背景**用動態
`import()` 補抓幾個延遲 chunk。若並發夠高導致 dev server 回應變慢，這個背景
fetch 還沒完成、下一行程式碼就已經觸發第二次導覽——新導覽會把前一個
document 連同其 in-flight fetch 一起中斷。Webpack/Turbopack 的 chunk-loading
runtime 把這個中斷後的 rejected promise 包成
`ChunkLoadError: Failed to load chunk ...`，以 unhandled rejection 形式冒出來，
同時被 Next dev server 的瀏覽器 console 轉發功能印到終端機、也被 Playwright
自己的 page-error 監聽器記錄下來。只在 WebKit engine 上看得到，推測是
WebKit 在導覽切換時對「舊 document 裡尚未 settle 的 fetch/import promise」
的處理時機與 Chromium／Firefox 不同（允許它在新 document 已 commit 後才
reject 並觸發 `unhandledrejection`），但這點沒有找到官方文件佐證，純粹是
「93 次全部落在 WebKit 系、Chromium/Gecko 系全部 0 次」這個高度一致的相關性
推出來的最合理解釋。

## 對測試可信度的實測結論

**純噪音，不是假紅燈來源。** 5 次預設並發（`workers=4`）全量冷啟動執行，
ChunkLoadError 出現 19～31 次／次，**每一次最終結果都是全數通過**（`80
passed` ×3、`142 passed / 0 failed / 18 skipped` ×1）。刻意推到
`--workers=8`（超訂閱本機核心數）**才**首次看到真正的測試失敗（20 failed），
但逐一核對這 20 個失敗，**proximate error 全部是單純的
`Test timeout of 30000ms exceeded`**（`page.goto`／`beforeEach` hook／
locator 逾時），16/20 集中在 `chromium`（整輪最先起跑的 project，被 8 個
同時起跑的瀏覽器行程搶 CPU 拖垮），只有 4/20 的失敗區塊裡「同時存在」
ChunkLoadError 訊息（且都只是背景噪音，不是該次失敗的 thrown error）。
**結論：`--workers=8` 這種超額訂閱會讓機器整體過載而導致逾時失敗，
但這跟 ChunkLoadError 本身是兩件事**——ChunkLoadError 只是同一種過載下
一起變多的另一個症狀，不是失敗的成因。

## Production build 對照實驗（2026-08-15，本案結案證據）

先前版本記著「若要完全排除產品面真實 race，更嚴謹的做法是對 `next build && next start`
（無 HMR）跑，尚未執行」。**已執行，結論確定：ChunkLoadError 是 dev-only 現象，
與產品程式碼無關。**

做法：`pnpm --filter ./nextjs-pickball build` → 手動起
`next start --port 3005` 與 `pnpm --filter hono-pickball dev`（:8787）→
因 `playwright.config.ts` 的 `reuseExistingServer: !process.env.CI`，
Playwright 會直接重用這兩個既有 server，不會另起 dev server。

| 條件 | ChunkLoadError | 測試結果 |
|---|---|---|
| dev，`workers=4`（預設，5 次實測）| 19～31 次／次 | 全數通過 |
| dev，`workers=8` | 90 次 | 20 failed（皆為過載 timeout）|
| **production，`workers=4`** | **0** | **147 passed / 18 skipped** |
| **production，`workers=8`（加壓）** | **0** | **147 passed / 18 skipped**，連 timeout 都 0 |

佐證：`curl -s localhost:3005/scoreboard | grep -cE "hmr-client|turbopack/browser/dev"`
在 production 下回 **0** —— dev 模式報錯的那兩個 chunk
（`hmr-client.ts` 與 Next 內建 `global-error` boundary 的延遲 import）
在 production bundle 裡根本不存在，自然無從失敗。

**額外收穫**：production 下 `workers=8` 完全不過載（0 timeout），
證明 dev 模式 `workers=8` 那 20 個 timeout 失敗的成因是**兩個 dev server 的即時編譯**
在搶 CPU，不是 Playwright 並發本身的極限。日後若要跑高並發 E2E，
對 production server 跑比調低 workers 更有效。

log 保留於本次 session scratchpad 的 `e2e-prod.log`、`e2e-prod-w8.log`。

## 已知但未能重現的個案

曾有一次全量冷啟動出現「chromium 的 3 個既有測試失敗」（GameOverDialog／
Undo／重置二次確認），但該次完整 log 已遺失、無法比對。用 2 次新的嘗試
（預設並發全量、`--workers=8`）都沒能重現這個特定失敗組合（失敗的 project
與測試都對不上）。判斷為當時機器上有其他無關的資源競爭（一次性外部因素），
不是這個 E2E 基礎設施本身可重現的缺陷。

另外在本次調查中翻到一份**舊的、與此無關**的 log（`full-run.log`，對應
`scoreboard.spec.ts` 每個 project 只有 11 個 test 的更早版本，非本分支現況），
裡面 6 個 mobile-safari 失敗全部是「別的元素 subtree intercepts pointer
events」導致 `.click()` 逾時，跟 ChunkLoadError 完全無關，且用現在的程式碼
重跑（80 tests／project）已經穩定全綠——**這是已經解決、過時的舊問題，
不要跟本記憶的 ChunkLoadError 現象混為一談**。

## 建議（未執行任何修改，`playwright.config.ts` 維持原狀）

不建議因為這個現象去改 `playwright.config.ts` 的 `workers`／`webServer`
warmup 等設定——所有預設並發下的重現都是純噪音，改動只會拖慢所有人日常
E2E 執行速度，換不到任何可靠性提升。若團隊想讓終端機輸出更乾淨，可以考慮
在 `beforeEach` 的兩次 `page.goto()` 之間加一點等待，但那是美觀／降噪
（cosmetic）調整，不影響任何測試結果，且會動到每個 spec 檔的共用寫法，
不在本次調查授權範圍內，未執行。

**How to apply**：日後若又看到「跑 E2E 冷啟動時終端機噴一堆
ChunkLoadError」，先確認是不是 webkit／mobile-safari project、是不是落在
整輪的中後段——如果是，直接視為已知噪音，不用開新的調查；只有在**真正看到
測試失敗、且失敗的 proximate error 本身就是 ChunkLoadError（不是普通的
30s timeout）**時，才需要重新認真看待這件事。

若有人再度質疑「這會不會其實是產品面的 race」，**不必重跑整套調查**——
直接引用上方 production build 對照實驗（dev 19～90 次 vs production 0 次，
且 production bundle 內不存在那兩個會失敗的 chunk）即可結案。
