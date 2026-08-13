> **TDD 適用性**：本 change 的所有異動都是 `.md` 文件，全數落在 `openspec/config.yaml`
> 定義的 TDD 範圍之外（該範圍為 `nextjs-pickball/{app,components,hooks,lib,data}/**`
> 與 `hono-pickball/src/**`），連可掛測試的模組都不存在。
> 依 config 的「例外層 task 不強制三步拆分，但至少要指定驗收方式」處理：
> 每個 task 附一條可在 repo root 執行的 shell 驗收指令與期望輸出。
>
> **不得偽造紅燈。** 對一個還沒寫的檔案跑 grep 必然失敗，那不是 TDD 紅燈。
> 下方 1.1 的「現況存證」只是為了在 verify 階段能對照前後差異，不是三步流程的第一步。

## 1. 現況存證

- [x] 1.1 執行下列指令並把輸出貼進本檔末尾的「執行紀錄」，作為修改前的基準（**此步不做任何修改**）：
  ```bash
  ls hono-pickball/AGENTS.md 2>&1                       # 期望：No such file
  cat nextjs-pickball/AGENTS.md                          # 期望：5 行，全在 vendor 標記內
  sed '/BEGIN:nextjs-agent-rules/,/END:nextjs-agent-rules/d' nextjs-pickball/AGENTS.md
                                                         # 期望：空（標記外零內容）
  grep -n "AGENTS.md" README.md                          # 期望：:17 與 :72 兩處
  ```

## 2. hono-pickball 入口（新檔，無依賴，先做）

- [x] 2.1 新增 `hono-pickball/AGENTS.md`，純指標檔（繁中），內容須包含：
  - 明示「本檔只放指標，不放內容」，規範單一來源為同層 `./CLAUDE.md`
  - 相對路徑連結：`./CLAUDE.md`（後端 workspace 細節）、`../AGENTS.md`（root 治理入口）、`../CLAUDE.md`（規範單一來源）
  - 比照 root `AGENTS.md` 的警語：若工具不會自動跟隨連結，請主動讀入
  - **不得**寫入任何規則內文（TDD 三步、change 流程、埠號等一律不抄）
- [x] 2.2 驗收：
  ```bash
  test -f hono-pickball/AGENTS.md && echo OK                    # 期望：OK
  grep -c "\./CLAUDE.md" hono-pickball/AGENTS.md                # 期望：≥ 1
  grep -c "\.\./AGENTS.md" hono-pickball/AGENTS.md              # 期望：≥ 1
  ls hono-pickball/CLAUDE.md AGENTS.md CLAUDE.md                # 期望：三個路徑皆存在
  ```
- [x] 2.3 確認**不**在 `hono-pickball/CLAUDE.md` 加 `@AGENTS.md`（design D-4：純指標檔被 import 會造成兩檔互指，違反主 spec `:154` 的不互指原則）：
  ```bash
  head -1 hono-pickball/CLAUDE.md    # 期望：# CLAUDE.md（不是 @AGENTS.md）
  ```

## 3. nextjs-pickball 入口

- [x] 3.1 把 `<!-- BEGIN:nextjs-agent-rules -->` 與 `<!-- END:nextjs-agent-rules -->` **之間**的內容替換為 next `16.2.9` 官方現行範本（來源：`nextjs-pickball/node_modules/next/dist/docs/01-app/02-guides/ai-agents.md:66-74`）：

  ```md
  <!-- BEGIN:nextjs-agent-rules -->

  # Next.js: ALWAYS read docs before coding

  Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

  <!-- END:nextjs-agent-rules -->
  ```

  這段**維持英文**（vendor 內容，非專案註解，繁中規則不適用）。
- [x] 3.2 在 `<!-- END:nextjs-agent-rules -->` **之後**新增專案指標段（繁中），內容須包含：
  - 明示「以下為專案指標，不放規則內文」，規範單一來源為同層 `./CLAUDE.md`
  - 相對路徑連結：`./CLAUDE.md`（前端 workspace 細節）、`../AGENTS.md`（root 治理入口）、`../CLAUDE.md`（規範單一來源）
  - 同樣的「工具不跟隨連結請主動讀入」警語
  - 註明上方區段由 Next.js 管理、專案內容不得寫入標記內
- [x] 3.3 驗收（**3.3 的第二條是本 change 最關鍵的驗收**，證明指標段不會隨 vendor 更新被吃掉）：
  ```bash
  sed -n '/BEGIN:nextjs-agent-rules/,/END:nextjs-agent-rules/p' nextjs-pickball/AGENTS.md \
    | grep -c "ALWAYS read docs before coding"              # 期望：1
  sed '/BEGIN:nextjs-agent-rules/,/END:nextjs-agent-rules/d' nextjs-pickball/AGENTS.md \
    | grep -c "\./CLAUDE.md"                                # 期望：≥ 1（刪掉 vendor 區段後指標仍在）
  grep -c "\.\./AGENTS.md" nextjs-pickball/AGENTS.md        # 期望：≥ 1
  ```
- [x] 3.4 確認 `nextjs-pickball/CLAUDE.md:1` 的 `@AGENTS.md` 未被動到：
  ```bash
  head -1 nextjs-pickball/CLAUDE.md    # 期望：@AGENTS.md
  ```

## 4. README 措辭

- [x] 4.1 修正 `README.md:72`「各 workspace 細節」段落：規範內文的來源標為該層 `CLAUDE.md`，`AGENTS.md` 標為非 Claude agent 的入口指標，並補上 `hono-pickball/AGENTS.md` 連結。前後端兩行措辭一致。
- [x] 4.2 驗收：
  ```bash
  grep -n "AGENTS.md" README.md                       # 檢視措辭：AGENTS.md 不得被描述為「規範」來源
  grep -c "hono-pickball/AGENTS.md" README.md         # 期望：≥ 1
  ```

## 5. 同步主 spec

- [x] 5.1 用 openspec 流程把 `specs/dev-workflow/spec.md` 的 delta 併入主 spec（`/opsx:sync`，或於 archive 時一併完成）。**不得手動編輯 `openspec/specs/dev-workflow/spec.md`** —— root `CLAUDE.md` 明令，且歷史上 `e5b709c`／`c7f4f7e`／`ea7955d` 已造成 `changes/archive/` 無法重建主 spec。
- [x] 5.2 驗收：
  ```bash
  grep -c "含 \`CLAUDE.md\` 的目錄" openspec/specs/dev-workflow/spec.md    # 期望：≥ 1
  grep -c "Scenario: 專案指標位於第三方受管區段之外" openspec/specs/dev-workflow/spec.md  # 期望：1
  git diff --stat openspec/specs/dev-workflow/spec.md                      # 期望：只有本 change 的 Requirement 段落被動到
  ```

## 6. 整體驗收（對應 delta spec 的每個新 Scenario）

- [x] 6.1 **每個含 CLAUDE.md 的目錄都有 AGENTS.md**：
  ```bash
  for f in $(git ls-files "*CLAUDE.md"); do
    d=$(dirname "$f"); [ -f "$d/AGENTS.md" ] || echo "MISSING: $d"
  done
  # 期望：無輸出（現況應涵蓋 repo root、nextjs-pickball/、hono-pickball/）
  ```
- [x] 6.2 **規則內文不重複於 workspace 層 AGENTS.md**：
  ```bash
  grep -nE "mutation check|e5b709c|EPERM|--run" nextjs-pickball/AGENTS.md hono-pickball/AGENTS.md
  # 期望：無命中（exit 1）
  ```
- [x] 6.3 **第三方 skill 的 AGENTS.md 未被誤改**：
  ```bash
  git status --porcelain .agents/     # 期望：無輸出
  ```
- [x] 6.4 **openspec 驗證**：
  ```bash
  DO_NOT_TRACK=1 openspec validate workspace-agents-md-pointer --type change --strict --no-interactive
  # 期望：exit 0
  ```
- [x] 6.5 **確認未誤觸程式碼**：
  ```bash
  git status --porcelain | grep -vE "\.md$"    # 期望：無輸出（本 change 只動 .md）
  ```
- [x] 6.6 跑 `/opsx:verify` 做最終一致性檢查，再進 archive。

## 7. verify 發現的收尾（後補）

- [x] 7.1 把 BSD `uniq` 誤判中文標題的稽核陷阱寫進 root `CLAUDE.md` 的「執行環境注意」。
  放這裡而非 tasks.md 的理由：tasks.md 會被 archive 成歷史紀錄，下次做文件稽核的人不會去翻它，
  陷阱一定會再咬一次；`CLAUDE.md` 才是 agent 每次都會讀到的地方。與既有的
  `listen EPERM 127.0.0.1` 同性質（錯誤訊息不是它看起來的樣子），並列在同一節。
- [x] 7.2 驗收（含**對照組**，確認新指令不是永遠印「無重複」的假檢查）：
  ```bash
  # 正常檔案
  python3 -c "…" openspec/specs/dev-workflow/spec.md          # 得到：無重複
  # 對照組：附加一行重複的 Requirement 標題
  { cat openspec/specs/dev-workflow/spec.md; echo; echo "### Requirement: agent 資產與設計文件只有一份來源"; } > /tmp/dup-test.md
  python3 -c "…" /tmp/dup-test.md
  # 得到：[('### Requirement: agent 資產與設計文件只有一份來源', 2)]  ← 確實抓得到
  ```
- [x] 7.3 同步 `proposal.md` 的 Impact 表，補上 `CLAUDE.md`（root）並說明為何不寫進 spec。

## 執行紀錄

以下皆為 2026-08-13 於 repo root 實測輸出。

### 1.1 修改前基準

```
$ ls hono-pickball/AGENTS.md
ls: hono-pickball/AGENTS.md: No such file or directory

$ cat -n nextjs-pickball/AGENTS.md
     1  <!-- BEGIN:nextjs-agent-rules -->
     2  # This is NOT the Next.js you know
     3
     4  This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
     5  <!-- END:nextjs-agent-rules -->
行數: 5

$ sed '/BEGIN:nextjs-agent-rules/,/END:nextjs-agent-rules/d' nextjs-pickball/AGENTS.md | wc -c
       0                       ← 標記外零內容

$ sed '/BEGIN.../,/END.../d' nextjs-pickball/AGENTS.md | grep -c "\./CLAUDE.md"
0  (exit 1)                    ← 指標段不存在

$ grep -n "AGENTS.md" README.md
17:├─ AGENTS.md               ← 非 Claude agent 的入口（只放指標；規範內文見 CLAUDE.md）
72:- 前端規範：見 [`nextjs-pickball/CLAUDE.md`](...)、[`nextjs-pickball/AGENTS.md`](...)
```

> 備註：`cat -A` 在 macOS 的 BSD cat 不支援（`illegal option -- A`），改用 `cat -n` + `wc -c`。

### 2.2 / 2.3 hono-pickball 入口

```
存在: OK
./CLAUDE.md 命中: 5          （期望 ≥ 1）
../AGENTS.md 命中: 1         （期望 ≥ 1）
連結目標: AGENTS.md / CLAUDE.md / hono-pickball/CLAUDE.md / openspec/config.yaml 皆存在
head -1 hono-pickball/CLAUDE.md → "# CLAUDE.md"（確認未加 @AGENTS.md，符合 design D-4）
```

### 3.3 / 3.4 nextjs-pickball 入口

```
vendor 區段含 "ALWAYS read docs before coding": 1        （期望 1）
刪除 vendor 區段後 "./CLAUDE.md" 命中: 5                 （期望 ≥ 1；修改前為 0）★關鍵驗收
"../AGENTS.md" 命中: 1                                   （期望 ≥ 1）
head -1 nextjs-pickball/CLAUDE.md → "@AGENTS.md"（未被動到）
```

### 4.2 README

```
72:規範內文的單一來源是各層的 `CLAUDE.md`；同層 `AGENTS.md` 只是非 Claude agent 的入口指標，不含規範內文。
74:- 前端：規範見 [...CLAUDE.md]；入口指標 [...nextjs-pickball/AGENTS.md]
75:- 後端：規範見 [...CLAUDE.md]；入口指標 [...hono-pickball/AGENTS.md]
hono-pickball/AGENTS.md 命中: 1
```

`README.md:17`（結構圖中的 root `AGENTS.md`）措辭本就正確，未修改。

### 5.2 主 spec 同步

以 `/opsx:sync` 的 agent 驅動合併方式套用 delta（兩處外科式插入，未整段覆寫），**未手動改寫既有內容**：

```
$ git diff --stat openspec/specs/dev-workflow/spec.md
 openspec/specs/dev-workflow/spec.md | 41 +++++++++++++++++++++++++++++++++++++
 1 file changed, 41 insertions(+)          ← 純新增、0 刪除，既有 Scenario 全數保留

含 `CLAUDE.md` 的目錄: 2 處命中
Scenario: 專案指標位於第三方受管區段之外: 1
$ openspec validate dev-workflow --type spec --strict → "is valid" (exit 0)
```

### 6.1–6.5 整體驗收

```
6.1 for f in $(git ls-files "*CLAUDE.md"); ... → 無 MISSING 輸出（root / nextjs-pickball / hono-pickball 三處皆有 AGENTS.md）
6.2 grep -nE "mutation check|e5b709c|EPERM|--run" nextjs-pickball/AGENTS.md hono-pickball/AGENTS.md → 無命中（exit 1）
6.3 git status --porcelain .agents/ → 無輸出
6.4 openspec validate workspace-agents-md-pointer --type change --strict → "is valid" (exit 0)
6.5 git status --porcelain：
     M README.md
     M nextjs-pickball/AGENTS.md
     M openspec/specs/dev-workflow/spec.md
    ?? hono-pickball/AGENTS.md
    ?? openspec/changes/workspace-agents-md-pointer/
    → 唯一的非 .md 項目是本 change scaffold 的 .openspec.yaml（在未追蹤目錄內），無任何原始碼異動
```

### 6.6 verify 結果

`/opsx:verify` 已執行，把 delta spec 的 **11 個 Scenario 全部化為可執行檢查**（含 5 個既有 Scenario 的 regression），
共 29 項斷言全數通過；design.md 的 D-1～D-5 五項決策逐項核對亦全數符合。細節：

```
既有 5 個 Scenario（regression）      pass=11 fail=0
新增 6 個 Scenario                    pass=18 fail=0
D-1 指標段在 END 標記之後             END=第 7 行、首個指標=第 20 行 → 順序正確
D-2 vendor 區塊 vs 官方 16.2.9 範本    diff 無輸出（逐字一致，含空行）
D-3 Requirement 用「含 CLAUDE.md 的目錄」  spec.md:156、:162
D-4 hono-pickball/CLAUDE.md 無 @AGENTS.md  grep "^@AGENTS.md" = 0
D-5 無測試檔、無原始碼異動             git status 過濾 .ts/.tsx/.css/.json → 無輸出
delta 的 11 個 Scenario 是否都進主 spec   11/11，各出現 1 次
所有相對連結可解析                     斷連 0（檢查 4 份文件的 ](./…) 連結）
@import 誤判風險                       `npx @next/codemod agents-md` 位於 code span 內；行首 @ 數量 0
openspec validate --changes --specs --strict   8 passed, 0 failed
```

### 未依原計畫執行之處

- **無 TDD 三步、無紅燈**，如本檔開頭所述：全部異動為 `.md`，落在 `openspec/config.yaml` 的 TDD 範圍外，以 grep/ls 驗收。

### archive 時的注意事項

主 spec 已於 5.1 同步完成。`openspec archive` 本身也會 update main specs，**直接 archive 可能重複套用**。
archive 前請先確認：若 CLI 會再次併入 delta，應改用 `openspec archive workspace-agents-md-pointer --skip-specs`，
或 archive 後立刻檢查是否出現重複的 Requirement／Scenario 區塊。

archive 後的重複檢查基準（verify 當下實測）：主 spec 共 **9 個 Requirement、29 個 Scenario，標題全部相異**。

檢查方式**不要用 `sort | uniq -d`**（BSD `uniq` 會誤判中文標題），正確做法與可直接複製的指令已收斂到
repo root 的 `CLAUDE.md`「執行環境注意」一節 —— 見 task 7.1。此處不重複記載。

（此處刻意不用相對路徑連結：本檔 archive 後會多一層 `archive/`，任何寫死的 `../` 深度都會失效。）
