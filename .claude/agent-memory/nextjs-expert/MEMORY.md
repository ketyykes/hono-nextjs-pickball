# Memory Index

- [scoreboard container query cqh self-fallback](scoreboard-container-query-cqh-self-fallback.md) — cqh/cqw 寫在 container-type:size 元素自己身上會 fallback 視口；playwright mobile-safari 預設 viewport 是 664px 非 844px
- [playwright-core standalone 腳本解析陷阱](playwright-core-standalone-script-resolution.md) — pnpm 間接依賴+ESM 路徑解析，直接 import "playwright-core" 會 404，需用 require.resolve 找絕對路徑
- [OrientationHint 是 isLandscape 的可靠 proxy signal](scoreboard-orientation-hint-proxy-signal.md) — E2E 測橫式排版前先等 hint 消失，避免量在 hydration 前的 portrait 過渡態
- [E2E webServer 冷啟動 ChunkLoadError](e2e-webserver-cold-start-chunkloaderror.md) — dev-only 噪音，**已用 production build 對照結案**（dev 19～90 次 vs production 0 次）；不必改設定
- [Playwright 幾何量測 flaky 定式](playwright-flaky-viewport-measurement-pattern.md) — `page.evaluate()` 一次性量測 + 純值 expect 沒有 auto-retry；抽成量測函式 + `expect.poll` 每次重試重量
- [matchmaker-allocation-engine TDD 進度與 tie-fixture 退化陷阱](matchmaker-allocation-engine-tdd-pattern.md) — §1～14 全數完成（commit ad1db49）；記錄 avoidRepeats fixture 設計法、mutation test 流程、以及「全相異/全相等 fixture 測不到 comparator 相等分支」的通用陷阱與 `not.toBe` 唯讀檢查技巧
