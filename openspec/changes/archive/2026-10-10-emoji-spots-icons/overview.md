# Overview: emoji-spots-icons

## Scope

把 `remove-emoji` 留下純文字的兩處（測驗結果、獲勝對話框）補上 lucide 圖示，並讓品牌產地的國旗恢復成 emoji。

**Size**: small — 只動 1 個 capability（emoji-free-ui）、tasks ≤ 8、不新增相依
**Frontend involved**: yes — 測驗結果與獲勝對話框多了圖示
**DB schema touched**: no — 純前端
**Data migration**: no — 只還原 `brands.ts` 的靜態字串
**Cross-component flow**: no

---

## What Changes

- 測驗結果三句：句尾加 `Trophy`／`BicepsFlexed`／`BookOpen`
- 獲勝對話框：標題前加 `Trophy`
- 品牌產地：國旗 emoji 還原；守門放行成對的國旗序列

```
=== Before (remove-emoji 之後) ===
測驗結果   太強了！你已經是規則達人了
獲勝框     我方獲勝
品牌產地   美國・加州

=== After ===
測驗結果   太強了！你已經是規則達人了 <Trophy>
獲勝框     <Trophy> 我方獲勝
品牌產地   🇺🇸 美國・加州
```

---

## UI Mockups

測驗結果頁與獲勝對話框加上圖示後的樣子；圖示顏色跟著文字色。

```
=== State 1: 測驗結果 (9/10) ===
┌──────────────────────────────────┐
│               9 / 10             │
│              答對題數            │
│                                  │
│  太強了！你已經是規則達人了 (T)  │ <- (T) = lucide Trophy
│                                  │
│          [  再試一次  ]          │
│          [  回到指南  ]          │
└──────────────────────────────────┘
  6/10 時句尾為 BicepsFlexed，2/10 時為 BookOpen

=== State 2: 獲勝對話框 ===
┌──────────────────────────────────┐
│          (T) 我方獲勝         [x]│
│              11 - 0              │
│  [        再來一局        ]      │
│  [          關閉          ]      │
└──────────────────────────────────┘
```
