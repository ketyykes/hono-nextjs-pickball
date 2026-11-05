# Design: round-settings-follow-round

## Context

- 設定狀態：`nextjs-pickball/app/matchmaker/page.tsx` 約 :88 `const [settings, setSettings] = useState<RoundSettings>(() => createRoundSettings())`；
  :262-264 傳 `settings`／`onSettingsChange={setSettings}` 給 `RoundControls`，:291 的 `EmptyStage` 以 `handleGenerate(settings)` 產生。頁面元件在路由切換（`/matchmaker` ↔ `/matchmaker/players`）時卸載，state 隨之消失。
- `RoundSettings`（`lib/matchmaker/round-settings.ts`）為 `{ format, courtCount, targetScore, timerDurationMinutes }`；`Round`（`packages/pickball-core/src/matchmaker/round-types.ts` :192-201）同時帶 `format`、`courtCount`、`targetScore`、`timer`（`null` 或 `{ durationMinutes, startedAt }`）。
  `createRound`（核心 `round.ts` :268-328）把四項設定原樣寫進回合；`resetIncompleteMatches` 以 `...round` 沿用（:645），`round.courtCount` 始終是使用者選的場地數，不是實際分到的場數。
- `RoundControls.tsx`：
  - 顯示：對戰方式與場地數讀 `settings`（:201、:225）；目標分數與計時在回合存在時讀回合（:99、:103-105）。
  - 變更：對戰方式、場地數一律 `onSettingsChange`（:120-126）；目標分數、計時在回合存在時只委派 `setTargetScore`／`setTimerDuration`（:131-137、:161-168），不回呼 `onSettingsChange`。
  - 產生：`onGenerate(settings)`（:311）。
  - 方向鍵：目標分數以 `settings.targetScore` 起算（:143）；計時已改以 `displayedTimerDuration` 起算（:179，既有 it「計時方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」）。
- 回合來源：`hooks/useRoundStore.ts`。訪客模式 mount 後由 `HYDRATE` 自 LocalStorage 灌入（首個 render 為 `null`）；登入模式走 `useRemoteRoundStore`，載入中 `syncStatus === "loading"`，此時 `page.tsx` :206-214 以 `SyncStatusNotice` **取代整頁內容**（`RoundControls` 不渲染）。
- 主 spec `match-stage`「本輪設定控制項的預設值與範圍」「目標分數選擇器」「產生本輪與重設／再排的操作入口」：前者的預設值 Scenario 驗的是 `createRoundSettings()`（全新設定）與「尚無目前回合時」的控制項；後者要求「帶入目前的對戰方式、場地數與目標分數」。三者對「回合存在時設定列從哪裡來」「離開後是否保留」「回合存在時的變更是否帶到下一輪」皆沉默。
- `page.tsx` 屬 TDD 例外層（`nextjs-pickball/CLAUDE.md`「入口與配置（`app/**/page.tsx`…）」），因此解析邏輯放 `lib/`、頁面只接線、以 E2E 驗收。

## Goals

- 設定列顯示值 ≡「產生本輪對戰」送出值 ≡ 由目前回合與本次掛載後的變更解析出的同一份設定。
- 離開對戰頁再回來，設定列與舞台上的回合一致。
- 回合存在時改的目標分數與計時，下一輪沿用。
- 不新增儲存 key、不加 effect、訪客與雲端同一條路徑。

## Non-Goals

- 產生下一輪前的確認對話框。
- 「回合存在時點『不計時』無反應」的既有缺口（`RoundControls.tsx` :156-163 的暫行處置，需核心補 `clearTimer` 類入口另案定案）。
- 回合存在時對戰方式／場地數是否可改的規則（維持可改，作為下一輪的預備值）。
- 保存「變更過但尚未產生」的設定跨頁面存活（Decision 2）。
- 後端、`packages/pickball-core`、`hooks/**` 的任何改動。

## Decisions

### Decision 1：以「draft ＋ 目前回合」在 render 中解析，而非 effect 帶入

**Choice**：`page.tsx` 的 state 改為 `draft: RoundSettings | null`（初始 `null`，`onSettingsChange` 寫入）；每次 render 以 `resolveRoundSettings(draft, round)` 求出 `settings` 傳給 `RoundControls` 與 `EmptyStage`。解析規則見 delta spec。

**Rationale**：
- 「使用者動過設定」的判定就是 `draft !== null`，不需要額外的 touched 旗標或 ref；回合任何更新（`HYDRATE`、雲端載入完成、`setTargetScore`、送出比分、另一個分頁產生新回合）都不會覆蓋 `draft`，也就不會把使用者剛改的值蓋回去。
- 沒有 effect，因此沒有「回合晚到時何時帶入」的時序問題：雲端回合載入前 `round === null` 時頁面本來就不渲染設定列；載入完成的那一次 render 就直接解析出回合的值。訪客 `HYDRATE` 前的首個 render 為預設值，下一個 render 即為回合的值，與現行「舞台由空白切到回合」同一個時點。
- 也避開 ESLint `react-hooks/set-state-in-effect`（`page.tsx` 已為此把 matchSlots 改用 `useReducer`）。

**Alternatives considered**：
- coordinator 建議的「回合載入且未動過設定時，以 effect 一次性把回合的值寫進 settings」：需要 touched 旗標＋「是否已帶入過」旗標兩個狀態，且 effect 在回合每次變動時都要判斷要不要再帶一次（例如另一個分頁產生了新回合）；規則等價時 render 中解析較少狀態。不選。
- 不改頁面、改在 `RoundControls` 內以回合覆蓋 `settings` 的顯示：顯示與 `onGenerate(settings)` 會再度分岔，而且元件內多一處「回合存在與否」的判斷。不選。

### Decision 2：回合存在時目標分數與計時一律取回合，不寫回 draft

**Choice**：`resolveRoundSettings` 在回合存在時 `targetScore = round.targetScore`、`timerDurationMinutes = round.timer?.durationMinutes ?? null`，不論 `draft`。`RoundControls` 的 `handleTargetScoreChange`／`handleTimerDurationChange` **不改**（仍只委派回合入口）。

**Rationale**：
- 回合存在時這兩個控制項顯示的本來就是回合的值（:99、:103），變更也只寫進回合；讓解析結果直接讀回合，等於「顯示值＝送出值」由結構保證，而不是靠兩處都記得同步寫。
- coordinator 建議的「變更時同步寫回設定」在本設計下是多餘的：寫回會讓 `draft` 由 `null` 變成非 `null`，反而使對戰方式／場地數從此不再跟隨回合（例如另一分頁改了回合）。
- 回合鎖定（已開始計分）時兩個控制項為 disabled，使用者本來就無法為下一輪預選分制或計時——這是既有行為，不因本 change 改變；下一輪沿用本輪的值，正是畫面上看到的值。

**Alternatives considered**：寫回 `draft`（coordinator 方向 2）：行為在多數情境等價，但多一條寫入路徑與一個要改的元件 handler，且有上述副作用。不選。

### Decision 3：不新增儲存 key，變更過但未產生的設定離開即放棄

**Choice**：`draft` 只活在頁面元件的 state；離開對戰頁即消失，回來後設定列跟隨目前回合（無回合則為預設值）。

**Rationale**：使用者回報的問題是「設定與舞台不一致」，以回合作為來源即可消除；持久化 `draft` 需要新的 LocalStorage key、雲端欄位或 schema 決策（訪客與登入要一致），範圍遠超一個晚上。放棄未產生的變更，結果仍與畫面上的回合一致，不會靜默改掉賽制。

**Alternatives considered**：新增 `matchmaker:settings:v1` 之類的 key：需要遷移與重置名單時的清除清單、雲端模式的對應；不選。

### Decision 4：目標分數方向鍵起算值改為 `displayedTargetScore`

**Choice**：`RoundControls.tsx` :143 由 `settings.targetScore` 改為 `displayedTargetScore`。

**Rationale**：Decision 2 之後，由 `page.tsx` 傳入的 `settings.targetScore` 在回合存在時恆等於回合值，E2E 層已看不出差別；但元件的契約（任何呼叫端傳入的 `settings`）下兩者仍可分岔，計時已有同類修正與 it，這裡比照補齊。單元 it 以「回合 15、settings 11、按右鍵應呼叫 21」取得真紅。

**Alternatives considered**：不改（靠頁面保證）：元件內兩個 radiogroup 的起算規則不一致，日後換呼叫端就回到 bug。不選。

### Decision 5：以 ADDED 新 Requirement 表達，不 MODIFY 既有三個 Requirement

**Choice**：在 `match-stage` 新增「本輪設定跟隨目前回合」。

**Rationale**：既有 Requirement 的預設值規範仍然成立（全新設定與無回合時的預設），本 change 是在它們沉默處補規則；MODIFY 需複製三個長區塊，放大 delta 與並行 change 的衝突面而不改變任何既有 Scenario。

### Decision 6：E2E 放在 `match-stage.spec.ts`，走區段導覽的真實路徑

**Choice**：兩條 test 皆在 describe「/matchmaker 對戰頁」末尾，沿用檔內 `seedRoster` 與 `beforeEach`：
- 「離開對戰頁再回來時本輪設定與目前回合一致」：`seedRoster(page, 8)` → `goto("/matchmaker")` → 點「雙打」、「增加場地數」一次、目標分數「15」→「產生本輪對戰」→ 場地網格數 2 → 區段導覽「參賽者」→「對戰」→ 等 `match-stage-region` 可見且網格數 2 → 斷言「雙打」`aria-checked="true"`、「減少場地數」`toBeEnabled()`、「15」`aria-checked="true"` → 記下第一個網格的 `data-testid` → 「產生本輪對戰」→ 該 testid `toHaveCount(0)` 且網格數 2。
- 「回合存在時變更的目標分數與計時沿用到下一輪」：`seedRoster(page, 4)` → `goto` → 「產生本輪對戰」→ 網格數 1 → 點「21」、「10 分鐘」並各自斷言 `aria-checked="true"` → 記下網格 testid →「產生本輪對戰」→ 舊 testid `toHaveCount(0)`、網格數 1 →「21」與「10 分鐘」`aria-checked="true"`、「開始計時」按鈕可見。

**Rationale**：
- 區段導覽是使用者回報的路徑（client-side 導覽卸載頁面元件）；「減少場地數」的 enabled 狀態是場地數 2 的可觀察代理（場地數 1 時 disabled，既有 Scenario「邊界時加減按鈕為 disabled」），不需讀 `aria-live` 數字的文字節點。
- 第一條的「15 為選中」在現行實作也成立（顯示讀回合），保留作為一致性斷言；真紅點在「雙打」與「減少場地數」。第二條在現行實作會於新一輪「21」斷言失敗（產生時送出設定內的 11）。
- 同步點一律 web-first（`toHaveCount`），不用 `waitForTimeout`；以舊網格 testid 消失作為新一輪就緒的同步點（同 `scoreboard-binding.spec.ts` 先例）。

**Alternatives considered**：`page.goto` 全頁重新載入代替區段導覽：同樣會卸載頁面，但不是使用者回報的路徑；不選。雲端模式 E2E：解析邏輯與儲存模式無關（只讀 `round`），以 `user-data/round-sync.spec.ts` 既有 test 作 regression guard；不新增。

## Risks / Trade-offs

- [Risk 1]「不計時」缺口被放大：現行實作下，回合帶計時後，使用者唯一回到不計時的方法是「離開對戰頁再回來」（設定被意外重置為預設）；本 change 修掉重置後，**一旦某輪設了計時，之後每一輪都沿用，回合存在時無法改回不計時**（只有重置名單讓回合消失才行）。
  → 接受：這是既有的「回合存在時點『不計時』無反應」缺口（`RoundControls.tsx` 的 ⚠️ 註解明列待定案），不是本 change 新增的規則；修正需要核心補入口，違反本 change「不改核心」的範圍。**建議下一個 change 優先處理**（於 tasks §4 的文件 task 記錄此後續事項）。本 change 不以 hack 繞開（例如回合存在時點「不計時」只改 `draft`）：那會讓畫面顯示（回合的計時）與送出值再度分岔，正是本 change 要消除的問題。
- [Risk 2]「使用者動過設定」的判定：`draft !== null` 只由 `onSettingsChange` 寫入（對戰方式、場地數、以及無回合時的目標分數／計時）。回合的任何更新都不寫 `draft`，因此不會覆蓋使用者剛改的值；反過來，使用者一旦改過對戰方式或場地數，其後另一個分頁產生的新回合不會再把這兩項帶回設定列——這是「使用者的明確操作優先」的取捨，與現行行為相同。
- [Risk 3] 雲端模式回合晚到：載入中整頁被 `SyncStatusNotice` 取代，使用者無法在回合就緒前變更設定，`draft` 必為 `null`；就緒的那一次 render 即解析出回合的值。auth 解析期間若先以本機 store 渲染再切到雲端 store，`round` 換成雲端回合時解析結果隨之更新（`draft` 仍為 `null`）。未新增雲端 E2E，風險由既有 `round-sync.spec.ts` 守住「頁面可正常產生與還原回合」。
- [Risk 4] 既有測試是否依賴「回到頁面後設定為預設值」：propose 時以腳本列出所有在同一條 test 內產生兩次以上或導覽兩次以上的 E2E（`match-stage.spec.ts`、`scoreboard-binding.spec.ts`、`visual-export.spec.ts`、`user-data/*.spec.ts`），逐一確認其第二次產生都在同一次頁面掛載內、或之前回合已被重置名單清除；`scoreboard-binding.spec.ts` 的 `generateRound` helper 每次 `goto` 後以「增加場地數」從預設 1 加起，但每條 test 只在 `beforeEach` 清空回合後呼叫一次。RoundControls 單元測試直接傳 `settings`，不經 `page.tsx`。**結論：無既有斷言依賴預設值重置，無授權修改的既有測試**。apply §1 MUST 以 `grep -n "generateRound(page" tests/e2e/specs/scoreboard-binding.spec.ts` 等再確認一次；若 `main` 已有新 test 在回合存在時重新進入對戰頁並依賴預設值，停止並上報（不得自行改既有 test）。
- [Risk 5] 並行 change `site-not-found-and-nav-active` 可能改動區段導覽或 `match-stage.spec.ts`：本 change 只在 describe 末尾新增兩條 test、以連結名稱「參賽者」「對戰」定位；apply §1 對齊 main 時確認導覽連結名稱未變。
- [Risk 6] 第一條 E2E 需要 8 名可出場參賽者（雙打 2 場）：`seedRoster` 的 `buildTestPlayer` 預設皆可出場；若 fixture 預設不同，Implementer 依 fixture 調整人數並記錄，不改斷言意圖。

## Migration Plan

無資料或 schema 遷移；不新增相依、不新增儲存 key。只影響前端 Worker，部署照 README「部署前手動檢查清單」。回滾：revert 三個產品檔與三個測試檔的提交即可。

## Open Questions

（無；設計裁量皆已於 Decisions 定案。apply 階段遇到阻礙時附加於此。）

- apply 記錄（非阻礙，供後續參考）：Stage 2 指出登入狀態下換帳號時對戰頁不會 remount，前一帳號變更過的對戰方式／場地數（`draft`）會沿用到新帳號的設定列；目標分數與計時仍取新帳號回合。符合 delta spec「本次進入對戰頁後變更過的設定」的字面意義，本 change 不處理。
