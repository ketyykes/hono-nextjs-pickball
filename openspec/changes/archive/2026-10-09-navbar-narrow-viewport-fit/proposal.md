# Proposal: navbar-narrow-viewport-fit

## Why

在 320px 寬的裝置上，SiteNavbar 最右邊的「對戰分配」連結被切到畫面外，使用者回報看不到。
`site-navbar` 主 spec 的「窄螢幕導航呈現」Requirement 規定「所有斷點維持 5 個導航連結全部可見」，
但它的 Scenario 與 E2E 只驗 390px，因此這個違規一直沒被抓到。

2026-10-09 於 `/matchmaker` 實測（chromium）：導航列內容需要約 **362px**
（容器左右 `px-4` 共 32、logo 20、`gap-3` 12、五個連結 298）。320px 時「對戰分配」右緣落在
**346px**，有 26px 在畫面外。

## What Changes

- 視口寬度 **< 375px** 時，SiteNavbar 讓出空間的方式改為：
  - 隱藏 logo（「首頁」連結本來就是同一個入口，功能不損失）
  - 容器水平內距由 `px-4` 縮為 `px-3`
  - 連結水平內距由 `px-2` 縮為 `px-1.5`
- 視口寬度 **≥ 375px** 的呈現完全不變（含 390px 下只留圖示的 logo、既有間距）
- 五個連結的文案不變，不改為漢堡選單、不改為橫向捲動
- `navbar-rwd.spec.ts` 新增 320px 的 E2E 驗收，以「連結完整落在視口內」斷言
  （既有的 `toBeVisible()` 不檢查是否被切出視口，這是原本漏抓的原因）

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `site-navbar`：「窄螢幕導航呈現」Requirement 新增 < 375px 的空間讓出規則與 320px 驗收 Scenario

## Impact

- 程式碼：`nextjs-pickball/components/layout/SiteNavbar.tsx`（只改 className）
- 測試：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`（新增 test）
- 規格：`openspec/specs/site-navbar/spec.md`（archive 時由 delta 合併）
- 無新相依、無 API／資料變更、不動 `hono-pickball/**`
- 與之後的全站視覺改版（另開 change）無衝突：改版若替換 🏓 logo，< 375px 隱藏 logo 的規則照樣適用
