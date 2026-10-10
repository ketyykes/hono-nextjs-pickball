# Specification: site-navbar

## MODIFIED Requirements

### Requirement: 窄螢幕導航呈現

SiteNavbar SHALL 在所有斷點維持 5 個導航連結全部可見，SHALL NOT 收合為漢堡選單或橫向捲動
—— 連結只有 5 個共 15 個中文字，藏起來等於替每一次導航多加一次點擊。

> 本次由 4 個增為 5 個（新增「對戰分配」→ `/matchmaker`）。字數由 11 增為 15，
> 390px 寬視口下的估算餘裕見 design Decision 7；若實測換行，SHALL 先縮短連結文案
> （「對戰分配」→「對戰」），SHALL NOT 改為漢堡選單——「不收合」是本 Requirement 的立場，
> 不因多一條連結而放棄。
>
> 下方「窄螢幕下四個連結全部可見」Scenario 的標題**刻意未改名**：openspec 的 MODIFIED
> 語意是整段取代，改掉 Scenario 標題會被判為「刪除了既有 Scenario」而擋下（實測
> `openspec validate --strict` 會報 `omits scenario(s) the current spec still has`）。
> 該 Scenario 因此原樣保留為既有四條連結的 regression guard，第 5 條連結另立
> 「窄螢幕下對戰分配連結亦可見」一條。兩條合起來即為「5 個全部可見」。

窄螢幕的空間 SHALL 由下列方式讓出：logo 文字（「匹克球指南」）於 `sm` 斷點以下收合、只保留
`LogoMark` 符號；容器間距由 `gap-6 px-6` 縮為 `gap-3 px-4`；連結水平內距由 `px-3` 縮為 `px-2`。

視口寬度 **< 375px** 時 SHALL 再讓出一層空間：logo 整個隱藏（含 `LogoMark` 符號）；容器水平內距由
`px-4` 縮為 `px-3`；連結水平內距由 `px-2` 縮為 `px-1.5`。實作 MUST 以 Tailwind 的
`max-[375px]:` variant 表達（對應 `@media (width < 375px)`），SHALL NOT 以 JS 量測視口寬度。
視口寬度 ≥ 375px 時 SHALL 維持上一段的呈現，零差異。

> **為什麼是隱藏 logo 而不是先縮短文案**：上方引言的「先縮短連結文案」是針對 390px **換行**
> 的預案；本層處理的是 < 375px 的**橫向切出視口**（2026-10-09 實測：導航列內容需約 362px，
> 320px 時「對戰分配」右緣落在 346px）。logo 與「首頁」連結指向同一路由，隱藏它不損失任何
> 導航能力；縮短文案則會讓同一條連結在不同寬度下名稱不一致。兩案經使用者選定前者
> （change `navbar-narrow-viewport-fit` 的 design）。
>
> **為什麼 375px**：375px（iPhone SE 2／3、iPhone mini）以上 362px 的內容放得下，
> 且既有 390px 的 Scenario 全數落在 ≥ 375px 側而不受影響。

logo 與所有導航連結 MUST 套用 `whitespace-nowrap`。**這是本 Requirement 的核心** ——
實測發現真正的破口不是橫向溢出，而是文字在固定 `h-14`（56px）的 bar 內斷成兩行。

#### Scenario: 窄螢幕下 logo 與導航連結皆不換行

- **GIVEN** viewport 寬度為 390px（iPhone 12）
- **WHEN** 開啟任一路由
- **THEN** logo 與導航連結的高度不高於寬螢幕（1280px）下的高度（容許 4px 字型度量誤差）
- **實測基準**：修正前 logo 高度 20px → **40px**、連結高度 36px → **56px**（皆換行）；修正後兩者在窄寬螢幕一致
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下 logo 與導航連結皆不換行」

#### Scenario: 窄螢幕下四個連結全部可見

- **GIVEN** viewport 寬度為 390px
- **WHEN** 開啟任一路由
- **THEN** 「首頁」「完整體驗」「計分板」「測驗」四個連結皆為 visible
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下四個導航連結全部可見」

#### Scenario: 窄螢幕下對戰分配連結亦可見

- **GIVEN** viewport 寬度為 390px
- **WHEN** 開啟任一路由
- **THEN** 第 5 條連結「對戰分配」亦為 visible，且與其餘四條同列不換行
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下對戰分配連結亦全部可見」

#### Scenario: logo 文字依斷點收合

- **WHEN** viewport 寬度 ≥ 640px（`sm`）
- **THEN** logo 顯示 `LogoMark` 符號與「匹克球指南」
- **WHEN** viewport 寬度 < 640px
- **THEN** logo 只顯示 `LogoMark` 符號，「匹克球指南」文字為 hidden
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「寬螢幕顯示 logo 文字，窄螢幕收合只留圖示」

#### Scenario: 窄螢幕下不橫向溢出

- **GIVEN** viewport 寬度為 390px
- **WHEN** 量測 header 內層容器
- **THEN** `scrollWidth <= clientWidth`
- ⚠️ **此條為輔助斷言，不可單獨作為驗收**：header 是 flex 容器，子元素會被壓縮到剛好填滿寬度，
  因此該等式在修正前後皆恆成立，驗不出換行問題
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下導航列內容不橫向溢出」

#### Scenario: 320px 下五個導航連結完整落在視口內

- **GIVEN** viewport 寬度為 320px
- **WHEN** 開啟任一路由
- **THEN** 「首頁」「完整體驗」「計分板」「測驗」「對戰分配」五個連結皆**完整**落在視口內（不只是 visible，左右邊緣皆不被切出視口）
- **THEN** 五個連結的高度不高於寬螢幕（1280px）下的高度（容許 4px 字型度量誤差），即不換行
- ⚠️ 斷言 MUST 使用 Playwright 的 `toBeInViewport({ ratio: 1 })`：`toBeVisible()` 不檢查元素是否被切出視口，修正前「對戰分配」右緣在 346px 時它依然通過——這正是本缺陷未被既有 390px 測試抓到的原因
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「320px 下五個導航連結完整落在視口內」

#### Scenario: 小於 375px 時隱藏 logo、375px 起恢復

- **GIVEN** viewport 寬度為 320px
- **WHEN** 開啟任一路由
- **THEN** header 內的 logo 連結為 hidden
- **WHEN** viewport 寬度改為 375px
- **THEN** logo 連結恢復為 visible（只顯示 `LogoMark` 符號，「匹克球指南」文字仍依 `sm` 斷點 hidden）
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「小於 375px 時隱藏 logo、375px 起恢復」
