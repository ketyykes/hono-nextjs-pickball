# quick-rating-spec-backfill 一頁摘要

## Scope

`prd.md` 4.1.3 的「新手 1.00／中階 3.00／高階 5.00」快速分數**早就做好了**（`PlayerForm.tsx` 的 `RATING_PRESETS`），但 `openspec/specs/player-roster/spec.md` 完全沒提它，`components/matchmaker/` 也一個測試檔都沒有。本 change 只做兩件事：把這條行為補進 `player-roster` 主 spec，並補 5 個 regression guard 測試，讓「改壞了會有測試轉紅」成立。**不新增功能、產品程式碼預期 0 行 diff。**

**規模判定：small。** 影響 1 個 capability（`player-roster`）、tasks 6 項（≤ 8）、無新依賴（`@testing-library/user-event` 已在 devDependencies）、無架構變更——四項條件同時成立，無任何一項命中 medium。

各條件式區塊的判定：

| 條件 | 判定 | 理由 |
|---|:---:|---|
| 前端需求 → UI Mockups | ✅ **含** | delta 的 Requirement 描述的就是表單上的按鈕與輸入框互動（點擊後填入、填入後仍可改、不得觸發送出），屬「使用者介面、互動、視覺狀態」。 |
| 資料庫結構 → Data Model | ❌ 不含 | 本專案為 LocalStorage-only 純前端，無資料庫；且本 change 不動 `matchmaker:roster:v1` 的結構，`rating` 欄位定義沿用既有的「參賽者資料模型」Requirement。 |
| 資料遷移 → Data Migration | ❌ 不含 | 無任何既有資料需要搬移或轉換——行為未變，使用者手上的名單一筆都不受影響。 |
| 跨元件流程 → Sequence Diagram | ❌ 不含 | 單一元件內的同步互動：點擊 → `setRatingText` → 重新 render。無非同步任務、無 webhook、無排程、無多服務協作。 |

因此本檔含 Scope、What Changes、UI Mockups 三個區塊（Architecture、Task Tree、Cross-Cutting Impact 為 medium／large 起，本檔不含）。

## What Changes

- `player-roster` 新增 **1 條 ADDED Requirement**「快速帶入強度分數」：三個級別與分數、點擊後以兩位小數填入、填入後仍可手動改為 1.00～8.00 內任意兩位小數、按鈕不得觸發表單送出、三組級別由單一常數渲染。
- 新增 `nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`（4 個 unit regression guard）。
- 於既有 `nextjs-pickball/tests/e2e/specs/player-roster.spec.ts` 追加 1 個 e2e test；helper 加一個選填參數，既有 4 個 test 呼叫端不變。
- **不 MODIFY 任何既有 Requirement**、不動 `PlayerForm.tsx`、不動 `lib/`／`hooks/`／`app/`、不新增 npm 套件。

下圖對照的不是功能，而是**規格與測試的覆蓋範圍**——功能兩邊一模一樣。

```
=== Before ===

  prd.md 4.1.3  新手 1.00 / 中階 3.00 / 高階 5.00
  prd.md 13.2   [ ] 可使用新手 / 中階 / 高階快速分數
        |
        |  (規格斷線: 沒有任何 spec 承接這一項)
        X
  specs/player-roster/spec.md   7 條 Requirement, 全部沒提快速分數
        |
        |  (測試斷線: components/matchmaker/ 零測試檔)
        X
  PlayerForm.tsx  RATING_PRESETS  <-- 實作在這裡, 沒人守著
        ^
        |  e2e 只是"借用"這顆按鈕填分數, 不斷言它

  改壞不會紅: 砍成兩顆 / 拿掉 toFixed(2) / 拿掉 type="button"
              -> 三種改法, 測試全綠

=== After ===

  prd.md 4.1.3 / 13.2
        |
        v
  specs/player-roster/spec.md   8 條 Requirement
        + 快速帶入強度分數 (ADDED, 5 個 Scenario)
        |
        +--> PlayerForm.test.tsx      4 個 unit  (新增檔案)
        +--> player-roster.spec.ts    1 個 e2e   (既有檔追加)
        |
        v
  PlayerForm.tsx  RATING_PRESETS  <-- 行為完全未變, 但改壞即紅燈
```

## UI Mockups

下面畫的是**現況**（本 change 不改介面），用途是把 delta spec 的四個 unit Scenario 對應到畫面上的哪一塊，供 apply 階段寫測試時對照。範圍限於新增參賽者 Dialog 中「強度分數」那一段，姓名／性別／漸層三段以 `(...)` 省略。

```
=== State 1: 開啟新增參賽者 Dialog, 強度分數尚未填 ===

┌─ 新增參賽者 ─────────────────────────────────┐
│  姓名    [___________]                       │
│  性別    [男 ▼]                              │
│  漸層    (起始色) (結束色)                   │
│                                              │
│  強度分數                                    │
│  [1.00 ~ 8.00_______]        <- placeholder  │
│  [新手 1.00] [中階 3.00] [高階 5.00]         │
│   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  │
│   Scenario 1: 三顆按鈕齊備, 名稱含分數       │
│                                              │
│                      [取消] [新增參賽者]     │
└──────────────────────────────────────────────┘
        │
        │  點擊 [中階 3.00]
        ▼

=== State 2: 快速帶入後 ===

┌─ 新增參賽者 ─────────────────────────────────┐
│  (...)                                       │
│  強度分數                                    │
│  [3.00______________]  <- Scenario 2         │
│                           兩位小數, 非 "3"   │
│  [新手 1.00] [中階 3.00] [高階 5.00]         │
│                                              │
│  註: 姓名此時仍為空, 但畫面上"沒有"錯誤提示  │
│      -> Scenario 4: 按鈕是 type="button",    │
│         不觸發 submit                        │
│                      [取消] [新增參賽者]     │
└──────────────────────────────────────────────┘
        │
        │  使用者選起 3.00 改打 4.25
        ▼

=== State 3: 快速帶入只是捷徑, 不是封閉清單 ===

┌─ 新增參賽者 ─────────────────────────────────┐
│  (...)                                       │
│  強度分數                                    │
│  [4.25______________]  <- Scenario 3         │
│                           送出後 rating=4.25 │
│  [新手 1.00] [中階 3.00] [高階 5.00]         │
│                                              │
│                      [取消] [新增參賽者]     │
└──────────────────────────────────────────────┘

=== State 4 (反例, 用來說明 Scenario 4 守的是什麼) ===

若 [中階 3.00] 漏標 type="button", 表單內按鈕預設為 submit:

┌─ 新增參賽者 ─────────────────────────────────┐
│  ┌────────────────────────────────────────┐  │
│  │ ! 請輸入姓名, 不可留空或僅有空白字元   │  │
│  └────────────────────────────────────────┘  │
│  姓名    [___________]                       │
│  (...)                                       │
│  強度分數                                    │
│  [___________________]   <- 值也沒填進去     │
│  [新手 1.00] [中階 3.00] [高階 5.00]         │
└──────────────────────────────────────────────┘
   快速帶入從捷徑變成障礙; 目前沒有任何測試會紅
```
