> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**：`app/**/page.tsx`、`app/**/layout.tsx` 與純呈現型元件屬本 workspace 的
> TDD 例外層（見 `nextjs-pickball/CLAUDE.md`），以 E2E 驗收；§11 的 E2E 紅燈多半來自
> 「路由還不存在」或「元素還沒渲染」，那是真紅燈。若某個測試加入後**立即全綠**，
> MUST 在該項後方誠實標註為 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 的 Open Questions 從假設
> 變成事實，避免 §7 之後整批建立在錯的介面上。

- [ ] 1.1 確認目前 cwd 為 environment.md 宣告的 worktree，且 baseline `pnpm test` 全綠；把 baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [ ] 1.2 讀 `main` 上 M4（`matchmaker-round-lifecycle`）的實際匯出——預期為 `nextjs-pickball/hooks/useRoundStore.ts` 與 `nextjs-pickball/lib/matchmaker/round-types.ts`：目前回合的型別與欄位、產生本輪／重設再排／送出比分三個 pipeline 的簽章與回傳形狀（成功與驗證失敗各長什麼樣）。與 design.md Decision 9 的假設逐項比對，**差異一律補記進 design.md 的 Open Questions 第 2 條**，不要默默改實作去遷就
- [ ] 1.3 確認評分 capability（M3，`matchmaker-rating-engine`）上下限具名常數的**實際檔案路徑**——名稱已定案為 `RATING_MIN`／`RATING_MAX`，預期由 `nextjs-pickball/lib/matchmaker/rating-types.ts` 匯出（M3 的 spec「評分更新公式與常數」已明訂該 capability 以具名常數匯出，design 與 tasks 1.1 指名此二者，見 design Open Questions 第 1 條的已解決記錄）。以 `grep -rn "RATING_MAX" nextjs-pickball/lib/matchmaker/` 確認路徑後記下供 §6 取用；**路徑不同**（例如 M3 改由 `rating.ts` 轉出）→ 直接調整 import 往下做，**不需升級**；**完全找不到該匯出** → 才依 execution-plan 的升級條件回報人類由 M3 補匯出。任何情況都 SHALL NOT 在 `rating-bounds.ts` 內寫死 `1` 與 `8`
- [ ] 1.4 確認 M4 是否匯出**可迭代的**目標分數選項清單（11／15／21）。M4 的 Round schema 已把 `targetScore` 定為 `11 | 15 | 21` 型別，但型別無法在執行期迭代出三顆按鈕；若只有型別沒有清單，MUST 於 M4 的 `round-types.ts` 補一個具名匯出再取用。SHALL NOT 從 `components/scoreboard/ScoreboardSetup.tsx` 的私有 `TARGET_SCORE_OPTIONS` 取用（那是 scoreboard 的內部實作，見 design Decision 6），也 SHALL NOT 在元件內寫死 `[11, 15, 21]`
- [ ] 1.5 確認 `/matchmaker` 目前確實為 404（本 change 開始前的事實基準），並檢查 `nextjs-pickball/tests/e2e/specs/player-roster.spec.ts` 有無「頁面頂部第一個元素」這類位置性斷言——`app/matchmaker/layout.tsx` 會替該頁加上區段導覽（design Decision 1 的副作用）

## 2. 區段導覽的分頁與 active 判定（section-nav.ts）

- [ ] 2.1 RED: 新增 `nextjs-pickball/lib/matchmaker/section-nav.test.ts`，寫入 it「目前路徑對應的分頁為 active，其餘分頁為非 active」：以 `"/matchmaker"` 與 `"/matchmaker/players"` 兩個輸入各斷言一次。跑單檔確認紅燈並貼出輸出
- [ ] 2.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/section-nav.ts` 的 `matchmakerSectionTabs(pathname)`：回傳兩筆分頁（「對戰」→ `/matchmaker`、「參賽者」→ `/matchmaker/players`），各帶 `label`、`href` 與 `active`
- [ ] 2.3 REFACTOR: 分頁清單抽為模組層級 `as const` 常數，`active` 判定只有一處；確認函式為純函式、不 import 任何 React 或 `next/navigation`

## 3. 本輪設定的預設值與場地數夾值（round-settings.ts）

- [ ] 3.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round-settings.test.ts`，寫入兩個 it：「預設為單打與 1 個場地且取用分配引擎匯出的常數」（斷言直接比對 import 進來的 `DEFAULT_FORMAT`／`DEFAULT_COURT_COUNT`，**不寫字面量**）、「場地數加減夾在 1～8 並回報是否已達邊界」（8 加一仍為 8 且 `canIncrement` 為 false；1 減一仍為 1 且 `canDecrement` 為 false；4 加一為 5、減一為 3）。確認紅燈
- [ ] 3.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/round-settings.ts`：`createRoundSettings()` 回傳 `{ format, courtCount, targetScore }`，`changeCourtCount(settings, delta)` 以 `MIN_COURT_COUNT`／`MAX_COURT_COUNT` 夾值並回報 `canIncrement`／`canDecrement`
- [ ] 3.3 REFACTOR: 確認四個常數皆來自 `allocation-types.ts` 的 import，本檔沒有任何 `"singles"`／`1`／`8` 字面量；目標分數的預設值來自 1.4 確認的 M4 常數

## 4. 色塊版面推導（stage-layout.ts）

- [ ] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/stage-layout.test.ts`，寫入三個 it：「單打回傳兩格且兩格同列左右相鄰分屬兩隊」、「雙打回傳四格並排成 2x2」、「雙打上排兩格為第一隊下排兩格為第二隊」。第三個 it 是 design Decision 4 的判準——「對角同隊」的錯誤實作同樣會通過第二個 it，必須有獨立的一條把它擋下。確認紅燈
- [ ] 4.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/stage-layout.ts` 的 `buildCourtTiles(match)`：依 `Match` 的 discriminated union 分支，單打回傳 2 格（同 `row`、`column` 為 0／1、`teamIndex` 為 0／1），雙打回傳 4 格（`row` 0 為第一隊兩人、`row` 1 為第二隊兩人）
- [ ] 4.3 REFACTOR: 確認單打與雙打共用同一個「由 `Team` 展開為 tile」的內部輔助函式，不各寫一份；回傳型別為純資料，不挾帶 React 節點

## 5. 色塊樣式推導（tile-style.ts）

- [ ] 5.1 RED: 新增 `nextjs-pickball/lib/matchmaker/tile-style.test.ts`，寫入兩個 it：「色塊背景為雙色漸層且前景取 pickTextColor 的結果」（斷言 `background` 同時含 `colorFrom` 與 `colorTo`，`color` 等於直接呼叫 `pickTextColor` 的回傳值——不硬寫顏色字串）、「已完成場次的色塊樣式降低不透明度與飽和度」（`completed: true` 相對 `false` 兩項皆較低，且 `false` 時不帶這兩項）。確認紅燈
- [ ] 5.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/tile-style.ts` 的 `playerTileStyle(player, options)`：回傳可直接展開到 `style` 的物件；漸層寫法比照既有 `components/matchmaker/PlayerCard.tsx`
- [ ] 5.3 REFACTOR: 完成場次的不透明度與飽和度抽為具名常數（不留裸數字），並在檔頭註解說明「為何走 inline style 而非 Tailwind class」與「降不透明度會削弱 `pickTextColor` 對比、但關鍵資訊顯示在色塊外」兩件事（design Decision 8）

## 6. 強度觸頂／觸底判定（rating-bounds.ts）

- [ ] 6.1 RED: 新增 `nextjs-pickball/lib/matchmaker/rating-bounds.test.ts`，寫入三個 it：「rating 為上限時判定為已達上限」、「rating 為下限時判定為已達下限」、「rating 介於上下限之間時不判定為觸界」（以 1.01、4.50、7.99 三個近界值，能抓到 `>=`／`>` 寫錯）。確認紅燈
- [ ] 6.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/rating-bounds.ts` 的 `ratingBoundState(rating)`：回傳觸頂／觸底／未觸界三態；上下限值取自 1.3 確認的來源
- [ ] 6.3 REFACTOR: 確認本檔沒有 `1`／`8` 字面量，且回傳為可辨識的具名值而非布林對（布林對會讓呼叫端寫出「兩個都 true」的不可能狀態）

## 7. RoundControls 元件

Depends on: §3

- [ ] 7.1 RED: 新增 `nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，寫入三個 it：「場地數為 1 時減號 disabled、為 8 時加號 disabled」、「對戰方式只提供單打與雙打且無性別限定模式選項」、「目標分數選項為 11／15／21 且預設選中 11」。確認紅燈（元件尚不存在，預期為模組解析失敗）
- [ ] 7.2 GREEN: 實作 `nextjs-pickball/components/matchmaker/RoundControls.tsx` 的設定區：對戰方式、場地數加減（`aria-label` 明確）、目標分數 radiogroup（`role="radiogroup"` + 三顆 `role="radio"`，鍵盤索引重用 `@/lib/scoreboard/radio-navigation` 的 `nextRadioIndex`，見 design Decision 6）。所有資料與 callback 走 props，SHALL NOT 在元件內 import 任何 store
- [ ] 7.3 RED: 補兩個 it：「目前回合存在時目標分數選擇器 disabled 並顯示已鎖定說明」、「按下產生本輪對戰會以目前設定呼叫回合產生函式一次」。確認紅燈
- [ ] 7.4 GREEN: 補齊：有回合即鎖定目標分數（design Decision 5 的嚴格版）並顯示「本輪已鎖定」文字；「產生本輪對戰」按鈕以目前 `format`／`courtCount`／`targetScore` 呼叫 `onGenerate`
- [ ] 7.5 RED: 補三個 it：「可出場人數不足一場時產生按鈕 disabled 並顯示繁體中文原因」、「無目前回合或場次全部完成時不顯示重設再排入口」、「目前回合仍有未完成場次時顯示重設再排入口並委派回合 capability」。確認紅燈
- [ ] 7.6 GREEN: 補齊：人數不足時 disabled 並顯示含「每場所需人數」與「目前可出場人數」的繁體中文說明；重設／再排入口的顯示條件為「回合存在 **AND** 至少一場未完成」兩個條件同時成立
- [ ] 7.7 REFACTOR: 確認「每場人數」取自 `PLAYERS_PER_MATCH` 而非寫死 2／4；確認元件內沒有任何分配或評分計算；確認 disabled 一律以 `disabled` 屬性表達而非只調樣式

## 8. CourtCard 與 PlayerTile／ScoreEntry

Depends on: §4, §5, §6

- [ ] 8.1 RED: 新增 `nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，寫入三個 it：「每個色塊顯示姓名、性別與強度分數」、「雙打場次顯示男雙女雙混雙或一般雙打的組成標示」（四個分支各斷言一次）、「場地與隊伍皆有文字標籤使色彩不是唯一資訊來源」。確認紅燈
- [ ] 8.2 GREEN: 實作 `CourtCard.tsx` 與 `PlayerTile.tsx`：色塊網格由 `buildCourtTiles` 推導（§4）、樣式由 `playerTileStyle` 推導（§5）、格子為 `aspect-square` 並設最小高度（design Risks）；場地標題與隊伍標籤為可讀文字
- [ ] 8.3 RED: 補三個 it：「比分欄位為 inputMode numeric 並標示所屬隊伍」、「送出比分會以場次識別與兩隊分數呼叫回合送出函式一次」、「送出失敗時於該場次以 role alert 顯示繁體中文錯誤訊息」。確認紅燈
- [ ] 8.4 GREEN: 實作 `ScoreEntry.tsx`：兩個 `inputMode="numeric"` 欄位（各有指出隊伍的可存取名稱）與送出鈕；送出呼叫 props 傳入的 `onSubmitScore`；驗證失敗訊息由 props 傳入並以 `role="alert"` 呈現。**SHALL NOT 在此複製任何比分驗證規則**（空白／非數字／平局／已完成皆屬 M4）
- [ ] 8.5 RED: 補三個 it：「已完成場次的比分欄位與送出按鈕皆為 disabled」、「已完成場次顯示最終比分勝方與完成時間」、「勝方以文字標籤標示而非僅以顏色區分」。確認紅燈
- [ ] 8.6 GREEN: 補齊完成場次呈現：色塊套 `playerTileStyle(..., { completed: true })`；場次資訊列顯示最終比分、勝方文字標籤與 `HH:mm` 完成時間（design Open Questions 第 3 條）；欄位與送出鈕 `disabled`
- [ ] 8.7 RED: 補 it「色塊在觸頂或觸底時顯示已達上限或已達下限標示」：場次含 `rating` 8.00 與 1.00 兩人，分別斷言「已達上限」「已達下限」文字。確認紅燈
- [ ] 8.8 GREEN: 於 `PlayerTile` 接上 `ratingBoundState`（§6），以文字（可搭配圖示）標示，比照既有 `PlayerCard.tsx` 的「暫停出場」Badge 做法——不倚賴顏色辨識
- [ ] 8.9 REFACTOR: 確認 `CourtCard` 只做組裝，版面／樣式／觸界三項推導全在 `lib/` 的純函式；確認單打與雙打共用同一個 `PlayerTile`，沒有為雙打另寫一份

## 9. RestingPanel 元件

- [ ] 9.1 RED: 新增 `nextjs-pickball/components/matchmaker/RestingPanel.test.tsx`，寫入兩個 it：「休息名單顯示姓名顏色標記與累計休息次數」、「休息名單為空時區分本輪全員出場與全員暫停出場兩種文案」（兩段文案 MUST 不相等——分配引擎不把暫停者列入休息名單，兩種情況的資料完全相同，只有這條測試能分辨）。確認紅燈
- [ ] 9.2 GREEN: 實作 `RestingPanel.tsx`：每筆顯示姓名、帶該員漸層的顏色標記與「休息 N 次」；空狀態依 `hasActivePlayers` 分流為兩段文案
- [ ] 9.3 REFACTOR: 顏色標記重用 `playerTileStyle`（§5）而非另寫一份漸層字串；確認元件不含任何排序或篩選邏輯（休息名單的內容由分配引擎決定）

## 10. SiteNavbar 新增第 5 條連結

- [ ] 10.1 RED: 於既有 `nextjs-pickball/components/layout/SiteNavbar.test.tsx` 補兩個 it：「Navbar 顯示對戰分配連結且指向 /matchmaker」、「路由為 /matchmaker 時對戰分配連結套用 active 樣式」（沿用該檔既有的 `vi.mock("next/navigation")` 模式）。確認紅燈
- [ ] 10.2 GREEN: 於 `SiteNavbar.tsx` 的 `NAV_LINKS` 加入 `{ href: "/matchmaker", label: "對戰分配" }`；`transitionTypes` 沿用既有規則（非 `/` 一律 `nav-forward`）
- [ ] 10.3 RED: 於 `nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts` **新增**一個 test「窄螢幕下對戰分配連結亦全部可見」（390px 下第 5 條連結 visible 且不換行）。**既有 test「窄螢幕下四個導航連結全部可見」原樣保留不改名**——openspec 的 MODIFIED 是整段取代語意，改 Scenario 標題會被 `validate --strict` 判為刪除既有 Scenario（spec 內已註明）。跑 E2E 確認紅燈；若順序上 10.2 已完成使新 test 立即全綠，此步為 regression guard，MUST 在此如實標註，SHALL NOT 偽造紅燈
- [ ] 10.4 GREEN: 確認 390px 下 logo 與五個連結皆不換行（既有 test「窄螢幕下 logo 與導航連結皆不換行」為紅燈來源）。**若換行**：依 design Decision 7 的退路把連結文案由「對戰分配」縮短為「對戰」，並同步更新 10.1 的 it 斷言與 spec 的 MODIFIED 內文；**SHALL NOT 改為漢堡選單或橫向捲動**
- [ ] 10.5 REFACTOR: 確認 `NAV_LINKS` 仍只含公開內容路由（`/health` 未被順手加入）；逐項確認四個既有 navbar E2E test 仍綠——「窄螢幕下 logo 與導航連結皆不換行」、「窄螢幕下四個導航連結全部可見」、「寬螢幕顯示 logo 文字，窄螢幕收合只留圖示」、「窄螢幕下導航列內容不橫向溢出」（後兩者本 change 不改動，屬既有 regression guard，在此列名以免收尾時漏跑）

## 11. 頁面組裝與 E2E

Depends on: §2, §3, §4, §5, §6, §7, §8, §9, §10

- [ ] 11.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，寫入三個 test：「對戰頁可經 /matchmaker 開啟並顯示場次舞台」、「區段導覽可在對戰頁與參賽者名單頁之間來回切換」、「從首頁點擊 Navbar 的對戰分配連結進入對戰頁」。確認紅燈（`/matchmaker` 目前為 404，見 1.5）
- [ ] 11.2 GREEN: 新增 `app/matchmaker/layout.tsx`（掛 `MatchmakerTabs`，分頁資料來自 §2 的 `matchmakerSectionTabs`，目前分頁帶 `aria-current="page"`）與 `app/matchmaker/page.tsx` 骨架（`"use client"`，此檔為**唯一** import M4 store 之處，design Decision 9）
- [ ] 11.3 RED: 補三個 test：「有可出場參賽者但尚無回合時顯示空白球場與建立第一輪入口」、「名單為空時空白狀態提供前往參賽者名單的入口」、「空白狀態不顯示任何球員色塊或比分欄位」。種入 `matchmaker:roster:v1` 的方式沿用既有 `player-roster.spec.ts` 的 `addInitScript`。確認紅燈
- [ ] 11.4 GREEN: 實作 `EmptyStage.tsx` 並於 `page.tsx` 依「有無回合」與「有無可出場參賽者」兩個條件分流入口
- [ ] 11.5 RED: 補兩個 test：「單打場地為兩個接近正方形的色塊且左右排列」（量測 boundingBox 寬高比 0.85～1.15、垂直中心相同）、「完成一輪：產生本輪對戰後手動輸入比分並送出使場次進入完成狀態」（全程走 UI，不種回合資料）。確認紅燈
- [ ] 11.6 GREEN: 實作 `MatchStage.tsx`（場次網格 + 休息名單）並於 `page.tsx` 接上 M4 的產生／重排／送出 pipeline；種資料 helper 集中一處並註明「格式來源為 M4 的 `matchmaker:round:v1`，改動請同步」（design Risks）
- [ ] 11.7 RED: 補三個 test：「桌面斷點場地內容與休息名單左右並排」、「平板斷點休息名單移至場地內容下方」、「手機斷點觸控目標不小於 44px 且不橫向溢出」。確認紅燈
- [ ] 11.8 GREEN: 實作 RWD 三斷點版面：桌面 `lg` 起左右並排、平板單欄且休息名單下移、手機單欄；比分欄位與按鈕的觸控目標 ≥44px
- [ ] 11.9 RED: 補三個 test：「目標分數 radiogroup 支援方向鍵導覽與 roving tabindex」、「主要按鈕可由鍵盤聚焦並顯示 focus 樣式，停用者帶 disabled 屬性」、「對戰頁所有互動控制皆具備可存取名稱」。確認紅燈
- [ ] 11.10 GREEN: 補齊無障礙缺口：圖示按鈕補 `aria-label`、focus 樣式可見、disabled 以屬性表達
- [ ] 11.11 REFACTOR: 以 `grep` **機械確認**（不靠印象）—— ① 對 M4 store 的 import 只出現在 `app/matchmaker/page.tsx`；② `git diff --stat` 顯示 `hooks/` 目錄零新增檔案（design Decision 3）；③ 元件的 props 命名一致（一律 `onXxx`）

## 12. 收尾驗證

- [ ] 12.1 逐條核對兩份 delta spec 的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**
- [ ] 12.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 與 `--run components/matchmaker/` 全綠，貼出輸出
- [ ] 12.3 `pnpm lint` 通過（0 errors；既有 warning 清單見前一個 change 的紀錄，本 change 不得新增）
- [ ] 12.4 `pnpm typecheck` 通過
- [ ] 12.5 `pnpm test` 全套通過（確認未破壞 M1～M4 既有測試與 hono-pickball 後端測試）
- [ ] 12.6 `pnpm --filter ./nextjs-pickball test:e2e` 全套通過，**五個 browser project 皆跑**（`mobile-safari` 的預設 viewport 最矮，是最容易破的一個）
- [ ] 12.7 同步 `nextjs-pickball/CLAUDE.md` 的架構總覽：新增 `/matchmaker` 路由說明，並移除「對戰分配引擎已完成但尚未接 UI，等後續對戰畫面 milestone」這句已過期的敘述
- [ ] 12.8 `DO_NOT_TRACK=1 openspec validate matchmaker-match-stage-ui --strict` 通過
- [ ] 12.9 spec 條目重複檢查（依 root `CLAUDE.md` 指定的 python 計數法，**不使用 BSD `uniq`**——它會把內容不同的中文標題誤判為重複）
