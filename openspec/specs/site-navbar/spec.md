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
`LogoMark` 符號；容器間距由 `gap-6 px-6` 縮為 `gap-1 px-4`；連結水平內距由 `px-3` 縮為 `px-1.5`。

視口寬度 **< 375px** 時 SHALL 再讓出一層空間：logo 整個隱藏（含 `LogoMark` 符號）；容器水平內距由
`px-4` 縮為 `px-3`；連結水平內距由 `px-1.5` 縮為 `px-1`。實作 MUST 以 Tailwind 的
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

> **為什麼 `< sm` 的間距再縮一階**（change `site-navbar-account-entry`）：帳號入口改為在所有寬度顯示
> （見「navbar 帳號入口於各寬度可見且預留固定寬度」），窄螢幕須在五個連結之後再放下一格圖示寬度。
> 舊值下 320px 只剩 18px、375px 只剩 17px 餘裕，入口（圖示 16px＋內距）加上容器間距 12px 放不下（B3 實測 320px 超出 10px、375px 超出 11px）。
> 改為連結內距 `px-1.5`（`< 375px` 為 `px-1`）、容器間距 `gap-1` 後，估算餘裕為 320px 10px、375px 13px、390px 28px。
> 連結內距 MUST 經 `nextjs-pickball/components/layout/navItemStyles.ts` 的 `NAV_ITEM_BASE` 單一來源表達（帳號入口共用），
> SHALL NOT 在 `SiteNavbar` 或 `AccountEntry` 內另寫一份內距。`>= sm` 的 `gap-6`、`px-6`、`px-3` 零變更。

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

#### Scenario: 窄螢幕導航呈現：連結內距與容器間距依斷點遞減

- **WHEN** 渲染 `SiteNavbar`
- **THEN** 五個導航連結的 class 皆含 `px-1.5`、`max-[375px]:px-1`、`sm:px-3`，且不含 `px-2`、`max-[375px]:px-1.5`
- **THEN** header 內層容器的 class 含 `gap-1` 與 `sm:gap-6`，且不含 `gap-3`
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「窄螢幕下導航連結內距與容器間距依斷點遞減」

### Requirement: 專注模式下隱藏

`document.documentElement` 帶有 `sb-focus` class 時，SiteNavbar SHALL 隱藏（`display: none`）；class 移除後 SHALL 恢復顯示。

`sb-focus` 存在期間，本 requirement 優先於「全域導航列」與「窄螢幕導航呈現」的可見性條款（該兩條描述的是**未進入專注模式**時的行為）——專注模式是使用者明確選擇的沉浸狀態，隱藏導航是其定義的一部分，退出入口由 scoreboard 的浮動退出鈕提供。

實作 MUST 僅為 `nextjs-pickball/components/layout/SiteNavbar.tsx` header className 追加一個 Tailwind arbitrary variant（`[.sb-focus_&]:hidden`），SHALL NOT 引入對 scoreboard 狀態的任何 props／context／store 依賴 —— `sb-focus` class 的掛載與清除是 scoreboard capability（`useFocusMode`）的責任，SiteNavbar 只以 CSS 回應。

#### Scenario: sb-focus 時隱藏

- **GIVEN** 使用者於 `/scoreboard` 進入專注模式（`html.sb-focus`）
- **WHEN** 檢視 SiteNavbar
- **THEN** header 為 `display: none`，navbar 內連結皆不可見
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「專注模式：進入後隱藏 navbar 與設定列、退出後恢復」

#### Scenario: 退出專注模式後恢復

- **WHEN** `sb-focus` class 自 `document.documentElement` 移除（退出專注模式或離開 `/scoreboard`）
- **THEN** SiteNavbar 恢復顯示，樣式回到既有規則（非首頁路由為 solid 態）

#### Scenario: 其他路由不受影響

- **GIVEN** 使用者未進入專注模式
- **WHEN** 瀏覽任一路由
- **THEN** `document.documentElement` 不帶 `sb-focus`，SiteNavbar 行為與既有規格完全一致

### Requirement: 對戰分配連結

`SiteNavbar` MUST 提供「對戰分配」連結指向 `/matchmaker`，與既有「完整體驗」「計分板」「測驗」
等連結並列顯示。當路由為 `/matchmaker` 時，該連結 MUST 呈現 active 標示樣式。

此連結是 M1（`add-player-roster`）明文遞延的導覽整合：`/matchmaker/players` 當時刻意未掛進
navbar，理由是「功能尚不完整（有名單但還無法產生對戰）」。對戰畫面完成後該理由消失，因此
入口指向對戰頁 `/matchmaker` 而非名單頁——名單頁由 matchmaker 區段內的區段導覽抵達
（見 `match-stage` capability 的「對戰頁路由與 matchmaker 區段動線」Requirement），
SHALL NOT 在全站 navbar 同時放兩條 matchmaker 連結。

`NAV_LINKS` 僅包含公開內容路由的既有約束不變：`/matchmaker` 為公開內容路由，`/health` 仍
SHALL NOT 列入。

#### Scenario: Navbar 顯示對戰分配連結

- **WHEN** 使用者位於任一頁面
- **THEN** Navbar 內可見文字為「對戰分配」的連結，`href === "/matchmaker"`
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「Navbar 顯示對戰分配連結且指向 /matchmaker」

#### Scenario: /matchmaker active 標示

- **WHEN** 路由為 `/matchmaker`
- **THEN** 「對戰分配」連結套用 active 樣式；其餘連結為 muted 樣式
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「路由為 /matchmaker 時對戰分配連結套用 active 樣式」

#### Scenario: E2E 從 Navbar 進入對戰頁

- **WHEN** 從首頁點擊 Navbar 的「對戰分配」連結
- **THEN** 導向 `/matchmaker` 並顯示對戰頁的場次舞台區域
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「從首頁點擊 Navbar 的對戰分配連結進入對戰頁」

### Requirement: navbar 帳號入口於各寬度可見且預留固定寬度

`SiteNavbar` SHALL 在 `<nav>` 之後渲染 `nextjs-pickball/components/layout/AccountEntry.tsx`。`AccountEntry` 在**任何狀態**下都 MUST 渲染恰好一個根元素，
且該元素的水平尺寸在各狀態之間 MUST 相同——`/api/session` 回應前後、登入前後，五個導航連結的位置 SHALL NOT 改變。依 `useSession` 呈現四種狀態：

- `status === "loading"` 或 `authEnabled === false`：一個**隱形佔位元素**（`<span>`），class MUST 為登入連結的 class 再加上 `invisible`，
  MUST 帶 `aria-hidden="true"`，內含一個與圖示同尺寸（`size-4`）的空元素；SHALL NOT 含任何連結、按鈕或可聚焦元素。
  `data-account-entry` 屬性分別為 `loading` 與 `disabled`（供 E2E 判斷 session 已回應）。
- 啟用且未登入：一個指向 `/login` 的連結，內容為 `lucide-react` 的 `LogIn` 圖示，可及名稱為「登入」，`transitionTypes={["nav-forward"]}`。
- 已登入：一個按鈕，內容為 `lucide-react` 的 `LogOut` 圖示，可及名稱為「登出」，`title` 為「已登入：<name>」。
  點擊後呼叫 `signOut()`，再呼叫 store 的 `refresh()`（`signOut` 失敗時亦同）；停留在目前頁面。

三種元素 MUST 共用同一組版面 class：`inline-flex`、`shrink-0`、`items-center` 與 `NAV_ITEM_BASE`（含 `whitespace-nowrap` 與內距階梯，見「窄螢幕導航呈現」）。
帳號入口在**所有視口寬度**皆 MUST 顯示（佔位狀態為佔位但不可見），SHALL NOT 套用任何斷點隱藏（`hidden`、`sm:inline-flex` 等）。
圖示 MUST 為 `aria-hidden`，可及名稱由 `aria-label` 提供（`emoji-free-ui`：通用記號用 `lucide-react`）。

帳號入口 SHALL NOT 列入 `NAV_LINKS`，`/login` 亦 SHALL NOT 列入（`NAV_LINKS` 僅含公開內容路由的既有約束不變）。
專注模式（`html.sb-focus`）下入口隨 header 一起隱藏，不需額外處理。

> **為什麼未啟用時也佔寬度**：auth 是否啟用只有 `/api/session` 回應後才知道。若只在 `loading` 佔位、`disabled` 時移除，
> 正式站（auth 停用）每次整頁載入都會在回應後**向右**位移——等於把目前只在開發環境出現的位移搬到正式站。
> 代價是正式站 navbar 右側多一格看不見的寬度（`>= sm` 時五個連結整體左移 64px）；G1 上線後該格即由登入入口填滿。
>
> **為什麼取代舊版 `< sm` 隱藏**：舊版（2026-10-21 裁決）因 320／375px 擠不下而在 `< sm` 隱藏入口，手機只能自行輸入 `/login`。
> 本版改由「窄螢幕導航呈現」縮小 `< sm` 的連結內距與容器間距讓出空間，入口在所有寬度顯示。

#### Scenario: 帳號入口：載入中或未啟用時渲染隱形佔位元素

- **GIVEN** `useSession` 分別回傳 `{ status: "loading" }` 與 `{ status: "ready", authEnabled: false, user: null }`
- **WHEN** 渲染 `AccountEntry`
- **THEN** 兩種情況的 container 皆恰有一個子元素，其 `aria-hidden` 為 `"true"`、class 含 `invisible`、`data-account-entry` 分別為 `loading` 與 `disabled`
- **THEN** 不存在任何 link 或 button role，且該元素內含一個 class 含 `size-4` 的子元素
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「載入中或未啟用時渲染隱形佔位元素且不含互動元素」

#### Scenario: 帳號入口：佔位元素與登入入口共用同一組版面 class

- **GIVEN** 以相同的 `solid` 分別渲染 loading、啟用且未登入、已登入三種狀態
- **WHEN** 比較三者根元素的 class token 集合
- **THEN** 佔位元素的 token 集合等於登入連結的 token 集合再加上 `invisible`；登出按鈕的 token 集合等於登入連結的 token 集合
- **THEN** 三者的 token 集合皆包含 `NAV_ITEM_BASE` 的每一個 token（內距只有 `NAV_ITEM_BASE` 一個來源）
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「佔位元素、登入連結與登出按鈕共用同一組版面 class」

#### Scenario: 帳號入口：登入連結與登出按鈕於所有寬度顯示

- **GIVEN** `useSession` 分別回傳啟用且未登入、已登入
- **WHEN** 渲染 `AccountEntry`
- **THEN** 登入連結與登出按鈕的 class token 皆含 `inline-flex`，且不含 `hidden`、`sm:inline-flex`
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「登入連結與登出按鈕不在任何斷點隱藏」

#### Scenario: 未登入時顯示登入連結

- **GIVEN** `useSession` 回傳啟用且 `user` 為 null
- **WHEN** 渲染 `AccountEntry`
- **THEN** 存在名稱為「登入」的連結，`href === "/login"`，class 含 `whitespace-nowrap`，內含一個 `aria-hidden="true"` 的 `svg`
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「啟用且未登入時顯示指向 /login 的登入連結」

#### Scenario: 已登入時顯示登出按鈕

- **GIVEN** `useSession` 回傳已登入、`name` 為「測試員」
- **WHEN** 渲染 `AccountEntry`
- **THEN** 存在名稱為「登出」的按鈕，`title` 為「已登入：測試員」，class 含 `whitespace-nowrap`；不存在「登入」連結
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「已登入時顯示登出按鈕且 title 含使用者名稱」

#### Scenario: 點擊登出後重新取得 session

- **GIVEN** 已登入，`signOut` 回傳 `true`
- **WHEN** 點擊「登出」
- **THEN** `signOut` 被呼叫一次，之後 store 的 `refresh` 被呼叫一次
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「點擊登出後呼叫 signOut 並重新取得 session」

#### Scenario: 未登入時 navbar 顯示登入入口並可前往登入頁

- **GIVEN** 前後端 dev server 皆已啟動、`.dev.vars` 齊備，瀏覽器為訪客，viewport 寬度 >= 640px
- **WHEN** 開啟 `/` 並點擊 navbar 的「登入」
- **THEN** 導向 `/login` 並顯示「電子郵件」欄位
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「未登入時 navbar 顯示登入入口並可前往登入頁」

#### Scenario: 帳號入口：session 回應前後導航連結位置不變

- **GIVEN** 以 `page.route` 攔住 `/api/session`，使頁面停在 loading；瀏覽器為各 E2E project 的預設視口
- **WHEN** 等 `document.fonts.ready` 後量測五個導航連結與帳號入口根元素（header 內層容器中 `<nav>` 之後的元素）的 bounding box，再依序以 `{ authEnabled: true, user: null }`、
  `{ authEnabled: true, user: { id, email, name } }`、`{ authEnabled: false, user: null }` 三種回應之一放行，等到對應狀態出現（「登入」連結、「登出」按鈕、`data-account-entry="disabled"`）並再等 `document.fonts.ready` 後再量一次
- **THEN** 三種回應下，五個導航連結與帳號入口根元素的 `x` 與 `width` 前後差皆 ≤ 0.5px
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-account-entry.spec.ts`，test 名稱「帳號入口載入前後導航連結位置不變」

#### Scenario: 帳號入口：各寬度下入口與五個導航連結皆完整落在視口內

- **GIVEN** 以 `page.route` 回應 `/api/session` 為啟用且未登入，及已登入兩種狀態
- **WHEN** viewport 寬度分別為 320、375、390、640、1280px
- **THEN** 帳號入口（「登入」連結或「登出」按鈕）與「首頁」「完整體驗」「計分板」「測驗」「對戰分配」五個連結皆以 `toBeInViewport({ ratio: 1 })` 完整落在視口內
- **THEN** 五個連結的高度不高於 1280px 下的高度＋4px（不換行）；帳號入口右緣不小於「對戰分配」右緣（位於 `<nav>` 之後）
- **THEN** header 內層容器 `scrollWidth <= clientWidth`，且 `document.documentElement.scrollWidth <= window.innerWidth`（頁面無水平溢出）
- ⚠️ 兩條 `scrollWidth` 斷言為輔助：header 是 `fixed` 的 flex 容器，溢出通常撐不大 document；主要把關是 `toBeInViewport({ ratio: 1 })`
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-account-entry.spec.ts`，test 名稱「各寬度下帳號入口與五個導航連結皆完整落在視口內且不溢出」

#### Scenario: 帳號入口：窄螢幕下可由 navbar 前往登入頁

- **GIVEN** 前後端 dev server 皆已啟動、`.dev.vars` 齊備，瀏覽器為訪客，viewport 寬度 390px
- **WHEN** 開啟 `/` 並點擊 header 內的「登入」
- **THEN** 導向 `/login` 並顯示「電子郵件」欄位
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「窄螢幕下 navbar 登入入口可前往登入頁」

### Requirement: 導航連結 active 判定涵蓋子路由並以 aria-current 標示

`SiteNavbar` 各導航連結（`NAV_LINKS`）是否 active MUST 由 `nextjs-pickball/lib/navActive.ts` 的純函式 `isNavLinkActive(href, pathname)` 判定，SHALL NOT 在元件內另寫比對式。判定規則：

- `href` 為 `/` 時，MUST 只在 `pathname` 恰為 `/` 時回傳 `true`（首頁不是其他路由的父區段）。
- 其他 `href`，`pathname` 等於 `href`、或以 `href + "/"` 開頭時 MUST 回傳 `true`；其餘 MUST 回傳 `false`。
  只以 `pathname.startsWith(href)` 比對 SHALL NOT 採用——`/matchmakerx` 會誤命中 `/matchmaker`。
- 本模組 SHALL NOT import React 或 `next/navigation`（純函式，於 `lib/` 層單元測試）。

因此 `/matchmaker/players`、`/matchmaker/history`、`/matchmaker/stats`、`/matchmaker/data` 時，「對戰分配」連結 MUST 呈現 active 樣式——這四頁屬於「對戰分配」區段，`NAV_LINKS` 不另列子頁連結的既有約束（見「對戰分配連結」）不變。

active 連結 MUST 帶 `aria-current="page"`；非 active 連結 SHALL NOT 帶 `aria-current` 屬性（不得輸出 `aria-current="false"` 或空字串）。logo 連結不屬 `NAV_LINKS`，SHALL NOT 帶 `aria-current`。
active 的視覺樣式沿用既有寫法（solid 態 `text-slate-900`、透明態 `text-white`），本 Requirement 不改配色。

> **與區段導覽的差異**：`nextjs-pickball/lib/matchmaker/section-nav.ts` 的區段分頁維持精確比對（`===`）——區段導覽的每一格是**一頁**，而 navbar 的每一格是**一個區段**；兩者在 `/matchmaker/players` 時分別標示「參賽者」與「對戰分配」，各在自己的 `<nav>` 內，屬兩組不同的導覽集合。

#### Scenario: active 判定：首頁連結只在 pathname 恰為 / 時 active

- **WHEN** 以 `href` 為 `/` 呼叫 `isNavLinkActive`，`pathname` 分別為 `/`、`/quiz`、`/matchmaker/players`
- **THEN** 依序回傳 `true`、`false`、`false`
- **驗收**：`nextjs-pickball/lib/navActive.test.ts`，it 名稱「首頁連結只在 pathname 恰為 / 時為 active」

#### Scenario: active 判定：pathname 與 href 完全相等時 active

- **WHEN** 以 `href` 為 `/quiz` 與 `/matchmaker`，`pathname` 分別與之相等
- **THEN** 皆回傳 `true`
- **驗收**：`nextjs-pickball/lib/navActive.test.ts`，it 名稱「pathname 與 href 完全相等時為 active」

#### Scenario: active 判定：子路由時 active

- **WHEN** 以 `href` 為 `/matchmaker`，`pathname` 分別為 `/matchmaker/players`、`/matchmaker/history`、`/matchmaker/stats`、`/matchmaker/data`
- **THEN** 皆回傳 `true`
- **驗收**：`nextjs-pickball/lib/navActive.test.ts`，it 名稱「pathname 為 href 的子路由時為 active」

#### Scenario: active 判定：前綴相似但非子路由時不 active

- **WHEN** 以 `href` 為 `/matchmaker`，`pathname` 分別為 `/matchmakerx`、`/matchmaker-old`；以 `href` 為 `/tour`，`pathname` 為 `/tournament`；以 `href` 為 `/quiz`，`pathname` 為 `/scoreboard`
- **THEN** 皆回傳 `false`
- **驗收**：`nextjs-pickball/lib/navActive.test.ts`，it 名稱「前綴相似但非子路由時不為 active」

#### Scenario: active 判定：pathname 帶尾斜線時仍屬同一區段

- **WHEN** 以 `href` 為 `/quiz`，`pathname` 為 `/quiz/`；以 `href` 為 `/matchmaker`，`pathname` 為 `/matchmaker/players/`
- **THEN** 皆回傳 `true`
- **驗收**：`nextjs-pickball/lib/navActive.test.ts`，it 名稱「pathname 帶尾斜線時仍視為同一區段」

#### Scenario: navbar 在 matchmaker 子頁標示對戰分配並帶 aria-current

- **GIVEN** `usePathname` 回傳 `/matchmaker/players`（另三次分別為 `/matchmaker/history`、`/matchmaker/stats`、`/matchmaker/data`）
- **WHEN** 渲染 `SiteNavbar`
- **THEN** 「對戰分配」連結 `aria-current="page"`，class token 含 `text-slate-900`、不含 `text-muted-foreground`
- **THEN** 「首頁」「完整體驗」「計分板」「測驗」四個連結皆不帶 `aria-current` 屬性，class token 含 `text-muted-foreground`
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「路由為 %s 時對戰分配連結帶 aria-current 並套用 active 樣式」

#### Scenario: 完全相等時只有 active 連結帶 aria-current

- **GIVEN** `usePathname` 回傳 `/quiz`
- **WHEN** 渲染 `SiteNavbar`
- **THEN** header 內恰有一個元素帶 `aria-current`，即「測驗」連結且值為 `page`；logo 連結與其餘四個導航連結皆不帶 `aria-current` 屬性
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「完全相等時只有 active 連結帶 aria-current=page」

#### Scenario: 前綴相似但非子路由時對戰分配不 active

- **GIVEN** `usePathname` 回傳 `/matchmakerx`
- **WHEN** 渲染 `SiteNavbar`
- **THEN** 「對戰分配」連結 class token 含 `text-muted-foreground`、不含 `text-slate-900`，且不帶 `aria-current` 屬性
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」

#### Scenario: E2E 在參賽者頁 navbar 的對戰分配連結帶 aria-current

- **GIVEN** 前後端 dev server 皆已啟動，瀏覽器為訪客
- **WHEN** 開啟 `/matchmaker/players`
- **THEN** header 內的「對戰分配」連結 `aria-current="page"`，「首頁」連結不帶 `aria-current` 屬性
- **THEN** 區段導覽（「對戰分配區段導覽」）內的「參賽者」分頁仍為 `aria-current="page"`、「對戰」分頁不帶（既有區段導覽行為不變）
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-active.spec.ts`，test 名稱「參賽者頁的 navbar 對戰分配連結帶 aria-current」
