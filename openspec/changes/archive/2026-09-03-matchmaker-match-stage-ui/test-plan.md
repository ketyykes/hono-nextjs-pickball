> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> Tier 對照本 change 的分層（design Decision 10）：
> - `unit`：`lib/matchmaker/` 純函式，Vitest + happy-dom，毫秒級、決定性
> - `integration`：`components/` 元件，Vitest + `@testing-library/react`，測 wiring
> - `e2e`：Playwright，測真實排版、跨頁導航、鍵盤與觸控
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。

## match-stage

### Requirement: 對戰頁路由與 matchmaker 區段動線

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 對戰頁可經 /matchmaker 開啟並顯示場次舞台 | 對戰頁可經路由開啟 | `goto("/matchmaker")` → 頁面回應 200 且舞台區域可見，非 404 | golden path：路由不存在的話後面每一條都不用測 | e2e |
| 目前路徑對應的分頁為 active，其餘分頁為非 active | 區段導覽標示目前所在頁 | 輸入 `"/matchmaker"` → 對戰分頁 `active === true`、參賽者分頁 `false`；輸入 `"/matchmaker/players"` → 反之 | golden path：active 判定是唯一有分支的邏輯，抽出來後只有這一條要測 | unit |
| 區段導覽可在對戰頁與參賽者名單頁之間來回切換 | 兩頁可互相切換 | 於 `/matchmaker` 點「參賽者」→ URL 為 `/matchmaker/players`；再點「對戰」→ URL 回到 `/matchmaker`；兩頁皆可見區段導覽 | golden path：spec 明訂雙向動線，單向連結是最容易漏掉的實作偷懶 | e2e |

### Requirement: 本輪設定控制項的預設值與範圍

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 預設為單打與 1 個場地且取用分配引擎匯出的常數 | 預設為單打與 1 個場地 | `createRoundSettings()` → `format === DEFAULT_FORMAT`、`courtCount === DEFAULT_COURT_COUNT`，且斷言直接比對 import 進來的常數而非字面量 `"singles"`／`1` | golden path＋防寫死：`prd.md` 13.3 的兩個驗收項，且 `match-allocation` spec 明文禁止 UI 各自寫死 | unit |
| 場地數加減夾在 1～8 並回報是否已達邊界 | 場地數加減夾在合法範圍內 | 8 加一 → 仍為 8 且 `canIncrement === false`；1 減一 → 仍為 1 且 `canDecrement === false`；4 加一 → 5、減一 → 3 | edge case：分配引擎對超界 `courtCount` 是拋錯不是夾值，這層是唯一防線 | unit |
| 場地數為 1 時減號 disabled、為 8 時加號 disabled | 邊界時加減按鈕為 disabled | `courtCount=1` → 減號有 `disabled`、加號無；`courtCount=8` → 加號有 `disabled`、減號無 | edge case：純函式回報了邊界，元件有沒有把它接到 `disabled` 是另一回事 | integration |
| 對戰方式只提供單打與雙打且無性別限定模式選項 | 對戰方式只有單打與雙打 | 控制項的可選項恰為兩項，文字為「單打」「雙打」；查無「混雙」「男雙」「女雙」等篩選模式選項 | regression guard：`prd.md` 4.2、15 的產品決策，最容易被「順手加個混雙模式」破壞 | integration |

### Requirement: 目標分數選擇器

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 目標分數選項為 11／15／21 且預設選中 11 | 選項為 11／15／21 且預設 11 | 無目前回合時 `getAllByRole("radio")` 長度為 3、文字為 11／15／21；`aria-checked="true"` 者為 11 | golden path：`prd.md` 6.3.1 的三個分制 | integration |
| 目前回合存在時目標分數選擇器 disabled 並顯示已鎖定說明 | 目前回合存在時鎖定 | 傳入 `targetScore` 為 15 的回合 → 三顆 radio 皆有 `disabled`、`aria-checked="true"` 者為 15、畫面出現「本輪已鎖定」文字 | edge case＋可用性：design Decision 5 的嚴格版鎖定，且 12.3 要求 disabled 要解釋自己 | integration |
| 目標分數 radiogroup 支援方向鍵導覽與 roving tabindex | 方向鍵導覽與 roving tabindex | Tab 進入群組落在選中項；按 ArrowRight → 選取移到 15（移動即選取）；群組內僅選中項 `tabIndex` 為 0 | 無障礙 golden path：鍵盤路徑無法用 unit 驗（需真實 focus 管理），且 12.3 要求不得只依賴滑鼠 | e2e |

### Requirement: 產生本輪與重設／再排的操作入口

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 按下產生本輪對戰會以目前設定呼叫回合產生函式一次 | 產生本輪委派回合 capability | 點擊「產生本輪對戰」→ `onGenerate` 被呼叫 1 次，參數含目前的 `format`／`courtCount`／`targetScore` | golden path＋防重複實作：UI 若自己算分配，第二個真相來源就誕生了 | integration |
| 可出場人數不足一場時產生按鈕 disabled 並顯示繁體中文原因 | 人數不足時停用並說明原因 | 雙打、可出場 3 人 → 按鈕有 `disabled`；畫面出現含「4 人」與目前人數的繁體中文說明，且不含未轉譯的錯誤碼 | edge case：`prd.md` 第 11 節前三項邊界（單打不足、雙打不足、全員暫停）在 UI 的共同出口 | integration |
| 無目前回合或場次全部完成時不顯示重設再排入口 | 沒有可重排的場次時不顯示重設入口 | `round === null` → 查無「重設／再排」；回合存在但所有場次 `completed` → 同樣查無 | edge case：`prd.md` 6.2 的顯示條件有兩個 AND 條件，只實作一半是最常見的偏差 | integration |
| 目前回合仍有未完成場次時顯示重設再排入口並委派回合 capability | 有未完成場次時顯示重設入口 | 回合存在且至少一場未完成 → 入口可見；點擊後 `onReset` 被呼叫 1 次 | golden path：6.2 的正向路徑 | integration |

### Requirement: 單打場地的滿版色塊呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 單打回傳兩格且兩格同列左右相鄰分屬兩隊 | 單打為兩格左右排列 | 以一場 `format: "singles"` 的 `Match` 呼叫 → 回傳長度 2；兩格 `row` 相同、`column` 為 0 與 1；`teamIndex` 為 0 與 1 | golden path：`prd.md` 7.2 的核心版面，抽成純函式後這是唯一要測的規則 | unit |
| 每個色塊顯示姓名、性別與強度分數 | 每格顯示姓名、性別與強度分數 | 渲染單打場次 → 每格內同時查得姓名、性別文字（男／女／其他）、`toFixed(2)` 的強度分數 | golden path：`prd.md` 7.2 明列的三項資訊，也是 12.5「色彩不是唯一資訊來源」的落地 | integration |
| 色塊背景為雙色漸層且前景取 pickTextColor 的結果 | 色塊背景為雙色漸層且文字自動對比 | 以某 `Player` 呼叫 → `background` 含 `colorFrom` 與 `colorTo` 的線性漸層；`color === pickTextColor(colorFrom, colorTo)` | golden path＋防重複實作：4.1.1 要求全站同一套漸層與對比，另寫一套亮度判斷是最容易發生的偏移 | unit |
| 單打場地為兩個接近正方形的色塊且左右排列 | 不以垂直卡片列表呈現 | 1280x800 下量測兩格 boundingBox：`width/height` 落在 0.85～1.15；兩格垂直中心相同、水平位置相異 | `prd.md` 7.1 的核心禁令，且只有真實排版引擎能回答「它真的是方塊嗎」 | e2e |

### Requirement: 雙打場地的 2x2 色塊呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 雙打回傳四格並排成 2x2 | 雙打為四格 2x2 | 以一場 `format: "doubles"` 的 `Match` 呼叫 → 回傳長度 4；`row` 為 0 與 1 各兩格、`column` 為 0 與 1 各兩格 | golden path：`prd.md` 7.3 的核心版面 | unit |
| 雙打上排兩格為第一隊下排兩格為第二隊 | 同隊兩格位於同一列 | `row === 0` 的兩格 `teamIndex` 皆為 0；`row === 1` 的兩格皆為 1 | design Decision 4 的落地判準；「對角同隊」是同樣通過 2x2 斷言的錯誤實作，需要獨立的一條釘住 | unit |
| 雙打場次顯示男雙女雙混雙或一般雙打的組成標示 | 顯示雙打組成標示 | `doublesComposition` 為 `mixed`／`mens`／`womens`／`general` 時分別顯示「混雙」／「男雙」／「女雙」／「一般雙打」 | `prd.md` 13.3 驗收項；四個分支缺一即顯示錯誤資料 | integration |

### Requirement: 休息名單輔助區

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 休息名單顯示姓名顏色標記與累計休息次數 | 休息名單顯示三項資訊 | 傳入 2 位休息者 → 每筆查得姓名、帶該員漸層的顏色標記元素、含 `restCount` 的「休息 N 次」文字 | golden path：`prd.md` 7.4 明列的三項 | integration |
| 休息名單為空時區分本輪全員出場與全員暫停出場兩種文案 | 兩種空狀態文案不同 | `resting=[]` 且 `hasActivePlayers=true` → 「本輪全員出場」；`resting=[]` 且 `hasActivePlayers=false` → 另一段指出「全員暫停出場」的文字，兩段文案不相等 | edge case：分配引擎不把暫停者列入休息名單，兩種情況的資料**完全相同**，只有這條測試能分辨 | integration |

### Requirement: 空白球場狀態

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 有可出場參賽者但尚無回合時顯示空白球場與建立第一輪入口 | 有參賽者但尚無回合 | 種入 4 位可出場參賽者、無回合 → 顯示空白球場區塊與「建立第一輪」按鈕 | golden path：`prd.md` 7.5、13.1 的首次使用畫面 | e2e |
| 名單為空時空白狀態提供前往參賽者名單的入口 | 名單為空時導向加入參賽者 | 名單為空 → 顯示「加入參賽者」入口；點擊後 URL 為 `/matchmaker/players` | edge case：不分流的話使用者會停在一顆按不動的按鈕前 | e2e |
| 空白狀態不顯示任何球員色塊或比分欄位 | 空白狀態不顯示假資料 | 名單為空、無本機資料 → 查無任何球員色塊、比分欄位與場地區塊 | regression guard：`prd.md` 4.1.4／13.1 明訂不得帶入假資料，示範資料是很容易「順手加來看效果」的東西 | e2e |

### Requirement: 手動輸入比分與送出

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 比分欄位為 inputMode numeric 並標示所屬隊伍 | 比分欄位喚起數字鍵盤 | 未完成場次 → 兩個欄位皆有 `inputMode="numeric"`，各自具備指出隊伍的可存取名稱 | `prd.md` 12.3 明文要求；缺了在桌面完全看不出來，只有手機使用者會痛 | integration |
| 送出比分會以場次識別與兩隊分數呼叫回合送出函式一次 | 送出委派回合 capability | 填 11 與 7 後送出 → `onSubmitScore` 被呼叫 1 次，參數含場次識別與 `[11, 7]` | golden path＋防重複實作：評分與歷史寫入一律歸 M4 | integration |
| 完成一輪：產生本輪對戰後手動輸入比分並送出使場次進入完成狀態 | 送出委派回合 capability | 由 UI 產生本輪 → 於第 1 場地填入比分並送出 → 該場次呈現已完成樣式並顯示最終比分 | 端到端串接：integration 用 `vi.fn()` 假裝 callback，測不出真的接上 M4 pipeline | e2e |
| 送出失敗時於該場次以 role alert 顯示繁體中文錯誤訊息 | 驗證失敗以繁體中文呈現 | pipeline 回傳驗證失敗（空白／非數字／平局）→ 該場次內出現 `role="alert"` 的繁體中文訊息，且不含未轉譯的錯誤碼 | edge case：`prd.md` 6.3.2 的四種不得送出情況與第 11 節「錯誤訊息需使用繁體中文」的共同出口 | integration |
| 已完成場次的比分欄位與送出按鈕皆為 disabled | 已完成場次不可再送出 | 場次為已完成 → 兩個欄位與送出按鈕皆有 `disabled` | edge case：`prd.md` 6.5「已完成場次不得再次送出相同比分」 | integration |

### Requirement: 完成場次的視覺與資訊

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 已完成場次的色塊樣式降低不透明度與飽和度 | 完成場次為半透明低飽和 | `completed: true` 的回傳相對 `completed: false` 的不透明度較低且飽和度較低；`completed: false` 時不帶這兩項 | golden path：`prd.md` 6.5 的兩個形容詞各對應一項可斷言的樣式 | unit |
| 已完成場次顯示最終比分勝方與完成時間 | 完成場次顯示比分勝方與時間 | 11:7、第一隊勝的已完成場次 → 查得 11、7、勝方所屬隊伍與完成時間 | golden path：`prd.md` 6.5 明列的三項資訊 | integration |
| 勝方以文字標籤標示而非僅以顏色區分 | 勝方以文字標示 | 已完成場次 → 勝方隊伍查得文字標籤，敗方查無同一標籤 | `prd.md` 12.5：只調飽和度的實作會通過上一條卻在此轉紅 | integration |

### Requirement: 強度分數觸頂與觸底標示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| rating 為上限時判定為已達上限 | 達上限時判定為觸頂 | `rating` 為 8.00 → 回傳觸頂狀態 | golden path：`prd.md` 6.4.6、13.4 驗收項 | unit |
| rating 為下限時判定為已達下限 | 達下限時判定為觸底 | `rating` 為 1.00 → 回傳觸底狀態 | golden path：與上限對稱，方向寫反是常見錯誤 | unit |
| rating 介於上下限之間時不判定為觸界 | 未觸界時不標示 | 1.01、4.50、7.99 → 皆回傳未觸界 | edge case：邊界外一分的近界值最能抓到 `>=`／`>` 寫錯 | unit |
| 色塊在觸頂或觸底時顯示已達上限或已達下限標示 | 色塊顯示觸界標示 | 場次含 `rating` 8.00 與 1.00 兩人 → 前者色塊查得「已達上限」文字、後者查得「已達下限」 | 純函式判定完之後，元件有沒有真的把它顯示出來是另一回事（6.4.6 明訂不得靜默） | integration |

### Requirement: 對戰頁的響應式三斷點

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 桌面斷點場地內容與休息名單左右並排 | 桌面斷點左右並排 | 1280x800、2 場對戰 → 休息名單 `x` 不小於場地內容的右緣 | golden path：`prd.md` 7.6 桌面列 | e2e |
| 平板斷點休息名單移至場地內容下方 | 平板斷點休息名單下移 | 768x1024 → 休息名單 `y` 不小於場地內容的下緣 | `prd.md` 7.6 平板列；斷點切換點最容易只做了桌面與手機兩段 | e2e |
| 手機斷點觸控目標不小於 44px 且不橫向溢出 | 手機斷點單欄且觸控友善 | 390x844 → 比分欄位與送出按鈕的寬高皆 ≥44px；`scrollWidth <= clientWidth + 1` | `prd.md` 7.6 手機列＋12.3 觸控；390px 是本 repo 既定的支援下限 | e2e |

### Requirement: 對戰頁的可用性與無障礙

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 主要按鈕可由鍵盤聚焦並顯示 focus 樣式，停用者帶 disabled 屬性 | 鍵盤可聚焦且停用狀態正確 | Tab 走訪 → 可用按鈕取得 focus 且有可見的 focus 樣式；停用按鈕帶 `disabled` 且不會被 Tab 聚焦 | `prd.md` 12.3；「只把視覺變淡」的假 disabled 在此轉紅 | e2e |
| 對戰頁所有互動控制皆具備可存取名稱 | 互動控制皆有可讀名稱 | 蒐集頁面所有 button／input／連結 → 每個的可存取名稱皆非空 | `prd.md` 12.5；圖示按鈕（場地數加減）最容易漏 `aria-label` | e2e |
| 場地與隊伍皆有文字標籤使色彩不是唯一資訊來源 | 場地與隊伍有文字標籤 | 渲染雙打場次 → 查得場地標題文字與兩支隊伍各自的文字標籤 | `prd.md` 12.5 的核心條款，也是雙打「哪兩格是一隊」的唯一非色彩線索 | integration |

## site-navbar

### Requirement: 對戰分配連結

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| Navbar 顯示對戰分配連結且指向 /matchmaker | Navbar 顯示對戰分配連結 | 渲染 SiteNavbar → 查得文字「對戰分配」的連結，`href === "/matchmaker"` | golden path：M1 遞延至今的導覽整合，本 change 的兌現點 | integration |
| 路由為 /matchmaker 時對戰分配連結套用 active 樣式 | /matchmaker active 標示 | mock `usePathname` 回 `/matchmaker` → 該連結套 active 樣式、其餘為 muted | edge case：新增連結時最容易只加進清單卻沒進 active 判定 | integration |
| 從首頁點擊 Navbar 的對戰分配連結進入對戰頁 | E2E 從 Navbar 進入對戰頁 | 於 `/` 點「對戰分配」→ URL 為 `/matchmaker` 且舞台區域可見 | 端到端：比照既有「E2E 從 Navbar 進入測驗」的驗收模式 | e2e |

### Requirement: 窄螢幕導航呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 窄螢幕下 logo 與導航連結皆不換行 | 窄螢幕下 logo 與導航連結皆不換行 | 390px 下 logo 與連結高度不高於 1280px 下的高度（容許 4px） | regression guard：既有 test，第 5 條連結是最可能讓它轉紅的改動——design Decision 7 的紅燈來源 | e2e |
| 窄螢幕下四個導航連結全部可見 | 窄螢幕下四個連結全部可見 | 390px 下「首頁」「完整體驗」「計分板」「測驗」四者皆 visible | regression guard：既有 test 原樣保留（Scenario 標題因 openspec MODIFIED 的整段取代語意不可改名，見 spec 內註），第 5 條連結不得排擠既有四條 | e2e |
| 窄螢幕下對戰分配連結亦全部可見 | 窄螢幕下對戰分配連結亦可見 | 390px 下「對戰分配」為 visible，且與其餘四條同列不換行 | 本 MODIFIED 的直接驗收：新增的第 5 條連結是唯一可能撐破 390px 的變數 | e2e |
| 寬螢幕顯示 logo 文字，窄螢幕收合只留圖示 | logo 文字依斷點收合 | ≥640px 顯示「🏓 匹克球指南」；<640px 只顯示 🏓 | regression guard：既有行為不得因新增連結而變動 | e2e |
| 窄螢幕下導航列內容不橫向溢出 | 窄螢幕下不橫向溢出 | 390px 下 header 內層容器 `scrollWidth <= clientWidth` | regression guard：既有的輔助斷言，spec 已註明不可單獨作為驗收 | e2e |
