---
name: e2e-webserver-cold-start-chunkloaderror
description: 完整 5-project E2E 全量並行執行時，chromium 最先起跑的幾個 test 偶爾因 dev server（Turbopack）冷啟動被 5 個瀏覽器同時打而噴 ChunkLoadError，與測試程式碼無關
type: project
---

## 現象

`pnpm --filter ./nextjs-pickball exec playwright test <spec>` 在**沒有預先啟動
dev server**（`playwright.config.ts` 的 `webServer` 自己接手起 `pnpm --filter
hono-pickball dev` + `pnpm dev`）時，若該次是冷啟動，第一個排到的 project
（`chromium`，因為 `projects` 陣列順序是 chromium 排第一）最先跑的幾個 test
會噴：

```
Page error: ChunkLoadError: Failed to load chunk /_next/static/chunks/...
  from module [turbopack]/browser/dev/hmr-client/hmr-client.ts [app-client]
```

固定是**同一批最先執行的 test**（照 spec 內的先後順序，例如某次連續兩輪
都是同一 spec 檔前 4 個 test），不是隨機分散在整份測試裡，且與該測試本身
的斷言邏輯無關——**單獨跑 `--project=chromium`（unconditional 4 workers）
時完全不會重現**，因為此時對 dev server 的初始並發請求量小很多。

## 根因判斷

`workers` 未設定時（非 CI）Playwright 用近似 CPU 核心數的並發數，加上
`fullyParallel: true`，5 個 browser project 會在 dev server 剛啟動、
Turbopack 尚未把所有 chunk 編譯完成時就同時發出大量並發導覽請求，
`webServer.url` 的 readiness check 只驗證某個端點回 2xx，不代表所有路由的
chunk 圖已經編譯完成——冷啟動 + 高並發首次導覽的組合會讓某些 client chunk
請求打空，才噴 `ChunkLoadError`。這是 **dev server 基礎設施層的競態，
與 spec 檔內任何測試邏輯（含 orientation 相關的量測時序）完全無關**。

## 已驗證的規避方式

**不要**去改動測試程式碼或 `playwright.config.ts` 的 `workers`/`fullyParallel`
設定來繞開這個問題（不在授權範圍內，也不是這個問題該修的地方）。若需要
在驗證階段拿到穩定的全量 4 輪結果，改為**在跑 playwright 前手動先把兩個
dev server 起好、暖機過至少一次頁面導覽**，讓 `reuseExistingServer:
!process.env.CI`（非 CI 時為 `true`）在 playwright 啟動時偵測到已有 server
在跑而直接沿用，不再冷啟動：

```bash
(pnpm --filter hono-pickball dev > /tmp/x/hono.log 2>&1 &)
(pnpm --filter ./nextjs-pickball dev > /tmp/x/next.log 2>&1 &)
# 輪詢至兩個 health endpoint 皆回 200 後，再各 curl 一次要測的路由暖機
curl -s http://localhost:3005/scoreboard >/dev/null
# 之後才開始跑 playwright test，且中間不要讓這兩個 dev server 進程被殺掉
```

驗證完畢記得 `pkill` 掉手動起的 `wrangler dev` 與 `next dev --port 3005`
進程，避免佔用 :3005/:8787 影響下一次自動 webServer 啟動。

**How to apply**：日後任何一次「跑 3 輪＋序列 1 輪、要求全綠」的 E2E flaky
驗證任務，若观察到**只有第一輪、且只有 chromium 最先幾個 test**失敗、
錯誤訊息含 `ChunkLoadError` 而非測試斷言訊息，先假設是這個已知的冷啟動
競態，用上述暖機流程重跑，不要誤判成自己剛改的測試邏輯有問題。
