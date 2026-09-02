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

- [x] 2.1 RED: 新增 `nextjs-pickball/lib/matchmaker/export-scene.test.ts`，寫入三個 it：「匯出標題含 App 名稱、回合編號與對戰方式」、「每個場地含場地編號與該場全部球員格」、「匯出場景以不透明白色為底色」。跑單檔確認紅燈並貼出輸出
- [x] 2.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/export-scene.ts` 的 `buildExportScene(input)` 骨架：回傳 `{ background, width, height, title, courts }`；`courts` 依回合的場次依序產生，每個 court 帶 `courtNumber` 與 tiles，tiles 的隊伍與 row／column 取自 §1.4 記錄的 `stage-layout.ts` 簽章。App 名稱以本檔的具名常數提供，SHALL NOT 由呼叫端各自傳入字面量
- [x] 2.3 RED: 補兩個 it：「已完成場次顯示最終比分與勝方」（`scores` 為 11 比 7、`winner` 為第一隊，斷言狀態文字同時含 11、7 與勝方隊伍）、「未完成場次顯示未完成狀態而非空白比分」（`scores` 為 `null` 時狀態文字非空且不含數字）。確認紅燈
- [x] 2.4 GREEN: 補齊場次狀態文字的兩條分支；「未完成」與「勝方」文案抽為本檔的具名常數，SHALL NOT 散在字串模板裡
- [x] 2.5 RED: 補兩個 it：「球員格帶該員雙色漸層與 pickTextColor 前景色」（斷言前景色等於直接呼叫 `pickTextColor(colorFrom, colorTo)` 的回傳值，**不硬寫顏色字串**）、「名單中找不到該球員時以替代文字呈現且不拋錯」。確認紅燈
- [x] 2.6 GREEN: 補齊球員解析：以 id 於名單查找，找到則帶姓名與該員 `colorFrom`／`colorTo`／前景色；找不到則以具名常數的替代文字與中性色呈現該格，其餘格照常輸出（design Decision 8）
- [x] 2.7 RED: 補兩個 it：「畫布高度依場地數與對戰方式遞增」（3 個場地 > 1 個場地；同為 1 個場地時雙打 > 單打）、「組裝匯出內容不修改輸入的回合與名單」（以 `structuredClone` 前後深層比對）。確認紅燈
- [x] 2.8 GREEN: 補齊尺寸推導：`height` 由標題區高度 + 場地數 × 該對戰方式的場地區塊高度 + 間距推導；所有尺寸與間距為本檔的具名常數，SHALL NOT 出現裸數字
- [x] 2.9 REFACTOR: 確認本檔為純函式——零 `window`／`document`／`Blob`／`canvas` 引用、零 `new Date()`；`ExportScene` 為可序列化純資料（無函式、無 class 實例）；場地區塊高度的計算只有一處，單打與雙打共用同一條公式而非各寫一份

> **§2 審查結論（2026-09-02）**：Stage 1 **PASS**（9 條驗收錨點逐字相符、9.4 七項內容一項不缺、
> 無 scope creep、未修改既有檔）。Stage 2 **REJECT 一次**——獨立 mutation 55 個存活 26 個
> （存活率 47.3%），8 個 Major（1 個為真實程式碼缺陷：`TITLE_SEPARATOR` 被跨語意借去組狀態文字；
> 其餘 7 個為測試盲點）＋7 個 Minor。修正輪後 31 個指定 mutant **全數 KILLED**，leader 另獨立
> 複驗 6 個確認轉紅，**Stage 2 判定通過**。
>
> **regression guard 標註**（寫入當下即綠，產品碼本來就正確，非偽造紅燈）：
> ① 「scoring 狀態與 pending 同樣視為未完成，不另立第三種文案」
> ② 「狀態為 completed 但比分或勝方缺漏時退回未完成文字而非拋錯」
> ③ 「狀態非 completed 時即使意外帶有比分與勝方仍顯示未完成，status 是唯一判斷依據」
> 三者皆為修正輪為殺 mutant 而補的分支保護，`buildStatusText` 的實作在補測試前即已正確。
>
> **前瞻風險（留待 §7 決定，本組刻意不處理）**：幾何常數（`CANVAS_WIDTH`／`TITLE_AREA_HEIGHT`／
> `COURT_BLOCK_SPACING`／`COURT_HEADER_HEIGHT`／`TILE_ROW_HEIGHT`／`courtBlockHeight`）目前皆為
> module-private，且 `ExportCourt` 未帶 y 座標。§7 的 `scene-canvas.ts` 若要把場地畫在正確位置，
> 必須取得這些幾何——屆時 MUST 由本檔匯出或於 `ExportCourt` 增設純資料欄位，
> **SHALL NOT 在 `scene-canvas.ts` 重寫一份**（那會違反 task 2.9 的「場地區塊高度的計算只有一處」
> 與 design Decision 2 的「唯一內容真相來源」）。

## 3. 檔名組成（export-filename.ts）

Depends on: §1

- [x] 3.1 RED: 新增 `nextjs-pickball/lib/matchmaker/export-filename.test.ts`，寫入 it「JPG 檔名依回合編號與注入日期組成」：`roundNumber` 為 3、`exportedAt` 為 `2026-08-23T01:02:03.000Z` → 回傳 `matchmaker-round-3-2026-08-23.jpg`。確認紅燈
- [x] 3.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/export-filename.ts` 的 `jpgExportFileName({ roundNumber, exportedAt })`：日期取 ISO 字串前 10 碼，**SHALL NOT 於函式內呼叫 `new Date()` 或 `Date.now()`**
- [x] 3.3 REFACTOR: 檔名前綴與副檔名抽為具名常數；於檔頭註解記錄兩件事——① 格式刻意與 M8 的 `matchmaker-backup-<日期>.json` 對齊但**不跨 change import**、② 取 ISO 前 10 碼等於用 UTC 日期，台灣當地時間 08:00 前匯出會得到前一天日期，這是已知取捨（design Decision 6）

> **§3 審查結論（2026-09-02）**：Stage 1 **PASS**（錨點逐字相符、斷言為精確 `toBe`、
> 函式本體零 `new Date()`／`Date.now()`、未跨 change import M8 的 `backupFileName`、
> 3.3 的兩條檔頭註解皆到位）。Stage 2 **PASS**——獨立 mutation 23 個**全數 KILLED，存活率 0.0%**
> （含本組最在意的兩種「偷用當下時間」變體），為本 change 目前唯一零存活的群組；leader 另獨立
> 複驗前綴、副檔名、段落順序、連字號、日期切片、`roundNumber` 寫死六項皆確認轉紅。
> 4 個 Minor 已於本組全數處理：介面後綴 `Params`→`Input`（對齊 `lib/` 既有九個同類介面）、
> 檔頭註解由「兩個小函式」更正為「第三個採同一 idiom 的檔名函式」、錨點測試補第二組回合編號
> 使其自身即可殺死「寫死 3」的 mutant、補記 `roundNumber` 的呼叫端前置條件。
>
> **regression guard 標註**：除 spec 錨點「JPG 檔名依回合編號與注入日期組成」外的 5 條 it
> （不同 roundNumber、同日不同時刻、跨日、整體格式 regex、UTC 語意臨界值）**寫入當下即綠**，
> 用途是把 mutation 盲點釘死，非 TDD 紅燈。3.1 的真紅燈為模組不存在（`Failed to resolve import`），
> 已於 shell 實測。

## 4. 列印被擋判定（print-guard.ts）

Depends on: §1

- [x] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/print-guard.test.ts`，寫入三個 it：「列印函式拋錯時判定為被阻擋並回傳繁體中文訊息」、「環境未提供列印函式時判定為被阻擋」（`undefined` 與非函式值兩種輸入）、「列印成功時回報 ok 且不帶訊息」（並斷言該假函式恰被呼叫一次）。確認紅燈
- [x] 4.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/print-guard.ts` 的 `requestPrint(printer)`：回傳 `{ ok: true }` 或 `{ ok: false, message }`；列印函式由呼叫端注入，**SHALL NOT 在本檔讀取 `window`**（design Decision 4）
- [x] 4.3 REFACTOR: 被擋訊息抽為具名常數並確認同時給兩條退路（開啟彈出視窗權限、改用瀏覽器選單列印 Ctrl／Cmd + P）；「拋錯」與「非函式」兩條路徑**回傳同一則訊息**而非各寫一份；於檔頭註解記錄 `afterprint` 事件為何不能用來判定（使用者按取消也會觸發）

> **§4 審查結論（2026-09-02）**：Stage 1 **PASS**（三條錨點逐字相符、兩種失敗形態共用同一則
> 訊息、模組內零 `window` 讀取、`afterprint` 註解到位、無 scope creep）。Stage 2 **PASS**——
> 獨立 mutation 21 個中 16 個 KILLED、2 個判定為**等價變異**（移除 `typeof` 早退：非函式值仍在
> `printer()` 拋 `TypeError` 並被同一個 `catch` 接住，可觀察行為完全一致；拆掉 discriminated union：
> 型別擦除後無執行期差異），真盲點 3 個（存活率 15.8%，同一根因：訊息內容只被兩個 substring
> 斷言覆蓋），**無任何存活者是真實產品缺陷**。leader 另獨立複驗永遠回 ok:true／永遠回 ok:false／
> catch 回 ok:true／成功分支多帶 message／移除 `printer()` 呼叫／兩條路徑不同訊息六項皆確認轉紅。
>
> 5 個 Minor 已於本組全數處理：F1 補兩條訊息內容 guard（逐字等於常數＋繁中指引句型），
> 複驗確認原先存活的「整句簡體但保留彈出視窗」與「退化成關鍵字堆砌」兩個 mutant 皆轉紅；
> F2 `PrintOutcome` 改名 `RequestPrintResult`（codebase 其餘 17 個結果型別一律 `<動詞+受詞>Result`，
> 且 `transfer-storage.ts` 的 `WriteBackupResult` 與它逐字元同形）；F3 檔頭補記 async printer 的
> rejection 不被同步 `catch` 接住之已知限制與不處理理由；F4 `it.each` 的 `%p` 實測不會被代換，
> 改為 `[標籤, 值]` 配對＋`%s`（沿用 `history-csv.test.ts` 慣例）並補齊陣列與布林值兩種輸入；
> F5 收窄用的 throw 訊息改繁體中文。
>
> **regression guard 標註**：除三條 spec 錨點外的其餘 it（兩條路徑訊息相同、兩條退路、
> 訊息逐字等於常數、繁中指引句型、不含技術錯誤碼、六種非函式輸入的值域覆蓋）**寫入當下即綠**，
> 用途是把 mutation 盲點釘死，非 TDD 紅燈。4.1 的真紅燈為模組不存在
> （`Failed to resolve import`），已於 shell 實測。

## 5. 匯出入口元件（ExportActions.tsx）

Depends on: §2, §3, §4

- [x] 5.1 RED: 新增 `nextjs-pickball/components/matchmaker/ExportActions.test.tsx`，寫入兩個 it：「尚無目前回合時匯出 JPG 與列印 PDF 皆為 disabled 並顯示繁體中文說明」、「目前回合存在時匯出 JPG 與列印 PDF 皆可點擊」。確認紅燈（元件尚不存在，預期為模組解析失敗）
- [x] 5.2 GREEN: 實作 `nextjs-pickball/components/matchmaker/ExportActions.tsx`：`"use client"`，props 為 `{ scene, fileName, printer? }`；`scene` 為 `null` 時兩顆按鈕帶 `disabled` 並顯示繁體中文說明（design Decision 5：**停用不隱藏**）。資料與 callback 一律走 props，SHALL NOT 在元件內 import 任何 store
- [x] 5.3 RED: 補三個 it：「點擊列印 PDF 會呼叫注入的列印函式一次」、「列印被阻擋時以 role alert 顯示繁體中文提示」（注入會拋錯的 printer）、「匯出進行中時匯出 JPG 入口暫時停用避免重複觸發」（以未 resolve 的 promise 模擬繪製中）。確認紅燈
- [x] 5.4 GREEN: 補齊：列印點擊委派 §4 的 `requestPrint(printer ?? window.print?.bind(window))`，`ok` 為 false 時把訊息渲染成 `role="alert"` 區塊；JPG 點擊期間以本地 state 讓該按鈕 `disabled`，結束後恢復
- [x] 5.5 REFACTOR: 確認元件內**沒有**任何比分／勝方／姓名的字串組裝（那些全在 `ExportScene` 內，design Decision 2）；兩顆按鈕的可存取名稱明確；`disabled` 以屬性表達而非只調視覺；訊息不含未轉譯的技術錯誤碼

> **§5 審查結論（2026-09-02）**：Stage 1 **PASS**（五條錨點逐字相符、斷言確實映射 WHEN／THEN、
> 列印判定確實委派 `requestPrint`、零 store import、零內容字串組裝、無 scope creep、未動既有檔）。
> Stage 2 **PASS**——獨立 mutation 30 個中 26 個 KILLED、1 個等價變異（移除 `handleExportJpg`
> 的早退：原生 `disabled` 在 happy-dom 已擋下所有 click dispatch，且移除後 `tsc` 直接報 TS2345，
> 連合法產品狀態都不是）、1 個純樣式變異，**真盲點 2 個、存活率 6.9%**（對照 §2 首輪 47.3%）。
> leader 另獨立複驗隱藏而非停用、`role` 改 `status`、成功時不清除訊息、JPG 點擊時不設 disabled、
> 匯出期間連列印也停用五項皆確認轉紅。
>
> 6 個 Minor 已於本組全數處理：F-1 把「用 `finally` 而非 `catch`」寫成明示裁決（spec 未定義
> JPG 匯出失敗的提示行為，元件自寫文案正是 Decision 4 否決的替代方案，故只保證按鈕恢復可用、
> 讓 rejection 往外傳，並註明日後要提示的接線點在呼叫端）；F-2 補「有回合時不顯示說明文字」的
> 反向對照斷言，複驗確認原先存活的「說明文字恆顯示」mutant 轉紅；F-3 拿掉 props 欄位的
> `readonly`（`components/matchmaker/` 既有十個 props 介面無一使用，跨檔案統一屬另一個議題）；
> F-4 早退改用 `hasNoRound` 收窄，去除重複的 `scene === null`；F-5 更正誤引的 Decision 編號；
> F-6 更正提到 `skipPointerEventsCheck` 但實際未使用的過時註解。
>
> **regression guard 標註**：額外補充的 6 條 it 中，「一開始未點擊任何按鈕時畫面上沒有
> role alert 元素」與「兩顆按鈕的可存取名稱皆非空且可由 role 查得」兩條**寫入當下即綠**；
> 其餘四條為有效的 mutation-killing 測試。5.1 與 5.3 的真紅燈已於 shell 實測
> （5.1 為模組不存在，leader 另以移走元件檔複驗得到
> `Failed to resolve import "./ExportActions"`）。
>
> **交棒給 §7 的約束**：`ExportActions` 的 `exportJpg` 為必填注入點，§7 的 `page.tsx`
> MUST 傳入 `scene-canvas.ts` 匯出的下載函式；`page.tsx` 內 **SHALL NOT** 出現任何
> `<a download>` 或 canvas 呼叫（leader 裁決，見 design.md 末節）。

## 6. 列印版元件（PrintSheet.tsx）

Depends on: §2

- [x] 6.1 RED: 新增 `nextjs-pickball/components/matchmaker/PrintSheet.test.tsx`，寫入 it「列印版顯示回合標題與每個場地的球員與比分」：以含 2 個場地的 scene 渲染，斷言查得回合標題、兩個場地編號、全部球員姓名與各場的比分或未完成狀態。確認紅燈
- [x] 6.2 GREEN: 實作 `nextjs-pickball/components/matchmaker/PrintSheet.tsx`：以 `data-print="sheet"` 為根節點、每個場地為 `data-print="court"`；內容全部取自 props 的 `scene`，SHALL NOT 自行從回合重組（design Decision 2）。螢幕上預設隱藏，列印時由 §8 的 CSS 顯示
- [x] 6.3 REFACTOR: 確認列印版為**文字為主**的版面（場地標題、隊伍、姓名、比分），顏色僅作為輔助小標記而非大面積背景（design Decision 3：瀏覽器預設不印背景圖，且 `prd.md` 12.5 要求色彩不是唯一資訊來源）；`data-print` 屬性值抽為具名常數，與 §8 的 CSS 選擇器同源

> **§6 審查結論（2026-09-02）**：Stage 1 **PASS**（錨點逐字相符、內容全部取自 `ExportScene`、
> `data-print` 兩個屬性正確、版面文字為主且無 `linear-gradient`、無 scope creep、未動既有檔）。
> Stage 2 **REJECT 一次**——獨立 mutation 43 個存活 17 個（扣除 2 個 React `key` 等價變異後
> 真盲點 15 個、存活率 36.6%），3 個 Major 全部落在規格核心（`TEAM_LABELS` 隊伍文字零覆蓋、
> `courtNumber` 可被 `index + 1` 冒充、色點四變異含 `COLOR_DOT_SIZE` 改 `"100%"` 退化成
> design Decision 3 明文否決的大面積背景）。修正輪後 28 個指定 mutant **全數 KILLED**，
> leader 另獨立複驗八項確認轉紅，**Stage 2 判定通過**。
>
> ⚠️ **leader 在本組的獨立複驗另抓到一個 Implementer 宣稱 12/12 KILLED 但實際存活的 mutant**：
> 把 `PRINT_SHEET_DATA_VALUE` 從 `"sheet"` 改成 `"xsheet"` 時測試全綠——原測試以常數本身組
> 查詢字串，是同義反覆。已補「data-print 的兩個屬性值逐字為 sheet 與 court」釘住字面量。
>
> **regression guard 標註**：除 spec 錨點「列印版顯示回合標題與每個場地的球員與比分」外，
> 其餘 12 條 it **全部寫入當下即綠**（產品碼在補測試前即正確），用途是把 mutation 盲點釘死，
> 非 TDD 紅燈。6.1 的真紅燈為模組不存在（leader 以移走元件檔複驗得到
> `Failed to resolve import "./PrintSheet"`）。
>
> **交棒給 §7／§8 的三項約束（leader 裁決）**：
> ① **標題階層採處置 A**：`PrintSheet` 保留 `<h1>`，因此 §7／§8 MUST 為
>    `app/matchmaker/page.tsx` 第 94～97 行的標題區（`<h1>對戰分配</h1>` 與其說明段落）
>    加上 `data-print="hide"`，否則列印時同頁會有兩個 `<h1>`，且紙本會多印一個無用標題。
>    design Decision 3 列出的選擇器**只涵蓋 `> header` 與區段導覽 `nav`**，不含頁內標題。
> ② **`data-print` 的 CSS 側對稱防線**：TS 側已由 `PrintSheet.test.tsx` 釘住字面量，
>    但 `globals.css` 側若被改成別的字串，兩側漂移一樣會讓列印樣式靜默失效且無測試會紅。
>    §8 MUST 補一條對稱防線（讀 `app/globals.css` 斷言逐字含 `[data-print="sheet"]` 與
>    `[data-print="court"]`，或以 E2E 的 computed style 驗證）。
> ③ **`PrintSheet.tsx` 完全沒有 `className`**（是 `components/matchmaker/` 中唯一零 Tailwind
>    class 的元件），列印版的**全部版面都押在 §8**。§8 收工前 MUST 確認它至少涵蓋標題、
>    場地、隊伍的間距與斷頁，否則紙本會是無格式的長條文字。

## 7. JPG 產生、下載與頁面組裝

Depends on: §2, §3, §5

- [x] 7.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/visual-export.spec.ts`，寫入兩個 test：「對戰頁提供匯出 JPG 與列印 PDF 兩個入口」、「匯出 JPG 會下載檔名含回合編號與日期的 JPEG 檔案」（`waitForEvent("download")`、檔名符合 `/^matchmaker-round-\d+-\d{4}-\d{2}-\d{2}\.jpg$/`、讀檔前三位元組為 `FF D8 FF` 且大小 > 0）。種入名單與產生回合的方式沿用 M5 `match-stage.spec.ts` 的既有 helper。確認紅燈
- [x] 7.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/scene-canvas.ts`（**例外層**：`createElement("canvas")` → `createLinearGradient` → `fillText` → `toBlob("image/jpeg", 0.92)`，2 倍位圖縮放，繪製前 `await document.fonts.ready`，見 design Decision 9），並於 `nextjs-pickball/app/matchmaker/page.tsx` 掛入 `ExportActions`：以 §2 的 `buildExportScene` 組出 scene、以 §3 的 `jpgExportFileName` 組出檔名，下載以 `Blob` + `<a download>` 完成後 `revokeObjectURL`
- [x] 7.3 REFACTOR: 於 `scene-canvas.ts` 檔頭註解說明**它為何是例外層**（所有決策已在 `ExportScene` 內定死，本檔無分支、happy-dom 無 2D context，故以 E2E 驗收）；確認 `buildExportScene` 的呼叫點只有 `page.tsx` 一處（`grep` 機械確認）；縮放倍率與 JPEG 品質為具名常數，並註明為何不用 `devicePixelRatio`（同一輸入需產生同一輸出）

> **§7 審查結論（2026-09-02）**：Stage 1 **PASS**（兩條錨點逐字相符、下載四項驗收全到位且
> 確實讀了檔案內容、E2E helper 沿用 M5 慣例、零外部套件、繪製順序正確、`buildExportScene`
> 產品呼叫點只有 `page.tsx` 一處、`export-scene.ts` 只加 `export` 關鍵字、`page.tsx` 純追加）。
> Stage 2 **REJECT 一次**——獨立 mutation 17 個存活 11 個，三個 Major 皆為實質缺口。
> 修正輪後複驗：拿掉底色 fillRect（產出全黑 JPEG）與位圖倍率改 1 兩個 mutant 皆確認轉紅。
>
> **leader 在本組的兩處覆寫**：
> ① 檔名的 `exportedAt` 取 `round.createdAt` 而非 `new Date()`——原方案在 render 期間呼叫
>    `new Date()` 會讓 render 變成不純函式（SSR／hydration 不一致的典型成因），且為了
>    「點擊當下取時間」而加的包裝函式會讓 `fileName` prop 變成傳了卻被丟棄的死參數。
>    spec 只要求「日期由呼叫端注入」，`round.createdAt` 完全滿足，語意上「這一輪是哪天排的」
>    也比「我哪一刻按下匯出」更貼近檔名用於排序與辨識的用途（design Decision 6）。
> ② Major-2 的檔案清單衝突：leader 原先同時把 `ExportActions.test.tsx` 列為「不可修改」與
>    「必須維持綠燈」，而新增必填欄位必然要改其 fixture，Implementer 正確回報 `BLOCKED`。
>    leader 放行修改三個 fixture 檔（**只補欄位、不動任何既有斷言**）後完成。
>
> **已知未殺的 mutant（可接受的例外層代價，已評估）**：`courtY` 不累加。E2E 的種子資料只會
> 產出單一場地，累加與否無可觀察差異；殺它需要多場地的種子資料與更多下載驗證，
> 成本高於收益。design Risks 已明訂「E2E 驗不了圖的內容對不對」且「不做像素快照比對」。
>
> **regression guard 標註**：§7 全為例外層（`scene-canvas.ts` 與 `page.tsx`），
> 依 `nextjs-pickball/CLAUDE.md` 的分層規範不強制單元 TDD，以 E2E 驗收。
> 7.1 的紅燈為真（按鈕不存在、下載事件逾時），修正輪新增的尺寸與四角像素斷言則是
> **先寫斷言、再以 mutation 複驗其有效性**，不是 regression guard。
>
> **交棒給 §8 的補充**：`ExportCourt` 已新增 `blockHeight` 欄位，`PrintSheet.test.tsx` 與
> `ExportActions.test.tsx` 的 fixture 已同步補上（列印版與入口元件都不使用該欄位）。

## 8. 列印流程與 print CSS

Depends on: §6, §7

- [x] 8.1 RED: 於 `visual-export.spec.ts` 補三個 test：「點擊列印 PDF 會呼叫瀏覽器列印一次」（`addInitScript` 覆寫 `window.print` 為記錄呼叫的 stub）、「列印媒體下隱藏全站導覽與操作控制項並顯示列印版內容」（`emulateMedia({ media: "print" })`）、「列印版的每個場地區塊設定為不跨頁切斷」（computed style 的 `break-inside` 為 `avoid`）。確認紅燈
- [x] 8.2 GREEN: 於 `page.tsx` 掛入 `PrintSheet`（同一份 scene）並把互動區塊包進 `data-print="hide"` 的包裝元素；於 `nextjs-pickball/app/globals.css` 新增 `@media print` 區塊：`body:has([data-print="sheet"]) > header` 與 `[data-print="hide"]` 隱藏、`[data-print="sheet"]` 顯示、`[data-print="court"]` 為 `break-inside: avoid`（design Decision 3）
- [x] 8.3 REFACTOR: 確認 `@media print` 規則**只**透過 `data-print` 屬性與 `body:has()` 生效，沒有洩漏到 matchmaker 以外的路由；確認**沒有修改 M5 的任何元件檔**（`git diff --stat` 機械確認 `components/matchmaker/MatchStage.tsx`／`CourtCard.tsx`／`RoundControls.tsx`／`RestingPanel.tsx` 皆未變動）；於 CSS 區塊上方以繁體中文註解說明 `body:has()` 的收斂理由與舊瀏覽器的降級後果（多印一條 navbar，資訊仍完整）

> **§8 審查結論（2026-09-03）**：Stage 1／2 合併由 opus 審。三個錨點 test 名稱逐字相符；
> `@media print` 只透過 `data-print` 屬性與 `body:has()` 生效，reviewer 另在 `/`、`/quiz`、
> `/tour`、`/scoreboard`、`/matchmaker/players`、`/matchmaker/history` 與「尚無回合」七種情境
> 實測 computed `display`，確認**零外溢**；M5 四個元件檔零改動；無 `print:` utility class。
> Stage 2 **REJECT 一次**——16 個 mutant 存活 8 個，扣除等價變異（`nav` 與 `> header` 的收斂在
> 現況下無可觀察差異、4 個 `!important` 全移除仍綠因區塊寫在 layer 之外）與可接受代價
> （純排版的字級與間距、`roundError` 需先製造失敗狀態）後**真缺口 3 個**。修正輪後 leader
> 獨立複驗五個 mutant 皆轉紅。
>
> **leader 核准的一處偏離**：Implementer 另加一條 `@media print` **之外**的基礎規則
> `[data-print="sheet"] { display: none; }`，以滿足 spec 的「列印版內容螢幕上 MUST 隱藏」。
> design Decision 3 的 CSS 片段沒有這條，但少了它列印版會在螢幕上一直顯示。
>
> ⚠️ **方法學紀錄（跨群組適用）**：改完 `app/globals.css` 後**等 8 秒不足以保證 Turbopack
> 重編譯完成**，會讓 CSS mutation 得到「存活」的**假陰性**。Stage 2 與 leader 都各踩過一次。
> CSS mutation 一律等 20 秒並以第二次執行結果為準。
>
> **regression guard 標註**：8.1 的三條錨點 test 中，「列印媒體下隱藏…」與「場地區塊不跨頁
> 切斷」兩條為真紅燈（元素未隱藏、`break-inside` 不是 `avoid`）；「點擊列印 PDF 會呼叫
> 瀏覽器列印一次」在寫入當下即綠（§5 已完成 wiring、§7 已掛載元件），Implementer 已誠實
> 標註為 regression guard，**未偽造紅燈**。修正輪新增的四條斷言均為先寫斷言、再以 mutation
> 複驗其有效性。

## 9. 唯讀保證與無障礙 E2E

Depends on: §7, §8

- [x] 9.1 RED: 於 `visual-export.spec.ts` 補三個 test：「匯出 JPG 後目前回合與本機資料保持不變」（匯出前後比對 `matchmaker:round:v1`，並重新整理後再確認一次）、「匯出過程不發出任何網路請求」（頁面載入完成後才開始計數 `request` 事件）、「匯出入口具備可存取名稱且可由鍵盤操作」。確認紅燈
- [x] 9.2 GREEN: 補齊缺口：匯出路徑不得寫入任何 LocalStorage、不得呼叫任何 store 的 setter、不得發出任何請求；兩個入口補上可存取名稱與可見 focus 樣式。⚠️ 這三條**很可能加入即綠**（§2 已保證純函式、§7 的下載走本機 Blob）——若如此，MUST 在本項後方誠實標註為 **regression guard**，SHALL NOT 用「改斷言看紅再改回」偽造紅燈
- [x] 9.3 REFACTOR: 把 E2E 的「種名單 + 產生一輪」前置動作收斂為單一 helper 並註明「回合格式來源為 M4 的 `matchmaker:round:v1`，改動請同步」；能用 UI 操作到達的狀態優先用 UI 操作，只有無法用 UI 到達的狀態才種資料

> **§9 審查結論（2026-09-03）**：Stage 1／2 合併由 opus 審。三個錨點 test 名稱逐位元組相符；
> 確實用 Tab 走訪（非直接 `.focus()`）；9.3 的 helper 收斂徹底（9 個呼叫點全走 helper）、
> 必備兩句註解到位、未動任何既有斷言；零產品程式碼改動、零新增相依。
> Stage 2 **REJECT 一次**——審查以 14 個違規情境實測三條 guard 的有效性，抓出兩個真缺口
> （唯讀 guard 只守一把 key、網路 guard 的 resourceType 白名單可被 `sendBeacon` 與追蹤像素
> 繞過）。修正輪後 leader 獨立複驗六個先前逃得掉的情境**全部轉紅**。
>
> **regression guard 標註（9.2 的誠實標註）**：本組三條 test **全部寫入當下即綠**，
> 已如實標註，**未偽造紅燈**。它們本來就綠是因為匯出路徑本來就正確：`export-scene.ts`
> 是純函式、`scene-canvas.ts` 只做本機 canvas 與 `<a download>`、`ExportActions.tsx`
> 零 store import、兩顆按鈕是原生 `<button>` 且有文字內容。9.2 的「補上可存取名稱與可見
> focus 樣式」**不需要改實作**——審查已查證 `components/ui/button.tsx` 確有
> `focus-visible:border-ring`／`ring-ring/50`／`ring-[3px]`。
>
> **已接受的範圍界定（非缺陷）**：網路 guard 的計數起點為 `networkidle`，**頁面載入期**
> 發出的請求不在涵蓋範圍——spec Scenario 的 GIVEN 明寫「已產生一輪對戰**且頁面載入完成**」，
> test 名稱也是「**匯出過程**」。
>
> **Firefox 的行為差異（測試環境正規化，非實作缺陷）**：Firefox 對「Tab 到文件最後一個
> 可聚焦元素後再按 Tab」不會循環回頁首（會先進入瀏覽器 chrome），而 helper 點完
> 「產生本輪對戰」後該按鈕仍保有 focus，導致往後 Tab 到不了 DOM 順序上更早的匯出入口。
> 於該 test 內先 `blur()` 重置起點。審查已複現並判定為工具限制而非真實無障礙問題
> （真實使用者可經由瀏覽器 chrome 繞回頁首），且判別力未受損——把按鈕改成
> `<div onClick>` 或加 `tabIndex={-1}` 仍會轉紅。

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
