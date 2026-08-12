## Purpose

定義全站共享的固定頂部導航列（SiteNavbar）規格，包含樣式切換行為、路由 active 標示與 view transition 整合。
## Requirements
### Requirement: 全域導航列

全站共享的 fixed top header，高度 h-14（56px），z-index 110，掛在 root layout 的 `<ViewTransition>` 外側，不受路由過場動畫影響。透明態與 solid 態的配色 SHALL 與 TocBar 在首頁堆疊時形成自然視覺階序（同色系不同 alpha），避免兩條 nav 看起來像獨立的橫條切割。

樣式態的判定 SHALL 以「路由是否為 `/`」表述，SHALL NOT 逐一列舉非首頁路由 —— 實作 `nextjs-pickball/components/layout/SiteNavbar.tsx` 為 `const solid = !isHome || pastHero`，任何列舉都會在新增路由時漏列（`/health` 就是如此漏掉的）。

`NAV_LINKS` 僅包含公開內容路由；內部診斷路由 SHALL NOT 列入（見 `api-connectivity` capability 的「`/health` 為內部診斷路由」Requirement）。

#### Scenario: 首頁捲動前樣式

- **WHEN** 路由為 `/`，且 `window.scrollY ≤ window.innerHeight - 56`（尚未捲過 Hero）
- **THEN** Navbar 背景為半透明深色 `bg-slate-900/20 backdrop-blur-sm`，底部 border 為 `border-white/5`（降低與下方 TocBar 的視覺切割），連結文字為白色

#### Scenario: 首頁捲動後樣式

- **WHEN** 路由為 `/`，且 `window.scrollY > window.innerHeight - 56`
- **THEN** Navbar 背景為 `bg-background/85 shadow-sm backdrop-blur-md`，連結文字深色

#### Scenario: 非首頁路由樣式

- **WHEN** 路由**不為** `/`（含 `/tour`、`/scoreboard`、`/quiz`、`/health` 及日後新增的任何路由）
- **THEN** Navbar 一律顯示 solid 樣式 `bg-background/85 shadow-sm backdrop-blur-md`（不看捲動位置）

#### Scenario: 連結點擊帶 view transition

- **WHEN** 使用者點擊「計分板」或「完整體驗」連結
- **THEN** 觸發 `transitionTypes={["nav-forward"]}`；點擊「首頁」時觸發 `transitionTypes={["nav-back"]}`

#### Scenario: 診斷路由不出現在導航列

- **WHEN** 檢查 `nextjs-pickball/components/layout/SiteNavbar.tsx` 的 `NAV_LINKS`
- **THEN** 不含 `/health`；該路由僅供直接輸入網址存取

### Requirement: 全域 navbar 高度以 CSS variable 暴露

`nextjs-pickball/app/globals.css` 的 `:root` SHALL 定義 `--site-nav-h: 3.5rem`（= 56px，對應 `h-14`）作為 SiteNavbar 高度的**單一事實來源**。

所有 layout 元件（含 SiteNavbar 自身、Hero、TocBar、TourShell）SHALL 透過該變數取用高度，SHALL NOT 在元件內硬寫數值。需要以 px 參與 JS 運算時 MUST 經 `nextjs-pickball/lib/navHeight.ts` 的 `getNavHeightPx()` 換算，該函式 SHALL 支援 `rem` 與 `px` 兩種宣告並在無法解析時退回 fallback。

> 先前版本的 SHALL 主詞是「**其他** layout 元件（Hero、TourShell 等）」，未涵蓋 SiteNavbar 自身與 TocBar，
> 兩者因此各自硬寫 `56`。本次把主詞擴及所有 layout 元件，並提供共用換算函式使其可落實。

#### Scenario: globals.css 定義 --site-nav-h

- **WHEN** 檢查 `nextjs-pickball/app/globals.css`
- **THEN** `:root` 區塊內存在 `--site-nav-h: 3.5rem;` 一條 CSS variable

#### Scenario: SiteNavbar 元件高度仍維持 h-14

- **WHEN** 檢查 `nextjs-pickball/components/layout/SiteNavbar.tsx`
- **THEN** `<header>` 套用 Tailwind class `h-14`（與 `--site-nav-h` 在數值上一致）

#### Scenario: 捲動門檻讀取 CSS 變數而非硬寫數值

- **GIVEN** `--site-nav-h` 被設為 `100px`、viewport 高度為 800px
- **WHEN** SiteNavbar 計算「是否已捲離 Hero」的門檻
- **THEN** 門檻為 700（而非硬寫 56 得出的 744）
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「捲離 Hero 的門檻讀取 --site-nav-h 而非硬寫數值」

#### Scenario: 預設值換算正確

- **GIVEN** `--site-nav-h` 為預設的 `3.5rem`、viewport 高度為 800px
- **WHEN** SiteNavbar 計算門檻
- **THEN** 門檻為 744
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「--site-nav-h 為預設 3.5rem 時門檻為 viewport 高度減 56」

#### Scenario: 換算函式支援 rem 與 px 並有 fallback

- **WHEN** 呼叫 `getNavHeightPx()`
- **THEN** `3.5rem` 依 root font-size 換算（16px → 56、20px → 70）；`72px` 直接取 72；變數未定義或無法解析時回傳 `NAV_HEIGHT_FALLBACK_PX`
- **驗收**：`nextjs-pickball/lib/navHeight.test.ts`，5 個 it

### Requirement: 測驗連結

`SiteNavbar` MUST 提供「測驗」連結指向 `/quiz`，與既有「計分板」「完整體驗」等連結並列顯示。當路由為 `/quiz` 時，該連結 MUST 呈現 active 標示樣式。

#### Scenario: Navbar 顯示測驗連結

- **WHEN** 使用者位於任一頁面
- **THEN** Navbar 內可見文字為「測驗」的連結，`href === "/quiz"`

#### Scenario: /quiz active 標示

- **WHEN** 路由為 `/quiz`
- **THEN** 「測驗」連結套用 active 樣式；其餘連結為 muted 樣式

#### Scenario: E2E 從 Navbar 進入測驗

- **WHEN** 從首頁點擊 Navbar 的「測驗」連結
- **THEN** 導向 `/quiz` 並顯示第 1 題（對應 `nextjs-pickball/tests/e2e/specs/quiz.spec.ts` 第一個情境）

### Requirement: 窄螢幕導航呈現

SiteNavbar SHALL 在所有斷點維持 4 個導航連結全部可見，SHALL NOT 收合為漢堡選單或橫向捲動 —— 連結只有 4 個共 11 個中文字，藏起來等於替每一次導航多加一次點擊。

窄螢幕的空間 SHALL 由下列方式讓出：logo 文字（「匹克球指南」）於 `sm` 斷點以下收合、只保留 🏓 圖示；容器間距由 `gap-6 px-6` 縮為 `gap-3 px-4`；連結水平內距由 `px-3` 縮為 `px-2`。

logo 與所有導航連結 MUST 套用 `whitespace-nowrap`。**這是本 Requirement 的核心** —— 實測發現真正的破口不是橫向溢出，而是文字在固定 `h-14`（56px）的 bar 內斷成兩行。

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

#### Scenario: logo 文字依斷點收合

- **WHEN** viewport 寬度 ≥ 640px（`sm`）
- **THEN** logo 顯示「🏓 匹克球指南」
- **WHEN** viewport 寬度 < 640px
- **THEN** logo 只顯示 🏓，「匹克球指南」文字為 hidden
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「寬螢幕顯示 logo 文字，窄螢幕收合只留圖示」

#### Scenario: 窄螢幕下不橫向溢出

- **GIVEN** viewport 寬度為 390px
- **WHEN** 量測 header 內層容器
- **THEN** `scrollWidth <= clientWidth`
- ⚠️ **此條為輔助斷言，不可單獨作為驗收**：header 是 flex 容器，子元素會被壓縮到剛好填滿寬度，
  因此該等式在修正前後皆恆成立，驗不出換行問題
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下導航列內容不橫向溢出」

