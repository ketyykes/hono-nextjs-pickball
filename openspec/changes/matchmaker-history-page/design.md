## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- `lib/matchmaker/` 目前為**扁平佈局**（`types.ts`、`roster.ts`、`colors.ts`、`storage.ts`、`allocation*.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts`、`rating-math.ts`，各自鄰近一份 `*.test.ts`），本 change 沿用，不新增子目錄。
- 本 change 的資料來源是 **M4 寫入的** `matchmaker:history:v1`。M4（`openspec/changes/matchmaker-round-lifecycle/`）與本 change 並行撰寫，撰寫本文件期間 M4 的 artifact 已落盤，其 `match-history` delta 定義的紀錄 schema 為（`prd.md` 8.2 的對應識別字）：

  | 概念 | 識別字 | 備註 |
  |---|---|---|
  | 對戰 ID | `matchId` | 對應該場次在回合中的 `id` |
  | 場地 | `courtNumber` | 1 起算正整數 |
  | 對戰時間 | `playedAt` | ISO 8601 字串，取該場完成時間 |
  | 對戰方式 | `format` | `"singles" \| "doubles"` |
  | 雙打組成標示 | `doublesComposition` | 單打不帶、雙打必帶 |
  | 第一隊／第二隊 | `teamA`／`teamB` | 各含 `players[]` 與隊伍 `rating` |
  | 球員快照 | `players[].id`／`name`／`ratingBefore`／`ratingAfter` | `name` 為**快照**，不得回查名單 |
  | 比分 | `scoreA`／`scoreB` | 非負整數 |
  | 勝方 | `winner` | `"teamA" \| "teamB"` |

  型別與 schema 位於 `lib/matchmaker/history.ts`（`MatchHistoryEntry`／`MatchHistoryEntrySchema`），reader 為 `lib/matchmaker/round-storage.ts` 的 `readHistory()`，key 常數由 `lib/matchmaker/storage-keys.ts` 單一來源匯出。M4 尚未實作完成，因此 apply 時 MUST 以 `main` 上的實際程式碼為準複核一次（見 Decision 4 與 Open Questions）。
- M4 的 `match-history` spec 的 Purpose 明文把「五個時間區間切點、空區間文案、排序、歷史頁路由與呈現」劃給後續 milestone——正是本 change。兩份 delta 的職責邊界因此沒有重疊，本 change 只 ADDED、不 MODIFY M4 的任何 requirement。
- 本 workspace 的 TDD 適用範圍見 `nextjs-pickball/CLAUDE.md`：`lib/**` 的行為邏輯必 TDD；`app/**/page.tsx`（入口）與純呈現型元件屬例外層，以 Playwright E2E 驗收。本 change 的切分完全依此線劃：**所有日期與區間邏輯都在 `lib/`，元件只做呈現**。
- 專案 `tsconfig.json` 開 `strict` 與 `verbatimModuleSyntax`，型別匯入須用 `import type`。
- `hooks/` 的歸屬清單有一條跨 capability 的維護義務（見 `nextjs-pickball/CLAUDE.md`：清單的單一來源是 `pickleball-guide-page` spec 的某條 Requirement，**任何 capability 新增 hook 都必須同步該清單**）。這條義務直接影響本 change 的結構選擇，見 Decision 5。

## Goals / Non-Goals

**Goals:**

- 把 `prd.md` 8.1 的區間定義做成**可被單元測試逐條驗證**的純函式，並讓 PRD 的兩個驗算例直接成為測試案例——規格裡的數字與測試裡的數字逐字相同，日後任何人都能一眼對上。
- 讓「互斥且完整覆蓋」成為**結構上的必然**而非靠測試碰運氣：切點以 `min()` 串成單調序列、區間判定以由新到遠的單向掃描實作，最後一個分支無條件回傳「更早」（見 Decision 1、Decision 8）。
- 歷史頁對既有資料**完全唯讀**，讓 M4／M8 可以並行改動寫入端與匯出端而不必擔心本頁反向汙染資料。

**Non-Goals:**

- 不做歷史紀錄的寫入、修改、刪除或補寫（M4 職責）。
- 不做 CSV 匯出（M8 職責）。本頁不放任何匯出入口，避免兩個並行 change 在同一塊 UI 互相覆蓋。
- 不做搜尋、依球員／場地過濾、分頁或虛擬捲動。`prd.md` 8 只要求五個時間區間；PRD 12.1 的規模是 8～40 人，一晚的紀錄量在數十至數百筆之譜，`filter` + `sort` 的成本遠低於一個 frame。
- 不做「開著頁面跨過午夜自動換日」。切點在 hydration 時取樣一次，跨日後需重新整理才更新（見 Risks）。
- 不重算任何分數。賽前／賽後分數是 M3 的評分引擎在 M4 寫入時算好的，本頁只顯示。

## Decisions

### Decision 1：切點以 `min()` 逐層 clamp，四個切點必為單調不遞增序列

`prd.md` 8.1 明文給了公式，本 decision 記錄的是**為什麼不能拆開各算各的**。

若四個切點各自獨立計算（今天、本週一、當月 1 日、上月 1 日），在跨月週會直接壞掉：2026-08-01（週六，本週一為 7/27）時，「本月」= `[8/1, 7/27)` 是一個**左端大於右端的空洞區間**，而 7/27～7/31 這五天同時滿足「本週」與「上月」兩個條件——重疊與漏失一次到齊。

逐層 `min()` 後 `C3 <= C2 <= C1 <= C0` 恆成立，相鄰切點框出的半開區間因此永不重疊；某兩個切點相等時該區間自然退化為空集合（這正是 PRD 驗算二「本月為空」的來源，是設計結果而非例外處理）。

**替代方案：以「當月月初至上週一之前」定義本月**（PRD 驗算一裡註明「舊定義」的那個）。否決理由：PRD 已用驗算一示範它會讓 8/1～8/9 無人認領。這種漏失是靜默的——賽果不顯示也不報錯。

**替代方案：五個區間各寫一個獨立的 predicate，再用測試保證互斥。** 否決理由：互斥性會變成 `5 × 4 / 2 = 10` 組兩兩檢查的責任，而且每加一個區間就要重寫一次；改用單調切點後互斥性是**結構保證**，測試只是回歸防護。

### Decision 2：日期計算用原生 `Date`，不引入 `date-fns` 或 `dayjs`

需要的原語只有三個：取當地日的 00:00、往回找本週一、取某月 1 日。三者用 `new Date(y, m, d)` 各一行即可，且 `new Date(y, m - 1, 1)` 天然處理跨年（月份 `-1` 會正規化成去年 12 月，見「上月切點跨年」Scenario）。

**替代方案：引入 `date-fns`（`startOfDay`／`startOfWeek`／`startOfMonth`／`subMonths`）。** 否決理由：本 change 是純前端 LocalStorage 功能，bundle 每一 KB 都直接落在使用者身上；為四行日期運算增加一個相依、一份版本維護與一次供應鏈風險不成比例。且 `startOfWeek` 的週起始預設值依 locale 而異（多數預設週日），仍要顯式傳 `{ weekStartsOn: 1 }`——省不下那個必須明寫的決定，反而多一層可能被誤設的間接。

**替代方案：用 `Intl.DateTimeFormat` 取當地日期分量。** 否決理由：只有在需要「非執行環境時區」時才划算，本功能的規格就是**當地時區**，`Date` 的 `getFullYear()`／`getMonth()`／`getDate()`／`getDay()` 本來就是當地時區語意。

### Decision 3：「今日」的上界取 `+∞`，不取「現在」

`prd.md` 8.1 表格寫「今日 = `[C0, 現在]`」，但同一節開頭又寫「區間**必須互斥且完整覆蓋**所有時間，不得出現任何一筆賽果落不進任何區間」。兩句在「晚於現在的時間點」上直接衝突。

會晚於「現在」的情況真實存在：使用者調過裝置時鐘、紀錄寫入時間與畫面取樣時間之間有毫秒級落差、或 M4 的對戰時間取的是場次「開始」時間而畫面在其後才取樣。這些情況下取「現在」為上界會讓該筆賽果**不顯示也不報錯**。

因此實作取 `[C0, +∞)`：硬性要求（完整覆蓋）優先於表格裡那個描述性的上界，且語意上仍然正確——晚於現在的東西當然也是「今天」。

**替代方案：夾住上界並把超出者也塞進今日。** 這其實與 `+∞` 等價，但要多寫一段判斷；直接讓最新的那個分支不設上界更簡單，也少一處可寫錯的邊界。

**替代方案：把超出者丟掉。** 否決理由：靜默刪資料，是本 change 最想避免的失敗模式。

### Decision 4：對戰時間欄位透過單一取值點取得，`rangeOfTime` 本身不認識紀錄型別

`history-range.ts` 的核心 `rangeOfTime(time, now)` **只吃時間**，與紀錄 schema 無關；只有 `filterHistoryByRange` 需要從紀錄取出對戰時間（M4 的 `playedAt`），而該取值集中在模組內單一個 `recordTime(entry)` 小函式。

理由是 M4 與本 change 並行且 M4 尚未實作完成：`playedAt` 目前來自 M4 的 delta spec 而非已合併的程式碼，落地時仍有對齊成本。集中取值後對齊只需改一行，而且**核心邏輯與 13 個切點／區間單元測試完全不受影響**——那些測試打的是 `computeRangeCutoffs` 與 `rangeOfTime`，不碰紀錄型別。

`recordTime()` 取到 `playedAt` 後轉為時間戳的方式也集中在此：`playedAt` 是 ISO 8601 字串，`new Date(iso).getTime()` 一律在此處完成，SHALL NOT 讓字串型別的時間流進 `rangeOfTime` 造成兩種輸入形狀。

**替代方案：讓 `filterHistoryByRange` 接受一個 `getTime` accessor 參數。** 否決理由：把一個只會有一種答案的東西做成參數，會讓每個呼叫端都得重複傳同一個 lambda，也讓「對戰時間是哪個欄位」這件事散落在呼叫端。真正的多型需求不存在。

**替代方案：本 change 自行定義歷史紀錄型別。** 否決理由：跨 change 共用契約明訂 M4 寫入、M7 呈現、M8 匯出**三者同一 schema**。各自定義就是三份會各自漂移的真相。

### Decision 5：不新增 `hooks/` 檔案，畫面狀態放在 `HistoryView.tsx`

本頁的畫面狀態只有兩項：目前選取的區間（一個 `useState`）與 hydration 後讀進來的紀錄與取樣時間（一次 `useEffect`）。沒有 reducer、沒有批次寫回、沒有跨元件共享。

不抽 `hooks/useMatchHistory.ts` 有兩個理由，第二個是硬性的：

1. **抽出來也測不到新東西**。真正有行為的部分（切點、區間歸屬、篩選、排序）已經是 `lib/` 的純函式且被單元測試逐條鎖住；hook 只剩「呼叫 reader、`setState`」的接線，其正確性由 E2E 覆蓋更直接。
2. **新增 hook 會強制同步一份跨 capability 的清單**。`nextjs-pickball/CLAUDE.md` 記載：hooks 歸屬清單的單一來源是 `pickleball-guide-page` spec 的一條 Requirement，任何 capability 新增 hook 時其 change 須一併更新該清單。M6／M8／M9 與本 change **並行且各自在獨立 worktree**，若都去 MODIFY 同一條 requirement，合併時必然衝突，而 spec 衝突的解法遠比程式碼衝突麻煩（要重建「完整更新後全文」）。歷史上該清單就曾因漏更新而失真（見同檔註記）。

因此本 change 選擇不動 `hooks/`，也就不需要碰 `pickleball-guide-page`。

**替代方案：新增 hook 並在本 change 一併 MODIFY 那條 requirement。** 否決理由如上——為了一個沒有行為的 hook 去買一次跨 worktree 的 spec 衝突風險，不划算。

**替代方案：把讀取與狀態直接寫進 `app/matchmaker/history/page.tsx`。** 否決理由：`page.tsx` 是 server component 慣例的入口層，塞 `"use client"` 與狀態會讓路由入口同時承擔兩種角色；`player-roster` 的既有做法也是「page 組合、元件持狀態」。

**替代方案：沿用 M4 的 `hooks/useRoundStore.ts`（它同時管回合與歷史的持久化）。** 否決理由：本頁是**唯讀**的，而 `useRoundStore` 是個會在 state 變更時回寫 LocalStorage 的 store——把它掛進一個只想看資料的頁面，等於讓「瀏覽歷史」這個動作具備寫入能力，唯讀保證會從結構保證退化成「目前沒有人去呼叫寫入函式」的口頭承諾。改為直接呼叫 `readHistory()`——但要誠實記一筆：`readHistory()` 在 `droppedCount > 0` 時會呼叫 `writeHistory()` 回寫清理後的歷史（`lib/matchmaker/round-storage.ts` 第 142～147 行），唯讀在型別層**並無保證**。因此本 change 的唯讀保證範圍是「`HistoryView` 自身不寫入」：不 import `useRoundStore`、不呼叫任何 writer、不碰 `localStorage.setItem`／`removeItem`。附帶好處是本頁不會被回合狀態的變動觸發 re-render。

### Decision 6：導覽入口以「在 M5 導覽加一個連結」實作，requirement 掛在本 capability

跨 change 共用契約明訂：M5 以 Modified `site-navbar` 處理全站 navbar 的 matchmaker 入口；M7／M8 各自的頁面入口以**自身 capability 的 ADDED requirement** 描述，不去 MODIFY M5 的導覽 requirement。本 change 照辦——spec 只寫「歷史頁 SHALL 可從 matchmaker 區段的既有導覽以連結抵達」，不描述 M5 那條導覽該長什麼樣。

實作上是在 `lib/matchmaker/section-nav.ts` 的清單（`MATCHMAKER_SECTION_HREFS`）與文案（`MATCHMAKER_SECTION_LABELS`）各加一筆，並連帶更新 `lib/matchmaker/section-nav.test.ts` 的 `toEqual` 斷言，共兩個既有檔案；`section-nav.ts` 屬 `lib/**` 的**必 TDD 行為邏輯**，不是例外層。M6／M8／M9 若也在同一塊導覽加入口，git 層面會是同一段落的新增衝突——但那是**行級文字衝突，解法顯而易見**（兩個連結都留），與 spec 層的語意衝突不同量級。

M5 在 `main` 上實際提供的導覽形狀已確認（見 Open Questions 3）：在 `lib/matchmaker/section-nav.ts` 加一筆即可，渲染層 `MatchmakerTabs.tsx` 不必動。SHALL NOT 改動 M5 既有連結的行為。

### Decision 7：「現在」在 hydration 時取樣一次並存入 state

切點依賴「現在」，而「現在」若在每次 render 都重取，會有兩個問題：切換區間造成的 re-render 會重算切點（極端情況下跨過午夜就換了一組區間，畫面內容莫名跳動）；SSR 期間取用系統時鐘則會與 client 的取樣值不同，直接產生 hydration mismatch。

因此：`page.tsx` 與元件的 render 期間 SHALL NOT 取用時鐘；`HistoryView` 在 hydration 的 `useEffect` 內取一次 `new Date()`，連同 reader 讀回的紀錄一起存進 state，之後所有篩選都用這一個取樣值。這與 `player-roster` 的 HYDRATE 模式同構，首次伺服器輸出為空狀態。

**替代方案：用 `useMemo(() => new Date(), [])`。** 否決理由：`useMemo` 在 server render 也會執行，SSR 與 CSR 各取一次不同的時間，正是要避免的東西。

### Decision 8：區間判定用「由新到遠的單向掃描」，最後一個分支無條件回傳

`rangeOfTime` 的實作形狀是：`t >= C0` → 今日；`t >= C1` → 本週；`t >= C2` → 本月；`t >= C3` → 上月；否則 → 更早。

這個形狀讓**完整覆蓋成為控制流的必然**：函式沒有任何路徑會回傳 `undefined` 或落到 `default: throw`。互斥性同樣是必然——`if / else if` 鏈只會命中一個分支。單調切點（Decision 1）則保證這些分支的語意與 PRD 表格的區間定義等價。

「時間點恰為切點時歸入較新的區間」也直接由 `>=` 得到，不需要額外處理。

**替代方案：五個獨立 predicate 加一個 `find`。** 否決理由：`find` 找不到時回傳 `undefined`，於是要多一個「不可能發生」的分支——而「不可能發生」的分支正是 bug 的溫床。

## Risks / Trade-offs

- **[M4 的紀錄 schema 來自其 delta spec 而非已合併的程式碼]** → 依 Decision 4 把取值集中在 `recordTime()`，且核心測試不碰紀錄型別。apply 的 Step 0 之後、§3 開工之前 MUST 先讀 `main` 上 M4 實際匯出的 `MatchHistoryEntry` 與 `readHistory()` 複核一次；若與本文件記載不符，以程式碼為準並回填 Open Questions，SHALL NOT 自行改 M4 的型別。

- **[DST 時區下「不存在的午夜」]** → `new Date(y, m, d)` 在春季調時的當天，當地 00:00 可能不存在，JS 會正規化到 01:00。此時四個切點仍由同一規則產生，單調性與互斥性不受影響，只有那一天的邊界往後挪一小時。台灣無 DST，本 change 不做額外處理，記錄於此避免日後被當成 bug 重查。

- **[開著頁面跨過午夜，切點會過期]** → Decision 7 的取樣值不會自動更新，跨日後「今日」仍指昨天。緩解：重新整理即更新；不做定時器輪詢，因為那會讓畫面在使用者沒有任何操作時自己換內容，比過期更難理解。此限制列為 Non-Goal，不寫進 spec 承諾。

- **[並行 milestone 同時在 M5 導覽加入口 → git 衝突]** → 見 Decision 6。屬行級新增衝突，兩邊都保留即可。本 change SHALL NOT 順手重排既有連結順序或抽共用元件，以免把行級衝突升級成結構衝突。

- **[E2E 需要能控制「現在」才能驗「跨月週本月為空」]** → 該情境只在特定日期成立，不能等日曆走到那天。E2E MUST 以 Playwright 的 `page.clock`／注入假時鐘把時間固定在 2026-08-01，並在同一個 fixture 內 seed 對應的紀錄；SHALL NOT 用「依當下日期動態算出一批資料」的方式繞過——那會讓測試在某些日期通過、某些日期失敗，是最難查的那種 flaky。

- **[8.2 欄位很多，單筆卡片容易在窄螢幕爆版]** → 屬呈現層問題，以 E2E 在 Mobile Chrome／Mobile Safari 兩個 project 一併跑既有 spec 覆蓋。本 change 不新增響應式相關的 spec requirement（`prd.md` 7.6 的響應式規範屬對戰畫面 capability）。

- **[歷史紀錄量成長後全量讀取的成本]** → PRD 12.1 的規模下（一晚數十至數百筆）`filter` + `sort` 可忽略。若日後累積到數萬筆，正確的解法是 M4 在寫入端做保留策略或分頁儲存，不是在本頁做虛擬捲動——記錄方向即可，不在本 change 處理。

## Migration Plan

無資料遷移：本 change 不建立、不改變、不刪除任何 LocalStorage key，只讀取 M4 已定義的 `matchmaker:history:v1`。

部署即新增一個靜態路由 `/matchmaker/history` 與一個導覽連結。Rollback 為單純的 revert：移除路由與連結後，使用者資料完全不受影響（因為本頁從未寫入）。

## Open Questions

1. **M4 的 `MatchHistoryEntry` 與 `readHistory()` 落地後是否與其 delta spec 一致？** 本文件的欄位表抄自 M4 的 delta spec（撰寫時 M4 尚未實作）。apply 的 §3.1 MUST 以 `main` 上的實際程式碼複核；若有出入，改動範圍限於 `recordTime()` 一處（Decision 4），並在此節回填實際名稱。

   **已確認（apply 3.1 實地複核，2026-08-30）**：`lib/matchmaker/history.ts` 與 `lib/matchmaker/round-storage.ts` 的實際程式碼與本文件上方欄位表**完全一致**，逐項比對無出入：`matchId`（`z.string()`）、`courtNumber`（`z.number().int().positive()`）、`playedAt`（`z.iso.datetime()`，ISO 8601 字串）、`format`（`"singles" | "doubles"` discriminated union，兩分支皆 `.strict()`，`doublesComposition` 單打不帶、雙打必帶）、`teamA`／`teamB`（各含 `players[]` 與 `rating`）、`players[].id`／`name`／`ratingBefore`／`ratingAfter`、`scoreA`／`scoreB`（非負整數）、`winner`（`"teamA" | "teamB"`）。型別與 schema 匯出名稱為 `MatchHistoryEntry`／`MatchHistoryEntrySchema`，與本文件記載一致。reader 為 `lib/matchmaker/round-storage.ts` 匯出的 `readHistory()`，回傳形狀為 `ReadHistoryResult { entries: MatchHistoryEntry[]; droppedCount: number }`（合法紀錄陣列在 `.entries` 欄位，非直接回傳陣列——`recordTime()` 與 `filterHistoryByRange` 的呼叫端需注意這一層）。key 常數 `HISTORY_STORAGE_KEY` 由 `lib/matchmaker/storage-keys.ts` 單一來源匯出，與本文件記載一致。**無需調整 `recordTime()` 之外的任何取值方式，M4 型別未被改動。**
2. **`readHistory()` 回報的 `droppedCount > 0` 時，歷史頁要不要顯示「有 N 筆資料損毀已略過」？** M4 的 delta spec 已明訂 reader「丟棄筆數大於 0 時 SHALL 對外回報，SHALL NOT 靜默處理」，因此該值確定存在。**M4 合併後實地核對 `main` 補充**：`readHistory()` 除了回傳 `droppedCount` 與 `console.warn` 之外，**還會回寫**清理後的歷史（`lib/matchmaker/round-storage.ts` 第 142～147 行在 `droppedCount > 0` 時呼叫 `writeHistory(entries)`），屬「自我修復寫入」——這不是本頁發起的寫入，但代表載入損毀資料時 `matchmaker:history:v1` 的內容確實會變（見 Decision 5 與 tasks §5.4）。本 change **刻意不承諾**顯示行為，理由有二：① 本 change 的範圍是區間篩選與 8.2 呈現，損壞提示屬另一條使用者可見的行為，該有自己的 requirement 與驗收；② `useRoundStore`（M4）與對戰畫面（M5）也是 reader 的消費端，提示該放在哪一層是跨 milestone 的決定，不該由本 change 單方面定案。apply 時若發現此缺口，MUST 記錄於此節並回報，SHALL NOT 順手實作（會產生沒有 spec 覆蓋的行為）。

   **apply 3.1 複核補充（2026-08-30）**：本次複核確認 `droppedCount` 的行為與上述記載一致，`filterHistoryByRange` 與 `recordTime()` 皆不消費 `droppedCount`，僅使用 `readHistory().entries`；沿用上述「不顯示」決議，不順手實作。
3. ~~**M5 在 `main` 上提供的 matchmaker 導覽是獨立元件還是對戰頁內的連結區？**~~ **已確認（M5 合併後實地核對 `main`）：是獨立元件，但入口連結的落點不在元件。** `components/matchmaker/MatchmakerTabs.tsx` 掛在 `app/matchmaker/layout.tsx` 第 14 行，對戰頁與參賽者頁共用；`app/matchmaker/page.tsx` 內**沒有**任何 `<Link>`。`MatchmakerTabs` 只 `tabs.map()` 渲染，分頁清單與文案的單一來源是純函式模組 `lib/matchmaker/section-nav.ts`——`MATCHMAKER_SECTION_HREFS`（第 13 行）與 `MATCHMAKER_SECTION_LABELS`（第 15～21 行）。因此 §5 要改的是 `section-nav.ts` 這兩處各加一筆 `/matchmaker/history`，`MatchmakerTabs.tsx` 不必動。連帶兩點 MUST 注意：① `section-nav.ts` 屬 `lib/**`，是**必 TDD** 的行為邏輯，不是 Decision 6 原本設想的例外層 `<Link>` 新增；② `lib/matchmaker/section-nav.test.ts` 第 31～36 行的 regression guard 以 `toEqual` 逐字釘住「分頁清單依序為對戰與參賽者兩筆」，新增分頁必使其轉紅（這是真紅燈），MUST 一併更新該斷言。active 判定用 `===` 精確比對，`/matchmaker/history` 加入後判定仍正確，僅第 23～24 行「目前 app/matchmaker/ 下沒有巢狀路由」的註解需同步。
4. ~~**雙打組成標示的中文文案是否已由 M5 定案？**~~（男雙／女雙／混雙／一般雙打）**已確認（M5 合併後實地核對 `main`）：M5 有這份對應表，但不是共用模組**——它寫死在 `components/matchmaker/CourtCard.tsx` 第 20～23 行（`mixed: "混雙"`／`mens: "男雙"`／`womens: "女雙"`／`general: "一般雙打"`）。M7 的 `HistoryRecordCard` 需要同一份文案，因此「沿用還是另寫一份」變成「要不要把 `CourtCard` 內的對應表抽成共用模組」——這正是 §4 REFACTOR 要判斷的具體情境。文案本身 MUST 與上述四個字串逐字相同，SHALL NOT 自創別的說法。
5. **apply 中斷點手記（2026-08-30，第一棒 leader 因 session 即將中斷而停止）**

   **進度：24／47 勾選（§1 11／11、§2 7／7、§3 6／6 全數完成；§4 起未開工）。**
   分支 `change/matchmaker-history-page`，中斷時 HEAD 為 `ba4eb5c`，`git status --porcelain` **乾淨**，
   無殘留 dev server process（`lsof -i :3005 -i :8787` 與 `ps aux | grep -E "wrangler|workerd|next"` 皆空）。

   **Step 0 baseline**（已回填 environment.md）：`Initial commit hash` = `85889ca`，
   `pnpm test` 前端 56 檔 472 tests、後端 4 檔 16 tests 全綠。

   **已完成群組的審查結論（皆已過兩階段審查，0 Blocking）**：
   - §1 區間切點計算：Stage 1 `PASS`；Stage 2 `PASS_WITH_NITS`（獨立跑 **44 組 mutation**，
     抓到 1 個 Implementer 未發現的真缺口——`getFullYear` 改成 `getUTCFullYear` 時**零覆蓋**，
     因既有取樣日期全在 8 月與 1/5，兩種讀法年份相同。已補跨年邊界斷言，commit `05f3a79`）。
   - §2 區間歸屬：Stage 1 `PASS`；Stage 2 `PASS`（獨立跑 **45 組 mutation，0 存活**）。
     Stage 2 另修正註解中的懸空群組編號（commit `2d1e1f2`）。
   - §3 篩選與排序：**Implementer 已完成並自測 12 組 mutation（發現 1 組存活並補斷言，commit `ba4eb5c`），
     但 Stage 1／Stage 2 審查尚未執行。**

   **⚠️ 續跑的第一件事：補跑 §3 的 Stage 1 與 Stage 2 審查**（審查範圍 `git log --oneline 2d1e1f2..ba4eb5c`，
   8 個 commit）。Stage 2 MUST 自行獨立跑一輪 mutation，不採信 Implementer 自述——
   §1 的實證是 Implementer 自測 5 組／Stage 2 獨立 44 組才抓到真缺口。
   §3 的 Implementer 自己已承認第 6 組 mutation（拿掉 `filter`）第一次跑是**存活**的，
   原因是三筆 fixture 全落在同一區間、「區間外被排除」零覆蓋——正是本專案反覆出現的
   「分支或欄位零覆蓋」形態，Stage 2 應循此方向再擴大盤點。

   **接續點：§4.1**（新增 `tests/e2e/specs/matchmaker-history.spec.ts` 的兩個 E2E test，
   真紅燈為路由不存在的 404）。§4 起進入例外層（`app/**/page.tsx` 與純呈現元件），
   RED 一律由 Playwright E2E 承擔。依 execution-plan 的 Roles，§4／§5 的 Implementer
   **MUST 用 `sonnet` 起跳**（本專案常設覆寫：Implementer 一律 sonnet，不用 plan 預設的 haiku）。

   **§4 開工前就該知道的事**（避免重查）：
   - E2E seed 的 LocalStorage 值必須是 **`{"version":1,"entries":[...]}`** 這個外層容器形狀，
     不是裸陣列——`writeHistory()` 寫的是 `{ version: 1, entries }`（`round-storage.ts`），
     外層 version 不符會被 reader 判為結構層級損壞而清空整份。
   - `readHistory()` 回傳 **`{ entries, droppedCount }` 物件而非陣列**（見上方第 1 點）。
   - §4.7 的跨月週情境 MUST 用 Playwright 假時鐘固定在 2026-08-01，
     SHALL NOT 用「依當下日期動態算資料」繞過（design Risks 明令）。
   - E2E **必須帶 `--workers=1`**（root `CLAUDE.md`：預設併發下本機不穩定）；
     跑之前先 `lsof -i :3005 -i :8787` 與 `ps aux | grep -E "wrangler|workerd|next"` 清殘留，
     **跑完立刻清掉自己起的 process**。

   **§5 開工前的補充（本棒實地核對 `main`，修正 Decision 6 與上方第 3 點的行號）**：
   M6 合併後 `lib/matchmaker/section-nav.ts` 已新增 `MATCHMAKER_ROUTE = "/matchmaker"`（第 14 行），
   使兩個常數的行號位移——`MATCHMAKER_SECTION_HREFS` 現在在**第 16 行**（且由 `MATCHMAKER_ROUTE`
   組成：`[MATCHMAKER_ROUTE, \`${MATCHMAKER_ROUTE}/players\`]`）、`MATCHMAKER_SECTION_LABELS`
   在**第 18～24 行**、「目前 app/matchmaker/ 下沒有巢狀路由」的註解在**第 26～27 行**（非第 23～24 行）。
   兩個常數**皆未 export**（模組私有），`matchmakerSectionTabs()` 才是唯一對外入口。
   `section-nav.test.ts` 的 regression guard it 名稱為「分頁清單依序為對戰與參賽者兩筆」，
   位於第 31～36 行，新增分頁後該名稱本身也需一併更新（例如改為「…對戰、參賽者與歷史三筆」）。
   分頁順序依 runbook 既定約定為 **對戰／參賽者／歷史／資料**，「歷史」插在 `players` 之後。

   **未解的裁決或阻塞：無。** 本次中斷純因 session 即將結束，非技術阻塞。
   Open Questions 第 1、2 點已於 §3.1 完成實地複核並回填；第 3、4 點在 M5 合併後已結案。
