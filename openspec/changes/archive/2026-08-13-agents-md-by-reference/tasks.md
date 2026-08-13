> **執行順序誠實標註**：1.x 與 2.x 兩組編輯是在本 change 提案**之前**就已完成的 ——
> 當時先動手改文件，改完才發現與 `openspec/specs/dev-workflow/spec.md` 的既有 Scenario 衝突，
> 才回頭補開這個 change。本檔如實記錄該順序，不假裝是先提案後實作。
> 3.x 起為提案後執行。全部 task 屬**文件例外層**（見 design.md D4），
> 不含行為邏輯模組，故不適用 TDD 三步；驗收方式一律為第 4 節的可執行 grep 斷言。

## 1. root CLAUDE.md 收斂為規範單一來源

- [x] 1.1 結構圖中 `AGENTS.md` 該行描述改為「非 Claude agent 的入口；**只放指標不放內容**，規則以本檔為準」
- [x] 1.2 於「結構」與「環境」之間新增「## 不可省略的規則」一節，內含：本節為單一來源的聲明、openspec change 流程要求、主 spec 不可直接編輯（含前科 commit `e5b709c`／`c7f4f7e`／`ea7955d`）、TDD 三步、紅燈要是真的與禁止 mutation check 偽造
- [x] 1.3 「OpenSpec 慣例」補 `DO_NOT_TRACK=1` 建議，並補上指向 `openspec/config.yaml`（TDD 權威來源）與 `openspec/specs/`（正式規格）的相對路徑連結
- [x] 1.4 於「Workspace 細節」之前新增「## 執行環境注意」一節：前端 :3005／後端 :8787、workerd `listen EPERM 127.0.0.1` 非設定錯誤、E2E 兩組 `webServer` 與 service binding 依賴

## 2. root AGENTS.md 改為純指標檔

- [x] 2.1 移除全部規則內文（原「不可省略的規則」「執行環境注意」「目錄約定」三節）
- [x] 2.2 頂端聲明「本檔只放指標，不放內容」，並說明單一來源為 `./CLAUDE.md`、動機是避免兩份文件漂移
- [x] 2.3 保留「依序讀這些」表格，五個項目全部使用相對路徑：`./CLAUDE.md`、`./openspec/config.yaml`、`./openspec/specs/`、`./nextjs-pickball/CLAUDE.md`、`./hono-pickball/CLAUDE.md`
- [x] 2.4 加入顯式警語：工具若不會自動跟隨連結，須主動讀入 `CLAUDE.md`（design.md D2 的緩解措施）
- [x] 2.5 末尾新增「要新增規則時」一節，明文禁止把規則寫回本檔
- [x] 2.6 確認未動 `nextjs-pickball/AGENTS.md` 與 `nextjs-pickball/CLAUDE.md` 首行的 `@AGENTS.md`（Non-Goals）

## 3. 週邊文件同步

- [x] 3.1 `README.md:17` 結構圖對 `AGENTS.md` 的描述由「給所有 coding agent 的入口文件」改為與 `CLAUDE.md` 一致的「只放指標」措辭
- [x] 3.2 確認 `README.md:72` 對 `nextjs-pickball/AGENTS.md` 的引用維持原樣（該檔為 vendor 資產，不在本 change 範圍）

## 4. 驗收（對應 delta spec 的四個 Scenario）

- [x] 4.1 對應「root AGENTS.md 指向規格治理」：`grep -oE '\]\(\./[^)]+\)' AGENTS.md` 取出的每個路徑逐一 `test -e` 皆存在，且五個目標檔案全數出現
  - 實測：5 個路徑全部 OK，5 個目標全部齊備
- [x] 4.2 對應「規則內文不重複於 AGENTS.md」：`grep -c` 於 `AGENTS.md` 搜 `mutation check`、`e5b709c`、`EPERM`、`--run` 皆為 0；同四字串於 `CLAUDE.md` 皆 > 0
  - 實測：AGENTS.md 全為 0；CLAUDE.md 依序為 1／1／1／1（`--run` 命中 `CLAUDE.md:62`）
- [x] 4.3 對應「root CLAUDE.md 自足」：`CLAUDE.md` 內不存在「見 AGENTS.md」之類為取得規範內文而回指的敘述
  - 實測：`CLAUDE.md` 提及 `AGENTS.md` 僅 3 處（L15 結構圖標註、L25-26 單一來源聲明），皆為說明引用方向，非取內容
- [x] 4.4 相容性檢查：`grep -c "openspec" AGENTS.md` > 0，確認 `archive/2026-08-12-docs-and-agent-tree-consolidation/tasks.md:81` 的既有驗收指令仍通過
  - 實測：命中 4 次
- [x] 4.5 `DO_NOT_TRACK=1 openspec validate --changes agents-md-by-reference --strict` 通過
  - 實測：`✓ change/agents-md-by-reference`，Totals: 1 passed, 0 failed

## 5. 套用與收尾

- [x] 5.1 執行 `/opsx:verify` 確認實作與 artifacts 一致
  - 實測：delta spec 五個 Scenario 全數 PASS（含未變更的「agent 資產不重複」與「skills-lock 單一份」：git ls-files 無命中、lock 檔 1 份且 7 條目對應 7 個 skill 目錄）
  - 實測：design D1–D4 與 Non-Goals 皆遵守；`git status` 僅 3 個 markdown 檔變更，vendor 的 `nextjs-pickball/AGENTS.md`、`nextjs-pickball/CLAUDE.md` 無 diff
- [x] 5.2 delta spec 套用至 `openspec/specs/dev-workflow/spec.md`（經 `/opsx:sync` 流程套用，非繞過流程直接編輯主 spec）
  - 實測：`openspec validate --specs dev-workflow --strict` → 7 passed, 0 failed
- [x] 5.3 archive 本 change
  - 實測：已移至 `openspec/changes/archive/2026-08-13-agents-md-by-reference/`
