# Proposal: site-not-found-and-nav-active

## Why

① 打錯網址或點到失效連結時，`nextjs-pickball/app/` 下沒有 `not-found.tsx`，畫面是 Next 預設的英文「This page could not be found.」、`<title>` 也是英文；navbar 雖然還在，但頁面本身沒有任何中文說明或導回連結。
② `nextjs-pickball/components/layout/SiteNavbar.tsx` 以 `pathname === link.href` 判斷 active（約第 66 行），因此在 `/matchmaker/players`、`/matchmaker/history`、`/matchmaker/stats`、`/matchmaker/data` 四個子頁**沒有任何** navbar 連結被標示，使用者看不出自己在哪個區段；active 連結也沒有 `aria-current`，螢幕閱讀器無從得知目前位置（對照 `components/matchmaker/MatchmakerTabs.tsx` 第 22 行已有）。
主 spec `site-navbar` 對子路由的 active 狀態與 `aria-current` 沉默，也沒有任何 capability 規定 404 頁。兩者都是小幅、純前端、無資料面影響的導覽缺口，合併成一個 change 處理。

## What Changes

- **navbar active 判定**：新增純函式模組 `nextjs-pickball/lib/navActive.ts`（`isNavLinkActive(href, pathname)`）：`/` 只在 pathname 恰為 `/` 時 active；其他連結在 pathname 等於 `href` 或以 `href + "/"` 開頭時 active（`/matchmakerx` 不命中 `/matchmaker`）。`SiteNavbar` 改用此函式，不再在元件內寫比對式。
- **`aria-current`**：`SiteNavbar` 的 active 導航連結帶 `aria-current="page"`，非 active 連結不帶該屬性。active 視覺樣式（`text-slate-900`／`text-white`）沿用既有寫法，不重新設計。
- **中文 404 頁**：新增 `nextjs-pickball/app/not-found.tsx`（Server Component）：`metadata.title` 為「找不到頁面 | 匹克球指南」、`h1`「找不到這個頁面」、一段中文說明、兩個導回連結「回首頁」（`/`）與「前往對戰分配」（`/matchmaker`），沿用 `components/ui/button` 的 `Button asChild` 包 `next/link`；內容區以 `pt-(--site-nav-h)` 避開固定 navbar；不含 emoji。全站未匹配路由的 HTTP 狀態碼維持 404。
- **BREAKING（測試層，非使用者行為倒退）**：既有 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」以 `/matchmaker/players` 斷言「對戰分配」**不** active，與新行為字面衝突；授權把該 it 的 pathname 改為 `/matchmakerx`（前綴相似但非子路由），名稱與既有斷言不變，另加一行 `aria-current` 為 null 的斷言（見 Impact）。

### 明確不做

- 不做 `error.tsx`／`global-error.tsx`／`loading.tsx`／`global-not-found.tsx`，不加 Open Graph metadata。
- 不改 navbar 視覺（不加底線、不改配色）、不改 `NAV_LINKS`、不替 navbar 的 `<nav>` 加 `aria-label`。
- 不改 `MatchmakerTabs` 與 `lib/matchmaker/section-nav.ts`（區段導覽維持精確比對，與 navbar 的「區段」語意不同，見 design Decision 2）。
- 不新增 npm 相依、不動後端與核心套件、無 migration。

## Capabilities

### New Capabilities

- `site-not-found`：全站未匹配路由的中文 404 頁——檔案位置與 Server Component 形態、中文 `metadata.title` 與標題說明、兩個導回連結、避開固定 navbar、HTTP 404 狀態碼、不攔截 `/api/*`。
  歸屬理由：既有 capability 沒有「全站特殊頁面」的落點——`site-navbar` 只管 header 元件本身，`emoji-free-ui` 是橫切的文案約束、`api-connectivity` 管 `/health` 與 proxy；把 404 頁塞進 `site-navbar` 會讓該 spec 的主詞從「導航列」擴張成「全站外框」，日後 error 頁、loading 頁也會被迫往裡塞。新開一個小 capability 範圍最清楚（design Decision 4）。

### Modified Capabilities

- `site-navbar`：ADDED 一條 Requirement「導航連結 active 判定涵蓋子路由並以 aria-current 標示」。既有「測驗連結」「對戰分配連結」兩條 Requirement 只規定「路由為 `/quiz`／`/matchmaker` 時 MUST active」與「其餘連結為 muted」，新行為在這些路由下輸出完全相同，字面不衝突，故不 MODIFIED。

## Impact

- **前端產品程式碼**：
  - 新增 `nextjs-pickball/lib/navActive.ts`、`nextjs-pickball/app/not-found.tsx`。
  - 修改 `nextjs-pickball/components/layout/SiteNavbar.tsx`（active 判定改用 `isNavLinkActive`、active 連結加 `aria-current="page"`；`NAV_LINKS`、樣式 class 不變）。
- **測試**：
  - 新增 `nextjs-pickball/lib/navActive.test.ts`（5 個 it）、`nextjs-pickball/app/not-found.test.tsx`（2 個 it）。
  - `nextjs-pickball/components/layout/SiteNavbar.test.tsx` 新增 2 個 it（其中一個為 `it.each` 四個子頁）。
  - 新增 E2E：`nextjs-pickball/tests/e2e/specs/site-not-found.spec.ts`（2 個 test）、`nextjs-pickball/tests/e2e/specs/navbar-active.spec.ts`（1 個 test），在五個 browser project 執行。
  - **授權修改的既有測試（僅此一處）**：`SiteNavbar.test.tsx` 的 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」——`mockReturnValue("/matchmaker/players")` 改為 `mockReturnValue("/matchmakerx")`、改寫其上方註解（說明前綴相似但非子路由），並在既有兩行 class 斷言之後**新增** `expect(link.getAttribute("aria-current")).toBeNull()` 一行；既有兩行斷言與 it 名稱不變。
  - 既有 `nextjs-pickball/app/emojiFree.test.ts` 會自動掃到 `app/not-found.tsx`（掃描 `app/` 目錄），不需改。
- **文件**：`nextjs-pickball/CLAUDE.md` 的「架構總覽」路由清單補 404 頁一條、`lib/` 清單補 `navActive.ts`、TDD 例外清單的入口檔補 `app/not-found.tsx`（並註明本 change 仍以單元測試先行）。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **訪客／正式站**：所有既有路由的 DOM 只多出 navbar active 連結的 `aria-current="page"`；`/matchmaker/*` 四個子頁的「對戰分配」連結多了 active 樣式；未匹配路由改顯示中文 404 頁。
- **capability 新增注意**：`site-not-found` 為新 capability，archive 時主 spec 會由 openspec 產生 `## Purpose` 佔位，archive 階段需補一句 Purpose（「定義全站未匹配路由的 404 頁」）。
