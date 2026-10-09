# Design: navbar-narrow-viewport-fit

## Context

`nextjs-pickball/components/layout/SiteNavbar.tsx` 的版面是一條 flex：
`[logo] gap-3 [nav ml-auto: 5 個連結]`，容器 `px-4`，所有文字 `whitespace-nowrap`。

2026-10-09 於 dev server（chromium，`/matchmaker`，solid 樣式）實測各寬度：

| 視口 | 容器 | logo | nav 內容 | 「對戰分配」右緣 |
|---|---|---|---|---|
| 320 | 320 | 20 | 298 | **346**（超出 26px） |
| 360 | 360 | 20 | 298 | 346（連結可見，但右側 `px-4` 內距被吃掉） |
| 375 | 375 | 20 | 298 | 359 |
| 390 | 390 | 20 | 298 | 374 |

所需寬度 = 16 + 20 + 12 + 298 + 16 = **362px**。

既有 E2E（`navbar-rwd.spec.ts`）只在 390px 驗證，且可見性用 `toBeVisible()`——Playwright 的
`toBeVisible()` 不考慮元素是否位於視口外，所以即使在 320px 下也驗不出問題。

## Goals

- 320px 起五個連結完整落在視口內、不換行
- ≥ 375px 的呈現零差異

## Non-Goals

- 不縮短任何連結文案、不改字級
- 不引入漢堡選單或橫向捲動（主 spec 的既有立場）
- 不處理 < 320px（主流行動裝置最窄寬度為 320px）
- 不處理全站視覺改版（另開 change），也不在本 change 內移除 🏓

## Decisions

### Decision 1: < 375px 時隱藏 logo＋縮內距

**Choice**：`max-[375px]:` 時 logo `hidden`、容器 `px-3`、連結 `px-1.5`。
所需寬度變為 12 + 278(nav: 298 − 5×4) + 12 = **302px**，320px 下留 18px 餘裕。

**Rationale**：logo 與「首頁」連結指向同一路由，隱藏它不損失導航能力；連結文案在所有寬度一致。
logo 消失時 nav 的 `ml-auto` 仍把連結推到右側，`gap-3` 因只剩一個 flex child 而不再佔空間。

**Alternatives considered**：
- 縮短文案（「完整體驗」→「體驗」、「對戰分配」→「對戰」，需搭配 `aria-label` 保留完整名稱）：
  同一連結在不同寬度名稱不一致，且會影響以連結名稱定位的既有 E2E。使用者選擇不採用
- 只縮內距不隱藏 logo：最多省 5×4 + 8 = 28px，仍差 14px，不夠
- 縮小字級：15 個字每字省 1px 只省 15px，且犧牲可讀性

### Decision 2: 斷點取 375px，用 Tailwind arbitrary `max-*` variant

**Choice**：`max-[375px]:`（Tailwind v4 產生 `@media (width < 375px)`）。

**Rationale**：375px 以上 362px 的內容放得下；375 是 iPhone SE 2/3、mini 的寬度，現有 390px
Scenario 全落在不受影響側。專案 `globals.css` 未定義 `xs` 之類的自訂斷點，單一元件用 arbitrary
variant 比新增全站斷點變數更局部。

**Alternatives considered**：
- 取 362px 剛好的值：數字沒有裝置意義，日後連結文字一變就得重算
- 在 `@theme` 新增 `--breakpoint-xs`：只有一處使用，屬過早抽象

### Decision 3: E2E 用 `toBeInViewport({ ratio: 1 })`

**Choice**：320px 的可見性斷言用 `toBeInViewport({ ratio: 1 })`，再加高度不倍增的換行斷言。

**Rationale**：這是能讓修正前**真紅**的斷言（`toBeVisible()` 修正前也會綠）。

**Alternatives considered**：
- 手動 `getBoundingClientRect().right <= innerWidth`：等價但較冗長，Playwright 已有內建 matcher

## Risks / Trade-offs

- [Risk] 320～374px 使用者看不到品牌 logo → Mitigation：「首頁」連結仍在；本站無其他品牌識別依賴 logo
- [Risk] 日後新增第 6 條連結或拉長文案會再次超出 → Mitigation：新的 320px E2E 會直接紅燈
- [Risk] Tailwind `max-[375px]` 語意若與預期不符（`<` vs `<=`）→ Mitigation：「375px 起恢復」Scenario 在 375px 斷言 logo 可見，邊界值直接被測到

## Migration Plan

純 className 變更，無資料或部署順序考量；回滾即 revert 該 commit。

## Open Questions

（無）
