# Matchmaker M3～M9 apply 執行手冊（runbook）

> 給下一個接手的 coordinator agent。目標：把 openspec 的 7 個 matchmaker change
> 依相依順序全部跑完 `/opsx:apply` 並逐一合併回本機 `main`。
>
> **本檔內有多處寫於不同時間的段落。凡與「狀態快照」或「M6～M9 的執行順序」牴觸者，
> 一律以那兩節為準。** 特別注意：舊段落多處寫「M6～M9 四個平行」，
> **那是已被推翻的計畫**，現行決定是嚴格序列 M6 → M7 → M8 → M9。

## 狀態快照（最後更新 2026-08-29）

| 項目 | 值 |
|---|---|
| `main` HEAD | `e363bb0`（docs：更新 M6 中斷點） |
| M3 | **完成並已合併**。20/20，Final Review PASS。worktree 與分支已 teardown |
| M4 | **完成並已合併**。62/62，Final Review PASS_WITH_NITS、0 Blocker。跑了**兩位 leader** |
| M5 | **完成並已合併**。66/66，16 個 commit。跑了**兩位 leader**。worktree 與分支已 teardown |
| M6 | **進行中，已依使用者指示暫停**（2026-08-29）。**71/78**。見下方「M6 中斷點」 |
| M7～M9 | 未開始。**順序固定 M7 → M8 → M9**，理由見下方 |

## 🔖 M6 中斷點（2026-08-29，使用者要求暫停）

| 項目 | 值 |
|---|---|
| Worktree | `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-scoreboard-binding`（**保留，未拆**） |
| Branch | `change/matchmaker-scoreboard-binding`（**保留，未刪**） |
| Base | `main` @ `3fefb02` |
| HEAD | `cf4fe79`（docs：落盤 §7 Stage 2 審查結論與等價變異判定） |
| 進度 | **71/78 勾選、97 個 commit** |
| 工作區 | ⚠️ **不乾淨**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts` 有 195 行未提交 |
| 已完成 | §0～§7、M36 方向對齊、courtNumber delta，**全部含 Stage 1 + Stage 2 審查** |
| 中斷於 | **§8.1**（e2e RED 測試寫到一半） |
| 跑過幾棒 | **七棒**（第七棒剛啟動即被使用者喊停） |

### ▶️ 續跑起點：§8.1

接手 leader 的**第一件事**是盤點那份未提交的 diff：

```bash
cd /Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-scoreboard-binding
git diff nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts
```

內容是 8.1 要求的三個 e2e test，**test 名稱與 tasks.md 逐字相符**（coordinator 已核對）：
`計分中的場次顯示計分中標示與當前比分`、`未完成的計分進度可離開後再進入接續`、`多場地同時計分時各場進度互不覆蓋`。
**但它未經任何審查、也未確認紅燈** —— 接手者 MUST 自行實跑判定，不可直接採信。

剩餘工作：**§8（10 task）→ §9（9 task）→ Final Code Review**。

### ⚠️ 兩次工具層停擺的教訓（務必寫進派工單）

1. **`EMFILE: too many open files` 打斷了第六棒。** 根因是 worktree 累積 **9 個殘留 dev server process**
   （兩組 `wrangler dev` 互搶 `:8787`、一組 `next dev`、四個 `workerd`）。
   派工單 MUST 要求：跑 E2E／preview **之前**先 `lsof -i :3005 -i :8787` 與
   `ps aux | grep -E "wrangler|workerd|next"` 查殘留並全數 kill；**跑完立刻清掉自己起的 process**。
2. **第四棒派出 subagent 後結束回合，鏈斷了 7 小時 16 分。**
   已列為硬規則：**派出 subagent 之後不可以結束回合**；脈絡將盡就在**派工之前**乾淨停止並落盤。
   第五棒示範了正確做法 —— 遇到需人類裁決的事，停在派工**之前**回報。
3. **coordinator 的停擺偵測門檻要放寬到 3 小時。** leader 的 transcript 寫入是爆發式的
   （等 subagent 時完全不寫），45 分鐘與 75 分鐘門檻都實測誤報過。

### 🔑 Stage 2 獨立 mutation ——「自述不可採信」已七度實證

| 群組 | Implementer 自述 | Stage 2 獨立實測 |
|---|---|---|
| §1 | 6 次 / 1 存活 | 27 組 / **9 存活** |
| §3 | 8 次 / 1 存活 | 35 組 / **10 存活** |
| §4 | 8 次 / 1 存活 | 31 組 / **12 存活** |
| §5 | 10 次 / **0 存活** | 40 組 / **13 存活** |
| §6 | 6 次 / **0 存活** | 35 組 / **10 存活** |

**最嚴重缺口每次都是「分支或欄位零覆蓋」與「多筆同時符合零覆蓋」，不是斷言太弱。**
派工單要求 Stage 2 **逐分支機械盤點覆蓋率**，不要只加強既有斷言。
§6 另抓到一條**恆真斷言**（`toEqual` 兩邊是同一物件參考，零偵測力）——
要求 Stage 2 一併檢查斷言兩邊是否為同一參考。

### 已核可、不得重新討論的裁決

1. **`MatchSlotsSchema` 移除**（commit `a783873`）。命名契約已同步更新。
2. **`writeMatchSlot` 簽章收斂**為由 `state.matchId` 推導（§3 已完成）。
3. **`hasLocalStorage()` 收斂**為新增葉節點 `lib/scoreboard/storage-keys.ts`（§3 已完成）。
4. **`MATCHMAKER_ROUTE` 補匯出**：在 `lib/matchmaker/section-nav.ts` 新增一行
   `export const MATCHMAKER_ROUTE = "/matchmaker"`，再讓 `MATCHMAKER_SECTION_HREFS` 由它組成，行為零變更。
   合併衝突不會發生 —— M6 排合併順序第一位，M7／M8 從已含 M6 的 `main` 開分支。
5. **M36 方向對齊**：`isTargetScoreLocked` 第一條由 `=== "completed"` 改為 `!== "pending"`（已完成）。
6. **courtNumber delta（coordinator 2026-08-28 裁決 (A)）**：`ScoreboardStateSchema` 新增
   `courtNumber`（`.nullable().default(null)`），納入 `MatchSettings`／`createInitialState`／`settingsOf`，
   由 `buildMatchSlotSeed` 帶入。依據：`specs/scoreboard/spec.md:18` 的「向後相容策略」**明文預先授權**
   以 `.default()` 新增欄位且不得 bump storage key；spec:25 的「保存內容**含**…」是非窮舉表述；
   場地編號由對戰頁寫進 seed，**design Decision 2 的單向相依完全不受損**。
   否決 (B)（刪 MUST）—— 會讓 `prd.md` 13.4 的多場地辨識手段消失。
   **裁決同時決定不重跑 §2／§4 整組審查**，改為對 delta 做完整 TDD + scoped Stage 1／Stage 2。

### §8 開工前就該知道的事（從 tasks.md 複製，勿憑記憶）

- **8.2**：點擊入口時先 `ensureMatchSlot` 再導向 `/scoreboard?match=<matchId>`，**順序不可對調**。
- **8.4**：reconcile 以「回合已 hydrate」為觸發條件，**不用獨立的 mount effect**（design Risks）。
- **8.6**：`setTargetScore` **目前仍是懸空的純函式**（`lib/matchmaker/round.ts:352` 有定義，M5 未接上
  任何非測試呼叫端）。MUST **先於 `hooks/useRoundStore.ts` 新增 `setTargetScore(targetScore)` 動作**
  （比照 `resetIncompleteMatches` 的「呼叫純函式 → 判 `ok` → dispatch」形態，**屬行為邏輯、必 TDD**），
  再由 `app/matchmaker/page.tsx` 以 prop 傳給 `RoundControls`。
- **8.7／8.10／8.11**：若寫下當下即綠，**如實標註 regression guard 並補 mutation 驗證**，
  SHALL NOT 為了製造紅燈而先破壞它們。
- **8.10 是第六棒補上的遺漏錨點**（前五棒的 tasks.md 中 §7、§8 皆未涵蓋）。

### §9 收尾驗證的三個陷阱

- **9.2 必須用 root `CLAUDE.md` 指定的 python 計數法**，**不得用** BSD `uniq`
  （macOS 的 `uniq` 會把內容不同的中文標題誤判為重複）。
- **9.5**：本 change **唯一容許變動的既有測試只有三處**（§6.3 改名的 `player-roster` it、
  §8.5 更新的 `RoundControls` it、§8.5 新增的一個 it），其餘既有測試轉紅**一律視為迴歸**。
- **9.6 E2E 必須帶 `--workers=1`**；既有 `scoreboard.spec.ts` 必須**原樣**通過。
- **9.8 Rollback 相容性必須實測**，不得只憑推論。

### §7 落盤的三個坑（已處理，記錄供追溯）

1. soft navigation 會讓綁定 hook 卡死 → 用 `key={matchId ?? "standalone"}` 強制 remount。
2. 合法場次會先閃一幀失效畫面 → 需「尚未判定」呈現狀態。
3. §4 遺留 3 個可接受的存活 mutation（假設性 guard，spec 未要求）—— 已裁決不加。

### §1 Stage 2 的歷史教訓（保留供追溯）

`readMatchSlots()` 的「解析成功但不是物件」分支曾**零覆蓋**：既有測試用 `"{{{"`，
那會在 `JSON.parse` 就拋錯而走 catch 分支，所以 `Array.isArray(parsed)` 這道 guard 從未被執行過。
spec 逐字寫著「不是合法 JSON（**或解析後不是物件**）」，`"[]"` 這類 JSON 陣列正是該 guard 存在的唯一理由。

⚠️ **分支基底停在 `3fefb02`，而 `main` 已前進四個 commit**
（`f0bf406`、`a395174`、`36cb52d`、`7087508`、`e363bb0`）。全是 docs-only，**無程式碼衝突風險**，未做 rebase。

Baseline（§0 回填進 `environment.md`）：前端 54 檔／410 測試、後端 4 檔／16 測試全綠，
`Initial commit hash` = `3fefb02`。§7 完成時實測：56 檔／460+ 測試全綠、`tsc` exit 0、
`openspec validate --strict` 通過。

**續跑方式**：worktree 已存在，**不要重開、不要重跑 `pnpm install`、不要重建 baseline**。
派一位 opus leader，接續點為 **§8.1**（先盤點那份未提交的 diff）。

### 七棒跑下來確認有效的做法（續跑時保留）

- **編輯器診斷在 worktree 內大量謊報**（整批 `Cannot find module 'react'` 之類）。
  一律以 `pnpm -r exec tsc --noEmit` 的 exit code 為準，本輪實測 exit 0。
  唯一可信的例外是「單一新檔的單一 import 解不到」——那是 TDD 紅燈，是真的。
- **Implementer 自測 mutation 有效，但遠遠不夠。** §1 的對照極清楚：
  Implementer 自測 6 次找到 1 個存活；Stage 2 獨立測 27 次找到 **9** 個。
  自測抓到的是「自己想得到的那種」，抓不到的正是自己的盲點。
  **兩層都要，不能省任何一層。**
- **授權 Stage 2 直接動手改小東西。** 第二棒在派工單裡明文授權：
  dead export 若判定移除就直接改好、mutation 存活項自行補斷言。
  這偏離 execution-plan 對 reviewer 的純審查定位，但省下一輪派工成本，
  且改動範圍極小、可驗證。**建議延用，但要求在回報的「偏離」欄如實記載。**

### M5 合併後的 `main` 品質基線（coordinator 獨立實測，非採信回報）

```
前端單元   54 檔 / 410 測試 passed      （M4 時為 46 檔 / 358）
後端單元   4 檔 / 16 測試 passed        （未動）
tsc        pnpm -r exec tsc --noEmit → exit 0
lint       0 errors / 3 warnings       （hooks/ 下三支既存檔，非本批造成）
E2E        playwright --workers=1 → 244 passed / 21 skipped / exit 0
```

**E2E 必須帶 `--workers=1`**。預設併發下本機不穩定，M5 的 leader 實測三次、每次失敗集合都不同，
第三次甚至打到該 change 從未觸碰的 `scoreboard.spec.ts`。根因是 Turbopack dev 的延遲 chunk 競態。

**一項與既有 agent-memory 不符的發現（待後續 change 修正）**：memory 記載「從未看過關鍵首屏
bundle 載入失敗」，但 M5 期間失敗的正是第一方 chunk `app_layout_tsx`；而
`tests/e2e/specs/player-roster.spec.ts` 的 ChunkLoadError 噪音濾除只列舉了
`hmr-client|global-error` 兩個名字，需放寬該 regex。M5 未改該檔（不在其 Modified capability 內）。

### M5 留下的三項已知缺口（記在 change 的 design.md Open Questions 第 6～8 條）

1. `page.tsx` 未消費 `droppedCount`。
2. 「重設／再排」在 E2E 零覆蓋。
3. `round.matches` 為空時畫面無說明文字。

### 規模與 leader 接力

M4（62 task）耗掉兩位 leader 的脈絡，M5 有 **64 task／12 群組**，**預期同樣需要接力**。
派 leader 時務必要求：脈絡將盡就在派下一組之前乾淨停止，把狀態寫進 `design.md` 的
`## Open Questions`（格式照 `matchmaker-round-lifecycle/design.md` 第 5 項）再 commit 後回報。
**「派工後無法審查」比停下來更糟。**

### 累積下來的派工經驗（每張派工單都要帶）

0. **Implementer 交件前 MUST 自己先跑一輪 mutation 測試**（2026-08-24 加入）。
   M5 的 §2、§3 **兩組都在 Stage 2 被退回，而且是同一個原因**——斷言密度不足。
   §2：8 次 mutation、3 次存活；§3：16 次、6 次存活。那兩個 Implementer 在被要求修正時
   都有能力自己做 mutation 驗證，**這一整輪退回本來可以省掉**。派工單裡要求它列出
   「做了幾次、每次改什麼、是否轉紅」，有任何一次存活就先補斷言再交件。
   **Stage 2 的 Reviewer 仍要獨立再做一次，不採信 Implementer 的自述。**
1. **要求 Stage 2 Reviewer 自行加做 mutation 測試並回報存活數。** M4 §6 做了 14 次、12 次存活；
   §8 做了 9 次、9 次全存活（整段接線刪光仍全綠）。這是目前抓出真問題最有效的手段。
2. **紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗。** M4 §3 出過一次：Implementer 宣稱真紅燈，
   實際上實作在更早的 commit 就已提交。查核不過就更正為 regression guard 並補 mutation 驗證。
3. **註解只寫「為什麼」**，不重述函式名、不誤植 milestone 編號。M3 與 M4 都因此反覆退回。
4. **Implementer 用 `sonnet` 不用計畫預設的 `haiku`。** M4 §1 的 haiku 連續兩輪被退回
   （失效的假測試、複述式註解），每次退回要付一次 opus 審查成本，反而更貴。
   這是刻意偏離 execution-plan，要求 leader 在回報的「偏離」欄如實記載。
5. **worktree 內的編輯器／IDE 診斷不可信**（2026-08-24 M6 加入）。常整批謊報
   `Cannot find module 'react' / 'vitest' / '@/lib/...'` 與大量 JSX implicit any。
   一律以實跑 `pnpm -r exec tsc --noEmit` 的 exit code 為準。
   唯一可信的例外是「單一新檔的單一 import 解不到」——那是 TDD 紅燈，是真的。
6. **要求 leader 逐 task commit（`test:` 一個、`feat:` 一個），不要一組一個 commit。**
   M6 的第一棒自發這樣做，效果很好：每次紅燈獨立留在版控裡，
   coordinator 可用 `git show <commit>^:<path>` 直接複驗，完全不必採信回報。

> 註：`quick-rating-spec-backfill` 這個 change 不在本輪範圍
> （使用者指定只跑 7 個 matchmaker change）。

### M3 留給 verify／archive 的三個備註

1. archive 時 `git diff` 會顯示 M4～M9 的 artifact 有差異，那是分支分歧造成的，**M3 沒有任何 commit 觸及它們**，不要收進 M3 的變更。
2. §7.3 把「多重違規時拋出哪一條」的優先序由類別優先改為位置優先。拋錯與否的判定集合未變，spec 也未規定優先序，已在 tasks.md 留痕，**不要當迴歸重查**。
3. `design.md:103` 有個過期數字：宣稱 `4.15 - 4.00` 在 IEEE754 下是 `0.1499999999999999`，實測為 `0.15000000000000036`。論點仍成立，sync-specs 時順手更正即可。

### commit footer 慣例調整

runbook 原寫 `Claude-Session: <當前 session 的 URL>`，但本機 CLI session 取不到 claude.ai URL。
自 M3 續跑起改為**直接填 session id**（例如 `Claude-Session: 00e6ff12-c336-4035-af31-74fc042cb67e`），
**不要自行編造 URL**。新 session 接手時換成自己的 `CLAUDE_CODE_SESSION_ID`。

## Pipeline 總覽

```
M3 ──merge──> main ──> M4 ──merge──> main ──> M5 ──merge──> main
                                                             │
                                                             v
        M6 scoreboard-binding ──merge──> main ──> M7 history-page ──merge──> main
                                                             │
                                                             v
        M8 data-transfer ──merge──> main ──> M9 visual-export ──merge──> main
```

**全程嚴格序列，一次只開一個 worktree。** 早期計畫寫「M6～M9 四個平行」，
2026-08-24 的預檢與實測推翻了它，理由見「M6～M9 的執行順序」一節。

硬相依（各 change 的 environment.md 明寫，不可跳過）：
- M4 開分支前 M3 必須已合併回 `main`（M4 直接 import M3 的 `updateRatings`）。
- M5 需要 M4 在 `main` 上；M6～M9 需要 M5 在 `main` 上。
- **M8 需要 M6 在 `main` 上**（直接 import M6 的 `MATCH_SLOTS_KEY`，否則 `tsc` 失敗）。
- M7 與 M8 都要改 `lib/matchmaker/section-nav.ts`，序列跑才不必解衝突。

## 模型規定（使用者硬性要求）

- 每個 change 由**一個 opus leader**（`Agent` tool、`subagent_type: general-purpose`、`model: 'opus'`）執行。
- leader 派工的 subagent 依該 change `execution-plan.md` 的 Roles，但有一項**常設覆寫**：
  **Implementer 一律用 `sonnet`，不用 execution-plan 預設的 `haiku`**（理由見下方派工經驗第 4 條）。
  Spec Reviewer `sonnet`、Code-Quality／Final Reviewer `opus`，升級照 Escalation 規則。
- **每次 Agent 呼叫都必須明確帶 `model` 參數；任何情況不得使用 `fable`**（fable 只允許
  當 coordinator，不做實作）。

## 執行模式（兩制並存）

- **M3**：原「逐 task」制——一 task 一個全新 subagent，逐 task 過 Stage 1 + Stage 2。
- **M4～M9**：commit `83f412c` 起改為「**逐組**」制——派工單位是 tasks.md 的 `§` 群組，
  一組一個 Implementer 做完整組（組內仍逐 task 真紅燈 TDD），Stage 1／Stage 2 整組審，
  群組間仍序列。細節都寫在各 change 的 `execution-plan.md`，leader 照著跑即可。

## 各 change 清單

| # | change id | worktree（`/Users/m2_24gb/Desktop/project/pickball-worktrees/` 下） | branch | base 前提 | 狀態 |
|---|---|---|---|---|---|
| M3 | matchmaker-rating-engine | ~~matchmaker-rating-engine~~（已拆） | ~~change/matchmaker-rating-engine~~（已刪） | main（已滿足） | **apply 完成並已合併**，待 verify／archive |
| M4 | matchmaker-round-lifecycle | ~~matchmaker-round-lifecycle~~（已拆） | ~~change/matchmaker-round-lifecycle~~（已刪） | M3 已合併回 main | **apply 完成並已合併**，待 verify／archive |
| M5 | matchmaker-match-stage-ui | ~~matchmaker-match-stage-ui~~（已拆） | ~~change/matchmaker-match-stage-ui~~（已刪） | M4 已合併回 main | **apply 完成並已合併**，待 verify／archive |
| M6 | matchmaker-scoreboard-binding | matchmaker-scoreboard-binding（**已存在，勿重開**） | change/matchmaker-scoreboard-binding | main @ `3fefb02`（已滿足） | **apply 進行中，已暫停於 71/78**。見「M6 中斷點」 |
| M7 | matchmaker-history-page | 尚未建立 | change/matchmaker-history-page | **M6 已合併回 main** | 未開始 |
| M8 | matchmaker-data-transfer | 尚未建立 | change/matchmaker-data-transfer | **M6 與 M7 都已合併回 main** | 未開始 |
| M9 | matchmaker-visual-export | 尚未建立 | change/matchmaker-visual-export | **M6～M8 都已合併回 main** | 未開始 |

## 接續步驟

> ⚠️ 第 1、2 節是 M3 執行期間的歷史指示，**已全部完成**，保留僅供追溯。
> 恢復時直接看第 3 節（M6～M9）與下方「M6～M9 預檢結果」。

### 1. 續跑 M3（不要重開 worktree）

啟動一個 opus leader，prompt 用下方模板，並額外告知續跑脈絡：

- worktree 已存在且乾淨，HEAD `afaefe9`；**先讀 tasks.md 勾選狀態與 `git log main..HEAD` 對齊現況**。
- 接續點：**§7 的 Stage 2 品質審查已跑完，判定 FAIL，2 項 blocking**（審查於中斷後
  完成，結果如下）。續跑順序：修 blocking → §7 Stage 2 重審 → 7.3 REFACTOR →
  勾 7.1～7.3 → §8（8.1 純函式契約測試；8.2 若實測全綠照 tasks.md 規則標 skipped）→
  Final Code Review（完整 `pnpm test`、`pnpm -r exec tsc --noEmit`、
  `pnpm --filter ./nextjs-pickball lint`）。
- M3 用**逐 task 制**（不是逐組制）。

**§7 Stage 2 的 2 項 blocking（派 Implementer 修，模型 sonnet 起跳）**：

1. `rating.ts` 四個 assert 函式的註解逐字重述函式名，違反「註解寫為什麼」規則。
   要照 design Decision 8／9 改寫各自的 why：`assertValidTeamSize`＝人數錯會讓
   `sum / playersPerTeam` 除數錯、分數靜默失真不拋錯；`assertValidRatings`＝8.01 若
   不擋會被 clamp 偽裝成正常觸界（`clamped: true`），M5 會顯示錯誤狀態；
   `assertValidGamesPlayed`＝負值使 `effectiveK` 除以零產生 Infinity/NaN、非整數產生
   不可能的中間 K_eff；`assertNoDuplicateIds`＝重複 id 使 `changes` 兩筆、M4 寫回時
   後筆靜默覆蓋前筆（是 M4 接線錯誤的早期警報）。
2. 驗證訊息的兩條測試斷言（`toThrow(/隊伍人數.+2/)` 等）鎖不住 spec 的三項 MUST
   （實測連舊的不合規訊息都能通過）。改為定位式斷言：singles 斷
   `/隊伍人數需為 1 人/` 與 `/目前輸入：2 人/`，doubles 鏡像對應。
   **必須先修這條再做 7.3 的訊息模板集中**，否則搬模板時互換 bug 測不到。

7.3 REFACTOR 的既列建議：四類驗證合併為單一 `assertValidInput`（資料只走訪一次）、
訊息模板抽 helper、`assertValidTeamSize` 改 for-of 消掉寫死的 2、`playersPerTeam`
只算一次。中斷當下品質狀態：全套 296 test 綠、tsc 綠、lint 僅 3 個既存 warning。

### 2. 驗證並合併 M3

leader 回報 Final Review 全綠後，在主 repo（`/Users/m2_24gb/Desktop/project/nextjs-pickball`）：

```bash
git merge --no-ff change/matchmaker-rating-engine \
  -m "feat(matchmaker): 合併評分引擎（PRD 6.4）" \
  -m "Claude-Session: <當前 session 的 URL>"
```

沿用 M2 的合併慣例（`d8a23ee`：--no-ff、Conventional Commits、繁體中文）。**只動本機 main，不 push。**
合併後依該 change `environment.md` 的 Teardown 拆 worktree 與分支。測試不綠就**不合併**，回報使用者。

### 3. 每開一個新 change 的標準流程（M7、M8、M9 各走一次）

⚠️ **一次只開一個。前一個合併並 teardown 之後才開下一個。**

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/<change-id> -b change/<change-id> main
```

然後用下方模板啟動 opus leader（走逐組制，模板中的單檔測試路徑與唯讀檔案清單
換成該 change execution-plan.md 寫的內容）。完成 → **coordinator 獨立驗證**
（`pnpm test`、`pnpm -r exec tsc --noEmit`、lint、E2E 帶 `--workers=1`）→
`--no-ff` 合併回本機 `main`（**不 push**）→ 依 environment.md teardown → 更新本檔 → 下一個。

測試不綠就**不合併**，回報使用者。

## Leader prompt 模板

> 佔位符：`<change-id>`、`<Mn>`、`<capability>`（specs/ 下的目錄名，見該 change 的 specs/）。
> M3 用逐 task 制敘述；M4 起把第 4 點換成「照 execution-plan.md 的逐組制執行」。

```
你是 openspec change `<change-id>`（<Mn>）的 apply 階段 leader。你的工作：在指定
worktree 內，依 /opsx:apply 流程與該 change 的 execution-plan 把全部 task 做完
（TDD、依 execution-plan 派 subagent、兩階段審查、Final Code Review），全部 commit
在 change 分支上，最後回報。

## 環境（已就緒，不要重建）
- 主 repo：/Users/m2_24gb/Desktop/project/nextjs-pickball（禁止改動這裡的任何檔案）
- Worktree：/Users/m2_24gb/Desktop/project/pickball-worktrees/<change-id>，
  branch change/<change-id>。worktree 與 branch 已建立，不要另開 worktree。
- 所有檔案讀寫、指令執行一律在 worktree 內（Bash 起始 cwd 是主 repo，每條指令用
  絕對路徑或先 cd 到 worktree）。

## 流程
1. 讀 worktree 內的 .claude/commands/opsx/apply.md，照它的步驟執行，change 名稱固定
   為 <change-id>。openspec CLI 在 worktree root 執行並帶 DO_NOT_TRACK=1。
2. Step 0：worktree 內跑 pnpm install，再跑完整 pnpm test 取得 baseline，回填
   openspec/changes/<change-id>/environment.md 的 Verification 欄位。後端測試若噴
   listen EPERM 127.0.0.1 是沙箱擋 localhost，放行重跑再判定，不是設定錯誤。
3. 完整讀取 change 的所有 artifact（proposal、design、test-plan、tasks、
   execution-plan、environment、specs/**）。
4. 嚴格照 execution-plan.md 執行派工、兩階段審查、Escalation 與 Final Code Review；
   派工時遵守 contract：要求的內容全部貼完整原文給 subagent，不可只給路徑；照
   「不給」清單限制脈絡。群組／task 之間序列執行，禁止平行派 Implementer。

## 模型規定（使用者硬性要求）
- 你自己跑在 opus。每次呼叫 Agent tool 必須明確帶 model 參數，值依 execution-plan
  的 Roles（Implementer 預設 haiku、Spec Reviewer sonnet、Code-Quality／Final opus，
  升級照 Escalation）。任何情況不得使用 fable，也不得省略 model 參數。
  subagent_type 用 general-purpose。

## 專案硬規則
- TDD 三步：先寫失敗測試並在 shell 實際看到紅燈（輸出留存）→ 最小實作至綠 →
  refactor。單檔測試 pnpm --filter ./nextjs-pickball test --run <測試檔路徑>，
  --run 前不可加 --。
- 紅燈要是真的：寫入當下就綠的 it 如實標註 regression guard；嚴禁改斷言偽造紅燈。
- 測試檔顯式 import { describe, it, expect } from "vitest"；型別匯入用 import type；
  註解與錯誤訊息用繁體中文（台灣用語），程式碼識別字用英文。
- PostToolUse hook 會對前端檔自動跑 ESLint，exit 2 擋下時先讀 lint 輸出修正。
- tasks.md 的 checkbox 完成一個勾一個；commit 粒度照 apply.md／schema instructions。
- Commit 訊息：Conventional Commits、繁體中文，結尾加 footer
  Claude-Session: <當前 session 的 URL>，不得加 🤖 Generated 或 Co-Authored-By。

## 禁止事項
- 不得合併回 main、不得 push、不得跑 verify/archive、不得拆 worktree。
- 不得修改 openspec/specs/ 主 spec（除非 execution-plan 明列例外的那個群組）。
- 不得修改 execution-plan 列為唯讀的既有檔案。
- 卡住超過 30 分鐘：停止，把阻塞原因寫進 design.md 的 ## Open Questions，commit 後回報。

## 回報格式
① 每個 task／群組狀態（含 regression guard 標註與原因）② Final Code Review 實際
結果（pnpm test、tsc、lint）③ 分支上所有 commit（hash + subject）④ 與
execution-plan 的偏離 ⑤ 未解問題或阻塞。
```

## prd.md 處置決定（2026-08-23，使用者拍板）

**不刪除 `prd.md`，改為歸檔。** 七個 change 全部合併並 archive 之後，把 `prd.md` 移到
`docs/`，頁首加註「已被 openspec 取代」（沿用 `docs/superpowers/` 既有慣例）。

理由：change 文件與 commit 訊息大量引用「prd.md 5.1」「PRD 6.4」這類**章節編號**，
刪檔會讓這些引用失去對象。至於 **M 編號不受影響**——`prd.md` 內完全沒有 M 字樣，
M1～M9 的對照表寫在每個 change 的 `proposal.md` 開頭，刪不刪 prd 都查得到。

**此動作在全部 change 完成後才執行**，現在不要動 `prd.md`（它仍是進行中 change 的需求來源）。

## ~~⛔ 停止點~~（已解除，使用者 2026-08-24 指示續跑 M6～M9）

停止點原為「做到 M5 完成就停」，使用者檢視後已指示續跑，並要求**每完成一段就把狀態寫回本檔**。

### M6～M9 的執行順序（硬性，不可調換）

**M6 → M7 → M8 → M9，逐一 apply、逐一合併，不平行開 worktree。**

理由（全部實測，非推測）：

1. **M8 必須在 M6 之後**——M8 的 `CLEAR_ALL_KEYS` 直接 `import` M6 的 `MATCH_SLOTS_KEY`，
   M6 未合併時 `tsc` 會失敗。已在文件修正中把原本的「若已合併就納入」改成硬前置。
2. **M7 與 M8 會在 `lib/matchmaker/section-nav.ts` 正面衝突**（兩個常數 + 一支測試）。
   序列跑則第二個接手時直接看到第一個的分頁，不需解衝突。
3. **M9 排最後**——它要驗證 `@media print` 有沒有正確隱藏 M7／M8 新加的分頁。

M6 有 **78 個 task／10 個群組**（比 M5 的 64 還大），**預期需要 leader 接力**。

M5 合併後 `/matchmaker` 才會存在（在此之前是 404）。檢視方式：`pnpm dev` 後開
`http://localhost:3005/matchmaker`（前端在 **:3005** 不是 3000）。

## ✅ M5 §11 E2E 三條必測——已於 §11 完成後由 coordinator 逐條實測確認覆蓋

2026-08-24 查核結果（不是採信回報，是實際 grep 程式碼與測試檔）：

1. **鎖定時方向鍵不改變目標分數** → `components/matchmaker/RoundControls.test.tsx:320` 的
   integration 測試（`fireEvent.keyDown` 直接對容器派發），**外加 :342 的未鎖定對照組**——
   有對照組才證明測到的是「鎖定」這個條件本身，而不是「反正什麼都沒發生」。
   E2E 路徑不可達（鎖定時三顆 radio 皆 disabled，鍵盤焦點進不了容器），改由 integration 覆蓋是正解。
2. **roving tabindex** → `tests/e2e/specs/match-stage.spec.ts:377-402`。
   同時斷言選中項為 `0` **與其餘兩項為 `-1`**，且**移動前後各驗一次**。
   這正好堵住 §7 Stage 2 變異 N8 暴露的縫隙（`aria-checked` 與 `tabIndex` 取用不同來源）。
3. **方向鍵頭尾循環** → 演算法本身在 `lib/scoreboard/radio-navigation.test.ts:28`（尾端循環回第一個）
   與 `:33`（開頭循環到最後一個）；接線則由 `RoundControls.tsx:81` 實際呼叫
   `nextRadioIndex(currentIndex, TARGET_SCORE_OPTIONS.length, event.key)` 確認為真重用、非重新實作。

**殘留的窄缺口（不阻擋，僅記錄）**：若有人把第 81 行換成內聯的非循環索引運算，現有測試全部會綠——
只有邊界案例（在 `21` 按 ArrowRight 應回到 `11`）能抓到。判定為可接受：呼叫點與 import 就在眼前，
且該演算法在自己的測試裡兩個方向都覆蓋了。日後若 `RoundControls` 的鍵盤邏輯要改寫，先補這條邊界測試。

## ~~M5 §11 E2E 的三條必測~~（已結案，見上）

`RoundControls` 的三個行為**在整個 change 內沒有任何一層測試保護，全部押在 §11 E2E**。
§7 的 Stage 2 Reviewer 連續兩輪標註此事（對應變異 R11／R12／R32／R33／N8）。
這不是 §7 斷言不足，是 execution-plan 刻意的分工（「實作在 §7、驗收在 §11」），
但**若 §11 沒補，這三條就是全裸的**：

1. **鎖定時按方向鍵，目標分數不變**——守住實作的 `if (locked) return;`。
2. **roving tabindex 只有選中項為 `0`**——變異 N8 實證：`aria-checked` 與 `tabIndex` 取用不同來源時，單元測試完全抓不到。
3. **方向鍵在頭尾循環**——守住 design Decision 6 重用 `nextRadioIndex` 這個決定。

§11 的 leader MUST 逐條確認這三項有 E2E 覆蓋；若 tasks.md 的 §11 沒列出對應項目，回報而不要自行擴權。

## M6～M9 預檢結果（2026-08-24，四個平行讀者 + 整合分析）

**結論：runbook 原本那句「各 change 已設計成互不改同檔，理論上無衝突」不成立。**
合併風險評為 **HIGH**。

> 📌 本節寫於 M5 尚未合併時，當時的結論是「仍可平行開發、但不能照現況開四個 worktree」。
> **後續的文件修正與實測把它收斂為「嚴格序列」**——見「M6～M9 的執行順序」一節。
> 以下保留原分析供追溯，但**不要照這裡的「四個平行」執行**。

### 阻擋條件（已滿足，2026-08-24 M5 已合併）

M6／M7／M8／M9 的 `environment.md` 與 tasks §0 全都明文要求「`main` 必須先含 M5，否則立即停止」。

### 合併順序必須是 M6 → M7 → M8 → M9（不可任意調換）

**M8 若排在 M6 之前會產生 git 偵測不到的資料殘留 bug**——這是評為 HIGH 的主因。
M8 的 `CLEAR_ALL_KEYS` 有一個「若 M6 已合併則納入分槽 key」的條件句；M8 先合併時該條件走 false，
`scoreboard:matches:v1` 不會進清單，使用者按「清除本機資料」後分槽計分進度會殘留。
**merge 全綠、測試全綠，但行為是錯的。**

其餘順序理由：M8 排 M7 之後，讓它 rebase 時一次處理「保留 M7 的連結 + 補自己的連結 +
對照 M6 的 `RESET_KEYS` 補齊 `CLEAR_ALL_KEYS`」（兩份「全部 key」清單要人工比對，git 不會提醒）。
M9 最後，它改同一頁面的另一段，還要驗證 `@media print` 是否正確隱藏 M7／M8 新加的連結。

### 唯一的真實檔案衝突點（2026-08-24 實測修正，原判斷是錯的）

**原本寫「集中在 `app/matchmaker/page.tsx`」——實測後推翻。** M5 合併後的導覽形狀是：

```
lib/matchmaker/section-nav.ts        ← 分頁清單與文案的單一來源（純函式，必 TDD）
  MATCHMAKER_SECTION_HREFS   :13     ← 陣列，M7 加「歷史」、M8 加「資料」
  MATCHMAKER_SECTION_LABELS  :15-21  ← 對照表，同上
     ↓
components/matchmaker/MatchmakerTabs.tsx  ← 只 tabs.map() 渲染，不含清單
     ↓
app/matchmaker/layout.tsx :14             ← 掛一份，對戰頁與參賽者頁共用
```

`app/matchmaker/page.tsx` **全檔沒有任何 `<Link>`**。因此：

- **真正的衝突點是 `lib/matchmaker/section-nav.ts` 的兩個常數，加上 `section-nav.test.ts`。**
  後者第 31～36 行有個 `toEqual` regression guard 釘死「分頁清單依序為對戰與參賽者兩筆」，
  M7 與 M8 各自新增分頁時都會讓它轉紅（**那是真紅燈**）。解法是保留雙方分頁，
  **順序約定為 對戰／參賽者／歷史／資料**。
- **M9 完全不衝突**：它掛在 `page.tsx` 的 `<main>` 內，與導覽不同檔。
  原本 design 寫「合併衝突的預估面積是 `page.tsx` 的 import 區塊」，已修正。
- **M6 也不衝突**：它動的是 `RoundControls.tsx` 與 `CourtCard.tsx`。
- ⚠️ `section-nav.ts` 屬 `lib/**`，是**必 TDD 的行為邏輯**，不是例外層。
  M7 與 M8 原本都把它歸在「例外層加一個 `<Link>`」，已修正。

正面訊號：四個 change 都刻意不新增 `hooks/` 檔案，因此**沒有任何一個要動
`pickleball-guide-page` 的 hooks 歸屬清單**——最容易撞在一起的 spec 段落被成功避開了。
E2E 也各自獨立成檔，無共用 helper 衝突。

### ✅ 文件修正——已於 2026-08-24 完成並 commit（原七項重新核對後擴為 44 項）

M5 合併後重新核對，原本的七項有 **6 項仍成立、1 項方向相反**，另外挖出 37 項同源或連帶的問題。
全部已修正並通過 `openspec validate --all --strict`（17/17）。逐項細節見該 commit 的 diff。

| change | 修了幾項 | 最要緊的是什麼 |
|---|---|---|
| M6 | 14 | ① 重置 key 清單指錯檔案（`storage-keys.ts` → `storage.ts` 的 `RESET_KEYS`），**同一個錯有 4 處**；② Requirement 標題「刪除場次」描述不存在的能力，改名並同步 5 處交叉引用；③ `setTargetScore` 懸空 |
| M7 | 10 | ① 導覽落點與 TDD 歸屬全錯（見上方衝突點）；② `readHistory()` 回傳的是**物件不是陣列**，且 `droppedCount > 0` 時**會回寫** localStorage——design Decision 5 宣稱「型別上沒有寫入的門路」不成立 |
| M8 | 16 | ① 六處「M6 若已合併」條件句翻轉為硬前置；② §0.1 的 archive grep 會誤判而中止 apply；③ §0.5 的掃描範圍只到 `lib/` |
| M9 | 7 | ① `buildCourtTiles` 吃的是 `CourtTileSource` 不是 `Match`；② `CourtTile.player` 是**必填**，Decision 8 的「輸出替代文字」在型別上表達不出來；③ App 名稱對齊規則會印出「對戰分配」，違反 `prd.md` 9.4 |

**方向相反的那一項（原 #3）**：預檢說 M8 §0.5 的 grep 會誤收 sessionStorage 的
`scoreboard:hint-dismissed`。實測**不會**——那兩道 grep 只掃 `nextjs-pickball/lib/`，
根本掃不到 `components/`。真正的問題是同一段文字自相矛盾：宣稱要列出「本 app 寫入
LocalStorage 的**全部** key」且「漏列即為 spec 違反」，但指令只掃 `lib/`。已同時補上
兩件事——擴大掃描範圍，以及逐一確認是 localStorage 而非 sessionStorage。

**M8 的無聲失敗已從「靠合併順序碰巧正確」改成「硬前置 + 停止回報」**。原本
`CLEAR_ALL_KEYS` 寫「M6 若已合併就納入分槽 key」，M8 先合併時條件走 false，
`scoreboard:matches:v1` 不進清單，使用者按「清除本機資料」後分槽計分進度整批殘留，
而 merge 與測試全綠。考慮過「無條件納入，反正 key 不存在時清除是 no-op」——
**執行期成立、編譯期不成立**（M6 未合併時 `import { MATCH_SLOTS_KEY }` 會讓 `tsc` 直接失敗），
改硬編字串又違反 delta spec 的「字面值 MUST 取自模組匯出的常數」。
最終採「必須納入；模組不存在就停止本群組並回報」，等於把 M6 升格為 M8 的硬前置。

### 已消解的一項（原本評為最嚴重）

預檢指出 M6 假設「`useRoundStore` 已有可接的 UI↔hook↔lib 持久化管線」，而當時 `main` 上
`useRoundStore` **只匯出 `generateRound`**，`setTargetScore`／`resetIncompleteMatches`／
`submitScore` 三個純函式全庫零非測試呼叫端——判定 `MISSING`。

**M5 的 §11 已接上其中兩個。** 現況實測（2026-08-24）：`UseRoundStoreResult` 的欄位為
`round`／`history`／`droppedCount`／`generateRound`／`resetIncompleteMatches`／`submitScore`，
`app/matchmaker/page.tsx:19` 解構其中四項。

**但 `setTargetScore` 仍然懸空**——`lib/matchmaker/round.ts:352` 有定義，全庫零非測試呼叫端，
且 `useRoundStore` **沒有任何「套用新回合」的對外入口**。M6 的 §8.6 要求「未鎖定時委派
`setTargetScore`」，實作時必須先於 `useRoundStore` 新增該動作（**行為邏輯、必 TDD**）。
這不是開工阻斷，但 §8 的節標題原本自稱「例外層 — 純呈現元件」，會讓 subagent 跳過 TDD——
已在文件修正中加上例外限定。

### archive／sync 順序（與程式碼合併是兩回事）

主 spec 目前**落後於程式碼**：`openspec/specs/` 下沒有 `round-lifecycle`、`match-stage`、
`match-history` 三個 capability，`player-roster` 仍是 M1 的單一 key 版本（程式碼早已是三個 key）。

四個 change 的 delta capability 彼此不重疊，所以 M6～M9 之間無主 spec 衝突。但
**M4 必須先 archive**（建立 match-history、round-lifecycle，並把 player-roster 更新為 3-key），
**M5 必須先 archive**（建立 match-stage），M6 與 M7 才有主 spec 可掛。
建議 archive 順序：**M4 → M5 → M6 → M7 → M8 → M9**。

## 其他注意

- 合併前主 repo 若有未 commit 變更，先處理乾淨再 merge。
- `openspec validate --all --strict` 應維持全綠；M4～M9 的 Mode 值 `group-driven`
  是刻意偏離 schema 受控字彙（schema 寫 `subagent-driven`），validate 仍過，勿「修正」回去。
- coordinator 的追蹤任務（TaskCreate）是 session 內的，跨 session 以本檔為準；
  新 session 開始時建議照「各 change 清單」重建追蹤任務。
- 全部 7 個 change 合併完後：向使用者回報，verify／archive 階段另行指示，不要自行執行。
