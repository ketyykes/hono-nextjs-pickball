# Execution Plan: session-hint-failure-no-local-fallback

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組（§2、§3、§4）派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 與 §5 由 leader 自己執行或各派一個 Implementer，§1 結果回填 environment.md 並 commit。
**不用 git worktree**：在主 repo 的 `change/session-hint-failure-no-local-fallback` 分支上依序進行。
**Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成（§2.1 以 `null` 呼叫 `mockResolvedValue`、匯入尚不存在的 `chooseLocalFallback`；§2.3、§3.2、§3.12 匯入尚不存在的匯出或模組，皆為型別紅燈），leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**，連同檔頭全部說明（TDD 規則、雙鎖寫法、授權改寫的三個既有 it、Stop hook 注意事項）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「共同 mock 寫法」「store 測試」「授權改寫的既有 it」「E2E 共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：
   - §2 → 本 change `specs/auth/spec.md` 全文；`specs/user-data-sync/spec.md` 的「前端依 session 選擇儲存模式」。
   - §3 → `specs/user-data-sync/spec.md` 的「同步狀態與提示」、「資料來源確定前的等待中畫面」的顯示狀態與選擇器段落、「session 無法確認時的阻擋畫面與本機備援」全文（含 Scenario，歷史頁與資料頁四條除外）；
     `specs/player-roster/spec.md`、`specs/round-lifecycle/spec.md`、`specs/scoreboard/spec.md` 改寫的兩句。
   - §4 → `specs/user-data-sync/spec.md`「資料來源確定前的等待中畫面」的歷史頁與資料頁段落、「session 無法確認時的阻擋畫面與本機備援」的使用端段落與歷史頁、資料頁四條 Scenario。
4. **相關 design 片段**：§2 → Context、Decision 1、2、3、4、5、6、11、12、13；§3 → Context、Decision 2（已知取捨）、6、7、8、9、10、12，Risks 中 console 錯誤、E2E 與 Stop hook 各條；§4 → Decision 6、8、9、12；§5 → Migration Plan、Non-Goals。
5. **既有介面與範本**（全文貼上）：
   - §2：`lib/auth/session-client.ts`、`lib/auth/session-store.ts`、`lib/auth/session-hint.ts`、`lib/sync/storage-mode.ts`、`hooks/useSession.ts` 與 `session-client.test.ts`、`session-store.test.ts`、`storage-mode.test.ts` 全文。
   - §3：`lib/sync/sync-status.ts` 與其測試、`components/sync/SyncStatusNotice.tsx` 與其測試、`components/ui/button.tsx`；`hooks/useRosterStore.ts`、`hooks/useRoundStore.ts`（選擇器段落與 `UseRoundStoreOptions`）、`hooks/useScoreboardStore.ts`（選擇器段落）；
     三個選擇器測試檔的等待中 describe 與「已登入時改用雲端名單並回傳 syncStatus」it 全文；`hooks/useRemoteRosterStore.ts` 的回傳段落（`players`／`mismatched`／`active`）；
     `app/matchmaker/page.tsx`（`SYNC_STATUS_PRIORITY` 至阻斷分支）、`app/matchmaker/stats/page.test.tsx`（頁面測試範本）、`app/layout.tsx`、`components/layout/SiteNavbar.tsx` 的 `header` class（z-index 參考）、`components/scoreboard/Scoreboard.tsx` 根元素 class（`h-dvh` 參考）；
     `tests/e2e/specs/data-pending.spec.ts` 全文。
   - §4：`components/matchmaker/HistoryModeSwitch.tsx`、`JsonBackupSection.tsx`、`HistoryCsvSection.tsx`、`RosterCsvImportSection.tsx` 與四個測試檔全文；§3 完成的 `SyncStatusNotice.tsx` 與 `storage-mode.ts`。
6. **「不給你」清單**：其他群組 task、與本組無關的 capability spec、前一個 change 的 artifact、overview.md。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/session-hint-failure-no-local-fallback`（environment.md）。
   禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir <workspace 絕對路徑>`、`git -C <repo>`）。單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時會 "No projects matched" 且 exit 0）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2：① `fetchSession` 的任一失敗分支改回傳 `{ authEnabled: false, user: null }`；② 採用 `null` 時不看提示、一律改為 auth 停用的 ready；③ 採用 `null` 時清除提示；④ 採用 `null` 時改讀快照的 `signedInHint` 而非 `readSignedInHint()`（「已登入使用中 refresh 失敗」須轉紅）；
     ⑤ 逾時改回不帶提示的 `{ status: "loading" }`；⑥ 逾時時遞增 `requestId`（晚到回應須照常採用而轉紅）；⑦ `chooseLocalFallback` 不遞增 `requestId`；⑧ `chooseLocalFallback` 不檢查目前快照（任何狀態都切本機）；
     ⑨ 無法確認或本機備援快照改為每次建立新物件（參考穩定斷言須轉紅）；⑩ `resolveStorageMode` 的本機備援判斷改回 `"pending"`（regression guard 須轉紅）；⑪ `pendingDataStatus` 一律回 `"pending"`。
   - §3：① `isContentBlocked` 漏掉 `unavailable`；② `SyncStatusNotice` 的 `unavailable` 不渲染按鈕；③ 按鈕放進 `role="status"` 元素內；④ 按鈕 `onClick` 不呼叫 `chooseLocalFallback`；⑤ 名單等待中改回沿用 `remote.players`；⑥ 名單等待中 `syncStatus` 寫死 `"pending"`；
     ⑦ 回合等待中 `syncStatus` 寫死 `"pending"`；⑧ 計分板等待中 `syncStatus` 寫死 `"pending"`；⑨ `SYNC_STATUS_PRIORITY` 拿掉 `unavailable`；⑩ `LocalFallbackBanner` 在無法確認時也渲染；⑪ `app/layout.tsx` 不掛 `LocalFallbackBanner`（由 `data-pending.spec.ts` 新增的 500 那條轉紅，chromium 單檔 E2E，雙鎖）；⑫ `lib/auth/session-store.ts` `load()` 採用 `null`＋提示的分支改為每次建立新的無法確認物件（按鈕因參考比對失效；由同一條 500 E2E 轉紅，與 ⑪ 同一次持鎖跑）。
   - §4：① `HistoryModeSwitch` 容器與提示寫死 `"pending"`；② `JsonBackupSection` 寫死 `"pending"`；③ `HistoryCsvSection` 寫死 `"pending"`；④ `RosterCsvImportSection` 寫死 `"pending"`。
   - 每組另放至少一條等價變異作對照組（例：把 `snapshot.unavailable === true` 改寫為 `"unavailable" in snapshot && snapshot.unavailable`、調換 `resolveStorageMode` loading 分支內本機備援與提示兩個互斥判斷的順序、把 `isContentBlocked` 的比較改寫為四個值的陣列 `includes`），須維持綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱；改寫的既有 it 則確認 RED 前為舊名稱、RED 後為新名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 E2E：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec 路徑> [-g <test 名稱>]`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，**只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`**。**E2E 失敗不得自行判定為雜訊**，證據上報。
h. 編輯器診斷不可信，以 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`（`beforeEach`／`afterEach` 亦同）。**E2E SHALL NOT 使用 `waitForTimeout`**。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。**測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**。
j. **SHALL NOT 新增任何 npm 相依**；SHALL NOT 改動 proposal Impact「不改」清單中的檔案（`hooks/useSession.ts`、`lib/auth/session-hint.ts`、雲端 hook `hooks/useRemote*.ts`、`components/layout/**`、`components/auth/**`、`components/scoreboard/**`、
   `app/matchmaker/players/page.tsx`、`app/matchmaker/stats/page.tsx`、`LocalStatsContent.tsx`、`RemoteStatsContent.tsx`、`HistoryView.tsx`、`RemoteHistoryView.tsx`、`LocalDataImportSection.tsx`、`ClearLocalDataSection.tsx`、`LocalImportNotice.tsx`、`lib/matchmaker/transfer-storage.ts`、quiz／tour／guide）、後端與核心套件。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的三個授權改寫 it（`session-client.test.ts` 兩個、`session-store.test.ts` 一個）。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：每組都有現成範本（store 既有 resolver 與 fake timers 測試、選擇器既有等待中 describe、區塊元件既有 mock、`data-pending.spec.ts` 既有提示殘留那條），難點在 store 的請求編號與逾時互動、union 型別窄化、頁面層測試的模組替換，sonnet 足以勝任。
- **upgrade_to_sonnet_when**：（已是 sonnet）
- **upgrade_to_opus_when**:
  - store 的新 it 在 GREEN 後仍紅，且無法以 `requestId`／計時器時序解釋。
  - `app/matchmaker/page.test.tsx` 因子模組在 happy-dom 無法載入，stub 兩輪後仍無法渲染。
  - E2E 在 webkit 系 project 同一條連續兩次結果不同，或既有 E2E 出現新失敗且原因不明。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；先綠者已點名標 regression guard；改寫的三個既有 it 已標「改寫既有 it」。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 只改寫了授權的三個既有 it。
  - [ ] `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` 只含本組在 proposal Impact 中的檔案。
  - [ ] `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。
  - [ ] 只新增 `LOCAL_FALLBACK_ACTION_LABEL`、`LOCAL_FALLBACK_NOTICE` 兩個文案；沒有巢狀三元運算；註解只寫理由。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個新增 Scenario 都有對應測試，名稱逐字相同；三個標題沿用的 Scenario 對應改寫後的 it。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）；regression guard 已誠實標註。
  - [ ] GREEN 只滿足 RED：只有兩個新文案、沒有新 hook、沒有改後端或 `/api/session` 契約、沒有自動重試、沒有改帳號入口與登入頁、沒有合併本機修改到雲端（scope creep）。
  - [ ] 採用 `null`、逾時、`chooseLocalFallback` 皆不寫入也不清除提示；沒有提示時失敗仍為 auth 停用的 ready（§2）。
  - [ ] 無法確認時三個選擇器都不啟用雲端 hook、名單為空陣列、`syncStatus` 為 `unavailable`；按鈕不在 `role="status"` 內；本機提示只在本機備援時渲染（§3）。
  - [ ] 「不改」清單中的檔案未改動（§2、§3、§4）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：請求編號、計時器與 module 層級狀態的互動（丟棄時機、參考穩定、測試隔離）最需要最強模型。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是 §2 ④ ⑥ ⑦ ⑧ ⑨、§3 ③ ⑤ ⑨ ⑪、§4 全部與對照組。
  - [ ] 兩個新快照為模組層級常數；`getSnapshot` 未變更時回傳同一參考；`resetSessionStoreForTests` 仍清除計時器與快取。
  - [ ] `SessionSnapshot` union 的窄化寫法全檔一致（`?: never` 或 `in` 擇一），沒有 `as` 硬轉。
  - [ ] 使用端只經 `pendingDataStatus` 取得 `unavailable`，沒有各自讀快照欄位（C7）。
  - [ ] `LocalFallbackBanner` 固定定位、`pointer-events-none`、`print:hidden`，不影響計分板鎖高版面；伺服器輸出為空。
  - [ ] E2E 的 `page.route` 在 `seedStorage` 之後註冊、`finally` 內 `unrouteAll`；web-first 斷言；沒有 `waitForTimeout`。
  - [ ] 舊註解（「取不到狀態一律視為未啟用」「逾時回到現行行為」「等待中沿用未啟用的雲端 hook 結果，它從未啟用過」等）已依新行為更新。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：需要一次看完三組 commit，確認無法確認與本機備援在 lib、hooks、元件三層的寫法一致、合併後範圍不越界。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] C6、C7、C10 的 grep 結果與 test-plan 一致；沒有使用端漏處理 `unavailable`。
  - [ ] 指令驗收 C1～C10 皆有紀錄；前端測試數＝基線＋21、檔數＝基線＋2；五個 browser project 各＝基線＋2 且全綠；user-data＝基線。
  - [ ] `nextjs-pickball/CLAUDE.md` 的敘述與新行為一致。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗（特別是含 console 守衛的 spec、`user-data` 中依賴 session 回應的斷言）→ 證據上報 coordinator 裁定，不得自行改既有 spec。
  - 實作上發現必須改 proposal「不改」清單中的檔案、新增兩個以外的文案、新增 hook 或改 `/api/session` 契約才能達成 → 停止並升級（屬範圍變更）。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。

## 合併前流程（coordinator）

1. 全瀏覽器 gate：建立 `/tmp/cgate-session-hint-failure-no-local-fallback.e2e`（照 `/tmp/cgate-session-pending-loading.e2e` 複製），執行 `/tmp/cgate2.sh session-hint-failure-no-local-fallback`，結果寫進 tasks §5。
2. `/opsx:verify`：critical／warning／suggestion 全部處理完（逐項查證、修正並 commit）才進下一步。
3. `git merge --no-ff change/session-hint-failure-no-local-fallback`（在 `main`）→ archive。**不 push**（push 即觸發正式站部署，由使用者決定）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。每次 Agent 呼叫明確帶 `model`。
