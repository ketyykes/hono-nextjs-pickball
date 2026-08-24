## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- **這是 matchmaker 的第一個「畫面」milestone**。M1 只做名單頁，M2／M3 是純函式，M4 是狀態機
  與持久化。本 change 是第一次把 `prd.md` 第 7 節的視覺規格落地，也是 matchmaker 第一次出現在
  全站 navbar。
- `nextjs-pickball/components/matchmaker/` 目前有 `EmptyRoster`、`PlayerCard`、`PlayerForm`、
  `PlayerList`、`ResetRosterDialog` 五個元件，皆為扁平佈局、`"use client"`、以
  `pickTextColor` 處理漸層上的文字對比。本 change 沿用同一佈局與同一組慣例，不新增子目錄。
- `lib/matchmaker/` 亦為扁平佈局（`types`／`roster`／`colors`／`storage`／`allocation-*`／
  `candidates`／`pairing`／`duplication`／`rating-math`），各自鄰近一份 `*.test.ts`。本 change
  新增的五個純函式模組沿用此佈局。
- **本 workspace 的 TDD 分層規範**（`nextjs-pickball/CLAUDE.md`）決定了本 change 的檔案切分：
  `app/**/page.tsx`、`app/**/layout.tsx` 屬例外層（純入口，不強制單元 TDD，以 E2E 驗收）；
  純呈現型元件同樣不強制單元 TDD；**行為邏輯 MUST 下放 `hooks/`、`lib/` 再對其做 TDD**。
  因此本 change 的「可 TDD 的東西」不是元件本身，而是被元件呼叫的五個純函式模組。
- `lib/matchmaker/allocation-types.ts` 已匯出 `DEFAULT_FORMAT`、`DEFAULT_COURT_COUNT`、
  `MIN_COURT_COUNT`、`MAX_COURT_COUNT`、`PLAYERS_PER_MATCH`，且 `match-allocation` spec 明訂
  「SHALL 由本 capability 以具名常數匯出，供上層 UI 取用，SHALL NOT 由 UI 各自寫死」。本 change
  是那句話的第一個消費者。
- `Match` 已是 discriminated union：`format: "singles"` 不帶 `doublesComposition`、
  `format: "doubles"` 必帶。色塊版面推導可以依 `format` 分支而不需執行期防呆。
- `lib/scoreboard/radio-navigation.ts` 的 `nextRadioIndex` 已是與 capability 無關的 WAI-ARIA
  索引計算純函式，且 `scoreboard` spec **明文釘住這個路徑**（「索引計算 MUST 抽為純函式
  （`nextjs-pickball/lib/scoreboard/radio-navigation.ts`）」）。
- `hooks/` 目錄的歸屬清單由 `pickleball-guide-page` spec 的「互動行為由三支 hooks 提供且各有
  smoke test」Requirement 掌管，且有守衛測試 `hooks/hooksInventory.test.ts` **雙向**驗證
  （目錄有的清單要有、清單提的檔案要在）。任何 capability 在 `hooks/` 新增檔案，都會連帶動到
  `pickleball-guide-page` 的規格。
- E2E 的 `testIdAttribute` 為 `data-testid`，`baseURL` 為 `http://localhost:3005`，五個 browser
  project（含 `mobile-safari` 預設 390x664，是最矮的 viewport）。

## Goals / Non-Goals

**Goals:**

- 讓 `prd.md` 7.1 的核心主張——「不得使用傳統垂直卡片列表，改採滿版方型色塊」——成為**可被
  機械驗收**的條款，而不是一句品味宣言：色塊的版面推導與樣式推導各自抽成純函式並逐條測試，
  E2E 再以 boundingBox 的寬高比與相對位置把「它真的長成方塊、真的左右排列」釘住。
- 把 UI 對 M4 的依賴收斂到**單一個檔案**（`app/matchmaker/page.tsx`），使 M4 的介面若在合併後
  與預期不符，修改面積是一個檔案而不是八個元件。
- 在不新增任何 `hooks/` 檔案的前提下完成本 change，避免與 M4 的並行 worktree 在
  `pickleball-guide-page` 規格上打架。

**Non-Goals:**

- **不做零捲動版面**。`/scoreboard` 是單場計分、鎖在視口高度；對戰頁最多 8 個場地 x 4 人 = 32
  個色塊，硬塞進一個視口只會讓每格小到讀不出名字。對戰頁 SHALL 允許垂直捲動，只保證不**橫向**
  溢出。
- 不做色塊的拖曳換人、不做場地排序、不做動畫過場。`prd.md` 沒有要求，且會與 M4 的重排 pipeline
  語意打架。
- 不為 M9 的 JPG／PDF 匯出預先扭曲 DOM 結構（例如硬塞截圖用的隱藏節點）。等 M9 真的要做時再依
  當時的需求調整，比現在憑空猜測便宜。
- 不處理 LocalStorage 損壞／配額不足的提示。那屬於儲存層（M1／M4）的責任，名單頁已有
  `droppedCount` 的先例。

## Decisions

### Decision 1：`/matchmaker` 為對戰頁，區段導覽掛在 `app/matchmaker/layout.tsx`

路由配置：

| 路徑 | 內容 | 檔案 |
|---|---|---|
| `/matchmaker` | 對戰頁（場次舞台） | `app/matchmaker/page.tsx`（本 change 新增） |
| `/matchmaker/players` | 參賽者名單（M1 既有） | `app/matchmaker/players/page.tsx`（不動） |
| （兩頁共用外框） | 區段導覽「對戰／參賽者」 | `app/matchmaker/layout.tsx`（本 change 新增） |

把對戰頁放在區段根路徑 `/matchmaker`，是因為它是這個功能的**主畫面**——全站 navbar 的入口只會
有一條，指向主畫面才符合使用者對「對戰分配」四個字的預期；名單是為了排對戰而存在的前置作業，
放在子路徑。替代方案是 `/matchmaker/matches` 加上 `/matchmaker` 導向它，否決理由是多一次
redirect 卻換不到任何語意，而且 `/matchmaker` 這個裸路徑目前會 404，本來就得處理。

區段導覽放 `layout.tsx` 而非各頁自己渲染一份，理由是它必須在**兩頁**都出現（spec 明訂雙向動線）；
放 layout 讓「兩頁一致」由框架保證，而不是靠兩個 page 各自記得引入。`layout.tsx` 屬例外層
（純入口），本身不含邏輯——分頁清單與 active 判定下放到 `lib/matchmaker/section-nav.ts`
（Decision 2）。

副作用：`/matchmaker/players` 從此多出一條區段導覽。這不改 `player-roster` 的任何 Requirement
（資料模型、CRUD、重置流程皆不動），因此不列為 Modified capability；但既有的
`tests/e2e/specs/player-roster.spec.ts` 若有「頁面頂部第一個元素」這類位置性斷言需一併確認。

### Decision 2：元件八個、純函式模組五個，行為邏輯一律下放到 `lib/`

| 檔案 | 類型 | 職責 | TDD |
|---|---|---|---|
| `app/matchmaker/page.tsx` | 例外層 | 唯一的 M4 依賴點：取回合狀態、注入 callback | E2E |
| `app/matchmaker/layout.tsx` | 例外層 | 區段外框 + `MatchmakerTabs` | E2E |
| `components/matchmaker/MatchmakerTabs.tsx` | 呈現 | 區段導覽 | E2E（邏輯在 `section-nav.ts`） |
| `components/matchmaker/MatchStage.tsx` | 呈現 | 舞台版面：場次網格 + 休息名單，RWD 三斷點 | E2E |
| `components/matchmaker/RoundControls.tsx` | 呈現＋wiring | 對戰方式／場地數／目標分數／產生／重設 | integration |
| `components/matchmaker/CourtCard.tsx` | 呈現＋wiring | 單一場地：色塊網格 + 比分 + 完成資訊 | integration |
| `components/matchmaker/PlayerTile.tsx` | 呈現 | 單一 1x1 色塊 | 由 CourtCard 測試涵蓋 |
| `components/matchmaker/ScoreEntry.tsx` | 呈現＋wiring | 兩個比分欄位 + 送出 + 錯誤訊息 | 由 CourtCard 測試涵蓋 |
| `components/matchmaker/RestingPanel.tsx` | 呈現 | 休息名單與兩種空狀態 | integration |
| `components/matchmaker/EmptyStage.tsx` | 呈現 | 空白球場與分流入口 | E2E |
| `lib/matchmaker/section-nav.ts` | 純函式 | 分頁清單與 active 判定 | unit |
| `lib/matchmaker/round-settings.ts` | 純函式 | 本輪設定的預設值與場地數夾值 | unit |
| `lib/matchmaker/stage-layout.ts` | 純函式 | 由 `Match` 推導每格的隊伍與 row／column | unit |
| `lib/matchmaker/tile-style.ts` | 純函式 | 由 `Player` 與完成狀態推導色塊 inline style | unit |
| `lib/matchmaker/rating-bounds.ts` | 純函式 | 觸頂／觸底判定 | unit |

這個切分不是為了「檔案多比較整齊」，而是被 `nextjs-pickball/CLAUDE.md` 的分層規範直接推導出來的：
元件不強制單元 TDD，所以**任何值得測的東西都必須先離開元件**。把「雙打上排是第一隊」寫在
`CourtCard.tsx` 的 JSX 裡，它就只能被 E2E 驗（慢、脆、要跑五個 browser）；抽成
`stage-layout.ts` 之後，同一條規則變成一個 30ms 的單元測試。

替代方案是少切幾個檔案、用 React Testing Library 直接測元件。部分採用（`RoundControls`、
`CourtCard`、`RestingPanel` 三個 wiring 密集的元件仍有 integration 測試），但**不**把版面與樣式
推導留在元件內——那三個純函式的斷言（row／column、漸層字串、飽和度）在 RTL 裡要靠讀 inline
style 字串反推，比直接測函式回傳值脆得多。

### Decision 3：本 change 不新增任何 `hooks/` 檔案

「本輪設定」（對戰方式、場地數、目標分數）看起來最自然的形狀是一支 `useRoundSettings` hook。
**刻意不做**，改成 `lib/matchmaker/round-settings.ts` 純函式 + 元件內 `useState`。

兩個理由：

1. **規格耦合**：`hooks/` 的歸屬清單由 `pickleball-guide-page` 的 Requirement 掌管，並有守衛
   測試 `hooks/hooksInventory.test.ts` 雙向比對。M5 新增一支 hook 就必須把
   `pickleball-guide-page` 列為 Modified capability 並改那份清單——而 **M4 幾乎必然也要新增
   `useRoundStore` 並改同一份清單**。兩個並行 worktree 修改同一個 Requirement 的同一段文字，
   合併時必然衝突，且衝突的是規格而非程式碼（比程式碼衝突更難自動解）。
2. **可測性**：夾值與預設值本來就是純函式，包成 hook 只是多一層 `renderHook`。

歷史包袱值得一提：這份清單的規則**已經失效過兩次**（`4c5b724` 的 `useFocusMode`、
`add-player-roster` 的 `useRosterStore`），後者的 proposal 甚至明文寫著「對
`pickleball-guide-page` 無影響」。本 change 選擇的不是「記得更新清單」，而是**根本不進那個
目錄**——不需要靠紀律維持的約束才是可靠的約束。

### Decision 4：雙打 2x2 採「上排第一隊、下排第二隊」，不採對角

`prd.md` 7.3 寫「對角或左右兩格代表同一隊」，是二選一的開放條款。選擇上下兩排各一隊：

```
上排（第一隊）：[ A ][ B ]
─────── 網 ───────
下排（第二隊）：[ C ][ D ]
```

理由是 7.1 要求的是「具有**球場感**」的視覺區塊。真實球場上兩隊分踞球網兩側、隊友並肩，
上下分排 + 中央的比分區恰好就是俯視球場的樣子；對角同隊則是混雙站位的抽象表達，讀者必須先知道
「對角同色是一隊」這條額外規則才看得懂，違反 12.5「色彩不可作為唯一資訊來源」的精神——即使
補了文字標籤，對角配置仍讓「哪兩格是一隊」需要一次腦內轉換。

中央的比分與送出控制區同時扮演「網」的分隔角色，一舉兩得：它讓兩隊在視覺上被切開，不必額外
畫一條裝飾線。

此決定寫進 spec 的 Requirement 內文而非只留在 design，因為它是使用者看得見的行為；日後若要改
成對角，那是規格變更而不是實作細節調整。

### Decision 5：目前回合存在期間，目標分數選擇器一律 disabled

`prd.md` 6.3.1 有兩句話：「目標分數為每輪設定，**於『產生本輪對戰』時決定**」與「該輪一旦有
場次**開始計分**即不可更改」。第二句蘊含「開始計分之前還能改」，但要落實它需要兩個本 change
拿不到的東西：

1. 「更新目前回合的 targetScore」這個 M4 的 mutation API——目前的跨 change 契約只說 targetScore
   是 Round 的欄位、在產生時決定，沒有承諾可事後修改。
2. 「開始計分」的判定——手動輸入路徑沒有「開始」這個中間態（只有未完成／已完成），真正的
   「開始計分」要等 M6 把場邊計分接上才有意義。

因此本 change 採**較嚴格**的一致做法：**有回合就鎖**。這不與 6.3.1 衝突（嚴格版是寬鬆版的子集，
不會出現「該改不能改」以外的錯誤），而且對使用者的心智模型更單純：目標分數屬於這一輪，換分制
就開下一輪。

替代方案（允許在無人開始計分前修改）被否決的理由如上：它會讓 M5 依賴兩個尚未定案的介面，
而其中一個（開始計分）在 M5 的功能範圍內根本不存在。M6 接上場邊計分後若要放寬，那是一次
明確的規格變更，另開 change 處理。

**代價與緩解**：鎖定狀態必須解釋自己。spec 因此要求選擇器 disabled 時同時顯示「本輪已鎖定」
的文字說明——`prd.md` 12.3 要求 disabled 狀態清楚，而「清楚」不只是視覺變淡，還要讓使用者
知道下一步該做什麼。

### Decision 6：重用 `lib/scoreboard/radio-navigation.ts`，不搬檔、不複製

目標分數選擇器的鍵盤模式與 `/scoreboard` 的完全相同（11／15／21、移動即選取、roving tabindex）。
三個選項：

| 方案 | 評估 |
|---|---|
| **直接 import `@/lib/scoreboard/radio-navigation`**（採用） | 一行 import，零風險 |
| 搬到 `lib/aria/radio-navigation.ts` 讓兩邊共用 | ❌ `scoreboard` spec **明文釘住**該路徑，搬檔即需 MODIFY scoreboard capability，把一個 UI change 擴散成三個 capability |
| 在 matchmaker 側複製一份 | ❌ 同一條 WAI-ARIA 規則兩份實作，其中一份改了另一份不會知道 |

跨 capability 資料夾 import 在本 repo 不是禁忌——`nextRadioIndex` 是不帶任何 scoreboard 語意的
索引計算（輸入是 `currentIndex`／`total`／`key`），它放在 `lib/scoreboard/` 只是歷史位置。
在註解中標明「此函式與 capability 無關，位置為歷史因素」即可，SHALL NOT 為了整齊而動到別的
capability 的規格。

`TARGET_SCORE_OPTIONS`（`[11, 15, 21]`）目前是 `ScoreboardSetup.tsx` 的私有常數。matchmaker 側
**不**去 import 它（那會讓 matchmaker 依賴 scoreboard 元件的內部實作），而是取用 M4 匯出的
回合層常數。兩份 `[11, 15, 21]` 並存是已知的重複，但它們分屬兩個 capability 的產品決策，
未來可以各自變動——這種重複是正確的。

### Decision 7：navbar 第 5 條連結的寬度預算，與換行時的退路

新增「對戰分配」後，390px 寬視口下的估算（`text-sm` = 14px，CJK 字寬約等於字級）：

```
logo 🏓                     約 20px
連結文字 15 字 x 14px       約 210px
連結水平內距 px-2 x 2 x 5   約  80px
連結間距 gap-0.5 x 4        約   8px
容器 px-4 x 2               約  32px
logo 與 nav 的 gap-3        約  12px
                            ─────────
                            約 362px  < 390px（餘裕約 28px）
```

餘裕約 28px（7%），比四連結時的約 90px 明顯變薄，且不同平台的字型度量會吃掉一部分。因此：

- 驗收 SHALL 以既有的 `navbar-rwd.spec.ts` 在 390px 下量測**高度是否與寬螢幕一致**（既有
  Scenario 已指出：真正的破口是換行，不是橫向溢出——header 是 flex 容器，`scrollWidth <=
  clientWidth` 恆成立，驗不出問題）。
- 若實測換行，**退路是縮短文案**（「對戰分配」→「對戰」，字數 15 → 13，餘裕回到約 56px），
  SHALL NOT 改為漢堡選單或橫向捲動——「不收合」是該 Requirement 的立場，不因多一條連結而放棄。

退路寫進 spec 的 MODIFIED 內文而非只留 design，因為它決定了實作者在紅燈時該往哪走；不寫的話
最省事的解法（收成漢堡選單）恰好是規格禁止的那個。

### Decision 8：色塊樣式用 inline style，不用 Tailwind class

色塊背景是使用者自訂的任意 hex 漸層，Tailwind class 只能表達預先定義的固定色階——這與
`PlayerCard.tsx` 既有的做法一致（該檔已用 `style={{ background: linear-gradient(...) }}`）。

完成場次的「半透明、低飽和」同樣走 inline style（`opacity` + `filter: saturate(...)`），數值抽為
`tile-style.ts` 的具名常數。理由是它必須與漸層在**同一個地方**決定：若不透明度用 Tailwind class
而漸層用 inline style，兩者的來源分家，日後調整完成場次的視覺要改兩個檔案，而且純函式測試只能
看到其中一半。

一個已知的副作用值得記錄：`PlayerCard.tsx` 的註解指出「次要文字不用 opacity，因為
`pickTextColor` 是針對完全不透明的文字算出的前景色，疊加透明度會讓實際對比低於計算值」。
完成場次整格降不透明度會踩到同一件事——但這是**刻意的**：已完成場次本來就要退到背景，
`prd.md` 6.5 明訂「以半透明、低飽和度樣式呈現」。緩解方式是完成場次的關鍵資訊（比分、勝方、
完成時間）顯示在色塊**外**的場次資訊列，不受減弱影響。

### Decision 9：對 M4 的依賴收斂在 `app/matchmaker/page.tsx` 一處

所有元件一律以 **props 接收資料與 callback**，不自己 import 回合 store：

```
app/matchmaker/page.tsx          ← 唯一 import M4 store 的檔案
  ├─ RoundControls  ({ settings, onSettingsChange, onGenerate, onReset, ... })
  ├─ MatchStage     ({ round, players, onSubmitScore })
  │    ├─ CourtCard ({ match, players, onSubmitScore, submitError })
  │    └─ RestingPanel ({ resting, hasActivePlayers })
  └─ EmptyStage     ({ hasActivePlayers, onGenerate })
```

好處有三：① M4 的匯出名稱若與預期不同，修改面積是一個檔案；② 元件的 integration 測試不需要
mock 任何 store，直接傳 props 即可（RTL 測試因此穩定且快）；③ 元件在 M6～M9 被重用時
（例如 M9 要把舞台畫到 canvas）不挾帶狀態依賴。

替代方案是讓每個元件各自呼叫 M4 的 hook。否決理由是它會讓每一支元件測試都要 mock 一次 store，
而那個 store 在本 change 撰寫時**還沒被合併**——等於把整批測試押在一個未定案的介面上。

### Decision 10：三層測試的分工與各自的守備範圍

| Tier | 對象 | 為什麼是這一層 |
|---|---|---|
| unit | `lib/matchmaker/` 五個純函式模組 | 決定性、無 DOM、毫秒級。所有「規則」都在這層被釘住 |
| integration | `RoundControls`／`CourtCard`／`RestingPanel` 三個元件（RTL + happy-dom） | 這三者的責任是 **wiring**：把 props 正確接到控制項、把 callback 正確送出、把錯誤訊息顯示在對的地方。這些在 unit 測不到（沒有 DOM），在 E2E 測太慢（每個 case 要跑五個 browser） |
| e2e | 路由、空白狀態、RWD 三斷點、鍵盤導覽、無障礙名稱、navbar | 需要真實排版引擎（boundingBox、換行、觸控尺寸）或跨頁導航的條目 |

「單打是不是真的長成兩個方塊、左右排列」刻意放 e2e 而非 unit：`stage-layout.ts` 只能保證
**推導出的 row／column 正確**，它保證不了 CSS 有沒有把 `aspect-square` 寫對。這條驗收要的是
「畫面上真的是方塊」，只有真實排版引擎能回答。

E2E 需要預先種入 roster 與 round 的 LocalStorage 資料。種入格式沿用既有
`player-roster.spec.ts` 的做法（`page.addInitScript` 寫 `matchmaker:roster:v1`），回合資料寫
`matchmaker:round:v1`。**這是本 change 對 M4 持久化格式最脆的一處耦合**，見 Risks。

## Risks / Trade-offs

- **[M4 的匯出名稱與 Round 形狀在本 change 撰寫時尚未定案]** → 緩解有三層：① 所有元件走 props，
  唯一的耦合點是 `app/matchmaker/page.tsx`（Decision 9）；② spec 一律以**行為**描述契約
  （「委派回合 capability 的送出 pipeline」）而非以函式名描述，因此 M4 換名不需要改規格；
  ③ apply 的 Step 0 在 worktree 建立後 MUST 先讀 `main` 上 M4 的實際匯出，把差異記進本檔的
  Open Questions 再開始寫程式。**SHALL NOT 在 M4 未合併的情況下憑猜測開工**——那會讓每個
  integration 測試都建立在錯的介面上。

- **[E2E 種入 `matchmaker:round:v1` 是對 M4 內部格式的硬耦合]** → 若 M4 日後改欄位，本 change
  的 E2E 會整批轉紅，且失敗訊息會指向 UI 而非真正的成因。緩解：E2E 的種資料 MUST 集中在單一個
  helper 函式並在該處註明「格式來源為 M4 的 `matchmaker:round:v1`，改動請同步」；能用 UI 操作
  產生的狀態（產生本輪、送出比分）**優先用 UI 操作**產生，只有無法用 UI 到達的狀態
  （例如「已完成的場次」需要先送出比分）才種資料。

- **[五條連結在 390px 換行]** → Decision 7 已備妥退路（縮短文案），且既有的
  `navbar-rwd.spec.ts` 高度比對是機械化的紅燈來源，不靠目視。真正的風險是**實作者看到紅燈時
  選錯解法**（改成漢堡選單），因此退路寫進 spec 內文而非只留 design。

- **[8 場地 x 雙打 = 32 個色塊，在手機上是很長的一頁]** → 接受。對戰頁明確不做零捲動
  （Non-Goals），且 8 場地是上限而非常態；`prd.md` 12.1 的規模是 8～40 人，實務上手機使用者
  多半只開 1～2 個場地。若日後成為真實抱怨，正解是場次摺疊或分頁，那是另一個 change。

- **[`aspect-square` 在極窄容器下讓色塊小到讀不出姓名]** → 390px 寬、單欄、雙打 2x2 時每格約
  170px 見方，容得下姓名（`truncate`）、性別與分數三行。緩解：色塊 MUST 設最小高度，且姓名沿用
  `PlayerCard` 既有的 `truncate` 處理；E2E 的手機斷點驗收同時檢查觸控目標 ≥44px，可順帶抓到
  色塊被壓扁的情況。

- **[完成場次降不透明度會削弱 `pickTextColor` 算出的對比]** → Decision 8 已說明這是刻意的
  （`prd.md` 6.5 明訂），並以「關鍵資訊顯示在色塊外」緩解。記錄於此是為了讓日後看到
  「這裡的對比比名單頁差」的人知道這是已知取捨，不必重查。

- **[integration 測試以 `vi.fn()` 假裝 M4 的 callback，測不出真正的串接]** → 這是分層的必然
  代價：`CourtCard` 的責任只到「用正確的參數呼叫傳進來的函式」為止。真正的端到端串接由 E2E
  的「產生本輪 → 送出比分 → 場次進入完成狀態」流程涵蓋，該流程走的是真的 M4 pipeline 與真的
  LocalStorage。兩層都要有，缺一則不是「整合過」。

- **[本 change 有 15 個 Requirement、51 個 Scenario，是目前最大的一個]** → 這是 `prd.md` 第 7 節
  加上 4.2／4.3／6.1／6.2／6.3／6.4.6／6.5／12.3／12.5 的合集，切小反而會讓「畫面能不能用」
  分散在多個 change 裡各驗一半。緩解是 tasks 依模組分群、群內 RED／GREEN 配對，且純函式群
  （§2～§6）彼此無相依，Implementer 可以在單一 worktree 內依序快速推進。

## Open Questions

1. **評分界限常數的來源？→ 已解決（記錄備查，非待決問題）。** `rating-bounds.ts` 需要
   1.00／8.00 的具名來源。M1 的 `types.ts` 只有 `z.number().min(1).max(8)` 的字面量，
   沒有匯出常數；**M3（`matchmaker-rating-engine`）的規格已定案**——其
   `specs/match-rating/spec.md`「評分更新公式與常數」明文寫「這兩個常數與評分上下限
   `1.00`／`8.00` SHALL 由本 capability 以**具名常數**匯出供消費端取用」，M3 的 design.md
   模組表與 tasks 1.1 進一步指名為 **`RATING_MIN`／`RATING_MAX`，由
   `nextjs-pickball/lib/matchmaker/rating-types.ts` 匯出**（同檔另有 `RATING_D`、
   `RATING_K_BASE`、`K_DECAY_GAMES`）。

   因此本 change **沒有待決事項**：§6 直接 `import { RATING_MIN, RATING_MAX } from
   "@/lib/matchmaker/rating-types"`。tasks 1.3 只需在合併後的 `main` 上確認**實際檔案路徑**
   （M3 若在 refactor 階段把常數併回 `rating.ts` 或改由 `rating.ts` 轉出，import 路徑要跟著調整），
   **不需要為此升級給人類**。仍然 **SHALL NOT** 在 `rating-bounds.ts` 內寫死 `1` 與 `8`
   （寫死等於在第三個地方複製同一組產品常數）。唯一的升級情形是「`main` 上**完全找不到**
   該匯出」——那代表 M3 的實作與其已定案的規格不符，屬 M3 的缺口，依 execution-plan
   的升級條件回報人類由 M3 補齊，不在本 change 自行造一份。

2. **M4 的 store 與 pipeline 實際簽章？** 依 M4（`matchmaker-round-lifecycle`）的 proposal，
   本 change 消費的是 `nextjs-pickball/hooks/useRoundStore.ts` 與其 Round schema
   （`lib/matchmaker/round-types.ts`），持久化 key 為 `matchmaker:round:v1` 與
   `matchmaker:history:v1`。本 change 預期需要：目前回合（含 `targetScore`、`matches`、
   `resting`）、產生本輪、重設未完成場次、送出某場次比分（回傳成功或帶繁中訊息的驗證失敗）。
   **未知的是各函式的確切名稱與回傳形狀**——apply Step 0 MUST 讀 `main` 上合併後的實際簽章
   並把差異補記於此，再開始 §7 之後的元件任務。

   附帶確認一件事：M4 明文會新增 `useRoundStore` 並同步 `pickleball-guide-page` 的 hooks
   歸屬清單。這正是 Decision 3 不在本 change 新增 hook 的理由——兩個並行 worktree 若都去改
   那一份清單，合併時衝突的會是規格文字。

   **→ 已於 apply Step 0（tasks 1.2～1.5）在 `main`（`bbda8ff`）上實測，結果如下。**

   **(a) 常數來源（tasks 1.3、1.4）——與假設一致，無待決事項。**
   `nextjs-pickball/lib/matchmaker/rating-types.ts` 確實匯出 `RATING_MIN = 1`／`RATING_MAX = 8`，
   路徑與 Open Questions 第 1 條的假設相同，§6 直接 import 即可。
   `nextjs-pickball/lib/matchmaker/round-types.ts` 已匯出**可迭代的** `TARGET_SCORE_OPTIONS`
   （由 `RoundTargetScoreSchema.options` 推導）與 `DEFAULT_TARGET_SCORE = 11`，
   tasks 1.4 所擔心的「只有型別沒有清單」並未發生，**不需要**回頭改 M4 的模組。

   **(b) 回合資料形狀——與 Decision 9 的假設相容，但隊伍不內嵌 `Player`。**
   `Round` 為 `{ roundNumber, createdAt, format, courtCount, targetScore, matches, restingPlayerIds,
   seenSignatures }`；`RoundMatch` 為 `{ id, courtNumber, format, doublesComposition?, teams:
   [RoundTeam, RoundTeam], status: "pending" | "scoring" | "completed", scores: { teamA, teamB } | null,
   winner: "teamA" | "teamB" | null, completedAt: string | null, playerRatings[] }`；
   `RoundTeam` 為 `{ playerIds: string[], rating: number }`。
   **持久化層刻意只存 id**（M4 註解：回合與名單同時活著，內嵌 `Player` 會產生兩個互相矛盾的
   真相）。因此 UI 的 `players` prop 不只是為了顯示，而是**解析 `playerIds` 的必要輸入**；
   `restingPlayerIds` 同樣是 `string[]`，`RestingPanel` 需要的姓名／顏色／`restCount`
   一律由頁面層以名單查表後傳入。這與 Decision 9 的 props 形狀（`MatchStage ({ round, players,
   onSubmitScore })`、`CourtCard ({ match, players, ... })`）相容，不需要改 Decision 9。

   **(c) `buildCourtTiles` 的輸入型別（影響 §4／§8 的接縫）——採結構型別。**
   test-plan 與 tasks 4.2 寫的是「以一場 `Match` 呼叫」，指 `allocation-types.ts` 的 `Match`
   （`teams[].players` 內嵌完整 `Player`）；但 §8 的 `CourtCard` 拿到的是 `RoundMatch`
   （`teams[].playerIds`）。把 `RoundMatch` 回填成完整 `Match` 需要偽造 `doublesComposition`
   （`RoundMatch` 為 optional、`Match` 的 doubles 分支為必填），是靜默補值。
   **決議**：`buildCourtTiles` 的參數型別放寬為「只要求 `format` 與 `teams[].players`」的結構型別，
   `allocation-types.ts` 的 `Match` 可直接指派（§4 的測試仍照 test-plan 傳入真正的 `Match`），
   §8 則傳入由 `playerIds` 解析後的隊伍。分支仍以 `format` 這個判別欄位進行。
   SHALL NOT 為此在 `stage-layout.ts` 之外另立一份 `RoundMatch → Match` 投影。

   **(d) `useRoundStore` 只接線了 `generateRound`——§11.6 需要擴充該檔。**
   合併後的 `hooks/useRoundStore.ts` 對外只回傳 `{ round, history, droppedCount, generateRound }`；
   `setTargetScore`／`resetIncompleteMatches`／`submitScore` 三個 pipeline 只以純函式存在於
   `lib/matchmaker/round.ts`，**尚未接上 store**（M4 經 Stage 1 裁決的刻意範圍，非遺漏）。
   tasks 11.6 要求「於 `page.tsx` 接上 M4 的產生／重排／送出 pipeline」，而回合狀態由 store 擁有，
   頁面無法從外部更新它。因此 **§11 MUST 擴充既有的 `hooks/useRoundStore.ts`**
   （新增 reducer action 與對外函式）。這**不違反 Decision 3**——Decision 3 禁止的是在 `hooks/`
   **新增檔案**（會動到 `pickleball-guide-page` 的 hooks 歸屬清單與 `hooksInventory.test.ts`），
   修改既有檔案不影響那份清單。
   連帶（M4 交接明文要求）：接 `submitScore` 時 MUST 一併補上 `round-storage.ts` 的 `writeHistory`
   歷史寫入路徑，並把 `playerPatches` 交給 roster port 的 `updatePlayer`；
   `submitScore` 的成功結果同時帶 `round`／`historyEntry`／`playerPatches`／`boundaryHits` 四項。

   **(e) 錯誤訊息已是繁體中文，UI 不需自譯。**
   `createRound`／`resetIncompleteMatches`／`validateScoreInput`／`submitScore` 皆回傳
   `{ ok: true, ... } | { ok: false, code, message }`，`message` 已是可直接顯示的繁體中文
   （例如「兩隊比分相同時無法判定勝方，請確認比分後再試一次。」）。UI 的責任只是把 `message`
   放進 `role="alert"`，SHALL NOT 依 `code` 另寫一份中文對照表。

   **(f) `ROUND_FAILURE_CODE` 的命名（M4 交接事項第 4 點）——本 change 不處理。**
   M4 建議 M5 接線前把它更名為 `CREATE_ROUND_FAILURE_CODE`（其餘四組皆以函式名命名，只有這組
   以模組命名）。本 change 的 tasks.md **沒有這一項**，依派工紀律不自行擴權更名，留待後續
   milestone 或整理型 change 處理。

   **(g) `/matchmaker` 目前確為 404（tasks 1.5）。**
   `nextjs-pickball/app/matchmaker/` 底下只有 `players/`，無 `page.tsx` 亦無 `layout.tsx`。
   `tests/e2e/specs/player-roster.spec.ts` 內查無「頁面頂部第一個元素」這類位置性斷言
   （grep `first()`／`nth(0)`／`heading`／`h1` 皆無命中），新增區段導覽不會使其轉紅。

3. **完成時間的顯示格式**：暫定 `HH:mm`（當地時區），與 `prd.md` 8.2 歷史紀錄的「對戰時間」
   同源。若 M7 的歷史頁決定用別的格式，兩處 SHALL 對齊——但那是 M7 的事，本 change 不預先
   為它抽共用格式化函式（沒有第二個消費者的抽象是負債）。

4. **桌面斷點的場次網格欄數**：暫定手機 1 欄、平板起 2 欄。8 場地時桌面是否要 3 欄，等實際看到
   畫面再定；此細節不寫進 spec（spec 只約束「場地內容與休息名單左右並排」），因此調整欄數
   不需要改規格。

5. **apply 階段的中途交接（2026-08-24，第一位 leader 乾淨停止）。**

   **停止理由**：不是脈絡耗盡，而是**單組實耗時間遠超預期**。§2、§3 兩個群組（合計 6 個 task，
   是本 change 最小的兩組）各花約 50～70 分鐘 wall clock，且**兩組的 Stage 2 都退回一次**。
   依此速率，剩下 9 組（含 §7、§8、§11 三個最大群組，合計超過 40 個 task）不可能在同一個
   session 內完成。依 apply 紀律在**派下一組之前**停止，未留下任何「已派工但無人審查」的狀態。

   **已完成並 commit 的群組**（分支 `change/matchmaker-match-stage-ui`）：

   | 群組 | 狀態 | commit |
   |---|---|---|
   | §1 前置確認 | 完成（本 Open Question 第 2 條的 (a)～(g) 即其產出） | `0a176d5` |
   | §2 section-nav.ts | 完成，Stage 1／2 皆 APPROVED | `ee70514` |
   | §3 round-settings.ts | 完成，Stage 1／2 皆 APPROVED | `4251a2a` |

   **未完成的群組**：§4 stage-layout、§5 tile-style、§6 rating-bounds、§7 RoundControls、
   §8 CourtCard／PlayerTile／ScoreEntry、§9 RestingPanel、§10 SiteNavbar 第 5 條連結、
   §11 頁面組裝與 E2E、§12 收尾驗證。**下一組是 §4。**

   **停止當下的驗證數字**（與 `bbda8ff` 的 baseline 逐項對照，無任何退步）：

   | 項目 | baseline | 現在 |
   |---|---|---|
   | `pnpm test` 前端 | 46 檔 / 358 測試 passed | **48 檔 / 364 測試 passed** |
   | `pnpm test` 後端 | 4 檔 / 16 測試 passed | 4 檔 / 16 測試 passed（未動） |
   | `pnpm -r exec tsc --noEmit` | exit 0 | exit 0 |
   | `pnpm --filter ./nextjs-pickball lint` | 0 errors / 3 warnings | 0 errors / 3 warnings（同一批既存 warning） |

   E2E 本次**完全未執行**（§10／§11 才會動到）；工作區乾淨，無殘留暫存檔，無殘留 dev server。

   **續作者必須知道的四件事**：

   1. **兩階段審查的 mutation 測試是目前唯一抓到真問題的手段，不可省略。**
      §2 的 Stage 2 做了 8 次 mutation、**3 次存活**（分頁順序對調、label 對調、多回傳一筆
      都測不出來，根因是測試只斷言 `active` 欄位）；§3 做了 16 次、**6 次存活**（旗標改用
      變動前的值、兩個旗標各自硬寫 `false`、上界改用 `MIN` 比、下界改用 `MAX` 比、丟棄
      `...settings` 展開，根因是測試從未斷言任何旗標為 `true`、也沒有「夾值前後不同」的案例）。
      兩次都由補斷言解決，補上的斷言**一律是實作後才寫的 regression guard**，已在 tasks.md
      如實標註。**請把「對本組關鍵斷言做 mutation 測試並回報存活數」寫進每一張 Stage 2 派工單。**

   2. **Implementer 用 `sonnet`，不要用 execution-plan 的預設 `haiku`。** 這是刻意偏離。
      兩組實測下來 sonnet 的產出品質足夠，被退回的都是「測試斷言不夠密」與「回傳形狀的設計
      取捨」這類需要判斷力的項目，不是低階錯誤。

   3. **先把 §2／§3 兩次 Stage 2 抓到的 repo 慣例寫進 Implementer 的派工單，可省一輪退回**：
      ① 單純物件形狀一律 `export interface` 且欄位標 `readonly`（`lib/matchmaker/` 有 18 個既有
      先例；`export type X = { ... }` 只用於字面量聯集、discriminated union 與 `z.infer` 衍生）；
      ② 註解引用 design 用短式「（design Decision N）」，SHALL NOT 寫 `openspec/changes/...`
      完整路徑（歸檔後失效），也 SHALL NOT 在程式碼註解裡寫「§7」這類 tasks 章節編號；
      ③ 註解只寫「為什麼」，不重述函式名、不在檔頭與 JSDoc 各寫一次同一句話；
      ④ 回傳「領域物件 + 衍生旗標」時採**巢狀**而非攤平——`round.ts` 的四組 Result 都是巢狀，
      攤平會讓型別結構相容領域物件而被 `useState` 靜默吞下衍生欄位。

   4. **§7 可以直接用 `courtCountBounds(courtCount)`**（§3 追加的具名匯出）取得初次渲染時
      加減按鈕的 disabled 狀態，不需要呼叫 `changeCourtCount(settings, 0)`，也 SHALL NOT 在
      元件內自己寫 `courtCount < MAX_COURT_COUNT`（那會讓邊界判定出現第二處）。

   **本次未觸及、仍待確認的既有事項**（非本次新增，一併記錄以免遺漏）：
   `app/matchmaker/players/page.tsx` 檔頭註解寫著「刻意不加進全站 navbar——功能尚不完整
   （有名單但還無法產生對戰），導覽整合待對戰畫面完成後與 site-navbar capability 一併處理」。
   §10 完成後這句話即過期。tasks.md 沒有列出這一項（12.7 只涵蓋 `nextjs-pickball/CLAUDE.md`），
   請續作者判斷要納入 §10 還是 §12，或明確決定不動。
