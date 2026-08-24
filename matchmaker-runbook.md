# Matchmaker M3～M9 apply 執行手冊（runbook）

> 給下一個接手的 coordinator agent。目標：把 openspec 的 7 個 matchmaker change
> 依相依順序全部跑完 `/opsx:apply` 並逐一合併回本機 `main`。
> 本檔記錄 2026-08-23 中斷當下的狀態與接續步驟。

## 狀態快照（2026-08-23 晚間，M3 已完成並合併）

| 項目 | 值 |
|---|---|
| `main` HEAD | `76647cb`（merge commit：M5 對戰畫面已進 main） |
| M3 | **完成並已合併**。20/20，Final Review PASS。worktree 與分支已 teardown |
| M4 | **完成並已合併**。62/62，Final Review PASS_WITH_NITS、0 Blocker。跑了**兩位 leader** |
| M5 | **完成並已合併**。66/66，16 個 commit。跑了**兩位 leader**（第一位在 §3 後因單組 wall clock 過長主動停止；第二位中途被 API 529 打斷，以 SendMessage 從 transcript 恢復後跑完）。worktree 與分支已 teardown |
| M6～M9 | **依使用者指示暫停**，見上方停止點 |

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
| quick-rating-spec-backfill | 不在本輪範圍（使用者指定只跑 7 個 matchmaker change） |

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
M3 rating-engine ──merge──> main ──> M4 round-lifecycle ──merge──> main
                                                                    │
                                     ┌──────────────┬───────────────┤
                                     v              v               v
        M5 match-stage-ui <──────── main <──merge── (M5 完成後)
              │merge
              v            ┌─> M6 scoreboard-binding ─┐
             main ─────────┼─> M7 history-page        ├─ 四個平行，各自 merge 回 main
                           ├─> M8 data-transfer       │  （逐一合併，衝突時停下回報）
                           └─> M9 visual-export      ─┘
```

硬相依（各 change 的 environment.md 明寫，不可跳過）：
- M4 開分支前 M3 必須已合併回 `main`（M4 直接 import M3 的 `updateRatings`）。
- M5 需要 M4 在 `main` 上；M6/M7/M8/M9 需要 M5 在 `main` 上。
- M6～M9 之間無相依，可四個平行。

## 模型規定（使用者硬性要求）

- 每個 change 由**一個 opus leader**（`Agent` tool、`subagent_type: general-purpose`、`model: 'opus'`）執行。
- leader 派工的 subagent 依該 change `execution-plan.md` 的 Roles：Implementer 預設 `haiku`、
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
| M3 | matchmaker-rating-engine | matchmaker-rating-engine（已存在） | change/matchmaker-rating-engine | main（已滿足） | 15/20，待續跑 |
| M4 | matchmaker-round-lifecycle | matchmaker-round-lifecycle | change/matchmaker-round-lifecycle | M3 已合併回 main | 未開始 |
| M5 | matchmaker-match-stage-ui | matchmaker-match-stage-ui | change/matchmaker-match-stage-ui | M4 已合併回 main | 未開始 |
| M6 | matchmaker-scoreboard-binding | matchmaker-scoreboard-binding | change/matchmaker-scoreboard-binding | M5 已合併回 main | 未開始 |
| M7 | matchmaker-history-page | matchmaker-history-page | change/matchmaker-history-page | M5 已合併回 main | 未開始 |
| M8 | matchmaker-data-transfer | matchmaker-data-transfer | change/matchmaker-data-transfer | M5 已合併回 main | 未開始 |
| M9 | matchmaker-visual-export | matchmaker-visual-export | change/matchmaker-visual-export | M5 已合併回 main | 未開始 |

## 接續步驟

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

### 3. 開 M4 → M5 →（M6～M9 平行）

每一輪相同：

```bash
git worktree add /Users/m2_24gb/Desktop/project/pickball-worktrees/<change-id> -b change/<change-id> main
```

然後用下方模板啟動 opus leader（M4 起走逐組制，模板中的單檔測試路徑與唯讀檔案清單
換成該 change execution-plan.md 寫的內容）。完成 → 驗證 → 合併 → teardown → 下一個。
M6～M9 在 M5 合併後**同時**開 4 個 worktree、4 個 leader 平行跑；合併時逐一來，
遇衝突停下回報（各 change 已設計成互不改同檔，理論上無衝突）。

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

## ⛔ 停止點（使用者 2026-08-24 指示）

**做到 M5 完成並合併回本機 `main` 就停止。** 使用者要手動檢視狀況後再決定是否續跑。

- **不要**開 M6～M9 的 worktree、**不要**派 M6～M9 的 leader。
- M5 完成的定義：apply 全部群組做完 → coordinator 獨立驗證（test／tsc／lint／e2e）→
  `--no-ff` 合併回本機 `main`（不 push）→ 依 environment.md teardown worktree 與分支。
- 恢復前務必先讀下方「M6～M9 預檢結果」一節：有七項待修文件，
  以及一條硬性合併順序限制（**M8 必須排在 M6 之後**，否則會產生 git 偵測不到的資料殘留 bug）。

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
合併風險評為 **HIGH**。四個 change 仍可平行開發，但**不能照現況直接開四個 worktree**。

### 阻擋條件：M5 合併前不要開任何 M6～M9 的 worktree

M6／M7／M8／M9 的 `environment.md` 與 tasks §0 全都明文要求「`main` 必須先含 M5，否則立即停止」。
現在開會四個一起卡在 Step 0，白白浪費四輪派工。

### 合併順序必須是 M6 → M7 → M8 → M9（不可任意調換）

**M8 若排在 M6 之前會產生 git 偵測不到的資料殘留 bug**——這是評為 HIGH 的主因。
M8 的 `CLEAR_ALL_KEYS` 有一個「若 M6 已合併則納入分槽 key」的條件句；M8 先合併時該條件走 false，
`scoreboard:matches:v1` 不會進清單，使用者按「清除本機資料」後分槽計分進度會殘留。
**merge 全綠、測試全綠，但行為是錯的。**

其餘順序理由：M8 排 M7 之後，讓它 rebase 時一次處理「保留 M7 的連結 + 補自己的連結 +
對照 M6 的 `RESET_KEYS` 補齊 `CLEAR_ALL_KEYS`」（兩份「全部 key」清單要人工比對，git 不會提醒）。
M9 最後，它改同一頁面的另一段，還要驗證 `@media print` 是否正確隱藏 M7／M8 新加的連結。

### 唯一的真實檔案衝突點

集中在**一個檔案**：M5 擁有的 matchmaker 導覽／對戰頁（很可能是 `app/matchmaker/page.tsx`）。
M7 與 M8 各要在同一段導覽加一個 `<Link>`（相鄰新增，git 幾乎必衝，**解法是兩行都留**），
M9 在同檔另一段掛 `ExportActions`／`PrintSheet`。

正面訊號：四個 change 都刻意不新增 `hooks/` 檔案，因此**沒有任何一個要動
`pickleball-guide-page` 的 hooks 歸屬清單**——最容易撞在一起的 spec 段落被成功避開了。
E2E 也各自獨立成檔，無共用 helper 衝突。

### M5 合併後、派工前必須先修的文件（propose 階段修，不要留到 apply）

| # | change | 問題 | 修法 |
|---|---|---|---|
| 1 | M8 | `proposal.md` 宣稱「不修改任何既有生產程式碼」、`modifiedFiles` 為空，**但它的 spec 與 tasks §8.2 都要求「可從 matchmaker 區段導覽抵達資料頁」** | 把 M5 的導覽檔案補進 Impact／可動檔案清單 |
| 2 | M8 | tasks §0.1 用 `ls openspec/changes/archive \| grep matchmaker` 確認 M3／M4 已合併。**M3／M4 是以一般 commit 併入 main、未走 archive**，字面執行會誤判未合併而中止 apply | 改成核對程式碼或 `git log` |
| 3 | M8 | tasks §0.5 的 grep 會命中 `components/scoreboard/OrientationHint.tsx:8` 的 `scoreboard:hint-dismissed`，**但那是 sessionStorage 不是 localStorage** | §0.5 加一句「每個命中的 key 必須確認呼叫的是 localStorage」 |
| 4 | M6 | `proposal.md` Impact 表第 11 列說重置 key 清單在 `storage-keys.ts`。**實際 `RESET_KEYS` 與 `resetMatchmakerData()` 在 `lib/matchmaker/storage.ts:111-126`**；`storage-keys.ts` 全檔 22 行只有三個 key 常數與 `hasLocalStorage()` | 改一行文件。漏改的後果是靜默的資料殘留 |
| 5 | M6 | round-lifecycle delta 有一條 Requirement 描述「**刪除場次**」，但 M4 全庫 grep 零命中，只有 `resetIncompleteMatches`（整批丟棄 pending 場次） | 把該 Requirement 收斂成只涵蓋 `resetIncompleteMatches` 與重置名單兩條路徑 |
| 6 | M9 | design Decision 2 整段建立在「M5 會抽出 `lib/matchmaker/stage-layout.ts` 且 `buildCourtTiles` 回傳 `{ row, column, teamIndex, player }`」上。**這是四個 change 裡對 M5 產出形狀假設最細的一個** | M5 合併後第一件事就是逐項核對這五個具名相依 |
| 7 | M7 | design Open Question 3 假設 matchmaker 區段已有既有導覽 | M5 合併後回填實際形狀（獨立元件 vs 對戰頁內連結） |

### 已消解的一項（原本評為最嚴重）

預檢指出 M6 假設「`useRoundStore` 已有可接的 UI↔hook↔lib 持久化管線」，而 `main` 上
`useRoundStore` **只匯出 `generateRound`**，`setTargetScore`／`resetIncompleteMatches`／
`submitScore` 三個純函式全庫零非測試呼叫端——判定 `MISSING`。

**但 M5 的 §1.2 已經自己抓到並處理了**：M5 leader 在 `design.md` Open Questions 第 2 條 (d)
記載「§11 MUST 擴充既有的 `hooks/useRoundStore.ts`」，並確認這不違反 Decision 3
（該 Decision 禁止的是在 `hooks/` **新增檔案**，修改既有檔案不動歸屬清單）。
它也接受了 M4 的交接要求：接 `submitScore` 時一併補 `writeHistory` 與 `updatePlayer`。

**注意**：M5 的 `proposal.md` Impact 表沒有把 `hooks/useRoundStore.ts` 列為修改檔案，
實際可動範圍比文件大。M5 合併後 MUST 實測那三個函式是否真的接上，再決定 M6 能不能平行跑。

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
