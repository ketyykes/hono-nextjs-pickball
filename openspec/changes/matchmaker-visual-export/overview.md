# matchmaker-visual-export（M9：JPG／PDF 匯出）

## Scope

讓對戰頁的當前這一輪能離開瀏覽器：一顆「匯出 JPG」把 App 名稱、回合編號、對戰方式、各場地
的球員色塊與比分畫成一張圖（丟進 LINE 群組用），一顆「列印 PDF」走瀏覽器列印流程輸出紙本
（貼在球場邊用）。兩者的內容由**同一份**匯出資料驅動，不會各說各話。

**規模判定：large。** 只影響 1 個 capability（新增 `visual-export`，無 Modified），但 tasks
超過 20 項（7 個 Requirement、26 個 Scenario、三層測試共 10 個 task 群），依規模表
「tasks > 20 即為 large」判定。

條件式區塊判定：

| 條件 | 判定 | 理由 |
|---|---|---|
| 前端需求 → UI Mockups | ✅ 有 | 匯出入口、停用狀態、被擋提示、匯出圖版面與列印版面全是視覺與互動 |
| 資料庫結構 → Data Model | ❌ 無 | 匯出為唯讀操作，不新增、不修改任何 schema 或 LocalStorage key |
| 資料遷移 → Data Migration | ❌ 無 | 不搬移也不轉換任何既有資料 |
| 跨元件流程 → Sequence Diagram | ✅ 有 | 「匯出 JPG」是順序敏感的非同步多步流程（組 scene → 等字型 → 繪製 → 編碼 → 下載），「列印 PDF」有明確的失敗分支，兩者的職責邊界只有畫出來才說得清 |

## What Changes

- 對戰頁新增「匯出 JPG」與「列印 PDF」兩個入口；尚無目前回合時**停用並說明原因**，不隱藏
- 新增純函式 `export-scene.ts`：由回合＋名單推導出唯一一份匯出內容（App 名稱、回合編號、
  對戰方式、場地編號、球員色塊漸層、姓名、比分或未完成狀態）
- JPG：以 **canvas 手繪**該份內容再編碼為 JPEG 下載，**零新增相依**
- PDF：同頁 `window.print()` + `@media print`，改顯示由同一份內容驅動的列印版
- 列印被阻擋時以 `role="alert"` 顯示繁體中文提示（判定為注入式純函式，可單元測試）
- 檔名 `matchmaker-round-<回合編號>-<YYYY-MM-DD>.jpg`，日期由呼叫端注入
- 匯出全程唯讀：不寫 LocalStorage、不改回合、不發任何網路請求

前後對照（純文字，不含 UI 細節）：

```
=== Before ===

  對戰頁 /matchmaker : 產生本輪 / 輸入比分 / 看休息名單
  帶走這一輪的方式   : 手機截圖 -- 有 navbar、有捲軸、場地多要截好幾張、
                       沒有回合編號
  資料可攜 prd 2     : JSON 有 M8 / CSV 有 M8 / JPG 無 / PDF 無
  package.json       : 無影像或 PDF 相關相依

=== After ===

  對戰頁 /matchmaker : 多兩個入口 [匯出 JPG] [列印 PDF]
  帶走這一輪的方式   : 一張含 App 名稱與回合編號的圖，或一份可列印的
                       PDF 版面
  資料可攜 prd 2     : JSON / CSV / JPG / PDF 四者到齊，13.5 可打勾
  package.json       : 仍無影像或 PDF 相關相依  <- 刻意維持
```

## UI Mockups

以下依使用順序列出六個 state。`←` 之後為註解，不是畫面文字。

第一組是入口本身的兩種狀態——差別只在有沒有目前回合。

```
=== State 1: 尚無目前回合，兩個入口停用 ===

┌─ /matchmaker ─────────────────────────────────────────────┐
│ [對戰]  參賽者                                            │
├───────────────────────────────────────────────────────────┤
│ 對戰方式 (●)單打 ( )雙打  場地數 [-] 1 [+]                │
│ [產生本輪對戰]                                            │
│ [匯出 JPG]░░░░  [列印 PDF]░░░░       ← 兩者 disabled      │
│ 產生本輪對戰後即可匯出目前場次        ← 說明, 不隱藏入口  │
├───────────────────────────────────────────────────────────┤
│           ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐                     │
│           :        空白球場          :                    │
│           └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘                     │
└───────────────────────────────────────────────────────────┘

=== State 2: 已有目前回合，兩個入口可用 ===

┌─ /matchmaker ─────────────────────────────────────────────┐
│ [產生下一輪]  [重設 / 再排]                               │
│ [匯出 JPG]  [列印 PDF]                ← 皆可點, 可 Tab 到 │
├───────────────────────────────────────────────────────────┤
│ 第 1 場地              第 1 局到 11                       │
│ ┌───────────┐   VS   ┌───────────┐                        │
│ │  王大明   │        │  李小華   │                        │
│ └───────────┘        └───────────┘                        │
└───────────────────────────────────────────────────────────┘
```

按下「匯出 JPG」後的兩個中間狀態：繪製中該鈕暫停用，完成後瀏覽器接手下載。

```
                    │  [匯出 JPG]
                    ▼

=== State 3: 匯出中 ===

│ [匯出 JPG]░░░░  [列印 PDF]            ← 只停用 JPG 那顆,  │
│                                          避免連點下載兩份 │
                    │  完成
                    ▼

=== State 4: 下載的 JPG 內容 ===

┌───────────────────────────────────────────────────────────┐
│  匹克球對戰分配機 · 第 3 輪 · 雙打    ← App 名稱/回合/方式│
├───────────────────────────────────────────────────────────┤
│  第 1 場地                            11 : 7  第一隊勝    │
│  ┌─────────────┐ ┌─────────────┐   ← 上排 = 第一隊,       │
│  │ 王大明      │ │ 陳小美      │     每格為該員雙色漸層,  │
│  │ 5.20        │ │ 4.60        │     文字色自動對比       │
│  └─────────────┘ └─────────────┘                          │
│  ┌─────────────┐ ┌─────────────┐   ← 下排 = 第二隊        │
│  │ 李小華      │ │ 林阿吉      │                          │
│  └─────────────┘ └─────────────┘                          │
│                                                           │
│  第 2 場地                                       未完成   │
│  ┌─────────────┐ ┌─────────────┐   ← 未完成場次不留白,    │
│  │ 張小龍      │ │ 已離開名單  │     找不到的球員以替代   │
│  └─────────────┘ └─────────────┘     文字呈現而非空格     │
└───────────────────────────────────────────────────────────┘
```

列印路徑有兩個結果：正常開啟列印預覽，或被擋而顯示提示。

```
                    │  [列印 PDF]
                    ▼

=== State 5: 列印預覽的版面 ===

┌─ 瀏覽器列印預覽 ──────────────────────────────────────────┐
│  匹克球對戰分配機 · 第 3 輪 · 雙打                        │
│                                                           │
│  第 1 場地            11 : 7   勝方 第一隊                │
│    第一隊  王大明 · 陳小美       ← 文字為主, 不印大面積   │
│    第二隊  李小華 · 林阿吉          色塊: 瀏覽器預設不印  │
│  ─────────────────────────────      背景圖                │
│  第 2 場地            未完成                              │
│    第一隊  張小龍 · 黃小珍                                │
│    第二隊  ...                                            │
│                                                           │
│  ← 無 navbar、無操作按鈕; 每個場地區塊 break-inside:avoid │
└───────────────────────────────────────────────────────────┘

=== State 6: 列印被阻擋 ===

│ [匯出 JPG]  [列印 PDF]                                    │
│ (!) 瀏覽器阻擋了列印視窗。請允許本站顯示彈出視窗後再試    │
│     一次, 或改用瀏覽器選單的「列印」功能 Ctrl / Cmd + P。 │
│                                       ← role="alert"      │
```

## Architecture

元件與資料流。重點是**唯一的內容真相來源是 `buildExportScene`**，JPG 與 PDF 只是它的兩種
呈現；瀏覽器 API 只出現在兩個葉節點。

```
   app/matchmaker/page.tsx        ← M5 既有, 本 change 只追加掛載
     │  取得 目前回合 + 名單 (M4/M5 已持有)
     │
     ├──uses──► lib/matchmaker/export-scene.ts     (純函式, unit)
     │             │  reuses ─► stage-layout.ts    (M5, 唯讀)
     │             │  reuses ─► colors.ts          (pickTextColor)
     │             ▼
     │          ExportScene  { background,width,height,title,courts[] }
     │             │
     │      ┌──────┴───────────────────────┐
     │      │                              │
     ▼      ▼                              ▼
   ExportActions.tsx                   PrintSheet.tsx
   (integration)                       (integration)
     │  uses                             │ data-print="sheet"
     ├─► export-filename.ts (純函式)     │ data-print="court"
     ├─► print-guard.ts     (純函式)     │
     │     ▲ 注入 window.print           │
     └─► scene-canvas.ts    (例外層)     │
           │ canvas → JPEG Blob          │
           ▼                             ▼
        <a download>                app/globals.css @media print
        瀏覽器下載                   隱藏 navbar 與控制項,
                                     顯示列印版, 場地不跨頁

  外部相依 (皆唯讀取用, 本 change 不修改):
    match-stage / M5 : stage-layout.ts, app/matchmaker/page.tsx
    player-roster    : Player, pickTextColor
    round-lifecycle  : Round / RoundMatch 型別與目前回合
  npm 相依: 零新增
```

## Sequence Diagram

兩條匯出路徑各畫一次。JPG 的重點是**非同步的四步**與期間的按鈕停用；PDF 的重點是**失敗分支**
——被擋時什麼都不會發生，若不主動提示，使用者只會看到「按了沒反應」。

```
使用者    ExportActions   export-scene   scene-canvas   瀏覽器
  │            │               │              │            │
  │ [匯出 JPG] │               │              │            │
  ├───────────►│               │              │            │
  │            │ 按鈕 disabled │              │            │
  │            ├──┐            │              │            │
  │            │◄─┘            │              │            │
  │            │ buildScene    │              │            │
  │            ├──────────────►│              │            │
  │            │◄──────────────┤ ExportScene  │            │
  │            │ paint(scene)  │              │            │
  │            ├─────────────────────────────►│            │
  │            │               │  await fonts.ready ╌╌╌╌╌╌►│
  │            │               │              │◄╌╌╌╌╌╌╌╌╌╌╌┤
  │            │               │              │ toBlob     │
  │            │◄─────────────────────────────┤ (jpeg)     │
  │            │ <a download> click           │            │
  │            ├─────────────────────────────────────────►│
  │            │ 按鈕恢復可用  │              │  下載檔案  │
  │◄───────────┤               │              │            │

--- 列印路徑 ---

使用者    ExportActions   print-guard    瀏覽器
  │            │               │            │
  │ [列印 PDF] │               │            │
  ├───────────►│               │            │
  │            │ requestPrint(window.print)  │
  │            ├──────────────►│            │
  │            │               │ printer()  │
  │            │               ├───────────►│
  │            │               │◄───────────┤ 列印預覽
  │            │◄──────────────┤ { ok:true }│
  │  看到預覽  │               │            │
  │◄───────────────────────────────────────┤

失敗分支 (printer 拋錯或不存在):
  │            │               │            │
  │            │               ├──┐ 判定為被阻擋
  │            │◄──────────────┤◄─┘ { ok:false, message:繁中 }
  │            │ role="alert"  │            │
  │◄───────────┤  ← 若不提示, 使用者只會看到「按了沒反應」
```

## Task Tree

tasks.md 的分群與相依。§2～§4 是純函式群，彼此獨立、可依序快速推進；§5／§6 是元件群，
§7 之後才碰瀏覽器 API 與真實頁面。

```
§1 前置確認 (Step 0 的延伸: 確認 M5 / M4 的實際產出與 App 名稱字串)
 │
 ├─ §2 export-scene.ts      (匯出內容組裝, 7 個 it)
 ├─ §3 export-filename.ts   (檔名組成, 1 個 it)
 └─ §4 print-guard.ts       (列印被擋判定, 3 個 it)
      │
      ├─ §5 ExportActions   (入口 + 被擋提示)   depends §2 §3 §4
      └─ §6 PrintSheet      (列印版內容)        depends §2
            │
            ├─ §7 scene-canvas.ts + page 掛載 + JPG 下載 E2E
            │        depends §2 §3 §5
            │     │
            │     └─ §8 PrintSheet 掛載 + @media print + 列印 E2E
            │              depends §6 §7
            │           │
            │           └─ §9 唯讀保證與無障礙 E2E  depends §7 §8
            │                 │
            └─────────────────┴─ §10 收尾驗證
                                  (lint / tsc / unit / e2e /
                                   人工看圖與列印預覽 / validate)
```

## Cross-Cutting Impact

| 檔案／模組 | 動作 | 影響面 |
|---|---|---|
| `lib/matchmaker/export-scene.ts` + test | 新增 | 唯一的匯出內容真相來源；JPG 與 PDF 共用 |
| `lib/matchmaker/export-filename.ts` + test | 新增 | 檔名格式與 M8 的備份檔名慣例對齊但各自實作 |
| `lib/matchmaker/print-guard.ts` + test | 新增 | 列印被擋判定；`window.print` 由呼叫端注入 |
| `lib/matchmaker/scene-canvas.ts` | 新增 | **例外層**：canvas 與 JPEG 編碼，無單元測試，E2E 驗收 |
| `components/matchmaker/ExportActions.tsx` + test | 新增 | 兩個入口、`<a download>`、`role="alert"` 提示 |
| `components/matchmaker/PrintSheet.tsx` + test | 新增 | 列印版內容；螢幕隱藏、列印顯示 |
| `app/matchmaker/page.tsx` | 修改 | **本 change 唯一觸碰的 M5 檔案**：掛入兩個元件 + `data-print="hide"` 包裝 |
| `app/globals.css` | 修改 | 新增 `@media print` 區塊；以 `body:has()` 收斂，**不影響其他路由的列印行為** |
| `tests/e2e/specs/visual-export.spec.ts` | 新增 | 五個 browser project 皆跑；含真實下載事件與 print media 模擬 |
| `nextjs-pickball/CLAUDE.md` | 修改 | 架構總覽的 `/matchmaker` 補記匯出能力 |
| `package.json` | **不動** | 零新增相依是 design Decision 1 的核心結論，收尾驗證機械確認 |
| `hooks/` | **不動** | 不新增任何 hook，避免動到 `pickleball-guide-page` 的 hooks 歸屬清單 |
| M5 的 `MatchStage`／`CourtCard`／`RoundControls`／`RestingPanel` | **不動** | M6～M8 並行中，少碰一個檔案就少一次合併衝突 |
| `hono-pickball/**` | **不動** | matchmaker 為 LocalStorage-only 純前端功能，匯出亦不上傳 |
