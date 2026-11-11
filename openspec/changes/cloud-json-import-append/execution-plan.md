# Execution Plan: cloud-json-import-append

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組（§2、§3、§4、§5）派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2（記錄在該組最後一個審查 task）；全部完成後 Final Code Review。
群組間**嚴格序列**（核心 → 後端 → 前端 lib → 元件與 E2E；後一組依賴前一組的匯出或端點），SHALL NOT 平行派 Implementer。§1 與 §6 由 leader 自己執行或各派一個 Implementer，§1 結果回填 environment.md 並 commit。
**不用 git worktree**：在主 repo 的 `change/cloud-json-import-append` 分支上依序進行。
**Stop hook 會擋主 worktree 的 tsc 紅燈**：§4.1、§5.2 的 RED 匯入尚不存在的前端匯出，屬型別紅燈，RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。
§2.1、§3.2 的測試檔不在 Stop hook 範圍，但 Implementer 交件前 MUST 實跑該 workspace 的 `typecheck`。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**，連同檔頭全部說明（TDD 規則、雙鎖寫法、授權改寫的三處既有測試、Stop hook 注意事項）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「核心」「後端」「前端」「E2E 共同要求」「授權改寫的既有測試」＋本組用到的指令驗收列。
3. **相關 spec 片段**：
   - §2 → 本 change `specs/user-data-sync/spec.md` 的「本機備份附加到雲端的 API」中請求、上限、共用參數形狀三段，以及四個核心 Scenario；「批次寫入端點的筆數與 body 上限」全文。
   - §3 → `specs/user-data-sync/spec.md` 的「本機備份附加到雲端的 API」全文（含全部 Scenario）、「刪除後重建的使用者資料版本不得重複」全文、「本機資料匯入雲端的 API」的預期帳號守衛段落與「匯入 API：守衛樣本表含匯入端點」Scenario。
   - §4 → `specs/data-transfer/spec.md`「登入時的資料工具頁」的「附加到雲端」段落（含預覽名單的讀取與計算）、JSON 還原列、「雲端分支的資料讀取」例外句與「JSON 還原在雲端模式的語意」，以及 Scenario「附加預覽依後端規則列出會新增與視為同一人的參賽者」「附加預覽以呼叫端給的帳號讀取雲端名單」「附加請求的組成與結果分類」「附加結果與確認的文案」；
     `specs/user-data-sync/spec.md`「本機備份附加到雲端的 API」的「共用的參數形狀」與「寫入規則」中參賽者一條（預覽規則必須與之一致）；§2 完成的核心附加契約（型別與 schema）。
   - §5 → `specs/data-transfer/spec.md`「登入時的資料工具頁」全文（含全部 Scenario）。
4. **相關 design 片段**：§2 → Context（同名規則、SQLite 同表 INSERT…SELECT）、Decision 3、7、11；§3 → Context 全文、Decision 1、4、5、6、11，Risks 中 drizzle、id 改寫 SQL、TEMP TABLE、沙箱 EPERM 各條；
   §4 → Decision 2、3、7、8、12；§5 → Decision 2、8、9、12，Risks 中 E2E 字面值同步點、`.dev.vars` 各條；§6 → Migration Plan、Non-Goals。
5. **既有介面與範本**（全文貼上）：
   - §2：`packages/pickball-core/src/api/import.ts`、`packages/pickball-core/src/api/players.ts`（`PlayerWriteSchema`、`MAX_PLAYERS_PER_IMPORT`）、`packages/pickball-core/src/matchmaker/history.ts`（`MatchHistoryEntrySchema`）與 `test/api/import.test.ts`、`test/api/import-limits.test.ts` 全文。
   - §3：`hono-pickball/src/routes/import.ts`、`hono-pickball/src/import/local-import-repository.ts`、`hono-pickball/src/matchmaker/version-floor.ts`、`hono-pickball/src/matchmaker/players-repository.ts`（`sort_order` 與 `initialVersion` 寫法）、`hono-pickball/src/db/schema.ts`（兩張表）、`hono-pickball/src/http/body-limit.ts`（或 `jsonBodyLimit` 所在檔）；
     `hono-pickball/test/local-import.test.ts`、`hono-pickball/test/expected-user-guard.test.ts`、`hono-pickball/test/helpers/matchmaker-fixtures.ts`、`hono-pickball/test/helpers/session.ts` 全文；`hono-pickball/CLAUDE.md` 的 drizzle batch 限制段落。
   - §4：`nextjs-pickball/lib/sync/local-import.ts`、`nextjs-pickball/components/matchmaker/local-import-view.ts`、`nextjs-pickball/lib/sync/api-client.ts`（`requestJson` 結果型別）、`nextjs-pickball/lib/sync/roster-api.ts`（`fetchRemotePlayers`；不改）、`packages/pickball-core/src/api/players.ts`（`PlayerListResponseSchema`）、§3 `hono-pickball/test/local-import-append.test.ts` 中「雲端已有資料時附加略過同名或已存在 id 的參賽者…」「備份內同名的參賽者只新增第一位」兩個 it 的夾具段落（預覽 it 的共同 fixture）、`nextjs-pickball/lib/matchmaker/remote-transfer.ts`（`REMOTE_TRANSFER_MESSAGES`）與 `local-import.test.ts`、`local-import-view.test.ts` 全文；三個 user-data E2E 檔中 `JSON_CLOUD_IMPORT_HINT_TEXT` 的定義行。
   - §5：`nextjs-pickball/components/matchmaker/JsonBackupSection.tsx`、`JsonBackupSection.test.tsx`、`LocalImportResultMessage.tsx`、§4 完成的 `local-import.ts` 與 `local-import-view.ts`、`nextjs-pickball/lib/sync/roster-api.ts`（名單 GET 的路徑與回應形狀，供 fetch mock 使用；不改）；`nextjs-pickball/tests/e2e/user-data/local-import.spec.ts` 全文、`tests/e2e/helpers/` 中 `clearTestAccountUserData`、`expectedUserHeaders`、`readLocalKeys`、`markNoReload`、`expectNotReloaded` 所在檔；`components/matchmaker/PlayerStatsTable.tsx`（`player-stat-row-<id>` 與欄位順序）。
6. **「不給你」清單**：其他群組 task、與本組無關的 capability spec、前一個 change 的 artifact、overview.md。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/cloud-json-import-append`（environment.md）。
   禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir <workspace 絕對路徑>`、`git -C <repo>`）。單檔 vitest：前端 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`、後端（workerd）`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball test --run <path>`、核心 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core test --run <path>`
   （**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時會 "No projects matched" 且 exit 0）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2：① `serializeAppendSegments` 參賽者段不去重；② 同名改為保留最後一位；③ 參賽者對照段改為去重後的名單；④ `checkAppendLimits` 以去重後的筆數判定 500 位；⑤ 不判定參賽者對照段的上限；⑥ 三段改以加總判定；⑦ `AppendImportRequestSchema` 不拒絕兩段皆空；⑧ 不拒絕重複 `matchId`。
   - §3：① 參賽者陳述式拿掉「雲端同名」的排除條件；② 拿掉「id 已存在」的排除機制（`NOT EXISTS` 或 `ON CONFLICT` 擇其實作者）；③ `sort_order` 不加附加前的最大值（從 0 起）；④ 序號改為依 `key` 遞減；⑤ 新參賽者 `version` 寫死 1；
     ⑥ 同名判定不限本人 `user_id`；⑦ 歷史 `ON CONFLICT DO NOTHING` 改為 `DO UPDATE SET data = excluded.data`；⑧ 歷史 `data` 不改寫（原樣寫入）；⑨ 只改寫 `teamA`；⑩ 對應目標改取同名者中 `sort_order` 最大者；⑪ 對應表不排除「id 已在雲端名單」者；
     ⑫ `checkAppendLimits` 移除（只靠 body 上限）；⑬ 路由拿掉 `jsonBodyLimit`；⑭ `added` 改用請求筆數；⑮ 附加路由改掛到不經 `requireExpectedUser` 的位置（regression guard 須轉紅）。
   - §4：① `backupToAppendRequest` 帶上 `currentRound`；② `appendBackupToCloud` 的 409 分類為 `unauthorized`；③ 413 分類為 `failed`；④ 不以 `AppendImportResponseSchema` 驗證 200 回應；⑤ 略過皆為 0 時仍回傳 `note`；⑥ 兩句補充說明的連接改為「，」；⑦ `APPEND_RULES` 調換兩條順序；⑧ `jsonCloudImportHint` 改回舊文字；
     ⑨ `previewAppendPlayers` 忽略「id 已在雲端」規則；⑩ 不做備份內同名去重；⑪ 先判定雲端再去重（同名的第一位被略過時改由第二位計入）；⑫ 比對前轉小寫或 trim 以外的正規化；⑬ `fetchAppendPreview` 的 401 分類為 `failed`；⑭ 不以 `PlayerListResponseSchema` 驗證名單回應。
   - §5：① 409 仍顯示 `cloudNotEmpty`、不進入附加確認；② 409 後不經確認直接送附加；③ 附加改用選檔當下的 user id；④ 請求進行中不停用按鈕；⑤ 401 不呼叫 `refresh()`；⑥ 無可附加時仍渲染確認；⑦ 按取消仍送出附加；⑧ 重新選檔不收起確認；⑨ 200 也進入附加流程（regression guard 須轉紅）；
     ⑩ 附加成功後寫入本機 `pickball-matchmaker-players`（由 E2E 的本機 key 不變斷言轉紅，`--project=user-data` 單檔，雙鎖）；
     ⑪ 名單讀取失敗時仍顯示附加確認（不含預覽）；⑫ 名單讀取 401 不呼叫 `refresh()`；⑬ `added` 為空時隱藏「附加到雲端」按鈕；⑭ 無可附加時仍讀取名單；⑮ 預覽清單改顯示 `matched` 於「會新增」清單。
   - 每組另放至少一條等價變異作對照組（例：重複判定的 `Set` 改寫為 `Map`；`NOT EXISTS` 改寫為 `LEFT JOIN … IS NULL`；`coalesce(<對應 id>, 原 id)` 改寫為 `CASE WHEN … IS NULL THEN … ELSE … END`；補充說明以陣列 `join("、")` 與逐句串接互換），須維持綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱；改寫的既有 it／test 則確認 RED 前為舊斷言、RED 後為新斷言）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 E2E：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec 路徑> [-g <test 名稱>]`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，**只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`**。**E2E 失敗不得自行判定為雜訊**，證據上報。
h. 編輯器診斷不可信，以 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`、`pnpm --dir …/hono-pickball typecheck`、`pnpm --dir …/packages/pickball-core typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`（`beforeEach`／`afterEach` 亦同）。**E2E SHALL NOT 使用 `waitForTimeout`**。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。**測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**。
j. **SHALL NOT 新增任何 npm 相依**；SHALL NOT 改動 proposal Impact「不改」清單中的檔案（`LocalDataImportSection.tsx`、`LocalImportNotice.tsx`、`LocalImportResultMessage.tsx`、`ClearLocalDataSection.tsx`、`RosterCsvImportSection.tsx`、`HistoryCsvSection.tsx`、
   `lib/sync/roster-api.ts`、`lib/matchmaker/remote-transfer.ts`、`lib/matchmaker/backup.ts`、`lib/matchmaker/transfer-storage.ts`、`lib/matchmaker/player-stats.ts`、雲端 hook `hooks/useRemote*.ts`、`components/layout/**`、`components/auth/**`、quiz／tour／guide、`hono-pickball/src/db/**`、`hono-pickball/drizzle/**`、`hono-pickball/src/matchmaker/**`），
   也不改 `POST /api/import` 既有的 `importLocalData`、`LocalImportRequestSchema`、`serializeImportSegments`、`checkImportLimits` 的行為。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的三處授權改寫（守衛樣本表、三個 E2E 檔的說明文字常數、`local-import.spec.ts` 一處斷言）。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。一個 commit 只做一件事（`test:` 只含測試、`feat:` 只含產品碼與授權的同步，不混入 tasks 紀錄）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：核心與前端都有現成範本（既有匯入 schema、`serializeImportSegments`、`importLocalData`／`describeImportOutcome`、`JsonBackupSection` 既有 mock 與 E2E）；後端的難點是 drizzle `insert().select()` 中的 CTE、巢狀 `json_each`／`json_set` 與 `RETURNING`，sonnet 足以勝任，卡住時依下列條件升級。
- **upgrade_to_sonnet_when**：（已是 sonnet）
- **upgrade_to_opus_when**:
  - §3 的 id 改寫 SQL 在 drizzle 下兩種寫法（CTE、FROM 子查詢）都無法產生，或 2,000 筆的 it 在 workerd 逾時。
  - `RETURNING` 列數與實際寫入數不符，且無法以 drizzle 的 batch 結果形狀解釋。
  - E2E 在 user-data project 同一條連續兩次結果不同，或既有 E2E 出現新失敗且原因不明。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**（自查準則，不逐項勾選；實際結果見 tasks.md 各 task 紀錄）：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；先綠者已點名標 regression guard；改寫的既有 it／test 已標「改寫既有 it」；E2E 常數同步標明「非紅燈」。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 只改寫了授權的三處既有測試。
  - [ ] `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` 只含本組在 proposal Impact 中的檔案。
  - [ ] 三段 typecheck exit 0；改動檔 ESLint 0 errors。
  - [ ] 只新增 spec 列出的文案；沒有巢狀三元運算；註解只寫理由。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**（審查準則，不逐項勾選；各次審查的實際結論見 tasks.md 2.4、3.5、4.4、5.6 的紀錄）：
  - [ ] 每個新增 Scenario 都有對應測試，名稱逐字相同；守衛樣本表 Scenario 對應改寫後的既有 it。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）；regression guard 已誠實標註。
  - [ ] GREEN 只滿足 RED：沒有改 `POST /api/import`、沒有整批守衛、沒有匯入回合、沒有重算分數、沒有改寫雲端既有列、沒有自動重試或跨分頁通知（scope creep）。
  - [ ] 同名略過、id 已存在略過、備份內同名去重、歷史 id 改寫 ①②③ 與 spec 逐條一致；姓名快照與分數未改（§2、§3）。
  - [ ] 409 進入附加確認而非拒絕文案；預覽名單以選檔當下的帳號讀取、讀完才顯示確認、讀取失敗不顯示確認；按下當下取帳號；取消與重新選檔不送附加；不寫本機、不重新載入（§5）。
  - [ ] `previewAppendPlayers` 的規則與 `user-data-sync` 寫入規則及 `serializeAppendSegments` 去重逐條一致，共同 fixture 與後端 it 相同（§4）。
  - [ ] 「不改」清單中的檔案未改動。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：兩條陳述式之間的可見性、CTE 與巢狀 JSON 改寫的正確性、drizzle batch 結果形狀與前端兩段式請求的狀態管理最需要最強模型。
- **required first action**：同 Stage 1。
- **review checklist**（審查準則，不逐項勾選；各次審查的實際結論見 tasks.md 2.4、3.5、4.4、5.6 的紀錄）：
  - [ ] 獨立 mutation（b～d），特別是 §2 ③ ④、§3 ① ② ⑥ ⑧ ⑩ ⑪ ⑫ ⑮、§4 ② ④ ⑨ ⑩ ⑪、§5 ② ③ ⑧ ⑨ ⑪ 與對照組。
  - [ ] 參數形狀與上限只在核心定義一次；後端送進 `json_each` 的就是 `checkAppendLimits` 回傳的 `segments`，沒有另組 JSON。
  - [ ] SQL 的所有子查詢都帶 `user_id` 條件；對應 CTE 只算一次，沒有在每位球員的子查詢內重複掃描名單。
  - [ ] 沒有 `db.run`／`db.all` 帶參數的 raw 陳述式、沒有 batch 外讀名單、沒有 `meta.changes` 計數。
  - [ ] 元件狀態沒有互斥 boolean 組合；過期的請求結果（重新選檔後才回應）不會覆寫新狀態。
  - [ ] E2E 以 web-first 斷言、沒有 `waitForTimeout`；雲端狀態以 `page.request` 讀回斷言。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：需要一次看完四組 commit，確認核心契約、後端 SQL、前端流程三層的命名與規則一致、合併後範圍不越界。
- **when**：所有 task（含 6.11 gate）完成後一次。
- **review checklist**（審查準則，不逐項勾選；實際結論見 tasks.md 6.12 的紀錄）：
  - [ ] `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] C6、C7、C9、C10 的結果與 test-plan 一致；`POST /api/import` 的既有行為與測試未被改動。
  - [ ] 指令驗收 C1～C10 皆有紀錄；前端測試數＝基線＋13、後端＝基線＋15（檔數＋1）、核心＝基線＋4；五個 browser project 各＝基線且全綠；user-data＝基線＋1。
  - [ ] 回應欄位、文案常數、函式命名在核心、後端、前端三層一致；`hono-pickball/CLAUDE.md` 與 `nextjs-pickball/CLAUDE.md` 的敘述與新行為一致。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗（特別是 user-data 中以說明文字為同步點的 spec）→ 證據上報 coordinator 裁定，不得自行改授權範圍外的既有 spec。
  - id 改寫或略過條件必須在 batch 外讀名單、改用 raw 陳述式、或增加第三條陳述式才能達成 → 停止並升級（違反 design Decision 4、11）。
  - 實作上發現必須改 proposal「不改」清單中的檔案、改 `POST /api/import` 的行為、或新增 spec 以外的文案 → 停止並升級（屬範圍變更）。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。

## 合併前流程（coordinator）

1. 全瀏覽器 gate：建立 `/tmp/cgate-cloud-json-import-append.e2e`（照 `/tmp/cgate-session-hint-failure-no-local-fallback.e2e` 複製），執行 `/tmp/cgate2.sh cloud-json-import-append`，結果寫進 tasks 6.11。
2. Final Code Review（opus）：結論寫進 tasks 6.12；產品程式碼有修正時重跑 gate。
3. `/opsx:verify`：critical／warning／suggestion 全部處理完（逐項查證、修正並 commit）才進下一步，紀錄寫進 tasks 6.13。
4. `git merge --no-ff change/cloud-json-import-append`（在 `main`）→ archive。**不 push**（push 即觸發正式站部署，由使用者決定；部署順序先 `hono-pickball` 後 `nextjs-pickball`）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、Stage 1 `sonnet`、Stage 2 與 Final `opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。每次 Agent 呼叫明確帶 `model`。
