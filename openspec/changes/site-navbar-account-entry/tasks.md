# Tasks: site-navbar-account-entry

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單元單檔指令：`pnpm --filter ./nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**；單檔 vitest 免鎖）。
> E2E 單檔：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p> <spec 路徑>`。
>
> **重負載一律雙鎖**（E2E、eslint、全套 vitest、build）：先 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，
> 再 `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>`，最後 `/tmp/heavy-lock.sh release nextjspickball`；
> 不得在 heavy.py 內再包 heavy.py。E2E 前後以 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含本 repo 的 PID。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it／test（皆須在 GREEN 前實際跑過），先綠者逐一點名。紅燈以 `git show <RED commit>^:<path>` 機械複驗。
>
> **標註**：`TDD`；`regression guard`；`例外層`（`tests/**` 的 E2E，本 change 仍要求在 GREEN 前實跑看到紅燈）；`驗收（指令）`（test-plan C1～C6）。
>
> **前提與限制**：不新增任何第三方相依；無 migration；後端與核心套件零變更；禁止任何遠端 CF 操作；不 push。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式 `import { describe, it, expect, vi } from "vitest"`。
>
> **允許修改的既有測試（僅限下列，皆為行為反轉的必然結果，見 design Decision 4）**：
> ① `nextjs-pickball/components/layout/AccountEntry.test.tsx` 刪除「載入中或未啟用時不渲染任何元素」「登入連結與登出按鈕在 sm 以下隱藏」兩個 it；
> ② `nextjs-pickball/tests/e2e/specs/auth-session.spec.ts` 刪除「窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內」及只供它使用的 `NAV_LABELS`、`HIDDEN_WIDTHS`、`VISIBLE_WIDTHS` 常數與其註解；
>    第 43 行註解「預設 mobile-chrome 的視口 < 640px 會隱藏帳號入口…」改寫為「本 describe 的 Scenario 以 viewport >= 640px 為前提」意旨（`test.use({ viewport: WIDE })` 保留）；
> ③ 同檔「窄螢幕下可經由登入頁登入與登出」改斷言：登入後 header 內「登出」按鈕 visible、「登入」連結 hidden；登入頁的「已登入：」與「登出」改以 `page.getByRole("main")` 限定。
> 其餘既有 it／test（含 `navbar-rwd.spec.ts`、`SiteNavbar.test.tsx` 既有 it、`quiz.spec.ts`、`scoreboard.spec.ts`、`tests/e2e/user-data/**`）的名稱與斷言一行不改。
>
> **訪客路徑**：本 change 明確改變訪客與正式站的 navbar 版面（proposal「訪客與正式站可見的變更」）；除此之外 session store、`fetchSession`、`LoginForm` 行為零變更。

## 1. 前置：基線與查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/site-navbar-account-entry`、工作樹乾淨（propose 時主 repo 尚有數個 untracked 的 `openspec/changes/*` 目錄，含本 change；coordinator 須先 commit 才能開分支）；`pnpm install` 後 lockfile 零變動；持雙鎖跑 `pnpm test`、`pnpm lint`、`pnpm -r exec tsc --noEmit`，
  以及 `pnpm --filter ./nextjs-pickball exec playwright test --list`（記錄各 project test 數）；確認 `hono-pickball/.dev.vars` 齊備（auth E2E 不得 skip）；回填 environment.md Verification 並 commit（`docs:`）
- [x] 1.2 一次性 spike（不 commit，量測後刪除暫存檔）：在 chromium、firefox、webkit、mobile-chrome、mobile-safari 各驗一次 `page.route("**/api/session")` 能否攔截 `fetchSession` 的 keepalive fetch
  （handler 內延遲 2 秒後 `route.fulfill({ json: { authEnabled: true, user: null } })`，確認延遲期間 `[data-account-entry]` 尚不存在於目前程式碼、2 秒後「登入」連結出現）。
  結果回填 design.md Open Questions 3；任一 project 攔不到即依 design Risk 1 改用 `page.addInitScript` 備案並在 design 記錄（`docs:` commit）

## 2. 載入前後不位移：帳號入口佔位

Depends on: §1

- [ ] 2.1 RED（例外層，須實跑紅燈）：新增 `nextjs-pickball/tests/e2e/specs/navbar-account-entry.spec.ts`，test「帳號入口載入前後導航連結位置不變」
  （design Decision 3：攔住 `/api/session` → 等 `document.fonts.ready` → 量五連結與入口根元素 box → 依序以 guest、user、disabled 放行並等到對應狀態與 `fonts.ready` → 再量，`x`、`width` 差 ≤ 0.5px；
  每個分支一個 `test.step`、位移斷言用 `expect.soft`，使一次執行就能看到每個分支的結果；入口根元素以 `header > div > nav ~ *` 取得，SHALL NOT 用 `:last-child`（現況入口為 null 時會取到 `<nav>`））。
  持雙鎖在 chromium 與 webkit 各跑一次，貼出紅燈輸出：guest／user 須顯示連結 `x` 的位移量（約 64px）；disabled 因缺 `data-account-entry` 逾時而紅（**不是**先綠）。
  mobile-chrome／mobile-safari 在此階段因入口 `hidden` 而在等待可見時紅，不能當作位移證據，紀錄中點明。commit（`test:`）
- [ ] 2.2 RED（TDD）：`AccountEntry.test.tsx` 新增 it「載入中或未啟用時渲染隱形佔位元素且不含互動元素」「佔位元素、登入連結與登出按鈕共用同一組版面 class」；
  依檔頭例外 ① 刪除「載入中或未啟用時不渲染任何元素」。單檔跑，貼出兩個新 it 的紅燈輸出。commit（`test:`）
- [ ] 2.3 GREEN（TDD）：`AccountEntry.tsx` 依 design Decision 1 實作佔位元素（`<span>`、`aria-hidden="true"`、`invisible`、`data-account-entry`、內含 `size-4` 空元素），
  三種狀態共用同一個版面 class 常數；更新檔頭註解（只寫為什麼）。`components/layout` 兩個單元測試檔全綠；
  持雙鎖以 2.1 的 spec 在 chromium、firefox、webkit 各跑一次全綠（webkit 不需 shard，單檔即可）；mobile-chrome／mobile-safari 此時入口仍為 `hidden`，guest／user 分支預期仍紅，留待 3.3 驗收。commit（`feat:`）
- [ ] 2.4 REFACTOR：檢視版面 class 常數與 `navItemStyles.ts` 的分工有無重複；無壞味道註記 skipped

## 3. 窄螢幕顯示帳號入口

Depends on: §2

- [ ] 3.1 RED（例外層，須實跑紅燈）：
  - `navbar-account-entry.spec.ts` 新增 test「各寬度下帳號入口與五個導航連結皆完整落在視口內且不溢出」（只在 chromium 執行，`test.skip` 寫法比照 `navbar-rwd.spec.ts`；
    guest／user 兩種 `route.fulfill` × 320／375／390／640／1280）；
  - `auth-session.spec.ts` 新增 test「窄螢幕下 navbar 登入入口可前往登入頁」（放在既有「窄螢幕訪客」describe，viewport 390）；依檔頭例外 ③ 修改「窄螢幕下可經由登入頁登入與登出」；
    依檔頭例外 ② 刪除舊的窄螢幕 test 與常數。
  - 持雙鎖在 chromium 跑兩個 spec，貼出三條新／改 test 的紅燈輸出（入口在 < 640 為 hidden）。commit（`test:`）
- [ ] 3.2 RED（TDD）：`AccountEntry.test.tsx` 新增 it「登入連結與登出按鈕不在任何斷點隱藏」、依檔頭例外 ① 刪除「登入連結與登出按鈕在 sm 以下隱藏」；
  `SiteNavbar.test.tsx` 新增 it「窄螢幕下導航連結內距與容器間距依斷點遞減」（以 `className.split(/\s+/)` 精確比對 token，容器以 `header > div` 取得）。
  單檔各跑一次，貼出紅燈輸出。commit（`test:`）
- [ ] 3.3 GREEN（TDD）：依 design Decision 2——`navItemStyles.ts` 的 `NAV_ITEM_BASE` 改為 `px-1.5 … max-[375px]:px-1 sm:px-3`；`SiteNavbar.tsx` 內層容器 `gap-3` → `gap-1`
  並更新窄螢幕註解；`AccountEntry.tsx` 移除 `hidden sm:inline-flex` 改為 `inline-flex`；`components/auth/LoginForm.tsx` 第 34 行過時註解改為「navbar 與本頁皆可登出」意旨（不改行為）。
  兩個單元測試檔全綠；持雙鎖在 chromium 跑 `navbar-account-entry.spec.ts`、`auth-session.spec.ts`、`navbar-rwd.spec.ts` 全綠，並在 mobile-chrome、mobile-safari 跑 `navbar-account-entry.spec.ts` 全綠（位移測試在窄視口首次有意義）。
  同一 commit 同步 `nextjs-pickball/CLAUDE.md`「架構總覽」`/login` 條目（第 55 行）：刪除「帳號入口在 `< sm` 隱藏…窄螢幕改由直接造訪 `/login`…」的敘述，改為「帳號入口在所有寬度顯示，載入中與 auth 停用時以隱形佔位元素保留寬度」意旨。
  若任一寬度溢出，**停止並升級**（design Risk 2），SHALL NOT 自行縮文案、隱藏連結或改 logo 規則。commit（`feat:`）
- [ ] 3.4 REFACTOR：檢視 `SiteNavbar.tsx`、`AccountEntry.tsx`、`nextjs-pickball/CLAUDE.md` 是否與新數值一致、有無殘留「sm 以下隱藏」敘述（`grep -rn "sm:inline-flex\|sm 以下" nextjs-pickball/components nextjs-pickball/CLAUDE.md`）；無壞味道註記 skipped

## 4. 驗收

Depends on: §3

- [ ] 4.1 驗收（指令）C1、C2：`components/layout` 單檔測試；持雙鎖跑全套 `pnpm test`、`pnpm lint`（0 errors）、`pnpm -r exec tsc --noEmit`（exit 0）。結果寫在本 task 後方
- [ ] 4.2 驗收（指令）C5：`grep -rn 'name: "登出"' nextjs-pickball/tests/e2e` 逐筆檢視，每筆都在 `/` 或已以 `header`／`main` 限定範圍；結果寫在本 task 後方
- [ ] 4.3 驗收（指令）C3：`.dev.vars` 齊備下持雙鎖，依 project 分開跑 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p>`
  （chromium、firefox、mobile-chrome、user-data 各一次；webkit 與 mobile-safari 各 `--shard=1/3`～`3/3`）。
  既有 test 全數原樣通過（扣除例外 ② 刪除的 1 條）；新增 test 依 test-plan C3 的各 project 預期執行範圍 passed、auth spec 無 skip；`--list` 數與 1.1 基線差異逐一對帳。
  特別留意 Tab 走訪類 test（`match-stage.spec.ts` 的 `tabUntilFocused`、`visual-export.spec.ts` 的 Tab 迴圈）在行動 project 多一個 header tab stop 後仍通過。失敗不得自行判定為雜訊，證據上報
- [ ] 4.4 驗收（指令）C4：持雙鎖跑 `--project=webkit --repeat-each=30 tests/e2e/specs/quiz.spec.ts:49` 與 `tests/e2e/specs/scoreboard.spec.ts:22`，預期各 30/30 passed；結果寫在本 task 後方
- [ ] 4.5 驗收（指令）C6：`DO_NOT_TRACK=1 openspec validate site-navbar-account-entry --strict` exit 0
- [ ] 4.6 Final Code Review（`opus`）：`git diff main --stat` ⊆ proposal Impact；結論與處置寫入 design.md Open Questions 並 commit（`docs:`）
