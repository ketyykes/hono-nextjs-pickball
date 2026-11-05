# Design: scoreboard-bound-game-over

## Context

- `nextjs-pickball/components/scoreboard/GameOverDialog.tsx`：`status === "finished"` 時自動開啟（`open = finished && !dismissed`），footer 只有「關閉」（`setDismissed(true)`）與「再來一局」（`onClick={onPlayAgain}`）。props 只有 `state`、`onPlayAgain`。
- `nextjs-pickball/components/scoreboard/Scoreboard.tsx` 約 :207：`<GameOverDialog state={state} onPlayAgain={() => dispatch({ type: "RESET" })} />`，**沒有二次確認**；ActionBar 的「重置」則經 AlertDialog「確定要重置比賽？」確認。
- 綁定模式（`/scoreboard?match=<id>`）：`app/scoreboard/page.tsx` 讀 `searchParams` 後以 `matchId` prop 注入 `Scoreboard`。`Scoreboard` 約 :156–160 已有註解說明設定列為何用 prop 而非 `state.matchId`：prop 在 mount 當下即已知，`state.matchId` 要等 read effect HYDRATE 後才有值，用 prop 可避免 pending 期間閃現獨立模式 UI。
- 對戰頁回填：本機模式由對戰頁讀分槽 `finished` 狀態自動送出比分並清槽；雲端模式以 `remoteMatchSlots` 為來源、由後端送出比分的 batch 刪除分槽（主 spec `match-stage`、`nextjs-pickball/CLAUDE.md`「對戰頁雲端模式」）。在對話框按「再來一局」→ RESET → 分槽回 `setup`、分數清空 → 回填條件不再成立；雲端模式下 RESET 還會經 `useRemoteMatchSlotStore` 把清空後的分槽 `PUT` 回去。
- 設定列的「返回對戰」（`ScoreboardSetup.tsx` 約 :157–161）：`<Button asChild variant="outline" size="sm"><Link href={MATCHMAKER_ROUTE}>返回對戰</Link></Button>`，`MATCHMAKER_ROUTE` 來自 `lib/matchmaker/section-nav.ts`（`"/matchmaker"`）。**該 Link 沒有帶 `transitionTypes`**（全站帶 `transitionTypes` 的只有 `HeroTourCta`、`AccountEntry`、`SiteNavbar`）。
- 專注模式下 `Scoreboard` 不渲染 `ScoreboardSetup`，設定列的「返回對戰」跟著消失；主 spec「對戰場次綁定與失效處理」把這寫成「預期行為——退出專注模式即可返回」。
- 場次失效：`Scoreboard` 在所有 hook 之後 `if (bindingStatus === "missing") return <MatchBindingNotice />`；雲端 `loading`／`load-failed` 也 early return。兩者都在 `GameOverDialog` 渲染之前，因此**失效與雲端阻斷狀態下對話框根本不會被渲染**。`pending` 期間 state 為初始值（`status === "setup"`），對話框也不會開啟。
- 主 spec `scoreboard`「賽前設定與階段鎖定」：「重置（RESET）…且 MUST 經二次確認才執行」，與對話框「再來一局」未經確認字面衝突；主 spec 對對話框的按鈕沒有任何規定（`emoji-free-ui` 只規定標題的獎盃圖示）。
- 既有測試：`GameOverDialog.test.tsx` 只有一個 it（標題圖示，`render(<GameOverDialog state={state} onPlayAgain={vi.fn()} />)`）；`scoreboard-binding.spec.ts` 的「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」與 `user-data/round-sync.spec.ts` 都是「按『關閉』→ 按設定列『返回對戰』」；`scoreboard.spec.ts` 沒有任何 test 點「再來一局」。

## Goals

- 綁定模式的比賽結束對話框不再提供會讓比分無法回填的 RESET 入口，改以「返回對戰」為主要動作，「關閉」保留。
- 專注模式下比賽結束後可直接回對戰頁（不必先退出專注模式）。
- 消除主 spec「RESET MUST 經二次確認」與「再來一局」之間的字面衝突，並把對話框的按鈕寫進規格。
- 獨立計分板零變更；reducer、分槽儲存、後端、對戰頁零變更。

## Non-Goals

- 為「再來一局」補二次確認。
- 綁定模式改為「再來一局但保留比分」之類的新流程，或在計分板端主動送出比分。
- 修改「對戰場次綁定與失效處理」中專注模式隱藏設定列返回入口的規則、修改 `MatchBindingNotice`。
- 雲端模式離開頁面時待送分槽是否送達（`createLatestWinsSaver` 於 unmount 時 `dispose`）——與設定列既有「返回對戰」完全相同的既有行為，不在本 change 處理（見 Risks）。

## Decisions

### Decision 1：綁定模式以 `matchId` prop 判斷，與設定列同源

**Choice**：`GameOverDialog` 新增可選 prop `matchId?: string | null`（預設 `null`）；`Scoreboard` 把自己收到的 `matchId` prop 原樣傳入（與傳給 `ScoreboardSetup` 的是同一個值），對話框內以 `matchId !== null` 判斷綁定模式。SHALL NOT 改傳 `state.matchId`。

**Rationale**：
- 沿用 `Scoreboard.tsx` 既有註解的理由：prop 在 mount 當下即已知，`state.matchId` 要等 HYDRATE。對話框只在 `finished` 時開啟，那時兩者實際上相等；但設定列與對話框若各用一個來源，日後任何一方的語意改動（例如 HYDRATE 失敗、或 state 重建漏帶 `matchId`——主 spec 曾為此專門寫 Scenario「UNDO 與 RESET 保留 matchId」）就會讓兩處對「是否綁定」看法分歧。同一來源是最保守的選擇。
- 可選 prop、預設 `null`，與 `ScoreboardProps` 的 `matchId = null` 同一慣例；既有 it 的 `render` 呼叫不需改動（遵守「既有 it 不得改」）。

**Alternatives considered**：
- 傳 `state.matchId`：功能上在 `finished` 時等價，但與設定列不同源。不選（列為 mutation 對照組：此變異預期存活，屬等價變異）。
- 必填 `matchId: string | null`（同 `ScoreboardSetup`）：可在型別層保證 `Scoreboard` 一定有傳，但必須修改既有 it 的 `render` 呼叫。改由 E2E（兩條新 test 在 `Scoreboard` 漏傳時必紅）守住接線。不選。
- 傳 `isBound: boolean`：與設定列的 prop 形狀不一致，`Scoreboard` 要多算一次。不選。
- 在 `GameOverDialog` 內呼叫 `useScoreboardStore` 或讀 URL：對話框目前是純呈現元件，引入 store 會讓它在測試中需要 mock 儲存層。不選。

### Decision 2：綁定模式的動作為「關閉」＋「返回對戰」連結，寫法照抄設定列

**Choice**：綁定模式 footer 依序為「關閉」（`variant="outline"`，與現狀相同）與「返回對戰」（主要按鈕樣式：`<Button asChild><Link href={MATCHMAKER_ROUTE}>返回對戰</Link></Button>`，不帶 `size="sm"`、與「再來一局」同尺寸）。「返回對戰」**不帶 `transitionTypes`**、不掛任何 `onClick`；`MATCHMAKER_ROUTE` 從 `lib/matchmaker/section-nav.ts` 匯入，SHALL NOT 寫死字串。獨立模式 footer 與現狀完全相同。

**Rationale**：
- coordinator 指示「沿用設定列既有寫法與 view transition 設定」；設定列的 Link 沒有 `transitionTypes`，照抄即為「不帶」，使兩個入口的轉場一致。
- 用 `Link` 而非 `router.push`：與設定列一致、可被 `getByRole("link")` 觀察 `href`、不需 mock `next/navigation`；不掛 `onClick` 從結構上保證「只導航、不 RESET、不寫分槽」。
- 「返回對戰」佔原「再來一局」的位置與主要樣式：footer 在窄螢幕是直向堆疊、寬螢幕右對齊，主要動作位置不變，使用者不必重新找按鈕。

**Alternatives considered**：
- 綁定模式只留「返回對戰」、移除「關閉」：使用者無法停在計分板上檢視終局比分（ESC／點遮罩仍可關閉，但那不是可發現的入口）。coordinator 指定保留。不選。
- 「返回對戰」帶 `transitionTypes={["nav-back"]}`：與設定列入口轉場不一致。不選。
- 綁定模式仍顯示「再來一局」但加二次確認：確認後照樣讓比分無法回填，沒有正當用途。不選。

### Decision 3：規格以 MODIFIED 一句＋ADDED 一個 Requirement 消除衝突

**Choice**：
- ADDED Requirement「比賽結束對話框的動作」：規定兩種模式的按鈕、判斷來源、「返回對戰」不觸發 RESET 與分槽寫入、專注模式下相同、失效狀態不渲染對話框。
- MODIFIED「賽前設定與階段鎖定」：只改 RESET 那一句，加上「唯一例外為獨立模式比賽結束對話框的『再來一局』（比賽已結束、終局比分已呈現、按鈕本身即明確意圖）；綁定模式對話框 SHALL NOT 提供任何觸發 RESET 的動作；ActionBar 的『重置』仍 MUST 經二次確認」。其餘段落與 14 個 Scenario 逐字保留（difflib 比對只有該行不同）。

**Rationale**：只用 ADDED 時，主 spec 那句「RESET MUST 經二次確認」字面上仍與「再來一局直接 RESET」矛盾，讀者要自行推論「特別規定優先」；改那一句是能消除字面衝突的最小改動。MODIFIED 必須複製整個區塊（約 120 行），但內容零變動、風險低。

**Alternatives considered**：
- 只 ADDED 並在新 Requirement 內聲明「為二次確認規則的例外」：主 spec 原句仍是無條件的 MUST，衝突沒有消除。不選。
- 同時 MODIFIED「對戰場次綁定與失效處理」的「返回動線」段：該段說的是**設定列**返回入口在專注模式下隱藏，本 change 不改變那件事，字面不衝突；新增的入口由 ADDED Requirement 交代。不選（範圍最小）。

### Decision 4：場次失效與雲端阻斷不另設對話框分支

**Choice**：`GameOverDialog` 不接收 `bindingStatus`，不為 `missing`／`pending` 寫任何分支；依賴 `Scoreboard` 既有的 early return（`missing` → `MatchBindingNotice`、雲端 `loading`／`load-failed` → `SyncStatusNotice`）讓對話框在這些狀態下根本不被渲染。規格以一句話記錄此事實。

**Rationale**：
- 這是最保守的方案：失效時使用者看到的是既有的失效說明與兩個出口（「回到對戰頁」「改用獨立計分板」），對話框不可能同時出現，任何新分支都是走不到的程式碼。
- `pending` 時 state 為初始值（`setup`），對話框不會開啟；即使綁定在比賽結束後才變成 `missing`（例如雲端衝突重載後發現分槽已刪），整個畫面也會被失效說明取代。

**Alternatives considered**：
- 把 `bindingStatus` 傳進對話框，`missing` 時改顯示「回到對戰頁」＋「改用獨立計分板」：與既有失效畫面重複且不可達。不選。
- 失效時對話框退回獨立模式的「再來一局」：會把分數計進無人接收的獨立槽——正是主 spec 禁止的「靜默退回獨立計分板」。不選。

### Decision 5：測試分層——元件 it 驗按鈕組成，E2E 驗接線與「不 RESET」

**Choice**：
- `GameOverDialog.test.tsx` 新增 3 個 it：綁定模式的連結 `href` 與「再來一局」不存在（**真紅**）；綁定模式「關閉」關閉對話框且 `onPlayAgain` 未被呼叫（預期 regression guard）；獨立模式兩按鈕、無「返回對戰」、點「再來一局」即呼叫 `onPlayAgain` 一次且無 `alertdialog`（預期 regression guard）。元件測試**不點擊**「返回對戰」連結（real `next/link` 在 happy-dom 無 app router context，點擊行為不可靠，也不是元件該保證的事）；`href` 以 `getAttribute("href")` 斷言（同 `LoginForm.test.tsx` 寫法），查詢範圍限定在 `getByRole("dialog")` 內。
- `scoreboard-binding.spec.ts` 的 `/matchmaker 對戰頁的計分板接線` describe 新增 2 個 test：一般模式與專注模式各一，打到 11:0 → 在 `page.getByRole("dialog")` 內點「返回對戰」→ 回到 `/matchmaker` 且該場顯示 `11:0`、第一隊勝。「比分已回填」即「沒有 RESET、沒有把分槽改回 setup」的端到端證據。一般模式那條另斷言對話框內「再來一局」`toHaveCount(0)`（現行程式碼下真紅）；專注模式那條在現行程式碼下因對話框內沒有「返回對戰」而真紅。
- 沿用該 describe 既有的 `seedRoster`、`generateRound`、`courtMatchId`、`clickWin`，不另寫 helper；不改 `scoreboard.spec.ts`。

**Rationale**：元件層能精準守住按鈕組成；`Scoreboard` 的接線（有沒有把 `matchId` 傳下去）與「按下不 RESET」只有整頁才看得到，交給 E2E。兩個 regression guard 是規格新寫下的既有行為（獨立模式、「關閉」），依規則誠實標註、不偽造紅燈。

**Alternatives considered**：
- 為 `Scoreboard` 寫元件測試：需要 mock `useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode`，成本高於收益，且專案慣例把整頁接線交給 E2E。不選。
- 在 `user-data/round-sync.spec.ts` 加雲端版 E2E：新入口與設定列入口同為無 `onClick` 的 `Link`，雲端差異只在分槽 store，而 store 不受本 change 影響；既有 round-sync test 已涵蓋「結束→返回→後端回填」。不選（守住規模）。

## Risks / Trade-offs

- [Risk] 對話框關閉動畫期間，既有 test「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」（以及 `round-sync.spec.ts` 同型 test）在按「關閉」後立刻 `getByRole("link", { name: "返回對戰" })`，可能短暫同時解析到「對話框內正在淡出的連結」與「設定列的連結」而觸發 strict mode violation → Mitigation：Radix Dialog 在內容卸載前持續以 `aria-hidden` 隱藏外部節點，理論上同一時刻只有一個可存取的同名連結，且兩者 `href` 相同、點到哪一個都回 `/matchmaker`；apply 時 C5 必跑這兩條既有 test。若出現 strict mode violation，**不得修改既有 test**，停下證據上報 coordinator（候選解法：改對話框連結名稱或延後渲染，屬範圍變更）。
- [Risk] `matchId` 為可選 prop，`Scoreboard` 漏傳時對話框靜默退回獨立模式 → Mitigation：兩條新 E2E 在漏傳時都會紅（綁定場次的對話框出現「再來一局」、沒有「返回對戰」）；列為必做 mutation。
- [Risk] 雲端模式按「返回對戰」導航時，若 `finished` 分槽的 `PUT` 尚在佇列，`useRemoteMatchSlotStore` unmount 時 `saver.dispose()` 會丟棄待送值 → 這與設定列「返回對戰」完全相同的既有行為（`round-sync.spec.ts` 已覆蓋該路徑並為綠），本 change 不改變時序；不處理。
- [Risk] 專注模式 E2E 在支援 Fullscreen API 的瀏覽器會附帶 `requestFullscreen`，導航後文件可能仍在全螢幕 → 只影響畫面，不影響 URL 與回填斷言；`useFocusMode` unmount 時會移除 `sb-focus`。新 test 不對全螢幕狀態做斷言。
- [Risk] 綁定模式的「關閉」關掉後，專注模式下沒有返回入口（設定列不渲染、對話框不可重新開啟）→ 與現況相同（退出專注模式即可返回），規格已記錄；不處理。
- [Risk] 新 it 對 `GameOverDialog` 傳入尚不存在的 `matchId` prop，RED commit 時 `tsc` 會報 excess property 錯誤 → 主 repo 的 Stop hook 會擋；RED 與 GREEN 必須在同一張派工單內完成（execution-plan 已規定），GREEN 後 `tsc` 恢復 exit 0。

## Migration Plan

無資料或 schema 遷移；不新增相依。部署照 README「部署前手動檢查清單」，只影響前端 Worker。回滾：revert `GameOverDialog.tsx` 與 `Scoreboard.tsx` 兩檔即可（測試同步 revert）。

## Open Questions

（設計裁量皆已於 Decisions 定案；以下為 apply 階段 leader 追加。）

- **[TIME_UP，2026-11-06 02:47] C4 重跑與 C5 未完成**：§1、§2（含 Stage 1／Stage 2）與 3.1～3.4、3.7、3.8 已完成；3.5（C4）與 3.6（C5）未勾。
  C4 首次失敗原因為 `fonts.gstatic.com` 連線逾時（`next/font/google`），判定為建置機網路問題、非程式碼；C5 與 C4 重跑排隊取重負載鎖 32 分鐘未取得（mini4wd 的 blender 工作接力持鎖），為守 03:00 期限中止。
  交由 coordinator：依 tasks 3.5、3.6 的指令與期望數字重跑；特別留意 design Risks 第 1 條（`round-sync.spec.ts` 中「關閉」後立刻點設定列「返回對戰」的 test 尚無本 change 之後的實跑紀錄）。工作樹乾淨、`pnpm -r exec tsc --noEmit` exit 0。
- **[指令偏離] typecheck 的 `--filter` 寫法**：本環境自 repo root 以 `pnpm --dir <root> --filter ./hono-pickball typecheck`（及 `./packages/pickball-core`）執行時回 "No projects matched the filters" 卻 exit 0，未實際型別檢查——§1.1 基線那兩段因此無效。C1 改以 `pnpm --dir <root>/hono-pickball typecheck`、`pnpm --dir <root>/packages/pickball-core typecheck` 實跑，皆 exit 0；本 change 未動這兩個 workspace，故以此代替基線。
- **[程序紀錄] Stage 2 mutation 與 C4 時間重疊**：Stage 2 Reviewer 自述在 02:11:45～46 做過一次「寫入變異後立即 `git checkout` 還原」的 harness 試跑，與首次 `pnpm build` 收尾重疊；build 失敗訊息為字型下載逾時，與該變異無關，且 `pnpm test`／`pnpm lint` 在此之前已完成。C4 仍須重跑（見上）。
