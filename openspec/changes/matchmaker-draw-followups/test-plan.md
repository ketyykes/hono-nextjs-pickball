> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> **範圍說明**：本 change 的兩份 delta spec 皆為 MODIFIED，兩者都保留了大量**逐字複製、
> 行為未變**的既有 Scenario（例如「出場數為零時勝率為零」「時間到播放提示音且同一次到期只
> 播放一次」）——它們已有既有測試覆蓋，本 change 不新增也不修改對應測試，因此**本檔只列出
> 行為有變（新增或既有斷言內容改變）的 Scenario**。tasks.md 的「§1 前置確認」會標明哪些
> 既有 Scenario 保持不動、不需要 RED。
>
> Tier 對照本 change 觸及的分層：
> - `unit`：`lib/matchmaker/player-stats.ts` 的純函式，Vitest + happy-dom
> - `integration`：`components/matchmaker/PlayerStatsTable.tsx`、
>   `components/matchmaker/RoundTimerBanner.tsx`，Vitest + `@testing-library/react`
> - `e2e`：`tests/e2e/specs/player-stats.spec.ts`（Playwright），用於欄位名稱與 390px
>   溢出這類只有整頁渲染才成立的 Scenario
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> ⚠️ **本 change 有兩條「加入即綠」的既有測試更新**（design Decision 6、Context 證據四），
> MUST 在 tasks.md 誠實標註為 regression guard，SHALL NOT 偽造紅燈：
> ① E2E 欄名陣列由「勝負」改為「勝負和」——既有斷言為 `toContainText` 子字串比對，改前改後
> 皆綠；② 既有 it「時間到時顯示帶 role alert 的時間到大字與繁體中文提示文案」以 import 的
> 常數斷言，改字串後仍綠。真正的紅燈在下表兩條**新增**的測試。

## player-stats

### Requirement: 出場、勝負與勝率的計算

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 平局紀錄計為和局而非雙方各一敗場 | 平局紀錄計為和局而非雙方各一敗場 | 兩位球員對戰兩場（一場 `winner: "teamA"`、一場 `winner: "draw"`）→ 勝方 `gamesPlayed: 2`／`wins: 1`／`losses: 0`／`draws: 1`／`winRate` 為 `1/2`；敗方 `gamesPlayed: 2`／`wins: 0`／`losses: 1`／`draws: 1` | golden path：本 change 的核心缺陷。現行 `tallyGamesAndResults` 的 `else` 分支會讓兩人的 `losses` 各多 1（勝方變 1、敗方變 2），這條測試直接釘住三分互斥。**同時斷言雙方**是必要的——只看單邊會漏掉「只修了其中一隊的判斷」這種半套實作 | unit |

### Requirement: 統計頁的路由與呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 勝負和欄依序顯示勝場敗場與和局三個數字 | 勝負和欄依序顯示勝場敗場與和局三個數字 | 渲染一列 `wins: 2`／`losses: 1`／`draws: 1` 的 `PlayerStat` → 該列的勝負和欄文字依序含 `2`、`1`、`1`；表格標題列的該欄名稱為「勝負和」 | golden path：這是**唯一**能證明標題確實改名、且第三個數字確實渲染出來的測試。既有 E2E 用 `toContainText` 子字串比對，「勝負」在改名後依然命中（design Context 證據四），無法承擔這個責任 | integration |
| 直接開啟 /matchmaker/stats 可載入排行榜表格 | 直接開啟 /matchmaker/stats 顯示排行榜表格 | 既有 E2E 的九項欄名陣列中「勝負」改為「勝負和」，其餘八項與其他斷言逐字不變 | regression guard（**加入即綠**，見本檔開頭 ⚠️）：既有斷言為子字串比對，改前改後皆通過。仍要改，是為了讓這份清單記載的是**現行**欄名而非過時欄名——不改的話下一個讀這份 E2E 的人會以為標題還是「勝負」 | e2e |

## match-stage

### Requirement: 計時器顯示與時間到提示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 時間到提示文案說明同分可直接送出平手而非再打一球 | 時間到提示文案說明同分可直接送出平手而非再打一球 | 計時到期後，`role="alert"` 區塊內的文字**含**「同分」與「平手」、**不含**「再打一球」 | golden path：既有 it 以 `getByText(ROUND_TIMER_EXPIRED_MESSAGE)` 斷言，import 常數本身，改字串永遠不會紅（恆真斷言）。這條新測試是本 change 對文案的**唯一**真紅燈——現行文案含「再打一球」，寫下即失敗。斷言用語意片段而非整句逐字，理由見 design Decision 6 | integration |

---

## Checklist

- [x] Every requirement listed above has at least one matching test
- [x] 每個新增或行為變更的 Scenario 皆有對應測試；未列出的既有 Scenario 為行為不變、
      沿用既有測試（見本檔開頭「範圍說明」）
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use 中文完整句子，且與 delta spec 的「驗收」錨點逐字一致
- [x] 加入即綠的項目已在本檔與 tasks.md 標為 regression guard，未偽裝成紅燈
