> **TDD 三步**：每個行為邏輯 task 拆為 ① 先寫失敗測試並在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。
>
> 單檔指令：`pnpm --filter ./nextjs-pickball test --run lib/matchmaker/history-range.test.ts`
> E2E：`pnpm --filter ./nextjs-pickball test:e2e --grep "matchmaker-history"`
> **`--run` 前不可加 `--`**——加了會讓 vitest 收不到路徑而跑完整套，紅燈證據會被既有綠燈淹沒。
>
> **紅燈要是真的**。若某個 RED 加入後直接綠燈（前一個 GREEN 的實作已順手涵蓋），
> MUST 在該行如實標註「regression guard，非傳統紅燈」，**SHALL NOT 用改斷言看紅再改回的方式
> 偽造紅燈**（root `CLAUDE.md`）。更好的處置是回頭把前一個 GREEN 收斂成真正的最小實作。
>
> **測試名稱必須與 delta spec 的「驗收」錨點逐字一致**（含全形標點），否則 `/opsx:verify`
> 無法機械核對。
>
> 所有 task 皆在 [environment.md](./environment.md) 宣告的 worktree 內執行。

## 1. 區間切點計算（`nextjs-pickball/lib/matchmaker/history-range.ts` — 行為邏輯，必 TDD）

- [x] 1.1 RED: 新增 `nextjs-pickball/lib/matchmaker/history-range.test.ts`，寫入 it「一般情形下四個切點依序為今天、本週一、當月 1 日與上月 1 日」——以 `now = new Date(2026, 7, 15)`（2026-08-15 週六）呼叫 `computeRangeCutoffs(now)`，斷言 `c0`／`c1`／`c2`／`c3` 依序等於 `new Date(2026, 7, 15)`、`new Date(2026, 7, 10)`、`new Date(2026, 7, 1)`、`new Date(2026, 6, 1)` 的時間戳。跑單檔看到紅燈並貼出輸出（**真紅燈**：模組尚不存在，import 解析失敗）
- [x] 1.2 GREEN: 建立 `history-range.ts`，實作 `computeRangeCutoffs(now: Date): RangeCutoffs`，回傳四個當地時區 00:00 的時間戳。此步**先各自獨立計算**四個切點（今天、本週一、當月 1 日、上月 1 日），尚不套用 `min()`——`min()` 由 1.4 依 1.3 的紅燈驅動加入。重跑至綠
- [x] 1.3 RED: 補兩個 it：「跨月週時當月切點取本週一而非當月 1 日」（`now = new Date(2026, 7, 1)`，2026-08-01 週六、本週一為 7/27，斷言 `c1` 與 `c2` 皆為 `new Date(2026, 6, 27)`、`c3` 為 `new Date(2026, 6, 1)`）與「四個切點單調不遞增」（對月初、月中、週一、週日、跨年五組 `now` 逐一斷言 `c3 <= c2 <= c1 <= c0`）。看到紅燈（**真紅燈**：1.2 未套 `min()` 時 `c2 = 8/1 > c1 = 7/27`）
- [x] 1.4 GREEN: 依 design Decision 1 逐層套用 `min()`：`c1 = min(本週一, c0)`、`c2 = min(當月 1 日, c1)`、`c3 = min(上月 1 日, c2)`。重跑 1.1／1.3 三個 it 全綠
- [x] 1.5 RED: 補 it「週起始為週一，週日的本週一為六天前」——`now = new Date(2026, 7, 16)`（週日），斷言 `c1` 為 `new Date(2026, 7, 10)` 而非 `new Date(2026, 7, 17)`。看到紅燈（若 1.2 已用 `(getDay() + 6) % 7` 正確處理，此項會直接綠燈——**如實標註為 regression guard**，不得偽造紅燈）**真紅燈**：1.2/1.4 使用的 `getDay() - 1` 對週日（getDay()=0）算出 offset=-1，日期反而往後推一天，得 8/17 而非預期的 8/10
- [x] 1.6 GREEN: 以 `(now.getDay() + 6) % 7` 推算本週一的天數偏移（週一為 0、週日為 6），確保週日歸入前一週。重跑至綠
- [x] 1.7 RED: 補兩個 it：「切點為當地時區 00:00 而非 UTC 00:00」（`now` 為當地 2026-08-15 23:30，斷言 `new Date(c0)` 的 `getHours()`／`getMinutes()`／`getSeconds()`／`getMilliseconds()` 皆為 0，且 `c0 === new Date(2026, 7, 15).getTime()`）與「一月時上月切點落在去年 12 月 1 日」（`now = new Date(2027, 0, 5)`，斷言 `c3 === new Date(2026, 11, 1).getTime()`）。看到紅燈（若 1.2 已用 `new Date(y, m, d)` 本地建構且以 `m - 1` 取上月，兩項可能直接綠燈——**如實標註為 regression guard**）**regression guard**：1.2 起就一律用 `new Date(y, m, d)` 本地建構、上月用 `m - 1`，兩個 it 加入時直接綠燈
- [x] 1.8 GREEN: 確認四個切點一律以 `new Date(y, m, d)` 本地建構（**不得**使用 `Date.UTC` 或 `getUTC*`），上月以 `new Date(y, m - 1, 1)` 取得並倚賴月份 `-1` 的跨年正規化（design Decision 2）。重跑至綠
- [x] 1.9 RED: 補 it「切點依注入的 now 計算，與系統時鐘無關」——以 `vi.useFakeTimers()` + `vi.setSystemTime(new Date(2030, 2, 3))` 把系統時間推到 2030，仍傳入 `now = new Date(2026, 7, 15)`，斷言結果與 1.1 完全相同；測試結束 `vi.useRealTimers()`。看到紅燈（若 1.2 從未取用系統時鐘則為 regression guard，**如實標註**）**regression guard**：`computeRangeCutoffs` 自 1.2 起就只用參數 `now`，從未取用系統時鐘，加入時直接綠燈
- [x] 1.10 GREEN: 確認 `history-range.ts` 全檔沒有任何 `new Date()`（無參數）、`Date.now()` 或其他系統時鐘取用；「現在」一律由參數注入。重跑至綠
- [x] 1.11 REFACTOR: 把「取某年月日的當地 00:00」抽成模組內具名 helper（例如 `startOfLocalDay`），使四個切點共用同一條正規化路徑；`RangeCutoffs` 型別與 `HISTORY_RANGES` 常數以 `as const` 匯出。確認無重複的日期建構邏輯，無壞味道則註記 skipped

## 2. 區間歸屬（`history-range.ts`）

Depends on: §1

- [x] 2.1 RED: 補兩個 it：「任一時間點恰好落入五個區間中的一個」（`now = 2026-08-15`，取一組含 `new Date(1970, 0, 1)` 與 `new Date(2100, 0, 1)` 兩個極端值、橫跨五個區間的時間點，對每點以五個區間範圍逐一判定，斷言恰有一個成立且與 `rangeOfTime` 回傳值一致）與「時間點恰為切點時歸入較新的區間」（`t` 為 `c0`／`c1`／`c2`／`c3` 時依序得 `"today"`／`"thisWeek"`／`"thisMonth"`／`"lastMonth"`，`c3 - 1` 得 `"earlier"`）。看到紅燈（**真紅燈**：`rangeOfTime` 尚不存在）**真紅燈**：`TypeError: rangeOfTime is not a function`，2 個 it 失敗
- [x] 2.2 GREEN: 實作 `rangeOfTime(time, now): HistoryRange`，依 design Decision 8 採由新到遠的單向 `if / else if` 掃描（`>= c0` → today、`>= c1` → thisWeek、`>= c2` → thisMonth、`>= c3` → lastMonth、否則 earlier），最後一個分支**無條件回傳**，不得有 `undefined` 或 `throw` 路徑。重跑至綠
- [x] 2.3 RED: 補 it「晚於現在的時間點仍歸入今日而非落空」——`now` 為 2026-08-15 20:00、`t` 為 2026-08-15 23:59，斷言回傳 `"today"` 且不拋出例外。看到紅燈（若 2.2 未替今日設上界則為 regression guard，**如實標註**；若 2.2 誤照 PRD 表格寫成 `t <= now` 的上界則為真紅燈）**regression guard**：2.2 的 `today` 分支本就只判斷 `>= c0`、無上界，加入時直接綠燈
- [x] 2.4 GREEN: 確認今日的上界為 `+∞`（實作上即「不設上界」），SHALL NOT 以「現在」為上界（design Decision 3）。重跑至綠
- [x] 2.5 RED: 補 it「跨月週時沒有任何時間點落入本月」——`now = new Date(2026, 7, 1)`，對 7/1～8/1 逐日取樣，斷言 7/27～7/31 皆回傳 `"thisWeek"`、7/1～7/26 皆回傳 `"lastMonth"`、整段無任何一點回傳 `"thisMonth"`。看到紅燈（若 §1 的 `min()` 已正確 clamp 則為 regression guard，**如實標註**）**regression guard**：§1 的 `min()` 已正確 clamp（此 now 下 `c2 === c1`），加入時直接綠燈
- [x] 2.6 GREEN: 確認空區間是 `c2 === c1` 的自然結果，SHALL NOT 為此加任何特例分支。重跑至綠
- [x] 2.7 REFACTOR: 以 `HISTORY_RANGES` 常數與切點序列驅動比較，消除五段結構重複的 `if`；確認回傳型別為 `HistoryRange` 而非 `string`。無壞味道則註記 skipped——改以 `[c0, c1, c2, c3]` 與 `HISTORY_RANGES` 索引對應的 for 迴圈掃描，命中即回傳 `HISTORY_RANGES[i]`，迴圈跑完（未命中）落到迴圈外無條件回傳 `HISTORY_RANGES[4]`；未用 `find()`，保住 Decision 8「無 undefined／throw 路徑」的保證。`tsc --noEmit` 通過（若 `HISTORY_RANGES[i]` 型別寬化為 `string`，因函式宣告回傳型別為 `HistoryRange`，`tsc` 會直接報型別不符，故通過即確認回傳型別正確）

## 3. 篩選與排序（`history-range.ts`）

Depends on: §2

- [ ] 3.1 **（非實作項）複核 M4 的紀錄 schema**：讀 worktree 內 `main` 已合併的 M4 程式碼——`lib/matchmaker/history.ts` 的 `MatchHistoryEntry`／`MatchHistoryEntrySchema`、`lib/matchmaker/round-storage.ts` 的 `readHistory()`、`lib/matchmaker/storage-keys.ts` 的 key 常數——確認對戰時間欄位確為 `playedAt`（ISO 8601）且 reader 匯出名稱一致，把實際結果回填 design.md `## Open Questions` 第 1、2 點。**只讀程式碼，不讀其他 change 的計畫檔**；若與 design.md 的欄位表不符，以程式碼為準且**不得**改動 M4 的型別；`readHistory()` 回報的 `droppedCount` 只記錄不實作（超出本 change 的 spec 範圍）
- [ ] 3.2 RED: 補 it「篩選結果依對戰時間由新到舊排序」——同一區間內三筆紀錄以時間亂序傳入 `filterHistoryByRange(records, "today", now)`，斷言回傳順序為對戰時間遞減。看到紅燈（**真紅燈**：函式尚不存在）
- [ ] 3.3 GREEN: 實作 `filterHistoryByRange(entries, range, now)`：以模組內單一 `recordTime(entry)` 取出 `playedAt` 並轉為時間戳（design Decision 4），`filter` 出 `rangeOfTime(...) === range` 者後依時間遞減排序。重跑至綠
- [ ] 3.4 RED: 補 it「篩選不修改輸入的紀錄陣列」——傳入亂序紀錄後，斷言輸入陣列的長度、元素順序與各紀錄內容皆與呼叫前相同（以 `structuredClone` 前後比對），且回傳值與輸入不是同一參照。看到紅燈（**真紅燈**：3.3 若直接 `records.sort()` 會原地改動輸入）
- [ ] 3.5 GREEN: 排序前先 `slice()` 複製，確保純函式語意。重跑至綠
- [ ] 3.6 REFACTOR: 確認對戰時間的取值只出現在 `recordTime()` 一處、模組對外只匯出 `HISTORY_RANGES`／`HistoryRange`／`RangeCutoffs`／`computeRangeCutoffs`／`rangeOfTime`／`filterHistoryByRange`；為 `recordTime()` 補 JSDoc 說明它是「M4 欄位命名的唯一對齊點」。無壞味道則註記 skipped

## 4. 歷史頁與紀錄呈現（例外層 — 入口與純呈現，以 E2E 驗收）

Depends on: §3

> 本節的檔案（`app/**/page.tsx` 與純呈現元件）依 `nextjs-pickball/CLAUDE.md` 屬 **TDD 例外層**，
> 不寫單元測試；RED 一律以 Playwright E2E 承擔，仍維持「先看到紅燈再實作」的順序。

- [ ] 4.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，每個 test 前清空 `matchmaker:history:v1`；寫入 test「直接開啟 /matchmaker/history 可載入歷史頁」與「沒有任何歷史紀錄時顯示引導空狀態」。執行 E2E 看到紅燈並貼出輸出（**真紅燈**：路由不存在，回應 404）
- [ ] 4.2 GREEN: 建立 `app/matchmaker/history/page.tsx`（入口，組合下述元件）、`components/matchmaker/HistoryView.tsx`（`"use client"`，於 hydration 的 `useEffect` 內取一次 `new Date()` 與 `readHistory()` 的結果存進 state；**不得**改用 `useRoundStore`，見 design Decision 5、7）、`components/matchmaker/EmptyHistory.tsx`（引導型空狀態，繁體中文並說明「完成對戰後才會有紀錄」）。重跑至綠
- [ ] 4.3 RED: 補兩個 test：「開啟歷史頁預設顯示今日區間」（seed 今日與更早各一筆，斷言今日篩選為選中狀態且列表只含今日那筆）與「切換區間後只顯示該區間的紀錄」（seed 今日與上月各一筆，切到上月後只出現上月那筆）。看到紅燈
- [ ] 4.4 GREEN: 建立 `components/matchmaker/HistoryRangeFilter.tsx`，提供今日／本週／本月／上月／更早五個篩選，初次開啟預設選中今日；選取狀態只存在元件 state，**不寫入 LocalStorage**。重跑至綠
- [ ] 4.5 RED: 補三個 test：「雙打紀錄顯示 8.2 全部欄位含雙打組成標示」、「單打紀錄不顯示雙打組成標示」、「每位球員同時顯示賽前與賽後分數」（賽前 4.20、賽後 4.35 兩值同時出現）。看到紅燈
- [ ] 4.6 GREEN: 建立 `components/matchmaker/HistoryRecordCard.tsx`，呈現 `prd.md` 8.2 全部欄位；雙打組成標示只在雙打時渲染；勝方以文字或圖示標示而非僅靠顏色（`prd.md` 12.5）；分數一律照 M4 寫入值原樣顯示，不重算。重跑至綠
- [ ] 4.7 RED: 補 test「跨月週時本月顯示空狀態而非錯誤」——以假時鐘把時間固定在 2026-08-01 並 seed 7/27～7/31 的紀錄，斷言本月顯示友善空狀態且畫面無錯誤字樣、本週如常列出該批紀錄。看到紅燈（**不得**改用「依當下日期動態算出資料」的寫法繞過假時鐘，見 design Risks）
- [ ] 4.8 GREEN: 讓每個區間各自擁有空狀態文案，並確保「本月為空」走的是正常空狀態路徑而非錯誤路徑。重跑至綠
- [ ] 4.9 REFACTOR: 把 E2E 的 seed 邏輯抽成單一 helper（一處組裝紀錄 fixture），確認五個 test 不各自重複拼 JSON；元件皆標 `"use client"` 且與 `components/matchmaker/` 既有命名風格一致。無壞味道則註記 skipped

## 5. 導覽入口（必 TDD）與唯讀保證（例外層）

Depends on: §4

> 導覽入口要改的是 `lib/matchmaker/section-nav.ts`，依專案規則屬 `lib/**` 的行為邏輯，
> **MUST 走 TDD 三步**（先看到單元測試紅燈再實作），不是例外層的 `<Link>` 新增；
> 唯讀保證那部分（§5.3～5.5）仍屬例外層，以 E2E 承擔。

- [ ] 5.1 RED: 於 `matchmaker-history.spec.ts` 補 test「可由對戰頁的連結進入歷史頁」——自 matchmaker 區段點擊歷史紀錄連結，斷言網址為 `/matchmaker/history` 且歷史頁內容出現。看到紅燈（**真紅燈**：連結尚不存在）。RED MUST 同時包含 `lib/matchmaker/section-nav.test.ts` 第 31～36 行 `toEqual` 斷言的單元紅燈（把預期清單改成含 `/matchmaker/history` 的三筆後先跑出紅燈）
- [ ] 5.2 GREEN: 在 `lib/matchmaker/section-nav.ts` 的 `MATCHMAKER_SECTION_HREFS` 與 `MATCHMAKER_SECTION_LABELS` 各加一筆 `/matchmaker/history`（標籤「歷史」），並同步更新第 23～24 行關於巢狀路由的註解（design Decision 6）。渲染層 `components/matchmaker/MatchmakerTabs.tsx` 只 map 清單，不需改動。**SHALL NOT** 改動 `site-navbar`、不改 M5 既有連結的行為、不順手重排連結順序或抽共用元件。重跑至綠
- [ ] 5.3 RED: 補兩個 test：「瀏覽與切換區間後 matchmaker:history:v1 內容不變」（記下開頁前的原始字串 → 依序切換五個區間 → 再讀出的字串逐字相同）與「紀錄於 hydration 後顯示且無 console error」（監聽 `console` 事件，斷言載入過程無任何 error，含 hydration mismatch 警告）。看到紅燈（若 4.2 已正確採 hydration 模式且從未寫入，兩項可能直接綠燈——**如實標註為 regression guard**）
- [ ] 5.4 GREEN: 確認 `HistoryView.tsx` 只呼叫 `readHistory()`（回傳為 `ReadHistoryResult`，即 `{ entries, droppedCount }` **物件而非陣列**），全檔沒有任何 `localStorage.setItem`／`removeItem`、沒有 `writeHistory()`／`writeRound()`，也沒有 import `useRoundStore`；render 期間不取用 `new Date()`／`Date.now()`／`localStorage`。重跑至綠。**注意**：`main` 上的 `readHistory()` 在 `droppedCount > 0` 時會呼叫 `writeHistory()` 回寫清理後的歷史（`lib/matchmaker/round-storage.ts` 第 142～147 行），因此唯讀保證的範圍是「`HistoryView` 自身不寫入」，§5.3 的 seed MUST 全數使用合法紀錄，以免踩到 M4 的回寫路徑而讓「內容不變」失守
- [ ] 5.5 REFACTOR: 確認 `/matchmaker/history` 不相依任何前一畫面留下的記憶體狀態（直接開啟與由連結進入的行為一致）；檢查新增的連結文案與既有導覽的文案風格一致。無壞味道則註記 skipped

## 6. 收尾驗證

- [ ] 6.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**；貼出「共 N 個錨點、N 個對上」的輸出
- [ ] 6.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/history-range.test.ts` 全綠，貼出輸出
- [ ] 6.3 `pnpm --filter ./nextjs-pickball test:e2e --grep "matchmaker-history"` 於五個 browser project 全綠，貼出輸出
- [ ] 6.4 `pnpm lint`（repo root）：0 errors；記錄既有 warning 以證明無新增
- [ ] 6.5 `pnpm typecheck`（repo root）通過
- [ ] 6.6 `pnpm test`（repo root）全套通過，確認未破壞 M1～M5 既有測試與 `hono-pickball` 後端測試
- [ ] 6.7 `DO_NOT_TRACK=1 openspec validate matchmaker-history-page --strict` 通過
- [ ] 6.8 **mutation 驗證**（本 change 有數個 RED 屬 regression guard，紅燈無法自然出現，測試有效性改由 mutation 承擔）。逐項改壞後跑 `history-range.test.ts` 確認變紅再還原，至少涵蓋：① `c2` 的 `min()` 拿掉 ② 本週一偏移改為 `now.getDay() - 1` ③ `startOfLocalDay` 改用 `Date.UTC` ④ `rangeOfTime` 的今日分支加上 `t <= now` 上界 ⑤ `filterHistoryByRange` 拿掉 `slice()`。逐項貼出紅燈輸出
- [ ] 6.9 `pnpm build` 通過，並確認 `/matchmaker/history` 被識別為靜態預渲染（與 hydration 模式一致：首次輸出為空狀態，client effect 後才填入紀錄）
