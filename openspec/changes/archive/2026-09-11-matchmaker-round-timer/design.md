# Design: matchmaker-round-timer

## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- **本 change 是第一個為「每輪設定」新增第四個維度的 milestone**。M4～M13 已把對戰方式、
  場地數、目標分數三者的模式定死：純函式 schema／預設值（`round-types.ts`／
  `round-settings.ts`）→ 產生本輪時決定（`round.ts` 的 `createRound`）→ 開始計分後鎖定
  （`scoreboard-binding.ts` 的 `isTargetScoreLocked`）→ UI 選擇器（`RoundControls.tsx`）。
  本 change **完全沿用同一條模式**，這是刻意的選擇（Decision 1），不是巧合。
- `nextjs-pickball` 目前**沒有任何計時或音效相關的相依**（`package.json` 的
  dependencies 只有 Next／React／Radix／zod／Tailwind 生態，M9 已確認且延續至今）。
  提示音只有兩條路——引入套件（如 `howler`）或用瀏覽器內建 Web Audio API，本 change
  延續「matchmaker 全段零外部相依」的既有紀錄（M1～M13 皆未新增套件），選後者。
- **本 workspace 沒有任何 hook 呼叫過 `setInterval`**（`grep -rn "setInterval"
  nextjs-pickball/hooks/` 目前零命中）。`useRoundTimer.ts` 會是第一個，因此本 change
  對「計時 hook 該長什麼樣子」沒有既有先例可循，只能參照 `useFullscreen.ts`／
  `useOrientation.ts` 這類「封裝瀏覽器 API、有對應 smoke test」的既有 hook 風格。
- `RoundControls.tsx` 已同時承載「設定」（對戰方式、場地數、目標分數）與「操作」
  （產生本輪對戰、重設／再排）兩種性質的 UI，且已示範「鎖定判定委派純函式、UI 只讀
  `locked` 布林值與 `reason` 字串」的模式（見該檔 `lockResult = isTargetScoreLocked(...)`）。
  本 change 的計時設定與「開始計時」按鈕沿用同一個檔案與同一種模式。
- `scoreboard-binding.ts` 的 `isTargetScoreLocked(round, slots): { locked, reason }` 已是
  「本輪是否已開始計分」的**唯一**判定來源，其 `reason` 欄位固定回傳目標分數專用的訊息
  （`本輪已開始計分，目標分數不可更改。`）。本 change 需要**同一個 `locked` 布林值**、
  但**不同的 `reason` 文案**（計時設定專用），取捨見 Decision 2。
- `round.ts` 的 `createRound()`／`resetIncompleteMatches()` 建構回傳 `Round` 物件的方式不同：
  前者逐欄位列舉（`{ roundNumber, createdAt, format, ... }`），後者以物件展開
  `{ ...round, matches, restingPlayerIds, seenSignatures }`。這個差異直接決定了「產生新一輪
  一律給全新 timer」與「重排不重置計時」兩條規則能否用同一份程式碼**自然**滿足，
  不需要額外程式碼（見 Decision 4）。
- 本 workspace 的 TDD 分層規範（`nextjs-pickball/CLAUDE.md`）：純函式與有分支決策的
  React 邏輯（hooks、元件）走 TDD；純瀏覽器 API 呼叫且無分支決策的模組屬例外層，以 E2E
  驗收（`lib/matchmaker/scene-canvas.ts` 是既有先例）。Web Audio 的提示音播放屬於後者。
- E2E 的 `testIdAttribute` 為 `data-testid`、`baseURL` 為 `http://localhost:3005`，
  `@playwright/test` 為 `^1.59.1`，具備 `page.clock`（可安裝假時鐘並快轉，不需要真的
  等待 10～20 分鐘）與 `page.addInitScript`（M9 已用它 stub `window.print` 來驗證列印
  委派，本 change 用同一手法 stub `window.AudioContext` 來驗證提示音委派）。

## Goals

- 計時器的資料模型、鎖定條件與 UI 委派模式與既有的目標分數**完全對稱**，讓熟悉
  `setTargetScore`／`isTargetScoreLocked` 的人不需要學一套新規則就能讀懂計時器的程式碼。
- 倒數與時間到的判定是**純函式、可被單元測試逐條驗證**，不必啟動真實計時器或等待
  10～20 分鐘就能驗證邊界（0 秒、超過設定長度）。
- 提示音與倒數的瀏覽器 API 呼叫面**壓到最小且集中**：`setInterval`／`new Date()` 只在
  `useRoundTimer.ts` 一處，`AudioContext` 只在 `round-timer-sound.ts` 一處。
- 在**不新增任何 npm 相依**的前提下完成計時與提示音。
- 時間到**不自動結束任何場次**——這是本 change 與「平局判定」（M15）之間唯一但關鍵的
  邊界，設計必須讓這個邊界在程式碼層級一望即知（時間到判定函式的型別簽章上就不接受
  `matches`，物理上無法改動場次狀態）。

## Non-Goals

- **不做平局判定**：時間到之後比分仍平手該怎麼辦是 M15（timed-draw）的範圍。本 change
  的「時間到：領先者勝，平手請再打一球」只是提示文案，不觸發任何比分驗證邏輯。
- **不做每場獨立計時**：本輪所有場地共用同一個倒數（`prd.md` 6.3.1「同一輪的所有場地
  共用」對目標分數的既有精神，計時比照）。逐場地計時已在 `prd.md` 第 15 章被否決。
- **不做暫停／恢復／延長**：只有「開始計時」一個操作。需要重新起算時走既有的「重設／
  再排」或「產生新一輪」入口，不新增第二套計時控制。
- **不做音檔資產或第三方音效套件**：提示音全由 Web Audio API 即時合成。
- **不做背景通知／PWA**：計時器只在頁面開啟且分頁可見時倒數，不做 Service Worker、
  不做鎖屏通知。

## Decisions

### Decision 1：計時完全比照目標分數的既有四層模式，不另創新模式

**Choice**：資料模型（schema + 預設值）→ 產生本輪時決定（`createRound`）→ 開始計分後
鎖定（沿用 `isTargetScoreLocked`）→ UI 選擇器（`RoundControls.tsx`）。變更計時設定的
純函式 `setTimerDuration(round, durationMinutes)` 在型別簽章、失敗代碼結構、UI 委派方式
上逐一對應既有的 `setTargetScore(round, targetScore)`。

**Rationale**：M4～M13 已經為「每輪設定，開始計分後鎖定」這個形狀寫過一次完整的實作、
測試與審查（`round-lifecycle` 的「目標分數為每輪設定」與「開始計分後鎖定本輪目標分數」
兩個 Requirement）。計時器在產品語意上與目標分數是同一種東西——都是「這一輪打到什麼
程度算完」的規則，只是一個用分數、一個用時間衡量。複用已驗證過的模式把本 change 的
風險壓縮到「新資料、新純函式的算法」本身，不需要重新設計一套鎖定／委派機制。

**Alternatives considered**：
- 讓計時器完全獨立於現有鎖定機制，一開始就允許暫停/恢復/隨時修改：功能更豐富，但
  Non-Goals 已說明本版刻意不做；且獨立機制會讓「已開始計分」在同一個回合上出現兩種
  互相獨立的判斷依據，未來要合併時反而增加風險。
- 把計時器做成回合之外的獨立 LocalStorage key（例如 `matchmaker:timer:v1`）：否決——
  計時器與回合是 1:1 關係（每輪一個計時器，回合被取代時計時器也該被取代），拆成兩個
  key 需要額外程式碼保證兩者不會不同步，而 `Round.timer` 内嵌欄位讓這個同步**在結構上
  自動成立**（沒有第二個 key 可以不同步）。

### Decision 2：計時鎖定重用 isTargetScoreLocked 的 locked 布林值，但不重用其 reason 字串

**Choice**：`RoundControls.tsx` 對計時控制項與目標分數控制項使用**同一次**
`isTargetScoreLocked(round, matchSlots)` 呼叫結果的 `locked` 欄位；計時控制項顯示的
鎖定原因文案來自 `nextjs-pickball/lib/matchmaker/labels.ts` 新增的具名常數
`ROUND_TIMER_LOCKED_REASON`，不是 `isTargetScoreLocked` 回傳的 `reason`
（該欄位文字固定提及「目標分數」，套用在計時控制項上語意不通）。

**Rationale**：`isTargetScoreLocked` 的判定邏輯（「該輪任一場次已完成，或任一計分板槽
離開 setup」）與其函式名稱字面上綁定「目標分數」，但其**本質**是「本輪是否已開始計分」
這個與具體設定項無關的通用判斷。重用同一個函式呼叫可以做到 SHALL NOT 重新推導一次
「是否已開始計分」；而分開文案可以避免計時控制項下方出現一句提到「目標分數」的說明文字。

**Alternatives considered**：
- 新增第二個結構相同的函式 `isRoundTimerLocked`，內部委派同一個私有 helper：否決——
  round-lifecycle 的「開始計分後鎖定本輪目標分數」Requirement 已把 `isTargetScoreLocked`
  訂為「鎖定與否的唯一來源」，新增第二個公開函式（即使內部委派同一個 helper）等於承認
  這個 Requirement 需要修改，而它描述的行為（目標分數委派 `isTargetScoreLocked`）本身
  完全沒變，不需要改動；額外的公開函式只會製造「兩個名字、一個邏輯」的認知負擔。
- 重命名 `isTargetScoreLocked` 為更通用的名字（如 `isRoundSettingLocked`）：否決——
  這會改動一個已合併、已被目標分數選擇器的既有 Requirement 逐字引用名稱的函式，
  屬於不必要的重構風險，且違反「surgical changes」原則（只動必須動的東西）。
- 把計時控制項的鎖定原因也寫死同一句「本輪已開始計分，目標分數不可更改」：否決——
  文字上明顯錯誤（計時控制項旁邊寫「目標分數」會誤導使用者以為看錯區塊）。

### Decision 3：變更計時長度一律重置 startedAt 為 null，不保留倒數進度

**Choice**：`setTimerDuration(round, durationMinutes)` 無論本輪計時是否已開始，成功時
一律回傳**全新**的 `timer` 物件（`{ durationMinutes, startedAt: null }`），不嘗試把舊的
剩餘時間換算成新長度下的等值秒數。

**Rationale**：「使用者改變計時長度」與「剩餘時間該怎麼延續」是兩個獨立問題，本 change
的範圍只覆蓋前者。若要保留進度，需要決定「10 分鐘倒數跑了 3 分鐘後改成 15 分鐘，剩餘
時間該是 12 分鐘（總長變、經過時間不變）還是重新算 15 分鐘（視為全新一段）」，兩種語意
在使用情境上都講得通、卻互相排斥；而 `setTimerDuration` 只會在「尚未開始計分」時可用
（鎖定條件與目標分數相同），實務上使用者多半是在打之前調整長度，此時 `startedAt` 本來
就大機率仍是 `null`（尚未開始計時）；即使已按過「開始計時」但還沒人開始得分（合法情境，
「開始計時」與「開始計分」是兩件事），重置起算也不算是流失有意義的進度。

**Alternatives considered**：
- 換算剩餘比例延續倒數：否決——上述雙重語意問題無法用一個「正確答案」解決，任何選擇
  都需要額外的產品規則與測試，超出本 change「只做計時器本體」的範圍。
- 變更長度時直接拒絕（若已開始計時就不給改長度，即使尚未開始計分）：否決——鎖定條件
  刻意與目標分數一致（「該輪是否已開始計分」），額外疊加「或已開始計時」等於引入
  第二個獨立的鎖定條件，違反 Decision 2 的「唯一判定來源」原則。

### Decision 4：createRound 逐欄列舉、resetIncompleteMatches 物件展開，兩條規則各自「自然」滿足

**Choice**：`createRound()` 在其逐欄列舉的回傳物件中加入
`timer: timerDurationMinutes == null ? null : { durationMinutes: timerDurationMinutes,
startedAt: null }` 這一行，是本 change 在 `round.ts` 唯一需要「主動加程式碼」才能滿足
「產生新一輪一律給全新 timer」規則的地方；`resetIncompleteMatches()` **不需要任何程式
碼變更**——其既有實作以 `{ ...round, matches, restingPlayerIds, seenSignatures }` 展開
建構回傳值，`timer` 欄位不在展開時被覆寫的欄位清單內，因此「重排不重置計時」這條規則
在程式碼不變的情況下就已經成立。

**Rationale**：這不是巧合而是既有程式碼結構的直接後果，值得在 tasks.md 明確標註為
**regression guard**（見 test-plan／tasks 對這條 Scenario 的標註），而不是誤判成需要
新寫程式碼卻寫不出紅燈。

**Alternatives considered**：（無——這是對既有程式碼結構的觀察而非可替換的設計選擇；
唯一的「替代方案」是逐欄位重寫 `resetIncompleteMatches` 的回傳值組裝方式，那會是一次
不必要的重構，違反「surgical changes」原則。）

### Decision 5：倒數與時間到判定不接受 matches，物理上無法自動結束場次

**Choice**：`round-timer.ts` 的三個純函式（`remainingSeconds`、`isExpired`、
`formatRemaining`）的參數只有 `timer`／`nowIso`／`seconds`，**不接受** `Round` 或
`RoundMatch[]`。

**Rationale**：「時間到不自動結束任何場次」是 proposal 的明確不做項目與 spec 的 MUST NOT
條款。與其只靠程式碼審查或測試斷言守住這條規則，不如讓函式的**型別簽章**上就沒有
`matches` 可以碰——想在這一層意外寫出「時間到就把某場標記為 completed」的程式碼，
連編譯都過不了（沒有 `matches` 參數可用）。這比「寫測試斷言沒有被改動」更強的保證，
是結構性的而非行為性的。

**Alternatives considered**：
- 讓 `round-timer.ts` 的函式接受整個 `Round`，只是「不使用」`matches`：否決——雖然
  行為上等價，但型別簽章允許的操作範圍比實際做的更大，之後有人在此函式內新增邏輯時
  更容易「順手」加一段碰 `matches` 的程式碼而不自覺越界。

### Decision 6：提示音抽為例外層純瀏覽器 API 模組，不放進 useRoundTimer.ts

**Choice**：新增 `nextjs-pickball/lib/matchmaker/round-timer-sound.ts`，匯出單一函式
`playTimerExpiredChime(): void`（`AudioContext` 建構 → `OscillatorNode` → 短暫
`gain` 包絡 → 自動停止），零分支決策。`useRoundTimer.ts` 只負責倒數 tick 與呼叫
`round-timer.ts` 的純函式，不呼叫 `AudioContext`；播放時機由
`RoundTimerBanner.tsx` 的 `useEffect` 監看 `expired` 從 `false` 轉為 `true` 時觸發。

**Rationale**：沿用 M9 Decision 7 的既有分層先例（`scene-canvas.ts` 是「純瀏覽器 API
呼叫、無分支決策、以 E2E 驗收」的例外層典範）。把 `AudioContext` 與 `setInterval`／
`Date` 分開到兩個檔案，是因為它們是**兩種不同性質**的瀏覽器 API 存取（一個是「持續的
時間來源」、一個是「一次性的副作用」），混在同一個 hook 內會讓 `useRoundTimer.ts` 的
單元測試（用 `vi.useFakeTimers()`）意外需要同時 mock `AudioContext`（happy-dom 未實作），
拖累原本單純的計時邏輯測試。

**Alternatives considered**：
- 直接把提示音邏輯寫進 `RoundTimerBanner.tsx` 元件內：否決——會讓元件測試
  （`RoundTimerBanner.test.tsx`，Vitest + happy-dom）意外需要處理 `AudioContext`
  不存在的環境問題；抽成獨立模組後，元件測試只需要驗證「音效函式被呼叫幾次」
  （以 `vi.fn()` 注入替換），不必真的建構音訊。

### Decision 7：時間到的視覺呈現為靜態文字，不加動畫

**Choice**：`RoundTimerBanner.tsx` 的「時間到」大字 MUST 為靜態排版（大字級、粗體），
不使用任何 CSS 動畫、Tailwind `animate-*` utility 或 `motion` 套件的進場效果。

**Rationale**：`prd.md` 12.5 要求動態效果尊重 `prefers-reduced-motion`。做到這件事最
簡單、風險最低的方式是**不做動態效果**——不存在的動畫不需要額外的媒體查詢去關閉它，
也不需要驗證 Tailwind v4 的 `motion-safe:` 變體在本專案的建置管線下確實生效（本 repo
目前沒有任何既有元件使用過 `motion-safe:`／`motion-reduce:`，若本 change 是第一個
使用者，等於引入一個未經驗證的路徑）。靜態的大字「時間到」搭配 `role="alert"` 已足以
達成「立即注意到」的產品目的，不需要閃爍或脈動。

**Alternatives considered**：
- 加一個 `motion-safe:animate-pulse` 的柔和脈動，在 reduced motion 時自動關閉：
  否決——功能上更醒目，但引入一個本 repo 從未驗證過的 Tailwind 變體路徑，而 apply
  階段沒有簡單的方式在寫程式當下就確認它於本專案的 Tailwind v4 設定下確實生效
  （`app/globals.css` 是否有任何設定攔截了核心變體），為了裝飾效果承擔這個不確定性
  不划算。
- 加一段 `app/globals.css` 的 `@keyframes` 並包在 `@media (prefers-reduced-motion:
  no-preference)` 內（比照現有的 `::view-transition-*` 規則）：否決——同樣是為了裝飾
  效果新增一段 CSS 與一個新的媒體查詢分支，維護成本與零動畫方案相比不成比例。

### Decision 8：RoundTimerBanner 獨立掛載於 page.tsx，不進 MatchStage／CourtCard

**Choice**：`RoundTimerBanner.tsx` 由 `app/matchmaker/page.tsx` 直接掛載（傳入
`round?.timer ?? null`），不修改 `components/matchmaker/MatchStage.tsx`／
`CourtCard.tsx`／`RestingPanel.tsx` 任何一個檔案。

**Rationale**：沿用 M9 Decision（`ExportActions`／`PrintSheet` 同樣獨立掛載於
`page.tsx`，不修改 M5 的既有元件檔）的同一條理由：計時器是**整輪**共用的單一倒數，
不屬於任何一張場地卡片，把它塞進 `CourtCard.tsx` 會讓「一個回合、一個倒數」的資料模型
在畫面上被誤讀成「每張卡片各自倒數」。獨立掛載也讓本 change 對既有大型元件的觸碰面
降到最低（只加一行掛載與兩個 prop 傳遞），複用「M6～M13 序列開發、少碰共用檔案就少
一次合併衝突」的既有心得。

**Alternatives considered**：
- 把倒數顯示塞進 `RoundControls.tsx`（設定與倒數顯示同一個檔案）：否決——`RoundControls`
  目前是純同步、無 `useEffect` 計時副作用的元件（`RoundControlsProps` 全部是資料與
  callback），混入每秒 re-render 的 ticking 邏輯會讓這個檔案的測試心智模型從「給定
  props、斷言渲染結果」變成「給定 props、還要控制假時鐘」，增加既有測試（14 個既有
  it）的維護負擔。

## Risks / Trade-offs

- **[使用者可能誤解「開始計時」與「開始計分」的關係]** → 兩者刻意獨立（Decision 3 已
  說明鎖定條件的取捨）。緩解：`RoundControls.tsx` 的計時區塊在「已設定但未開始」時
  才顯示「開始計時」按鈕，按鈕文字與位置緊鄰計時長度選擇器，操作意圖清楚；「開始計分」
  仍完全由送出比分或計分板互動定義，兩者的 UI 入口在畫面上明顯分開（前者在
  `RoundControls`，後者在各場地卡片）。

- **[E2E 無法真的等待 10～20 分鐘驗證倒數]** → 使用 Playwright 的 `page.clock` API
  安裝假時鐘並快轉，不需要真實等待。殘餘風險：`page.clock` 對 `setInterval` 的相容性
  需要在 apply 階段實測確認（`@playwright/test` 1.59.1 的文件宣稱支援，但本 repo
  尚無任何既有 E2E 使用過這個 API，是本 change 的第一次使用）；若實測不相容，
  退路是把測試改為安裝一個較短的假 `durationMinutes` 值域穿透點——但這需要修改
  production 程式碼只為了測試，故非首選，留待 apply 階段視實測結果決定（見 Open
  Questions）。

- **[Web Audio 的提示音在自動播放政策下可能被瀏覽器靜音]** → 大部分瀏覽器的自動播放
  限制針對的是 `<audio>`／`<video>` 元素與未經使用者互動的播放，而本 change 的
  `AudioContext` 一律在使用者先點擊過「開始計時」之後才會於數分鐘後觸發（此時頁面已有
  過使用者互動），屬於瀏覽器自動播放政策通常允許的情境。不做任何額外的「解鎖音訊」
  UI，若後續實測發現特定瀏覽器仍靜音，視為已知限制而非本 change 需解決的問題（提示音
  本身是輔助提示，`role="alert"` 的文字與大字視覺提示才是主要保證，音效是加分不是
  唯一依據）。

- **[計時器與目標分數共用 `isTargetScoreLocked` 但顯示不同文案，未來該函式若改變
  `reason` 的回傳結構會連帶影響計時控制項]** → 已知且可接受的耦合：`RoundControls.tsx`
  只讀取 `isTargetScoreLocked` 的 `locked` 布林值供計時控制項使用，SHALL NOT 讀取其
  `reason` 給計時控制項顯示（Decision 2），因此該函式未來即使改寫 `reason` 的文字，
  也不會波及計時控制項的顯示文案。

## Open Questions

1. **`main` 上 M13（`matchmaker-player-swap`）的實際簽章需要 apply Step 0 重新對齊**。
   本 change 的 proposal／design／tasks 撰寫時，`main` 尚停在 M9 archive 之後
   （commit `3fa2d22`），`round.ts`／`useRoundStore.ts`／`app/matchmaker/page.tsx`
   三個檔案的內文皆以**當下** `main` 的實況為準撰寫（已逐一 `grep`／`Read` 確認，見
   proposal 的「執行相依」）。M10～M13 若改動了這三個檔案的既有函式簽章（例如
   `CreateRoundInput` 的欄位、`RoundControls.tsx` 的 props 清單、`useRoundStore` 的
   解構清單），apply 的 §1 前置確認 MUST 以合併後的 `main` 重新核對本 design 的假設，
   差異一律補記於此節，不要默默改實作遷就本文件寫作當下的假設。

   **【apply §1 對齊結果，2026-09-07，base commit `1125d53`】** 已逐檔實讀合併後 `main`
   的 `round.ts`／`useRoundStore.ts`／`app/matchmaker/page.tsx`／`RoundControls.tsx`／
   `scoreboard-binding.ts`／`round-types.ts`／`round-settings.ts`／`labels.ts`，
   本 design 的假設**全部成立**，M10～M13 對這幾個檔案的改動皆為**純新增**：

   - `CreateRoundInput` 仍為 `players`／`format`／`courtCount`／`previousRound`／`now`／
     `newMatchId`／`targetScore?`，`targetScore` 以解構預設值
     （`targetScore = DEFAULT_TARGET_SCORE`）落在函式層而非 schema 層 —— §4.2 的
     `timerDurationMinutes?` 照此形態新增即可。
   - `createRound()` 的 `const round: Round = { ... }` 仍為**逐欄列舉**（
     `roundNumber`／`createdAt`／`format`／`courtCount`／`targetScore`／`matches`／
     `restingPlayerIds`／`seenSignatures`），`resetIncompleteMatches()` 仍以
     `{ ...round, matches, restingPlayerIds, seenSignatures }` **物件展開**回傳 ——
     Decision 4 的兩條規則「各自自然成立」維持有效，§4.7 兩個 it 仍預期為 regression guard。
   - `setTargetScore()` 的鎖定條件仍為 `round.matches.some((match) => match.status !== "pending")`，
     失敗代碼結構為 `SET_TARGET_SCORE_FAILURE_CODE = { SCORING_STARTED: "scoring-started" }`
     ＋私有 `SCORING_STARTED_MESSAGE` ＋ `SetTargetScoreSuccess`／`SetTargetScoreFailure`／
     `SetTargetScoreResult` 三個型別 —— §4.4／§4.6 照此形狀對稱撰寫。
     M13 新增的 `swapMatchPlayer` 亦沿用同一形狀（`SWAP_MATCH_PLAYER_FAILURE_CODE`）。
   - `isTargetScoreLocked(round, slots): { locked, reason }` 簽章不變，私有常數
     `TARGET_SCORE_LOCKED_REASON = "本輪已開始計分，目標分數不可更改。"` 仍為私有（未匯出）
     —— Decision 2「重用 `locked`、不重用 `reason`」的前提成立。
   - `RoundControlsProps` 為 `settings`／`onSettingsChange`／`round`／`matchSlots`／
     `activePlayerCount`／`onGenerate`／`onReset`／`setTargetScore` 共 8 項，**M13 未對本元件
     加任何 prop**；目標分數 radiogroup 的鎖定顯示模式為
     `const lockResult = round !== null ? isTargetScoreLocked(round, matchSlots) : { locked: false, reason: null }`，
     鍵盤導覽委派 `lib/scoreboard/radio-navigation.ts` 的 `nextRadioIndex`。
   - `useRoundStore` 已有 6 個 action（`HYDRATE`／`GENERATE_ROUND`／`RESET_INCOMPLETE_MATCHES`／
     `SUBMIT_SCORE`／`SET_TARGET_SCORE`／`SWAP_MATCH_PLAYER`）與 5 個回傳方法；
     `setTargetScore` 的接線形態為「`state.round === null` 型別安全防線 → 呼叫純函式 →
     判 `ok` → `dispatch`」，§9 照此比照即可。
   - `app/matchmaker/page.tsx` 的 `RoundControls` 掛載點在
     `<div data-print="hide" className="max-md:[&_button:not([role]):not([aria-label])]:min-h-11">`
     之內；M13 只為 `MatchStage` 增加了 `onSwapPlayer`／`swapError` 兩個 prop 與
     `handleSwapPlayer`，與本 change 的掛載點無衝突。
   - `nextjs-pickball/package.json` 的 dependencies 為 `@opennextjs/cloudflare`／
     `@radix-ui/react-label`／`@radix-ui/react-slot`／`class-variance-authority`／`clsx`／
     `lucide-react`／`motion`／`next`／`radix-ui`／`react`／`react-dom`／`tailwind-merge`／
     `zod`，**確認無任何計時或音效相依**（`motion` 為 tour 動畫用，本 change 不得使用）。
   - `labels.ts` 現有 6 個具名匯出（`TEAM_LABELS`／`TEAM_LABELS_BY_KEY`／`FORMAT_LABEL`／
     `DOUBLES_COMPOSITION_LABEL`／`PLAYER_NOT_ON_ROSTER_LABEL`／`SWAP_PLAYER_LABEL`／
     `SWAP_PLAYER_NO_CANDIDATE_LABEL`），與本 change 要新增的
     `ROUND_TIMER_LOCKED_REASON`／`ROUND_TIMER_EXPIRED_MESSAGE` 無命名衝突。

   **【§13 收尾驗證的補充，2026-09-08】這條漣漪的第二波：`tsc` 抓不到 E2E 的種子 fixture。**
   apply 當時我（leader）以 `grep -rn "seenSignatures:"` 掃出所有 `Round` 字面量，
   其中 `tests/e2e/specs/player-stats.spec.ts` 也在命中清單內，但我判斷它「多半是
   `addInitScript` 內的純物件、沒有型別標註」而未處理——**這個判斷是對的，處置卻是錯的**：
   正因為沒有型別標註，`tsc --noEmit` 一路綠燈，8 個單元測試 fixture 的編譯錯誤全被抓到，
   唯獨這一個沒有任何靜態訊號。它一直潛伏到 §13 實跑**完整 E2E** 才現形：
   該檔既有的「瀏覽統計頁不改動任何持久化資料」是逐位元組比對，種子停留在 M14 前的形狀，
   hydrate 時 `.default(null)` 補上 `timer`、write effect 把正規化後的形狀寫回，
   於是五個 browser project 全數轉紅。
   **教訓**：schema 新增必填輸出欄位時，「靠 `tsc` 找出所有 fixture」是不完整的策略——
   未標註型別的持久化種子資料（E2E、手寫 JSON、測試用的 `addInitScript`）不在 `tsc` 的
   守備範圍內，MUST 另外用「哪些測試會把該 schema 的資料種進 localStorage」這個角度掃一遍。

   **唯一與文件不符之處（tasks.md 的事實誤記，不影響設計）**：`tasks.md` 的 10.1 與 13.12①
   寫「既有 4 個 it 的斷言與名稱不變」，實測 `RoundControls.test.tsx` 目前有 **14 個既有
   `it`**（design Decision 8 的 Alternatives 段落寫的「14 個既有 it」才是正確數字）。
   apply 一律以「**14 個既有 it 的名稱與斷言全部不得變動**，只允許替 `buildProps()`
   補上 `setTimerDuration`／`startTimer` 兩個 `vi.fn()` 預設值」為準。
2. **Playwright `page.clock` 對本專案 `setInterval`-based hook 的相容性**：design 假設
   `page.clock.install()` + `page.clock.fastForward()` 可以正確驅動
   `useRoundTimer.ts` 的 `setInterval` tick 並反映在畫面上，但本 repo 尚無先例。
   apply 階段 §12（E2E）實測後，若不相容，MUST 在此記錄實際可行的替代驗證方式並更新
   `tasks.md` 對應 task，SHALL NOT 為了讓測試過而放寬 production 程式碼的時間注入
   紀律（`round-timer.ts` 仍必須是純函式）。
3. **`AudioContext` 建構呼叫次數的 E2E 斷言在 WebKit／Mobile Safari 上是否穩定**：
   M9 的既有經驗顯示下載事件在 WebKit 系列瀏覽器上行為與 Chromium 不同。本 change
   的音效驗證改用 `addInitScript` stub 整個 `AudioContext` 建構函式（不依賴真實音訊
   播放），理論上應與瀏覽器引擎無關，但仍需 apply 階段五個 browser project 全數
   實跑後才能確認；若某個 project 不穩，處理方式比照 execution-plan 的既有升級條件
   （SHALL NOT 靜默 `test.skip`，須記明原因與改用的驗證方式）。

4. **【apply 新增，2026-09-07】`Round.timer` 為必填輸出欄位造成的全 repo fixture 漣漪**：
   propose 階段未預見——zod 的 `.default(null)` 只讓**輸入**端可省略該鍵，**輸出**型別
   （`z.infer` = `z.output`）中 `timer` 仍是**必填**。因此 `RoundSchema` 一加上 `timer`
   欄位，所有以 `const x: Round = { ... }`／`function buildRound(...): Round` 形式建構的
   既有 fixture 都會出現 TS2739，涉及約十個檔案（`round.test.ts`／`round-storage.test.ts`／
   `scoreboard-binding.test.ts`／`export-scene.test.ts`／`transfer-storage.test.ts`／
   `backup.test.ts`／`CourtCard.test.tsx`／`RoundControls.test.tsx` 等）。

   本批**不用 linked worktree**（見 environment.md），而 `.claude/hooks/stop-typecheck.sh`
   對**主 worktree** 的 tsc 錯誤是 **exit 2 擋下 session**（只有 linked worktree 才是
   「提示不擋」）。因此不能讓 tsc 紅燈跨越群組邊界。

   **處置（2026-09-07）**：§2 的 Implementer 依其派工單的檔案邊界，正確地**拒絕**了
   跨檔修補（其派工單明文限定只可改 `round-types.ts`／`round-types.test.ts`，且要求
   遇到超範圍情況回報而非自行擴大）——這個判斷是對的，記錄於此以免日後被誤讀為漏做。
   跨群組的型別修補因此改由 **leader 自己執行**，作為獨立於任何 § 群組的
   「群組間過渡態修補」，單獨一個 commit：
   ① 對 8 個既有 `Round` 字面量 fixture 機械式補 `timer: null`
   （`CourtCard.test.tsx`／`RoundControls.test.tsx`／`backup.test.ts`／`export-scene.test.ts`／
   `round-storage.test.ts`／`round.test.ts`／`scoreboard-binding.test.ts`／
   `transfer-storage.test.ts`；**只補欄位**，零 `it` 名稱與斷言變更）；
   ② 於 `round.ts` 的 `createRound()` 回傳物件補**一行** `timer: null,` 作為維持型別正確的
   最小值，註解註明「計時長度的實際決定邏輯屬後續 task」。
   §4.2 屆時把這一行替換為
   `timer: timerDurationMinutes === null ? null : { durationMinutes: timerDurationMinutes, startedAt: null }`，
   §4.1 的 RED 仍為真紅燈（`timerDurationMinutes: 15` 的那條斷言在此最小值下必然失敗）。
   §4 的 Implementer 與 Stage 1 reviewer MUST 知悉這一行的存在與來歷，**不應**把它判為
   「§4 已被別人先做掉」或 scope creep。

   附帶記錄（§2 的 mutation 自查結論，供 Final Review 參考）：
   `ROUND_TIMER_DURATION_OPTIONS` 改寫死 `[10, 15, 20]` 這個 mutation **存活**，
   與既有 `TARGET_SCORE_OPTIONS` 同款的結構性限制——值相同時任何值層級的斷言都測不出
   「由 schema 推導」與「寫死」的差別。已誠實記錄，未以偽造斷言掩蓋；此點由
   Code-Quality／Final Review 以人工閱讀把關。


5. **【apply 新增，2026-09-07】本 change 實測到的「恆真斷言」五種形態**（供 Final Review 與
   後續 milestone 參考；前三種與第五種是在 Stage 2 的獨立 mutation 中才被抓到、Implementer
   自查漏掉，第四種則是 §11 的 Implementer 自己抓到的）：

   1. **輸入用了預設值**（§3 實測）：測「原樣帶出」時若欄位值就是預設值（`null`），
      「保留」與「被重設為預設值」的結果相同，斷言恆真。→ 斷言用的輸入 MUST 用非預設值。
   2. **比對基準用了活參考**（§4 實測）：`expect(result.timer).toEqual(round.timer)` 在實作
      就地修改 `round.timer` 時兩邊同時被改，斷言恆真。→ MUST 先 `structuredClone` 留快照，
      與**快照**比對。
   3. **`toEqual` 兩邊指向同一參考**（既有紀律）。
   4. **子字串斷言被另一段包含該子字串的文案矇混**（§11 實測）：
      斷言 alert 區塊 `toContain("時間到")`，但 `ROUND_TIMER_EXPIRED_MESSAGE` 的文案
      **本身就是**「**時間到**：領先者勝，平手請再打一球」——開頭就含這三個字。
      於是把「時間到」大字整個拿掉，子字串斷言照樣通過。
      → 改用 `within(alert).getByText("時間到")` 精確比對才轉紅。
      凡是「容器內含某短字串」的斷言，MUST 確認容器內沒有第二段文字包含它。
   5. **fixture 對某輸入欄位只用單一值**（§5 實測）：`round-timer.test.ts` 全檔
      `durationMinutes` 都是 `10`，於是「忽略 `timer.durationMinutes`、寫死 10」的實作
      恆綠。→ union 型別欄位（`durationMinutes` 10/15/20、`targetScore` 11/15/21）
      MUST 至少用兩個不同值。

   另記錄一則**流程教訓**：§5 的 Implementer 自述「10 項 mutation 全數轉紅、0 存活」，
   Stage 2 獨立重跑後實測有 **3 項存活**，其中 M2（拿掉 `remainingSeconds` 的上限夾值）
   正是該 Implementer 自己列為「邊界決策 #1」的那條防禦——**自述的 mutation 結果不可採信**，
   Stage 2 的獨立重跑是必要而非冗餘。


6. **【apply 新增，2026-09-07】archive 階段必讀：主 spec 歸屬清單有被靜默回捲的風險**
   （§8 Stage 2 查 openspec CLI `@fission-ai/openspec@1.9.0` 原始碼後的實測結論）

   §8 依 tasks 8.2 把 `useRoundTimer` 提前同步進主 spec
   （`openspec/specs/pickleball-guide-page/spec.md`），因為 `hooksInventory.test.ts` 讀的是
   主 spec 而非 delta。已查證 CLI **明文支援**這個「early-sync pattern」：
   `specs-apply.js` 對內容相同的 MODIFIED 只是不計入 `modifiedApplied`，
   `archive.js` 在該 capability 的四類操作計數全為 0 時直接 `continue`。
   因此 archive 對 `pickleball-guide-page` 會是 **no-op**，`Totals` 的 `~` 數字會比 delta 的
   MODIFIED 總數少 1——**這是預期行為，不是漏處理**，不要因此加 `--skip-specs` 或手動再套一次。
   （已實測：delta 該檔**整份**只有一個 MODIFIED Requirement，且與主 spec 該區塊
   `normalizeBlockRaw` 後 sha256 相同，不存在「還有其他未同步內容」的情境。）

   **真正的風險方向相反**：MODIFIED 是**整塊取代**，而 archive 唯一的內容保護
   `findMissingCurrentScenarios()` **只檢查 Scenario 有沒有被漏掉，不檢查散文**——
   而 hooks 歸屬清單那一行正是散文。因此：

   > 本 change archive **之前**，若任何人／任何後續 milestone 又往主 spec 的歸屬清單加了新 hook
   > 卻沒有同步改本 change 的 delta，archive 會把整塊 Requirement 換回 delta 的版本，
   > **靜默抹掉那筆新增**，而 `Totals` 只會顯示 `~ 1`（看起來完全正常）。
   > 事後唯一的偵測是 `hooksInventory.test.ts` 下一次執行轉紅，但那已在 archive commit 之後。

   **可行動的處置**：
   - archive 前 MUST 先 `diff` 確認主 spec 該 Requirement 區塊與 delta 仍逐字相同；
     若不同，**先把主 spec 的新內容補進 delta**，再 archive。
   - 本 change archive 前，**不要「順手潤飾」主 spec 這個 Requirement 的任何措辭**
     （包含「每支 hook SHALL 有對應 `*.test.ts` 檔」這句略有歧義的用字）——改了會被靜默回捲。
     要澄清措辭請另開 change，同時改 delta 與主 spec。
   - 後續任何 milestone 於 `nextjs-pickball/hooks/` 新增 hook 時，MUST **同時**更新主 spec
     與該 change 的 delta 兩份。

   附帶澄清（避免後續 milestone 誤讀該 Requirement）：標題的「三支」指的是
   **pickleball-guide-page 自己擁有**的三支（`useScrollShadow`／`useScrollSpy`／`useScrolledPast`），
   不是 `hooks/` 目錄總數（目前已 13 支）；「每支 hook SHALL 有對應 `*.test.ts` 檔」的先行詞
   是同句的那三支，**不涵蓋**跨 capability 的其餘 hook——`useRoundTimer` 的測試義務來自 root
   `CLAUDE.md` 的 TDD 規則與 `round-lifecycle` 規格，不由這份規格管。


7. **【apply 新增，2026-09-07】⚠️ 需要人類裁決：本輪已產生後無法改回「不計時」**
   （§10 Implementer 回報的設計缺口，spec 與 design 皆未涵蓋）

   **現象**：計時 radiogroup 有四個選項（不計時／10／15／20），但
   `round.ts` 的 `setTimerDuration(round, durationMinutes)` 的參數型別是
   `RoundTimerDurationMinutes`（`10 | 15 | 20`），**沒有接受 `null` 的多載**，
   `round-lifecycle` 也**沒有**「把已產生的本輪改回不計時」的入口。
   因此 `round === null`（尚未產生本輪）時選「不計時」可正常寫入 `settings`；
   但 `round` 已存在時點「不計時」**沒有任何反應**。

   **§10 的處置（暫行，已在程式碼註解標明）**：依 spec「SHALL NOT 在 UI 層直接改寫回合物件」，
   把這條路徑實作為**不作為**（`if (durationMinutes === null) return;`），
   SHALL NOT 讓 UI 自己組一個 `timer: null` 的回合。

   **三個候選解法，皆超出 §10 範圍，需人類裁決**：
   1. `round-lifecycle` 補一個 `clearTimer(round)` 入口（或讓 `setTimerDuration` 接受 `null`）
      —— 行為最完整，但要改 spec 與 delta，屬新增 Requirement 條款。
   2. 回合已存在時把「不計時」該顆設為 `disabled` 並附說明 —— 純 UI 層，但與 spec
      「四個選項」「鎖定時四顆皆 disabled」的既有敘述會產生第三種狀態，需補 Scenario。
   3. 維持現狀（不作為）並在 spec 明訂「計時長度於產生本輪時決定，本輪進行中只能在
      10／15／20 之間調整，不能改回不計時」—— 改動最小，但要確認這是產品意圖。

   在裁決之前，apply **維持解法 3 的行為**（不作為），並以本條記錄留痕。
   ⚠️ **這一條 SHALL NOT 由 subagent 自行決定**——execution-plan 的 Escalation 明訂
   設計決策需人類確認。

8. **【apply 新增，2026-09-07】`page.tsx` 的 `RoundControls` prop 接線已由 leader 提前完成**

   §10 為 `RoundControlsProps` 加入**必填**的 `setTimerDuration`／`startTimer` 後，
   `app/matchmaker/page.tsx`（`RoundControls` 的唯一呼叫點）立即出現 TS2739，
   而 `app/**` 不在 §10 的可動檔案清單內——§10 依規回報 `BLOCKED` 後停手，**判斷正確**。

   因主 repo 的 Stop hook 對 tsc 錯誤是 exit 2 擋下（本批無 linked worktree），
   不能讓紅燈跨越群組邊界，故由 **leader 提前完成 §12.2 的其中兩行**：
   `useRoundStore` 的解構加入兩個方法、`<RoundControls>` 加入兩個 prop。

   **§12.2 因此只剩「掛載 `RoundTimerBanner`（傳入 `round?.timer ?? null`）」一件事**，
   §12 的 Implementer 與審查者 MUST 知悉這兩行已存在，**不應**判為「§12 已被別人先做掉」
   或重複實作。


9. **【apply 新增，2026-09-07】發現一個既有 bug：目標分數 radiogroup 的方向鍵起算值錯誤**
   （§10 Stage 2 以暫時 probe 測試實跑證實，**不是本 change 造成的，本 change 未修**）

   `RoundControls.tsx` 既有的 `handleTargetScoreKeyDown` 以
   `TARGET_SCORE_OPTIONS.indexOf(settings.targetScore)` 起算，但畫面上 `aria-checked="true"`
   與 `tabIndex={0}` 的那一顆是依 `displayedTargetScore`（`round !== null` 時為
   `round.targetScore`）決定的。兩者分歧時，方向鍵會**從畫面上沒被選中的位置**開始移動，
   focus 也跟著落到錯的按鈕。

   **實測證據**（probe：`round.targetScore = 21`、`settings.targetScore = 11`、未鎖定，
   按 ArrowRight）：
   ```
   AssertionError: expected "vi.fn()" to be called with arguments: [ 11 ]
   1st vi.fn() call: [ 15 ]   ← 實際
   ```
   畫面上選中的是 index 2（21），卻從 index 0 起算跳到 index 1（15）。

   **兩者在真實 app 中確實會分歧**（非假設情境）：`app/matchmaker/page.tsx` 的 `settings` 是
   本地 `useState(() => createRoundSettings())`，**從未由 `round` 回填**。兩條分歧路徑：
   ① 重新載入頁面時 `round` 由 localStorage hydrate、`settings` 仍是預設值；
   ② 回合存在時改目標分數只走 `commitTargetScore`、**不呼叫** `onSettingsChange`。

   **本 change 的處置**：§10 新增的計時 radiogroup **刻意寫對**（`currentIndex` 取自
   `displayedTimerDuration`），並補了一條 regression guard 釘住這個差異——否則日後有人
   「順手統一成既有寫法」會把這個 bug 靜默複製到計時路徑。既有那條**未修**：
   超出本 change 範圍，且會動到既有測試釘住的路徑。

   **建議**：另開 change 處理。修法看似只是一行（`settings.targetScore` →
   `displayedTargetScore`），但 `settings` 長期與 `round` 分歧這件事本身仍在，
   應連同 `page.tsx` 的 `settings`／`round` 同步策略一起檢視。

10. **【apply 新增，2026-09-07】repo 級無障礙觀察（本 change 未開新先例）**

    三處 radiogroup（目標分數、計時、`ScoreboardSetup`）的鎖定都用原生 `disabled` 而非
    `aria-disabled`，螢幕報讀器使用者因此 Tab 不到控制項、也聽不到相鄰的鎖定原因 `<p>`。
    WAI-ARIA APG 對 radio group 傾向 `aria-disabled`。§10 依「既有慣例勝出」照做是對的；
    若要改應是獨立的 a11y change，一次改三處。

11. **【apply 新增，2026-09-08】⚠️ 需要人類裁決：計時到期後重新整理頁面會再播一次提示音**
    （§11 Stage 2 以 probe 測試實測，並與 §6 Stage 2 的 `suspended` 洩漏發現連起來）

    `RoundTimerBanner` 的「同一次到期只播一次」是靠 `useRef` 旗標（記錄已為哪個 `startedAt`
    播過）。`useRef` **無法跨 mount 存活**，因此：

    > 計時已到期的回合，使用者**重新整理頁面**時，`round.timer` 由 localStorage 還原、
    > 首次 render 即 `expired`，於是**再播一次提示音**。每重整一次就再播一次。

    **與 §6 的發現疊加後有第二層影響**：依 `round-timer-sound.ts` 的分析，若
    `AudioContext` 因自動播放政策停在 `suspended`（頁面載入後尚無使用者手勢，正是重整當下
    的情境），`currentTime` 凍結 → `onended` 不觸發 → `close()` 從未執行 →
    **每次重整洩漏一個 `AudioContext`**。實務衝擊小（瀏覽器對並存數量的上限量級是個位數，
    且 suspended 時實際無聲），但這是「聽不到聲音」之外的第二個後果。

    **§11 的處置**：維持現狀，不在元件內處理。要跨 mount 去重就得把「已播過」寫進
    localStorage，遠超 spec 範圍；而 `useRef` 的行為本身是 React 的定義，不是實作瑕疵。

    **候選解法（需人類裁決）**：
    1. 維持現狀 —— 重整後再響一次視為可接受（甚至可能是想要的：使用者重整回來，
       提示他這一輪時間已到）。
    2. `page.tsx` 掛載時加條件（例如只在 `startedAt` 晚於本次頁面載入時間時才掛載）
       —— 正確的接線點在 page 層，**不是** `RoundTimerBanner` 或 `round-timer-sound.ts`。
    3. 把「已播過」持久化 —— 成本最高，需要新的 storage 欄位或 key。

    在裁決之前 apply **維持解法 1**（現狀），並以本條留痕。
