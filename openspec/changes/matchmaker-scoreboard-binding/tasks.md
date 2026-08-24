# Tasks — matchmaker-scoreboard-binding

> **所有指令從 repo root 執行，cwd 必須在 environment.md 宣告的 worktree 內。**
> 前端單檔測試：`pnpm --filter ./nextjs-pickball test --run <workspace 相對路徑>`
> —— **`--run` 前不可加 `--`**，否則 vitest 收不到路徑會跑完整套，紅燈證據會被既有綠燈淹沒。
>
> **TDD 三步**：① 新增失敗測試並在 shell **實際看到紅燈**（貼出輸出）② 最小實作至綠
> ③ refactor（無壞味道可註記 skipped）。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 verify 無法機械核對。
>
> **關於本 change 的紅燈**：`lib/scoreboard/match-slots.ts` 與 `lib/matchmaker/scoreboard-binding.ts`
> 為全新檔案，第一個測試的紅燈形式為 **import 失敗（模組不存在）**，之後才是斷言失敗，兩者皆為真紅燈。
> `types.ts`／`reducer.ts`／`storage.ts`／`useScoreboardStore.ts` 是既有檔案，新增欄位與參數後
> 相關測試會因「欄位不存在／參數被忽略」而紅——同樣是真紅燈。
> **若某項測試寫下當下即綠，那是既有實作已滿足**：MUST 在該項下如實標註「regression guard」，
> 並補 mutation 驗證（把實作改壞看紅、還原看綠）證明斷言有偵測力。
> **不得**以「改斷言看紅再改回」偽造紅燈（root `CLAUDE.md`「紅燈要是真的」）。

## 0. 上游契約對齊（前置調查，不寫任何程式碼）

> 本節產出的是**填進後續 task 的實際識別字**，不新增、不修改任何檔案，因此無 RED／GREEN 配對。
> 若任一項與 design.md 的假設不符，MUST 停止並依 execution-plan.md 的 Escalation 回報人類，
> SHALL NOT 由本段替 M4／M5 補上缺少的欄位或函式。

- [ ] 0.1 讀 M4 產出的回合模組，記下：回合型別名稱、`targetScore` 欄位名、對戰清單欄位名、單場的 id 欄位名、場地編號欄位名、兩隊欄位名、完成狀態欄位名、LocalStorage key（應為 `matchmaker:round:v1`）
- [ ] 0.2 讀 M4 的**送出比分 pipeline** 入口：函式名、簽章、是否為純函式（回傳新回合與歷史）或直接持久化。若不可在單元層呼叫，MUST 把 test-plan 中「回填與手動輸入的送出結果逐欄相同」的 Tier 由 `unit` 調整為 `integration` 並在此註記（design.md Open Question 4）
- [ ] 0.3 讀 M4 的「重設／重排本輪」與「重置名單」流程入口，確認可在其尾端追加清槽步驟；一併讀 `nextjs-pickball/lib/matchmaker/storage.ts` 的**列舉 key 清單** `RESET_KEYS`（M4 版本應為三個 key）與同檔的 `resetMatchmakerData()`，確認清單可由外部模組 import 常數併入
- [ ] 0.4 讀 M5 產出的對戰頁：路由路徑與其常數名、場地色塊元件路徑、手動輸入送出的既有入口、目標分數控制項所在元件**及其既有單元測試檔**（應為 `components/matchmaker/RoundControls.test.tsx`），記下既有的鎖定判斷寫在何處（M5 為「目前回合是否存在」）與 `setTargetScore` 的實際簽章
- [ ] 0.5 讀 `node_modules/next/dist/docs/` 中 `searchParams` 的段落，確認 Next.js 16 於 server component 的實際簽章（是否為 Promise、是否需 `await`）——依 `nextjs-pickball/AGENTS.md`，**不得**依訓練資料的記憶書寫（design Decision 3）
- [ ] 0.6 把 0.1～0.5 的實際識別字回填到本檔 §3～§8 的括號佔位處

## 1. 分槽儲存（`lib/scoreboard/match-slots.ts`）

- [ ] 1.1 RED: 新增 `nextjs-pickball/lib/scoreboard/match-slots.test.ts`，寫 it「寫入某場次的槽不影響其他場次與獨立槽」——預置 `m1`（8-5、15 分制）與 `m2`，更新 `m2` 後斷言 `m1` 的分數／history／`targetScore` 完全不變，且 `localStorage.getItem("scoreboard:current:v1")` 為 `null`。跑單檔確認紅燈（模組不存在）並貼出輸出
- [ ] 1.2 GREEN: 建立 `nextjs-pickball/lib/scoreboard/match-slots.ts`：匯出 `MATCH_SLOTS_KEY = "scoreboard:matches:v1"`、以 `ScoreboardStateSchema` 組成的 map schema，以及單筆讀寫函式。沿用 `storage.ts` 既有的 `hasLocalStorage()` 守門與 try/catch + `console.warn` 形態
- [ ] 1.3 RED: 補 it「單筆損壞只丟該筆並回報 droppedCount，其餘場次保留」——`{ m1: 缺必要欄位, m2: 合法 }` → 回傳只含 `m2`、`droppedCount === 1`、`console.warn` 被呼叫。確認紅燈
- [ ] 1.4 GREEN: 實作逐筆降級：整份能解析為物件時逐筆 `safeParse`，只丟不合法的條目（比照 `player-roster` 的「LocalStorage 持久化與逐筆降級」，design Decision 4）
- [ ] 1.5 RED: 補 it「整份非 JSON 時清除分槽 key 且不動獨立槽」——分槽 key 內容為 `"{{{"` → 該 key 被移除、回傳空集合、`scoreboard:current:v1` 仍在。確認紅燈
- [ ] 1.6 GREEN: 實作整份損壞的清除路徑，且**只**移除分槽 key
- [ ] 1.7 RED: 補 it「批次清除只移除指定場次且忽略不存在的 id」——`{m1,m2,m3}` 以 `["m1","m3","nope"]` 清除 → 只剩 `m2`，不拋錯。確認紅燈
- [ ] 1.8 GREEN: 實作批次清除與「清空全部條目」兩個函式
- [ ] 1.9 REFACTOR: 確認 key 字串、schema 與 `console.warn` 前綴各只有一處定義；與 `storage.ts` 的既有慣例對齊（無壞味道則註記 skipped）

## 2. 綁定欄位與 reducer 鎖定（`lib/scoreboard/types.ts`、`reducer.ts`）

- [ ] 2.1 RED: 於 `nextjs-pickball/lib/scoreboard/storage.test.ts` 補 it「舊版資料缺 matchId 時補為 null 且不清除 key」——寫入不含 `matchId` 的合法舊資料 → `readScoreboard()` 回傳的 `matchId === null`、key 未被移除、分數與 history 完整。確認紅燈
- [ ] 2.2 GREEN: `types.ts` 的 `ScoreboardStateSchema` 新增 `matchId: z.string().nullable().default(null)`，並把 `matchId` 併入 `MatchSettings`。**SHALL NOT** bump storage key（既有 spec 的向後相容策略）
- [ ] 2.3 RED: 於 `nextjs-pickball/lib/scoreboard/reducer.test.ts` 補 it「綁定場次時 setup 階段 ignore SET_TARGET_SCORE」——`matchId: "m1"`、`targetScore: 15`、`status: "setup"` 下 dispatch `SET_TARGET_SCORE(11)` → state 全等於變更前。確認紅燈
- [ ] 2.4 GREEN: `SET_TARGET_SCORE` 於 `state.matchId !== null` 時直接回傳原 state（與既有 `status !== "setup"` 的 guard 併排，不另開分支結構）
- [ ] 2.5 RED: 於 `reducer.test.ts` 補 it「UNDO 與 RESET 後保留 matchId，不退回 null」；同時於既有三個 it（「setup 階段可切換 mode…」「setup 階段可切換 firstServer」「setup 階段可切換 targetScore 且保留 mode 與 firstServer」）補上 `matchId` 不變的斷言（**it 名稱不得更動**——它們是 spec 驗收錨點）。確認紅燈
- [ ] 2.6 GREEN: `createInitialState` 與 `settingsOf` 帶入 `matchId`，使 UNDO 的 replay 與 RESET 皆保留（design Decision 6）
- [ ] 2.7 REFACTOR: 確認 `matchId` 的保留只透過 `MatchSettings` 一條路徑，沒有任何 case 分支自行複製欄位（無壞味道則註記 skipped）

## 3. storage 分派與 hook 綁定（`lib/scoreboard/storage.ts`、`hooks/useScoreboardStore.ts`）
Depends on: §1、§2

- [ ] 3.1 RED: 於 `nextjs-pickball/hooks/useScoreboardStore.test.tsx` 補 it「未帶 matchId 時沿用獨立槽且不觸碰分槽 key」——預置 `scoreboard:current:v1` 的合法進度，不帶 `matchId` render → state 為該進度、`matchId === null`、綁定狀態為 `standalone`，且分槽 key 全程未被讀寫。確認紅燈
- [ ] 3.2 GREEN: `storage.ts` 的 `readScoreboard(matchId)`／`writeScoreboard(state)`／`clearScoreboard(matchId)` 擴充為依 `matchId` 分派（**寫入槽位一律由 `state.matchId` 推導**，不接受槽位參數）；`useScoreboardStore(matchId)` 接受參數並回傳三元組 `[state, dispatch, bindingStatus]`
- [ ] 3.3 RED: 補 it「帶 matchId 時 hydrate 自對應槽且只寫回該槽」——預置 `m1`（15 分制、8-5）→ 以 `matchId="m1"` render 並 dispatch 一次 `RALLY_WON` → 只有 `m1` 條目變動，`scoreboard:current:v1` 未被寫入，綁定狀態為 `bound`。確認紅燈
- [ ] 3.4 GREEN: 補齊綁定路徑的 hydrate 與寫回
- [ ] 3.5 RED: 補 it「matchId 無對應槽時回報 missing 且不建立新條目」——以不存在的 `matchId` render → 綁定狀態 `missing`、分槽 key 無新增條目、獨立槽未被寫入。確認紅燈
- [ ] 3.6 GREEN: 實作 `missing` 狀態，且該狀態下**完全不寫入任何槽**（spec 的 SHALL NOT 條款）
- [ ] 3.7 REFACTOR: 確認既有的 effect 順序（write 在前、read 在後、`hasHydratedRef` 守門、cleanup reset ref）與 Strict Mode 處理**原封不動**；`matchId` 變動時的重新 hydrate 行為需有明確註解說明（無壞味道則註記 skipped）

## 4. 計分板入口的純函式層（`lib/matchmaker/scoreboard-binding.ts`）
Depends on: §1

- [ ] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，寫 it「seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手」——15 分制雙打回合 + 未開打場次 → seed 的 `targetScore === 15`、`mode === "doubles"`、`matchId` 為該場 id、分數 0-0、`status === "setup"`。確認紅燈（模組不存在）
- [ ] 4.2 GREEN: 實作 `buildMatchSlotSeed(round, match)`：以 `createInitialState` 為基底帶入該輪的 `targetScore`（欄位名見 §0.1）、對戰方式與 `matchId`，`firstServer` 取預設值
- [ ] 4.3 RED: 補 it「已有進度的場次再次進入時保留既有進度不覆蓋」——槽已有 8-5／`playing` → 再次呼叫後分數、history 與 `targetScore` 完全不變。確認紅燈
- [ ] 4.4 GREEN: 實作 `ensureMatchSlot(matchId, seed)`：已有條目則原樣回傳、不寫入
- [ ] 4.5 RED: 補 it「第一隊對應 us、第二隊對應 them，來回轉換不顛倒」——`{first: 11, second: 7}` → `{us: 11, them: 7}` → 轉回後仍為 `{first: 11, second: 7}`。確認紅燈
- [ ] 4.6 GREEN: 實作**單一**的隊伍對應函式（入口與回填共用），SHALL NOT 在兩處各寫一次
- [ ] 4.7 REFACTOR: 確認本模組只相依 `lib/scoreboard/match-slots.ts` 與回合型別，**不被** `lib/scoreboard/` 反向 import（design Decision 2 的單向相依）（無壞味道則註記 skipped）

## 5. 回填清單與目標分數鎖定判定（`lib/matchmaker/scoreboard-binding.ts`）
Depends on: §4

- [ ] 5.1 RED: 補 it「只有 finished 的槽才進入待送出清單」——`m1: finished`／`m2: playing`／`m3: 無槽` → 清單只含 `m1`。確認紅燈
- [ ] 5.2 GREEN: 實作 `collectFinishedSubmissions(round, slots)`：回傳待送出清單（含 `matchId` 與轉換後的兩隊比分）
- [ ] 5.3 RED: 補 it「已完成的場次不重複送出且連續呼叫為冪等」——`m1` 槽為 `finished` 且回合中已完成 → 清單為空；連續呼叫兩次皆為空。確認紅燈
- [ ] 5.4 GREEN: 加入「該場尚未完成」條件（冪等的第二道防線，design Decision 5）
- [ ] 5.5 RED: 補 it「槽對應的場次已不在回合中時略過且不拋錯」——槽有 `gone` 的 `finished` 條目、回合不含 `gone` → 清單不含 `gone`。確認紅燈
- [ ] 5.6 GREEN: 加入「場次仍在回合中」條件
- [ ] 5.7 RED: 補 it「回填與手動輸入的送出結果逐欄相同」——同一回合同一場、比分 11-7，兩條路徑各跑一次 → 回合物件與歷史紀錄逐欄相同（比分、勝方、賽前分數、賽後分數、對戰方式、雙打組成標示），僅完成時間可相異。確認紅燈（Tier 依 §0.2 的結論；若改為 integration 須在此註記）
- [ ] 5.8 GREEN: 讓回填呼叫 §0.2 找到的**同一個**送出入口，SHALL NOT 另寫平行寫入路徑
- [ ] 5.9 RED: 補四個 it：「無任何場次完成且無計分板槽時目標分數未鎖定」、「任一場次的計分板槽非 setup 時目標分數鎖定」、「槽存在但仍為 setup 時不視為已開始計分」、「已有場次完成時目標分數鎖定，不論比分來源」。確認紅燈
- [ ] 5.10 GREEN: 實作鎖定判定純函式，輸出布林值與繁體中文的鎖定原因字串
- [ ] 5.11 REFACTOR: 三個條件的判定與隊伍對應是否有重複邏輯；`collectFinishedSubmissions` 的過濾條件抽為具名 predicate（無壞味道則註記 skipped）

## 6. 清除範圍（`lib/matchmaker/scoreboard-binding.ts` 與 M4 的回合流程）
Depends on: §1、§5

- [ ] 6.1 RED: 補 it「重設本輪只清除未完成場次的槽且不動獨立槽」——`m1` 已完成、`m2` 未完成有槽 → 重設後 `m2` 條目被移除、`m1` 的比分／評分／歷史不變、`scoreboard:current:v1` 未被觸碰。確認紅燈
- [ ] 6.2 GREEN: 在 §0.3 找到的「重設／重排本輪」流程尾端追加清槽；清除範圍**僅限**被重排掉的未完成場次
- [ ] 6.3 RED: 於 `nextjs-pickball/lib/matchmaker/storage.test.ts` **更新 M4 既有的 it**「重置只移除列舉的 key，不影響 scoreboard 資料」——改名為「重置只移除列舉的四個 key，不影響獨立計分板資料」，並把斷言擴為：預置 `matchmaker:roster:v1`／`matchmaker:round:v1`／`matchmaker:history:v1`／`scoreboard:matches:v1` 與 `scoreboard:current:v1`，呼叫 `resetMatchmakerData()` 後前四者皆被移除、`scoreboard:current:v1` 仍在（`player-roster` delta 的「重置只清除列舉範圍內的 key」Scenario）。確認紅燈（第四個 key 尚未在清單中）並貼出輸出
- [ ] 6.4 GREEN: `nextjs-pickball/lib/matchmaker/storage.ts` 的列舉清單 `RESET_KEYS`（`resetMatchmakerData()` 亦在同檔）加入分槽 key，字面值 **import 自** §1.2 的 `MATCH_SLOTS_KEY`（`lib/scoreboard/match-slots.ts`），SHALL NOT 在 matchmaker 側再寫一次字串
- [ ] 6.5 RED: 於 `scoreboard-binding.test.ts` 補 it「重置名單清除全部場次槽但保留獨立槽」——預置多場條目 → 走重置名單流程 → 分槽 key 的全部條目被清除、`scoreboard:current:v1` 未被觸碰。**若因 6.4 已使整個分槽 key 被移除而寫下當下即綠**，如實標註為 regression guard 並補 mutation 驗證（把分槽 key 自清單移除看紅、還原看綠）；**SHALL NOT 為了製造紅燈而在重置流程尾端另寫一次清空呼叫**——`resetMatchmakerData()` 的清除範圍只能有一個定義處（`player-roster` delta 的「四個 key 的名稱 MUST 取自同一個來源模組」）
- [ ] 6.6 REFACTOR: 確認所有「銷毀場次」的路徑都經過同一個清槽函式，沒有任何路徑漏清（design Decision 2 的不變式維持端）；確認「重設本輪」（逐場清）與「重置名單」（整份清）兩條路徑的**清除範圍各自只有一處定義**（無壞味道則註記 skipped）

## 7. 計分板 UI 接線（例外層 — 入口與純呈現元件，以 E2E 驗收）
Depends on: §3

> 依 `nextjs-pickball/CLAUDE.md` 的 TDD 適用範圍：`app/**/page.tsx` 為**入口例外層**、
> 純呈現型元件**不強制單元 TDD**，兩者以 Playwright E2E 驗收。
> 行為邏輯已於 §1～§6 下放到 `lib/` 與 `hooks/` 並各自 TDD，本節不再於元件內放任何判斷邏輯。

- [ ] 7.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，寫兩個 test：「場次失效時顯示繁中說明與兩個出口且不顯示技術錯誤碼」、「失效畫面可切換為獨立計分板並恢復計分」。每個 test 前清空 `scoreboard:matches:v1` 與 `scoreboard:current:v1`。跑 `pnpm --filter ./nextjs-pickball test:e2e --grep "scoreboard-binding"` 確認紅燈並貼出輸出
- [ ] 7.2 GREEN: `app/scoreboard/page.tsx` 讀 `searchParams` 的 `match` 並以 prop 傳入（簽章依 §0.5）；`Scoreboard.tsx` 接受 `matchId` prop 並傳給 `useScoreboardStore`；新增 `components/scoreboard/MatchBindingNotice.tsx` 呈現失效說明與「回到對戰頁」「改用獨立計分板」兩個出口。文案為繁體中文且說明可採取的修正方式
- [ ] 7.3 RED: 補兩個 test：「綁定模式設定列以唯讀文字顯示目標分數且無比賽形式下拉」、「綁定模式顯示場地標示且返回對戰可回到對戰頁」。確認紅燈
- [ ] 7.4 GREEN: `ScoreboardSetup.tsx` 加入綁定模式分支——顯示場地標示與「本輪 N 分制」唯讀文字、不渲染比賽形式下拉與目標分數 radiogroup、加入「返回對戰」按鈕（路由常數取自 §0.4）。獨立模式的既有渲染**逐字不變**（design Decision 8）
- [ ] 7.5 RED: 補 test「綁定模式多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」——四個 viewport（390x844、844x390、768x1024、1024x600）下斷言 `scrollHeight <= clientHeight + 1` 且四顆核心按鈕 boundingBox 完整落在 viewport 內。確認紅燈
- [ ] 7.6 GREEN: 依量測結果調整綁定模式設定列的高度預算。**若 7.5 寫下當下即綠**，如實標註為 regression guard 並補 mutation 驗證（例如暫時把場地標示改為兩行看是否變紅），SHALL NOT 改斷言偽造紅燈
- [ ] 7.7 REFACTOR: 確認綁定模式與獨立模式共用同一個設定列容器與間距係數，沒有為綁定模式另起一套樣式；`MatchBindingNotice` 不含任何判斷邏輯（無壞味道則註記 skipped）

## 8. 對戰頁 UI 接線（例外層 — 純呈現元件，以 E2E 驗收；§8.5～§8.6 為 M5 既有單元測試的更新與其實作）（**例外**：§8.4、§8.6 需改 `hooks/useRoundStore.ts`，該部分屬行為邏輯，MUST 走 TDD 三步，不適用本節的例外層豁免）
Depends on: §4、§5、§6、§7

- [ ] 8.1 RED: 於 `scoreboard-binding.spec.ts` 補三個 test：「計分中的場次顯示計分中標示與當前比分」、「未完成的計分進度可離開後再進入接續」、「多場地同時計分時各場進度互不覆蓋」。前置以真實路徑鋪設（建立參賽者 → 產生本輪對戰）；耗時不可接受時才改用 `page.addInitScript` 直接寫入 `matchmaker:round:v1`，並於檔頭註明 schema 複製來源（design Risks）。確認紅燈
- [ ] 8.2 GREEN: M5 的場地色塊元件加入「進入計分板／繼續計分」入口（點擊時先 `ensureMatchSlot` 再導向 `/scoreboard?match=<matchId>`，順序不可對調）與「計分中」文字標示＋當前比分
- [ ] 8.3 RED: 補兩個 test：「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」、「已完成場次不顯示進入計分板入口」。確認紅燈
- [ ] 8.4 GREEN: 對戰頁在回合資料就緒後執行 reconcile（以「回合已 hydrate」為觸發條件，不用獨立的 mount effect，見 design Risks），把 `collectFinishedSubmissions` 的結果逐筆送進 §0.2 的送出入口並清槽；已完成場次不渲染入口
- [ ] 8.5 RED: **更新 M5 既有的 `nextjs-pickball/components/matchmaker/RoundControls.test.tsx`**（`match-stage` delta 的 MODIFIED「目標分數選擇器」）：
      ① 把既有 it「目前回合存在時目標分數選擇器 disabled 並顯示已鎖定說明」的名稱改為「本輪已開始計分時目標分數選擇器 disabled 並顯示鎖定原因」，前置改為「回合的目標分數為 15 且該輪已開始計分（任一計分板槽 `status !== "setup"`，或任一場次已完成）」，斷言維持三顆選項 `disabled`、`aria-checked="true"` 者為 15，並改為斷言畫面顯示鎖定判定回傳的原因字串；
      ② 新增 it「回合存在但尚未開始計分時目標分數選擇器 enabled 且變更委派 setTargetScore」——回合存在、所有場次 `pending`、無任何槽離開 `setup` → 三顆選項 enabled、選取 21 後 `setTargetScore` 被以 `21` 呼叫一次、畫面不顯示鎖定說明；
      ③ 既有 it「目標分數選項為 11／15／21 且預設選中 11」**名稱與斷言不動**（仍為 spec 驗收錨點）。
      跑單檔確認紅燈（M5 現行實作為「有回合就鎖」，②必紅）並貼出輸出
- [ ] 8.6 GREEN: 目標分數選擇器的鎖定與否改為委派 §5.10 的判定純函式（SHALL NOT 在元件內以「目前回合是否存在」判斷）並顯示其回傳的繁體中文鎖定原因；未鎖定時的變更委派 §0.4 記下的 `setTargetScore(round, n)`，SHALL NOT 於 UI 層直接改寫回合物件。**注意 `setTargetScore` 目前是懸空的純函式**——`lib/matchmaker/round.ts` 有定義，但 M5 未接上任何非測試呼叫端，`hooks/useRoundStore.ts` 的 `UseRoundStoreResult` 只有 `round`／`history`／`droppedCount`／`generateRound`／`resetIncompleteMatches`／`submitScore`，**沒有套用新回合的入口**。因此本步 MUST 先於 `hooks/useRoundStore.ts` 新增 `setTargetScore(targetScore)` 動作（比照 `resetIncompleteMatches` 的「呼叫純函式 → 判 `ok` → dispatch」形態，**屬行為邏輯、必 TDD**），再由 `app/matchmaker/page.tsx` 以 prop 傳給 `RoundControls`
- [ ] 8.7 RED: 補兩個 e2e test：「本輪開始計分後目標分數控制項停用並說明原因」、「手動輸入比分的路徑仍可獨立完成一場」。確認紅燈；**兩者若寫下當下即綠**（前者已由 8.6 實作、後者為 M5 既有行為未被破壞），如實標註為 regression guard 並補 mutation 驗證，**不得為了製造紅燈而先破壞它們**
- [ ] 8.8 GREEN: 依 8.7 的量測補齊對戰頁的鎖定說明呈現（若 8.7 已綠則標註 skipped，不寫任何多餘程式碼）
- [ ] 8.9 REFACTOR: 確認場地色塊與目標分數選擇器都沒有把「該不該顯示入口」「是否計分中」「是否鎖定」的判斷寫在元件內，而是取用 §4／§5 的純函式輸出（無壞味道則註記 skipped）

## 9. 收尾驗證（對應 root `README.md` 部署前手動檢查清單）

- [ ] 9.1 以腳本逐條核對**四份** delta spec（`scoreboard`／`match-stage`／`round-lifecycle`／`player-roster`）的每個「驗收」錨點：檔案存在、it／test 名稱**逐字**相符（不靠目視）。特別確認兩個**改名**的既有測試已改到位：`RoundControls.test.tsx` 的「本輪已開始計分時目標分數選擇器 disabled 並顯示鎖定原因」（§8.5）與 `lib/matchmaker/storage.test.ts` 的「重置只移除列舉的四個 key，不影響獨立計分板資料」（§6.3），且**舊名稱已不存在**於測試檔中。不符即修測試名稱，**不改 spec**
- [ ] 9.2 spec 條目重複檢查：依 root `CLAUDE.md` 指定的 python 計數法逐標題計數，**不使用** BSD `uniq`（macOS 的 `uniq` 會把內容不同的中文標題誤判為重複）
- [ ] 9.3 `pnpm lint` — 0 errors（既有 warning 清單須與變更前一致，不得新增）
- [ ] 9.4 `pnpm typecheck` — 通過
- [ ] 9.5 `pnpm test` 全套 — 前後端皆綠。既有 `scoreboard` 測試須**全數原樣**通過；`player-roster` 除 §6.3 改名並擴充斷言的那一個 it 外無迴歸；M5 的 `match-stage` 測試除 §8.5 更新的那一個 it 與新增的一個 it 外無迴歸（**這三處是本 change 唯一容許變動的既有測試**，其餘既有測試若轉紅一律視為迴歸）
- [ ] 9.6 `pnpm test:e2e` 全套 — 五個 browser project 全綠。既有 `scoreboard.spec.ts` 必須**原樣**通過（證明獨立用法零行為變更）
- [ ] 9.7 `pnpm --filter ./nextjs-pickball preview` — workerd runtime 下開啟 `/scoreboard` 與 `/scoreboard?match=<id>` 皆正常，無 console error
- [ ] 9.8 Rollback 相容性實測（design Migration Plan 要求，不得只憑推論）：以本次變更**前**的 `ScoreboardStateSchema` 解析一份含 `matchId` 欄位的資料，確認 zod 剝除未知欄位而非拒絕；結果如實記錄於此，若為拒絕則 MUST 更新 design.md 的 Rollback 段並提出補救
- [ ] 9.9 `DO_NOT_TRACK=1 openspec validate matchmaker-scoreboard-binding --strict` — 0 error
