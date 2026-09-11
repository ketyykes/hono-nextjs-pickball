> **TDD 三步**：每個 task 拆為 ① 新增失敗測試並用 `pnpm --filter ./nextjs-pickball test:e2e <path>`（一律帶 `--workers=1`）在 shell 實際看到紅燈（貼出輸出）② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點（或 test-plan.md 指定名稱）逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**：本 change 全段落在 `nextjs-pickball/CLAUDE.md` 的 TDD 例外層（純呈現型元件與 Playwright E2E，見 design Context），§2／§3 的紅燈多半來自「元素找不到」或「提示不存在」，那是真紅燈。§4 的行為底層邏輯已存在且正確，該 test **很可能加入即綠**——若如此，MUST 在該項後方誠實標註為 **regression guard**，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **本 change 不得新增任何 npm 相依、不得新增任何 hook、不得修改任何 `lib/matchmaker/**` 檔案**（design Context：三項缺口的底層邏輯皆已正確）。需要新套件或需要修改 `lib/` 才能實作時一律回報 BLOCKED。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 對 `main` 上既有程式碼的
> 追蹤結果核對一次，避免 §2 之後的工作建立在過期或錯誤的假設上。**本 change 為 M10～M15
> 這一批的第一棒，無前一棒需確認合併**（見 environment.md／design.md Open Questions 第 1 條）。

- [x] 1.1 確認目前 cwd 為 environment.md 宣告的 worktree，且 baseline `pnpm test` 全綠；把 baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [x] 1.2 確認 `main` 上已含 `3fa2d22`（`git log --oneline -1` 或等效檢查）。本 change 無前一棒需合併，此項核對僅確認開分支前提成立，不需額外動作
- [x] 1.3 讀 `nextjs-pickball/lib/matchmaker/round.ts` 的 `resetIncompleteMatches` 與 `nextjs-pickball/lib/matchmaker/candidates.ts` 的 `selectPlaying`，核對 design Context／Decision 1、4 所述的「候選池計算不過濾 `isActive`、`isActive` 的過濾發生在 `selectPlaying`」是否與 `main` 上實際程式碼一致。**不一致則停止並回報**，SHALL NOT 依本文件假設開工——本 change 的 spec 可達性論證與 §2、§4 的 E2E 重現步驟皆建立在這個追蹤結果上
- [x] 1.4 讀 `nextjs-pickball/hooks/useRoundStore.ts`（`droppedCount` 附近，約第 90 行）、`nextjs-pickball/lib/matchmaker/round-storage.ts` 的 `readHistory()`，與 `nextjs-pickball/app/matchmaker/players/page.tsx` 第 67～75 行既有的損毀提示區塊，記錄 `droppedCount` 的實際回傳形狀與既有提示樣式 class／文案，供 §3 GREEN 直接比照
- [x] 1.5 讀 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 的 `seedRoster`／`trackConsoleIssues`／`tabUntilFocused` 與 `nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts` 的 `seedHistory`／`buildEntry`／`player` 等既有 helper，核對簽章與既有用法，供 §2～§4 直接沿用、SHALL NOT 重寫一份

## 2. 本輪場次為空時的畫面說明

Depends on: §1

- [x] 2.1 RED: 於 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 新增兩個 test：「回合存在但本輪無場次時顯示說明文字與前往參賽者名單入口」（種 2 位參賽者 → 產生本輪對戰 → 於參賽者頁把其中一位設為暫停出場 → 回對戰頁點擊「重設／再排」→ 斷言 `getByTestId("empty-matches")` 可見、`getByTestId("match-stage-courts")` 筆數為 0、`getByRole("link", { name: "前往參賽者名單" })` 可見）、「回合存在且有場次時不顯示本輪場次為空的說明」（種 2 位參賽者 → 產生本輪對戰 → 斷言 `getByTestId("empty-matches")` 筆數為 0）。跑單檔確認兩者紅燈並貼出輸出（預期為 `empty-matches` 測不到元素）
  備註：RED 首版以 `page.goto()` 切換頁面而無法重現目標狀態——`seedRoster` 的 `addInitScript` 會在每次真正的瀏覽器導覽時重跑、把名單重設回全員出場，蓋掉靠 UI 做出的「設為暫停」。已改用區段導覽 `<Link>` 的 client-side 軟導覽（`adbb24e`），該限制已寫進測試檔內註解，避免日後有人「順手」改回 `page.goto()`。
  備註（Stage 1 Review 偏離，commit `8e658a5`）：原斷言只驗 `empty-matches` 可見與連結存在，未驗說明文字內容、也未驗連結真的導向 `/matchmaker/players`。已補 `toContainText("本輪目前沒有任何場次")` 與點擊後 `toHaveURL(/\/matchmaker\/players$/)`。此為斷言補強，**產品程式碼零改動**。
  備註（Stage 2 Review 偏離，commit `6159a7b`＋`cbc983a`）：Reviewer 獨立 mutation 實測發現兩個存活——① 把說明句清空後前述斷言仍全綠，已補 `toContainText("候選人數不足以組成任何一場比賽")`；② `EmptyMatches` 根節點缺 `flex-1`，說明卡片縮成內容寬（1280 視窗下實測 554px 而非 680px），休息名單左移 126px、整列右緣與同頁其他區塊對不齊，而既有斷言全數無感。**此項為本 §2 唯一的產品程式碼修正**（`EmptyMatches.tsx` 補 `flex-1`），並新增第三個 test「桌面斷點本輪無場次時說明卡片佔滿場地欄寬度」以「說明卡片與場地網格同寬」「休息名單左緣不因場次有無而位移」兩條相對關係鎖住（不寫死像素）。因此本項最終在 `match-stage.spec.ts` 新增的是**三個** test 而非本項原述的兩個；新增的第三條為版面 regression guard，不對應任何 delta spec 錨點（故不列入 5.1 的錨點比對）。
- [x] 2.2 GREEN: 新增 `nextjs-pickball/components/matchmaker/EmptyMatches.tsx`（`"use client"`，無 props，`data-testid="empty-matches"`，繁體中文標題＋說明＋`前往參賽者名單` 連結，版面沿用 `EmptyStage.tsx` 的既有形狀：虛線邊框卡片、標題＋說明＋一個入口）；修改 `nextjs-pickball/components/matchmaker/MatchStage.tsx`，把原本無條件的 `round.matches.map(...)` 改為 `round.matches.length === 0` 時渲染 `EmptyMatches`、否則渲染原有場地網格（`data-testid="match-stage-courts"` 只在有場次時存在）。`RestingPanel`（休息名單側欄）維持一律渲染，不受此條件影響
- [x] 2.3 REFACTOR: 確認 `EmptyMatches.tsx` 零 props、標題／說明文案為具名常數（比照 `EmptyStage.tsx` 的 `NO_PLAYERS_TITLE` 等既有寫法）；確認 `MatchStage.tsx` 的條件判斷只有這一處新增分支，沒有把任何原本屬於 `lib/` 的邏輯搬進元件；註解說明為什麼此狀態與「空白球場狀態」不同（design Decision 1）

## 3. 損毀歷史紀錄的可見提示

Depends on: §1

- [x] 3.1 RED: 於 `nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts` 新增兩個 test：「有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示」（以 `page.addInitScript` 種入 `matchmaker:history:v1` 含一筆合法紀錄與一筆缺必要欄位的不合法紀錄 → 開啟 `/matchmaker/history` → 斷言 `getByRole("alert")` 可見且文字含損毀筆數與「歷史紀錄」，合法紀錄的球員姓名仍可見）、「沒有損毀歷史紀錄時不顯示損毀提示」（種入僅含合法紀錄 → 斷言 `getByRole("alert")` 筆數為 0）。跑單檔確認兩者紅燈並貼出輸出
  備註：「沒有損毀歷史紀錄時不顯示損毀提示」該條在 RED 提交（`1c2f37e`）當下即為綠燈——彼時 `HistoryView.tsx` 尚未渲染任何 `role="alert"` 元素，`toHaveCount(0)` 天然成立，非對「不應顯示」行為的真實紅燈驗證，屬 **regression guard**；其防退化效力由 mutation 驗證（把 `droppedCount > 0` 條件拿掉後該條轉紅）佐證，未偽造紅燈。
  備註：兩個新 test 皆未直接用 `getByRole("alert")`，改用本檔新增的 `historyCorruptionAlert(page)` helper（`[role="alert"]:not(#__next-route-announcer__)`）——Next.js 的 route announcer 本身即帶 `role="alert"` 且恆為空字串內容、非 `aria-hidden`，會被 `getByRole("alert")` 一併命中，讓「有幾個 alert」與「alert 文字是什麼」兩種斷言都失真，故排除該固定 id 才能鎖定本頁實際渲染出來的提示。
  備註（Stage 2 Review 2 偏離，commit `5f4bc37`）：原斷言只種 1 筆損毀紀錄並以 `toContainText("1")` 驗筆數，經 Reviewer 獨立 mutation 實測**存活**——把 `HistoryView.tsx` 的 `{hydrated.droppedCount}` 插值寫死成常數 `1` 後 E2E 依然全綠，該斷言無法證明畫面數字真的讀自 `droppedCount`。已改為種 2 筆損毀並斷言「2」，再於同一 test 末尾重新 seed 成 3 筆、`reload()` 後斷言「3」：兩個相異取值使任何寫死常數皆轉紅（已實測寫死 `1`／寫死 `2` 分別在第一段與第二段轉紅）。此為斷言補強，**產品程式碼零改動**。
- [x] 3.2 GREEN: 修改 `nextjs-pickball/components/matchmaker/HistoryView.tsx`：hydration 的 `useEffect` 內同時取用 `readHistory()` 回傳的 `entries` 與 `droppedCount`（目前只取前者），存進既有的 `HydratedHistory` reducer state；`droppedCount > 0` 時於內容最上方（`<HistoryRangeFilter>` 之前）渲染 `role="alert"` 提示，樣式 class 與文案比照 `nextjs-pickball/app/matchmaker/players/page.tsx` 第 67～75 行既有區塊（「有 {droppedCount} 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。」），**不修改** `app/matchmaker/players/page.tsx`、**不抽共用元件**（design Decision 2）
- [x] 3.3 REFACTOR: 確認提示區塊只在 `hydrated !== null && hydrated.droppedCount > 0` 時渲染（避免 SSR／CSR 不一致的 hydration mismatch，比照既有 `entries` 的取用方式）；確認 `HistoryView.tsx` 仍未 import `useRoundStore`；於新增區塊旁以繁體中文註解說明「各自持有一份、不抽共用元件」的理由（design Decision 2），避免日後被誤判為疏漏而順手抽象

## 4. 重設／再排的端到端覆蓋（無對應 spec 異動）

Depends on: §1

> 見 design Decision 3：本組**不修改任何 Requirement**，`match-stage` 與 `round-lifecycle`
> 兩份主 spec 皆維持逐字不變。此組只有 RED、**沒有對應的 GREEN 產品程式碼**——行為底層已由
> `lib/matchmaker/round.test.ts` 與 `components/matchmaker/RoundControls.test.tsx` 覆蓋且正確，
> 本 task 只是為既有行為補一層端到端證據。

- [x] 4.1 RED: 於 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 新增 test「重設／再排後已完成場次保留、未完成場次重新分配且休息名單排除已比賽者」：種 6 位參賽者 → 點擊「增加場地數」一次（courtCount 變 2）→ 點擊「產生本輪對戰」（2 場、各 2 人、2 人休息）→ **以既有「送出比分失敗時 role=alert 只出現在對應的場地卡片，不會擴散到其他場地」test 的既有作法**（`page.getByTestId("match-stage-courts").locator('[data-testid$="-grid"]')` 取得兩個場地的 grid locator、以 `.nth(0)` 鎖定第一場地）在第一場地的範圍內填入「第一隊比分」11、「第二隊比分」7 並點擊「送出比分」，SHALL NOT 直接對整頁呼叫 `page.getByLabel("第一隊比分")`——兩個場地皆有同名欄位，未限定範圍會觸發 Playwright 的 strict-mode 多重命中錯誤 → 讀 `matchmaker:round:v1` 記錄完成場次的 `id`／`courtNumber`／`scores`／`winner`、待重排場次的 `id`、`restingPlayerIds`（斷言長度為 2）→ 點擊「重設／再排」→ 再讀 `matchmaker:round:v1`：完成場次以同一 `id` 存在且 `scores`／`winner`／`courtNumber`／`completedAt` 逐項不變；`matches.length` 仍為 2；另一個（非完成）場次的 `id` 與重排前不同；`restingPlayerIds.length` 仍為 2 且不含完成場次那兩位球員的 `id`。跑單檔確認執行結果——**預期為加入即綠（regression guard）**：完成本文件描述的重現步驟後，若測試一次就綠，MUST 在本項後方誠實標註「regression guard：`resetIncompleteMatches` 與其 UI wiring 已由既有單元測試（`round.test.ts`）與元件測試（`RoundControls.test.tsx`）覆蓋且正確，本測試只新增端到端證據，未偽造紅燈」；若測試不綠，代表底層邏輯與既有單元測試的保證不一致，MUST 停止並回報 BLOCKED，SHALL NOT 修改 `lib/matchmaker/round.ts` 來將就測試
      → **regression guard**：`resetIncompleteMatches` 與其 UI wiring 已由既有單元測試（`round.test.ts`）與元件測試（`RoundControls.test.tsx`）覆蓋且正確，本測試只新增端到端證據，未偽造紅燈。第一次執行即綠（847ms）。實測 6 人 2 場地分配結果為 2 場單打（各 2 人）、2 人休息，與本項描述一致。額外以人工等效 mutation 驗證兩次（皆已復原、`git diff` 為空）：① 把 `keptMatches` 過濾條件改為 `match.status === "pending"` → 轉紅於「完成場次以同一 id 存在」斷言；② 讓 `resetIncompleteMatches` 對非 null 回合直接回傳原 round（no-op）→ 轉紅於「非完成場次 id 改變」斷言。

## 5. 收尾驗證

Depends on: §2, §3, §4

- [x] 5.1 逐條核對 delta spec（`specs/match-stage/spec.md`、`specs/match-history/spec.md`）的每個「驗收」錨點：檔案路徑存在、`test` 名稱逐字相符；另核對 §4 的 test 名稱與 test-plan.md「重設／再排的端到端覆蓋」表格逐字相符（§4 無 delta spec 錨點可對，改對 test-plan.md）。**不靠目視**，以腳本抽取比對
      → 以 python 腳本用 `re.findall(r'^\s*test\("([^"]+)"', ...)` 抽出兩份測試檔的所有 test 名稱集合，逐一比對 4 個 delta spec 錨點＋ 1 個 test-plan.md §4 名稱，**5 項全數 MATCH**（詳見回報內文的腳本輸出）。
- [x] 5.2 `pnpm test` 全套通過（`-r`，前端 Vitest ＋ 後端 workerd runtime；確認未破壞既有測試，含 hono-pickball 後端測試——本 change 完全不觸碰後端，理論上零影響）
      → 前端 68 test files / 638 tests passed；後端 4 test files / 16 tests passed。與 apply Step 0 baseline 完全一致，無新增／無破壞。
- [x] 5.3 `pnpm -r exec tsc --noEmit` 通過
      → 兩個 workspace 皆無輸出、exit 0。
- [x] 5.4 `pnpm --filter ./nextjs-pickball lint` 通過（0 errors；既有 warning 不得新增）
      → `0 errors, 3 warnings`，3 個 warning 皆為既有已知項目（`hooks/useQuiz.ts`、`hooks/useRosterStore.ts`、`hooks/useScoreboardStore.ts`），未新增。
- [x] 5.5 `pnpm --filter ./nextjs-pickball test:e2e --workers=1` 全套通過，**五個 browser project 皆跑**；`match-stage.spec.ts`、`matchmaker-history.spec.ts` 既有 test 全數原樣通過，其餘既有 E2E spec（`player-roster.spec.ts`、`scoreboard-binding.spec.ts`、`matchmaker-data-transfer.spec.ts`、`visual-export.spec.ts` 等）不受影響
      → **未通過（回報 coordinator 裁示，非自行判定）**：542 passed／2 failed／21 skipped（10.5 分鐘）。失敗為 `scoreboard-binding.spec.ts:384`「計分中的場次顯示計分中標示與當前比分」，在 `[webkit]` 與 `[mobile-safari]` 兩個 project 上皆於 `beforeEach` 的 `page.goto("/")` 逾時 30000ms（並非 `KNOWN_DEV_ONLY_NOISE` 的 `ChunkLoadError` 樣式）。本 change 完全未觸碰 `scoreboard-binding.spec.ts` 或計分板相關程式碼。事後將該筆測試單獨於 `[webkit]`＋`[mobile-safari]` 重跑（`-g` 篩選），**兩者皆一次通過**。**coordinator 後續於完全乾淨的環境（零殘留 process、零佔用 port、已刪 `test-results/`／`playwright-report/`）重跑全套一次，結果逐字重現：同樣 542 passed／2 failed／21 skipped，同樣是 `scoreboard-binding.spec.ts:384` 在 `[webkit]` 與 `[mobile-safari]` 逾時於 `page.goto("/")`**——因此**不是**首跑當下的高負載巧合，而是全套脈絡下可重現的順序相依現象。同一支 spec 單獨在該兩個 project 重跑則 36/36 全過（該條僅耗時 1.2s，對比全套時逾時 30s）。另機械確認本 change 的三個產品檔（`EmptyMatches.tsx`／`MatchStage.tsx`／`HistoryView.tsx`）僅被 `app/matchmaker/page.tsx` 與 `app/matchmaker/history/page.tsx` import，而失敗處導覽的 `/` 路由（`app/page.tsx`）只 import `components/guide/**` 與 `components/ui/separator`，與本 change 零關聯，結構上不可能由本 change 造成。依規範本組**無權自行認定為雜訊**並勾選通過，故先維持未勾選並升級給 coordinator 裁示。
      → **裁示結果（2026-09-06，判定通過）**：coordinator 於 `main`（`3da4ce9`，M10 合併前）乾淨環境獨立重跑同一條全套指令，得到**相同失敗模式**——同一支 `scoreboard-binding.spec.ts`、同樣 `[webkit]`／`[mobile-safari]` 兩個 project、同樣逾時於 `beforeEach` 的 `page.goto("/")`（512 passed／2 failed／21 skipped，9.9 分鐘）。唯一差異是命中的 test 名稱不同（`main` 為「已完成場次不顯示進入計分板入口」，本分支為「計分中的場次顯示計分中標示與當前比分」），正符合「同一份 `beforeEach` 在長時間單 worker 全套執行下隨機命中逾時」的體質，而非特定 test 的邏輯問題。**結論：此為 `main` 上既有、與 M10 無關的環境性瞬時逾時，非本 change 引入的迴歸**，5.5 視為通過。
      → **交叉驗算佐證**：本分支 542 passed 減 `main` 512 passed ＝ 30，恰等於本 change 新增的 6 條 test（`match-stage.spec.ts` 4 條、`matchmaker-history.spec.ts` 2 條）× 5 個 browser project；且 `git diff main..HEAD -- tests/e2e/specs/` 的刪除行數為 0。兩者合起來證明本分支相對 `main` **只多出新增的測試，沒有任何既有 test 消失、被改名或被 skip**。`match-stage.spec.ts`、`matchmaker-history.spec.ts`（含本 change 新增的 6 條 test）在全部五個 project 上皆全數通過。21 skipped 為既有 `api-health.spec.ts`（僅 chromium 跑，其餘 project 依既有設定 skip）與 `navbar-rwd.spec.ts`（僅 desktop viewport 跑，mobile project skip），與本 change 無關、非新增。
- [x] 5.6 `git diff main -- **/package.json` 與 `git diff main -- pnpm-lock.yaml` 皆為空（零新增相依）；`git diff main --stat -- nextjs-pickball/hooks/` 與 `git diff main --stat -- nextjs-pickball/lib/matchmaker/` 皆為空（零新增 hook、零修改底層邏輯）；`DO_NOT_TRACK=1 openspec validate matchmaker-stage-gaps --strict` 通過
      → 四項 diff 皆為空；`openspec validate --strict` 輸出 `Change 'matchmaker-stage-gaps' is valid`；另確認 `git diff main -- openspec/specs/` 為空（主 spec 未被本 change 修改）。
- [x] 5.7 以 root `CLAUDE.md` 指定的 python 計數法（**不使用 BSD `uniq`**）檢查 `openspec/specs/match-stage/spec.md` 與 `openspec/specs/match-history/spec.md` 是否有重複的 Requirement／Scenario 標題
      → 兩份主 spec 皆輸出「無重複」。
- [x] 5.8 記錄「本 change 唯一容許變動的既有測試」清單：**應為「無」**——本 change 只新增測試，不修改任何既有 `it`／`test` 的斷言或名稱；收尾時逐一核對 `git diff main -- nextjs-pickball/tests/e2e/specs/match-stage.spec.ts nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts` 只有新增的區塊、既有 test 的內容逐字不變，其餘既有測試轉紅一律視為迴歸
      → **本 change 唯一容許變動的既有測試清單：無。** 以 `git diff main | grep -E '^-[^-]'`（排除 `--- ` 檔頭行）核對兩份測試檔的完整 diff，exit status 1（無匹配），即整份 diff 不含任何刪除行，全部為新增區塊。
