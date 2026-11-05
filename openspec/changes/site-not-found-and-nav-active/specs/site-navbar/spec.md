# Specification: site-navbar

## ADDED Requirements

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
