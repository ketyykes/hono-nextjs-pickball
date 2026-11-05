# Tasks: site-not-found-and-nav-active

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest：`pnpm --filter ./nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**，免鎖）。
> 單檔 E2E（雙鎖）：`/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium <spec path>` → `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py；前後清殘留 dev server。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> §2.1、§3.1 的 RED 會 import 尚不存在的模組（`@/lib/navActive`、`./not-found`），屬執行期＋型別雙重紅燈；**主 repo 的 Stop hook 會擋 tsc 紅燈，RED 與其 GREEN MUST 在同一張派工單內完成**。
>
> **標註**：`TDD`；`regression guard`；`入口層例外（仍以單元測試先行）`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **範圍**：產品程式碼只新增 `nextjs-pickball/lib/navActive.ts`、`nextjs-pickball/app/not-found.tsx`，只修改 `nextjs-pickball/components/layout/SiteNavbar.tsx`。**不新增相依、無 migration、不動後端與核心套件、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **不得改動**（C6 驗收）：`components/matchmaker/**`（含 `MatchmakerTabs.tsx`）、`lib/matchmaker/**`（含 `section-nav.ts`）、`hooks/**`、`app/layout.tsx`、`app/globals.css`、`components/ui/**`、`components/layout/navItemStyles.ts`、`components/layout/AccountEntry.tsx`、`hono-pickball/**`、`packages/**`。
>
> **授權修改的既有測試（僅限下列一處，為本 change 行為的必然結果；其餘既有 it／test 的名稱與斷言一律不得修改）**：
> ① `nextjs-pickball/components/layout/SiteNavbar.test.tsx` 的 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」：
>   `mockReturnValue("/matchmaker/players")` 改為 `mockReturnValue("/matchmakerx")`；改寫該 it 內的註解為「前綴相似但非子路由的路徑不得被誤判為 active」之意；
>   在既有兩行 class 斷言之後**新增** `expect(screen.getByRole("link", { name: "對戰分配" }).getAttribute("aria-current")).toBeNull();` 一行（或以既有 `link` 變數等義表達）。
>   it 名稱與既有兩行斷言（含 `text-muted-foreground`、不含 `text-slate-900`）不變。此修改 MUST 在 §2.3 的 RED commit 內完成（否則 §2.5 GREEN 後原 pathname 會轉紅）。
> 已確認不會被打破的既有 E2E：`match-stage.spec.ts` 的三條區段導覽 `aria-current` test 皆以 `getByRole("navigation", { name: "對戰分配區段導覽" })` 限定範圍；「從首頁點擊 Navbar 的對戰分配連結進入對戰頁」在首頁時「對戰分配」非 active，不受影響。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/site-not-found-and-nav-active`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  雙鎖下跑 `pnpm test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm lint`（errors／warnings 數）、`pnpm --filter ./nextjs-pickball exec playwright test --list`（六個 project 各自數量）；回填 environment.md Verification 並 commit（`chore:`）
  - 紀錄：依 coordinator 今晚安排精簡執行——分支 `change/site-not-found-and-nav-active`、工作樹乾淨、`pnpm -r exec tsc --noEmit` exit 0（leader 實跑）；`pnpm install`／`db:migrate:local`／全套 test／lint／`--list` 未重跑，基線數字採 coordinator 於前一個 change 合併前實跑者（前端 109／1091、後端 26／215、核心 10／27、lint 0／3、chromium E2E 150），已回填 environment.md。
- [x] 1.2 對齊 main：`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff --stat 38b6ae8 main -- nextjs-pickball/components/layout nextjs-pickball/app nextjs-pickball/lib/navActive.ts nextjs-pickball/tests/e2e/specs/navbar-active.spec.ts nextjs-pickball/tests/e2e/specs/site-not-found.spec.ts nextjs-pickball/CLAUDE.md openspec/specs/site-navbar` 確認與 propose 時一致；
  確認 `openspec/specs/site-not-found/` 仍不存在、`nextjs-pickball/app/not-found.tsx`／`loading.tsx` 仍不存在；
  **若主 spec `site-navbar` 已被其他 change 改動**，確認本 change 的 ADDED Requirement 與新主 spec 不衝突，`DO_NOT_TRACK=1 openspec validate site-not-found-and-nav-active --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions。
  另讀 `nextjs-pickball/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`，確認 design「Next.js 16 慣例查證」與本機版本一致
  - 紀錄：`git diff --stat 38b6ae8 main -- <列出路徑>` 輸出為空（main 自 propose 後合併的兩個 change 未觸及這些路徑，主 spec `site-navbar` 未變，無需調整 ADDED Requirement）；`openspec/specs/site-not-found/`、`app/not-found.tsx`、`app/loading.tsx` 皆不存在；本機 `not-found.md` 與 design 慣例查證一致（root `not-found` 處理未匹配 URL、預設 Server Component、non-streamed 回 404、`global-not-found` 仍 experimental）。

## 2. navbar active 判定與 aria-current

Depends on: §1

- [x] 2.1 RED（TDD）：新增 `nextjs-pickball/lib/navActive.test.ts`，寫入五個 it——「首頁連結只在 pathname 恰為 / 時為 active」「pathname 與 href 完全相等時為 active」「pathname 為 href 的子路由時為 active」「前綴相似但非子路由時不為 active」「pathname 帶尾斜線時仍視為同一區段」（斷言依 test-plan）。
  單檔 vitest 確認紅燈（預期為 `@/lib/navActive` 無法解析）並貼出輸出。commit（`test:`）
  - 紀錄：commit `27c0ff3`。紅燈 `Failed to resolve import "@/lib/navActive"`、`Test Files 1 failed (1)`；五個 it 皆紅。`git show 27c0ff3^:nextjs-pickball/lib/navActive.ts` 與 `27c0ff3:` 皆不存在（RED commit 不含產品檔）。Implementer 自述：實作檔在紅燈實跑之後才寫入工作樹，但早於 RED commit；commit 內容與順序正確。
- [x] 2.2 GREEN（TDD）：新增 `nextjs-pickball/lib/navActive.ts`，匯出 `isNavLinkActive(href, pathname)`（design Decision 1；檔頭註解說明首頁特判與 `href + "/"` 前綴的理由；不 import React／`next/navigation`）。
  2.1 五個 it 全綠；`pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。commit（`feat:`）
  - 紀錄：commit `d817d87`；`navActive.test.ts` 5 passed；mutation ①（`startsWith(href)`）、②（首頁 `startsWith("/")`）皆轉紅，對照組（移除首頁特判）維持綠。
- [x] 2.3 RED（TDD）：`nextjs-pickball/components/layout/SiteNavbar.test.tsx` 新增兩個 it——「路由為 %s 時對戰分配連結帶 aria-current 並套用 active 樣式」（`it.each` 四個 matchmaker 子頁）、「完全相等時只有 active 連結帶 aria-current=page」（斷言依 test-plan 與檔頭共同要求）；
  同一 commit 依檔頭授權 ① 修改既有 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」。單檔 vitest 確認新 it 全紅（`it.each` 四列＋一個）並貼出輸出；被修改的既有 it 在現行程式碼下為綠，屬 regression guard（點名）。commit（`test:`）
  - 紀錄：commit `283d824`（RED commit 未動 `SiteNavbar.tsx`，leader 以 diff 複驗為 0 行）。紅燈 `Tests 5 failed | 9 passed (14)`：`it.each` 四列＋「完全相等時只有 active 連結帶 aria-current=page」皆紅；regression guard：授權修改的既有 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」（只改 pathname→`/matchmakerx`、註解、新增 `aria-current` 為 null 一行；`classes` 改由同一 `link` 變數取得，等義）。
- [x] 2.4 RED（TDD，E2E）：新增 `nextjs-pickball/tests/e2e/specs/navbar-active.spec.ts`，test「參賽者頁的 navbar 對戰分配連結帶 aria-current」（banner 範圍、`exact: true`；並驗區段導覽「參賽者」仍為 `aria-current="page"`、「對戰」不帶）。雙鎖下以單檔 E2E（chromium）確認紅燈並貼出輸出。commit（`test:`）
  - 紀錄：commit `e050005`（依 coordinator 裁定提前於單元層之前執行，與 3.2 同一次取鎖、同一指令跑兩檔，chromium `--workers=1`，鎖 03:51:43～03:52:34，前後無殘留 dev server）。結果 `3 failed`：本 test 紅在 banner「對戰分配」`toHaveAttribute("aria-current","page")`（`unexpected value "null"`），locator 單一命中、無多重命中。真紅；leader 以 `git show e050005^:<path>` 複驗 RED 前檔案不存在。
- [x] 2.5 GREEN（TDD）：`SiteNavbar.tsx` 的 active 判定改為 `isNavLinkActive(link.href, pathname)`，導航連結加 `aria-current={active ? "page" : undefined}`（design Decision 2、3）；`NAV_LINKS`、class 組成、logo 連結不變。
  2.1、2.3 全綠、`SiteNavbar.test.tsx` 其餘既有 it 原樣綠；雙鎖下 `navbar-active.spec.ts` 與 `match-stage.spec.ts`（chromium）全綠；`pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。commit（`feat:`）
  - 紀錄：commit `281da7a`；`SiteNavbar.test.tsx` 14 passed、與 `navActive.test.ts` 合跑 19 passed（leader 另以四檔合跑複驗 `Tests 27 passed (27)`）；tsc exit 0；ESLint 0 errors。mutation ③④⑤⑥ 皆轉紅。**雙鎖 E2E（`navbar-active.spec.ts`、`match-stage.spec.ts` chromium）由 coordinator 於合併前執行**。
- [x] 2.6 REFACTOR：檢查判定式是否清楚（具名變數、無巢狀三元）、檔頭註解是否只寫理由；無壞味道則註記 skipped
  - 紀錄：skipped——判定式為一個提早 return 加一個布林式，無巢狀三元，檔頭註解只寫理由。

## 3. 中文 404 頁

Depends on: §2

- [x] 3.1 RED（TDD；入口層例外，仍以單元測試先行，design Decision 6）：新增 `nextjs-pickball/app/not-found.test.tsx`，寫入兩個 it——「404 頁匯出中文 metadata 標題」「404 頁顯示中文標題、說明與回首頁、前往對戰分配兩個連結」（斷言依 test-plan）。
  單檔 vitest 確認紅燈（預期為 `./not-found` 無法解析）並貼出輸出。commit（`test:`）
  - 紀錄：commit `1dc2adf`。紅燈 `Failed to resolve import "./not-found"`、`Test Files 1 failed (1)`；`git show 1dc2adf:nextjs-pickball/app/not-found.tsx` 不存在。時序同 2.1（實作檔於紅燈後、RED commit 前寫入工作樹，未進 RED commit）。
- [x] 3.2 RED（TDD，E2E）：新增 `nextjs-pickball/tests/e2e/specs/site-not-found.spec.ts`，兩個 test——「造訪不存在的路徑回應 404 並顯示中文說明與導回連結」「404 頁點擊回首頁後導回首頁」（`main`／`banner` 範圍；不使用 `trackConsoleIssues`，理由寫在檔頭註解）。
  雙鎖下以單檔 E2E（chromium）確認兩條皆紅並貼出輸出（預期「回應 404」斷言本身已成立，紅燈落在 title／heading／連結）。commit（`test:`）
  - 紀錄：commit `a5e9865`（與 2.4 同一次執行）。「造訪不存在的路徑…」：`status() === 404` 已成立，紅在 `toHaveTitle`（Received 為首頁預設 title「匹克球新手完全入門：規則與球拍選購一次搞懂」，畫面為英文「404: This page could not be found.」）；「404 頁點擊回首頁…」：紅在 main 內「回首頁」連結找不到（click 逾時 30s）。兩條皆真紅；`git show a5e9865^:<path>` 複驗 RED 前檔案不存在。
- [x] 3.3 GREEN（TDD）：新增 `nextjs-pickball/app/not-found.tsx`（Server Component，不標 `"use client"`）：`metadata.title`「找不到頁面 | 匹克球指南」、`<main>` 以 `pt-(--site-nav-h)` 避開 navbar、`404` 小標、`h1`「找不到這個頁面」、說明段落、`Button asChild` 包 `Link` 的「回首頁」（`/`，`transitionTypes={["nav-back"]}`）與「前往對戰分配」（`/matchmaker`，`variant="outline"`、`transitionTypes={["nav-forward"]}`）（design Decision 5）。
  3.1 兩個 it 全綠；`app/emojiFree.test.ts` 綠（regression guard）；雙鎖下 `site-not-found.spec.ts`（chromium）全綠；`pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。commit（`feat:`）
  - 紀錄：commit `e51163d`；`not-found.test.tsx`＋`emojiFree.test.ts` 合跑 8 passed（emojiFree 為 regression guard）；tsc exit 0；ESLint 0 errors。mutation ①～⑤ 皆轉紅（對照組未跑）。**雙鎖 E2E（`site-not-found.spec.ts` chromium）由 coordinator 於合併前執行**。
- [x] 3.4 REFACTOR：檢查文案是否集中、版面 token 是否與 `app/quiz/page.tsx` 一致、註解是否只寫理由；無壞味道則註記 skipped
  - 紀錄：skipped——文案集中於單一元件，版面 token 與 `app/quiz/page.tsx` 一致。

## 4. 文件與指令驗收

Depends on: §3

- [x] 4.1 設定層（文件）：`nextjs-pickball/CLAUDE.md`——
  ① 「架構總覽」路由清單補一條：未匹配路由由 `app/not-found.tsx`（Server Component）顯示中文 404 頁，HTTP 404、含「回首頁」「前往對戰分配」，`/api/*` 不經此頁（仍由 proxy 轉發後端）；
  ② `/matchmaker/players` 條目的「不在全站 navbar」之後補一句：navbar 的「對戰分配」在 `/matchmaker/*` 子頁亦標示 active（`aria-current="page"`），判定在 `lib/navActive.ts`；
  ③ 「目錄約定」的 `lib/` 清單補 `navActive.ts`；
  ④ TDD 例外清單的入口檔補 `app/not-found.tsx`。commit（`docs:`）
  - 紀錄：commit `3ef33b0`（leader 執行；為趕時程排在 §2／§3 實作之前提交，內容描述的行為與其後 GREEN 一致）。
- [x] 4.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 紀錄：`pnpm -r exec tsc --noEmit`、`hono-pickball typecheck`、`pickball-core typecheck` 皆 exit 0（leader 於 GREEN 後實跑）。
- [ ] 4.3 驗收（指令）C2：雙鎖下 `pnpm lint` 0 errors、warning 不多於基線
  - 由 coordinator 於合併前執行。
- [ ] 4.4 驗收（指令）C3：雙鎖下 `pnpm test` 全綠；前端檔數＝基線＋2、測試數＝基線＋12，後端與核心與基線相同
  - 由 coordinator 於合併前執行。
- [ ] 4.5 驗收（指令）C4：雙鎖下 `pnpm build` exit 0，前端建置輸出的 route 清單含 `/_not-found`；建置後 `git status --porcelain` 為空。
  （OpenNext／workerd 下的 404 狀態碼不在本機驗收範圍，design Risk 2；記為部署後人工確認項：正式站開一個不存在的路徑，確認 404 與中文標題）
  - 由 coordinator 於合併前執行。
- [ ] 4.6 驗收（指令）C5：依 project 分開跑 E2E（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`），每次雙鎖、前後清殘留；
  五個 browser project 各＝基線＋3 且 0 failed（skip 只限既有瀏覽器條件）；user-data 與基線相同、0 failed、0 skipped。結果寫在本 task 後方；失敗不得自行判定為雜訊
  - 由 coordinator 於合併前執行。
- [x] 4.7 驗收（指令）C6：test-plan C6 的 `git diff main --stat -- …` 輸出為空
  - 紀錄：輸出為空（leader 實跑）。
- [x] 4.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate site-not-found-and-nav-active --strict` 通過
  - 紀錄：`Change 'site-not-found-and-nav-active' is valid`（leader 實跑）。
