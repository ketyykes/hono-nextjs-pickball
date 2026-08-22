# Tasks — sync-doc-drift-and-guard-hooks-inventory

> 所有指令從 repo root 執行。
>
> ⚠️ **§1 是 regression guard，不是 TDD 三步**：被守護的行為已成立，測試寫下即綠。
> 依 root `CLAUDE.md`「紅燈要是真的」，此處誠實標註，不以 mutation check 偽造紅燈。
> 因此 §1 沒有 GREEN task —— 沒有實作要寫，測試本身就是交付物。
>
> ⚠️ **archive 前，一致性檢查要對著 `changes/.../specs/` 的 delta 跑**，不是主規格。

## 執行中發現

1. **守衛測試的第一版會空過（實測抓到）**：原本比對範圍取整個 Requirement 區塊。
   但區塊內的**先例敘述**本身就會提到 hook 名稱（`useFocusMode`、`useRosterStore`），
   於是「清單漏列但先例句提過」的 hook 照樣綠燈。
   以腳本模擬三個情境驗證：A（清單刪掉 `useRosterStore`）第一版回報 `[]` —— 空過。
   修正為只取清單段落（Requirement 起始至「此歸屬清單為」之前）後，A 回報 `['useRosterStore']`。
   規格 delta 一併補上此範圍限定，理由寫進 Requirement 本文。
2. **死指標比預估多**：proposal 初稿列 11 處，實際掃出 **19 處、散落 16 個檔案** ——
   多出 `.claude/agents/` 2 份、`.claude/agent-memory/` 1 份、`docs/superpowers/specs/` 2 份。
   proposal 與本檔已更新為實際數字，不留舊估值。
3. **一份歷史設計文件缺頁首標註**：`docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md`
   已被 `tour-experience` 規格取代卻沒有任何標註，讀者會把它當現行規則。
   依 root `CLAUDE.md` 對 `docs/` 的慣例補上，屬本 change 的同族修正（見 2.8）。

## 1. hooks 歸屬清單守衛（`nextjs-pickball/hooks/` — regression guard）

- [x] **1.1 GUARD**：新增 `nextjs-pickball/hooks/hooksInventory.test.ts`，兩個 it
      「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」與
      「歸屬清單提及的每個 hook 名稱都有對應檔案」；比對範圍限定清單段落（見 design D3）
  - ✅ `pnpm --filter ./nextjs-pickball test --run hooks/hooksInventory.test.ts`
    → `Test Files 1 passed (1)`、`Tests 2 passed (2)`
  - ✅ 誠實標註：直接綠燈，如預期（regression guard）
  - ✅ **鑑別力另以腳本驗證**（不動交付物、不改斷言）：
    A 清單漏列 `useRosterStore` → 回報 `['useRosterStore']`；
    B 清單留著不存在的 `useDeletedHook` → 回報 `['useDeletedHook']`；
    C 未動 → 兩者皆 `[]`
- [x] **1.2 REFACTOR**：抽出 `readOwnershipList()` / `listHookNames()` 兩個具名函式，
      邊界字串提為常數並附上「為何不能含先例段」的註解。無其他壞味道

## 2. 指標同步（例外層）

- [x] **2.1** delta 可被 openspec 解析
  - 驗收：`DO_NOT_TRACK=1 openspec validate sync-doc-drift-and-guard-hooks-inventory --strict` EXIT=0
- [x] **2.2** root `AGENTS.md`：表格列的角色改為「workflow schema 與輸出語言設定；不含 TDD 規則內文」；
      「要新增規則時」段改指 `CLAUDE.md`，並保留指向 `openspec/config.yaml` 的連結
      （`dev-workflow` Scenario 要求三個連結都在）
- [x] **2.3** `nextjs-pickball/AGENTS.md`、`hono-pickball/AGENTS.md`：同上修正
- [x] **2.4** `CLAUDE.md`：「只有一行 `schema:`」→ 改為 `schema` 與 `context` 兩項設定，
      並明寫 TDD 規則內文不在該檔
- [x] **2.5** `nextjs-pickball/CLAUDE.md`：同步改正同一句
- [x] **2.6** `docs/superpowers/` 下 6 份歷史文件的頁首註記：「見 `openspec/config.yaml`」
      → 「見 root `CLAUDE.md` 的「常用指令」節」
  - ✅ 只改註記，未動正文的指令原文（design D4）
  - ✅ `grep -rln "見 \`openspec/config.yaml\`" docs/` 無輸出
- [x] **2.7** `.claude/agents/hono-test-writer.md`、`.claude/agents/code-reviewer-readonly.md`：
      TDD 權威來源改指 root `CLAUDE.md` 與各 workspace `CLAUDE.md`
  - 一併修 `.claude/agent-memory/code-reviewer-readonly/project_matchmaker_allocation_engine.md:245`
    引用的 `config.yaml:24` / `config.yaml:18` 兩個已不存在的行號
- [x] **2.8** `docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md`：補頁首
      「已被 openspec 取代」標註，並點名文中對 `openspec/config.yaml` 的指向已失效

## 3. 前端 README 結構區塊（例外層）

- [x] **3.1** `nextjs-pickball/README.md`：`components/` 補上 `layout/`、`matchmaker/`、
      `quiz/`、`scoreboard/`、`tour/` 五個子目錄
  - 同區塊的「11 個」與「7 個 TS 資料檔」實測正確，未動

## 4. 一致性檢查

- [x] **4.1** 全 repo 掃描：不再有任何位置把 `config.yaml` 描述為 TDD 規則來源
  - ✅ 殘留命中只剩三類，皆為正確敘述：主規格中將被本 change 改寫的兩條、
    root `CLAUDE.md` 說明該檔實際內容的兩處、`openspec/schemas/**` 的
    `Output language is controlled by openspec/config.yaml` （GENERATED 檔，且敘述正確）
- [x] **4.2** delta 除刻意修改處外與主規格逐字一致（archive 後對帳）
  - ✅ `git diff --numstat openspec/specs/` 為 `13 5 dev-workflow/spec.md`、
    `18 3 pickleball-guide-page/spec.md`，只有這兩個檔案
  - ✅ 三條 MODIFIED Requirement 以腳本逐字比對，全數原樣存在於主規格
    （delta 區塊字串直接 `in` 主規格內容，非近似比對）
  - ✅ 內容變更逐項對應 design 記錄的取代點：dev-workflow 5 處、pickleball-guide-page 3 處
    （其餘增行為新增的兩條 Scenario 與 CLI 的格式正規化）
- [x] **4.3** 守衛測試在 archive 後對主規格仍為綠
  - ✅ `Test Files 1 passed (1)`、`Tests 2 passed (2)` —— 新 Scenario 併入主規格後仍通過，
    確認新增的規格文字沒有引入不存在的 hook 名稱

## 完成驗收

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball

# 1. 守衛測試存在且為綠
pnpm --filter ./nextjs-pickball test --run hooks/hooksInventory.test.ts

# 2. 沒有殘留的死指標
grep -rln "見 \`openspec/config.yaml\`" docs/                    # 期望無輸出
grep -rn "TDD 相關則寫進" AGENTS.md */AGENTS.md                   # 期望無輸出（已改寫）

# 3. AGENTS.md 未混入規則內文（dev-workflow Scenario）
grep -rn "mutation check\|e5b709c\|EPERM" AGENTS.md */AGENTS.md   # 期望無輸出

# 4. root AGENTS.md 仍含三個必要連結（dev-workflow Scenario）
grep -c "(./CLAUDE.md)\|(./openspec/config.yaml)\|(./openspec/specs/)" AGENTS.md

# 5. 全套測試與型別
pnpm --filter ./nextjs-pickball test --run
pnpm lint
pnpm -r exec tsc --noEmit

# 6. openspec
DO_NOT_TRACK=1 openspec validate --all
```
