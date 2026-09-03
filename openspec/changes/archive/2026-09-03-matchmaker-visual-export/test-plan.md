> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> Tier 對照本 change 的分層（design Decision 7）：
> - `unit`：`lib/matchmaker/` 的三個純函式模組，Vitest + happy-dom，毫秒級、決定性
> - `integration`：`components/matchmaker/` 的兩個元件，Vitest + `@testing-library/react`，
>   測 wiring（props 有沒有接到 `disabled`、callback 有沒有被呼叫、訊息有沒有出現）
> - `e2e`：Playwright，測真實下載事件、列印媒體下的版面、鍵盤與網路
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> 例外層（`lib/matchmaker/scene-canvas.ts`、`app/matchmaker/page.tsx`、
> `app/globals.css` 的 `@media print`）**沒有單元測試列**，其驗收一律落在 e2e 列上——
> 這是刻意的分層結果，不是漏寫（見 design Decision 7）。

## visual-export

### Requirement: 對戰頁的匯出入口與可用狀態

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 尚無目前回合時匯出 JPG 與列印 PDF 皆為 disabled 並顯示繁體中文說明 | 尚無目前回合時入口停用並說明原因 | `scene = null` → 兩顆按鈕皆有 `disabled` 屬性；畫面出現指出「需先產生本輪對戰」的繁體中文文字 | edge case：這是使用者第一次開頁面就會遇到的狀態，`prd.md` 12.3 要求 disabled 要解釋自己 | integration |
| 目前回合存在時匯出 JPG 與列印 PDF 皆可點擊 | 目前回合存在時入口可用 | 傳入含 1 個場地的 scene → 兩顆按鈕皆無 `disabled` 屬性 | golden path：與上一列成對，只寫停用那條會漏掉「永遠停用」的錯誤實作 | integration |
| 對戰頁提供匯出 JPG 與列印 PDF 兩個入口 | 匯出入口可於對戰頁找到 | 種入名單並產生一輪後開啟 `/matchmaker` → 頁面上同時查得「匯出 JPG」與「列印 PDF」兩個可存取名稱 | golden path：入口沒掛上去的話，後面每一條 e2e 都不用測 | e2e |

### Requirement: 匯出內容的組成

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 匯出標題含 App 名稱、回合編號與對戰方式 | 標題含 App 名稱、回合編號與對戰方式 | `roundNumber = 3`、`format = "doubles"` → 標題字串同時含 App 名稱常數、`"3"` 與「雙打」三者 | golden path：`prd.md` 9.4 明列的前三項，也是「貼進群組後看得出是第幾輪」的唯一資訊來源 | unit |
| 每個場地含場地編號與該場全部球員格 | 每個場地含場地編號與該場全部球員格 | 2 個場地的雙打回合 → `courts.length === 2`、`courtNumber` 依序 1／2；每個 court 的 tiles 長度為 4，每格帶姓名與 `teamIndex` | golden path：`prd.md` 9.4 的場地編號與姓名兩項，且雙打 4 格是最容易少畫一格的地方 | unit |
| 已完成場次顯示最終比分與勝方 | 已完成場次顯示最終比分與勝方 | `status = "completed"`、`scores = { teamA: 11, teamB: 7 }`、`winner = "teamA"` → 狀態文字同時含 `"11"`、`"7"` 與勝方隊伍字樣 | golden path：9.4 的「比分」分支 | unit |
| 未完成場次顯示未完成狀態而非空白比分 | 未完成場次顯示未完成狀態 | `scores = null` → 狀態文字為「未完成」類文字，且不含任何數字比分 | edge case：9.4 的「或未完成狀態」分支；只實作已完成分支時這裡會變成空字串，圖上看起來像壞掉 | unit |
| 球員格帶該員雙色漸層與 pickTextColor 前景色 | 球員格帶雙色漸層與自動對比前景 | 某員 `colorFrom`／`colorTo` 為兩個相異 hex → 該格帶這兩個色碼；前景色等於直接呼叫 `pickTextColor(colorFrom, colorTo)` 的回傳值（不硬寫顏色字串） | golden path＋防重複實作：`prd.md` 4.1.1 要求全站同一套漸層與對比，匯出另寫一套亮度判斷是最容易發生的偏移 | unit |
| 名單中找不到該球員時以替代文字呈現且不拋錯 | 名單中找不到球員時以替代文字呈現 | 回合含一個名單裡沒有的 `playerId` → 該格為可判讀的替代文字，其餘格內容完整，呼叫不 throw | edge case：M4 的回合只存 id，使用者可在回合中刪人——這是資料模型的必然，不是防禦性編程 | unit |
| 畫布高度依場地數與對戰方式遞增 | 畫布高度依場地數與對戰方式推導 | 3 個場地的 `height` > 1 個場地的 `height`；同為 1 個場地時雙打 `height` > 單打 `height` | edge case：高度算錯會讓最後一個場地被切掉，而那在圖上是「靜默」的失敗 | unit |

### Requirement: JPG 檔案的產生與下載

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| JPG 檔名依回合編號與注入日期組成 | 檔名依回合編號與注入日期組成 | `roundNumber = 3`、`exportedAt = "2026-08-23T01:02:03.000Z"` → 回傳 `matchmaker-round-3-2026-08-23.jpg` | 決定性：函式內部呼叫 `new Date()` 會讓測試只能寬鬆斷言，先寫測試才逼出注入設計（沿用 M8 `backupFileName` 的同一慣例） | unit |
| 匯出場景以不透明白色為底色 | 匯出內容以不透明底色繪製 | `scene.background` 為不透明色值（非 `transparent`、不帶 alpha） | regression guard：JPEG 無 alpha，少了底色會整張變黑底——這條測試是那個災難的唯一自動化防線 | unit |
| 匯出 JPG 會下載檔名含回合編號與日期的 JPEG 檔案 | 點擊匯出 JPG 會下載 JPEG 檔案 | 點擊後 `waitForEvent("download")` 成立；`suggestedFilename()` 符合 `/^matchmaker-round-\d+-\d{4}-\d{2}-\d{2}\.jpg$/`；讀檔前三位元組為 `FF D8 FF` 且大小 > 0 | golden path：例外層（canvas 繪製與下載）唯一能自動驗證的一條，也是「圖真的產出來了」的唯一證據 | e2e |

### Requirement: PDF 以瀏覽器列印流程輸出

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 列印版顯示回合標題與每個場地的球員與比分 | 列印版含目前回合與各場次 | 以 2 個場地的 scene 渲染 → 查得回合標題；兩個場地各自查得場地編號、該場全部球員姓名與比分或未完成狀態 | golden path：`prd.md` 9.5 的內容要求全部落在這一條 | integration |
| 點擊列印 PDF 會呼叫注入的列印函式一次 | 點擊列印 PDF 觸發瀏覽器列印 | 注入 `vi.fn()` 作為 printer → 點擊後恰好被呼叫 1 次 | golden path：wiring 是否接對，用假函式在毫秒內驗完，不必等 e2e | integration |
| 點擊列印 PDF 會呼叫瀏覽器列印一次 | 點擊列印 PDF 觸發瀏覽器列印 | 以 `addInitScript` 覆寫 `window.print` 為記錄呼叫的 stub → 點擊後計數為 1 | golden path：integration 驗的是注入路徑，這條驗的是「元件在真實頁面上確實接到了 `window.print`」 | e2e |
| 列印媒體下隱藏全站導覽與操作控制項並顯示列印版內容 | 列印媒體下隱藏導覽與操作控制項 | `emulateMedia({ media: "print" })` → `body > header` 與 `[data-print="hide"]` 皆 hidden；`[data-print="sheet"]` 為 visible | golden path：印出來還帶著 navbar 與按鈕就等於沒做 print CSS，而這只有真實排版引擎能驗 | e2e |
| 列印版的每個場地區塊設定為不跨頁切斷 | 場地區塊不跨頁切斷 | `emulateMedia({ media: "print" })` 後讀 `[data-print="court"]` 的 computed style → `break-inside` 為 `"avoid"` | edge case：場地被切成兩頁是紙本最實際的痛點，且分頁規則寫錯不會有任何錯誤訊息 | e2e |

### Requirement: 列印被阻擋時的繁體中文提示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 列印函式拋錯時判定為被阻擋並回傳繁體中文訊息 | 列印函式拋錯時判定為被阻擋 | 傳入 `() => { throw new Error("blocked") }` → `ok === false`，`message` 含「彈出視窗」四字且為繁體中文 | edge case：`prd.md` 9.5、§11 明列的要求，而 Playwright 無法模擬彈出視窗阻擋器——不在這層測就永遠沒測 | unit |
| 環境未提供列印函式時判定為被阻擋 | 環境未提供列印能力時判定為被阻擋 | 傳入 `undefined` 與非函式的值 → 兩者皆 `ok === false`，`message` 與拋錯情境相同 | edge case：部分 WebView 沒有 `window.print`；兩種失敗形態對使用者是同一件事，訊息必須一致 | unit |
| 列印成功時回報 ok 且不帶訊息 | 列印成功時不回報錯誤 | 傳入 `vi.fn()` → `ok === true`、無 `message`；該函式恰被呼叫 1 次 | golden path：只寫失敗路徑會讓「永遠回報被擋」的實作也通過 | unit |
| 列印被阻擋時以 role alert 顯示繁體中文提示 | 被阻擋提示顯示於對戰頁 | 注入會拋錯的 printer → 點擊後 `getByRole("alert")` 內出現繁體中文提示，含彈出視窗權限與瀏覽器選單列印兩條退路，且不含未轉譯的錯誤碼 | golden path＋無障礙：判定正確但沒顯示出來等於沒做；`role="alert"` 是讀屏即時播報的條件 | integration |

### Requirement: 匯出為純前端唯讀操作

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 組裝匯出內容不修改輸入的回合與名單 | 組裝匯出內容不修改輸入 | 呼叫前以 `structuredClone` 留底 → 呼叫後回合與名單深層比對完全相同 | regression guard：`lib/matchmaker/` 全段的一貫約束（M2 已有同型測試），排序或 map 寫成原地操作就會破功 | unit |
| 匯出 JPG 後目前回合與本機資料保持不變 | 匯出後回合與本機資料不變 | 匯出前後讀 `matchmaker:round:v1` 內容相同；重新整理後場地數、場次狀態與比分不變 | edge case：匯出若不小心觸發任何 store 寫入，破壞的是使用者現場正在進行的回合 | e2e |
| 匯出過程不發出任何網路請求 | 匯出不發出網路請求 | 頁面載入完成後開始攔截路由，完成一次 JPG 匯出與一次列印觸發 → 期間 `request` 事件數為 0 | regression guard：`prd.md` 12.4 的資料安全承諾；改用伺服器產圖是最容易被「順手優化」進來的方向 | e2e |

### Requirement: 匯出入口的可用性與無障礙

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 匯出入口具備可存取名稱且可由鍵盤操作 | 匯出入口具備可存取名稱且可由鍵盤操作 | 以 Tab 走到兩個入口 → 兩者皆能取得 focus，且 `accessibleName` 非空 | 無障礙 golden path：`prd.md` 12.3「不得只依賴滑鼠」與 12.5「互動控制需具備可辨識文字或 aria-label」 | e2e |
| 匯出進行中時匯出 JPG 入口暫時停用避免重複觸發 | 匯出進行中時入口暫時停用 | 以未 resolve 的 promise 模擬繪製中 → 按鈕帶 `disabled`；promise resolve 後恢復無 `disabled` | edge case：非同步操作的連點是實務上最常見的重複下載成因，而使用者無從得知哪一份完整 | integration |
