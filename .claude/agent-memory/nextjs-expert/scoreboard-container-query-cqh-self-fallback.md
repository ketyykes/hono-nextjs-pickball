---
name: scoreboard-container-query-cqh-self-fallback
description: container-type:size 元素自身的 gap/padding 用 cqh/cqw 會 fallback 回視口單位；需降一層子孫元素才查得到；playwright mobile-safari 預設 viewport 是 664px 不是 844px
type: project
---

## Container query 單位在容器「自己身上」查不到自己

`nextjs-pickball/components/scoreboard/TeamPanel.tsx` 曾因此產生 Mobile Safari
專屬的版面重疊 regression（2026-08-14 修於 commit `1cba147`，分支
`feat/scoreboard-target-score`）。

一個元素若自己是 `container-type: size` 的 query container，**它自己身上**
的 CSS 屬性若寫 `cqh`/`cqw`，規格上會 fallback 回小視口單位（等同 `svh`/`svw`），
不會查詢到「自己」——container query 單位永遠查詢「最近的祖先 container」，
容器自己不算在內。

**修法**：要讓某元素的 `gap`/`padding`/字級等屬性用 cqh/cqw 正確反映該
container 的實際高度，該屬性必須寫在 container 的**子孫元素**上（哪怕只是
多包一層 100% 高寬的 wrapper div），而不是寫在 container 自身。

TeamPanel 原本因為這個限制，把 gap/padding 改用 `dvh`（反映整個視口高度）
繞過去，但 `dvh` 不會隨「面板實際被同層兄弟元素（如 `ScoreboardSetup`）
擠壓後的可用高度」縮小——只有寫在正確位置的 cqh 字級會縮，兩者不同步時，
面板實際可用高度變小但 gap/padding 不變小，內容總高度就會超出面板高度，
且 `justify-content: center` 在沒有 `safe` 關鍵字時會向頭尾對稱溢出，
擠壓相鄰面板、蓋住其可點擊按鈕（Playwright 報 `subtree intercepts pointer
events`）。

**Why**：這不是 WebKit 專屬的 `dvh`/`container-size` 時序 race condition
（一開始的假設），是通用 CSS 幾何問題，在任何引擎、任何視口只要「可用高度
被擠壓到臨界值」都會發生——只是剛好只有 `mobile-safari` project 的預設
viewport 矮到會踩到這條線。

**How to apply**：任何在 `@container-size` 元素上直接寫 cqh/cqw 的
gap/padding/margin，都要先確認是不是寫在容器自己身上；若是，改包一層
`h-full w-full` 的子孫 wrapper 再寫。同時建議在該容器加 `overflow-hidden`
作最後防線——即使 fluid 公式仍有次像素殘差，溢出只會裁在自己格內，不會
侵犯相鄰 flex item。

## Playwright `mobile-safari` project 的預設 viewport 不是 844px

`devices["iPhone 12"]`（`playwright-core`）的 `viewport` 是
`{width: 390, height: 664}`，`screen` 才是 `{width: 390, height: 844}`。
E2E 測試若沒有明確呼叫 `page.setViewportSize()`，實際跑的高度是 **664px**，
比 `mobile-chrome`（`devices["Pixel 5"]`，viewport 高度 727px）矮 63px。

這個落差常是「只有 mobile-safari 失敗、mobile-chrome 過」的真因，而非
瀏覽器引擎差異——手動用 devtools 把視窗調到 390×844 測試 Chromium 不會
重現，因為那不是 Playwright 實際跑的高度。診斷這類「單一 project 失敗」
的版面問題時，先用 `devices['<name>'].viewport` 印出實際數字，不要憑
device 名稱（如「iPhone 12」）假設高度。
