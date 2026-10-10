# Overview: remove-emoji

## Scope

把介面上的 emoji 換成自繪 SVG 符號或純文字，配色、字型、版面與動畫全部維持原樣。另外加一條守門測試，掃描原始碼，之後再出現 emoji 就讓測試失敗。

**Size**: medium — 動到 3 個 capability（新增 emoji-free-ui，修改 site-navbar、scoreboard），新增一個 `components/icons/` 模組
**Frontend involved**: yes — 七個元件的呈現改變
**DB schema touched**: no — 純前端呈現
**Data migration**: no — 只改 `brands.ts` 的靜態字串
**Cross-component flow**: no — 沒有非同步或多服務流程

---

## What Changes

- 新增 8 個靜態 SVG 符號元件，只用 `currentColor`
- 7 處 emoji 換成符號或拿掉；品牌產地拿掉國旗
- 10 行註解的 ⚠️／✕ 改寫成文字
- 新增 emoji 守門測試

變更前後對照：

```
=== Before ===
navbar     🏓 匹克球指南
結論卡     🏓 / 🔄 / 🍳
迷思列     常見迷思 ✕ / 正確規則 ✓
價位       ★★★★☆☆☆☆☆☆  (文字字元)
測驗結果   ...規則達人了 🏆
獲勝框     🏆 我方獲勝
橫向提示   💡 建議橫向使用，體驗更好
品牌產地   🇺🇸 美國・加州

=== After ===
navbar     <LogoMark> 匹克球指南
結論卡     <ServeDiagonal> / <DoubleBounce> / <KitchenZone>
迷思列     常見迷思 <叉> / 正確規則 <勾>
價位       <Star>x10  (svg，顏色與 aria-label 不變)
測驗結果   ...規則達人了
獲勝框     我方獲勝
橫向提示   <RotateToLandscape> 建議橫向使用，體驗更好
品牌產地   美國・加州
```

---

## UI Mockups

以 Conclusion 結論卡和 navbar 為例，顏色沿用原本的 lime 強調色與 slate 深色背景。

```
=== State 1: Before (結論卡) ===
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│        🏓        │ │        🔄        │ │        🍳        │
│  下手發球打對角  │ │  前兩拍必須落地  │ │  廚房裡不能截擊  │
│  只有一次機會... │ │  雙彈跳規則...   │ │  可以進去，但... │
└──────────────────┘ └──────────────────┘ └──────────────────┘

=== State 2: After (結論卡) ===
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│     ┌──┬──┐      │ │   .  .           │ │    ┌─────┐       │
│     │ ╲│  │      │ │  / \/ \          │ │    │/////│ <廚房 │
│     │  ╲  │      │ │ ●    ●  ─────    │ │    ├─────┤ <網   │
│     └──┴─╲┘      │ │                  │ │    │/////│       │
│  下手發球打對角  │ │  前兩拍必須落地  │ │  廚房裡不能截擊  │
│  只有一次機會... │ │  雙彈跳規則...   │ │  可以進去，但... │
└──────────────────┘ └──────────────────┘ └──────────────────┘
   符號為 lime-400 線條，卡片底色、字級、圓角不變

=== State 3: navbar ===
Before: │ 🏓 匹克球指南          首頁 完整體驗 計分板 測驗 對戰分配 │
After : │ (O 匹克球指南          首頁 完整體驗 計分板 測驗 對戰分配 │
          ^ LogoMark: 球拍輪廓+球，跟著連結文字色 (白 / slate-900)
```

---

## Architecture

符號元件集中在 `components/icons/`，各使用位置只 import 自己需要的符號；守門測試直接讀檔案系統，不依賴任何元件。

```
components/icons/
  IconSvg (共用 <svg> 外殼: aria-hidden, focusable, className)
    ├─ LogoMark ──────────────► layout/SiteNavbar
    ├─ ServeDiagonalIcon ─┐
    ├─ DoubleBounceIcon ──┼───► guide/Conclusion
    ├─ KitchenZoneIcon ───┘
    ├─ MythMarkIcon ──┬───────► guide/shared/MythRow
    ├─ FactMarkIcon ──┘
    ├─ StarIcon ──────────────► guide/shared/PriceStars
    └─ RotateToLandscapeIcon ─► scoreboard/OrientationHint

純文字 (無符號): quiz/ResultScreen, scoreboard/GameOverDialog,
                 data/guide/brands.ts

app/emojiFree.test.ts ──fs 讀檔──► app/ components/ data/ lib/ hooks/
```
