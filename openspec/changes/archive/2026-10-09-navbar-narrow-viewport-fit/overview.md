# Overview: navbar-narrow-viewport-fit

## Scope

修正 320px 寬裝置上 SiteNavbar 的「對戰分配」連結被切出畫面。< 375px 時隱藏 logo 並縮小內距，
≥ 375px 完全不變。

**Size**: small — 只動 1 個 capability、1 個元件的 className、1 個 E2E 檔，tasks 少於 8 項
**Frontend involved**: yes — 導航列版面
**DB schema touched**: no — 純前端樣式
**Data migration**: no — 無資料
**Cross-component flow**: no — 單一元件內的 CSS 變更

---

## What Changes

- < 375px：隱藏 logo、容器 `px-4` → `px-3`、連結 `px-2` → `px-1.5`
- ≥ 375px：零差異
- 新增 320px 的 E2E，用 `toBeInViewport({ ratio: 1 })` 驗「完整落在視口內」

所需寬度對照（單位 px）：

```
=== Before ===
16 + logo 20 + gap 12 + nav 298 + 16 = 362   > 320  (overflow 42)

=== After (< 375px) ===
12 + nav 278 + 12 = 302                        <= 320 (18 to spare)
```

---

## UI Mockups

```
=== State 1: Before, 320px ===

|<---------------- 320px viewport ---------------->|
+--------------------------------------------------+
| 🏓  首頁 完整體驗 計分板 測驗 對戰分                 |配  <- clipped
+--------------------------------------------------+


=== State 2: After, 320px ===

+--------------------------------------------------+
|  首頁 完整體驗 計分板 測驗 對戰分配                  |
+--------------------------------------------------+
   ^ logo hidden; "首頁" is the same destination


=== State 3: After, >= 375px (unchanged) ===

+------------------------------------------------------+
| 🏓    首頁 完整體驗 計分板 測驗 對戰分配                |
+------------------------------------------------------+
```
