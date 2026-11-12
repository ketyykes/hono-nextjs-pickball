# Tasks: local-fallback-export-reminder

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest（免鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`
> （**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時會 "No projects matched" 且 exit 0）。
>
> **重負載雙鎖**（E2E、eslint 全套、全套 vitest、build）：先 `/tmp/lock-fast.sh nextjspickball "<說明>"` →
> `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 紅燈宣稱一律以 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同；改寫的既有 it 確認 RED 前為舊字面值）。
>
> **標註**：`TDD`；`regression guard`；`改寫既有 it`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C10）。
>
> **範圍**：產品程式碼只改 `nextjs-pickball/lib/sync/sync-status.ts` 的常數字面值；文件只改 `nextjs-pickball/CLAUDE.md`。**不新增相依、無 migration、禁止任何遠端 CF 操作、不 push**。
> 文案以 delta spec `user-data-sync`「session 無法確認時的阻擋畫面與本機備援」為準，逐字相同；SHALL NOT 新增 spec 以外的文案、SHALL NOT 加連結或按鈕。
>
> **授權改寫的既有測試（僅限下列；其餘既有 it／test 的名稱、斷言與 setup 一律不得修改）**：
> `nextjs-pickball/lib/sync/sync-status.test.ts` 的 it「unavailable 取代內容，按鈕與本機提示文案為固定值」：`LOCAL_FALLBACK_NOTICE` 的字面值斷言改為新文案（名稱與其他斷言不變）。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/local-fallback-export-reminder`、工作樹除本 change artifact 外乾淨；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install` 後 lockfile 零變動；
  雙鎖下跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck（test-plan C1）、`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（errors／warnings 數）、
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --list`（各 project 數量）；回填 environment.md Verification 並 commit（`chore:`）
  - 結果：見 environment.md Verification（全綠，＝上一個 change 最終 gate）。
- [x] 1.2 對齊 main：以 python difflib 比對 delta spec 的 MODIFIED Requirement 與目前主 spec，除本 change 刻意改寫的文案與用途說明外應無差異（**若主 spec 已被其他 change 改動，以主 spec 為底重新套用**）；
  `grep -rn "重新整理頁面可再次連線雲端" /Users/m2_24gb/Desktop/project/nextjs-pickball/openspec/specs /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball /Users/m2_24gb/Desktop/project/nextjs-pickball/packages --exclude-dir=node_modules --exclude-dir=.next` 只命中主 spec 四處、`sync-status.ts`、`sync-status.test.ts`、`nextjs-pickball/CLAUDE.md`，無其他漏網；
  `DO_NOT_TRACK=1 openspec validate local-fallback-export-reminder --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions
  - 結果（coordinator，2026-11-12）：difflib 比對 MODIFIED Requirement 與主 spec，差異只有四處文案替換與新增的三行用途說明；舊文案 grep 只命中主 spec、`sync-status.ts`、`sync-status.test.ts`、`nextjs-pickball/CLAUDE.md`；validate 通過。主 spec 未被其他 change 改動，Open Questions 無新增。

## 2. 本機備援提示加入先匯出備份的提醒
Depends on: §1

- [x] 2.1 RED（TDD、改寫既有 it）：改寫 `nextjs-pickball/lib/sync/sync-status.test.ts` 的 it「unavailable 取代內容，按鈕與本機提示文案為固定值」，`LOCAL_FALLBACK_NOTICE` 的字面值改為
  「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」；單檔 vitest 看到該 it 紅燈（期望新文案、實際舊文案）並貼出輸出；commit（`test:`）
  - 結果：單檔 vitest 紅燈，`Test Files 1 failed`、`Tests 1 failed | 3 passed (4)`；`AssertionError: expected '目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端' to be '目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料…'`（真紅燈，產品檔未動）。
- [x] 2.2 GREEN（TDD）：`nextjs-pickball/lib/sync/sync-status.ts` 的 `LOCAL_FALLBACK_NOTICE` 改為同一字面值（只改字串，更新該常數 JSDoc 提到提醒先匯出備份的用途）；單檔 vitest 綠；
  另跑 `components/sync/LocalFallbackBanner.test.tsx` 與 `components/sync/SyncStatusNotice.test.tsx` 單檔皆綠（回歸，經常數引用）；`tsc` exit 0；commit（`feat:`）
  - 結果：`sync-status.test.ts` 4 passed；`LocalFallbackBanner.test.tsx` 1 passed；`SyncStatusNotice.test.tsx` 2 passed；`pnpm -r exec tsc --noEmit` exit 0。Implementer 自跑 mutation 7 次（單檔 sync-status.test.ts，三重落地檢查通過、每次還原）：舊文案、「資料」改「設定」、漏「匯出 JSON 備份」、順序對調、漏句號共 5 條皆轉紅；對照組（字串拆兩段以 `+` 串接、改模板字串）2 條維持綠；結束後 git status 僅剩預期變更。
- [x] 2.3 REFACTOR：skipped（只改一個字串，無壞味道）
- [x] 2.4 設定層（文件）：`nextjs-pickball/CLAUDE.md` 儲存三態條目中「重新整理頁面可再次連線雲端」改為說明重新整理前須先到「資料」頁匯出 JSON 備份（重新整理並連上雲端後本機資料無匯出入口）、連線後再匯入雲端；commit（`docs:`）
  - 結果：`nextjs-pickball/CLAUDE.md` 該條目已改寫；`grep -rn "重新整理頁面可再次連線雲端"` 於 workspace 範圍（排除 node_modules、.next）無命中。
- [x] 2.5 Stage 1（sonnet）→ Stage 2（opus）審查：依 execution-plan 的 checklist，結論與處置寫在本 task 後方；Stage 2 須獨立 mutation（含 b 的四條與對照組）
  - Stage 1（sonnet）：PASS，無必修。字面值在 delta spec 4 處、`sync-status.ts:31`、`sync-status.test.ts:70` 逐字一致；RED `67a5048` 只動測試與 tasks、產品檔仍為舊文案（真紅）；舊文案只剩主 spec（archive 時同步）；範圍 4 檔。
  - Stage 2（opus）：PASS，無必修。獨立 mutation：舊文案、「資料」→「設定」、漏「匯出 JSON 備份，」、句序對調、漏句號 5 條皆轉紅；拆字串 `+`、模板字串 2 條對照組維持綠；每條三重落地、已還原。用語與導覽名「資料」、按鈕「匯出 JSON」「選擇備份檔匯入雲端…」一致。
  - 建議處置（coordinator）：① 提示由約 2 行增為 3 行、底部遮擋範圍略增（不擋操作、不碰專注模式操作列）② 中文任意字間斷行 ③「再次連線」嚴格為「再次嘗試連線」（仍連不上會回到 unavailable、本機資料仍在，無資料風險）→ 三項皆記入 design Risks 為接受的取捨，文案維持使用者已看過的版本。

## 3. 指令驗收與合併前流程
Depends on: §2

- [x] 3.1 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 結果（gate，HEAD `33bff35`，雙鎖，2026-11-12）：root、後端、核心三段 typecheck 皆 exit 0。
- [x] 3.2 驗收（指令）C2：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖）0 errors、warning 不多於基線
  - 結果（gate，HEAD `33bff35`，雙鎖，2026-11-12）：0 errors／3 warnings（＝基線）。
- [x] 3.3 驗收（指令）C3：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖）三組皆綠；前端測試數與檔數＝基線
  - 結果（gate，HEAD `33bff35`，雙鎖，2026-11-12）：前端 119／1197、後端 28／238、核心 10／31 全綠（＝基線；本 change 只改寫既有 it 的字面值）。
- [x] 3.4 驗收（指令）C4：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖）exit 0；建置後 `git status --porcelain` 為空
  - 結果（gate，HEAD `33bff35`，雙鎖，2026-11-12）：build exit 0，建置後 porcelain 空。
- [x] 3.5 驗收（指令）C6：產品碼、測試與兩個 workspace 範圍內不再出現舊文案（test-plan C6 的 grep 無輸出）
  - 結果（coordinator）：C6 grep 無輸出（exit 1）。
- [x] 3.6 驗收（指令）C7、C8、C9、C10：delta spec 無舊字串；`git diff main --stat` 範圍 ⊆ proposal Impact；既有測試僅授權那一行被改；`DO_NOT_TRACK=1 openspec validate local-fallback-export-reminder --strict` 通過
  - 結果（coordinator）：C7 delta spec 無舊字串（exit 1）；C8 `git diff main --stat` 只有 `sync-status.ts`、`sync-status.test.ts`、`nextjs-pickball/CLAUDE.md` 與本 change artifact，主 spec／schemas 未動；C9 刪除行只有舊字面值一行；C10 validate 通過。
- [x] 3.7 驗收（指令）C5，全瀏覽器 gate（coordinator）：`/tmp/cgate-local-fallback-export-reminder.e2e` 由 coordinator 準備後執行 `/tmp/cgate2.sh local-fallback-export-reminder`；各 project 數量＝基線且 0 failed，結果寫在本 task 後方
  - 結果（gate，HEAD `33bff35`，雙鎖，2026-11-12）：chromium 167、firefox 154＋13 skip、mobile-chrome 164＋3、webkit 51＋5／48＋8／55、mobile-safari 51＋5／48＋8／55（各＝基線 167、0 failed，skip 皆既有瀏覽器條件）；user-data 49 全 passed；porcelain 空。
- [x] 3.8 Final Code Review（opus，依 execution-plan）：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選（產品程式碼有改動時重跑 3.7）
  - Final Code Review（opus）：PASS，無必修、無新建議。範圍 12 檔（產品／測試／文件 3 檔＋artifact）、主 spec／schemas 未動；自跑 C6～C10 與 tasks 3.5、3.6 一致；文案字樣與 `section-nav.ts:31`、`JsonBackupSection.tsx:206,236` 一致；`nextjs-pickball/CLAUDE.md:62` 與實作一致。
- [x] 3.9 `/opsx:verify`：critical／warning／suggestion 全部逐項查證並處理（修正 commit 記在本 task 後方），直到報告全清才勾選
  - verify 第一輪（opus，2026-11-12）：CRITICAL 0、WARNING 0、SUGGESTION 1；15 個 Scenario 錨點逐字存在且與測試一致，gate 後產品碼未變。處置（coordinator）：S1 proposal:13「兩份文件」、overview:18「兩處文件」與實際（一份測試＋一份文件）不符 → 改正。只動文件、無 critical／warning 殘留，結束 verify。
- [x] 3.10 合併（coordinator）：在 `main` 執行 `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball merge --no-ff change/local-fallback-export-reminder`，合併後由 coordinator 執行 archive（同步主 spec 後再確認 C7 的主 spec grep 無輸出）；**不 push**（push 即觸發正式站部署，由使用者決定）
  - 合併 `--no-ff` 進 `main` 後 archive（coordinator）；未 push。
