## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- **本 change 是 matchmaker 唯一需要「離開 DOM」的段落**。M1～M8 的產出都是頁面、純函式或
  文字檔（JSON／CSV）；本段第一次要把畫面變成**像素**（JPG）與**紙張版面**（PDF），
  兩者都涉及瀏覽器 API 而非可單元測試的純邏輯。分層因此比前幾段更關鍵。
- `nextjs-pickball` 目前**沒有任何圖片產生或 PDF 相關的相依**（見 `package.json`：
  dependencies 只有 Next／React／Radix／zod／Tailwind 生態）。要做 JPG 有兩條路——引入套件
  或用瀏覽器內建 API，這是本 change 最大的一個決策（Decision 1）。
- `lib/matchmaker/` 為**扁平佈局**，每個模組鄰近一份 `*.test.ts`；既有慣例是**純函式、
  無 I/O**（M8 的 design Decision 7 把這條慣例寫成明文：`buildBackup`／`toCsv` 只回傳字串，
  `Blob`／`<a download>`／`FileReader` 全留在元件層）。本段沿用同一條線。
- **本 workspace 的 TDD 分層規範**（`nextjs-pickball/CLAUDE.md`）：`app/**/page.tsx`、
  `app/**/layout.tsx`、純樣式檔與純呈現型元件屬**例外層**（不強制單元 TDD，以 E2E 驗收）；
  行為邏輯 MUST 下放 `lib/` 再對其做 TDD。本段的「可 TDD 的東西」是內容組裝、檔名組成與
  被擋判定三者，不是 canvas 繪製本身。
- M5 已提供 `lib/matchmaker/stage-layout.ts`（由 `Match` 推導每格的隊伍與 row／column）與
  `lib/matchmaker/tile-style.ts`（漸層與前景色推導）。本段**重用前者的版面規則**，
  但不重用後者的回傳值——`tile-style.ts` 產出的是 CSS inline style 物件，canvas 需要的是
  色碼與座標（見 Decision 2）。
- M4 的 `Round` 只保存**球員 id 與該輪分數快照**，姓名與顏色需由名單即時解析
  （`round-lifecycle` 的「回合資料模型」Requirement）。匯出因此必然要接受「名單裡找不到
  這個 id」的情況——這不是防禦性編程，是資料模型的必然。
- E2E 的 `testIdAttribute` 為 `data-testid`、`baseURL` 為 `http://localhost:3005`，
  五個 browser project。Playwright 的 `page.waitForEvent("download")` 與
  `page.emulateMedia({ media: "print" })` 是本段兩條 E2E 驗收的支點。
- Cloudflare Workers 部署（OpenNext）：任何在**模組載入時**觸碰 `document`／`window`／
  `node:` 內建的程式碼都會在 SSR／prerender 階段於 workerd 內執行而炸掉。這是選型時
  必須看的一欄（Decision 1）。

## Goals / Non-Goals

**Goals:**

- 讓 `prd.md` 9.4 明列的七項內容（App 名稱、回合編號、對戰方式、場地編號、球員色塊、姓名、
  比分或未完成狀態）成為**可被單元測試逐條驗證**的資料結構，而不是「看圖確認有沒有」。
- 讓 JPG 與 PDF **不可能顯示不同的內容**——兩者由同一份 `ExportScene` 驅動，
  內容漂移在結構上就做不到。
- 在**不新增任何 npm 相依**的前提下完成兩種匯出，維持本 repo 至今「matchmaker 全段零外部
  相依」的狀態（M1～M8 皆未新增套件）。
- 把瀏覽器 API 的接觸面壓到最小且集中：canvas 只在一個檔案、`window.print` 只在一個注入點。

**Non-Goals:**

- **不做所見即所得的畫面截圖**。匯出的是「依同一份資料重繪」的圖，不是舞台 DOM 的像素快照。
  `prd.md` 9.4 要求的是內容不是像素；重繪還帶來三個好處：跨瀏覽器輸出一致、不受捲動位置與
  RWD 斷點影響、不會把 navbar 與按鈕一起截進去。代價見 Risks。
- **不匯出休息名單、歷史統計、QR code**。`prd.md` 9.4 未列，加了就要為版面另立規則。
- **不做匯出設定**（尺寸、品質、深色版）。沒有需求，且每多一個選項就多一組要維護的版面。
- **不做 PDF 的精準分頁控制**（頁首頁尾、頁碼、指定紙張）。瀏覽器列印對話框已提供這些；
  本段只保證「場地不被切成兩半」這一條會真的影響可讀性的規則。
- 不處理 LocalStorage 損壞／配額——匯出是唯讀操作，根本不寫入。

## Decisions

### Decision 1：JPG 以 canvas 手繪產生，不引入 DOM 轉圖套件

這是本 change 的核心選型。四個候選方案的評估：

| 方案 | bundle | 漸層／CJK 還原度 | Workers 部署相容性 | 可測性 |
|---|---|---|---|---|
| **canvas 手繪（採用）** | **+0 KB** | 漸層由 `createLinearGradient` 原生產生，完全精確；CJK 由 `ctx.fillText` 以頁面已載入的字型繪製 | 全部在事件處理器內執行，模組層級無 `document` 觸碰，SSR 安全 | 版面與內容為純資料，可逐條單元測試；只有繪製動作是例外層 |
| `html-to-image` | 約 +15 KB gzip | 走 SVG `foreignObject`，**CJK 字型需先被 inline 成 data URI**，漏了就 fallback 成系統字型 | 套件在 import 時即讀 `document`，須以動態 `import()` 隔離，否則 OpenNext build／prerender 會炸 | 只能 E2E 目視，產出是一張圖 |
| `dom-to-image` / `dom-to-image-more` | 約 +12 KB gzip | 同上，且原專案久未維護、Safari 的 `foreignObject` 相容問題有已知未修 issue | 同上 | 同上 |
| `html2canvas` | 約 +50 KB gzip | 自行重新實作一套排版引擎，CSS 漸層與 CJK 換行是其長年 issue 熱區 | 同上，且體積最大 | 同上 |

還有一個常被提起的第五方案：**伺服器端渲染**（`satori` / `@vercel/og`，在 Worker 內產圖）。
直接否決——`prd.md` 12.4 明訂「本版不傳送參賽者資料至後端」，而要在伺服器產圖就得把全部
姓名與分數送上去，違反產品的資料安全承諾。

選 canvas 手繪的關鍵理由不是省 15 KB，是**可測性**：DOM 轉圖套件的輸出是一張圖，
唯一的驗收方式是人眼看；canvas 手繪則可以把「畫什麼」與「怎麼畫」切開——`ExportScene`
是純資料（可逐條斷言 App 名稱、回合編號、比分文字、漸層色碼），`paintScene` 只是照著
scene 呼叫 canvas API 的搬運工，沒有分支決策。這讓 `prd.md` 9.4 的七項要求變成七條單元測試
而不是一句「圖看起來對」。

**代價**是版面必須自己算（座標、字級、間距），且畫面改版時匯出不會自動跟著變。緩解見
Decision 2 與 Risks。

### Decision 2：JPG 與 PDF 共用同一份 `ExportScene`

`buildExportScene(round, players, options)` 是本段唯一的內容真相來源，兩條匯出路徑各自只做
「呈現」：

```
                buildExportScene()          ← 唯一決定「匯出什麼」的地方
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   paintScene(ctx, scene)     <PrintSheet scene={...} />
   canvas → JPEG blob         DOM → 瀏覽器列印 → PDF
```

替代方案是兩條路徑各自從 `round` + `players` 組裝。否決理由很具體：`prd.md` 9.4 與 9.5 的
內容要求高度重疊（回合、場次、比分），兩份組裝的差異會以「JPG 有顯示但列印稿沒有」的形式
被使用者發現，而那時已經沒有任何測試能指出誰是對的。共用一份之後，`prd.md` 9.4 的七項
單元測試同時保護了兩條路徑。

`ExportScene` 的形狀刻意**不含任何 CSS 或 canvas 概念**——它只有色碼、文字、座標與尺寸
（純資料、可序列化）。因此本段重用 M5 `stage-layout.ts` 的**版面規則**（哪一格屬哪一隊、
row／column），但不重用 `tile-style.ts` 的回傳值：後者產出的是 `background:
linear-gradient(...)` 這種 CSS 字串，canvas 沒辦法吃，硬解析字串比直接拿色碼更脆。
同一組色碼在兩處各自被組成 CSS 與 canvas gradient，這是**正確的重複**：它們是同一份資料的
兩種呈現，不是兩份資料。

### Decision 3：PDF 走同頁 `window.print()` + 專用列印版，不列印舞台 DOM、不開新視窗

三個候選：

| 方案 | 評估 |
|---|---|
| **同頁 `window.print()` + `PrintSheet`（採用）** | 列印版由本 change 自己擁有，選擇器穩定；內容與 JPG 同源；不受背景圖列印限制影響 |
| 直接列印舞台 DOM，用 print CSS 隱藏控制項 | ❌ 兩個問題：① 分頁控制要掛在 M5 的 `CourtCard` DOM 上，等於為了列印去改別的 capability 的元件；② **瀏覽器預設不印背景圖與背景色**，色塊漸層在紙上會整片消失，要靠 `print-color-adjust: exact` 硬撐，且使用者仍可在對話框關掉 |
| `window.open()` 新視窗寫入列印用 HTML 再 print | ❌ 新視窗不繼承 Next.js 的字型與樣式，得自己 inline 一份；而且**這才是真正會被彈出視窗阻擋器擋下的做法**——為了製造「被擋」情境而選一個會被擋的架構是本末倒置 |
| 引入 `jsPDF` / `pdf-lib` 自行產生 PDF | ❌ +100 KB 以上，且 CJK 字型要自行嵌入字型檔（動輒數 MB），`prd.md` 9.5 明說「可採瀏覽器列印流程」 |

`PrintSheet` **刻意做成文字為主的版面**（場地標題 + 隊伍 + 姓名 + 比分），不試圖重現色塊
漸層：紙本的目的是貼在公告板上讓人找場地，油墨與背景圖列印限制都不利於大面積色塊。
球員的顏色標記僅以小色點呈現，缺色時仍靠姓名可讀（`prd.md` 12.5：色彩不可作為唯一資訊來源）。

**列印 CSS 的選擇器收斂**：規則集中在 `app/globals.css` 的 `@media print`，以 `data-print`
屬性選取：

```
@media print {
  body:has([data-print="sheet"]) > header { display: none !important; }
  [data-print="hide"]  { display: none !important; }
  [data-print="sheet"] { display: block !important; }
  [data-print="court"] { break-inside: avoid; }
}
```

`body:has(...)` 的作用是**把「隱藏全站 navbar」限縮在有列印版的頁面**，不讓一條 matchmaker
的需求改變全站其他路由的列印行為。`:has()` 在 Chromium 105+／Safari 15.4+／Firefox 121+
皆已支援，符合 `prd.md` 12.2 的「現代瀏覽器」範圍。

`data-print="hide"` 一律由 `app/matchmaker/page.tsx`（本 change 已需修改的檔案）加在**包裝
元素**上，**不進 M5 的元件檔加屬性**——M6～M8 並行中，少碰一個檔案就少一次合併衝突。

### Decision 4：列印被擋判定抽為注入式純函式 `print-guard.ts`

```ts
export function requestPrint(printer: unknown): PrintOutcome
// { ok: true } | { ok: false; message: string }
```

`printer` 由呼叫端注入（元件層傳 `window.print.bind(window)`）。三個理由：

1. **可測**：happy-dom 下 `window.print` 是 stub，測它等於測 mock；改成注入後，
   「拋錯」「不是函式」「正常」三條路徑都能用普通的假函式在毫秒內驗完。
2. **E2E 無法穩定重現被擋**：Playwright 沒有「模擬彈出視窗阻擋器」的能力。若判定寫在元件裡
   讀 `window`，`prd.md` §11 的這一條就永遠沒有測試。
3. **兩種失敗形態的語意一致**：`window.print` 不存在（部分 WebView）與呼叫拋錯（擴充功能
   攔截）對使用者是同一件事——印不出來。合成一個判定點才不會有一條路徑漏了提示。

替代方案是在元件內 `try/catch` 後直接 `setError`。否決理由是訊息文案與判定條件會散落在
元件裡，且無法在不渲染 React 的情況下驗證。另一個替代方案是監聽 `afterprint` 事件反推
是否成功——否決：`afterprint` 在使用者取消列印時**同樣會觸發**，區分不出「被擋」與
「使用者按取消」，會對正常操作誤報錯誤。

> 用語說明：`prd.md` 9.5 說的是「瀏覽器阻擋列印視窗」。本段採同頁列印，理論上不經過彈出
> 視窗阻擋器，但使用者無從分辨兩者，且擴充功能與嵌入情境確實會讓 `window.print` 失效。
> 因此訊息同時給兩條退路：開啟彈出視窗權限、或改用瀏覽器選單的列印（Ctrl／Cmd + P）。

### Decision 5：無回合時匯出入口為 `disabled` 且附說明，不隱藏

兩個做法都能避免「匯出空白圖」，差別在使用者學到什麼：

- **隱藏**：使用者在名單頁與空白球場都看不到匯出，合理推論是「這個 App 沒有匯出功能」，
  於是繼續用手機截圖——功能做了等於沒做。
- **`disabled` + 說明（採用）**：使用者看到「匯出 JPG（需先產生本輪對戰）」，
  知道功能存在也知道怎麼解鎖。這與 M5 對「產生本輪對戰」在人數不足時的處理一致
  （`match-stage` 的「人數不足時停用並說明原因」Scenario），全站的停用語彙因此只有一套。

`prd.md` 12.3 要求 disabled 狀態清楚——「清楚」不只是視覺變淡，還要讓使用者知道下一步。

### Decision 6：檔名格式與 M8 對齊，但各自實作、不跨 change import

M8 已定 `matchmaker-backup-<YYYY-MM-DD>.json`（`data-transfer` spec 的「匯出檔名含注入的
日期」Scenario）。本段採同一個模式：`matchmaker-round-<回合編號>-<YYYY-MM-DD>.jpg`，
日期同樣**由呼叫端注入**、同樣取 ISO 字串的前 10 碼。

**不 import M8 的 `backupFileName`**：M8 與本 change 並行開發，本 change 的 worktree 從
不含 M8 的 `main` 開出，import 一個不存在的模組會讓整批 task 建立在幻想的介面上。兩個
小函式各自存在是已知且可接受的重複——它們的**格式決策各自屬於自己的 capability**，
日後 JPG 想在檔名帶場地數也不該去動備份檔名。

**已知取捨**：取 ISO 前 10 碼等於用 UTC 日期。台灣（UTC+8）在當地時間 08:00 前匯出會得到
前一天的日期。仍採此法，因為「與 M8 一致」比「日期在午夜前後絕對精確」重要——檔名日期的
用途是排序與辨識，不是稽核憑證；兩個匯出功能用兩套時區規則才是真正會讓人困惑的事。

### Decision 7：瀏覽器 I/O 留在例外層，`lib/` 的純度不為此破例

沿用 M8 Decision 7 的同一條線，本段的分層：

| 檔案 | 類型 | 職責 | TDD |
|---|---|---|---|
| `lib/matchmaker/export-scene.ts` | 純函式 | 由回合＋名單推導 `ExportScene` | unit |
| `lib/matchmaker/export-filename.ts` | 純函式 | 檔名組成 | unit |
| `lib/matchmaker/print-guard.ts` | 純函式 | 列印呼叫與被擋判定（注入式） | unit |
| `lib/matchmaker/scene-canvas.ts` | **例外層** | `createElement("canvas")`／`createLinearGradient`／`fillText`／`toBlob` | E2E |
| `components/matchmaker/ExportActions.tsx` | 呈現＋wiring | 兩個入口、`<a download>` 觸發、被擋提示 | integration |
| `components/matchmaker/PrintSheet.tsx` | 呈現 | 列印版內容 | integration |
| `app/matchmaker/page.tsx` | 例外層 | 掛載與 `data-print` 包裝 | E2E |
| `app/globals.css` | 例外層 | `@media print` 規則 | E2E |

`scene-canvas.ts` 放在 `lib/` 卻標為例外層需要交代：它**不是行為邏輯**——所有決策
（畫什麼、畫在哪、什麼顏色、多大）都已在 `ExportScene` 裡定死，本檔只是把 scene 逐項翻成
canvas 呼叫，沒有任何分支。happy-dom 沒有實作 2D context，硬要測就得自造一個假 ctx 錄下
呼叫序列——那驗證的是「我有沒有照我自己寫的順序呼叫」，不是「圖對不對」。真正能回答
「圖對不對」的是 E2E 下載檔案後檢查 JPEG 標記與檔案大小。

這與 M8 對 `Blob`／`URL.createObjectURL` 的判斷同構（「`URL.createObjectURL` 在 happy-dom
下是 stub，測到的是 mock 行為而非真實下載」）。

### Decision 8：找不到球員時輸出替代文字，不跳過該格、不拋錯

M4 的回合只存 id，使用者可在回合進行中刪除參賽者。三個選項：

- 拋錯 → 整個匯出失敗，使用者只知道「匯不出來」，不知道是誰不見了。**否決**。
- 跳過該格 → 雙打場地變成三個格子，版面錯位，看圖的人會以為是排錯對戰。**否決**。
- **輸出替代文字（採用）** → 該格照常畫出（灰底 + 「已離開名單」之類的可讀文字），
  其餘內容完整。使用者一眼看得出發生什麼事。

這與 M4 `match-history` 的做法在精神上一致：歷史保存**姓名快照**正是為了「刪人不該讓過去
的資料變空白」。回合沒有快照（刻意的，避免改名產生兩個真相），因此這道退路要在消費端做。

### Decision 9：不透明白底、2 倍縮放、JPEG 品質 0.92

三個數值都不是隨手選的：

- **不透明白底**：JPEG 無 alpha 通道。未先 `fillRect` 底色時，透明區域在部分瀏覽器會被
  編碼成**黑色**，整張圖變黑底白字。底色寫進 `ExportScene.background` 而非藏在繪製函式裡，
  就是為了讓這條規則被單元測試釘住（見 spec 的「匯出內容以不透明底色繪製」Scenario）。
- **2 倍縮放**：canvas 的 CSS 尺寸與位圖尺寸分離，位圖取 2 倍可讓文字在高解析螢幕與列印時
  不糊。不採 `devicePixelRatio`——那會讓同一輪在不同裝置匯出得到不同尺寸的檔案，
  違反「同一份輸入產生同一份輸出」的一貫要求。
- **品質 0.92**：JPEG 在 0.9 以下會在大面積漸層上出現可見色帶（banding），而球員色塊正是
  大面積漸層；1.0 則檔案暴增而肉眼無差。0.92 是常見的平衡點。

字型另有一條實作約束：繪製前 MUST `await document.fonts.ready`，否則 Noto Sans TC 尚未載入
時 `fillText` 會以 fallback 字型繪出，中文姓名的字寬與字形都會走樣（見 Risks）。

## Risks / Trade-offs

- **[手繪版面與畫面版面是兩份呈現，改畫面不會自動反映在匯出]** → 這是 Decision 1 的必然
  代價。緩解有三：① **內容**欄位只有一份（`ExportScene`），會漂移的只有像素座標；
  ② 版面規則（哪一格屬哪一隊）重用 M5 的 `stage-layout.ts`，不另寫一份；③ `prd.md` 9.4
  要求的是內容不是像素一致，因此「匯出圖與畫面不完全一樣」本身不構成缺陷。真正該防的是
  **少畫了某項內容**，而那七項都有單元測試。

- **[CJK 字型未載入時 `fillText` 以 fallback 繪製]** → 匯出前 `await document.fonts.ready`；
  字型名稱取自頁面既有的 CSS 變數並保留 `sans-serif` fallback。殘餘風險是使用者在字型載入
  完成前的極短時間內按下匯出——`document.fonts.ready` 正是為此而 await，不是為了保險。

- **[E2E 驗不了「圖的內容對不對」]** → 承認限制。E2E 能驗的是「有下載、是 JPEG、檔案非空」；
  「畫了什麼」由 `export-scene.test.ts` 的單元測試涵蓋。兩者合起來的覆蓋是：內容正確（unit）
  ＋ 真的產出檔案（e2e）。**不做像素快照比對**——五個 browser project 的字型 rasterization
  不同，像素比對會變成每次 CI 都要重新核准的雜訊來源。

- **[Playwright 無法真的開列印對話框]** → `window.print()` 在 headless 下會阻塞或無作用，
  因此 E2E 以 `addInitScript` 覆寫 `window.print` 為記錄呼叫的 stub，只驗「有沒有被呼叫
  一次」；版面則以 `emulateMedia({ media: "print" })` + computed style 驗。**真實的列印
  輸出無法自動化驗證**，這一點在 tasks 的收尾驗證明列為人工檢查項（實際按一次列印看預覽）。

- **[8 場地雙打時 JPG 會是一張很高的圖]** → 8 場地 x 4 格，預估高度約 3000～3500 px。
  在 LINE 群組裡會被壓縮預覽但點開仍可讀。不做自動縮排或多張切圖：`prd.md` 12.1 的常態規模
  是 1～2 個場地，為極端值增加版面模式會讓所有情況都變複雜。若日後成為真實抱怨，正解是
  加一個「每 N 場地一張」的切圖選項，那是另一個 change。

- **[`body:has()` 選擇器的瀏覽器支援]** → Chromium 105+／Safari 15.4+／Firefox 121+。
  低於此版本的瀏覽器列印時會多印一條 navbar——**降級後果是美觀問題而非功能失效**，
  對戰資訊仍完整。不為此加 JS 版的 fallback（在 `beforeprint` 動 class）：那會為了少數
  舊瀏覽器引入一個常駐事件監聽。

- **[列印版是第三種呈現形式，維護成本增加]** → 螢幕舞台（M5）、canvas 圖、列印版三者並存。
  接受，理由是三者的**受眾與媒介不同**（互動／群組分享／紙本），而它們共用同一份內容組裝，
  真正重複的只有排版。強行讓三者共用一套排版會讓每一種都不好用。

- **[M5 的實際匯出名稱與 `page.tsx` 結構在本 change 撰寫時尚未定案]** → 與 M5 對 M4 的處境
  同構。緩解：① `ExportActions` 與 `PrintSheet` 一律走 props，不 import 任何 store；
  ② spec 以**行為**描述契約（「對戰頁 SHALL 提供匯出入口」）而非以 M5 的函式名描述；
  ③ apply 的 Step 0 MUST 先讀 `main` 上 M5 的實際產出（`stage-layout.ts` 的函式簽章、
  `page.tsx` 的組裝方式、`Round` 的實際欄位）並把差異補進 Open Questions，
  **SHALL NOT 在 M5 未合併的情況下憑猜測開工**。

- **[匯出入口放在對戰頁，但 M6／M7／M8 也在動 matchmaker 區段]** → 本 change 只碰
  `app/matchmaker/page.tsx` 與 `app/globals.css` 兩個共用檔，且都是**追加**而非改寫既有段落。
  M7／M8 各自新增的是 `/matchmaker/history`、`/matchmaker/data` 兩個新路由，不動對戰頁。
  合併衝突的預估面積是 `page.tsx` 的 import 區塊，屬容易解的類型。

## Open Questions

1. **M5 的 `page.tsx` 如何取得「目前回合」與「名單」？** 本 change 需要這兩份資料才能組出
   `ExportScene`。預期 M5 的 `page.tsx` 已同時持有（它是唯一 import M4 store 的檔案）。
   apply Step 0 MUST 確認實際變數與型別，若 M5 的組裝方式不同（例如把回合直接展開成 props
   丟給 `MatchStage` 而不留在 page 層），MUST 在此補記後再開始 §7 的頁面組裝，
   SHALL NOT 為了拿資料去改 M5 的元件介面。

2. **`stage-layout.ts` 的實際函式名與回傳欄位**：design 假設為
   `buildCourtTiles(match) → { row, column, teamIndex, player… }`。若欄位名不同，
   `export-scene.ts` 依實際欄位改寫即可（本段只依賴「哪一格屬哪一隊、在第幾列第幾欄」
   這個語意），但 MUST 在 Step 0 記錄實際簽章，避免每個 task 各自猜。

3. **App 名稱的字面值**：暫定「匹克球對戰分配機」（`prd.md` 標題）。若 M5 已在對戰頁標題
   使用了另一個字串，兩處 SHALL 對齊；對齊方式是本模組的常數改為與畫面一致，
   **不**反過來去改 M5 的畫面文案。

4. **列印版是否顯示各員強度分數**：`prd.md` 9.5 只要求「目前回合與各場次對戰資訊」，
   9.4 的 JPG 也未列強度分數。暫定 JPG 顯示（版面容得下、現場有辨識價值）、列印版不顯示
   （紙本以找場地為主）。此差異**不寫進 spec**（spec 只約束必含項目），因此日後調整不需要
   改規格。
