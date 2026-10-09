# Test Plan: navbar-narrow-viewport-fit

> **RED-phase 承諾書**。只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> **範圍說明**：delta spec 為 MODIFIED，逐字保留了既有的五條 390px／斷點 Scenario，
> 它們已由 `navbar-rwd.spec.ts` 既有 test 覆蓋、行為不變，本 change 不新增也不修改其測試。
> 下表只列**新增**的兩條 Scenario。
>
> SiteNavbar 為純呈現型元件，依 `nextjs-pickball/CLAUDE.md` 的 TDD 例外層以 Playwright E2E
> 驗收；既有檔案限定只在 chromium 跑（排版行為與瀏覽器引擎無關），新增 test 沿用同一個
> `describe` 與 skip 條件。
>
> **test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致**。

## site-navbar

### Requirement: 窄螢幕導航呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 320px 下五個導航連結完整落在視口內 | 320px 下五個導航連結完整落在視口內 | viewport 320×700 開啟 `/` → 五個連結（`getByRole("link", { name, exact: true })`）皆 `toBeInViewport({ ratio: 1 })`；另量 1280px 下的連結高度，320px 下各連結高度 ≤ 寬螢幕高度 + 4 | golden path：本缺陷本身。修正前「對戰分配」右緣在 346px，`ratio: 1` 必失敗——這是本 change 的真紅燈 | e2e |
| 小於 375px 時隱藏 logo、375px 起恢復 | 小於 375px 時隱藏 logo、375px 起恢復 | viewport 320 開啟 `/` → `header > div > a` 的第一個（logo）為 hidden；改為 375 → 該元素 visible，且 `header` 內「匹克球指南」文字仍 hidden | edge case：釘住斷點邊界（`<` 而非 `<=`）與 logo 隱藏手段。修正前 320px 下 logo 為 visible，寫下即紅 | e2e |

---

## Checklist

- [x] Every requirement listed above has at least one matching test
- [x] 每個新增 Scenario 皆有對應測試；未列出的既有 Scenario 行為不變、沿用既有測試
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names 與 delta spec 的「驗收」錨點逐字一致
