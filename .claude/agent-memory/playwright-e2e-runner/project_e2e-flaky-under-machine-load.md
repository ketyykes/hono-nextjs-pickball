---
name: project_e2e-flaky-under-machine-load
description: 多個 browser project（含 chromium/firefox，非只 webkit）同時出現 beforeEach 30s timeout 時，先查 uptime 負載，別急著懷疑測試或產品程式碼
metadata:
  type: project
---

在 add-player-roster 的 player-roster.spec.ts 驗收過程中實測到：同一份測試、同一支 spec，
連續執行時結果差異極大——

- `--workers=3`／`--workers=2`：20 tests（5 project × 4 test）全綠，單一 test 僅 1–3 秒。
- 預設 `--workers=4`：一次是 10 failed（webkit/mobile-safari 的 ChunkLoadError console 噪音，
  符合 [[e2e-webserver-cold-start-chunkloaderror]] 既有記錄），另一次是 **chromium 全部 4 個
  test、firefox 3 個 test** 都在 `Test timeout of 30000ms exceeded while running "beforeEach"
  hook`（`page.goto("/")` 本身卡死），這已超出該既有記錄「100% 只在 webkit/mobile-safari」的
  範圍。

## 根因判斷

當時 `uptime` 顯示 `load averages: 40.44 52.46 34.46`（8 核機器、**13 個並發使用者 session**）——
這是一台被多人／多 agent 共用的機器，不是専屬的乾淨執行環境。load average 遠超核心數時，
Node/Chromium/Firefox/WebKit 進程加上兩個 dev server（Turbopack + wrangler）互相搶 CPU，
連最基本的 `page.goto("/")` 都可能真的卡到 30 秒逾時——這是**機器層級的資源競爭**，
不是測試寫法或產品程式碼的問題。

## How to apply

再次遇到「同一批測試，多個 browser project **同時**出現 proximate error 為
`Test timeout of ...ms exceeded while running "beforeEach" hook`（尤其牽連到平常很穩定的
chromium/firefox，不是只有 webkit/mobile-safari 的 console 噪音）」時：

1. 先跑 `uptime`，若 load average 明顯超過 `sysctl -n hw.ncpu` 的核心數（本機 8 核），
   直接判定為機器過載噪音，不用懷疑測試邏輯或去改產品程式碼。
2. 用 CLI flag `--workers=2`（或更低）**重跑同一份測試**做最終確認——這只是執行期參數，
   不算修改 `playwright.config.ts`。若在較低並發下乾淨全綠，就是測試本身沒問題的有力證據。
3. 回報時把「乾淨環境下全綠」與「高負載下的逾時／ChunkLoadError」都寫進去，並附上
   `uptime` 數據佐證，讓使用者知道這是環境噪音而非迴歸。
4. 不要因為這個現象去改 `playwright.config.ts` 的 `workers`／`webServer`——沿用
   [[e2e-webserver-cold-start-chunkloaderror]] 既有結論，改動只會拖慢日常執行速度。

參見 nextjs-expert 的 [[e2e-webserver-cold-start-chunkloaderror]]（同一個 repo 的
`.claude/agent-memory/nextjs-expert/e2e-webserver-cold-start-chunkloaderror.md`）——
該記憶記錄的是「webkit/mobile-safari 專屬、dev-only、production build 下 0 次重現」的
ChunkLoadError console 噪音本身；本記憶補充的是「同一類噪音在機器嚴重過載時會擴大成
跨 browser project 的 beforeEach 逾時」這個更廣的現象與判斷方法。
