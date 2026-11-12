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

- [ ] 1.1 確認分支 `change/local-fallback-export-reminder`、工作樹除本 change artifact 外乾淨；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install` 後 lockfile 零變動；
  雙鎖下跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck（test-plan C1）、`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（errors／warnings 數）、
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --list`（各 project 數量）；回填 environment.md Verification 並 commit（`chore:`）
- [ ] 1.2 對齊 main：以 python difflib 比對 delta spec 的 MODIFIED Requirement 與目前主 spec，除本 change 刻意改寫的文案與用途說明外應無差異（**若主 spec 已被其他 change 改動，以主 spec 為底重新套用**）；
  `grep -rn "重新整理頁面可再次連線雲端" /Users/m2_24gb/Desktop/project/nextjs-pickball/openspec/specs /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball /Users/m2_24gb/Desktop/project/nextjs-pickball/packages --exclude-dir=node_modules --exclude-dir=.next` 只命中主 spec 四處、`sync-status.ts`、`sync-status.test.ts`、`nextjs-pickball/CLAUDE.md`，無其他漏網；
  `DO_NOT_TRACK=1 openspec validate local-fallback-export-reminder --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions

## 2. 本機備援提示加入先匯出備份的提醒
Depends on: §1

- [ ] 2.1 RED（TDD、改寫既有 it）：改寫 `nextjs-pickball/lib/sync/sync-status.test.ts` 的 it「unavailable 取代內容，按鈕與本機提示文案為固定值」，`LOCAL_FALLBACK_NOTICE` 的字面值改為
  「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」；單檔 vitest 看到該 it 紅燈（期望新文案、實際舊文案）並貼出輸出；commit（`test:`）
- [ ] 2.2 GREEN（TDD）：`nextjs-pickball/lib/sync/sync-status.ts` 的 `LOCAL_FALLBACK_NOTICE` 改為同一字面值（只改字串，更新該常數 JSDoc 提到提醒先匯出備份的用途）；單檔 vitest 綠；
  另跑 `components/sync/LocalFallbackBanner.test.tsx` 與 `components/sync/SyncStatusNotice.test.tsx` 單檔皆綠（回歸，經常數引用）；`tsc` exit 0；commit（`feat:`）
- [ ] 2.3 REFACTOR：skipped（只改一個字串，無壞味道）
- [ ] 2.4 設定層（文件）：`nextjs-pickball/CLAUDE.md` 儲存三態條目中「重新整理頁面可再次連線雲端」改為說明重新整理前須先到「資料」頁匯出 JSON 備份（重新整理並連上雲端後本機資料無匯出入口）、連線後再匯入雲端；commit（`docs:`）
- [ ] 2.5 Stage 1（sonnet）→ Stage 2（opus）審查：依 execution-plan 的 checklist，結論與處置寫在本 task 後方；Stage 2 須獨立 mutation（含 b 的四條與對照組）

## 3. 指令驗收與合併前流程
Depends on: §2

- [ ] 3.1 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 3.2 驗收（指令）C2：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖）0 errors、warning 不多於基線
- [ ] 3.3 驗收（指令）C3：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖）三組皆綠；前端測試數與檔數＝基線
- [ ] 3.4 驗收（指令）C4：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖）exit 0；建置後 `git status --porcelain` 為空
- [ ] 3.5 驗收（指令）C6：產品碼、測試與兩個 workspace 範圍內不再出現舊文案（test-plan C6 的 grep 無輸出）
- [ ] 3.6 驗收（指令）C7、C8、C9、C10：delta spec 無舊字串；`git diff main --stat` 範圍 ⊆ proposal Impact；既有測試僅授權那一行被改；`DO_NOT_TRACK=1 openspec validate local-fallback-export-reminder --strict` 通過
- [ ] 3.7 驗收（指令）C5，全瀏覽器 gate（coordinator）：`/tmp/cgate-local-fallback-export-reminder.e2e` 由 coordinator 準備後執行 `/tmp/cgate2.sh local-fallback-export-reminder`；各 project 數量＝基線且 0 failed，結果寫在本 task 後方
- [ ] 3.8 Final Code Review（opus，依 execution-plan）：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選（產品程式碼有改動時重跑 3.7）
- [ ] 3.9 `/opsx:verify`：critical／warning／suggestion 全部逐項查證並處理（修正 commit 記在本 task 後方），直到報告全清才勾選
- [ ] 3.10 合併（coordinator）：在 `main` 執行 `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball merge --no-ff change/local-fallback-export-reminder`，合併後由 coordinator 執行 archive（同步主 spec 後再確認 C7 的主 spec grep 無輸出）；**不 push**（push 即觸發正式站部署，由使用者決定）
