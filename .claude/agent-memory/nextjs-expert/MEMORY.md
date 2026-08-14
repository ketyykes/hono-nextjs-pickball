# Memory Index

- [scoreboard container query cqh self-fallback](scoreboard-container-query-cqh-self-fallback.md) — cqh/cqw 寫在 container-type:size 元素自己身上會 fallback 視口；playwright mobile-safari 預設 viewport 是 664px 非 844px
- [playwright-core standalone 腳本解析陷阱](playwright-core-standalone-script-resolution.md) — pnpm 間接依賴+ESM 路徑解析，直接 import "playwright-core" 會 404，需用 require.resolve 找絕對路徑
- [OrientationHint 是 isLandscape 的可靠 proxy signal](scoreboard-orientation-hint-proxy-signal.md) — E2E 測橫式排版前先等 hint 消失，避免量在 hydration 前的 portrait 過渡態
- [E2E webServer 冷啟動 ChunkLoadError](e2e-webserver-cold-start-chunkloaderror.md) — 全量 5-project 並行首輪偶發，chromium 最先幾個 test 中招，與測試邏輯無關；驗證前先暖機可規避
