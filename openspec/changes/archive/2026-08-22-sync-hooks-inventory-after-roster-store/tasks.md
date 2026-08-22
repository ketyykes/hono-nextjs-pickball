# Tasks — sync-hooks-inventory-after-roster-store

📋 **歸檔紀錄說明**：本檔 7/7 個 task 有勾選。A2（archive 後的 diff 對帳）與 C2 依其性質
必須在 `openspec archive` 執行後才能驗證，故於歸檔後補記實際結果並勾選 —— 該結果為真實執行所得，
非事後補勾。`openspec archive` 執行當下顯示 `Task status: 5/7`，即為這兩項。

**完成驗收實跑結果（2026-08-22）**：前端 Vitest `39 檔 / 270 測試` 全綠（4.99s）；
`pnpm lint` 0 error（3 個既有 warning，與本 change 無關）；
`openspec validate --all` 9 items 全數 passed；`git diff` 無任何 `.ts` / `.tsx` 檔。

> 分類依 design.md。**本 change 沒有任何三步 TDD task**，也沒有任何程式碼與測試變更。
> 所有指令從 repo root 執行。
>
> ⚠️ 沿用先例 `sync-hooks-inventory-after-focus-mode` 的教訓：**archive 前，一致性檢查要對著
> `changes/.../specs/` 的 delta 跑，不是對著 `openspec/specs/` 的主規格**——修正尚未套用，
> 對主規格跑會把 `useRosterStore` 誤報成「缺歸屬」。archive 後再對主規格跑一次確認。

## A. spec 文字（例外層，delta 已寫好）

- [x] **A1** 驗證 delta 可被 openspec 解析
  - 驗收：`DO_NOT_TRACK=1 openspec validate sync-hooks-inventory-after-roster-store --strict` EXIT=0
- [x] **A2** 確認 delta 內除刻意修改處外，與現行主規格逐字一致
  - 刻意修改處共兩項：① hook 歸屬清單補 `useRosterStore` → player-roster
    ② 單一來源段補記第二次先例（`d00fea6`）與「不得以無關推論無影響」的禁令
  - 驗收：archive 後 `git diff --numstat openspec/specs/` 只出現
    `openspec/specs/pickleball-guide-page/spec.md` 一個檔，且增刪行數與上述兩項吻合
  - ✅ **實際結果（符合期望）**：`git diff --numstat openspec/specs/` 為
    **`4	3	openspec/specs/pickleball-guide-page/spec.md`**，且只有這一個檔案。
    逐項對應：① `:141` 1 刪 1 增；② `:143` 1 刪 1 增；
    ③ **CLI 正規化 3 行**（`## Requirements` 前後各補 1 行空行、移除檔尾多餘空行）——
    這 3 行不是本 change 的編輯，是 `openspec archive` 重寫整檔時的格式正規化。
    合計 3 刪 4 增，與 numstat 完全吻合，無任何非預期內容改動。
    `player-roster/spec.md` 未出現在 diff 中（符合 design.md D3）。
  - 📌 archive 前另已用 `diff` 對過一次：delta 與主規格 `135~165` 行區塊逐字比對，
    只有上述兩行不同，其餘（含 4 個 Scenario）完全一致

## B. 文件同步（例外層）

- [x] **B1** `nextjs-pickball/README.md:48` 的 `hooks/` 註解補上 player-roster
  - 現況：`# 各 capability 的 hooks + tests（scroll/observer、quiz、scoreboard、tour）`
  - 驗收：`grep -n "player-roster" nextjs-pickball/README.md` 有輸出，且該行不寫死數量
- [x] **B2** 驗證 `nextjs-pickball/CLAUDE.md` 的 hooks 分組已含 `player-roster：useRosterStore`
  - 只驗證不修改（見 proposal 的「明確不做」）
  - 驗收：`grep -n "player-roster：\`useRosterStore\`" nextjs-pickball/CLAUDE.md` 有輸出

## C. 一致性檢查

- [x] **C1** 確認 `hooks/` 下每支 hook 都能在歸屬清單中找到（archive 前對 delta 跑）
  ```bash
  SPEC=openspec/changes/sync-hooks-inventory-after-roster-store/specs/pickleball-guide-page/spec.md
  for f in nextjs-pickball/hooks/*.ts; do
    case "$f" in *.test.ts) continue;; esac
    n=$(basename "$f" .ts)
    grep -q "$n" "$SPEC" || echo "缺歸屬：$n"
  done
  ```
  - 期望：無輸出（11 支全部在清單內，含本 capability 自己的 3 支）
- [x] **C2** 確認未動到 player-roster 規格（見 design.md D3）
  - 驗收：`git diff --name-only openspec/specs/` 不含 `player-roster/spec.md`
  - ✅ **實際結果**：輸出只有 `openspec/specs/pickleball-guide-page/spec.md` 一行
- [x] **C3** 確認零程式碼變更
  - 驗收：`git diff --name-only | grep -E "\.(ts|tsx)$"` 無輸出

## 完成驗收

```bash
cd /Users/m2_24gb/Desktop/project/nextjs-pickball

# 1. 主規格已補上 useRosterStore 歸屬（archive 後）
grep -n "useRosterStore" openspec/specs/pickleball-guide-page/spec.md   # 期望 2 處（:141 清單內、:143 先例句內）

# 2. 主規格記錄了兩次先例
grep -n "4c5b724\|d00fea6" openspec/specs/pickleball-guide-page/spec.md  # 期望同一行內兩者皆有

# 3. 每支 hook 都有歸屬（archive 後對主規格再跑一次 C1）
for f in nextjs-pickball/hooks/*.ts; do
  case "$f" in *.test.ts) continue;; esac
  n=$(basename "$f" .ts)
  grep -q "$n" openspec/specs/pickleball-guide-page/spec.md || echo "缺歸屬：$n"
done                                                                     # 期望無輸出

# 4. 零程式碼變更
git diff --name-only | grep -E "\.(ts|tsx)$"                             # 期望無輸出

# 5. 全套測試與型別（應與變更前一致）
pnpm --filter ./nextjs-pickball test --run
pnpm lint
pnpm -r exec tsc --noEmit

# 6. openspec
DO_NOT_TRACK=1 openspec validate --all
```
