## Why

本 change 是「對戰分配機」交付序的 **milestone M9（JPG／PDF 匯出）**，位置如下：

```
M1 參賽者名單（已合併）→ M2 分配引擎（已合併）→ M3 評分引擎 → M4 回合生命週期
   → M5 對戰畫面 → M6 場邊計分銜接 → M7 歷史頁 → M8 資料匯入匯出
   → 【M9 JPG／PDF 匯出（本 change）】
```

M5 之後，主持人在現場看得到對戰、也輸得了比分，但**畫面出不了瀏覽器**。球聚的實際動線是
「排完這一輪 → 截圖丟進 LINE 群組 → 大家找自己在幾號場地」，目前只能靠使用者自己按手機截圖：
截到的是含 navbar 與捲軸的半截畫面，場地多時還得截好幾張，而且沒有回合編號與 App 名稱，
貼進群組後沒人知道那是第幾輪。

`prd.md` 第 2 節把「資料可攜」列為產品目標，成功條件明列「JSON 完整備份還原；CSV 匯出賽果、
匯入名單；**並可輸出 JPG、PDF**」，13.5 驗收清單也有「可匯出 JSON（完整備份）、CSV（歷史
賽果）、**JPG 與 PDF**」。M8 交付了 JSON 與 CSV，JPG（9.4）與 PDF（9.5）是這條目標的最後
兩塊——在它們完成之前，13.5 這一項永遠打不了勾。

兩者的使用情境不同，不能互相取代：**JPG 給群組**（一張圖、彩色色塊、手機上一眼看完），
**PDF 給紙本**（列印貼在球場邊的公告板，或存檔備查）。

## 執行相依

本 change 的 worktree **從 `main` 開出**，因此下列 change MUST 先合併回 `main`：

| 相依 change | milestone | 本 change 用到什麼 |
|---|---|---|
| `matchmaker-match-stage-ui` | M5 | `/matchmaker` 對戰頁與 `app/matchmaker/page.tsx`（匯出入口的掛載點）、`lib/matchmaker/stage-layout.ts`（色塊版面推導）、`lib/matchmaker/tile-style.ts` 的漸層慣例 |
| `matchmaker-round-lifecycle` | M4 | 目前回合的資料模型（`roundNumber`／`format`／`courtNumber`／`teams`／`status`／`scores`／`winner`）與其 store；經由 M5 間接消費 |
| `matchmaker-rating-engine` | M3 | 僅經由 M4／M5 間接消費；本 change 只**顯示** `rating`，不計算 |

M5 的 worktree 本身即從「M4 已合併」的 `main` 開出，因此「M5 已合併」蘊含「M3、M4 已合併」。
若 apply 的 Step 0 發現 `main` 上沒有 `/matchmaker` 對戰頁，MUST 停止並回報，
**SHALL NOT 在本 change 內補做 M5**。

與 **M6（場邊計分銜接）、M7（歷史頁）、M8（資料匯入匯出）可並行**：本 change 不修改
`match-stage`、`match-history`、`data-transfer`、`site-navbar` 的任何既有 requirement，
入口按鈕以本 capability 自己的 ADDED requirement 描述（見 Capabilities 節的說明）。

## What Changes

新增 `visual-export` capability，涵蓋 `prd.md` 9.4（JPG）、9.5（PDF）、第 2 節目標表的
「資料可攜」列、§11 的「彈出視窗被擋」提示，以及 13.5 驗收清單中屬於 JPG／PDF 的項目：

- **匯出入口**：對戰頁提供「匯出 JPG」與「列印 PDF」兩個入口。**尚無目前回合時兩者
  `disabled` 並顯示繁體中文原因**，SHALL NOT 隱藏（理由見 design Decision 5）。
- **單一份匯出內容組裝**：新增純函式 `nextjs-pickball/lib/matchmaker/export-scene.ts`，
  由「目前回合 + 參賽者名單」推導出一份 `ExportScene`——含 App 名稱、回合編號、對戰方式、
  各場地編號、每位球員的色塊漸層與姓名、比分或未完成狀態。**JPG 與 PDF 共用這同一份
  scene**，兩條匯出路徑的內容因此不可能分歧（design Decision 2）。
- **JPG 匯出**（9.4）：以 **canvas 手繪**把 `ExportScene` 畫成圖再 `toBlob("image/jpeg")`
  下載。**不引入任何 DOM 轉圖套件**（html-to-image／dom-to-image／html2canvas）——
  取捨、被否決的替代方案與各自在 bundle 大小、漸層與 CJK 字型還原度、Cloudflare Workers
  部署相容性三個面向的評估，見 design Decision 1。
- **PDF 匯出**（9.5）：走**瀏覽器列印流程**（`window.print()` + `@media print`）。
  列印時隱藏全站導覽與操作控制項，改顯示由同一份 `ExportScene` 驅動的列印版內容
  （`PrintSheet`），每個場地區塊不跨頁切斷。**不引入 jsPDF 之類的 PDF 產生器**。
- **列印被阻擋的提示**（§11、9.5）：列印呼叫失敗或環境未提供列印能力時，以 `role="alert"`
  顯示繁體中文提示，說明可開啟彈出視窗權限或改用瀏覽器選單的列印功能。判定邏輯抽為
  純函式 `nextjs-pickball/lib/matchmaker/print-guard.ts` 並於該層 TDD。
- **檔名組成**（純函式）：`matchmaker-round-<回合編號>-<YYYY-MM-DD>.jpg`，日期由呼叫端
  注入，SHALL NOT 於函式內部呼叫 `new Date()`（沿用 M8 `backupFileName` 的同一慣例）。
- **唯讀保證**：匯出全程 SHALL NOT 修改回合、名單或任何 LocalStorage 資料，也 SHALL NOT
  發出任何網路請求——`prd.md` 12.4 明訂本版不傳送參賽者資料至後端。

### 不在本次範圍

以下為相鄰 milestone 的工作或本 change 明確排除的方向，SHALL NOT 順手實作：

- **JSON／CSV 匯出與匯入（M8）**：`prd.md` 9.2、9.3 的備份、還原、預覽與清除本機資料
  皆屬 `data-transfer` capability。本 change 不新增任何 JSON／CSV 路徑，也不修改
  `data-transfer` 的任何 requirement；兩者唯一的交集是**檔名格式的慣例**
  （`matchmaker-<用途>-<日期>.<副檔名>`），刻意各自實作而不跨 change import
  （見 design Decision 6）。
- **歷史頁與時間區間（M7）**：本 change 匯出的是**目前回合**，不是歷史賽果。歷史的
  JPG／PDF 匯出不在 `prd.md` 9.4／9.5 的文義內，也不在本 change。
- **場邊計分銜接（M6）**：`scoring` 狀態的實際產生屬 M6。本 change 只把場次狀態如實
  呈現為「未完成」或最終比分，SHALL NOT 為了匯出而改動任何狀態語意。
- **對戰畫面本身（M5）**：舞台版面、色塊尺寸、RWD 斷點、比分輸入皆已由 `match-stage`
  規範。本 change **不修改 M5 的任何元件檔**，只在 `app/matchmaker/page.tsx` 掛入自己的
  兩個元件與一個列印用包裝屬性（見 design Decision 3、Impact）。
- **所見即所得的畫面截圖**：本 change 匯出的是「依同一份資料重繪」的圖，不是舞台 DOM 的
  像素快照。`prd.md` 9.4 要求的是**內容**（App 名稱、回合編號、對戰方式、場地編號、色塊、
  姓名、比分或未完成狀態），不是像素一致；取捨見 design Decision 1 與 Risks。
- **休息名單、歷史統計、QR code 等額外資訊**：`prd.md` 9.4 未列，不預先加。

## Capabilities

### New Capabilities

- `visual-export`：對戰畫面的視覺匯出規格——匯出入口與可用狀態、匯出內容的組成
  （App 名稱／回合編號／對戰方式／場地編號／球員色塊／姓名／比分或未完成狀態）、
  JPG 檔案的產生與下載、PDF 的瀏覽器列印流程與列印版版面、列印被阻擋時的繁體中文提示、
  匯出的唯讀與純前端保證，以及匯出入口的可用性與無障礙條款。

### Modified Capabilities

（無）

> 未列入 Modified 的 capability 與理由：
> - `match-stage`（M5）：匯出入口**放在對戰頁**，但以本 capability 自己的 ADDED
>   requirement 描述（「對戰頁 SHALL 提供匯出 JPG／列印 PDF 的入口」），**不 MODIFY
>   `match-stage` 的既有 requirement**。M6／M7／M8 與本 change 同期並行，四個 worktree
>   若都去改同一條 `match-stage` requirement，合併時衝突的會是**規格文字**而非程式碼，
>   比程式碼衝突更難自動解。
> - `site-navbar`：matchmaker 的全站導覽入口已由 M5 以 Modified `site-navbar` 處理，
>   本 change 不新增路由、不動 navbar。
> - `round-lifecycle`／`match-history`／`player-roster`：皆為**唯讀消費**，
>   不改任何 requirement，也不寫入任何持久化資料。
> - `data-transfer`（M8）：本 change 不觸及 JSON／CSV 的任何 requirement。

## Impact

- **新增**：
  - `nextjs-pickball/lib/matchmaker/export-scene.ts`（匯出內容組裝，純函式）與
    `export-scene.test.ts`
  - `nextjs-pickball/lib/matchmaker/export-filename.ts`（檔名組成，純函式）與
    `export-filename.test.ts`
  - `nextjs-pickball/lib/matchmaker/print-guard.ts`（列印呼叫與被擋判定，純函式）與
    `print-guard.test.ts`
  - `nextjs-pickball/lib/matchmaker/scene-canvas.ts`（Canvas 繪製與 JPEG 編碼，
    **例外層**：純瀏覽器 API 呼叫、無分支決策，以 E2E 驗收，見 design Decision 7）
  - `nextjs-pickball/components/matchmaker/ExportActions.tsx`（兩個入口 + 被擋提示）與
    `ExportActions.test.tsx`
  - `nextjs-pickball/components/matchmaker/PrintSheet.tsx`（列印版內容）與
    `PrintSheet.test.tsx`
  - `nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`
- **修改**：
  - `nextjs-pickball/app/matchmaker/page.tsx`（掛入 `ExportActions` 與 `PrintSheet`，
    並為互動區塊加上 `data-print="hide"` 包裝）——**本 change 唯一觸碰的 M5 檔案**
  - `nextjs-pickball/app/globals.css`（新增一段 `@media print` 規則，選擇器以
    `data-print` 屬性收斂，見 design Decision 3）
  - `nextjs-pickball/CLAUDE.md` 的架構總覽（`/matchmaker` 補記匯出能力）
- **重用（唯讀，不修改）**：`lib/matchmaker/stage-layout.ts`（M5 的色塊版面推導）、
  `lib/matchmaker/colors.ts` 的 `pickTextColor`、`lib/matchmaker/types.ts` 的 `Player`、
  M4 的回合型別與 store（僅透過 `page.tsx` 取得）
- **無外部相依**：**不新增任何 npm 套件**。JPG 走瀏覽器內建 Canvas API、
  PDF 走瀏覽器內建列印流程
- **不動**：`hono-pickball/**`（matchmaker 依 `prd.md` 為 LocalStorage-only 純前端功能）、
  `hooks/`（不新增任何 hook，避免動到 `pickleball-guide-page` 的 hooks 歸屬清單）、
  M5 的 `MatchStage`／`CourtCard`／`RoundControls`／`RestingPanel` 等元件檔
