> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**。若某個測試加入後**立即全綠**，MUST 在該項後方誠實標註為
> regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。本 change 預期**恰有一項**
> 加入即綠：§3.4 的 E2E 欄名陣列更新（design Context 證據四已預告）。
>
> **本 change 不得新增任何 npm 相依**。需要新套件時回報 BLOCKED。
>
> **兩份 delta spec 皆保留大量逐字複製、行為未變的既有 Scenario**（見 test-plan.md 開頭
> 「範圍說明」）。以下只列出**行為有變**的 task；未列出的既有 Scenario 不需要新的 RED，
> 沿用既有測試即可。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容。目的是把 design.md Context 的四項證據在**目前的
> `main`** 上重新核對一次——那四項是本 change 撰寫當下的實測結果，開工時 MUST 重驗，
> 因為整份設計都建立在它們之上。

- [x] 1.1 確認目前 cwd 為 environment.md 宣告的工作樹、目前分支為
      `change/matchmaker-draw-followups`，且 baseline `pnpm test` 全綠；把 baseline 結果與
      初始 commit hash 回填 environment.md 的 Verification 三欄位
- [x] 1.2 確認 `main` 上 **M15（`matchmaker-timed-draw`）已合併且已 archive**：
      `ls openspec/changes/archive/ | grep timed-draw` 應命中，且
      `grep -n 'winner' nextjs-pickball/lib/matchmaker/history.ts` 應顯示
      `z.enum(["teamA", "teamB", "draw"])`。**不成立則立即停止並回報**——本 change 的兩個
      缺陷都以 `"draw"` 存在為前提
- [x] 1.3 重跑 design.md Context 證據一的 grep：
      `grep -rn 'winner === \|winner !== ' nextjs-pickball --include="*.ts" --include="*.tsx" | grep -v '\.test\.'`。
      逐條與 design.md 列出的十行比對。**若出現 design.md 未列出的第三處未處理 `"draw"` 的
      二元判斷，MUST 停下回報**，SHALL NOT 自行擴大範圍（execution-plan Escalation）
      → 重跑結果多出 4 行皆為誤判（e2e 規格檔內的中文註解、`scoreboard/GameOverDialog.tsx`
      屬完全不同的 `winner` 型別、`round-types.ts` 與 `export-scene.ts` 為 `!== null`
      的 null 檢查），`player-stats.ts:304` 仍是唯一未處理 `"draw"` 的二元判斷點，無需回報。
- [x] 1.4 盤點 `PlayerStat` 的所有建構點：
      `grep -rn "PlayerStat" nextjs-pickball --include="*.ts" --include="*.tsx"`。
      記錄「新增必填欄位 `draws` 後會編譯失敗的位置」清單，供 §2 一次改到位。
      **超過 5 處即依 execution-plan 的 `upgrade_to_opus_when` 回報**
      → 實際建構點：`buildRosterUnion` 名單分支（player-stats.ts:243）、歷史分支
      （player-stats.ts:263）、`computePlayerStats` 組裝物件（player-stats.ts:382）、
      測試 helper `buildStat`（PlayerStatsTable.test.tsx:11）。共 4 處，未超過 5，
      不需升級模型。
- [x] 1.5 讀 `nextjs-pickball/lib/matchmaker/player-stats.ts` 現況，記錄
      `PlayerStat`／`MutableStat` 的欄位順序、`tallyGamesAndResults`／`winRateOf`／
      `comparePlayerStatsForRanking` 的實際簽章。確認 `winRateOf` 與
      `comparePlayerStatsForRanking` **都不讀 `losses`**（design Context 證據二）
      → 確認屬實：`winRateOf(wins, gamesPlayed)` 只讀 wins／gamesPlayed，
      `comparePlayerStatsForRanking` 只讀 currentRating／winRate／gamesPlayed／name。
- [x] 1.6 讀 `nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx`，確認第五欄標題
      為「勝負」、內容為 `{stat.wins} - {stat.losses}`，且九個 `<TableHead>` 的實際順序與
      delta spec 的欄位清單一致
      → 確認屬實（第 54、89 行），九欄順序：名次／球員／目前強度／出場數／勝負／勝率／
      強度淨變化／最常搭檔／最常對手。
- [x] 1.7 讀 `nextjs-pickball/components/matchmaker/RoundTimerBanner.test.tsx`，確認既有 it
      「時間到時顯示帶 role alert 的時間到大字與繁體中文提示文案」確實以 **import 的常數**
      `ROUND_TIMER_EXPIRED_MESSAGE` 斷言（design Context 證據四的恆真斷言）。這條既有測試
      **不修改**，§4 另加一條新的
      → 確認屬實（第 57 行 `within(alert).getByText(ROUND_TIMER_EXPIRED_MESSAGE)`）。
- [x] 1.8 讀 `nextjs-pickball/tests/e2e/specs/player-stats.spec.ts` 的九項欄名陣列，
      確認斷言方式為 `toContainText`（子字串），記下該陣列的實際行號供 §3.4 使用
      → 陣列位於第 283～294 行（「勝負」在第 288 行），斷言於第 294 行
      `toContainText(columnName)`。
- [x] 1.9 讀 `nextjs-pickball/tests/e2e/specs/round-timer.spec.ts` 的到期斷言，確認它只比對
      「時間到」子字串而**不含**完整文案。若發現它其實逐字比對完整舊文案，MUST 記錄下來並
      在 §4 一併更新（proposal 的 Impact 假設此檔零修改，若假設不成立 MUST 更正 proposal）
      → 確認屬實（第 197 行 `getByRole("alert").getByText("時間到", { exact: true })`），
      該檔全文無「再打一球」命中，proposal 假設成立，§4 不需修改此檔。

## 2. `player-stats.ts`：和局獨立計數

> spec：`player-stats` 的「出場、勝負與勝率的計算」。
> design：Decision 1（新增 `draws`、和局仍計入出場數）、Decision 2（勝率公式不變）、
> Risks「`draws` 是新必填欄位」。
> **本組不動 `PlayerStatsTable.tsx`**——呈現是 §3 的範圍。

- [x] 2.1 RED：在 `nextjs-pickball/lib/matchmaker/player-stats.test.ts` 新增 it
      **「平局紀錄計為和局而非雙方各一敗場」**。兩位球員對戰兩場，一場 `winner: "teamA"`、
      一場 `winner: "draw"`；斷言勝方 `gamesPlayed: 2`／`wins: 1`／`losses: 0`／`draws: 1`／
      `winRate` 為 `1/2`，敗方 `gamesPlayed: 2`／`wins: 0`／`losses: 1`／`draws: 1`。
      **雙方都要斷言**（test-plan「Why first」：只看單邊會漏掉半套實作）。
      實跑 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/player-stats.test.ts`
      並貼出紅燈輸出（預期失敗於 `draws` 不存在，以及 `losses` 為 1／2）
- [x] 2.2 GREEN：`PlayerStat` 與 `MutableStat` 新增 `draws: number`；`buildRosterUnion` 的
      **兩個**建構分支（名單分支、歷史分支）各補 `draws: 0`；`tallyGamesAndResults` 由二分
      改三分——`entry.winner === winnerKey` 記勝場、`entry.winner === "draw"` 記和局、
      其餘記敗場；`computePlayerStats` 的組裝物件補 `draws: stat.draws`。
      **不動** `winRateOf` 與 `comparePlayerStatsForRanking`（Stage 1 會機械確認這兩者的
      `git diff` 為空）
- [x] 2.3 GREEN（收束）：修正 §1.4 盤點出的其餘 `PlayerStat` 建構點（測試 helper 等），
      讓 `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過
      → §2 Implementer 完成 1/2/3 點（`player-stats.ts` 內部）後，coordinator 的派工指示
      誤將第 4 點（`PlayerStatsTable.test.tsx` 的 `buildStat`）劃為「不要動」，導致 `tsc`
      在主分支上實際維持紅燈（違反本項與 execution-plan「tsc 在每一組結束時都 MUST 是綠的」）。
      由 Stop hook 攔下後修正：coordinator 直接補上 `buildStat` 的 `draws: 0` 預設值
      （commit `e39e86f`），僅補齊型別、不動任何既有斷言內容，`tsc --noEmit` 與
      `PlayerStatsTable.test.tsx` 既有 10 個測試皆已確認通過。
- [x] 2.4 REFACTOR：檢查 `tallyGamesAndResults` 的三分支是否讀得順（避免巢狀三元，
      全域規範要求改用 if/else）；在和局分支旁補一行註解，說明**為何和局仍計入
      `gamesPlayed`**（design Decision 1），SHALL NOT 重述函式名
      → 已是 if/else if/else，無巢狀三元；註解已交代 Decision 1 理由，無壞味道，
      Stage 2 確認無需額外 commit（一個小 nit：理由可更貼近 `gamesPlayed += 1`
      該行，非必要，留待未來）。
- [x] 2.5 Mutation 自測（派工單必帶 a）：把和局分支改回 `stat.losses += 1`，確認 2.1 的測試
      轉紅；回報「幾次／改了什麼／是否轉紅」
      → Implementer 自測 1 次已轉紅；Stage 2 獨立複測（拿掉和局分支）同樣轉紅
      （`16 passed` → `1 failed / 15 passed`，`losses` 斷言 0 vs 1），複測後已還原。

**§2 審查結論**：Stage 1 PASS（規格符合、勝率與排序零改動、無 scope creep）、
Stage 2 PASS（命名一致、mutation 證實非恆真斷言、分層未破、無新相依）。
非阻斷觀察兩項留給未來：① `winner: "teamB"` 目前僅間接覆蓋；② `tallyGamesAndResults`
的 catch-all `else` 若未來 enum 再擴充需留意（與 `history-csv.ts`／`export-scene.ts`
既有慣例一致，本次不改）。

## 3. `PlayerStatsTable.tsx`：勝負欄擴為勝負和欄

> spec：`player-stats` 的「統計頁的路由與呈現」。
> design：Decision 3（不新增第十欄）、Decision 4（三個數字恆常顯示）、Decision 6（E2E 的
> 子字串比對無法承擔改名的證明責任）、Risks「390px 溢出」與「子字串比對會遮蔽退化」。
> **相依 §2**：`draws` 欄位必須先存在。

- [x] 3.1 RED：在 `nextjs-pickball/components/matchmaker/PlayerStatsTable.test.tsx` 新增 it
      **「勝負和欄依序顯示勝場敗場與和局三個數字」**。渲染一列 `wins: 2`／`losses: 1`／
      `draws: 1` 的 `PlayerStat`；斷言該列的勝負和欄文字依序含 `2`、`1`、`1`，**且**表格
      標題列的該欄名稱為「勝負和」。實跑單檔並貼出紅燈輸出
- [x] 3.2 GREEN：第五個 `<TableHead>` 由「勝負」改為「勝負和」；該欄內容由
      `{stat.wins} - {stat.losses}` 改為 `{stat.wins} - {stat.losses} - {stat.draws}`。
      三個數字**恆常顯示**，SHALL NOT 加「和局為 0 就不顯示」的條件渲染（Decision 4）
      → 連動更新兩處既有測試斷言值（九欄標題陣列、`各欄位如實顯示球員統計資料` 的
      `cellTexts[4]`），Stage 1／Stage 2 皆確認屬機械性同步、非 scope creep。
- [x] 3.3 實跑既有 E2E Scenario「排行榜表格於支援寬度下限不造成整頁橫向溢出」：
      `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 tests/e2e/specs/player-stats.spec.ts`。
      **溢出即依 execution-plan Escalation 處理**（先縮內距或字級，SHALL NOT 改回兩個數字）
      → 40 passed（5 browser project × 8 test），無溢出，無需 escalation。
- [x] 3.4 更新 `nextjs-pickball/tests/e2e/specs/player-stats.spec.ts` 九項欄名陣列中的
      「勝負」為「勝負和」，其餘八項與其他斷言逐字不變。
      ⚠️ **regression guard（加入即綠）**：既有斷言為 `toContainText` 子字串比對，改前改後
      皆通過，**SHALL NOT 宣稱這裡有紅燈**。改它的理由是讓清單記載現行欄名而非過時欄名
      → 已完成，Stage 1 確認 diff 僅此一行、其餘八項與斷言逐字未變。
- [x] 3.5 REFACTOR：確認呈現層沒有混入計算（例如在元件內重算和局），分隔號樣式與既有
      `2 - 1` 一致
      → 零分支、`{a} - {b} - {c}` 沿用既有 JSX 寫法，無壞味道，Stage 2 確認 skipped。
- [x] 3.6 Mutation 自測（派工單必帶 a）：① 標題改回「勝負」；② 第三個數字改成 `{0}`。
      兩者 MUST 各自讓 3.1 的測試轉紅；回報結果
      → Implementer 自測與 Stage 2 獨立複測皆兩項轉紅。

**§3 審查結論**：Stage 1 PASS、Stage 2 PASS。非阻斷建議：新 it 以 `indexOf` 鏈斷言
「依序」，但 `losses`／`draws` 測資皆為 `1` 時該鏈本身無法區分兩者對調——Stage 2 實測證明
對調會被隔壁的「各欄位如實顯示球員統計資料」it 抓到，套件整體覆蓋無缺口，故不構成 FAIL，
留待未來若touch本檔可考慮改用三個相異值直接 `toBe` 比對，本次不強制修改。

## 4. `labels.ts`：到期提示文案

> spec：`match-stage` 的「計時器顯示與時間到提示」。
> design：Decision 5（只換字串值的三項約束）、Decision 6（既有斷言是恆真斷言）、
> Risks「文案斷言用語意片段」。
> **與 §2／§3 無相依**，但仍依序執行（共用單一工作樹）。
> **本組不動 `RoundTimerBanner.tsx`**——它渲染的是常數本身。

- [ ] 4.1 RED：在 `nextjs-pickball/components/matchmaker/RoundTimerBanner.test.tsx` 新增 it
      **「時間到提示文案說明同分可直接送出平手而非再打一球」**。計時到期後取
      `role="alert"` 區塊內的文字，斷言**含**「同分」與「平手」、**不含**「再打一球」。
      斷言用語意片段而非整句逐字（design Decision 6）。實跑單檔並貼出紅燈輸出
      （預期失敗於現行文案含「再打一球」）
- [ ] 4.2 GREEN：`nextjs-pickball/lib/matchmaker/labels.ts` 的
      `ROUND_TIMER_EXPIRED_MESSAGE` 改為 **「時間到：領先者勝，同分可直接送出平手」**。
      保留「時間到：」前綴；SHALL NOT 以樣板字串拼接 `DRAW_LABEL`；常數名稱與匯出位置不變
- [ ] 4.3 同步更新該常數上方的 JSDoc 註解：目前寫「M14 matchmaker-round-timer change，
      spec『計時器顯示與時間到提示』逐字指定」，MUST 補記本次修訂的**理由**
      （M15 之後計時回合的同分可直接送出並記為平手，舊文案的「再打一球」是錯誤指示），
      SHALL NOT 自行編一個 M 編號（派工單必帶 e）
- [ ] 4.4 實跑 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 tests/e2e/specs/round-timer.spec.ts`
      確認既有 E2E 不受文案改動影響（proposal Impact 宣稱此檔零修改，這裡是該宣稱的驗證）
- [ ] 4.5 REFACTOR：無壞味道可註記 skipped
- [ ] 4.6 Mutation 自測（派工單必帶 a）：把 `ROUND_TIMER_EXPIRED_MESSAGE` 改回舊文案
      「時間到：領先者勝，平手請再打一球」，確認 4.1 的測試轉紅；回報結果

## 5. 收尾驗證

- [ ] 5.1 `pnpm -r exec tsc --noEmit` 通過（exit 0）
- [ ] 5.2 `pnpm lint` 通過
- [ ] 5.3 `pnpm test` 全綠（前後端）；記錄測試檔數與測試數，與 environment.md 的 baseline
      比對，確認**只有增加、沒有減少**
- [ ] 5.4 全套 E2E：
      `pnpm --filter ./nextjs-pickball exec playwright test --workers=1`。
      跑完立刻清掉自己起的 process（派工單必帶 g）。已知環境雜訊（`quiz.spec.ts` 在
      `webkit`／`mobile-safari` 偶發失敗）MUST 以單檔隔離重跑確認，SHALL NOT 直接當成迴歸
- [ ] 5.5 機械盤點一：重跑
      `grep -rn 'winner === \|winner !== ' nextjs-pickball --include="*.ts" --include="*.tsx" | grep -v '\.test\.'`，
      確認 production 程式碼中不再有未處理 `"draw"` 的二元判斷
- [ ] 5.6 機械盤點二：`grep -rn "再打一球" nextjs-pickball openspec/specs openspec/changes/matchmaker-draw-followups`
      應**零命中**（`openspec/changes/archive/**` 與 `matchmaker-runbook-m10-m15.md` 的
      歷史命中屬正常，SHALL NOT 修改歷史檔）
- [ ] 5.7 機械盤點三：`git diff --stat main` 確認 `package.json`／`pnpm-lock.yaml` 未變、
      `hooks/` 零改動、`lib/matchmaker/round.ts`／`rating.ts`／`history.ts`、
      `lib/scoreboard/**`、`hono-pickball/**`、`openspec/specs/**` 皆零改動
- [ ] 5.8 重複標題檢查（BSD `uniq` 會誤判中文，MUST 用下列 Python 版本）：
      ```bash
      python3 -c "
      import collections,sys
      lines=open(sys.argv[1],encoding='utf-8').read().splitlines()
      c=collections.Counter(l for l in lines if l.startswith(('### Requirement:','#### Scenario:')))
      print([(k,v) for k,v in c.items() if v>1] or '無重複')
      " openspec/changes/matchmaker-draw-followups/specs/player-stats/spec.md
      ```
      對 `specs/match-stage/spec.md` 再跑一次
- [ ] 5.9 `DO_NOT_TRACK=1 openspec validate matchmaker-draw-followups --strict` 通過
- [ ] 5.10 Final Code Reviewer（opus）跑完 execution-plan 的 checklist，回報結果
