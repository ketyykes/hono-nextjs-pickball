# Execution Plan: emoji-spots-icons

## Mode

subagent-driven

## Per-task contract

每個派出的 subagent 會收到（subagent 不繼承主對話）：

- tasks.md 中該群組的完整任務文字（含 RED + GREEN 配對）
- test-plan.md 對應的列（test name／scenario／assertion／why first／tier）
- 相關 spec.md 段落（`specs/emoji-free-ui/spec.md` 的對應 Requirement 與 Scenario）
- 相關 design.md 段落（Decision 1–2 中與該群組有關者，與 Risks）
- 工作目錄：`/Users/m2_24gb/Desktop/project/nextjs-pickball`（不開 worktree，見 environment.md）
- 硬性規定：TDD 紅燈須在 shell 實際看到；已存在的行為寫成 regression guard 並誠實標註，SHALL NOT 用 mutation check 偽造紅燈；單檔測試用 `pnpm --filter ./nextjs-pickball test --run <path>`（`--run` 前不加 `--`）；不切分支、不 merge、不新增相依、不改 `components/ui/**`；殘留 process 以 PID kill，SHALL NOT `pkill -f`；commit 訊息結尾附 `Claude-Session: https://claude.ai/code/session_01QfrBTodXSgAJUDJosNFGzQ`
- **Not given**：其他群組的任務、與本 change 無關的 capability spec

以「群組」為派工單位（每組一個 Implementer），組內任務依序完成並各自 commit（RED 與 GREEN 分開 commit）。

## Roles

### Implementer

- **default_model**: `sonnet`（專案規定：Implementer 使用 sonnet，不用 haiku）
- **upgrade_to_sonnet_when**: 不適用（預設即 sonnet）
- **upgrade_to_opus_when**:
  - 同一 reviewer 連續退回 3 次後重派
  - 遇到 BLOCKED 後重派

### Spec Reviewer (Stage 1)

- **default_model**: `sonnet`
- **rationale**: 比對 spec 與程式碼需要中等判斷力
- **Review checklist**:
  - [ ] 每個 Requirement／Scenario 都有對應實作與測試？
  - [ ] 是否做了 spec 沒要求的事（例如順手改配色、加動畫、改字型、動到其他五處圖示）？
  - [ ] RED 測試是否對應正確的 Scenario，且紅燈為真（commit 歷史中 RED 早於 GREEN）？
  - [ ] GREEN 是否只滿足 RED，沒有動到不相干的 Requirement？
- **Never reviews**: 命名／結構／品質（Stage 2 範圍）

### Code-Quality Reviewer (Stage 2)

- **default_model**: `opus`
- **rationale**: 慣用法、邊界情況與可讀性最受益於最強模型
- **Review checklist**:
  - [ ] 命名清楚且與既有風格一致？
  - [ ] 有無重複？
  - [ ] 圖示在原本的字級與行高下對齊（測驗結果段落、對話框標題）？
  - [ ] 魔術數字／字串是否該抽出？
  - [ ] 可讀性與註解密度與周邊一致？
- **Never reviews**: spec 是否正確（Stage 1 已處理）

### Final Code Reviewer (integration)

- **default_model**: `opus`
- **rationale**: 跨群組整合審查需要掌握整個 change
- **Review checklist**:
  - [ ] 各群組的命名與寫法一致？
  - [ ] 有無各群組各自引入、應合併的重複邏輯？
  - [ ] 合併 diff 是否只限於 proposal 範圍（以 `git diff change/remove-emoji --stat` 檢查，不含 globals.css、layout.tsx、icon.svg、components/ui、package.json）？
  - [ ] 最終狀態完整測試套件全綠？
- **Never reviews**: 單一任務的 spec 符合度或品質細節

## Escalation

- Implementer 被同一 reviewer 連續退回 3 次 → 升級為 opus 重派
- Spec Reviewer 判斷前後不一致 → 回報主對話，由使用者釐清 spec
- Code-Quality Reviewer 與 Implementer 風格意見衝突 → 以既有程式碼風格為準
- 任一階段 BLOCKED 超過 30 分鐘 → 回報使用者
