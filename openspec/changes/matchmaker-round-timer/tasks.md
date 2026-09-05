# Tasks: matchmaker-round-timer

> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**：`lib/matchmaker/round-timer-sound.ts`（純瀏覽器 Web Audio API 呼叫）、
> `app/matchmaker/page.tsx` 屬本 workspace 的 TDD 例外層（見 `nextjs-pickball/CLAUDE.md` 與
> design Decision 6），以 E2E／元件層注入驗收。§4.7、§11 的部分測試很可能加入即綠——
> 若如此，MUST 在該項後方誠實標註為 **regression guard**，**SHALL NOT 用「改斷言看紅再改回」
> 偽造紅燈**。
>
> **本 change 不得新增任何 npm 相依**（design Goals；提示音全由 Web Audio API 即時合成）。
> 需要新套件時回報 BLOCKED。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 的假設從推測變成事實，
> 避免 §2 之後整批建立在錯的介面上。

- [ ] 1.1 確認目前 cwd 為 environment.md 宣告的路徑（本批不用 git worktree，即主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`）且已切到 `change/matchmaker-round-timer` 分支，且 baseline `pnpm test` 全綠；把 baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [ ] 1.2 確認 `main` 上 **M13（`matchmaker-player-swap`）已合併**：讀 `nextjs-pickball/lib/matchmaker/round.ts`、`hooks/useRoundStore.ts`、`app/matchmaker/page.tsx`，確認三者存在且含 M13 的產出（記錄三者目前的完整匯出清單與 `page.tsx` 取得「目前回合」與「名單」的方式）。**不存在則立即停止並回報**，SHALL NOT 在本 change 內補做 M13（見 proposal 的「執行相依」）
- [ ] 1.3 讀 `round-types.ts` 與 `round-settings.ts`，記錄 `RoundTargetScoreSchema`／`TARGET_SCORE_OPTIONS`／`DEFAULT_TARGET_SCORE` 與 `RoundSettings` 介面的既有寫法，供 §2／§3 比照撰寫 `RoundTimerDurationMinutesSchema` 等對應物，SHALL NOT 另創一套風格
- [ ] 1.4 讀 `round.ts` 的 `createRound`／`setTargetScore`／`resetIncompleteMatches` 三個函式全文，記錄各自的失敗代碼結構、訊息常數命名與回傳物件的建構方式（逐欄列舉 vs 物件展開）。與 design Decision 4 的假設逐項比對，差異一律補記進 `design.md` 的 Open Questions，不要默默改實作遷就假設
- [ ] 1.5 讀 `scoreboard-binding.ts` 的 `isTargetScoreLocked` 全文與其私有 `TARGET_SCORE_LOCKED_REASON` 常數，確認簽章與 design Decision 2 的假設一致
- [ ] 1.6 讀 `RoundControls.tsx` 與 `RoundControls.test.tsx` 全文，記錄現有 props 清單、目標分數選擇器的 radiogroup／鎖定顯示實作模式，以及既有全部 it 名稱清單（避免 §9 撞名）
- [ ] 1.7 讀 `useRoundStore.ts` 全文，記錄現有 action 清單與 `setTargetScore` 的接線模式（呼叫純函式 → 判 `ok` → dispatch），供 §8 比照
- [ ] 1.8 讀 `labels.ts` 現況與 `app/matchmaker/page.tsx` 全文，確認新增常數命名不與既有常數衝突、確認掛載點位置；確認 `nextjs-pickball/package.json` 目前無任何計時或音效相關相依（本 change 結束時此事實 MUST 不變）

## 2. 回合資料模型的計時 schema（round-types.ts）

Depends on: §1

- [ ] 2.1 RED: 於 `nextjs-pickball/lib/matchmaker/round-types.test.ts` 補兩個 it：「計時長度僅接受 10、15、20 分鐘」、「回合資料缺少 timer 欄位時以 null 通過驗證，向後相容既有資料」。跑單檔確認紅燈並貼出輸出
- [ ] 2.2 GREEN: 新增 `RoundTimerDurationMinutesSchema`（`z.union([z.literal(10), z.literal(15), z.literal(20)])`）、`RoundTimerObjectSchema`（`{ durationMinutes, startedAt: z.iso.datetime().nullable() }`）、`RoundTimerSchema`（`RoundTimerObjectSchema.nullable().default(null)`）、`ROUND_TIMER_DURATION_OPTIONS`（由 schema options 推導，比照 `TARGET_SCORE_OPTIONS` 寫法，SHALL NOT 另寫死 `[10, 15, 20]`）；於 `RoundSchema` 新增 `timer: RoundTimerSchema` 欄位
- [ ] 2.3 REFACTOR: 確認具名匯出與既有 `TARGET_SCORE` 系列命名風格一致；匯出 `RoundTimer`／`RoundTimerDurationMinutes` 型別；確認註解記錄「為何以 `.nullable().default(null)` 向後相容既有 `matchmaker:round:v1` 資料且不 bump storage key」

## 3. 每輪設定的計時預設值（round-settings.ts）

Depends on: §1

- [ ] 3.1 RED: 於 `nextjs-pickball/lib/matchmaker/round-settings.test.ts` 補 it「每輪設定預設計時為不計時」。確認紅燈
- [ ] 3.2 GREEN: `RoundSettings` 介面新增 `timerDurationMinutes: RoundTimerDurationMinutes | null`；`createRoundSettings()` 回傳值補 `timerDurationMinutes: null`
- [ ] 3.3 REFACTOR: 確認型別匯入路徑（`from "./round-types"`）與既有欄位（`targetScore`）風格一致

## 4. 計時的產生、變更與開始（round.ts）

Depends on: §2, §3

- [ ] 4.1 RED: 於 `nextjs-pickball/lib/matchmaker/round.test.ts` 補 it「產生本輪時依設定決定計時長度，未指定時 timer 為 null」。確認紅燈
- [ ] 4.2 GREEN: `CreateRoundInput` 新增 `readonly timerDurationMinutes?: RoundTimerDurationMinutes | null`；`createRound()` 解構 `timerDurationMinutes = null` 為預設，並在建構的 `round` 物件加入 `timer: timerDurationMinutes === null ? null : { durationMinutes: timerDurationMinutes, startedAt: null }`
- [ ] 4.3 RED: 補 it「所有場次皆為 pending 時可改計時設定並重置為未開始，已有場次離開 pending 時拒絕」。確認紅燈
- [ ] 4.4 GREEN: 新增 `SET_TIMER_DURATION_FAILURE_CODE`、`SetTimerDurationResult` 型別與 `setTimerDuration(round, durationMinutes)` 函式，鎖定條件比照 `setTargetScore`（`round.matches.some((m) => m.status !== "pending")`），成功時一律回傳全新的 `timer` 物件（`startedAt` 重置為 `null`，design Decision 3）
- [ ] 4.5 RED: 補兩個 it「已設定計時長度且尚未開始時，開始計時寫入 startedAt」、「未設定計時長度或計時已開始時拒絕再次開始並回傳可判讀訊息」。確認紅燈
- [ ] 4.6 GREEN: 新增 `START_TIMER_FAILURE_CODE`、`StartTimerResult` 型別與 `startTimer(round, now)` 函式：`timer === null` 或 `timer.startedAt !== null` 時拒絕，否則寫入 `startedAt` 為 `now`
- [ ] 4.7 RED: 補兩個 it「重排未完成場次不重置計時」、「產生新一輪時即使沿用相同計時長度，timer 仍重新起算且 startedAt 為 null」。**預期兩者皆因既有 `resetIncompleteMatches` 的物件展開實作與 4.2 的建構方式而立即全綠**（design Decision 4）——若如此 MUST 在本項後方誠實標註為 **regression guard**，SHALL NOT 為了製造紅燈而先破壞 `resetIncompleteMatches` 或 `createRound` 的既有實作
- [ ] 4.8 REFACTOR: 確認失敗代碼常數、訊息常數命名與既有 `SET_TARGET_SCORE_FAILURE_CODE` 系列風格一致；確認 `setTimerDuration`／`startTimer` 皆為純函式，零就地修改傳入的 `round` 參數

## 5. 倒數與到期的純函式判定（round-timer.ts）

Depends on: §2

- [ ] 5.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round-timer.test.ts`，寫入三個 it：「剩餘秒數依經過時間遞減，超過設定長度後夾在 0 不為負數」、「剩餘秒數格式化為兩位數的 mm:ss」、「remainingSeconds 與 isExpired 皆為純函式，不修改輸入的 timer」。確認紅燈
- [ ] 5.2 GREEN: 實作 `remainingSeconds(timer, nowIso)`、`isExpired(timer, nowIso)`、`formatRemaining(seconds)`；`timer` 為 `null` 或 `startedAt` 為 `null` 時 `remainingSeconds` 回傳 `null`、`isExpired` 回傳 `false`
- [ ] 5.3 REFACTOR: 確認本檔零 `window`／`document`／`setInterval`／`new Date()`／`Date.now()` 引用；確認三個函式的參數皆不接受 `Round` 或 `RoundMatch[]`（design Decision 5：型別簽章上物理排除「時間到自動改場次狀態」的可能）

## 6. 時間到的提示音（round-timer-sound.ts，例外層）

Depends on: §1

- [ ] 6.1 GREEN（例外層，不強制紅燈）: 新增 `nextjs-pickball/lib/matchmaker/round-timer-sound.ts`，實作 `playTimerExpiredChime(): void`：建構 `AudioContext` → `OscillatorNode` → 短暫 `gain` 包絡 → 自動停止；執行環境未提供 `AudioContext` 時安全返回，不拋出例外
- [ ] 6.2 REFACTOR: 於檔頭以繁體中文註解說明本檔為何是例外層（無分支決策、以 E2E／元件層注入驗收，比照 `scene-canvas.ts` 的既有先例），並記錄與 `useRoundTimer.ts` 的分工邊界（design Decision 6：一個是持續的時間來源、一個是一次性的副作用，不合併在同一檔）

## 7. 每秒 tick 的計時 hook（useRoundTimer.ts）

Depends on: §5

- [ ] 7.1 RED: 新增 `nextjs-pickball/hooks/useRoundTimer.test.ts`，寫入 it「每秒更新剩餘秒數，超過設定長度後 expired 回傳 true」（使用 `vi.useFakeTimers()`）。確認紅燈
- [ ] 7.2 GREEN: 實作 `useRoundTimer(timer)`：以 `useState` 持有目前時間 ISO 字串，`useEffect` 內 `setInterval` 每秒更新，回傳 `{ remainingSeconds, expired }`（呼叫 §5 的純函式取得）；`timer` 為 `null` 或 `startedAt` 為 `null` 時不啟動 interval
- [ ] 7.3 REFACTOR: 確認本 hook 是本 change **唯一**的 `setInterval`／`new Date()` 呼叫點；確認 interval 於 unmount 或 `timer` 變動時正確清除，不遺留計時器

## 8. hooks 歸屬清單同步（pickleball-guide-page）

Depends on: §7

- [ ] 8.1 RED（既有測試因 §7 新增檔案而轉紅，非新寫測試）: 執行 `pnpm --filter ./nextjs-pickball test --run hooks/hooksInventory.test.ts`，確認既有 it「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」因 `hooks/useRoundTimer.ts` 已存在但規格清單尚未更新而**真的轉紅**，貼出輸出
- [ ] 8.2 GREEN: 於 `openspec/specs/pickleball-guide-page/spec.md` 的歸屬清單加入 `useRoundTimer` → `round-lifecycle` 一行（比照本 change `specs/pickleball-guide-page/spec.md` 已寫好的 MODIFIED 內容原樣套用）；重跑 `hooksInventory.test.ts` 確認兩條既有 it 皆轉綠

## 9. useRoundStore 接線（setTimerDuration／startTimer）

Depends on: §4

- [ ] 9.1 RED: 於 `nextjs-pickball/hooks/useRoundStore.test.tsx` 補 it「重新掛載後仍保留已開始計時的 timer，startedAt 不被重置」。確認紅燈
- [ ] 9.2 GREEN: `useRoundStore` 新增 `SET_TIMER_DURATION`／`START_TIMER` 兩個 reducer action；實作 `setTimerDuration(durationMinutes)`／`startTimer()` 兩個回傳方法，比照既有 `setTargetScore` 的「呼叫純函式 → 判 `ok` → dispatch」形態，`now` 由呼叫端以 `new Date().toISOString()` 注入
- [ ] 9.3 REFACTOR: 確認兩個新方法的回傳型別與既有 `UseRoundStoreResult` 其餘方法風格一致；`state.round` 為 `null` 時的型別安全防線訊息比照既有 `NO_ROUND_TO_SET_TARGET_SCORE_MESSAGE` 命名風格

## 10. 計時設定與開始計時的 UI（RoundControls.tsx）

Depends on: §2, §3, §4, §9

- [ ] 10.1 RED: 於 `nextjs-pickball/components/matchmaker/RoundControls.test.tsx` 補兩個 it：「計時選項為不計時／10／15／20 分鐘且預設選中不計時」、「本輪已開始計分時計時控制項 disabled 並顯示鎖定原因」。同時更新 `buildProps()` 輔助函式，補上必填的 `setTimerDuration`／`startTimer` 兩個 `vi.fn()` 預設值（既有 4 個 it 的斷言與名稱不變，僅共用 fixture 補值）。跑單檔確認新增兩個 it 紅燈，且既有 4 個 it 因 fixture 更新後仍維持綠燈
- [ ] 10.2 GREEN: 於 `RoundControls.tsx` 新增計時 `radiogroup`（不計時／10／15／20 分鐘四個選項），沿用目標分數選擇器的 WAI-ARIA radiogroup 鍵盤導覽模式（`nextRadioIndex`）；鎖定狀態委派 `isTargetScoreLocked(round, matchSlots)` 的 `locked` 布林值，鎖定原因顯示 `labels.ts` 新增的 `ROUND_TIMER_LOCKED_REASON`（**不重用** `isTargetScoreLocked` 回傳的 `reason`，design Decision 2）
- [ ] 10.3 RED: 補三個 it：「已設定計時長度且尚未開始時顯示可點擊的開始計時按鈕」、「不計時或計時已開始時不顯示開始計時按鈕」、「點擊開始計時會呼叫注入的 startTimer 一次」。確認紅燈
- [ ] 10.4 GREEN: 新增「開始計時」按鈕，顯示條件為 `round.timer !== null && round.timer.startedAt === null`（不符合時**不渲染**，非 `disabled`）；點擊委派 `props.startTimer`
- [ ] 10.5 REFACTOR: 確認計時區塊與目標分數區塊共用同一套 radiogroup 鍵盤導覽模式而非各寫一份；確認未重用 `isTargetScoreLocked` 的 `reason` 給計時區塊顯示；確認新 props 命名與既有（`setTargetScore`）風格一致，非 `onXxx` 命名（比照既有 `setTargetScore` 的先例，屬注入的相依而非事件回呼）

## 11. 倒數顯示與時間到提示（RoundTimerBanner.tsx）

Depends on: §7, §6

- [ ] 11.1 RED: 新增 `nextjs-pickball/components/matchmaker/RoundTimerBanner.test.tsx`，寫入 it「倒數期間顯示 mm:ss 格式的剩餘時間且每秒遞減」。確認紅燈
- [ ] 11.2 GREEN: 實作 `RoundTimerBanner` 骨架：`timer` 為 `null` 或 `timer.startedAt` 為 `null` 時回傳 `null`；否則呼叫 `useRoundTimer(timer)`，顯示 `formatRemaining(remainingSeconds ?? 0)`
- [ ] 11.3 RED: 補兩個 it：「時間到時顯示帶 role alert 的時間到大字與繁體中文提示文案」、「時間到時播放提示音，同一次到期不因重新渲染而重複播放」（第二個以可選注入 prop 傳入計數用假函式驗證，預設值為 `playTimerExpiredChime`）。確認紅燈
- [ ] 11.4 GREEN: `expired` 為 `true` 時渲染 `role="alert"` 大字「時間到」＋`labels.ts` 的 `ROUND_TIMER_EXPIRED_MESSAGE`；`useEffect` 監看 `expired` 由 `false` 轉 `true` 時呼叫注入的音效函式一次，以 `useRef` 旗標防止同一次到期重複播放
- [ ] 11.5 REFACTOR: 確認「時間到」的視覺呈現為**靜態文字**、零任何 CSS 動畫或 `animate-*` utility（design Decision 7）；確認音效注入點的 props 命名與 `printer?`（M9 `ExportActions` 先例）同構

## 12. 頁面掛載與 E2E

Depends on: §10, §11

- [ ] 12.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/round-timer.spec.ts`，寫入兩個 test：「計時到期不自動結束任何場次，仍可手動送出比分」、「開始計時後快轉至到期會顯示時間到並觸發一次提示音」（後者以 `page.clock` 快轉、`addInitScript` stub `window.AudioContext` 為記錄呼叫次數的假建構函式）。種子資料的產生方式沿用既有 `match-stage.spec.ts`／`visual-export.spec.ts` 的 `seedRoster` helper 慣例（於本檔案內建立同構的區域函式）。確認紅燈（畫面尚無計時控制項與 `RoundTimerBanner` 可互動）
- [ ] 12.2 GREEN: 於 `app/matchmaker/page.tsx` 掛入 `RoundTimerBanner`（傳入 `round?.timer ?? null`），並把 `setTimerDuration`／`startTimer` 傳給 `RoundControls`
- [ ] 12.3 REFACTOR: 確認 `page.tsx` 只新增掛載與 prop 傳遞，未混入任何計時邏輯本體；新增節點的 `data-print` 包裝比照既有操作控制項慣例（design Decision 8：不修改 `MatchStage.tsx`／`CourtCard.tsx`／`RestingPanel.tsx` 任何一個檔案，`git diff --stat` 機械確認）

## 13. 收尾驗證

- [ ] 13.1 逐條核對三份 delta spec（`specs/round-lifecycle/spec.md`、`specs/match-stage/spec.md`、`specs/pickleball-guide-page/spec.md`）的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**
- [ ] 13.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 全綠，貼出輸出
- [ ] 13.3 `pnpm --filter ./nextjs-pickball test --run hooks/` 全綠，貼出輸出
- [ ] 13.4 `pnpm --filter ./nextjs-pickball test --run components/matchmaker/` 全綠，貼出輸出
- [ ] 13.5 `pnpm lint` 通過（0 errors；既有 warning 清單不得新增）
- [ ] 13.6 `pnpm -r exec tsc --noEmit` 通過
- [ ] 13.7 `pnpm test` 全套（`-r`，前後端）通過，確認未破壞 M1～M13 既有測試與 `hono-pickball` 後端測試
- [ ] 13.8 `pnpm --filter ./nextjs-pickball test:e2e --workers=1` 全套通過，**五個 browser project 皆跑**；`round-timer.spec.ts` 與既有 E2E 一律原樣通過（`page.clock`／`AudioContext` stub 在 WebKit／Mobile Safari 上的行為若與 Chromium 不同，依 execution-plan 的升級條件處理，SHALL NOT 靜默 `test.skip`）
- [ ] 13.9 `git diff main --stat -- pnpm-lock.yaml package.json nextjs-pickball/package.json hono-pickball/package.json` 為空（本 change 零新增相依，比照 `matchmaker-runbook-m10-m15.md` 的 coordinator 獨立驗證指令）；`git diff --stat` 確認 `app/globals.css`、`components/matchmaker/MatchStage.tsx`／`CourtCard.tsx`／`RestingPanel.tsx`、`lib/matchmaker/scoreboard-binding.ts` 皆零改動
- [ ] 13.10 `DO_NOT_TRACK=1 openspec validate matchmaker-round-timer --strict` 通過
- [ ] 13.11 對本 change 的三份 delta spec 各跑一次 root `CLAUDE.md` 指定的 python 計數法，檢查 `### Requirement:`／`#### Scenario:` 標題有無重複，**不得用 BSD `uniq`**
- [ ] 13.12 確認「本 change 唯一容許變動的既有測試」清單，其餘既有測試轉紅一律視為迴歸：① `RoundControls.test.tsx` 的 `buildProps()` 輔助函式新增 `setTimerDuration`／`startTimer` 兩個 `vi.fn()` 預設值（既有 4 個 it 的斷言與名稱不變）；② `useRoundStore.test.tsx` 新增第 9.1 項的 1 個 it（既有 it 皆未修改）；③ `round-types.test.ts`／`round-settings.test.ts`／`round.test.ts`／`hooks/hooksInventory.test.ts` 僅新增或因 §8.1 的既有守衛而暫時轉紅再轉綠，未修改任何既有 it 的斷言或名稱
