# Overview: site-not-found-and-nav-active

## Scope

打錯網址時改顯示中文 404 頁（中文標題、說明、「回首頁」與「前往對戰分配」兩個按鈕），狀態碼仍為 404；navbar 在 `/matchmaker/players` 等子頁也會把「對戰分配」標成目前區段，active 連結並帶 `aria-current="page"` 讓螢幕閱讀器知道目前位置。

**Size**: medium — 影響 2 個 capability（`site-navbar` 新增 Requirement、新 capability `site-not-found`），新增一個 `lib/` 模組；tasks 約 13 項，無新依賴、無架構變更。
**Frontend involved**: yes — navbar active 標示與新增 404 頁皆為使用者可見的畫面變更。
**DB schema touched**: no — 後端零變更。
**Data migration**: no — 不碰任何儲存資料。
**Cross-component flow**: no — 404 由 Next 路由層直接渲染，active 判定為同步純函式，沒有非同步或多服務協作。

---

## What Changes

- 新增 `lib/navActive.ts` 的 `isNavLinkActive(href, pathname)`：首頁只在 `/` 時 active，其他連結在相等或子路由時 active。
- `SiteNavbar` 改用該函式，active 連結加 `aria-current="page"`；視覺樣式不變。
- 新增 `app/not-found.tsx`：中文 `<title>`、`h1`、說明與兩個導回按鈕。
- 既有一個 navbar 單元測試的 pathname 由子頁改為前綴相似路徑（`/matchmakerx`）。

```
=== Before ===
/matchmaker          navbar: 對戰分配 = active           (無 aria-current)
/matchmaker/players  navbar: 全部 muted                  (使用者看不出所在區段)
/matchmakerx         Next 預設英文 404，title 英文
/xyz                 Next 預設英文 404，title 英文，無導回連結

=== After ===
/matchmaker          navbar: 對戰分配 = active + aria-current="page"
/matchmaker/players  navbar: 對戰分配 = active + aria-current="page"
                     區段導覽: 參賽者 = aria-current="page"（不變）
/matchmakerx         中文 404 頁（navbar 全部 muted）
/xyz                 中文 404 頁，HTTP 404，[回首頁] [前往對戰分配]
```

---

## UI Mockups

```
=== State 1: Before — 參賽者頁的 navbar ===

┌──────────────────────────────────────────────────────────────┐
│ ◆ 匹克球指南        首頁  完整體驗  計分板  測驗  對戰分配  [→]│ <- 五個連結皆 muted
├──────────────────────────────────────────────────────────────┤
│  對戰   參賽者   歷史   資料   統計                          │ <- 參賽者有底線
│         ‾‾‾‾‾‾                                                │
│  參賽者名單 ...                                              │
└──────────────────────────────────────────────────────────────┘

=== State 2: After — 參賽者頁的 navbar ===

┌──────────────────────────────────────────────────────────────┐
│ ◆ 匹克球指南        首頁  完整體驗  計分板  測驗 *對戰分配* [→]│ <- 深色字 + aria-current="page"
├──────────────────────────────────────────────────────────────┤
│  對戰   參賽者   歷史   資料   統計                          │ <- 不變
│         ‾‾‾‾‾‾                                                │
│  參賽者名單 ...                                              │
└──────────────────────────────────────────────────────────────┘
```

```
=== State 3: Before — 造訪 /this-page-does-not-exist ===

┌──────────────────────────────────────────────────────────────┐
│ ◆ 匹克球指南        首頁  完整體驗  計分板  測驗  對戰分配  [→]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│            404 | This page could not be found.               │ <- 英文、無導回
│                                                              │
└──────────────────────────────────────────────────────────────┘
  <title>: 404: This page could not be found.

=== State 4: After — 造訪 /this-page-does-not-exist（HTTP 404）===

┌──────────────────────────────────────────────────────────────┐
│ ◆ 匹克球指南        首頁  完整體驗  計分板  測驗  對戰分配  [→]│ <- navbar 照常
├──────────────────────────────────────────────────────────────┤
│                                          (pt = --site-nav-h) │
│   404                                                        │
│   找不到這個頁面                                    <- h1    │
│   你要找的網址不存在，可能是連結已失效或網址輸入有誤。       │
│                                                              │
│   [回首頁]  [前往對戰分配]                 <- 主要 / outline │
│                                                              │
└──────────────────────────────────────────────────────────────┘
  <title>: 找不到頁面 | 匹克球指南
              │
              │ 點擊 [回首頁]
              ▼

=== State 5: 導回首頁 ===

  網址 /，顯示首頁 Hero；navbar「首頁」= active + aria-current="page"
```

---

## Architecture

```
 app/layout.tsx (root layout，不改)
 ├─ SiteNavbar ("use client")
 │    usePathname() ──► isNavLinkActive(href, pathname)   [lib/navActive.ts，新增，純函式]
 │                         │
 │                         └─► active ? aria-current="page" + 既有 active class
 └─ <ViewTransition>{children}
        ├─ 既有各路由 page.tsx
        └─ 未匹配路由 ──► app/not-found.tsx               [新增，Server Component]
                           ├─ metadata.title
                           └─ <main pt-(--site-nav-h)>
                                h1 + p + Button asChild(Link "/") + Button asChild(Link "/matchmaker")

 app/matchmaker/layout.tsx ─► MatchmakerTabs ─► section-nav.ts（精確比對，不改）
 app/api/[[...route]]/route.ts ─► /api/* 一律轉發後端（不經 not-found，不改）
```
