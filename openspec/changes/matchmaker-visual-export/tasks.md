> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**：`lib/matchmaker/scene-canvas.ts`（純瀏覽器 API 呼叫）、
> `app/matchmaker/page.tsx`、`app/globals.css` 屬本 workspace 的 TDD 例外層
> （見 `nextjs-pickball/CLAUDE.md` 與 design Decision 7），以 E2E 驗收；§7～§9 的 E2E 紅燈
> 多半來自「按鈕還不存在」或「下載事件沒發生」，那是真紅燈。若某個測試加入後**立即全綠**，
> MUST 在該項後方誠實標註為 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **本 change 不得新增任何 npm 相依**（design Decision 1）。需要新套件時回報 BLOCKED。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 的 Open Questions 從假設
> 變成事實，避免 §2 之後整批建立在錯的介面上。

- [x] 1.1 確認目前 cwd 為 environment.md 宣告的 worktree，且 baseline `pnpm test` 全綠；把 baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [x] 1.2 確認 `main` 上 **M5（`matchmaker-match-stage-ui`）已合併**：`nextjs-pickball/app/matchmaker/page.tsx` 存在且 `/matchmaker` 不是 404。**不存在則立即停止並回報**，SHALL NOT 在本 change 內補做 M5（見 proposal 的「執行相依」）
- [x] 1.3 讀 `nextjs-pickball/app/matchmaker/page.tsx`，記錄它如何取得「目前回合」與「參賽者名單」（變數名、型別、是否留在 page 層）。與 design Open Questions 第 1 條逐項比對，**差異一律補記進 design.md 的 Open Questions**，不要默默改實作去遷就；若資料未留在 page 層，MUST 依 execution-plan 的升級條件回報人類，SHALL NOT 為了拿資料去改 M5 的元件介面
- [x] 1.4 讀 `nextjs-pickball/lib/matchmaker/stage-layout.ts`，記錄實際函式名與回傳欄位（哪一格屬哪一隊、row／column 的欄位名）。§2 的 `export-scene.ts` 依實際簽章取用，SHALL NOT 在本 change 重新推導一次單打／雙打的排列規則（design Decision 2）
- [x] 1.5 讀 M4 的 `nextjs-pickball/lib/matchmaker/round-types.ts`，記錄 `Round` 與 `RoundMatch` 的實際欄位名（`roundNumber`／`format`／`courtNumber`／`teams`／`status`／`scores`／`winner`），確認與 design 假設一致
- [x] 1.6 確認對戰頁標題目前使用的 App 名稱字串（design Open Questions 第 3 條）。與本 change 要匯出的 App 名稱**對齊為同一個字串**；對齊方式是改本 change 的常數，**不**去改 M5 的畫面文案
- [x] 1.7 確認 `nextjs-pickball/package.json` 目前無任何影像或 PDF 相關相依（本 change 結束時此事實 MUST 不變，Final Review 會以 `git diff package.json` 機械確認）

## 2. 匯出內容組裝（export-scene.ts）

Depends on: §1

- [ ] 2.1 RED: 新增 `nextjs-pickball/lib/matchmaker/export-scene.test.ts`，寫入三個 it：「匯出標題含 App 名稱、回合編號與對戰方式」、「每個場地含場地編號與該場全部球員格」、「匯出場景以不透明白色為底色」。跑單檔確認紅燈並貼出輸出
- [ ] 2.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/export-scene.ts` 的 `buildExportScene(input)` 骨架：回傳 `{ background, width, height, title, courts }`；`courts` 依回合的場次依序產生，每個 court 帶 `courtNumber` 與 tiles，tiles 的隊伍與 row／column 取自 §1.4 記錄的 `stage-layout.ts` 簽章。App 名稱以本檔的具名常數提供，SHALL NOT 由呼叫端各自傳入字面量
- [ ] 2.3 RED: 補兩個 it：「已完成場次顯示最終比分與勝方」（`scores` 為 11 比 7、`winner` 為第一隊，斷言狀態文字同時含 11、7 與勝方隊伍）、「未完成場次顯示未完成狀態而非空白比分」（`scores` 為 `null` 時狀態文字非空且不含數字）。確認紅燈
- [ ] 2.4 GREEN: 補齊場次狀態文字的兩條分支；「未完成」與「勝方」文案抽為本檔的具名常數，SHALL NOT 散在字串模板裡
- [ ] 2.5 RED: 補兩個 it：「球員格帶該員雙色漸層與 pickTextColor 前景色」（斷言前景色等於直接呼叫 `pickTextColor(colorFrom, colorTo)` 的回傳值，**不硬寫顏色字串**）、「名單中找不到該球員時以替代文字呈現且不拋錯」。確認紅燈
- [ ] 2.6 GREEN: 補齊球員解析：以 id 於名單查找，找到則帶姓名與該員 `colorFrom`／`colorTo`／前景色；找不到則以具名常數的替代文字與中性色呈現該格，其餘格照常輸出（design Decision 8）
- [ ] 2.7 RED: 補兩個 it：「畫布高度依場地數與對戰方式遞增」（3 個場地 > 1 個場地；同為 1 個場地時雙打 > 單打）、「組裝匯出內容不修改輸入的回合與名單」（以 `structuredClone` 前後深層比對）。確認紅燈
- [ ] 2.8 GREEN: 補齊尺寸推導：`height` 由標題區高度 + 場地數 × 該對戰方式的場地區塊高度 + 間距推導；所有尺寸與間距為本檔的具名常數，SHALL NOT 出現裸數字
- [ ] 2.9 REFACTOR: 確認本檔為純函式——零 `window`／`document`／`Blob`／`canvas` 引用、零 `new Date()`；`ExportScene` 為可序列化純資料（無函式、無 class 實例）；場地區塊高度的計算只有一處，單打與雙打共用同一條公式而非各寫一份

## 3. 檔名組成（export-filename.ts）

Depends on: §1

- [ ] 3.1 RED: 新增 `nextjs-pickball/lib/matchmaker/export-filename.test.ts`，寫入 it「JPG 檔名依回合編號與注入日期組成」：`roundNumber` 為 3、`exportedAt` 為 `2026-08-23T01:02:03.000Z` → 回傳 `matchmaker-round-3-2026-08-23.jpg`。確認紅燈
- [ ] 3.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/export-filename.ts` 的 `jpgExportFileName({ roundNumber, exportedAt })`：日期取 ISO 字串前 10 碼，**SHALL NOT 於函式內呼叫 `new Date()` 或 `Date.now()`**
- [ ] 3.3 REFACTOR: 檔名前綴與副檔名抽為具名常數；於檔頭註解記錄兩件事——① 格式刻意與 M8 的 `matchmaker-backup-<日期>.json` 對齊但**不跨 change import**、② 取 ISO 前 10 碼等於用 UTC 日期，台灣當地時間 08:00 前匯出會得到前一天日期，這是已知取捨（design Decision 6）

## 4. 列印被擋判定（print-guard.ts）

Depends on: §1

- [ ] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/print-guard.test.ts`，寫入三個 it：「列印函式拋錯時判定為被阻擋並回傳繁體中文訊息」、「環境未提供列印函式時判定為被阻擋」（`undefined` 與非函式值兩種輸入）、「列印成功時回報 ok 且不帶訊息」（並斷言該假函式恰被呼叫一次）。確認紅燈
- [ ] 4.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/print-guard.ts` 的 `requestPrint(printer)`：回傳 `{ ok: true }` 或 `{ ok: false, message }`；列印函式由呼叫端注入，**SHALL NOT 在本檔讀取 `window`**（design Decision 4）
- [ ] 4.3 REFACTOR: 被擋訊息抽為具名常數並確認同時給兩條退路（開啟彈出視窗權限、改用瀏覽器選單列印 Ctrl／Cmd + P）；「拋錯」與「非函式」兩條路徑**回傳同一則訊息**而非各寫一份；於檔頭註解記錄 `afterprint` 事件為何不能用來判定（使用者按取消也會觸發）

## 5. 匯出入口元件（ExportActions.tsx）

Depends on: §2, §3, §4

- [ ] 5.1 RED: 新增 `nextjs-pickball/components/matchmaker/ExportActions.test.tsx`，寫入兩個 it：「尚無目前回合時匯出 JPG 與列印 PDF 皆為 disabled 並顯示繁體中文說明」、「目前回合存在時匯出 JPG 與列印 PDF 皆可點擊」。確認紅燈（元件尚不存在，預期為模組解析失敗）
- [ ] 5.2 GREEN: 實作 `nextjs-pickball/components/matchmaker/ExportActions.tsx`：`"use client"`，props 為 `{ scene, fileName, printer? }`；`scene` 為 `null` 時兩顆按鈕帶 `disabled` 並顯示繁體中文說明（design Decision 5：**停用不隱藏**）。資料與 callback 一律走 props，SHALL NOT 在元件內 import 任何 store
- [ ] 5.3 RED: 補三個 it：「點擊列印 PDF 會呼叫注入的列印函式一次」、「列印被阻擋時以 role alert 顯示繁體中文提示」（注入會拋錯的 printer）、「匯出進行中時匯出 JPG 入口暫時停用避免重複觸發」（以未 resolve 的 promise 模擬繪製中）。確認紅燈
- [ ] 5.4 GREEN: 補齊：列印點擊委派 §4 的 `requestPrint(printer ?? window.print?.bind(window))`，`ok` 為 false 時把訊息渲染成 `role="alert"` 區塊；JPG 點擊期間以本地 state 讓該按鈕 `disabled`，結束後恢復
- [ ] 5.5 REFACTOR: 確認元件內**沒有**任何比分／勝方／姓名的字串組裝（那些全在 `ExportScene` 內，design Decision 2）；兩顆按鈕的可存取名稱明確；`disabled` 以屬性表達而非只調視覺；訊息不含未轉譯的技術錯誤碼

## 6. 列印版元件（PrintSheet.tsx）

Depends on: §2

- [ ] 6.1 RED: 新增 `nextjs-pickball/components/matchmaker/PrintSheet.test.tsx`，寫入 it「列印版顯示回合標題與每個場地的球員與比分」：以含 2 個場地的 scene 渲染，斷言查得回合標題、兩個場地編號、全部球員姓名與各場的比分或未完成狀態。確認紅燈
- [ ] 6.2 GREEN: 實作 `nextjs-pickball/components/matchmaker/PrintSheet.tsx`：以 `data-print="sheet"` 為根節點、每個場地為 `data-print="court"`；內容全部取自 props 的 `scene`，SHALL NOT 自行從回合重組（design Decision 2）。螢幕上預設隱藏，列印時由 §8 的 CSS 顯示
- [ ] 6.3 REFACTOR: 確認列印版為**文字為主**的版面（場地標題、隊伍、姓名、比分），顏色僅作為輔助小標記而非大面積背景（design Decision 3：瀏覽器預設不印背景圖，且 `prd.md` 12.5 要求色彩不是唯一資訊來源）；`data-print` 屬性值抽為具名常數，與 §8 的 CSS 選擇器同源

## 7. JPG 產生、下載與頁面組裝

Depends on: §2, §3, §5

- [ ] 7.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，寫入兩個 test：「對戰頁提供匯出 JPG 與列印 PDF 兩個入口」、「匯出 JPG 會下載檔名含回合編號與日期的 JPEG 檔案」（`waitForEvent("download")`、檔名符合 `/^matchmaker-round-\d+-\d{4}-\d{2}-\d{2}\.jpg$/`、讀檔前三位元組為 `FF D8 FF` 且大小 > 0）。種入名單與產生回合的方式沿用 M5 `match-stage.spec.ts` 的既有 helper。確認紅燈
- [ ] 7.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/scene-canvas.ts`（**例外層**：`createElement("canvas")` → `createLinearGradient` → `fillText` → `toBlob("image/jpeg", 0.92)`，2 倍位圖縮放，繪製前 `await document.fonts.ready`，見 design Decision 9），並於 `nextjs-pickball/app/matchmaker/page.tsx` 掛入 `ExportActions`：以 §2 的 `buildExportScene` 組出 scene、以 §3 的 `jpgExportFileName` 組出檔名，下載以 `Blob` + `<a download>` 完成後 `revokeObjectURL`
- [ ] 7.3 REFACTOR: 於 `scene-canvas.ts` 檔頭註解說明**它為何是例外層**（所有決策已在 `ExportScene` 內定死，本檔無分支、happy-dom 無 2D context，故以 E2E 驗收）；確認 `buildExportScene` 的呼叫點只有 `page.tsx` 一處（`grep` 機械確認）；縮放倍率與 JPEG 品質為具名常數，並註明為何不用 `devicePixelRatio`（同一輸入需產生同一輸出）

## 8. 列印流程與 print CSS

Depends on: §6, §7

- [ ] 8.1 RED: 於 `visual-export.spec.ts` 補三個 test：「點擊列印 PDF 會呼叫瀏覽器列印一次」（`addInitScript` 覆寫 `window.print` 為記錄呼叫的 stub）、「列印媒體下隱藏全站導覽與操作控制項並顯示列印版內容」（`emulateMedia({ media: "print" })`）、「列印版的每個場地區塊設定為不跨頁切斷」（computed style 的 `break-inside` 為 `avoid`）。確認紅燈
- [ ] 8.2 GREEN: 於 `page.tsx` 掛入 `PrintSheet`（同一份 scene）並把互動區塊包進 `data-print="hide"` 的包裝元素；於 `nextjs-pickball/app/globals.css` 新增 `@media print` 區塊：`body:has([data-print="sheet"]) > header` 與 `[data-print="hide"]` 隱藏、`[data-print="sheet"]` 顯示、`[data-print="court"]` 為 `break-inside: avoid`（design Decision 3）
- [ ] 8.3 REFACTOR: 確認 `@media print` 規則**只**透過 `data-print` 屬性與 `body:has()` 生效，沒有洩漏到 matchmaker 以外的路由；確認**沒有修改 M5 的任何元件檔**（`git diff --stat` 機械確認 `components/matchmaker/MatchStage.tsx`／`CourtCard.tsx`／`RoundControls.tsx`／`RestingPanel.tsx` 皆未變動）；於 CSS 區塊上方以繁體中文註解說明 `body:has()` 的收斂理由與舊瀏覽器的降級後果（多印一條 navbar，資訊仍完整）

## 9. 唯讀保證與無障礙 E2E

Depends on: §7, §8

- [ ] 9.1 RED: 於 `visual-export.spec.ts` 補三個 test：「匯出 JPG 後目前回合與本機資料保持不變」（匯出前後比對 `matchmaker:round:v1`，並重新整理後再確認一次）、「匯出過程不發出任何網路請求」（頁面載入完成後才開始計數 `request` 事件）、「匯出入口具備可存取名稱且可由鍵盤操作」。確認紅燈
- [ ] 9.2 GREEN: 補齊缺口：匯出路徑不得寫入任何 LocalStorage、不得呼叫任何 store 的 setter、不得發出任何請求；兩個入口補上可存取名稱與可見 focus 樣式。⚠️ 這三條**很可能加入即綠**（§2 已保證純函式、§7 的下載走本機 Blob）——若如此，MUST 在本項後方誠實標註為 **regression guard**，SHALL NOT 用「改斷言看紅再改回」偽造紅燈
- [ ] 9.3 REFACTOR: 把 E2E 的「種名單 + 產生一輪」前置動作收斂為單一 helper 並註明「回合格式來源為 M4 的 `matchmaker:round:v1`，改動請同步」；能用 UI 操作到達的狀態優先用 UI 操作，只有無法用 UI 到達的狀態才種資料

## 10. 收尾驗證

- [ ] 10.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**
- [ ] 10.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 與 `--run components/matchmaker/` 全綠，貼出輸出
- [ ] 10.3 `pnpm lint` 通過（0 errors；既有 warning 清單見前一個 change 的紀錄，本 change 不得新增）
- [ ] 10.4 `pnpm typecheck` 通過
- [ ] 10.5 `pnpm test` 全套通過（確認未破壞 M1～M5 既有測試與 hono-pickball 後端測試）
- [ ] 10.6 `pnpm --filter ./nextjs-pickball test:e2e` 全套通過，**五個 browser project 皆跑**（下載事件在 WebKit／Mobile Safari 上的行為與 Chromium 不同，是最容易破的一組）
- [ ] 10.7 `git diff package.json` 為空（本 change 零新增相依，design Decision 1）；`git diff --stat` 確認 `hooks/` 零新增、M5 元件檔零改動
- [ ] 10.8 **人工檢查（無法自動化，如實記錄結果）**：① 在真實瀏覽器按一次「列印 PDF」，確認預覽中沒有 navbar 與操作按鈕、場地未被切成兩頁；② 開啟匯出的 JPG，確認中文姓名未變成方框或 fallback 字型、色塊漸層正常、非黑底（design Risks 明列 E2E 驗不了圖的內容）
- [ ] 10.9 同步 `nextjs-pickball/CLAUDE.md` 的架構總覽：`/matchmaker` 補記「可匯出 JPG 與列印 PDF」
- [ ] 10.10 `DO_NOT_TRACK=1 openspec validate matchmaker-visual-export --strict` 通過
- [ ] 10.11 spec 條目重複檢查（依 root `CLAUDE.md` 指定的 python 計數法，**不使用 BSD `uniq`**——它會把內容不同的中文標題誤判為重複）
