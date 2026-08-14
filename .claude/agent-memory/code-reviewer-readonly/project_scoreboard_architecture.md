---
name: Scoreboard Architecture Notes
description: Key design decisions and patterns in lib/scoreboard/ (Tasks 1-9+)
type: project
---

`lib/scoreboard/` 採 pure-function TDD 架構：types.ts（zod schema + inferred types）→ rules.ts（純邏輯：getServeSide / isGameWon / applyRallyResult）→ reducer.ts（createInitialState + scoreboardReducer）。

**Why:** spec-driven TDD plan（docs/superpowers/plans/2026-05-11-scoreboard.md）明確要求純邏輯層先行，再接 hooks → UI。

**firstServer 欄位：** Task 9 暴露 UNDO 無法推回原始先發方的問題（servingTeam 已被 rally 改變），設計決策是把 `firstServer: TeamSchema` 永久鎖入 ScoreboardStateSchema，讓 UNDO replay 時直接使用 `state.firstServer`，避免用 servingTeam 代理。

**UNDO 策略：** `state.history.slice(0, -1)` 去掉最後一個 RALLY_WON event，從 `createInitialState({ mode, firstServer })` 重建後以 for-of 逐一 replay。空 history 直接 return state（reference equality 保留，允許 React bailout）。

**`history` 只儲存 RALLY_WON：** `ScoreEventSchema` 僅含 `{ type: "RALLY_WON", winner: Team }`，setup actions（SET_MODE / SET_FIRST_SERVER）不記錄，因為 mode 與 firstServer 已持久化在 state 頂層欄位。

**Task 11 storage.ts 設計決策：**
- `STORAGE_KEY = "scoreboard:current:v1"`，key 含版本號方便日後 migration。
- `hasLocalStorage()` 以 try/catch + `typeof window` 雙重 guard，同時防 SSR 與 Firefox 私密模式。
- `readScoreboard`：`JSON.parse` 失敗與 `safeParse` 失敗都走相同路徑：`removeItem` + warn + return null。`safeParse` 是在 try 區塊內呼叫，因此 schema 驗證失敗以 `!result.success` 分支處理，不走 catch（正確）。
- `writeScoreboard` warn on quota，`clearScoreboard` 靜默（設計刻意區分）。
- 已知測試缺口：無 SSR guard 驗證、無 `clearScoreboard` localStorage.removeItem 拋例外測試。
  （修正：`writeScoreboard` quota 失敗案例其實在 655514a 就已存在——見下方 Task 1 條目，先前記錯為缺口）

**How to apply:** 審查後續 hooks（useScoreboard）時，確認 HYDRATE action 在 `readScoreboard()` 回 non-null 時才 dispatch，並且 write 呼叫時機應在每次 reducer dispatch 後（side-effect hook 層）；storage.ts 本身不應依賴 reducer，保持單向依賴。

**Tasks 16-19 UI 元件設計決策（commits 202ba36–00192b4）：**
- `ServeIndicator` 沒有 `"use client"`，是純展示元件（無 hooks/events），正確。呼叫了 `getServeSide` 純函式，業務邏輯未漏入元件。
- `TeamPanel` 接受整個 `ScoreboardState` 而非只接需要的欄位（score、servingTeam、serverNumber、mode），導致 prop surface 偏大，需留意父層變更時不必要的重新渲染。
- `ActionBar` 的 `confirmOpen` 以 local `useState` 管理，合理（AlertDialog 開關為 UI-only 狀態，不需全域）。`AlertDialogAction` 的 `onClick` 中有一個多餘的 `setConfirmOpen(false)`：`AlertDialogPrimitive.Action` 本身會觸發 `onOpenChange(false)`，因此此呼叫雖無害但冗餘。
- `font-bebas-neue`（`TeamPanel` 使用）：Tailwind 工具類別為 `font-bebas`（`globals.css` `@theme inline` 中 key 為 `--font-bebas`），`font-bebas-neue` 是不存在的 utility class，為 Critical bug。既有 guide 元件一律用 `font-bebas`。
- `ScoreboardSetup` 全螢幕按鈕的 `aria-pressed` 屬於 toggle button 用法，符合 ARIA 規範；Select disabled 狀態靠 `locked` 傳入，正確對應 spec §7.3。

**Task 12 useScoreboardStore 已知設計決策（Task 12, commit 77eb1dd）：**
- 返回型別宣告為 `Dispatch<Action>`，但 React 19 的 `useReducer` 實際回傳 `ActionDispatch<[Action]>`（即 `(value: Action) => void`）。兩者結構相容，`tsc --noEmit` 無報錯，因為 `Dispatch<A> = (value: A) => void` 是 `ActionDispatch<[A]>` 的子集。可接受，但嚴格來說宣告型別應配合 React 19 新型別。
- `(_arg: undefined) => createInitialState()` 包裝的原因：plan 範本用 `createInitialState` 直接傳，但 `createInitialState(overrides?)` 簽名接收 optional 物件參數，不接受 `undefined` arg；包裝後型別完整。
- 兩個 useEffect 的執行順序（test 環境 happy-dom）：mount → effect[state]（寫入預設值）→ effect[]（HYDRATE）→ effect[state]（寫入 hydrated 值）。實際無競態，因兩者都在同一 microtask flush 內依序執行，且 writeScoreboard 是純 side-effect，不影響正確性。
- 測試缺口：缺少 localStorage 不可用（SSR guard）、儲存損壞 schema、UNDO 後 localStorage 同步等邊界案例。

**scoreboard-target-score change（2026-08，655514a→c277ef1）Task 1 審查記錄：**
- Task 1 範圍：`types.ts` 加 `targetScore`（zod `.union([11,15,21]).default(11)`）+ `SET_TARGET_SCORE` action 型別，**刻意不做行為邏輯**（isGameWon 改參數是 Task 2、reducer 加 case 是 Task 3）。
- `ScoreboardStateSchema` 的 output type（`z.infer`）在加了 `.default()` 欄位後變成必填，導致 `reducer.ts` 的 `createInitialState` 回傳字面量物件編譯不過——因此本 task 的 diff **必然外溢到 `reducer.ts`**（硬編 `targetScore: 11` 並附註解「Task 3 會改為可由 overrides 設定」）。這是型別系統逼出的必要漣漪，不算越界：`overrides` 參數簽名沒吃 `targetScore`、switch 沒加 `SET_TARGET_SCORE` case。日後若某欄位從 optional 改 required（或反向），預期同樣會外溢到所有建構該型別字面量的呼叫點，審查時不要誤判為範圍蔓延。
- `reducer.test.ts` 完全沒被這次 diff 動到，是因為它的 fixture 用 `{ ...createInitialState(), ... }` 展開寫法（只有 `rules.test.ts` 的 4 個 fixture 是逐欄位字面量，才需要手動補 `targetScore: 11`）——之後看到「改了 schema 卻只有部分 test 檔跟著改」不要直接當漏改，先看 fixture 是 spread 還是逐欄位字面量。
- 已用 `node -e` 現場驗證 zod `.default()` 行為（缺欄位→補值成功；不合法值如 13→驗證失敗清除；`.optional()` 若誤用會讓缺欄位驗證失敗）：新增的 storage 測試「舊版資料缺 targetScore 時補為 11 且不清除 key」是有效的 regression guard，非誤通過測試。
- 該 change 的 `tasks.md` checkbox 即使程式碼已完成仍全部 `[ ]` 未勾——若被要求審查其他 task，先看 checkbox 別直接信，要對照 diff／git log。

**scoreboard-target-score change（2026-08，e979cfe→9f690c3）Task 2 審查記錄：**
- Task 2 範圍：`isGameWon(scores, targetScore)` 改必填第二參數（無預設值）、`reducer.ts` 唯一呼叫點改傳 `afterRally.targetScore`。實測 `applyRallyResult` 三個分支皆以 `...state` 展開，`targetScore` 必然原樣透傳，呼叫點無邊界風險。
- 範圍界線守得乾淨：`createInitialState` 的 `overrides` 簽名仍是 `{ mode?: Mode; firstServer?: Team }`（沒吃 targetScore）、reducer switch 沒有 `SET_TARGET_SCORE` case、`UNDO`／`RESET` 的重建路徑（`createInitialState({ mode, firstServer })`）未被觸碰——這些都是 Task 3 才會動的，Task 2 沒有越界。
- 既有 5 個 `it` 全部維持名稱與期望值不變，只補第二參數 `11`；新增的兩個 it（15 分制、21 分制）名稱與資料點都與 delta spec「15 分制與 21 分制的勝利判定」Scenario 逐字對齊。
- 發現的測試覆蓋缺口（Medium）：新增的「21 分制」it 只測了我方勝／延長／未達標三種，**沒有測對方（them）獲勝的對稱情況**；相對地「15 分制」it 有多加一筆 `{us:13,them:15}→them 勝`。兩個新 it 的覆蓋深度不對稱，21 分制那個應補一筆 them 獲勝的斷言。
- `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/`（39 tests）與 `tsc --noEmit` 皆已現場驗證全綠，`isGameWon` 全 repo 唯一呼叫點是 `reducer.ts`（grep 確認過，rules.test.ts 之外無他處）。
- `tasks.md` 第 2 節（2.1–2.4）checkbox 依然全部 `[ ]` 未勾，即使程式碼與測試皆已完成並通過——與 Task 1 同樣的 checkbox 落後模式，非本次新發現，但再次確認為此 change 的固定模式，審查後續 Task 3 時比照辦理（先看 diff/測試結果，不看 checkbox）。

**Task 2 re-review（9f690c3→c8063d6）：** 第一輪抓到的「21 分制缺對方獲勝對稱案例」已修正，fix 只新增一行 `expect(isGameWon({ us: 19, them: 21 }, 21)).toEqual({ won: true, winner: "them" })`，範圍乾淨（只動 rules.test.ts，未碰 rules.ts/reducer.ts/openspec/），既有斷言與 it 名稱未被動。手算驗證新斷言數值正確（max=21≥21, diff=2≥2, them>us）且非假防護。`pnpm --filter ./nextjs-pickball test --run lib/scoreboard/rules.test.ts`（17 tests）與 `tsc --noEmit` 皆現場驗證全綠。最終結論 APPROVE，無殘留 Issues。

**scoreboard-target-score change（2026-08，fb69080→71db9d1）Task 3 審查記錄：**
- Task 3 範圍：reducer 加 `SET_TARGET_SCORE` case、三個 `SET_*` 重建點與 `UNDO`／`RESET` 重建點統一保留三項賽前設定、`71db9d1` refactor 收斂為 `MatchSettings` + `settingsOf(state)` helper（與上方 firstServer 段落的既有設計同一模式，本次擴充到 targetScore）。
- 三個 commit 本身是一次完整且誠實的 TDD 示範，用 `git show dfd8f22 -- reducer.ts` 現場核對過：commit 1（`dfd8f22`）新增 `SET_TARGET_SCORE` 時**尚未**動到 `UNDO`／`RESET` 的重建點，該版本的 UNDO 確實會把 `targetScore` 靜默退回 11；commit 2（`53dd01d`）才補上這兩處，屬於真紅燈轉綠，非 mutation check 偽造。日後審查同一 change 拆多個 commit 的 task 時，可比照這個方法逐 commit `git show` 驗證紅燈真偽，而不只看最終 diff。
- 全 repo `grep -rn "createInitialState("` 找到的呼叫點：reducer.ts 內 5 個重建點（`SET_MODE`／`SET_FIRST_SERVER`／`SET_TARGET_SCORE`／`UNDO`／`RESET`）皆用 `settingsOf(state)` 或 `{ ...settingsOf(state), <override> }`；`useScoreboardStore.ts:31` 與 `storage.test.ts` 的無參數呼叫是有意的「全新初始狀態」情境（非重建保留語意），不算遺漏。**這是本類 task 的核心驗收方法**——「遺漏任一 createInitialState 呼叫點」是最容易靜默出錯的地方，全 repo grep 是唯一可靠的涵蓋率確認方式。
- refactor（`71db9d1`）等價性已手算驗證：三個 `SET_*` case 的 `{ ...settingsOf(state), <欄位>: action.xxx }` 展開順序讓 action 值正確覆蓋 spread 值（JS object literal 後面的 key 覆蓋前面），與 refactor 前逐欄位列舉的寫法逐字元等價；`applyRallyResult`（rules.ts）三個分支皆 `...state` 展開，確認 RALLY_WON replay 過程不會意外重設 `targetScore`。
- `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/`（43 tests，3 檔）與 `tsc --noEmit`、`eslint lib/scoreboard/reducer.ts lib/scoreboard/types.ts` 皆現場驗證全綠/無輸出。最終結論 APPROVE，無 High/Medium Issues，僅有 import 排序未字母序的極小 nitpick（eslint 未強制，未列為正式 Issue）。
- `tasks.md` 第 3 節（3.1–3.7）checkbox 依然全部 `[ ]` 未勾，與 Task 1／Task 2 相同的固定模式（此 change 的 orchestrator 習慣在審查通過後才統一勾選，不代表未完成）。

**Mobile Safari 重疊 regression fix 審查記錄（2026-08，759d3c9→1cba147，`TeamPanel.tsx`/`ScoreboardSetup.tsx`）：**
- 根因與修法：gap/padding 從 `@container-size` 容器自身移到新增內層 wrapper、公式從 `clamp(0.375rem,2dvh,1.5rem)` 改 `clamp(0.125rem,1cqh,1.5rem)`。用 Playwright 對正在跑的 dev server（`localhost:3005/scoreboard`）在 6 組 viewport 下實測 `getComputedStyle` 的 `rowGap`/`paddingTop`，數值與 `panelHeight × 1%` 精確吻合（424px→4.24px、214px→2.14px、398px→3.97px、624px→6.24px），**現場證實** cq 單位需要降一層子孫元素才查得到容器高度、且 wrapper 確實让 gap/padding 與字級（cqh 基準）共用同一份「面板實際可用高度」——這是本次審查方法論的重點：不要只靠讀 CSS 規格描述判斷 cq fallback 行為，實測 computed style 才是可靠證據。
- **關鍵發現（原 issue 未預期到的風險）**：mobile-safari（390×664，此 fix 的目標場景）修復後安全餘量只有 **0.94px**（wrapper 內容 bottom=409.06 vs panel box bottom=410）。原因是 clamp floor（0.125rem=2px）與線性縮放區的交界點恰好落在 panelHeight=200px（`floor / coefficient` = `2px / 1% = 200px`），而 mobile-safari 實際 panel 高度 194px，只差 6px，幾乎精確卡在交界上。這代表：① 未來任何 label 文案加長、shadcn Button padding 微調、字型 hinting 差異都可能無預警重新觸發原本的重疊 bug；② 若要調高係數（如使用者建議的 `2cqh`）**必須連同 floor 一起重新調校**，否則在 194px 面板上 `2cqh=3.88px` 會直接超過目前 floor(2px)，吃光僅剩的 0.94px 餘量、重新破版——不能只改係數。此為 Medium 等級 issue（非阻擋合併，因為功能測試已證實通過，但視覺餘量脆弱值得 follow-up）。
- 視覺密度退化確實存在且被實測證實：桌機 1024x600 gap 從 12px（2dvh）降到 4.24px（1cqh，降 65%）、平板直向 768x1024 從 ~20.5px 降到 3.97px（降 81%，比原估算更嚴重）、大桌機 1280x800 從 16px 降到 6.24px（降 61%）。線性 `clamp()` 公式的係數是全域斜率，無法讓小螢幕維持保護、大螢幕維持原密度——這是此類「用同一 cq 基準同步收斂 gap/字級」修法的結構性取捨，非實作疏忽。
- `overflow-hidden` 新加在 TeamPanel 外層容器（原本沒有）是 spec 明文要求（RWD 排版 Requirement 第 143 行「容器自身 MUST 加 overflow-hidden 作為次像素殘差的最後防線」），非隨意添加，且與根 `Scoreboard.tsx` 既有的 `h-dvh overflow-hidden` 鎖高模式一致，不是新的失敗模式類別。但配合上面「餘量僅 0.94px」的發現，代表未來 regression 很可能是靜默裁切而非測試紅燈——除非測試斷言的是「餘量大小」而非只是 boolean 的零溢出。
- min-h-0 flex 收縮鏈（`Scoreboard.tsx` row `flex min-h-0 flex-1` → TeamPanel 外層 `min-h-0 flex-1` → wrapper `h-full min-h-0`）實測 `wrapperHeight` 確實貼齊 `panelHeight`（誤差 <1px，來自 overflow-hidden 裁切），鏈路完整無斷點。
- 用「在本機起 dev server + Playwright script 直接量測 computed style」驗證 CSS 幾何行為（而非只靠讀 diff 推論），比對照 git commit 更能抓到「功能測試綠燈但視覺餘量趨近於零」這類 E2E 測不出來的退化。**這個方法對本 change 後續任何涉及 clamp()/cq 單位/flex 收縮鏈的 PR 都適用，值得重複使用**：起 `pnpm dev`（web:3005 + api:8787），寫一支小 script 對 `.@container-size` 節點量測 children boundingClientRect 與 computed gap/padding，掃過 mobile-safari(390×664)、mobile-chrome(390×727)、landscape(844×390)、平板(768×1024)、桌機(1024×600, 1280×800) 幾組關鍵 viewport。
- 我獨立重跑 `pnpm exec playwright test tests/e2e/specs/scoreboard.spec.ts --project=mobile-safari` 實測 11 passed，與實作者回報數字一致（非僅採信報告文字）。

**Mobile Safari 餘量調校 re-review（2026-08-14，1cba147→6694856，`TeamPanel.tsx`/`scoreboard.spec.ts`）：**
- **twMerge 現場驗證（3.6.0）**：`twMerge('leading-none text-[14rem]')` → `'text-[14rem]'`（leading-none 被丟棄），順序反過來則兩者皆存活。但實測發現這**不是**專屬「帶逗號的 arbitrary text-[] 值」的現象——`twMerge('leading-none text-sm')` 用具名 class 也會丟棄 leading-none，`leading-[1]` 換掉 `leading-none` 結果相同。真正機制是 tailwind-merge 把「所有 text-{size}」（具名或 arbitrary、有無逗號皆然）與「所有 leading-*」歸為同一衝突群組並套用「後者覆蓋前者」——這是 twMerge 對 Tailwind `text-*` 工具類內建 line-height 語意的**刻意設計**，不是「誤判」或 bug，日後升版不太可能改變此行為，順序修法可靠、不脆弱。commit 內的程式碼註解把成因窄化描述成「帶逗號的 arbitrary 值」是不夠準確的說法（可能誤導未來稽核者縮小排查範圍），已建議澄清但不影響修法本身正確性。
- 檢視過的兩個「更穩健寫法」建議皆不成立：① 把 `leading-none` 移出 `cn()` 直接接在字串上——會完全繞過 twMerge 的衝突解析，可能製造相反的雙重 class 問題；② 改用 `leading-[1]`——同一 class group，一樣會被吞，不解決任何問題。**目前寫法（把 leading-none 放在 cn() 呼叫的最後、在 text-[...] 之後）就是 twMerge 官方建議的慣用法（last one wins），是本案最穩健的解法。**
- **全 repo cn() 呼叫掃過一輪**（`grep -rln "cn("` 12 個檔案 + 逐一檢視 cn() 內的 text-[/leading-/tracking-/font-[/whitespace- 組合）：目前只有 `components/guide/shared/PriceStars.tsx:24` 有同類「text-size + leading-none 同時出現在 cn() 参數」的組合，但其 class 順序已經是安全序（`text-[0.8rem] leading-none`，size 在前 leading 在後），**目前不受影響**。但此元件多了一個 `className` prop 會 append 在後面（`cn(base, className)`），若日後有呼叫端傳入 `className="text-lg"` 之類覆蓋字級的 class，會連帶把 `leading-none` 一起吃掉（已用 `cn('...text-[0.8rem] leading-none...', 'text-[1rem]')` 現場驗證，結果 leading-none 消失）——目前三個呼叫點（TwMarketSection、MaterialsSection、BrandCard）都沒傳 className，屬於潛伏風險而非現正發生的 bug，值得記錄但不構成本次 blocking issue。
- **獨立重新量測**（起 `pnpm dev:web` + `pnpm dev:api`，因 EPERM 需 `dangerouslyDisableSandbox`；已於使用後 kill port 3005/8787/8788 清理乾淨）：spec 官方 4 個 viewport（390x844、844x390、768x1024、1024x600，注意**不是** mobile-safari project 的 390x664）topMargin/bottomMargin 最小值出現在 844x390，為 17.8px，離 clamp floor（4px，觸發點 panelHeight<133px）非常遠——tuner「floor 在受支援 viewport 下形同虛設」的結論成立。gap 數值（5.79/6.42/11.91/12.72/18.72px）與 tuner 回報完全吻合，非編造。
- **額外壓力測試發現（原 issue 未問到）**：用 Playwright `devices["iPhone SE"]`（320x568，webkit 與 chromium 皆測）量測，topMargin 出現**負值**（-0.83～-0.84px），代表 label 行已經溢出面板頂部、被 overflow-hidden 裁切。此尺寸不在 spec 官方清單（最小寬度 390）也不在 5 個 CI project 預設值內，**目前不算違規**，但證明 fluid 公式在超出 spec 契約範圍後会真的破版（且是內容總高度超出面板高度的結構性問題，不是單純餘量不夠，縮小 gap 也救不了）。這是本專案「用 dev server + Playwright 現場量測 CSS 幾何」方法論的價值示範：光看程式碼或既有 4 個官方 viewport 不會發現。
- **視覺平衡**：leading-none 修復讓分數 line-height 從 ~1.5× 降到 1×（實測 `scoreLineHeight === scoreFontSize`，兩引擎一致），釋放的垂直空間遠多於 gap 從 1cqh→3cqh 新增的量，兩個修法方向互補、非疊加惡化。截圖確認 mobile-safari／tablet-portrait／desktop 三個關鍵尺寸皆無明顯過鬆或過緊，tablet-portrait 的留白略多但不到「明顯失衡」程度。
- **平板直向讓步（768x1024 gap 僅回到 11.91px）合理性**：spec 原文「SHALL NOT 以寬度斷點決定字級」**只限定「字級」與「寬度斷點」**，未禁止 orientation-based media query、也未提及 gap/padding。若日後想再拉近 tablet-portrait 密度，用 `portrait:` 系列 class 只調整 gap/padding（不動字級）技術上不違反現行 spec 文字——這是一個可行但目前未被採用的選項，非阻擋，值得記錄為 follow-up 建議。
- **範圍核查**：`git diff 1cba147..6694856 --name-only` 實際列出 **3 個檔案**（多一個 `openspec/changes/scoreboard-target-score/specs/scoreboard/spec.md`），因為這個區間包含 2 個 commit——`36c3b9c`（docs-only，修正上一輪 review 對 mobile-safari 重疊根因的誤歸因，補充 cqh/dvh 一致性要求）與 `6694856`（本次調校）。改的是 change 底下的 delta spec（`openspec/changes/.../specs/`），不是主 spec，不違反「不可直接改主 spec」規則。但 `6694856` 新增的「面板內容不得貼齊邊界」E2E test 對應的驗收需求**沒有**寫回 delta spec（spec.md 全文搜尋不到「餘量」「安全值」等字樣）——測試領先於文件，屬 spec-driven 流程的小缺口，非阻擋。
- **flake 判斷**：獨立完整重跑 `pnpm exec playwright test tests/e2e/specs/scoreboard.spec.ts`（預設 4 workers，對已在跑的 dev server），5 project 60 passed、0 flake，與 tuner 回報一致。跑的過程中觀察到與 tuner 描述類似的 `ChunkLoadError` console 雜訊（推測因為我在專案目錄裡新增/刪除暫存 .cjs 腳本觸發 turbopack watch 重新編譯，與平行 worker 同時打頁面造成 chunk hash 過期），沒有導致任何 test 失敛——支持但不是決定性證明「本機資源競爭」的判斷；若要完全排除產品面真實 race，更嚴謹的做法是對 `next build && next start`（無 HMR）跑，尚未執行。
- **最終結論**：本輪 APPROVE，無 High／Blocking，2 個 Medium（PriceStars.tsx 潛伏 className 覆蓋風險、spec.md 缺少新測試對應的 Scenario）與數個 Low（comment 因果描述過窄、320x568 已知會破版但在契約外、tablet-portrait 密度可再優化的 follow-up）。

**How to apply:**
