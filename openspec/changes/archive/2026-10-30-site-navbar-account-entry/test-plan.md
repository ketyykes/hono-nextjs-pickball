# Test Plan: site-navbar-account-entry

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（前端 Vitest＋happy-dom）、`e2e`（Playwright；`tests/e2e/specs/**`）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
> 「既有」標記的列是保留不改的既有測試，作為 regression guard，只需原樣通過。

## site-navbar

### Requirement: navbar 帳號入口於各寬度可見且預留固定寬度

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 載入中或未啟用時渲染隱形佔位元素且不含互動元素 | 帳號入口：載入中或未啟用時渲染隱形佔位元素 | loading／disabled → container 恰一個子元素；`aria-hidden="true"`、class 含 `invisible`、`data-account-entry` 為 `loading`／`disabled`；無 link／button role；內含 `size-4` 子元素 | 問題 1 的核心；現況回傳 null → `childElementCount` 為 0，**真紅** | unit |
| 佔位元素、登入連結與登出按鈕共用同一組版面 class | 帳號入口：佔位元素與登入入口共用同一組版面 class | 佔位 token ＝ 登入連結 token ∪ {`invisible`}；登出按鈕 token ＝ 登入連結 token；三者皆 ⊇ `NAV_ITEM_BASE.split(" ")` | 防止日後只改其中一個分支而悄悄產生寬度差；現況佔位不存在，**真紅** | unit |
| 登入連結與登出按鈕不在任何斷點隱藏 | 帳號入口：登入連結與登出按鈕於所有寬度顯示 | 兩者 token 含 `inline-flex`，不含 `hidden`、`sm:inline-flex` | 問題 2 的單元層證據；現況含 `hidden`，**真紅** | unit |
| （既有）啟用且未登入時顯示指向 /login 的登入連結 | 未登入時顯示登入連結 | `href === "/login"`、`whitespace-nowrap`、`aria-hidden` svg | regression guard（不改） | unit |
| （既有）已登入時顯示登出按鈕且 title 含使用者名稱 | 已登入時顯示登出按鈕 | `title`「已登入：測試員」、無「登入」連結 | regression guard（不改） | unit |
| （既有）點擊登出後呼叫 signOut 並重新取得 session | 點擊登出後重新取得 session | `signOut` → `refresh` 各一次、順序正確 | regression guard（不改） | unit |
| （既有）未登入時 navbar 顯示登入入口並可前往登入頁 | 未登入時 navbar 顯示登入入口並可前往登入頁 | 1280px 點 header「登入」→ `/login`、「電子郵件」可見 | regression guard（不改；需 `.dev.vars`） | e2e |
| 帳號入口載入前後導航連結位置不變 | 帳號入口：session 回應前後導航連結位置不變 | 攔住 `/api/session`，等 `document.fonts.ready` 後量五連結＋入口根元素（`<nav>` 之後的元素）box；依序以 guest／user／disabled 放行（各分支一個 `test.step`，位移斷言用 `expect.soft`），等到對應狀態與 `fonts.ready` 後再量；`x`、`width` 差 ≤ 0.5px | 問題 1 的直接證據（E2E 的偶發失敗即源於此）。現況：桌面 project（chromium／firefox／webkit）guest／user 放行後連結左移 64px，**真紅**；disabled 因缺 `data-account-entry` 等待逾時而紅；行動 project（393／390px）因入口 `hidden`，guest／user 在等「登入」／「登出」可見時就紅（不是位移造成的紅），位移的紅燈證據以桌面 project 為準 | e2e |
| 各寬度下帳號入口與五個導航連結皆完整落在視口內且不溢出 | 帳號入口：各寬度下入口與五個導航連結皆完整落在視口內 | guest／user × 320／375／390／640／1280：入口與五連結 `toBeInViewport({ ratio: 1 })`；連結高 ≤ 1280 高＋4；入口右緣 ≥「對戰分配」右緣；容器與頁面 `scrollWidth` 不溢出 | 問題 2 的驗收；現況 < 640 入口 hidden，`toBeInViewport` 失敗，**真紅** | e2e |
| 窄螢幕下 navbar 登入入口可前往登入頁 | 帳號入口：窄螢幕下可由 navbar 前往登入頁 | 390px 訪客點 header「登入」→ `/login`、「電子郵件」可見 | 問題 2 的使用者價值（真實後端）；現況 hidden 點不到，**真紅** | e2e |

### Requirement: 窄螢幕導航呈現（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 窄螢幕下導航連結內距與容器間距依斷點遞減 | 窄螢幕導航呈現：連結內距與容器間距依斷點遞減 | 五連結 token 含 `px-1.5`、`max-[375px]:px-1`、`sm:px-3`，不含 `px-2`、`max-[375px]:px-1.5`；`header > div` token 含 `gap-1`、`sm:gap-6`，不含 `gap-3` | 讓位數值的單一來源；現況為 `px-2`／`gap-3`，**真紅** | unit |
| （既有）窄螢幕下 logo 與導航連結皆不換行 | 窄螢幕下 logo 與導航連結皆不換行 | 390 與 1280 高度差 ≤ 4 | regression guard（不改） | e2e |
| （既有）窄螢幕下四個導航連結全部可見 | 窄螢幕下四個連結全部可見 | 四連結 visible | regression guard（不改） | e2e |
| （既有）窄螢幕下對戰分配連結亦全部可見 | 窄螢幕下對戰分配連結亦可見 | visible 且不換行 | regression guard（不改） | e2e |
| （既有）寬螢幕顯示 logo 文字，窄螢幕收合只留圖示 | logo 文字依斷點收合 | 1280 visible、390 hidden | regression guard（不改） | e2e |
| （既有）窄螢幕下導航列內容不橫向溢出 | 窄螢幕下不橫向溢出 | `scrollWidth <= clientWidth` | regression guard（不改） | e2e |
| （既有）320px 下五個導航連結完整落在視口內 | 320px 下五個導航連結完整落在視口內 | ratio 1、不換行 | regression guard；內距縮小後最需要守的一條 | e2e |
| （既有）小於 375px 時隱藏 logo、375px 起恢復 | 小於 375px 時隱藏 logo、375px 起恢復 | 320 hidden、375 visible | regression guard（不改） | e2e |

## auth

### Requirement: 本機測試帳號登入頁（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 窄螢幕下可經由登入頁登入與登出（修改斷言） | 窄螢幕下經由登入頁登入與登出 | 390px：登入後 `/` 的 header「登出」按鈕 visible、「登入」連結 hidden；`/login` 的 `main` 內「已登入：」與「登出」；按 `main` 內「登出」後「電子郵件」可見，reload 後仍是 | 行為反轉的必然修改；現況 header「登出」為 hidden，**真紅** | e2e |
| （既有）`app/login/page.test.ts` 與 `LoginForm.test.tsx` 的 9 個錨點 it（名稱見主 spec 各 Scenario 的驗收） | 登入頁不進搜尋索引／載入中不顯示表單也不顯示未開放訊息／未啟用時不顯示表單／已登入時不顯示表單／已登入時可於登入頁登出／登入成功後導向首頁／帳密錯誤時顯示錯誤並清空密碼／其他失敗顯示對應訊息／送出期間按鈕為 disabled | 原斷言 | regression guard（不改；`LoginForm.tsx` 只改註解） | unit |
| （既有）以測試帳號登入後 navbar 顯示登出／帳號或密碼錯誤時登入頁顯示錯誤訊息／重整後仍維持登入／登出後 navbar 回到登入入口 | 以測試帳號經由登入頁登入／錯誤密碼在登入頁顯示錯誤／重整後仍維持登入／登出後回到訪客 | 原斷言（1280px） | regression guard（不改） | e2e |

## 指令驗收（非 Scenario，供 tasks §5 引用）

| ID | 指令 | 預期 |
|----|------|------|
| C1 | `pnpm --filter ./nextjs-pickball test --run components/layout`（單檔免鎖） | 兩檔全綠 |
| C2 | 全套 `pnpm test`、`pnpm lint`、`pnpm -r exec tsc --noEmit`（持雙鎖） | 全綠；lint 0 errors |
| C3 | E2E 依 project 分開：chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`（持雙鎖，`.dev.vars` 齊備） | 既有 test 全數原樣通過（扣除授權刪除的 1 條）。新增 test 預期執行範圍：位移測試 5 個瀏覽器 project 皆 passed；寬度測試在 chromium 與 mobile-chrome passed（`browserName !== "chromium"` 的 skip 寫法，同 `navbar-rwd.spec.ts`），其餘 skip；「窄螢幕下 navbar 登入入口可前往登入頁」5 個瀏覽器 project 皆 passed（無 skip）。以 1.1 的 `--list` 基線逐 project 對帳 |
| C4 | `--project=webkit --repeat-each=30 tests/e2e/specs/quiz.spec.ts:49` 與 `tests/e2e/specs/scoreboard.spec.ts:22`（持雙鎖） | 各 30/30 passed（修正前 main 為 1/30 失敗） |
| C5 | `grep -rn 'name: "登出"' nextjs-pickball/tests/e2e` 逐筆檢視 | 每筆查詢都在 `/`（無登入頁按鈕）或已以 `header`／`main` 限定範圍 |
| C6 | `DO_NOT_TRACK=1 openspec validate site-navbar-account-entry --strict` | exit 0 |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use imperative form（本專案慣例：it／test 名稱為中文敘述句，與 spec 驗收錨點逐字一致）
