# Tasks — sync-hooks-inventory-after-focus-mode

📋 **歸檔紀錄說明**：本檔 6/6 個 task 有勾選。
A2（archive 後的 diff 檢查）依其性質必須在 `openspec archive` 執行後才能驗證，
故於歸檔後補記實際結果並勾選 —— 該結果為真實執行所得，非事後補勾。

> 分類依 design.md「TDD 分層判定」。**本 change 沒有任何三步 TDD task**，
> 也沒有任何程式碼與測試變更。所有指令從 repo root 執行。

## 執行中發現

1. **C1 在 archive 前必須對著 delta 檢查，不是對著主規格**：清單修正尚未套用到
   `openspec/specs/`，若照 task 原文對主規格跑迴圈，`useFocusMode` 會被報成「缺歸屬」。
   實際執行時改對 `openspec/changes/.../specs/pickleball-guide-page/spec.md` 跑，
   10 支全數命中；archive 後再對主規格跑一次確認（見完成驗收第 1 項）。
2. **CLAUDE.md 的修法多做了一件事**：除了移除「共 9 支」與補上 `useFocusMode`，
   另在該行標明歸屬的單一來源是 `pickleball-guide-page` 規格。
   依 design.md D1，規則要能被下一個新增 hook 的人看見 —— 那個人多半先讀 CLAUDE.md 而非規格。
3. **本 change 的觸發來源是前一次審查的副產物**：處理 `0700d34` 的星級化 change 時，
   為了同步 `CLAUDE.md` 的 shared 元件數量而讀到同一段落，才發現 hooks 那行也過期。
   當時刻意不順手改，因為那會讓該 change 的影響範圍超出其 proposal 宣告 —— 改由本 change 處理。

## A. spec 文字（例外層，delta 已寫好）

- [x] **A1** 驗證 delta 可被 openspec 解析
  - 驗收：`DO_NOT_TRACK=1 openspec validate sync-hooks-inventory-after-focus-mode --strict` EXIT=0
- [x] **A2** 確認 delta 內除刻意修改處外，與現行主規格逐字一致
  - 刻意修改處共三項：① hook 歸屬清單補 `useFocusMode` ② 新增「此清單為單一來源、新增方 SHALL 一併更新」段 ③ 拆檔結構「另有 6 支」去數字化
  - 驗收：archive 後 `git diff openspec/specs/` 只出現上述三項
  - ✅ **實際結果（符合期望）**：`git diff --numstat openspec/specs/` 為
    **`4	2	openspec/specs/pickleball-guide-page/spec.md`**，且只有這一個檔案。
    逐項對應：① `:139` 該行 1 刪 1 增；② 新增 2 行（空行 + 單一來源段）；③ `:203` 該行 1 刪 1 增。
    合計 2 刪 4 增，與 numstat 完全吻合，無任何非預期改動。
    `scoreboard/spec.md` 未出現在 diff 中（符合 design.md D3）。

## B. 文件同步（例外層）

- [x] **B1** `nextjs-pickball/CLAUDE.md:65`「`hooks/` — 共 9 支與對應測試」→ 移除寫死數量，
      並在 scoreboard 分組補上 `useFocusMode`
  - ⚠️ 該處下方已按 capability 分組列出所有 hook 名稱，數字本身是冗餘資訊
  - 驗收：`grep -n "共 9 支" nextjs-pickball/CLAUDE.md` 無輸出，且 `useFocusMode` 出現在 scoreboard 分組
- [x] **B2** `nextjs-pickball/README.md:48`「9 支 hooks + tests」→ 移除寫死數量
  - 驗收：`grep -n "9 支 hooks" nextjs-pickball/README.md` 無輸出

## C. 一致性檢查

- [x] **C1** 確認 `hooks/` 下每支 hook 都能在規格的歸屬清單中找到
  ```bash
  for f in nextjs-pickball/hooks/*.ts; do
    case "$f" in *.test.ts) continue;; esac
    n=$(basename "$f" .ts)
    grep -q "$n" openspec/specs/pickleball-guide-page/spec.md || echo "缺歸屬：$n"
  done
  ```
  - 期望：無輸出（10 支全部在清單內，含本 capability 自己的 3 支）
- [x] **C2** 確認未動到 scoreboard 規格（見 design.md D3）
  - 驗收：`git diff --name-only openspec/specs/` 不含 `scoreboard/spec.md`

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# 1. 規格已補上 useFocusMode 歸屬
grep -n "useFocusMode" openspec/specs/pickleball-guide-page/spec.md   # 期望 1 處（scoreboard 分組內）

# 2. 規格不再寫死他人可改變的 hook 數量
grep -n "另有 6 支" openspec/specs/pickleball-guide-page/spec.md      # archive 後期望無輸出

# 3. 文件不再寫死 hooks 數量
grep -n "共 9 支\|9 支 hooks" nextjs-pickball/CLAUDE.md nextjs-pickball/README.md   # 期望無輸出

# 4. 零程式碼變更（本 change 不該碰任何 .ts/.tsx）
git diff --name-only | grep -E "\.(ts|tsx)$"   # 期望無輸出

# 5. 全套測試與型別（應與變更前一致）
pnpm --filter ./nextjs-pickball test --run   # 全綠即可
pnpm lint
pnpm -r exec tsc --noEmit

# 6. openspec
DO_NOT_TRACK=1 openspec validate --all
```
