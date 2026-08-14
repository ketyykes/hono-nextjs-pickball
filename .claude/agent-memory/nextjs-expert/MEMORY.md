# Memory Index

- [scoreboard container query cqh self-fallback](scoreboard-container-query-cqh-self-fallback.md) — cqh/cqw 寫在 container-type:size 元素自己身上會 fallback 視口；playwright mobile-safari 預設 viewport 是 664px 非 844px
- [playwright-core standalone 腳本解析陷阱](playwright-core-standalone-script-resolution.md) — pnpm 間接依賴+ESM 路徑解析，直接 import "playwright-core" 會 404，需用 require.resolve 找絕對路徑
