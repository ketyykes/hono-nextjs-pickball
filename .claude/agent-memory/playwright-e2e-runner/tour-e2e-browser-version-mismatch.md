---
name: tour-e2e-browser-version-mismatch
description: 「firefox/webkit/mobile-safari 本機瀏覽器版本落後」曾被當成非 chromium E2E 失敗的預設歸因，但 2026-08-15 實測版本並不落後——此前提已不成立，不要再用它解釋失敗
metadata:
  type: project
---

## 這條結論的來源

repo 內多處把「非 chromium project 失敗／不跑」歸因於本機瀏覽器版本落後：

- `openspec/changes/archive/2026-08-12-site-navbar-spec-and-rwd/design.md:56`：
  「firefox/webkit/mobile-safari 的本機瀏覽器版本落後是已知問題（見 archive 記錄）」
- `nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts` 的檔頭註解重複同一句

兩處都寫「見 archive 記錄」，但**追不到原始證據**——archive 內沒有對應的失敗 log、
沒有版本號、也沒有指出是哪一支測試在哪個引擎上失敗。這條「已知問題」實際上是
一句被反覆引用的傳聞，不是可查核的事實。

## 2026-08-15 實測：前提已不成立

```
pnpm exec playwright --version        → Version 1.60.0
pnpm exec playwright install --dry-run
  Chrome for Testing 148.0.7778.96  (chromium v1223)
  Firefox 150.0.2                   (firefox  v1522)
  WebKit 26.4                        (webkit   v2287)
```

三個引擎都是當期版本，沒有任何一個落後。與 tour 有關的唯一具體引擎相依是
`openspec/changes/archive/2026-05-08-add-tour-experience/design.md:102` 記的
「CSS scroll-timeline 在 Firefox 142 才正式支援」——現況 Firefox 150 早已滿足，
而且 tour 本來就有 motion `useScroll` fallback（`lib/scrollTimeline.ts` 一次性偵測），
偵測失敗會自動降級，不會直接紅燈。

`tests/e2e/specs/tour.spec.ts` 現況**沒有任何 `test.skip`**，5 個 project 全跑。
換句話說，「tour 因為瀏覽器版本落後而在非 chromium 失敗」在現行程式碼裡
連對應的 skip 都不存在。

## How to apply

1. **不要再用「瀏覽器版本落後」解釋任何非 chromium 失敗**。遇到 firefox/webkit/
   mobile-safari 專屬失敗，先查真實成因——本 repo 已知的兩個真因是版面幾何
   （[[project_scoreboard-mobile-safari-overlap-bug]]，`subtree intercepts pointer events`）
   與量測時序（[[playwright-flaky-viewport-measurement-pattern]]）。
2. 若真的懷疑版本，**先跑 `pnpm exec playwright install --dry-run` 把版本號貼出來**
   再下結論，不要引用本檔以外的傳聞。
3. 現存兩支只跑 chromium 的 spec，skip 本身仍合理，但理由要看清楚：
   - `api-health.spec.ts`：通路測試與引擎無關 —— 理由成立，維持原狀。
   - `navbar-rwd.spec.ts`：理由有兩半，「排版行為與引擎無關」成立，
     「版本落後」那半已過時，註解值得修掉。**尚未驗證**拿掉 skip 後
     firefox/webkit 是否真能全綠（需實跑確認，屬 follow-up）。
