# Overview: court-score-entry-submit-a11y

## Scope

對戰頁每個場地的手動比分輸入，現在只能用滑鼠／觸控點「送出比分」，且多個場地的欄位與按鈕名稱完全相同，螢幕閱讀器使用者分不出正在填哪一場。
本 change 讓比分欄位按 Enter 即可送出，並把每個場地的比分控制項包成「第 N 場地比分」具名群組；欄位與按鈕原本的名稱不變。

**Size**: small — 只影響 1 個 capability（match-stage），產品碼改 2 個元件檔，tasks 14 項，無新依賴、無架構變更。
**Frontend involved**: yes — 對戰頁場地卡片的比分輸入多了 Enter 送出與群組名稱，外觀不變。
**DB schema touched**: no — 後端零變更。
**Data migration**: no — 不動任何 LocalStorage 或雲端資料。
**Cross-component flow**: no — 仍是「ScoreEntry → CourtCard.handleScoreSubmit → onSubmitScore」的既有委派，只是多一個觸發來源（Enter）。

---

## What Changes

- `ScoreEntry` 外層改為 `<form>`，按鈕改 `type="submit"`；Enter 與點按鈕走同一個 submit handler。
- 兩欄位與按鈕包進 `role="group"`、`aria-label="第 N 場地比分"`；`CourtCard` 以場地編號組字傳入。
- 欄位「第一隊比分」「第二隊比分」與按鈕「送出比分」的名稱不變，既有約 89 行以名稱定位的測試零修改。
- 新增 4 個 unit it、1 條 E2E。

輔助科技讀到的結構前後對照（以場地 2 為例）：

```
=== Before ===
textbox "第一隊比分"
textbox "第二隊比分"
button  "送出比分"            (Enter 無作用)

=== After ===
group "第 2 場地比分"
  textbox "第一隊比分"
  textbox "第二隊比分"
  button  "送出比分" (submit) (任一欄位按 Enter 即送出)
```

---

## UI Mockups

外觀不變；以下標示鍵盤操作路徑。

```
=== 對戰頁，兩個場地 ===

┌──────────────────────────────┐ ┌──────────────────────────────┐
│ 第 1 場地                    │ │ 第 2 場地                    │
│  [色塊]        [色塊]        │ │  [色塊]        [色塊]        │
│  第一隊比分 第二隊比分       │ │  第一隊比分 第二隊比分       │
│  [    ]     [    ] [送出比分]│ │  [ 11 ]     [ 7 ]| [送出比分]│ <- 游標在此按 Enter
└──────────────────────────────┘ └──────────────────────────────┘
                                               │
                                               │ Enter
                                               ▼
                                 ┌──────────────────────────────┐
                                 │ 第 2 場地（已完成，欄位停用）│
                                 │  11 : 7                      │
                                 └──────────────────────────────┘
```

螢幕閱讀器（焦點由第 1 場地移到第 2 場地的第一隊比分欄位時）：
「第 2 場地比分，群組；第一隊比分，編輯文字」。

---

## Risks

- 方案 (a) 在瀏覽模式逐行閱讀時可能不讀群組名稱（只在焦點進入時讀）；接受此取捨以換取既有測試零修改（design Decision 2）。
- Enter 送出依賴瀏覽器原生隱式送出；五個 browser project 皆跑 E2E 驗證（C5 ①）。
