# Design: site-navbar-account-entry

## Context

- `SiteNavbar`（`nextjs-pickball/components/layout/SiteNavbar.tsx`）是 root layout 中、`<ViewTransition>` 外側的 client component。header 內層容器為
  `mx-auto flex h-full max-w-[1200px] items-center gap-3 px-4 max-[375px]:px-3 sm:gap-6 sm:px-6`，子元素依序為 logo（`max-[375px]:hidden`）、
  `<nav className="ml-auto flex items-center gap-0.5 sm:gap-1">`（五個 `NAV_LINKS`）、`<AccountEntry solid={solid} />`。
- `AccountEntry`（`components/layout/AccountEntry.tsx`）讀 `useSession()`（`useSyncExternalStore`，`getServerSnapshot` 為 `loading`，SSR 與 hydration 皆為 loading）。
  目前 `loading` 或 `!authEnabled` 時 `return null`；啟用時渲染 `hidden shrink-0 items-center sm:inline-flex` ＋ `NAV_ITEM_BASE` ＋ `navItemTone(solid)` 的圖示連結／按鈕。
- `NAV_ITEM_BASE`（`components/layout/navItemStyles.ts`）＝ `rounded-md px-2 py-2 text-sm font-medium whitespace-nowrap transition-colors max-[375px]:px-1.5 sm:px-3`，
  為導航連結與帳號入口的內距單一來源。
- `fetchSession()` 以 `fetch("/api/session", { keepalive: true })` 取得 `{ authEnabled, user }`；任何失敗回 `{ authEnabled: false, user: null }`（fail-closed）。
  正式站（後端 `ENVIRONMENT !== "development"`）恆為 `authEnabled: false`。
- **位移的根因**（B7 tasks 11.7 診斷）：`<nav>` 靠 `ml-auto` 貼右；入口由 null 變為 40px（`>= sm`）元素時，`<nav>` 左移「入口寬＋容器 gap」。
  webkit 的 click 在 mousedown 與 mouseup 落在不同元素時派給共同祖先，導覽不發生。**正式站目前不會位移**（入口恆為 null），只有 `.dev.vars` 齊備時才會。
- **字寬**：全站字型為 `next/font` 的 Noto Sans TC，`text-sm`（14px）下中文字寬為 14px；五個連結共 15 字＝210px（B3 量測 320px 下 nav 固有寬 278＝210＋內距 60＋gap 8，吻合）。
- **B3 窄螢幕量測**（`archive/2026-10-22-auth-frontend-session/design.md` Open Questions 8、9）：320px 內容寬 296、餘裕 18；375px 內容寬 343、餘裕 17；
  390px 餘裕 32。入口在窄螢幕需 28～32px＋容器 gap 12px，因此在 320／375px 溢出 10／11px。
- E2E project：chromium／firefox／webkit（Desktop 1280×720）、mobile-chrome（Pixel 5，393px）、mobile-safari（iPhone 12，390px）、user-data（Desktop Chrome）。

## Goals

- session 由 loading 轉為任一 ready 狀態（未啟用、啟用未登入、已登入）時，五個導航連結的位置與寬度不變；登入／登出切換亦不變。
- 320、375、390px 下帳號入口可見且與五個連結一起完整落在視口內，無水平溢出、不換行。
- 既有 navbar（`navbar-rwd.spec.ts`）、a11y（可及名稱、`aria-hidden` 圖示）、auth 與 user-data E2E 不迴歸；webkit `quiz.spec.ts:49`、`scoreboard.spec.ts:22` 的位移競態消失。

## Non-Goals

- 漢堡選單、帳號下拉選單、在 navbar 顯示姓名（G1 改 Google 登入時重新設計）。
- 改變五個連結的文案、數量、logo 的 `< 375px` 隱藏規則與 `>= sm` 的任何 class。
- 改變 session store、`fetchSession` 或後端；新增 hook 或相依。

## Decisions

### Decision 1：帳號入口在所有狀態都佔同一格寬度（含 auth 停用）

**Choice**：`AccountEntry` 在 `loading` 與 `authEnabled === false` 時渲染隱形佔位元素：

- 根元素為 `<span>`，class ＝ 登入連結的 class（`inline-flex shrink-0 items-center` ＋ `NAV_ITEM_BASE` ＋ `navItemTone(solid)`）再加 `invisible`；
  `aria-hidden="true"`；`data-account-entry` 為 `loading` 或 `disabled`；內含一個 `<span className="size-4" />` 撐出與 `LogIn`／`LogOut` 圖示（`size-4`）相同的寬度。
- 三種狀態共用同一個版面 class 常數（`AccountEntry.tsx` 內的模組常數即可，不需匯出），確保日後只改一處。
- SSR 與 hydration 皆為 loading → 伺服器 HTML 已含佔位元素，首屏就保留寬度，hydration 前後也不位移。

**Rationale**：auth 是否啟用要等 `/api/session` 回應才知道。只在 loading 佔位、disabled 時移除，會讓正式站每次整頁載入在回應後向右位移——
把今天只在開發環境出現的問題搬到正式站。永遠佔位是唯一不依賴回應內容就能保證零位移的做法。
`invisible`（`visibility: hidden`）保留盒模型、不進無障礙樹、不可聚焦；再加 `aria-hidden` 讓意圖明確。

**代價（寫入 proposal 的訪客可見變更）**：正式站 navbar 右側多一格看不見的寬度——`>= sm` 時五個連結整體左移 40（入口）＋24（`sm:gap-6`）＝64px；
`< sm` 時左移 24～28px＋4px。G1 上線後該格由登入入口填滿。

**Alternatives considered**：
- 只在 `loading` 佔位：正式站回應後向右位移，引入新的 CLS。不選。
- build-time 旗標（例如 `NEXT_PUBLIC_AUTH_ENABLED`）決定是否預留：需在 Workers Builds 與本機各維護一份設定，且與後端 `ENVIRONMENT` 閘門重複、可能不一致（前端說啟用、後端說停用）；
  G1 時還要再改一次。不選。
- 入口改 `absolute` 定位、容器預留右內距：效果等同永遠佔位，但多一層定位規則、窄螢幕要另算 padding。不選。
- 可見的 skeleton（灰塊）：正式站會出現一個永遠不會變成按鈕的灰塊，誤導使用者。不選。
- 以 `sessionStorage` 快取上次的 session 狀態提早渲染：首次造訪仍位移，且 SSR 無法讀取 → hydration mismatch。不選。

### Decision 2：窄螢幕顯示入口，空間由 `< sm` 的連結內距與容器間距讓出

**Choice**（只動 `< sm`，`>= sm` 零變更）：

| 項目 | 現況 | 改為 |
|---|---|---|
| `AccountEntry` 顯示 | `hidden sm:inline-flex` | `inline-flex`（所有寬度） |
| `NAV_ITEM_BASE` 內距（375～639px） | `px-2`（8px） | `px-1.5`（6px） |
| `NAV_ITEM_BASE` 內距（< 375px） | `max-[375px]:px-1.5`（6px） | `max-[375px]:px-1`（4px） |
| 內層容器 gap（< 640px） | `gap-3`（12px） | `gap-1`（4px） |

入口共用 `NAV_ITEM_BASE`，寬度隨之為 24px（< 375）／28px（375～639）／40px（>= 640）。

估算（中文字 14px；容器內容寬＝視口－左右內距）。**口徑**：下表「餘裕」相對容器**內容寬**；B3 的「超出 10／11px」相對**視口**（含容器右內距）。
例如 320px 的 10px 餘裕，等於入口右緣距視口右緣 10＋12（`px-3`）＝22px。

| 視口 | 內容寬 | logo＋gap | nav（210＋內距＋gap 8） | gap＋入口 | 合計 | 餘裕 |
|---|---|---|---|---|---|---|
| 320 | 296 | 0（隱藏） | 210＋40＋8＝258 | 4＋24 | 286 | **10** |
| 374 | 350 | 0（隱藏） | 258 | 28 | 286 | 64 |
| 375 | 343 | 16＋4 | 210＋60＋8＝278 | 4＋28 | 330 | **13** |
| 390 | 358 | 20 | 278 | 32 | 330 | 28 |
| 393 | 361 | 20 | 278 | 32 | 330 | 31 |

**Rationale**：320px 是硬約束——15 個中文字固定 210px、內容寬 296px，剩 86px 要容納 4 個 nav gap、5 個連結內距、入口與容器 gap。
降一階內距與縮小容器 gap 是不碰文案、不隱藏任何連結、不改 logo 規則的最小改動，且全部是 Tailwind class、沒有 JS 量測。
logo 與「首頁」之間的視覺距離在 375px 仍有 4（gap）＋13（餘裕）＋6（連結內距）＝23px，不會黏在一起。

**Alternatives considered**：
- 維持 `< sm` 隱藏、只修位移：不解決問題 2。不選。
- `< sm` 一律隱藏 logo（延伸 `< 375px` 規則）：375px 可多 28px，但 320px 仍差 10px，還是得縮內距；且要改寫「小於 375px 時隱藏 logo、375px 起恢復」這條既有 Scenario。不選。
- 帳號下拉選單／「更多」選單：觸發按鈕本身就佔一格圖示寬，空間問題不變，還多一次點擊。不選。
- 縮短連結文案或縮小字級：「窄螢幕導航呈現」已明言文案在不同寬度不一致是不採用的理由。不選。
- 只縮容器 gap、不動連結內距：375px 合計 16＋4＋298＋4＋32＝354 > 343，溢出。不選。

### Decision 3：E2E 以 `page.route` 控制 `/api/session`，以 `data-account-entry` 判斷狀態

**Choice**：新 spec `tests/e2e/specs/navbar-account-entry.spec.ts` 以 `page.route("**/api/session", handler)` 攔截：
位移測試的 handler 先 `await` 一個由測試控制的 promise（停在 loading），量測後再 `route.fulfill({ json })` 放行；
寬度測試直接 `route.fulfill({ json })`。等待條件：未啟用等 `[data-account-entry="disabled"]`、啟用未登入等 header 內「登入」連結、已登入等「登出」按鈕。

- 前後兩次量測之前都先 `await page.evaluate(() => document.fonts.ready)`：Noto Sans TC 由 `next/font` 載入，若「前」量測時字型尚未換上，字寬不同會造成偶發的寬度差。
- 入口根元素以 `header > div > nav ~ *` 取得（`:last-child` 在現況入口為 null 時會取到 `<nav>`）。
- 三個分支依 guest → user → disabled 的順序、各一個 `test.step`，位移斷言用 `expect.soft`，一次執行即可看到每個分支的結果。

- 位移測試在**所有五個瀏覽器 project** 執行（位移問題在 webkit 出現；各 project 的預設視口也正好涵蓋 1280／393／390px）。
- 寬度測試以 `browserName !== "chromium"` skip（與 `navbar-rwd.spec.ts` 同寫法與理由：排版行為與引擎無關），因此在 chromium 與 mobile-chrome 兩個 project 執行，逐一 `setViewportSize`。
- 模擬已登入時 `user` 用假的 `{ id, email, name }`；只在 `/` 量測（首頁不讀使用者資料，不會觸發雲端請求）。

**Rationale**：不依賴 `.dev.vars`，三種回應都能在同一台機器上重現，含正式站的 `authEnabled: false`；
攔住回應才量得到 loading 狀態（真實 dev server 的回應時間不可控）。`data-account-entry` 讓「未啟用」狀態有可等待的 DOM 訊號——
若實作錯誤地在 disabled 時移除元素，測試不會在 re-render 之前就搶先量測而誤判通過。

**Context7 查證**（`/microsoft/playwright`）：官方範例以 `page.route` handler 內 `await` 延遲後 `route.fulfill` 模擬慢回應；`route.fulfill` 接受 `json` 選項。
文件未說明 `keepalive: true` 的 fetch 是否一定可被攔截——列為 Risk，由 tasks 1.2 實測。

**Alternatives considered**：
- 用真實後端、以 `waitForResponse` 前後量測：loading 狀態維持時間不可控（常在 `goto` 回傳前就已回應），量不到「前」。不選。
- 以 `page.addInitScript` 改寫 `window.fetch`：可行但侵入性較高；作為 `page.route` 攔不到 keepalive 請求時的備案（Risk 1）。

### Decision 4：規格與既有測試的處理

- `site-navbar`「navbar 顯示帳號入口」以 REMOVED＋ADDED 改名取代（舊版有三條與新行為相反的 Scenario，MODIFIED 不能丟棄既有 Scenario）。
  仍成立的四條 Scenario 與驗收錨點逐字保留在 ADDED 版本。
- `site-navbar`「窄螢幕導航呈現」MODIFIED：只改內距與 gap 的數值、加一段理由與一條 class 斷言的 Scenario；既有 7 條 Scenario 原樣保留且其 E2E 不改。
- `auth`「本機測試帳號登入頁」MODIFIED：已登入分支的括號說明、Scenario「窄螢幕下經由登入頁登入與登出」的 THEN。
- **允許修改的既有測試（皆為行為反轉的必然結果）**：
  ① `AccountEntry.test.tsx` 刪除「載入中或未啟用時不渲染任何元素」「登入連結與登出按鈕在 sm 以下隱藏」；
  ② `auth-session.spec.ts` 刪除「窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內」與只供它使用的 `HIDDEN_WIDTHS`／`VISIBLE_WIDTHS`；
  ③ `auth-session.spec.ts`「窄螢幕下可經由登入頁登入與登出」改斷言 header 顯示「登出」、登入頁的「登出」改以 `page.getByRole("main")` 限定。
  其餘既有 it／test 的名稱與斷言一行不改。

### Decision 5：TDD 分層

- `AccountEntry` 的狀態分支（佔位元素、三種狀態共用 class、不隱藏）是行為邏輯 → 單元 TDD，真紅燈（現況回傳 null／含 `hidden`）。
- `NAV_ITEM_BASE` 與容器 gap 是 class 值 → 以 `SiteNavbar.test.tsx` 的 class token 斷言取得真紅燈（同既有「whitespace-nowrap」it 的做法），E2E 為實際驗收。
- E2E 屬 `tests/**` 例外層，但本 change 的兩個新 E2E 會在 GREEN 前實際紅燈（位移、窄螢幕入口 hidden），MUST 在 GREEN 前先跑一次並記錄紅燈輸出。

## Risks / Trade-offs

- [Risk 1] `fetchSession` 帶 `keepalive: true`，某些引擎下 `page.route` 可能攔不到 → Mitigation：tasks 1.2 以一次性 spike 在五個 project 各驗一次（不 commit）；
  攔不到的 project 改用 `page.addInitScript` 包裝 `window.fetch`（只攔 `/api/session`），結果記入本檔 Open Questions。SHALL NOT 為了測試移除 `keepalive`（B3 為 WebKit console error 而加）。
- [Risk 2] 320px 餘裕只有 10px、375px 13px → Mitigation：Noto Sans TC 中文字寬固定 14px、內距與 gap 皆為整數 px，估算可重現；
  寬度 E2E 以 `toBeInViewport({ ratio: 1 })` ＋ `scrollWidth` 雙重斷言；若實測任一寬度溢出，停止並升級（SHALL NOT 自行縮文案、隱藏連結或改 logo 規則）。
- [Risk 3] 正式站 navbar 視覺改變（右側空一格、連結左移）→ Mitigation：寫入 proposal「訪客與正式站可見的變更」；`navbar-rwd.spec.ts` 在無 `.dev.vars` 時仍須通過（佔位元素與入口同寬）。
- [Risk 4] 登入頁已登入時 header 與 `main` 各有一個「登出」按鈕，未限定範圍的 `getByRole("button", { name: "登出" })` 在 Playwright strict mode 會失敗 →
  Mitigation：Decision 4 ③；tasks 4.x 以 `grep` 盤點 `tests/e2e` 內所有 `name: "登出"` 的查詢，確認都在 `/` 或已限定範圍。
- [Risk 5] 位移競態屬機率性，`--repeat-each=30` 全過不等於證明 → Mitigation：以「位移測試」的確定性斷言為主要證據；webkit 兩條 `--repeat-each=30` 為輔助（修正前 main 為 1/30）。
- [Risk 6] 高負載下 dev 模式偶發 Turbopack `ChunkLoadError`（B3 已知）→ Mitigation：失敗以隔離重跑判讀並上報，不得自行判定為雜訊。
- [Trade-off] `< sm` 的連結內距縮一階，觸控目標寬度略減（最窄連結「首頁」在 320px 為 28＋8＝36px）；帳號入口在 `< 375px` 為 16＋8＝24px 寬、32px 高，
  恰等於 WCAG 2.5.8 的 24px 下限（無餘裕；與相鄰連結之間另有 4px gap）。375px 起為 28px。
- [Risk 7] `.dev.vars` 齊備時，行動 project 的 header 多一個 tab stop（桌面 project 原本就有）→ Mitigation：已盤點 Tab 走訪類 E2E（`match-stage.spec.ts` 的 `tabUntilFocused` 上限 40 次、`visual-export.spec.ts` 上限 50 次），
  多一個 tab stop 不致超過上限；tasks 4.3 特別留意這幾條。

## Migration Plan

無資料或 schema migration。部署即生效；回復方式為 revert 本 change 的 commit（前端單一 Worker，無部署順序限制）。

## Open Questions

1. **（建議方案已採用，待使用者確認）正式站預留一格看不見的寬度**：替代方案為 build-time 旗標（見 Decision 1）。若使用者不接受正式站連結左移 64px，
   需改走旗標方案並於 Workers Builds 設定環境變數——那是 CF Dashboard 側設定，本 change 不處理。
2. **（建議方案已採用）窄螢幕的讓位方式**：替代方案為「`< sm` 一律隱藏 logo＋縮內距」或「帳號下拉選單」（見 Decision 2）。
   若之後 G1 需要顯示姓名或更多帳號功能，屆時改為下拉選單較合適。
3. `page.route` 能否攔截 keepalive fetch：由 tasks 1.2 實測後回填。
