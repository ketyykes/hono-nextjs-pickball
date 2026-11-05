# Tasks: round-timer-clear

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**，免鎖）。
> 單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/round-timer.spec.ts [-g <test 名稱>]`，前後清殘留 dev server。
> 雙鎖：`/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`（不得在 heavy.py 內再包 heavy.py）。
> **不要用 `pnpm --dir <root> --filter ./<ws>`**：filter 以 shell cwd 解析，cwd 不在 repo root 時 "No projects matched" 且 exit 0。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際跑過），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> RED 以 `null` 呼叫 `setTimerDuration`，GREEN 前為型別錯誤——**RED 與 GREEN 必須在同一張派工單內完成**（主 repo Stop hook 擋 tsc 紅燈）。
>
> **標註**：`TDD`；`regression guard`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **範圍**：產品程式碼只改 `packages/pickball-core/src/matchmaker/round.ts`（`setTimerDuration`）、`nextjs-pickball/hooks/useRoundStore.ts`、`nextjs-pickball/hooks/useRemoteRoundStore.ts`（參數型別）、`nextjs-pickball/components/matchmaker/RoundControls.tsx`。
> **不新增相依、無 migration、不動後端與 `app/**`、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **授權修改的既有測試**：無。既有 it／test 的名稱與斷言一律不得修改。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/round-timer-clear`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；
  雙鎖下跑 `pnpm --dir <repo> test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm --dir <repo> lint`（errors／warnings 數）、`pnpm --dir <repo>/nextjs-pickball exec playwright test --list`（六個 project 各自數量，另記 `round-timer.spec.ts`＋`match-stage.spec.ts` 在五個 browser project 的數量）；回填 environment.md Verification 並 commit（`chore:`）
- [x] 1.2 **相依對齊**：確認 `main` 已含 `round-settings-follow-round` 的合併 commit（`git -C <repo> log --oneline main | grep round-settings-follow-round`，且 `nextjs-pickball/lib/matchmaker/round-settings.ts` 已有 `resolveRoundSettings`）。
  **未合併 → 停止並上報 coordinator，不得開工、不得自行實作設定列跟隨、不得刪改 E2E「取消本輪計時後產生下一輪仍為不計時」迴避相依**。
  已合併 → 確認 `RoundControls.tsx` 的 `handleTimerDurationChange` 暫行處置（`if (durationMinutes === null) return;`）仍在、`setTimerDuration` 簽章仍只接受 `RoundTimerDurationMinutes`；
  以 python difflib 比對本 change MODIFIED 的「回合計時器」與目前主 spec，除本 change 刻意增修（取消計時規範段、七個新 Scenario）外應無差異；**若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**，`DO_NOT_TRACK=1 openspec validate round-timer-clear --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions
  - 紀錄（1.1）：分支 `change/round-timer-clear`、工作樹乾淨、起點 `239b19f`；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0。依 coordinator 裁定未跑 `pnpm install`（lockfile 未變）、全套 test／lint／`playwright --list`，基線數字由 coordinator 提供並回填 environment.md。
  - 紀錄（1.2）：`main` 含 `4799404 merge: round-settings-follow-round` 與封存 `239b19f`；`round-settings.ts:96` 有 `resolveRoundSettings`；`RoundControls.tsx:166` 暫行處置 `if (durationMinutes === null) return;` 仍在、`round.ts:418` `setTimerDuration` 仍只接受 `RoundTimerDurationMinutes`。difflib 比對「回合計時器」：主 spec 對 change 的差異僅為本 change 的取消計時規範段（＋10 行）與七個新 Scenario（＋47 行），無其他差異，不需重套。後端確認：`hono-pickball/src/routes/matchmaker.ts:77` 以核心 `RoundPutRequestSchema`（`versionedWriteSchema(RoundSchema)`）驗證，`RoundSchema.timer` 為 `RoundTimerObjectSchema.nullable().default(null)`，接受 `timer: null`。`openspec validate --strict` 通過。無差異，design.md Open Questions 不需增補。
- [x] 1.3 讀碼確認 design Decision 2 的收尾：`hooks/useRoundTimer.ts`、`lib/matchmaker/round-timer-sound.ts` 及其在對戰頁的使用端，對 `round.timer` 由非 `null` 變 `null` 不殘留倒數或提示音狀態；結果記在本 task 下方。若有殘留 → 停止上報（範圍變更）
  - 紀錄（1.3）：無殘留。`useRoundTimer` 的 effect 依賴 `startedAt = timer?.startedAt ?? null`，`timer` 變 `null` 時 cleanup 清掉 interval 且新 effect 早退；`remainingSeconds`／`isExpired` 對 `null` timer 回傳 `null`／`false`。`RoundTimerBanner`（`page.tsx:288` 以 `round?.timer ?? null` 常駐掛載）在 `timer === null` 時回傳 `null`，提示音 effect 只在 `expired` 為真時呼叫 `playChime`，`timer` 為 `null` 時不會觸發；`round-timer-sound.ts` 本身無狀態（去重旗標在 Banner 的 `useRef`，只影響「是否再播」，不會讓聲音在無倒數時響起）。「開始計時」按鈕由 `canStartTimer` 依 `round.timer` 推導。

## 2. 核心 `setTimerDuration` 接受 null（含兩個 store）

Depends on: §1

- [x] 2.1 RED（TDD）：`nextjs-pickball/lib/matchmaker/round.test.ts` 的 `describe("setTimerDuration")` 新增 it「setTimerDuration 傳入 null 時把本輪改回不計時，計時已開始亦同」與「已有場次離開 pending 時 setTimerDuration 傳入 null 亦拒絕且不改動回合」（依 test-plan）；
  單檔 vitest 確認前者紅、後者綠（**regression guard，點名**）並貼出輸出
- [x] 2.2 RED（TDD）：`hooks/useRoundStore.test.tsx` 新增 it「訪客模式 setTimerDuration(null) 取消本輪計時並寫回儲存」、`hooks/useRemoteRoundStore.test.tsx` 新增 it「雲端回合 setTimerDuration(null) 以 timer 為 null 寫入回合」（沿用各檔既有 fixture 與 fetch mock）；單檔 vitest 各自確認紅燈並貼出輸出
- [x] 2.3 GREEN（TDD）：`setTimerDuration` 參數型別放寬為 `RoundTimerDurationMinutes | null`，鎖定檢查之後 `null` 回傳 `{ ...round, timer: null }`、其餘維持現行；JSDoc 補 `null` 語意與「倒數已開始仍允許取消」理由（design Decision 1、2）。
  兩個 store 的 `setTimerDuration` 參數型別（含介面宣告）同步放寬，邏輯不變。2.1、2.2 的 it 全綠；四個測試檔其餘既有 it 原樣綠；兩段 typecheck exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b §2）
- [x] 2.4 REFACTOR：`null` 分支是否以 if／else 清楚表達（避免巢狀三元）、JSDoc 是否仍說「只接受 10／15／20」；無壞味道則註記 skipped
  - 紀錄（§2）：RED `d0f8d42`（2.1＋2.2 合一）、GREEN `3b247bb`、測試修正 `cb57b05`。
    - 紅燈：`round.test.ts` 1 failed／62 passed、`useRoundStore.test.tsx` 1 failed／25 passed、`useRemoteRoundStore.test.tsx` 1 failed／44 passed，三者皆失敗於 `expected { durationMinutes: null, … } to be null`（現行回傳非 null timer）。**regression guard**：「已有場次離開 pending 時 setTimerDuration 傳入 null 亦拒絕且不改動回合」寫入即綠（鎖定檢查本就先於 timer 賦值）。leader 以 `git show d0f8d42^:<path>` 複驗：三個產品檔在 RED 前後相同、三個測試檔在 RED 前不含新 it 名稱。
    - 瑕疵（誠實記錄）：GREEN `3b247bb` commit 時，訪客 it 的「讀回儲存」斷言誤以 `JSON.parse(localStorage)` 直接讀 `.timer`（儲存格式有外層容器而讀到 undefined），該 it 在 GREEN commit 上仍紅；`cb57b05` 改用既有 helper `readRound()`＋`not.toBeNull()` 後全綠。只動 Implementer 自己新增的 it；RED 時該 it 先在 `round?.timer` 斷言失敗，紅燈真實性不受影響。
    - GREEN 後：三檔 63／26／45 tests 全綠；`pnpm -r exec tsc --noEmit` 與核心 `typecheck` exit 0；改動前端檔 ESLint 0 errors（核心檔不在前端 ESLint 範圍）。`RoundControls.tsx` 未動（參數逆變，tsc 綠）。
    - mutation（Implementer 與 Stage 2 獨立各做一次，結果一致）：M1 null 分支改回 `{ durationMinutes, startedAt: null }` → 三個新 it（核心、訪客、雲端）轉紅；M2 已開始時保留原 timer → 「…計時已開始亦同」轉紅；M3 鎖定檢查移到 null 分支後 → 「已有場次離開 pending…亦拒絕…」轉紅；M4 `timer: undefined` → 三個新 it 轉紅；EQ 改寫為單一 return 三元 → 維持綠。無存活變異。
    - 2.4 REFACTOR：skipped（null 分支為 if 早退、無巢狀三元；JSDoc 無「只接受 10／15／20」字樣）。
    - Stage 1（sonnet）：PASS。Stage 2（opus）：PASS；非阻擋建議：`useRoundStore.ts` 實作內註解可補 null 語意、失敗訊息「如需改用其他計時長度…」用於取消情境語意略偏（spec 要求沿用，不改）、雲端衝突重套無專屬 null 測試（由核心純函式保證）。leader 裁定三項皆不處理（範圍外或屬沿用）。

## 3. 對戰頁「不計時」委派取消計時

Depends on: §2

- [x] 3.1 RED（TDD）：`components/matchmaker/RoundControls.test.tsx` 新增 it「回合存在且未鎖定時點選不計時委派 setTimerDuration(null)」與「回合存在且未鎖定時方向鍵移到不計時亦委派 setTimerDuration(null)」（沿用 `buildProps`／`buildRound`）；單檔 vitest 確認兩者紅並貼出輸出
- [x] 3.2 RED（TDD，E2E）：`tests/e2e/specs/round-timer.spec.ts` 新增 test「回合存在時選不計時可取消已開始的本輪計時」與「取消本輪計時後產生下一輪仍為不計時」（步驟依 test-plan）；
  雙鎖下以單檔 E2E（chromium、`-g` 各篩一次）確認紅燈（預期失敗於「不計時」的 `aria-checked`，而非前置步驟）並貼出輸出
- [x] 3.3 GREEN（TDD）：`RoundControls.tsx` 的 `setTimerDuration` prop 型別放寬；`handleTimerDurationChange` 回合存在時一律委派 `commitTimerDuration(durationMinutes)`；刪除 ⚠️ 暫行處置註解並改寫為一句「`null` 代表取消本輪計時」的說明（design Decision 3）。
  3.1、3.2 全綠；`RoundControls.test.tsx` 其餘既有 it 原樣綠；雙鎖下 chromium 的 `round-timer.spec.ts`、`match-stage.spec.ts` 全檔綠；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b §3）
- [x] 3.4 REFACTOR：handler 是否還有多餘分支、上方註解是否殘留「尚未定案」「SHALL NOT 在此自行決定」字樣；無壞味道則註記 skipped
  - 紀錄（§3）：RED 單元 `6afe891`、RED E2E `08763c7`、GREEN `8eb69a6`；無 refactor commit。
    - 單元紅燈：`RoundControls.test.tsx` 2 failed／24 passed，兩個新 it 皆 `expected "vi.fn()" to be called 1 times, but got 0 times`；無先綠者。
    - E2E 紅燈（chromium、`-g` 各一次，雙鎖）：「回合存在時選不計時可取消已開始的本輪計時」失敗於 :345、「取消本輪計時後產生下一輪仍為不計時」失敗於 :372，皆為點「不計時」後 `aria-checked` 期望 "true" 收到 "false"，前置步驟（產生本輪、開始計時、倒數可見）皆通過。
    - leader 機械複驗：`RoundControls.tsx` 自 `6afe891^` 至 `08763c7` 無變動；兩測試檔在各自 RED 前不含新名稱。
    - GREEN：`RoundControls.tsx` prop 型別放寬、刪除 `if (durationMinutes === null) return;` 與 ⚠️ 暫行處置註解，改寫為「`null` 代表取消本輪計時…鎖定由純函式與 locked 共同守住」。`RoundControls.test.tsx` 26 passed；雙鎖下 chromium `round-timer.spec.ts`＋`match-stage.spec.ts` 29 passed／0 failed（4＋25，基線 2＋25）；三段 typecheck exit 0；三個改動檔 ESLint 0 errors；E2E 無 `waitForTimeout`。
    - E2E 同步點：倒數文字以 `getByText(/^\d{2}:\d{2}$/)`；第二個 test 頁面無輪次標題，改以「產生前記下 `[data-testid$="-grid"]` 的 testid（`court-${match.id}-grid`），產生後等其 `toHaveCount(0)`」為舊場地網格消失的同步點。
    - mutation（Implementer 與 Stage 2 獨立各做）：M1 加回 null 早退 → 兩新 it 紅；M2 `commitTimerDuration(10)` → 兩新 it 紅於 `toHaveBeenCalledWith(null)`；M3 null 改走 onSettingsChange → 兩新 it 紅（先紅於次數）；M3b（Stage 2 補）同時呼叫 commit 與 onSettingsChange → 兩新 it 紅於 `onSettingsChange).not.toHaveBeenCalled()`；M4 方向鍵索引 0 不呼叫 → 只有方向鍵 it 紅；M5 等價對照（回合分支合一行）→ 維持綠。無存活變異。
    - 3.4 REFACTOR：skipped（handler 無多餘分支；整檔無「尚未定案」「SHALL NOT 在此自行決定」「只接受 10／15／20」殘留）。
    - Stage 1（sonnet）：PASS。Stage 2（opus）：PASS；非阻擋建議：props JSDoc 可補 null 語意、grid locator 可限縮於 `match-stage-courts` 底下、倒數 regex 為整頁比對（目前 fixture 下唯一）。leader 裁定不處理（非必要，且不擴大改動）。

## 4. 文件與指令驗收

Depends on: §3

- [x] 4.1 設定層（文件）：查核 `nextjs-pickball/CLAUDE.md` 是否描述「回合存在時不計時無作用」或計時設定的變更方式；有則同步並 commit（`docs:`），否則在本 task 下記錄查核結果、不 commit
  - 紀錄：`nextjs-pickball/CLAUDE.md` 唯一提及計時處為 `lib/matchmaker/` 模組清單中的 `round-timer`，無「回合存在時不計時無作用」或計時設定變更方式的描述，不需同步，不 commit。
- [x] 4.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 紀錄：leader 於 §3 GREEN 後（HEAD `8eb69a6`）實跑 `pnpm --dir <repo> -r exec tsc --noEmit`、`pnpm --dir <repo>/hono-pickball typecheck`、`pnpm --dir <repo>/packages/pickball-core typecheck`，皆 exit 0。
- [ ] 4.3 驗收（指令）C2：雙鎖下 `pnpm --dir <repo> lint` 0 errors、warning 不多於基線
  - 由 coordinator 於合併前執行（基線 0 errors／3 warnings）。
- [ ] 4.4 驗收（指令）C3：雙鎖下 `pnpm --dir <repo> test` 全綠；前端檔數不變、測試數＝基線＋6，後端與核心與基線相同
  - 由 coordinator 於合併前執行（基線前端 111 檔／1112 tests → 預期 111 檔／1118 tests；後端 26／215、核心 10／27 不變）。
- [ ] 4.5 驗收（指令）C4：雙鎖下 `pnpm --dir <repo> build` exit 0；建置後 `git status --porcelain` 為空
  - 由 coordinator 於合併前執行。
- [ ] 4.6 驗收（指令）C5：依 test-plan C5 的 ①②③ 分次執行（每次雙鎖、前後清殘留）；結果寫在本 task 後方；失敗不得自行判定為雜訊
  - 由 coordinator 於合併前執行（預期：① 每個 browser project 兩檔 27→29；② chromium 全套 156→158；③ user-data `round-sync.spec.ts` 9 passed）。leader 已見 chromium 兩檔 29 passed（§3 Implementer 實跑）。
- [x] 4.7 驗收（指令）C6：test-plan C6 的 ① 輸出為空、② 恰為四個產品檔
  - 紀錄：① 輸出為空；② 恰為 `nextjs-pickball/components/matchmaker/RoundControls.tsx`、`nextjs-pickball/hooks/useRemoteRoundStore.ts`、`nextjs-pickball/hooks/useRoundStore.ts`、`packages/pickball-core/src/matchmaker/round.ts`（CLAUDE.md 未更新）。`openspec/specs/` 無改動。
- [x] 4.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate round-timer-clear --strict` 通過
  - 紀錄：`Change 'round-timer-clear' is valid`。

> `<repo>` 一律為 `/Users/m2_24gb/Desktop/project/nextjs-pickball`。
