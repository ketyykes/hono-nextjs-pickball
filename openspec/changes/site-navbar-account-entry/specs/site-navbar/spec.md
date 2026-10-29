# Specification: site-navbar

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: navbar 顯示帳號入口

**Reason**：本 Requirement 的三條 Scenario「載入中或未啟用時不渲染」「帳號入口於 sm 以下隱藏」「窄螢幕下隱藏帳號入口且不影響既有導航連結」與本 change 的行為相反
（載入中與未啟用改為渲染隱形佔位元素；入口改為在所有寬度顯示）。OpenSpec 的 MODIFIED 不允許丟棄主 spec 既有的 Scenario（validate 與 archive 皆拒絕），
因此以 REMOVED＋ADDED 改名的方式取代整個 Requirement（先例：change `matchmaker-round-score-backend` 的 `scoreboard`「localStorage 持久化」）。

**Migration**：由 ADDED「navbar 帳號入口於各寬度可見且預留固定寬度」承接。「未登入時顯示登入連結」「已登入時顯示登出按鈕」「點擊登出後重新取得 session」
「未登入時 navbar 顯示登入入口並可前往登入頁」四條 Scenario 與其驗收錨點逐字保留；上述三條相反的 Scenario 由三條「帳號入口：」前綴的新 Scenario 取代，
其驗收 it／test（`AccountEntry.test.tsx` 的「載入中或未啟用時不渲染任何元素」「登入連結與登出按鈕在 sm 以下隱藏」、
`auth-session.spec.ts` 的「窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內」）於 apply 時刪除。
