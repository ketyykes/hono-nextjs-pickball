# Tasks: history-filter-retention

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest：`pnpm --filter ./nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**，免鎖）。
> 單檔 E2E（雙鎖）：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/history-sync.spec.ts [-g <test 名稱>]`，前後清殘留 dev server。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`；`regression guard`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **範圍**：產品程式碼只改 `nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx` 與 `RemoteStatsContent.tsx`。**不新增相依、無 migration、不動後端與核心套件、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **訪客路徑零變更**：`HistoryView.tsx`、`LocalStatsContent.tsx`、`HistoryRangeFilter.tsx`、`components/sync/**`、`hooks/**`（含 `useRemoteHistory`）、`lib/**`、`app/**` 一行不改（C6 驗收）。
>
> **授權修改的既有測試（僅限下列三處，皆為本 change 行為的必然結果；其餘既有 it／test 的名稱與斷言一律不得修改）**：
> ① `nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx` 的 it「syncStatus 為 %s 時以提示取代內容並標示 data-sync-status」：**刪除** `expect(screen.queryByRole("radiogroup")).toBeNull();` 一行（正向斷言由新 it 承擔）；
> ② `nextjs-pickball/components/matchmaker/RemoteStatsContent.test.tsx` 的 it「歷史 syncStatus 為 %s 時以提示取代內容並標示 data-sync-status」：**刪除**同一行（理由同上）；**同檔「名單 syncStatus 為 %s…」的同一行不得刪除**；
> ③ `nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts` 的 test「雲端歷史載入失敗時歷史頁顯示錯誤提示」：最後一行 `await expect(page.getByRole("radio", { name: "今日" })).toHaveCount(0);` 改為斷言「今日」選項可見且 `toBeChecked()`。

## 1. 對齊 main 與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/history-filter-retention`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  雙鎖下跑 `pnpm test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm lint`（errors／warnings 數）、`pnpm --filter ./nextjs-pickball exec playwright test --list`（六個 project 各自數量）；回填 environment.md Verification 並 commit（`chore:`）
  - 結果：分支正確、工作樹乾淨、lockfile 零變動、migration 無待套用；基線數字見 environment.md Verification（前端 109／1070、後端 24／177、核心 9／21；lint 0 errors／3 warnings；`--list` 各 browser project 147、user-data 44）
- [x] 1.2 對齊 main：確認 `RemoteHistoryView.tsx`、`RemoteStatsContent.tsx`、兩個測試檔與 `history-sync.spec.ts` 與 propose 時（`main` `630bbd2`）的內容一致；
  以 python difflib 比對本 change 兩個 MODIFIED Requirement（`match-history`「登入時歷史以雲端為準」、`player-stats`「統計依區間篩選」）與目前主 spec，除本 change 刻意增修外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate history-filter-retention --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions
  - 結果：`git diff --stat 630bbd2 main` 對兩個元件、兩個測試檔、`history-sync.spec.ts`、`openspec/specs/match-history`、`openspec/specs/player-stats` 皆無輸出（`630bbd2..eaf1f50` 只有 `site-navbar-account-entry` 的提交）；
    difflib 比對兩個 MODIFIED Requirement 與主 spec，差異只有本 change 刻意增修（`RemoteHistoryView` 載入中／失敗段落、改寫的「載入失敗時歷史頁顯示錯誤」THEN、新增 4＋5 個 Scenario 與統計頁「雲端模式的載入中與載入失敗」段落）；`openspec validate --strict` valid。主 spec 未被其他 change 改動，不需重新套用。
  - Context7 查證（與 design 假設一致，無需記入 Open Questions）：`/reactjs/react.dev` preserving-and-resetting-state——同一位置同一型別跨 `if` return 保留、同一位置換型別即移除並銷毀狀態；
    `/microsoft/playwright`——`route.fulfill({ status })`、`route.continue()`、`page.unrouteAll({ behavior: "ignoreErrors" })`（v1.41 起，本機 1.60.0）、`toBeFocused` 為 web-first 斷言；
    `/testing-library/user-event`（本機 14.6.1）——焦點在 `<button>` 時 `keyboard("{Enter}")` 的 keypress behavior 會對該按鈕 dispatch `click`。

## 2. 雲端歷史頁保留篩選器

Depends on: §1

- [ ] 2.1 RED（TDD）：`RemoteHistoryView.test.tsx` 新增三個 it——「載入中與載入失敗時保留區間篩選並只以提示取代紀錄區塊」（`it.each` 兩個狀態）、
  「以鍵盤切換區間時焦點在載入中、載入完成與載入失敗後都留在被選取的區間選項」、「載入失敗後改選其他區間會以新區間重新載入並顯示紀錄」（斷言依 test-plan，焦點以 DOM 節點同一性斷言）；
  同一 commit 依檔頭例外 ① 刪除一行。單檔 vitest 確認新 it 全紅並貼出輸出（例外 ① 的 it 刪行後仍綠，屬預期）
- [ ] 2.2 RED（TDD，E2E）：`history-sync.spec.ts` 新增 test「雲端歷史載入失敗後切換區間重新載入成功且焦點留在篩選器」（依區間以 `searchParams.has("to")` 攔截、暫停以 `Promise` resolver 放行並以 `try／finally` 或 `page.unrouteAll({ behavior: "ignoreErrors" })` 收尾，沿用 `seedCloudPlayers`／`playOneMatch`；**所有 radio、焦點操作與斷言排在 `[data-sync-status="load-failed"]` 可見之後**）；
  同一 commit 依檔頭例外 ③ 改最後一行。雙鎖下以單檔 E2E（`-g` 篩兩條）確認兩條皆紅並貼出輸出
- [ ] 2.3 GREEN（TDD）：改 `RemoteHistoryView.tsx` 為單一 return，篩選器固定位置、只替換內容槽、阻斷時不顯示損毀提示（design Decision 1、2）。
  2.1 的 it、2.2 的兩條 E2E 全綠；`RemoteHistoryView.test.tsx` 其餘既有 it 原樣綠；`history-sync.spec.ts` 其餘既有 test 原樣綠；`pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors
- [ ] 2.4 REFACTOR：阻斷判定與內容槽是否以具名變數表達、有無巢狀三元運算；無壞味道則註記 skipped

## 3. 雲端統計頁保留標題與篩選器

Depends on: §2

- [ ] 3.1 RED（TDD）：`RemoteStatsContent.test.tsx` 新增三個 it——「歷史載入中與載入失敗時保留標題與區間篩選並只以提示取代排行榜」（`it.each` 兩個狀態）、
  「以鍵盤切換區間時焦點在歷史載入中、載入完成與載入失敗後都留在被選取的區間選項」、「歷史載入失敗後改選其他區間會以新區間重新載入並顯示排行榜」；
  阻斷狀態 mock 用真實 hook 同形（`items: []`、`total: 0`，test-plan「mock 的共同要求」）；同一 commit 依檔頭例外 ② 刪除一行。單檔 vitest 確認新 it 全紅並貼出輸出；既有「名單 syncStatus 為 %s…」與「regression guard：total 為 0 時不顯示區間篩選」維持綠（regression guard，點名）
- [ ] 3.2 RED（TDD，E2E）：`history-sync.spec.ts` 新增 test「登入時統計頁歷史載入失敗後切換區間重新載入成功且焦點留在篩選器」（攔截、收尾與斷言順序同 2.2；標題斷言同樣排在 `load-failed` 可見之後，因本機 `LocalStatsContent` 也有「球員統計」標題）。雙鎖下以單檔 E2E 確認紅燈並貼出輸出
- [ ] 3.3 GREEN（TDD）：改 `RemoteStatsContent.tsx`——名單阻斷維持 early return；名單可用時單一 return，標題與篩選器固定位置，歷史阻斷時內容槽為 `SyncStatusNotice`，`total === 0` 時篩選器槽位為空（design Decision 3、4）；更新「標題只在有可信資料時顯示」的註解。
  3.1、3.2 全綠；`RemoteStatsContent.test.tsx` 其餘既有 it 原樣綠；雙鎖下 `roster-sync.spec.ts` 的「雲端名單載入失敗時對戰頁與統計頁以錯誤提示取代內容」與 `history-sync.spec.ts` 全檔綠；`pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors
- [ ] 3.4 REFACTOR：兩個元件的阻斷判定與內容槽寫法是否一致；是否值得共用（只有兩個使用端且統計頁多一層名單判定，預期不抽）；無壞味道則註記 skipped

## 4. 文件同步與總驗收

Depends on: §3

- [ ] 4.1 設定層（文件）：`nextjs-pickball/CLAUDE.md`——名單雲端同步段的「對戰、參賽者、統計三頁在 loading／load-failed 時以 `SyncStatusNotice` 取代內容」指的是**名單**狀態，維持不改；
  `/matchmaker/history` 與 `/matchmaker/stats` 條目各補一句「雲端歷史 loading／load-failed 時保留區間篩選（統計頁連同標題），只替換紀錄／排行榜區塊，焦點不遺失；失敗後改選區間即重新載入」。commit（`docs:`）
- [ ] 4.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 4.3 驗收（指令）C2：雙鎖下 `pnpm lint` 0 errors、warning 不多於基線
- [ ] 4.4 驗收（指令）C3：雙鎖下 `pnpm test` 全綠；前端檔數不變、測試數＝基線＋8，後端與核心與基線相同
- [ ] 4.5 驗收（指令）C4：雙鎖下 `pnpm build` exit 0；建置後 `git status --porcelain` 為空
- [ ] 4.6 驗收（指令）C5：`.dev.vars` 齊備下依 project 分開跑 E2E（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`），每次雙鎖、前後清殘留；
  user-data＝基線＋2 全 passed、0 skipped；五個 browser project 數量與基線相同、0 failed（skip 只限既有瀏覽器條件）。結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 4.7 驗收（指令）C6：test-plan C6 的 `git diff main --stat -- …` 輸出為空（訪客路徑、hook、共用元件、app、後端、核心零變更）
- [ ] 4.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate history-filter-retention --strict` 通過
