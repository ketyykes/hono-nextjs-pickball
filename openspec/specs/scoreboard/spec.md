## Purpose

定義匹克球計分板功能（`/scoreboard`）的完整規格，包含計分規則、Undo 機制、持久化、RWD 排版、專注模式、視覺回饋 Toast 與版面穩定性。

本頁為場邊實際計分用的工具頁：使用者多半以手機橫放、在比賽空檔快速連點操作。
因此除了 2026 USA Pickleball Traditional（side-out）規則的正確性之外，
誤觸防護（版面穩定、重置二次確認）、狀態不遺失（localStorage 持久化）
與賽前設定的階段鎖定，同樣視為功能需求而非體驗優化。
## Requirements
### Requirement: 計分規則 — Traditional Side-Out

系統 SHALL 依 2026 USA Pickleball 官方 Traditional（side-out）規則計分：僅發球方可得分；比賽到**使用者設定的目標分數**（`targetScore`，可選 11／15／21，預設 11），需贏 2 分（延長賽持續到差距 ≥ 2）。三種分制的延長賽規則一致，且 SHALL NOT 設定分數上限（cap）—— 官方規則的 11／15／21 分制皆為 win by 2 且無 cap。

勝利判定 `isGameWon(scores, targetScore)` 的第二個參數 MUST 為必填，SHALL NOT 提供預設值 —— 給定預設值會讓任何漏傳的呼叫點靜默退回 11 分制，且既有測試會直接通過而失去 TDD 紅燈。

實作位於 `nextjs-pickball/lib/scoreboard/rules.ts` 與 `nextjs-pickball/lib/scoreboard/reducer.ts`；驗收錨點為 `nextjs-pickball/lib/scoreboard/rules.test.ts` 與 `nextjs-pickball/lib/scoreboard/reducer.test.ts`。

#### Scenario: 發球方得分

- **WHEN** 使用者按下「贏這球+」且當前發球方與按鈕對應隊伍相同
- **THEN** 該隊分數 +1，發球權不變，`history` push 一筆 RALLY_WON
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「發球方贏 → 該方 +1，發球權不變」

#### Scenario: 接發方贏球 — 單打 side-out

- **WHEN** 單打模式，使用者按下接發方的「贏這球+」
- **THEN** 分數不變，發球權移交給接發方（side-out）
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「接發方贏 → side-out，雙方分數不變」

#### Scenario: 接發方贏球 — 雙打 server #1 失球

- **WHEN** 雙打，目前發球員為 #1，接發方贏球
- **THEN** 發球權不轉移，同隊改由 #2 接手發球（serverNumber 1→2）
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「發球方 #1 輸 → 同隊 #2 接手」

#### Scenario: 接發方贏球 — 雙打 server #2 失球

- **WHEN** 雙打，目前發球員為 #2，接發方贏球
- **THEN** side-out，對方獲得發球權，serverNumber 重置為 1
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「發球方 #2 輸 → side-out 給對方，serverNumber 重置為 1」

#### Scenario: 0-0-2 起手規則

- **WHEN** 雙打比賽開始（isFirstServiceOfGame=true，serverNumber=2），開賽方失球
- **THEN** 直接 side-out，不給該隊 #1 機會（isFirstServiceOfGame 變 false）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「預設為雙打、我方先發、0-0-2 起手」

#### Scenario: 發球位置推導

- **GIVEN** 發球方當局得分為 N
- **WHEN** 顯示發球指示
- **THEN** N 為偶數 → 從右場發（right）；N 為奇數 → 從左場發（left）
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「發球方分數偶數時從右場發」與「發球方分數奇數時從左場發」

#### Scenario: 首球由 setup 轉入 playing

- **WHEN** `status === "setup"` 時發生第一次 RALLY_WON
- **THEN** `status` 變 `"playing"` 並記錄第一筆 history
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「首次 RALLY_WON 從 setup → playing 並記錄 history」

#### Scenario: 勝利條件

- **WHEN** 任一方分數 ≥ `targetScore` 且差距 ≥ 2
- **THEN** `status` 變 `"finished"`，GameOverDialog 自動開啟顯示勝方與比分
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「達到勝利條件時 → status=finished, winner 設定」

#### Scenario: 15 分制與 21 分制的勝利判定

- **GIVEN** `targetScore` 為 15 或 21
- **WHEN** 呼叫 `isGameWon({ us, them }, targetScore)`
- **THEN** 15 分制下 `{us:15, them:13}` → 我方勝、`{us:15, them:14}` → 未勝（延長）、`{us:16, them:14}` → 我方勝；21 分制下 `{us:21, them:19}` → 我方勝、`{us:21, them:20}` → 未勝
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「15 分制：達 15 且差距 ≥ 2 → 勝，差距 1 → 延長」與「21 分制：達 21 且差距 ≥ 2 → 勝，差距 1 → 延長」

#### Scenario: 未達目標分數不判勝

- **GIVEN** `targetScore` 為 15
- **WHEN** 比分達到 11-0
- **THEN** `isGameWon` 回傳未勝，`status` 維持 `"playing"`，GameOverDialog 不開啟
- **驗收**：`nextjs-pickball/lib/scoreboard/rules.test.ts`，it 名稱「15 分制：11-0 尚未達標 → 未贏」；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「15 分制下連贏 11 球不觸發 GameOverDialog」

#### Scenario: 結束後不再接受計分

- **WHEN** `status === "finished"` 時再 dispatch RALLY_WON
- **THEN** state 不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「finished 後 RALLY_WON 被 ignore」

---

### Requirement: Undo 機制

系統 SHALL 提供 Undo 以撤銷上一分，且 MUST 以「重建初始 state 後 replay `history.slice(0,-1)`」實作，SHALL NOT 使用反向運算 —— 因為 side-out 與 serverNumber 的轉移不可逆推。

`history` 為空時 Undo 按鈕 MUST 停用。實作位於 `nextjs-pickball/lib/scoreboard/reducer.ts` 與 `nextjs-pickball/components/scoreboard/ActionBar.tsx`。

#### Scenario: Undo 上一分

- **WHEN** 使用者按下「Undo」且 history.length > 0
- **THEN** 以 `createInitialState({mode, firstServer})` 重建初始 state，replay `history.slice(0,-1)` 還原上一步
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 後 state 等於少做一次 RALLY_WON 的結果」

#### Scenario: Undo 後回到開賽狀態

- **WHEN** 使用者按下「Undo」且 history.length === 1（只打過一球）
- **THEN** 分數回到 0-0，status 回到 `"setup"`，Undo 按鈕停用
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 退到開賽時 status 回到 setup」

#### Scenario: 空 history 不能 Undo

- **WHEN** history.length === 0
- **THEN** state 不變；Undo 按鈕以原生 `disabled` 屬性停用（`ActionBar.tsx` 的 `disabled={!canUndo}`，非 `aria-disabled`）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「空 history 時 UNDO 不變 state」

---

### Requirement: localStorage 持久化

系統 SHALL 於每次 state 變更後將計分狀態寫入 `localStorage["scoreboard:current:v1"]`，並 SHALL 於頁面 mount 後還原。寫入前與讀取後 MUST 經 zod schema 驗證；驗證失敗 MUST 清除該 key 並以 `createInitialState()` 起手，SHALL NOT 讓損壞資料使頁面崩潰。

**向後相容策略**：往 `ScoreboardStateSchema` 新增欄位時 MUST 以 zod `.default()` 提供預設值，使既有的 v1 資料在缺少該欄位時被補值而非判定為損壞；SHALL NOT 因新增欄位而 bump storage key —— 兩種做法都會讓已在進行中的比賽在使用者重整頁面時分數歸零，而「清除損壞資料」的既有機制會讓這件事**靜默發生**（`safeParse` 失敗 → `removeItem` → 回 null → 以初始 state 起手），使用者只會看到分數消失，沒有任何錯誤提示。

實作位於 `nextjs-pickball/lib/scoreboard/storage.ts`，驗收錨點為 `nextjs-pickball/lib/scoreboard/storage.test.ts`。

#### Scenario: 分數自動保存

- **WHEN** 使用者更新分數（dispatch RALLY_WON / UNDO / RESET）
- **THEN** 當前 state 寫入 `localStorage["scoreboard:current:v1"]`（zod 驗證後序列化），保存內容含分數、發球狀態、history、`mode`、`firstServer`（起手方設定，UNDO replay 必要）與 `targetScore`
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「write 後 read 可取回相同 state」

#### Scenario: 頁面重整回復

- **WHEN** 使用者重整頁面，localStorage 有合法的 state
- **THEN** 頁面 mount 後 dispatch HYDRATE，恢復分數、發球狀態與目標分數
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「localStorage 持久化：reload 後分數保留」

#### Scenario: 舊版資料缺少 targetScore 時補預設值

- **GIVEN** `localStorage["scoreboard:current:v1"]` 存有本次變更前寫入的資料（不含 `targetScore` 欄位）且其餘欄位合法
- **WHEN** 呼叫 `readScoreboard()`
- **THEN** 回傳的 state 之 `targetScore` 為 `11`，該 key SHALL NOT 被清除，比賽的分數與 history 完整保留
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「舊版資料缺 targetScore 時補為 11 且不清除 key」

#### Scenario: 損壞資料 fallback

- **WHEN** localStorage 資料無法通過 zod schema 驗證
- **THEN** 清除 key，以 `createInitialState()` 起手，console.warn 記錄錯誤
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「資料為非 JSON 時 read 回 null 並清 key，且 warn」與「資料 schema 不合法時 read 回 null 並清 key，且 warn」

---

### Requirement: RWD 排版

系統 SHALL 依 `(orientation: landscape)` 切換兩種排版：橫式時兩隊面板左右並排，直式時上下排並顯示「建議橫向使用」提示橫幅。該橫幅 MUST 可關閉，且關閉狀態 MUST 存於 `sessionStorage`（分頁存活期間有效），SHALL NOT 使用 localStorage —— 換裝置方向的偏好不應跨分頁持久保留。

版面 SHALL 鎖定於視口高度且零垂直捲動：外層容器 MUST 使用 `h-dvh` + `overflow-hidden`（SHALL NOT 使用 `min-h-screen`／100vh —— 行動瀏覽器工具列展開時 100vh 大於可視高度），flex 鏈 MUST 補 `min-h-0` 使子項可收縮。手機直向、手機橫向、平板直向與桌機（含 1024x600 臨界尺寸）MUST 滿足 `scrollHeight <= clientHeight + 1`（容許 1px 次像素誤差），且「贏這球+」與 Undo／重置按鈕的 boundingBox MUST 完整落在 viewport 內（水平與垂直兩軸皆須檢查） —— `overflow-hidden` 使排版錯誤的失敗模式從「可捲動」變成「內容被裁切」，此驗收是唯一防線。

設定列（`ScoreboardSetup`）在窄視口下 MAY 折行為多列：三個控制項加上專注模式按鈕於 390px 寬視口無法單列容納，此折行為**預期行為而非缺陷**（實測折行後設定列約 115px，單列時約 60px）。折行後設定列高度增加，MUST 由多 viewport 零捲動驗收確認分數面板仍完整可見；SHALL NOT 為避免折行而縮減控制項尺寸或控制項間距 —— 縮減設定列容器自身的上下 padding 不在此限。

面板內的**所有**流體尺寸（分數字級、`gap`、`padding`）MUST 以同一基準收斂，即容器查詢單位（cqh/cqw）而非 `dvh`：`dvh` 反映整個視口高度，不會隨設定列折行擠壓掉的面板可用高度而縮小，與會縮小的分數字級步調不一致，內容總高度將超出面板實際可用高度。`justify-content: center` 在無 `safe` 關鍵字時會向頭尾**對稱溢出**，使相鄰面板在分隔線處互相重疊。

由於容器查詢單位在容器**自身**查不到自己（規格上會 fallback 回視口），`gap`／`padding` MUST 掛在 `@container-size` 容器的**內層 wrapper** 而非容器自身。容器自身 MUST 加 `overflow-hidden` 作為次像素殘差的最後防線，使溢出裁切在自己格內而不侵犯相鄰面板的可點擊區域。

**支援範圍下限為 390px 寬**（下方 Scenario 列出的四個 viewport 之最小寬度）。實測 320x568（初代 iPhone SE 尺寸）下名稱行會溢出面板頂部約 0.83px 並被裁切；該尺寸不在支援清單內，**此為已知且接受的限制**。成因是固定尺寸元素（名稱行 + 分數 + 發球指示 + 按鈕）的總高超出面板可用高度，屬結構性問題，SHALL NOT 以調整 `gap`／`padding` 係數嘗試補救 —— 真要支援 390px 以下需重新設計面板組成（例如在極矮面板隱藏發球指示文字），應另案提出。

分數字級 SHALL 隨面板實際可用高度流體縮放：每個 TeamPanel MUST 為 size container（`@container-size`，需 tailwindcss >= 4.3），分數字級 MUST 以容器查詢單位（cqh/cqw）搭配 `clamp()` 表達，`gap`／`padding` 同步流體化；SHALL NOT 以寬度斷點決定字級（如 `md:text-[14rem]` —— 平板直向與橫向手機以寬度誤中大字級正是溢出根因）。

上述禁令**僅及於字級**。`gap`／`padding` MAY 以 orientation 疊加寬度斷點分流密度：直向兩面板垂直對切、橫向並排，同一 cqh 係數在兩種形態下的「面板高度佔比」需求相差近兩倍（平板直向約 5.15%、桌機橫向約 2.83%），單一線性係數只能擇一。分流條件 MUST 精確到不牽動其他形態（實作採 `portrait:md:`，只命中「直向且寬 ≥768px」，手機直向與橫向手機皆不受影響）。字級 SHALL NOT 比照辦理 —— 字級已用 `min(37cqh,38cqw)` 讓兩種形態共用同一組平滑曲線，重新引入斷點正是先前的溢出根因。

實作位於 `nextjs-pickball/hooks/useOrientation.ts` 與 `nextjs-pickball/components/scoreboard/`。

#### Scenario: 橫式排版（landscape）

- **WHEN** `window.matchMedia("(orientation: landscape)").matches === true`
- **THEN** 兩隊面板左右並排（flex-row），分數大字，發球指示顯示
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「橫式 viewport 兩隊面板左右並排」

#### Scenario: 直式排版（portrait）

- **WHEN** `window.matchMedia("(orientation: landscape)").matches === false`
- **THEN** 兩隊面板上下排（flex-col），上方顯示「建議橫向使用」提示橫幅
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「直式 viewport 顯示「💡 建議橫向使用」提示橫幅」

#### Scenario: 提示橫幅可關閉

- **WHEN** 使用者按下提示橫幅的 ✕ 關閉按鈕
- **THEN** 橫幅消失，`sessionStorage["scoreboard:hint-dismissed"]` 設為 "1"；分頁存活期間不再顯示
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「直式提示橫幅可關閉並記入 sessionStorage」

#### Scenario: 多 viewport 零捲動

- **GIVEN** viewport 為 390x844（手機直向）、844x390（手機橫向）、768x1024（平板直向）或 1024x600（桌機臨界）之一
- **WHEN** 開啟 `/scoreboard`
- **THEN** `document.scrollingElement.scrollHeight <= clientHeight + 1`（容許次像素誤差），且「贏這球+」（兩顆）與「撤銷上一分」「重置比賽」按鈕的 boundingBox 完整落在 viewport 內
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」

#### Scenario: 設定列折行不破壞零捲動

- **GIVEN** viewport 為 390x844（手機直向），設定列因三個控制項而折為兩列
- **WHEN** 開啟 `/scoreboard`
- **THEN** 仍滿足零捲動驗收，且兩顆「贏這球+」與 Undo／重置按鈕的 boundingBox 完整落在 viewport 內
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」（既有 test 涵蓋，本情境為其在三控制項下的再確認）

#### Scenario: 核心按鈕不得被其他元素遮蔽

- **GIVEN** 任一支援的 viewport，**特別是高度最受限者**（Playwright `mobile-safari` project 的預設 viewport 為 390x664，是五個 project 中最矮；`mobile-chrome` 為 390x727）
- **WHEN** 點擊「贏這球+」、Undo 或重置按鈕
- **THEN** 點擊 MUST 實際命中目標按鈕，SHALL NOT 被隊伍面板名稱行或其他元素的 subtree 攔截
- **理由**：boundingBox 落在 viewport 內**不等於**可點擊 —— 兩個元素可以各自都在 viewport 內卻互相重疊。本 change 曾因設定列折行增高使 TeamPanel 內容溢出自身 box 約 10px、在分隔線處與相鄰面板碰頭，當時「多 viewport 零捲動」驗收全數通過卻仍無法點擊按鈕，即為此缺口的實例
- **與瀏覽器引擎無關**：同一組 390x664 尺寸下，webkit 與 chromium 引擎量測到的 `panelRect`／`buttonRect` 數值完全相同。`mobile-safari` 之所以是唯一失敗的 project，純粹因其預設 viewport 比 `mobile-chrome` 矮 63px，headroom 不足以吸收折行擠壓。驗收 SHALL NOT 僅跑高度較寬裕的 project 就宣告通過
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts` 的既有互動測試（Undo、重置二次確認、localStorage 持久化、連贏觸發 GameOverDialog）在 `--project=mobile-safari` 下 MUST 全數通過；Playwright 的 `subtree intercepts pointer events` 錯誤即為此情境失效的訊號

#### Scenario: 面板內容須保留邊界安全餘量

- **GIVEN** viewport 為 390x664（`mobile-safari` project 的預設尺寸，五個 project 中最矮）
- **WHEN** 量測兩個 TeamPanel 的 boundingBox 與其內容（名稱行、「贏這球+」按鈕）的 boundingBox
- **THEN** 內容距面板頂部與底部的餘量 MUST ≥ 4px
- **理由**：「有沒有重疊」是布林判定，餘量被壓到 0.94px 時它仍然回答「沒有」。本 change 曾一度處於這個狀態 —— 全部驗收皆綠，但任何 label 文案加長、按鈕 padding 微調或平台字型 hinting 差異都會使版面重新破裂，且因面板帶 `overflow-hidden` 而表現為靜默裁切。量化餘量使「防護正在變薄」本身成為可偵測的事件，SHALL NOT 僅以「目前沒有重疊」作為通過條件
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「面板內容不得貼齊邊界：底部餘量須保留安全值」。該 test MUST 自行 `setViewportSize(390, 664)` 而非依賴 project 預設值，使五個引擎都在已知最脆弱尺寸下受驗

#### Scenario: 分數字級隨面板高度縮放而非寬度斷點

- **GIVEN** TeamPanel 的可用高度因 orientation 切換、提示橫幅顯示／關閉而改變
- **WHEN** 檢視分數數字的字級來源
- **THEN** TeamPanel 根節點帶 `@container-size`，分數字級以 cqh/cqw + `clamp()` 表達；程式碼中不存在以寬度斷點（`md:` 等）指定分數字級的 class
- **驗收**：`nextjs-pickball/components/scoreboard/TeamPanel.contract.test.ts`（讀取原始碼的契約測試，剝除註解後斷言不存在 `sm|md|lg|xl:text-`，並反向驗證剝除邏輯未空轉）

---

### Requirement: 專注模式

系統 SHALL 提供手動切換的「專注模式」：設定列右側按鈕 MUST 永遠渲染（SHALL NOT 因 `document.fullscreenEnabled === false` 而隱藏），`aria-label` 為「進入專注模式」／「退出專注模式」、`aria-pressed` 反映當前狀態。

進入專注模式時：系統 MUST 於 `document.documentElement` 掛上 `sb-focus` class（SiteNavbar 據此隱藏，見 site-navbar capability）、不渲染 ScoreboardSetup 設定列、改渲染一顆 fixed 浮動退出鈕、ActionBar 收為浮動縮小版（按鈕 role 與 name 不變）、外層容器頂部 padding 歸零。SHALL NOT 以「整頁 fixed 高 z-index 覆蓋 navbar」實作 —— 重置確認 AlertDialog 與 GameOverDialog 為 portal 至 body 的 z-50，會被蓋死。

瀏覽器支援 Fullscreen API（`fullscreenEnabled === true`）時，切換專注模式 MUST 附帶呼叫 `requestFullscreen()`／`exitFullscreen()` 作 progressive enhancement；不支援時只切換版面。使用者以 Esc／系統手勢退出全螢幕（`isFullscreen` 由 true 變 false）時系統 MUST 同步退出專注模式；判定 MUST 以「前值為 true」為條件，SHALL NOT 在 `isFullscreen` 恆為 false 的裝置（如 iPhone Safari）誤退。

專注模式 SHALL NOT 依 `status` 自動觸發 —— localStorage 恢復（HYDRATE 後 status=playing）會讓使用者一進頁 navbar 就消失。

行為邏輯 MUST 抽為 `nextjs-pickball/hooks/useFocusMode.ts`（`useFocusMode({ isFullscreen })` → `{ focusMode, toggleFocusMode }`），`sb-focus` 為全域副作用，unmount 時 MUST 清除。

#### Scenario: 專注模式按鈕永遠顯示

- **GIVEN** `document.fullscreenEnabled === false`（如 iPhone Safari）
- **WHEN** 開啟 `/scoreboard`
- **THEN** 設定列右側仍顯示「進入專注模式」按鈕；點擊後進入專注模式（僅版面切換，不呼叫 Fullscreen API）

#### Scenario: 切換 focus state 並同步 sb-focus class

- **WHEN** 呼叫 `toggleFocusMode()`
- **THEN** `focusMode` 反轉，且 `document.documentElement.classList` 同步含有／移除 `sb-focus`
- **驗收**：`nextjs-pickball/hooks/useFocusMode.test.ts`，it 名稱「toggleFocusMode 切換 focusMode 並同步 documentElement 的 sb-focus class」

#### Scenario: 退出全螢幕同步退出專注模式

- **GIVEN** `focusMode === true` 且 `isFullscreen === true`
- **WHEN** `isFullscreen` 變為 false（Esc／系統手勢）
- **THEN** `focusMode` 自動變為 false，`sb-focus` class 移除
- **驗收**：`nextjs-pickball/hooks/useFocusMode.test.ts`，it 名稱「isFullscreen 由 true 變 false 時自動退出 focus mode」

#### Scenario: 不支援全螢幕的裝置不誤退

- **GIVEN** `isFullscreen` 自始至終為 false（裝置不支援 Fullscreen API）
- **WHEN** 呼叫 `toggleFocusMode()` 進入專注模式後經歷多次 re-render
- **THEN** `focusMode` 維持 true，不被誤退
- **驗收**：`nextjs-pickball/hooks/useFocusMode.test.ts`，it 名稱「isFullscreen 恆為 false（不支援裝置）時不會誤退 focus mode」

#### Scenario: unmount 清除全域 class

- **GIVEN** `focusMode === true`（`sb-focus` 已掛上）
- **WHEN** 元件 unmount（如導航離開 `/scoreboard`）
- **THEN** `document.documentElement.classList` 不含 `sb-focus`
- **驗收**：`nextjs-pickball/hooks/useFocusMode.test.ts`，it 名稱「unmount 時移除 sb-focus class」

#### Scenario: E2E 專注模式進出

- **WHEN** 點擊「進入專注模式」
- **THEN** navbar 連結與「比賽形式」combobox 皆 hidden、浮動的「退出專注模式」鈕 visible；點擊退出鈕後 navbar 與設定列恢復 visible
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「專注模式：進入後隱藏 navbar 與設定列、退出後恢復」

---

### Requirement: 視覺回饋 Toast

系統 SHALL 僅在「分數未變但發球狀態改變」時顯示 toast，SHALL NOT 在得分時顯示 —— 分數大字本身已是足夠的視覺回饋，額外 toast 會造成資訊重複。

#### Scenario: Side-out toast

- **WHEN** RALLY_WON 後 servingTeam 換邊（分數不變）
- **THEN** 頂部顯示「Side Out · 換 X 發球」toast，1.6s 滑入停留滑出後消失

#### Scenario: 換發球員 toast

- **WHEN** RALLY_WON 後 serverNumber 1→2（同隊換人，分數不變）
- **THEN** 頂部顯示「換發球員 #2」toast，1.6s 後消失

#### Scenario: 得分不顯示 toast

- **WHEN** RALLY_WON 後分數有變動
- **THEN** 不顯示 toast

---

### Requirement: 按鈕版面穩定性

發球指示（ServeIndicator）SHALL 永遠佔據版面空間，非發球方 MUST 以 `invisible` 隱藏而非條件式不渲染，使「贏這球+」按鈕在發球權轉移時 SHALL NOT 上下跳動。

計分板是比賽中快速連點的介面，按鈕位移會直接造成誤觸，因此版面穩定性視為功能需求而非美觀偏好。

#### Scenario: 發球指示切換不引起版面位移

- **GIVEN** 計分板正在進行
- **WHEN** 發球權在兩隊之間切換（ServeIndicator 顯示/隱藏）
- **THEN** 「贏這球+」按鈕位置不上下跳動（indicator 永遠佔位，非發球方用 invisible 隱藏）

### Requirement: 賽前設定與階段鎖定

系統 SHALL 於 `status === "setup"` 期間允許調整比賽形式（`mode`：單打／雙打）、先發球方（`firstServer`）與目標分數（`targetScore`：11／15／21），並 MUST 在 `playing` 與 `finished` 階段忽略這三個 action。

`mode` 與 `firstServer` 中途變更會使 `serverNumber` 與發球權推導失去基準，已累積的分數隨之失去意義；`targetScore` 中途變更雖不影響既有分數的有效性，仍 MUST 一併鎖定 —— 三項設定行為一致可避免使用者建立「有些設定改得動」的錯誤心智模型，並使 `finished → playing` 的反向狀態轉換不必存在（11 分制已判勝後改為 15 分制是否要讓比賽復活，是本規格刻意不引入的複雜度）。比賽中變更分制的唯一路徑為經二次確認的重置。

UI MUST 以原生 `disabled` 屬性表達鎖定狀態（`nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx` 的 `disabled={locked}`），三個控制項 MUST 各有 `aria-label`（「比賽形式」、「先發球方」與「目標分數」）。

目標分數 MUST 以 `role="radiogroup"` + 三顆 `role="radio"`（帶 `aria-checked`）表達 —— 三個分制為互斥單選，此語意使讀屏能告知「三選一」而非三個獨立開關。該群組 MUST 實作 WAI-ARIA APG 的 radio group 鍵盤模式：roving tabindex（僅選中項 `tabIndex=0`，使 Tab 進入群組即落在選中項、再按 Tab 離開整組）、方向鍵移動即選取並循環。索引計算 MUST 抽為純函式（`nextjs-pickball/lib/scoreboard/radio-navigation.ts`）並於該層 TDD，SHALL NOT 只寫在元件內 —— 依專案分層規範，元件的行為邏輯須下放到可單元測試的層級。

重置（RESET）MUST 保留 `mode`、`firstServer` 與 `targetScore`、清空分數與 history、將 `status` 回到 `setup`，且 MUST 經二次確認才執行 —— 誤觸重置會讓整場比賽的分數消失且無法 Undo。

UNDO 同樣 MUST 保留 `targetScore`：`UNDO` 以「重建初始 state 後 replay」實作（見「Undo 機制」Requirement），重建時若未帶入 `targetScore`，目標分數會靜默退回 11，使 15／21 分制的比賽在 Undo 後可能立即誤判為結束。此失效路徑僅在使用者按下 Undo 時顯現，正常計分完全正常，MUST 有獨立測試覆蓋。

#### Scenario: setup 階段可切換比賽形式

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_MODE 切換為 singles
- **THEN** `mode` 更新，且 `serverNumber` 設為 1、`isFirstService` 設為 false（單打無 #2 發球員），`targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false」

#### Scenario: setup 階段可切換先發球方

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_FIRST_SERVER
- **THEN** `firstServer` 更新，`mode` 與 `targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 firstServer」

#### Scenario: setup 階段可切換目標分數

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_TARGET_SCORE 切換為 15
- **THEN** `targetScore` 變為 15，`mode` 與 `firstServer` 維持不變，分數維持 0-0
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 targetScore 且保留 mode 與 firstServer」

#### Scenario: 比賽進行中鎖定設定

- **GIVEN** `status === "playing"`
- **WHEN** dispatch SET_MODE、SET_FIRST_SERVER 或 SET_TARGET_SCORE
- **THEN** state 完全不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「playing 階段 ignore SET_MODE」、「playing 階段 ignore SET_FIRST_SERVER」與「playing 階段 ignore SET_TARGET_SCORE」

#### Scenario: 比賽結束後仍鎖定設定

- **GIVEN** `status === "finished"`
- **WHEN** dispatch SET_MODE、SET_FIRST_SERVER 或 SET_TARGET_SCORE
- **THEN** state 完全不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「finished 階段 ignore SET_MODE」、「finished 階段 ignore SET_FIRST_SERVER」與「finished 階段 ignore SET_TARGET_SCORE」

#### Scenario: UNDO 保留目標分數

- **GIVEN** `targetScore === 21`、比賽進行中且 `history.length > 0`
- **WHEN** dispatch UNDO
- **THEN** replay 後的 state 之 `targetScore` 仍為 21（SHALL NOT 退回 11），`status` 不因此誤判為 `finished`
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 後保留 targetScore，不退回預設 11」

#### Scenario: 重置需二次確認且解除鎖定

- **GIVEN** 比賽進行中，設定控制項為 disabled
- **WHEN** 使用者按下「重置」
- **THEN** 先顯示標題為「確定要重置比賽？」的 AlertDialog；確認後分數與 history 清空、`status` 回到 `setup`、三個設定控制項恢復 enabled，且 `mode`、`firstServer` 與 `targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「RESET 保留 mode、firstServer 與 targetScore，清空分數與 history、status 回 setup」；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「重置含二次確認；確認後 mode toggle 解鎖（enabled）」

#### Scenario: 目標分數群組支援方向鍵導覽與 roving tabindex

- **GIVEN** `status === "setup"`、目前選中 11 分制
- **WHEN** 焦點位於目標分數群組並按下 ArrowRight 或 ArrowDown
- **THEN** 選取移至 15 分制、焦點同步移到該按鈕；再按兩次依序到 21 並循環回 11。ArrowLeft／ArrowUp 反向循環；Home／End 跳至首／末項
- **AND** 任一時刻僅選中項的 `tabIndex` 為 0，其餘為 -1
- **驗收**：`nextjs-pickball/lib/scoreboard/radio-navigation.test.ts`（索引計算的純函式層）；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「目標分數 radiogroup 支援方向鍵導覽與 roving tabindex」

#### Scenario: 比賽中方向鍵不得變更目標分數

- **GIVEN** `status === "playing"`（三個控制項皆為 disabled）
- **WHEN** 於目標分數群組按下任一方向鍵
- **THEN** 選取不變 —— 按鈕雖為原生 `disabled`，但 `onKeyDown` 掛在群組容器上仍會收到事件，實作 MUST 自行 guard `locked` 狀態
- **驗收**：同上 E2E test 的後段

#### Scenario: 目標分數控制項於比賽中為 disabled

- **GIVEN** 比賽已開始（`status === "playing"`）
- **WHEN** 檢視設定列
- **THEN** 「目標分數」控制項與其餘兩項同為原生 `disabled`，使用者無法變更分制
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「比賽開始後三個賽前設定控制項皆為 disabled」

### Requirement: 目標分數可見性

系統 SHALL 在每個隊伍面板的名稱行同時顯示當前目標分數（形如「我方 · 15 分制」），SHALL NOT 僅依賴設定列呈現目標分數 —— 專注模式不渲染 `ScoreboardSetup`（見「專注模式」Requirement），若分制只出現在設定列，使用者進入專注模式後將無從判斷比賽何時結束（例如 21 分制打到 11-9 未結束時會誤以為程式故障）。

顯示位置 MUST 為既有的名稱行（`nextjs-pickball/components/scoreboard/TeamPanel.tsx` 的 label 節點），SHALL NOT 新增獨立的列或區塊 —— 頁面為 `h-dvh` + `overflow-hidden` 鎖高，新增節點會壓縮分數面板的高度預算，且溢出時的失敗模式是靜默裁切而非出現捲軸。

#### Scenario: 名稱行顯示目標分數

- **GIVEN** `targetScore === 15`
- **WHEN** 檢視任一隊伍面板
- **THEN** 名稱行呈現「我方 · 15 分制」／「對方 · 15 分制」
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「一般模式下隊伍面板顯示目標分數」

#### Scenario: 專注模式下目標分數仍可見

- **GIVEN** `targetScore === 21` 且已進入專注模式（設定列未渲染）
- **WHEN** 檢視計分板
- **THEN** 兩個隊伍面板的名稱行仍顯示「· 21 分制」
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「專注模式下隊伍面板仍顯示目標分數」

### Requirement: `/scoreboard` 之 metadata

系統 SHALL 為 `nextjs-pickball/app/scoreboard/page.tsx` 提供獨立 metadata：title 為「計分板 | 匹克球指南」、description 為「支援單打與雙打的匹克球 Traditional 計分器」。

`/scoreboard` 為公開內容頁，SHALL 對搜尋引擎開放索引，SHALL NOT 設定 `robots.index: false` —— noindex 只適用於 `/health` 這類內部診斷路由（見 `api-connectivity` capability）。

#### Scenario: `/scoreboard` 匯出 metadata 且開放索引

- **WHEN** 檢查 `nextjs-pickball/app/scoreboard/page.tsx` 的模組匯出
- **THEN** 存在 `export const metadata`，title 與 description 如上；未設定 `robots.index: false`

