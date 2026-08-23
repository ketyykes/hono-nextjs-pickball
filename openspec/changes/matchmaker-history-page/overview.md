# matchmaker-history-page（M7）一頁摘要

> 給人類讀的摘要。apply 階段不必讀此檔，validator 也不解析它。
> 正式內容以 [proposal.md](./proposal.md)、[specs/](./specs/)、[design.md](./design.md) 為準。

## Scope

M4 已經把每場賽果寫進 `matchmaker:history:v1`，但沒有任何畫面看得到——資料只進不出。本 change 補上 `/matchmaker/history`：用 `prd.md` 8.1 的五個時間區間篩選歷史，每筆顯示 8.2 的全部欄位，空區間給友善空狀態。核心是把「切點與區間歸屬」做成純函式，並用 PRD 的兩個驗算例鎖住。

**規模判定：large。** 唯一命中 large 的條件是 task 數（tasks.md 共 47 個 checkbox，> 20）；影響的 capability 只有 `match-history` 一個、不跨服務、無資料遷移，實質複雜度接近 medium。依「取最大命中」規則判為 large，因此補上 Task Tree 與 Cross-Cutting Impact 兩個區塊。

條件式區塊判定：

| 判定項 | 結果 | 理由 |
|---|:---:|---|
| 前端需求 → UI Mockups | ✅ 含 | 新增一個路由與四個呈現元件，spec 有篩選、欄位、空狀態三條介面 requirement |
| 資料庫結構 → Data Model | ❌ 不含 | 本功能只讀 LocalStorage，無 table、無欄位增刪、無 schema migration |
| 資料遷移 → Data Migration | ❌ 不含 | 不建立、不改寫、不刪除任何 key，紀錄 schema 由 M4 定案且本 change 唯讀 |
| 跨元件流程 → Sequence Diagram | ✅ 含 | hydration 是順序敏感的多步互動（SSR 空輸出 → effect 取樣時間 → 讀 reader → 篩選 → 重新渲染），順序寫錯即 hydration mismatch |

## What Changes

- 新增純函式 `lib/matchmaker/history-range.ts`：`computeRangeCutoffs`、`rangeOfTime`、`filterHistoryByRange`。
- 切點 `C0/C1/C2/C3` 以 `min()` 逐層 clamp，保證單調不遞增 → 五個區間互斥且完整覆蓋。
- 週起始為**週一**，切點取**當地時區** 00:00，「現在」由呼叫端**注入**。
- 新增路由 `/matchmaker/history` 與四個呈現元件（篩選、紀錄卡、空狀態、client 組合層）。
- 於 M5 的 matchmaker 導覽加一個連往歷史頁的連結。
- 全頁對 `matchmaker:history:v1` **唯讀**。

下圖對照本 change 前後，歷史資料從「只進不出」變成有讀取端：

```
=== Before ===

  M4 回合結束
      |
      v
  matchmaker:history:v1  ---->  (沒有任何讀取端)
                                 只能開 DevTools 看

=== After ===

  M4 回合結束
      |
      v
  matchmaker:history:v1  ---->  /matchmaker/history   [本 change]
      ^                              |
      |                              +-- 五區間篩選
      +-- 唯讀, 不回寫               +-- 8.2 全欄位
                                     +-- 空區間友善空狀態
                         ---->  CSV 匯出 (M8, 不在本次範圍)
```

## UI Mockups

新增頁面，因此沒有 before 狀態；以下列出四個關鍵狀態。`(*)` 表示該篩選為選中。

```
=== State 1: 首次進入, matchmaker:history:v1 不存在 ===

+------------------------------------------------------------+
|  歷史紀錄                                                  |
|                                                            |
|  (*)今日  ( )本週  ( )本月  ( )上月  ( )更早               |
|                                                            |
|                                                            |
|                  還沒有任何對戰紀錄                        |
|       完成一場對戰並送出比分後, 紀錄就會出現在這裡         |
|                                                            |
|                     [ 前往對戰頁 ]                         |
|                                                            |
+------------------------------------------------------------+
                                        ^
                        引導型空狀態, 不是「無資料」四個字
```

```
=== State 2: 有今日紀錄, 預設選中今日 ===

+------------------------------------------------------------+
|  歷史紀錄                                                  |
|                                                            |
|  (*)今日  ( )本週  ( )本月  ( )上月  ( )更早               |
|                                                            |
|  +------------------------------------------------------+  |
|  | 場地 2 . 雙打 . 混雙        2026-08-15 20:41         |  |
|  | ID 8f3c-4a21                                         |  |
|  |                                                      |  |
|  | 第一隊  小美 4.20 -> 4.35   阿凱 3.80 -> 3.95        |  |
|  | 第二隊  阿豪 5.10 -> 4.96   小柏 2.90 -> 2.79        |  |
|  |                                                      |  |
|  |        比分 11 : 7        [ 勝 ] 第一隊              |  |
|  +------------------------------------------------------+  |
|                                                            |
|  +------------------------------------------------------+  |
|  | 場地 1 . 單打                2026-08-15 20:12        |  |
|  |                     ^                                |  |
|  |        單打不顯示雙打組成標示                        |  |
|  +------------------------------------------------------+  |
+------------------------------------------------------------+
        由新到舊排序: 20:41 在 20:12 之上
```

```
=== State 3: 點擊「上月」後 ===

  (*)今日 ...
      |
      | click 上月
      v

+------------------------------------------------------------+
|  (*)上月  ( )今日  ( )本週  ( )本月  ( )更早               |
|                                                            |
|  +------------------------------------------------------+  |
|  | 場地 1 . 雙打 . 男雙        2026-07-19 21:03         |  |
|  +------------------------------------------------------+  |
|                                                            |
|   今日的紀錄已不在畫面上 ( 篩選互斥 )                      |
+------------------------------------------------------------+
```

```
=== State 4: 跨月週 ( 假設今天是 2026-08-01 週六 ) ===

  C0 = 8/1   C1 = 7/27   C2 = min(8/1, 7/27) = 7/27   C3 = 7/1

  ( )今日  ( )本週  (*)本月  ( )上月  ( )更早
                     |
                     v
+------------------------------------------------------------+
|                                                            |
|                   本月還沒有紀錄                           |
|     這一週從 7/27 開始, 該週的賽果都歸在「本週」           |
|                                                            |
|                     [ 看本週 ]                             |
|                                                            |
+------------------------------------------------------------+
                          ^
        這是正常結果, 不是錯誤 ( prd.md 13.5 )
```

## Architecture

資料由下往上：純函式在最底層且完全不知道 React 與 LocalStorage 的存在；唯一的 I/O 邊界在 `HistoryView` 的 hydration effect。

```
  app/matchmaker/history/page.tsx        入口 ( 例外層 )
        |  render
        v
  components/matchmaker/HistoryView.tsx  "use client", 持有 state
        |                       |
        | hydration effect      | 篩選 ( 純運算 )
        v                       v
  readHistory() ( 唯讀 )   lib/matchmaker/history-range.ts
        |                    computeRangeCutoffs(now)
        v                    rangeOfTime(time, now)
  matchmaker:history:v1      filterHistoryByRange(entries, range, now)
                                          |
        +---------------------------------+
        v
  HistoryRangeFilter  HistoryRecordCard  EmptyHistory
       ( 五區間 )        ( 8.2 欄位 )      ( 空狀態 )
       純呈現, 無日期邏輯, 無 storage 存取

  ---- 本 change 不觸碰 ----
  lib/matchmaker/storage.ts ( RESET_KEYS 屬 M4 )
  components/layout/SiteNavbar.tsx ( 屬 M5 )
  CSV 匯出 ( 屬 M8 )
```

## Sequence Diagram

hydration 的順序是本 change 最容易寫錯的地方：SSR 期間**不得**取用時鐘或 LocalStorage，否則首次輸出必與 client 不一致。

```
 Browser     page.tsx   HistoryView   M4 reader   history-range
   |            |            |            |            |
   | GET /matchmaker/history |            |            |
   |----------->|            |            |            |
   |            | SSR: 只輸出空狀態       |            |
   |            | ( 不讀時鐘, 不讀 storage )           |
   |<-----------|            |            |            |
   |            |            |            |            |
   | hydrate    |            |            |            |
   |------------------------>|            |            |
   |            | useEffect: now = new Date() 取樣一次 |
   |            |            |----------->|            |
   |            |            |            | records    |
   |            |            |<-----------|            |
   |            |            |------------------------>|
   |            |            | 今日區間, 由新到舊      |
   |            |            |<------------------------|
   | re-render: 顯示列表     |            |            |
   |<------------------------|            |            |
   |            |            |            |            |
   | click 上月 |            |            |            |
   |------------------------>|            |            |
   |            |            |------------------------>|
   |            |            | 沿用同一個 now, 不重取  |
   |            |            |<------------------------|
   | re-render: 上月列表     |            |            |
   |<------------------------|            |            |

   失敗分支: reader 讀不到資料或 storage 不可用
   |            |            |----------->|            |
   |            |            |            | 空陣列     |
   |            |            |<-----------|            |
   | 顯示引導型空狀態, 不拋例外, 不中斷畫面            |
   |<------------------------|            |            |
```

## Task Tree

嚴格線性相依：純函式先定型，元件才有可信賴的地基可接。

```
§1 區間切點計算 ( history-range.ts, 11 tasks )
 |   computeRangeCutoffs + min() clamp + 週一起始 + 當地時區
 |
 +-- §2 區間歸屬 ( 7 tasks )                    Depends on: §1
      |   rangeOfTime, 單向掃描, 今日上界為 +oo
      |
      +-- §3 篩選與排序 ( 6 tasks )             Depends on: §2
           |   3.1 先對齊 M4 schema ( 非實作項 )
           |   filterHistoryByRange + recordTime()
           |
           +-- §4 歷史頁與紀錄呈現 ( 9 tasks )  Depends on: §3
                |   E2E 承擔 RED: 路由 / 篩選 / 欄位 / 空狀態
                |
                +-- §5 導覽入口與唯讀 ( 5 tasks )  Depends on: §4
                     |
                     +-- §6 收尾驗證 ( 9 tasks )
                          錨點核對 / lint / typecheck / test
                          e2e / validate / mutation / build
```

## Cross-Cutting Impact

| 檔案 | 動作 | 層級 | 備註 |
|---|---|---|---|
| `nextjs-pickball/lib/matchmaker/history-range.ts` | 新增 | 行為邏輯，必 TDD | 本 change 唯一的邏輯模組 |
| `nextjs-pickball/lib/matchmaker/history-range.test.ts` | 新增 | 測試 | 13 個 unit it |
| `nextjs-pickball/app/matchmaker/history/page.tsx` | 新增 | 例外層（入口） | E2E 驗收 |
| `nextjs-pickball/components/matchmaker/HistoryView.tsx` | 新增 | 例外層（純呈現） | 唯一的 I/O 邊界 |
| `nextjs-pickball/components/matchmaker/HistoryRangeFilter.tsx` | 新增 | 例外層（純呈現） | 五區間篩選 |
| `nextjs-pickball/components/matchmaker/HistoryRecordCard.tsx` | 新增 | 例外層（純呈現） | 8.2 欄位 |
| `nextjs-pickball/components/matchmaker/EmptyHistory.tsx` | 新增 | 例外層（純呈現） | 各區間空狀態 |
| `nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts` | 新增 | 測試基礎建設 | 11 個 e2e test |
| M5 的 matchmaker 導覽（檔名待 apply 確認） | **修改**（加一個連結） | 例外層 | 本 change 唯一觸碰既有檔案處 |
| `openspec/changes/matchmaker-history-page/**` | 新增 | 文件 | 本 change 的 8 份 artifact |
| `nextjs-pickball/lib/matchmaker/storage.ts` | 不動 | — | `RESET_KEYS` 的維護屬 M4 |
| `nextjs-pickball/components/layout/SiteNavbar.tsx` | 不動 | — | 全站導覽屬 M5 |
| `nextjs-pickball/hooks/**` | 不動 | — | 不新增 hook（design Decision 5） |
| `openspec/specs/**` | 不動 | — | 主 spec 一律不得直接編輯 |
| `hono-pickball/**` | 不動 | — | 純前端 LocalStorage 功能，無後端 |
