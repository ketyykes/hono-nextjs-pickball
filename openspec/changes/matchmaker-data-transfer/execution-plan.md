# Execution Plan — matchmaker-data-transfer（M8）

## Mode

`subagent-driven`

每一條 RED／GREEN 任務都派發一個**全新的 subagent** 當 Implementer，完成後依序跑
Stage 1（spec 合規）與 Stage 2（程式品質）兩段審查；REFACTOR 任務只跑 Stage 2。
全部任務完成後再派一個 Final Code Reviewer 檢查跨任務整合。
**SHALL NOT 平行派發多個 Implementer**——它們共用同一個 worktree，平行寫會互相覆蓋。

## Per-task contract

Subagent **不繼承主對話的 context**。以下是每次派工時必須完整貼上的內容
（貼全文，SHALL NOT 只給檔案路徑要它自己去讀）：

| 項目 | 內容 |
|---|---|
| 任務全文 | `tasks.md` 中該條 RED + GREEN（或 REFACTOR）的**完整文字**，含群組標題與 `Depends on:` |
| test-plan 對應列 | `test-plan.md` 中該測試那一列的全部欄位：Test name／Scenario／Assertion／Why first／Tier |
| spec 片段 | `specs/data-transfer/spec.md` 中**該任務所屬的那一條 Requirement** 全文（含其全部 Scenario 與「驗收」錨點） |
| design 片段 | `design.md` 中影響該任務的 Decision 與 Risk 條目（例如 §5 給 Decision 9、§7 給 Decision 2 與 5） |
| §0 的對齊記錄 | `tasks.md` §0 產出的「M4 實際 schema／key 名稱對照表」——§2 以後的任務一律需要 |
| worktree 路徑 | `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-data-transfer`（取自 `environment.md`，subagent 在此工作，**SHALL NOT 另建 worktree**） |
| 執行指令 | 單檔測試：`pnpm --filter ./nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**） |
| 明確的「不給」清單 | 其他任務的內容、其他 capability 的 spec、`prd.md` 全文、其他並行 milestone（M6／M7／M9）的任何檔案 |

Implementer 的執行指示固定為：
**寫 RED 測試 → 跑測試、實際看到紅燈並貼出輸出 → 寫最小 GREEN 實作 → 跑測試看到綠燈
→ 自我複查 → commit**。

若某條測試加入後**立即全綠**（既有保證透過新入口重新曝光），Implementer MUST 在回報中
誠實標註為 regression guard，並改以 **mutation 驗證**（改壞實作看紅、還原看綠）證明測試
有偵測力；**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**（root `CLAUDE.md` 明文禁止）。

## Roles

### Implementer

- **default_model**: `haiku`
- **rationale**: §1～§7 的任務都是**單一純函式 + 單一測試檔**、輸入輸出在 spec 與
  test-plan 中已寫死到具體數值（列號 3 與 5、檔名字串、11 個欄位名），
  幾乎沒有設計自由度，屬於 haiku 能穩定完成的翻譯型工作。
- **upgrade_to_sonnet_when**:
  - 任務涉及 `csv.ts` 的引號狀態機（引號內的換行與逗號、兩個雙引號的跳脫還原）——
    這是本 change 唯一有真實演算法分支的地方；
  - 任務需要同時協調三個以上既有模組的匯出（例如 §7 的 `CLEAR_ALL_KEYS` 要從
    `lib/matchmaker/storage-keys.ts` 與 `lib/scoreboard/` 下的每一個 key 常數模組
    逐一 import，數量以 §0.5 的 grep 結果為準）；
  - 同一條任務被 Stage 1 或 Stage 2 退回 **1 次**後的重試。
- **upgrade_to_opus_when**:
  - 同一條任務被同一位 reviewer 連續退回 **3 次**（見 Escalation）；
  - 任務回報 `BLOCKED` 且原因為「推理不足」而非「context 不足」；
  - §0 的介面對齊發現 M4 的實際 schema 與 design 假設**結構性不同**（不只是改名），
    需要重新設計 `transfer-types.ts` 的組合方式。
- **checklist（自我複查，回報前逐條確認）**:
  - [ ] 有貼出紅燈輸出；若為 regression guard，有貼出 mutation 的紅／綠輸出
  - [ ] `it` 名稱與 test-plan 的 Test name **逐字相同**（含全形標點）
  - [ ] 只動了任務指定的檔案；未編輯 `storage.ts`／`roster.ts`／`types.ts`／`colors.ts`
  - [ ] 型別匯入使用 `import type`（`verbatimModuleSyntax` 已開啟）
  - [ ] 測試檔顯式 `import { describe, it, expect } from "vitest"`
  - [ ] 錯誤訊息為繁體中文且含可採取的下一步
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 無輸出

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**: 需要把程式碼與 spec 的 SHALL／MUST 逐句對照，並判斷「有沒有做超出範圍
  的事」。這是理解任務而非產生程式碼，sonnet 足夠；haiku 在「範圍蔓延」這類需要對照多段
  文字的判斷上容易漏看。
- **required first action**: 先**複述**自己收到的 spec／test-plan 片段標題。
  若與待審任務對不上，回報 `NEEDS_CONTEXT`，**SHALL NOT 硬審**。
- **checklist**:
  - [ ] 該 Requirement 的每一條 SHALL／MUST 都有對應的實作或明確的不適用理由
  - [ ] RED 測試確實對應到 spec 的那個 `#### Scenario`（不是相近的另一個）
  - [ ] 沒有做 spec 未要求的事（範圍蔓延），尤其是 proposal「不在本次範圍」列出的項目
  - [ ] 「驗收」錨點的檔案路徑與 `it` 名稱逐字相符
  - [ ] 整份原子性相關任務：確認失敗路徑**沒有任何寫入**，而非「寫了再回滾」
  - [ ] §7 的清除任務：`CLEAR_ALL_KEYS` 涵蓋 §0.6 對照表列出的**全部** key 常數
        （spec 承諾「本 app 寫入的全部 key」而非固定四筆），且測試**未**斷言固定筆數
- **SHALL NOT**: 評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**: 本 change 最容易出的錯不是「不符 spec」而是「符合 spec 卻有洞」——
  CSV 跳脫的邊界、BOM 在 round-trip 中被吃掉、`nextAutoGradient` 因一次算完而全部同色、
  斷言強度不足以區分兩種實作。M1／M2 的 review 記錄顯示這類問題**只有 mutation 式的
  深度檢查抓得到**，需要最強的模型。
- **required first action**: 同 Stage 1，先複述收到的片段標題；對不上就回報 `NEEDS_CONTEXT`。
- **checklist**:
  - [ ] 命名與既有 `lib/matchmaker/` 慣例一致（schema 與型別成對匯出、註解為繁體中文）
  - [ ] 無重複邏輯：顏色、rating round、`hasLocalStorage` 皆委派既有實作而非重寫
  - [ ] 邊界：空輸入、只有標題列、只有 BOM、含 `\r\n` 與 `\n` 混用、值內連續雙引號
  - [ ] 錯誤處理：所有可能拋例外的呼叫（`JSON.parse`、`localStorage.*`）皆被接住
  - [ ] **斷言強度**：試著在腦中改壞一行實作，既有測試會不會紅？若不會，指出該補的斷言
  - [ ] 可讀性：函式長度、早期 return、避免深巢狀
- **SHALL NOT**: 重新爭論 spec 該不該這樣寫——Stage 1 已處理。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**: 九個群組由九批不同的 subagent 完成，跨任務的一致性（錯誤訊息語氣、
  結果物件形狀、`Result` 型別的命名）沒有任何單一任務的 reviewer 看得到全貌。
- **時機**: 全部 tasks 打勾之後，對本 change 的**完整 commit 集合**做一次審查。
- **checklist**:
  - [ ] 六個模組的「失敗結果」形狀一致（都是 `{ ok: false, message }` 或都是別的，不混用）
  - [ ] 錯誤訊息語氣與既有 `PlayerForm` 的訊息一致（皆為「…，請…」的句式）
  - [ ] 沒有兩個任務各自實作了同一件事（例如兩處各寫一份 BOM 常數）
  - [ ] 合併後的 diff 仍落在 proposal 的 Impact 清單內，未觸碰「不動」的檔案
  - [ ] `openspec/specs/**` 未被修改；`prd.md` 未被修改
  - [ ] 收尾驗證全綠：`pnpm lint`／`pnpm typecheck`／`pnpm test`／`pnpm test:e2e`
- **SHALL NOT**: 重審單一任務的細節（Stage 1／2 已涵蓋）。

### 模型選擇原則

以**能勝任該角色的最弱模型**為準，以節省成本並加快回合。
`haiku`／`sonnet`／`opus` 是 Claude 的層級名稱，僅作為範例；
在沒有這些層級的執行環境上，對應到「快速／均衡／最強」三檔的等價模型。

## Escalation

| 情況 | 處置 |
|---|---|
| 同一位 reviewer 連續退回同一條任務 **3 次** | 升級 Implementer 的模型（haiku → sonnet → opus）後重新派工，**SHALL NOT 以相同模型、相同條件重派** |
| Implementer 回報 `NEEDS_CONTEXT` | 補上缺的 context（多半是 §0 的對齊記錄或 design Decision），以**相同模型**重派 |
| Implementer 回報 `BLOCKED` | 依原因分流：context 不足 → 補 context；推理不足 → 升級模型；任務過大 → 拆成兩條 RED／GREEN；計畫本身有誤 → 升級給人 |
| Spec Reviewer 自身判斷前後不一致（同一段程式先過後不過） | 升級給**人類**做 spec 澄清，並把結論寫回 `design.md` 的 Open Questions |
| Code-Quality 與 Implementer 的風格爭執 | **既有 codebase 風格勝出**（`lib/matchmaker/` 的既有模組為準） |
| 任一階段 `BLOCKED` 超過 **30 分鐘** | 升級給人類 |
| §0 發現 M4 尚未合併回 `main`，或 schema 與假設結構性不同 | **停止 apply**，把情況記入 `design.md` 的 Open Questions 並回報使用者；SHALL NOT 自行猜測欄位名硬幹 |
| 任務要求編輯 `openspec/specs/**` 或 `prd.md` | 一律拒絕並回報——本 change 只寫 `openspec/changes/matchmaker-data-transfer/` 底下的 delta |
