# Matchmaker M10～M15 apply 執行手冊（runbook）

> 給下一個接手的 coordinator agent。目標：把 openspec 的 6 個 matchmaker change（M10～M15）
> 依相依順序全部跑完 `/opsx:apply`、逐一合併回本機 `main`、最後 verify 與 archive。
>
> 前一批（M3～M9）的手冊已歸檔為 `docs/matchmaker-runbook-m3-m9.md`，**已全部完成、零待辦**；
> 那份檔裡的教訓與派工經驗在本檔已濃縮成「派工經驗」與「教訓」兩節，不必回頭讀全文。
> 凡本檔各段落與「狀態快照」牴觸者，一律以「狀態快照」為準。
>
> **每完成一棒（合併、刪分支、或中斷）就把狀態寫回本檔並 commit**（使用者硬性要求；
> 跨 session 唯一的狀態來源就是本檔）。
>
> ⚠️ **本批不用 git worktree**（使用者 2026-09-03 指示：worktree 在專案目錄外，每個檔案操作都會跳權限提示）。
> 所有 apply 都在主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball` 內、切到 `change/<change-id>` 分支上做。
> 各 change 的 `environment.md` 已改為宣告主 repo 路徑，schema 的 Step 0 cwd 檢查因此直接通過。
> 代價：**只有一個工作樹**，leader 執行期間 coordinator 不得改動 repo 內任何檔案（含本檔），否則會污染 leader 的 `git status`。

## 狀態快照（最後更新 2026-09-06，M11 已合併）

| 項目 | 值 |
|---|---|
| `main` HEAD | `e8e97cf`（feat：合併 M11 matchmaker-player-stats） |
| propose | 六個 change 的八份 artifact 皆已產出，各自過兩輪審查＋一輪交叉檢查，`openspec validate --strict` 全過（已於 M10 commit 一併進 `main`）。 |
| M10 | **已合併**（`change/matchmaker-stage-gaps` → `main`，分支已刪） |
| M11 | **已合併**（`change/matchmaker-player-stats` → `main`，分支已刪，53 個 commit） |
| M12 | 未開始 |
| M13 | 未開始 |
| M14 | 未開始 |
| M15 | 未開始 |
| 工作位置 | 主 repo 直接開分支，不用 worktree；目前在 `main`，工作樹乾淨 |

### M10 執行紀錄（2026-09-06）

- 4 個實作群組（§2～§5）序列派工，§2／§3 各被 Stage 1 退回一次並修正，§4 一次過；Final Code Review APPROVED。
  審查合計封住 6 個存活 mutation，其中 §2 抓到一個純靠讀 class 看不出來、必須實測 boundingBox 才發現的桌面版面 126px 破口（`EmptyMatches` 缺 `flex-1`）。
- **一次 agent 並行事故**：coordinator 誤判 §2 Stage 2 Reviewer 卡住（實為長時間跑 tsc／lint／E2E 無輸出）而請 leader 重派，
  resume 又讓原 agent復活，兩個 reviewer 短暫共寫同一非隔離工作樹。兩邊都自行偵測到競態並停手，事後交叉核對，無資料損毀，只多花一輪工。
  **教訓**：判斷 subagent 是否卡住，只能看 transcript 最後一筆是否為「發出 Bash 指令、之後再無任何後續」且對應 process 已消失；
  絕不可只憑「一段時間沒新 commit」就判定卡住並重派——tsc／lint／E2E 這類指令本來就會長時間無輸出。
- **5.5（全套 E2E）一度卡住升級**：`scoreboard-binding.spec.ts` 在 `[webkit]`／`[mobile-safari]` 於 `beforeEach` 的 `page.goto("/")`
  偶發逾時 30000ms，與本 change 零關聯。coordinator 獨立在 `main`（合併前）重跑一次全套 E2E，重現同樣的失敗家族（同檔案、同兩個 project、
  同 beforeEach、命中的具體 test 不同），確認為**既有環境雜訊、非本 change 迴歸**，裁定通過。
- **機器負載事故**：coordinator 事後想在 change 分支上再獨立重跑一次全套 E2E 做交叉驗證，途中主機 load average 飆到 100+（可用記憶體降到
  個位數 MB），與本 repo 測試無關（疑似系統背景程序），導致 `[mobile-safari]` project 整批級聯逾時。判定為機器資源問題非程式缺陷，
  清掉所有測試相關 process 後未再重跑，改採「leader 自己 Final Review 那輪全綠（160/160）＋ main 上的既有雜訊重現」作為合併依據，
  經使用者確認後合併。**教訓**：機器 load average 需要在判斷 E2E 結果前一併檢查，異常高負載時的測試結果一律視為無效重跑。

### `main` 品質基線（coordinator 於 `3fa2d22` 獨立實測，2026-09-03）

```
前端單元   68 檔 / 638 測試 passed
後端單元   4 檔 / 16 測試 passed
tsc        pnpm -r exec tsc --noEmit → exit 0
lint       0 errors / 3 warnings（hooks/ 下三支既存檔的 no-unused-vars，非本批造成）
E2E        上一次全量（M9 合併前）514 passed / 21 skipped / 0 failed，--workers=1，13 分鐘
```

每一棒合併前後都要重量一次，數字只能增加不能減少（skipped 數不變）。

### M11 執行紀錄（2026-09-06）

- **規模**：9 個群組（§1 前置確認、§2～§8 實作、§9 收尾驗證）、53 個 commit、**一棒跑完未接力**。
  產品面 diff 僅 10 檔（新增 6、修改 4），`hono-pickball/**` 零改動。
- **審查**：§2～§8 七個實作群組各跑 Stage 1＋Stage 2，僅 §8 被 Stage 1 退回一次
  （溢出 test 只種 1 筆歷史紀錄、字面不滿足 Scenario 的「已有多筆」），修正後複審通過。
  Final Code Review `APPROVED`，必須修正項零。
- **mutation 成效**：Stage 2 累計獨立跑 136 組變異，**七組裡有七組推翻了 Implementer 的自述**
  （§7 是唯一自述被完全證實者）。補上 17 條非錨點測試，其中三個是實質缺口：
  ① 排行榜排序**第三層「出場數」完全沒被測到**（原 fixture 的出場數層與姓名層期望順序一致，
  移除該層答案不變）；② **design Decision 4 的姓名快照 MUST 零覆蓋**（既有測試只涵蓋 `ratingAfter`）；
  ③ **球員欄從未斷言「顯示的是姓名」**（把色塊內容換成 `stat.id` 竟全綠）。
- **兩處 spec 自身的問題在 apply 階段才被發現**：
  ① `player-stats` delta spec 的 Requirement prose 寫欄位名「勝－負」，但同一份 spec 的 Scenario
  要求 E2E 比對到「勝負」——Scenario 的九個詞全是欄位全名的**子字串**，唯獨這個被破折號切斷，
  兩者不可能同時滿足。已修正 spec／design／proposal 三處（commit `6ff2247`）。
  ② 同一份 spec 的「統計頁 SHALL NOT 修改回合、名單或任何 LocalStorage 資料」**與實作不符**：
  統計頁比照對戰頁直接持有 `useRosterStore`／`useRoundStore`，兩者的 write effect 在 hydrate 後
  會把三個 key 各自重新序列化寫回（既有 hydration pattern，非本 change 引入）。
  §8 的 mutation 對每個 key 各種入一份「合法但非 schema 序列化順序」的資料，三次都在對應的 key 上
  轉紅，**實驗確證三個 key 都真的被回寫**。經 coordinator 追認後，Final Review 於 `9649242`／`e4230f0`
  把措辭改為「SHALL NOT 呼叫任何 store 的 setter、SHALL NOT 改變資料的**內容**」，
  另起一段把例外**窄化到「等值的重新序列化」**並明寫不得據以放寬。Scenario、驗收錨點、
  測試名稱、程式碼全部零改動。
- **一個斷言遮蔽缺口**：§8 的溢出 test 原本把「容器可捲動」的反向護欄排在 spec 主斷言前面，
  做 `min-w-[900px]` 變異時紅的是護欄而非主斷言——也就是「整頁不溢出」這條 spec 斷言
  **從未被證明有效**。調整順序後兩條斷言經實測各自獨立生效。
- **9.6 全套 E2E 一度未達 100% 綠**：leader 那輪 587 passed / 2 failed / 21 skipped，
  兩個失敗在 `quiz.spec.ts:137` 的 `[webkit]`／`[mobile-safari]`（`page.goto` 逾時 30000ms），
  與本 change 零關聯（15 個改動檔案零觸及 quiz 相關檔案）。leader 未自行判定為雜訊，證據上報。
  coordinator 合併前獨立重跑一次全套 E2E：**589 passed / 0 failed / 21 skipped，100% 綠**，
  證實前一輪的兩個失敗是環境雜訊、非本 change 迴歸，裁定通過並合併。
  **與 M10 的 `scoreboard-binding.spec.ts` 屬同一失敗家族**（webkit／mobile-safari 的 `page.goto` 逾時）。

### `main` 品質基線（M11 合併後，coordinator 於 `e8e97cf` 獨立實測）

```
前端單元   70 檔 / 664 測試 passed   （M10 後為 68 檔 / 638 測試，+2 檔 / +26 測試）
後端單元   4 檔 / 16 測試 passed     （不變）
tsc        pnpm -r exec tsc --noEmit → exit 0
lint       0 errors / 3 warnings（hooks/ 下三支既存檔的 no-unused-vars，非本批造成）
E2E        589 passed / 21 skipped / 0 failed，--workers=1，11.9 分鐘（skipped 數不變）
相依       零新增（package.json／pnpm-lock.yaml 全程未變動）
```

## Pipeline 總覽

```
main@3fa2d22
  → M10 stage-gaps ──merge──> main
  → M11 player-stats ──merge──> main
  → M12 scoreboard-team-labels ──merge──> main
  → M13 player-swap ──merge──> main
  → M14 round-timer ──merge──> main
  → M15 timed-draw ──merge──> main
```

**全程嚴格序列，同一時間只存在一條 `change/*` 分支。** 前一棒合併回 `main` 並刪分支之後才 `git switch -c` 下一棒。
理由沿用 M6～M9 的實測結論：一次只能跑一組 E2E、後棒的 MODIFIED delta 要以合併後的 `main` 重新對齊；
本批又只有一個工作樹，平行根本不可能。

硬相依（各 change 的 `environment.md` 與 `proposal.md`「執行相依」明寫，不可跳過）：

- M11 之後每一棒都要求「前一棒 MUST 已合併回 `main`」，即使程式碼上沒有直接 import 相依。
- M13 需要 M12 在 `main` 上（兩者都動 `components/matchmaker/CourtCard.tsx` 與 `lib/matchmaker/scoreboard-binding.ts`）。
- M14 需要 M13 在 `main` 上（兩者都動 `lib/matchmaker/round.ts`、`hooks/useRoundStore.ts`、`app/matchmaker/page.tsx`）。
- **M15 需要 M14 在 `main` 上**（直接依賴 M14 引入的 `round.timer` 欄位判定「計時制才可平局」）。
- M15 是最後一棒，**可獨立砍掉而不影響 M10～M14**。

跨 change 的檔案重疊與 Requirement 重疊矩陣見下方「跨 change 對齊提醒」。

## 各 change 清單

| # | change id | 內容 | 規模 | tasks／群組 | 預估棒數 | branch | base 前提 | 狀態 |
|---|---|---|---|---|---|---|---|---|
| M10 | matchmaker-stage-gaps | 空場次說明、損毀筆數提示、重設／重排 E2E | 21 commit | §1～§5 五組 | 1 棒 | change/matchmaker-stage-gaps（已刪） | main @ `3fa2d22` | **已合併**（`56331b0`） |
| M11 | matchmaker-player-stats | 球員統計與排行榜頁 `/matchmaker/stats` | 53 commit | §1～§9 九組 | 1 棒 | change/matchmaker-player-stats（已刪） | main @ `56331b0` | **已合併**（`e8e97cf`） |
| M12 | matchmaker-scoreboard-team-labels | 計分板顯示綁定場次的球員姓名與隊色 | <待填> | <待填> | <待填> | change/matchmaker-scoreboard-team-labels | M11 已合併 | 未開始 |
| M13 | matchmaker-player-swap | 臨時換人（場上 ↔ 休息名單） | <待填> | <待填> | <待填> | change/matchmaker-player-swap | M12 已合併 | 未開始 |
| M14 | matchmaker-round-timer | 輪次計時器（倒數、時間到提示） | <待填> | <待填> | <待填> | change/matchmaker-round-timer | M13 已合併 | 未開始 |
| M15 | matchmaker-timed-draw | 計時制平局（S=0.5、歷史與匯出的平手表示） | <待填> | <待填> | <待填> | change/matchmaker-timed-draw | M14 已合併 | 未開始 |

> `quick-rating-spec-backfill`（0／6，純規格回填）**不在本批範圍**。它只動
> `components/matchmaker/PlayerForm.test.tsx`（新增）與 `tests/e2e/specs/player-roster.spec.ts`，
> 與本批零重疊，可在任一棒之間插跑，也可最後再做。

## 模型規定（使用者硬性要求）

- 每個 change 由**一個 opus leader**（`Agent` tool、`subagent_type: general-purpose`、`model: 'opus'`）執行。
- leader 派工的 subagent 依該 change `execution-plan.md` 的 Roles：**Implementer `sonnet`**
  （本批的 execution-plan 已直接寫 sonnet，不再是 haiku 加覆寫）、Spec Reviewer `sonnet`、
  Code-Quality／Final Reviewer `opus`，升級照 Escalation 規則。
- **每次 Agent 呼叫都必須明確帶 `model` 參數；任何情況不得使用 `fable`**（fable 只允許當 coordinator，不做實作）。

## 執行模式

**逐組制**（M4 起沿用）：派工單位是 tasks.md 的 `§` 群組，一組一個 Implementer 做完整組
（組內仍逐 task 真紅燈 TDD、**逐 task commit**：`test:` 一個、`feat:` 一個），Stage 1／Stage 2 整組審，
群組間序列。細節都寫在各 change 的 `execution-plan.md`，leader 照著跑即可。

## 每開一個新 change 的標準流程（M10～M15 各走一次）

⚠️ **一次只開一個。前一個合併並刪分支之後才開下一個。全程在主 repo，不開 worktree。**

1. 開工前查殘留 process（兩個指令都要跑，`lsof` 會漏抓殭屍 `next-server`）：
   ```bash
   lsof -i :3005 -i :8787
   ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep
   ```
   有就全數 kill，確認 port 釋放。
2. 開分支（在主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，工作樹必須乾淨）：
   ```bash
   git status --porcelain      # 必須為空
   git switch -c change/<change-id> main
   ```
3. 用下方「Leader prompt 模板」啟動 opus leader。**派出 leader 之後不要結束回合，也不要改動 repo 內任何檔案**；
   用 Monitor／TaskOutput 等它，停擺偵測門檻放寬到 **3 小時**（leader 等 subagent 時完全不寫 transcript，
   45／75 分鐘門檻都實測誤報過）。
4. leader 回報完成後，**coordinator 獨立驗證**（仍在 `change/<change-id>` 分支上，不採信回報）：
   ```bash
   git branch --show-current         # 必須是 change/<change-id>
   git status --porcelain            # 必須為空
   git diff main --stat -- pnpm-lock.yaml package.json nextjs-pickball/package.json hono-pickball/package.json   # 必須為空
   pnpm -r exec tsc --noEmit         # exit 0
   pnpm --filter ./nextjs-pickball lint   # 0 errors，warning 數不得多於基線 3
   pnpm test                         # 前後端全綠，檔數／測試數 ≥ 前一棒
   DO_NOT_TRACK=1 openspec validate <change-id> --strict
   pnpm --filter ./nextjs-pickball test:e2e -- --workers=1   # 既有 spec 原樣通過
   ```
   tasks.md 的勾選數與 `git log main..HEAD` 對得上；抽 2～3 個 RED commit 用
   `git show <commit>^:<path>` 複驗紅燈是真的。
5. 合併回本機 `main`（**不 push**）：
   ```bash
   git switch main
   git merge --no-ff change/<change-id> \
     -m "feat(matchmaker): 合併<一句話說明>（<Mn>）" \
     -m "Claude-Session: <當前 session id>"
   ```
   合併後複驗 `pnpm -r exec tsc --noEmit` 與 `pnpm test`，**無迴歸**才算完成。
6. 刪分支：`git branch -d change/<change-id>`（`environment.md` 的 Teardown 只剩這一行）。
7. 更新本檔「狀態快照」與「各 change 清單」的狀態欄，commit（`docs: runbook 記錄 <Mn> 完成`）。
8. 下一棒。

測試不綠就**不合併**，回報使用者。

### 全部合併後

依 M10 → M15 順序各跑 `/opsx:verify`，再 `/opsx:archive`（或 `/opsx:bulk-archive`），
最後 `DO_NOT_TRACK=1 openspec validate --all --strict` 與主 spec 零重複標題（python 計數法）。
流程與陷阱同 `docs/matchmaker-runbook-m3-m9.md`「🏁 全流程結束」一節。

## Leader prompt 模板

> 佔位符：`<change-id>`、`<Mn>`、`<session id>`。

```
你是 openspec change `<change-id>`（<Mn>）的 apply 階段 leader。你的工作：在主 repo 的
change/<change-id> 分支上，依 /opsx:apply 流程與該 change 的 execution-plan 把全部 task 做完
（TDD、依 execution-plan 逐組派 subagent、兩階段審查、Final Code Review），全部 commit
在 change 分支上，最後回報。

## 環境（已就緒，不要重建）
- 工作位置：主 repo /Users/m2_24gb/Desktop/project/nextjs-pickball，**已切到分支
  change/<change-id>**（用 git branch --show-current 確認）。本批**不用 git worktree**：
  禁止 git worktree add、禁止切換分支、禁止 git merge；所有 commit 都落在這條分支。
- environment.md 宣告的路徑就是主 repo，apply Step 0 的 cwd 檢查直接通過；
  不要因為 schema 提到 worktree 就去建一個。
- 禁止改動 matchmaker-runbook-m10-m15.md 與 openspec/changes/ 下其他 change 的目錄。
- 前端 dev server :3005、後端 :8787。

## 流程
1. 讀 .claude/commands/opsx/apply.md，照它的步驟執行，change 名稱固定為 <change-id>。
   openspec CLI 在 repo root 執行並帶 DO_NOT_TRACK=1。
2. Step 0：先 git status --porcelain 確認工作樹乾淨、git branch --show-current 為
   change/<change-id>；跑 pnpm install（之後 git status 仍須乾淨，lock 零變動），再跑完整
   pnpm test 取得 baseline，回填 openspec/changes/<change-id>/environment.md 的 Verification
   三欄並 commit。後端測試若噴 listen EPERM 127.0.0.1 是沙箱擋 localhost，放行重跑再判定。
3. 完整讀取 change 的所有 artifact（proposal、design、test-plan、tasks、execution-plan、
   environment、specs/**）。tasks §1 的「對齊 main」每一項都要實際 grep 核對；
   design.md Open Questions 第 1 條若寫「apply §0 MUST 以合併後 main 重新對齊 MODIFIED 區塊」，
   先做對齊、把差異記進 Open Questions 並 commit，再開始 §2。
4. 嚴格照 execution-plan.md 執行逐組派工、兩階段審查、Escalation 與 Final Code Review；
   派工時遵守 Per-task contract：要求的內容全部貼完整原文給 subagent，不可只給路徑；
   照「不給」清單限制脈絡。群組之間序列執行，禁止平行派 Implementer。
5. 派出 subagent 之後不可以結束回合。脈絡將盡就在派下一組之前乾淨停止：把狀態
   （已完成群組、審查結論、接續點）寫進 design.md 的 ## Open Questions 並 commit 後回報。

## 模型規定（使用者硬性要求）
- 你自己跑在 opus。每次呼叫 Agent tool 必須明確帶 model 參數，值依 execution-plan 的
  Roles（Implementer sonnet、Spec Reviewer sonnet、Code-Quality／Final opus，升級照
  Escalation）。任何情況不得使用 fable，也不得省略 model 參數。subagent_type 用 general-purpose。

## 派工單必帶（每張都要，來自 M3～M9 實測）
- Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」，有存活先補斷言。
- Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率、檢查恆真斷言
  （toEqual 兩邊同一參考），回報存活數；不採信 Implementer 自述。授權 Stage 2 直接修小東西
  （dead export、補斷言），但要在回報的「偏離」欄如實記載。
- 紅燈宣稱一律用 git show <commit>^:<path> 機械複驗；查核不過改標 regression guard 並補 mutation。
- 逐 task commit：test: 一個、feat: 一個；不要一組一個 commit。
- 註解只寫「為什麼」，不重述函式名、不誤植 milestone 編號。
- 編輯器診斷不可信（整批 Cannot find module 多半是假的），一律以
  pnpm -r exec tsc --noEmit 的 exit code 為準；唯一可信的例外是「單一新檔的單一 import 解不到」。
- 跑 E2E／preview 前先 lsof -i :3005 -i :8787 並且 ps aux | grep -E "next-server|wrangler|workerd|playwright"
  交叉核對殘留 process 並全數 kill；跑完立刻清掉自己起的 process。E2E 一律帶 --workers=1。
- **指令裡禁止 cd，一律用絕對路徑**（例：grep -n "x" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/lib/...）。
  cd 之後接相對路徑會讓 auto mode 算不出實際目錄，因全域有 Read() deny 規則而跳出權限提示，整條鏈就停住。
  這條規則要原樣寫進每一張派工單。

## 專案硬規則
- TDD 三步：先寫失敗測試並在 shell 實際看到紅燈（輸出留存）→ 最小實作至綠 → refactor。
  單檔測試 pnpm --filter ./nextjs-pickball test --run <測試檔路徑>，--run 前不可加 --。
- 紅燈要是真的：寫入當下就綠的 it 如實標註 regression guard；嚴禁改斷言偽造紅燈。
- 例外層（app/**/page.tsx、layout.tsx、tests/**、*.css）不強制紅燈，但 tasks 列的測試仍要寫。
- 測試檔顯式 import { describe, it, expect } from "vitest"；型別匯入用 import type；
  註解與錯誤訊息用繁體中文（台灣用語），程式碼識別字用英文。
- 文案常數放 lib/matchmaker/labels.ts；storage key 從 storage-keys.ts 取；zod 新欄位
  .nullable().default(null) 或 .optional()，不 bump storage key；不新增 npm 相依。
- 新增 hooks/use*.ts 時必須同步 openspec/specs/pickleball-guide-page/spec.md 的 hooks 歸屬清單
  （hooksInventory.test.ts 會擋）；該 change 的 delta 已含這一行，照 delta 做。
- PostToolUse hook 會對前端檔自動跑 ESLint，exit 2 擋下時先讀 lint 輸出修正。
- tasks.md 的 checkbox 完成一個勾一個。
- Commit 訊息：Conventional Commits、繁體中文，結尾加 footer 一行
  Claude-Session: <session id>（直接填 session id，不要編造 URL），
  不得加 🤖 Generated 或 Co-Authored-By。
```

## 教訓（M3～M9 實證，續跑時不要再踩）

1. **兩個 leader 同時在同一個工作樹工作**（M6 事故；本批只有一個工作樹，更要小心）：coordinator 派新 leader
   前先確認前一個已停（TaskOutput 顯示結束、`ps` 無殘留），且自己在 leader 執行期間不碰 repo。
2. **leader 用 `run_in_background` 起長時間 process 後結束回合，process 洩漏**（M6 事故）：
   模板已寫「派出 subagent 後不可結束回合」；coordinator 每棒結束後 `ps aux` 清點一次。
3. **`EMFILE: too many open files`**：曾累積 9 個殘留 dev server。跑 E2E 前後都要清。
4. **殭屍 `next-server` 讓 `lsof` 誤判乾淨**（M9）：連續多次 E2E 在「webServer 逾時」與
   「port 已被占用」之間搖擺時，先 `ps aux | grep next-server`，再懷疑程式碼。順手 `rm -rf nextjs-pickball/.next`。
5. **tasks.md 勾選數落後於實際 commit**（M7）：續跑前 MUST 以 `git log main..HEAD` 為準補勾。
6. **Implementer 自述的 mutation 結果不可採信**（七度實證，例：自述 6 次 1 存活，Stage 2 實測 27 組 9 存活）。
   最嚴重缺口每次都是「分支或欄位零覆蓋」，不是斷言太弱。
7. **E2E 不帶 `--workers=1` 會出現與本 change 無關的隨機失敗**（Turbopack dev 延遲 chunk 競態）。
8. **macOS BSD `uniq` 會把不同的中文標題判成重複**：查主 spec 重複一律用 root `CLAUDE.md` 的 python 計數法。
9. **編輯器診斷大量謊報**（整批模組解析錯誤）：以 `tsc` exit code 為準。
10. **M4 62 task 兩棒、M6 91 task 十棒、M7 47 task 三棒、M8 110 task 兩棒、M9 50 task 一棒**：
    以 50 task 一棒粗估；派 leader 時就要求脈絡將盡在派工前乾淨停止。
11. **主工作樹的 Stop hook 會在 tsc 失敗時擋下 coordinator 的停止**（`.claude/hooks/stop-typecheck.sh`，
    linked worktree 只提示、主工作樹擋下）。本批在主工作樹做 TDD，RED commit 之後樹上會有型別錯誤，
    這只影響 coordinator 的 session 停止，不影響 leader（subagent）；每棒收尾時樹必須回到 tsc 綠。
12. **指令裡的 `cd` 會觸發權限提示**（2026-09-04 實測）：auto mode 遇到「cd 之後接相對路徑」算不出實際目錄，
    又因全域 settings 有 `Read()` deny 規則，就改問使用者，背景 agent 全部卡住。派工單一律要求絕對路徑、禁止 cd。
    **這條也適用於 leader 自己下的指令，不只是它派給 subagent 的**（M11 leader 第一次派工即因此卡死，見 M11 執行紀錄）。
13. **Implementer 的 mutation 自述不可採信，這條在 M11 又被驗證七次**（八組裡七組被 Stage 2 推翻）。
    但 M11 也證明**「取樣次數」不是重點，「逐分支逐欄位機械盤點」才是**：
    §4 的 Implementer 做了 11 次仍漏掉「排序第三層完全沒被測到」，
    §5 的 Implementer 做了 17 次仍漏掉「球員欄從未斷言顯示的是姓名」。
    派工單要逐條列出必做變異（每個分支、每個欄位、排序的每一層、每一層的方向、層與層的先後），
    而不是只寫「請做 mutation」。
14. **mutation harness 本身會失效而產生假訊號**（M11 §7 Implementer 主動揭露）：
    python 的縮排 pattern 沒對上（該行 5 個 tab、pattern 寫 6 個），檔案根本沒被改到，
    測試「通過」被誤讀成存活。**所有 mutation 派工一律要求三重落地檢查**：
    ① 強制 `src.count(old) == 1`（0 次＝沒改到、多次＝誤改）② 替換後 `assert new != old`
    ③ 套用後 `git --no-pager diff --stat -- <file>` 必須有輸出，否則中止不跑測試。
    另建議放一條**等價變異當對照組**（例如 `a === b` → `b === a`，應存活）——
    若連它都「轉紅」，代表 harness 有問題而非程式碼有問題。
15. **E2E 的斷言順序會造成遮蔽**（M11 §8）：把「反向護欄」排在 spec 主斷言前面時，
    變異會先讓護欄轉紅，主斷言其實從未被證明有效。**spec 的主斷言一律排最前面**，
    護欄放後面；並用變異確認「紅在哪一行」而不只是「有沒有紅」。
16. **spec 自身的內部矛盾要到 apply 才會現形**（M11 兩例：欄位名破折號、唯讀 SHALL NOT 與實作不符）。
    propose 階段的交叉檢查看不出來，因為兩處各自都合理。**apply 的 Stage 1 Reviewer 要被明確授權
    「裁決 spec 內部不一致」**，而不是硬把實作扭去迎合其中一句；leader 則要把裁決結果**同步回
    delta spec**，否則矛盾會隨 archive 進主 spec。
17. **E2E 全套跑完的失敗，先看「是否可隔離重現」再看 load average**（M11 補充第 4 點）：
    M10 的情境是 load average 飆到 100+，M11 的情境是 load average 正常（2.5～6.4）但仍失敗，
    而 coordinator 合併前重跑整套反而 100% 綠。**兩種都不是迴歸，但診斷路徑不同**：
    先確認改動檔案與失敗檔案有無因果路徑 → 隔離或整套重跑 → 才看負載。
    無論結論如何，leader **不得自行判定為雜訊**，證據上報由 coordinator 裁定。

## 跨 change 對齊提醒（交叉檢查結果，2026-09-03）

<待填：檔案重疊矩陣、Requirement 重疊清單、矛盾與處置、warnings>

## commit footer 慣例

每個 commit 結尾加一行 `Claude-Session: <值>`。**值的來源只有兩種**：
1. 若當前 session 的系統提示（system-reminder）明確給了 `Claude-Session: https://claude.ai/code/session_…` 這種 footer，逐字用它。
2. 否則直接填 `CLAUDE_CODE_SESSION_ID`（例：`Claude-Session: dc0d8838-5961-407f-9438-fd844e1f3c03`）。

不要自行編造 URL。leader 的派工單要把當時 coordinator 用的那一行原樣傳下去。
