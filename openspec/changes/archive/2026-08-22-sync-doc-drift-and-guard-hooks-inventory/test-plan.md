# Test Plan — sync-doc-drift-and-guard-hooks-inventory

> ⚠️ **本 change 的兩個 test case 都是 regression guard，不是 TDD 紅燈。**
> 被守護的行為（清單與檔案一致）在寫測試前已經成立——`2026-08-22-sync-hooks-inventory-after-roster-store`
> 剛把 `useRosterStore` 補進清單。依 root `CLAUDE.md`「紅燈要是真的」，此處誠實標註為
> regression guard，**不以 mutation check（改斷言看紅再改回）偽造紅燈**。
>
> 「Why first」欄因此記錄的是**為何值得寫**，而非「為何必須先寫」。

## pickleball-guide-page

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| hooks 目錄下每支 hook 都能在規格的歸屬清單中找到 | hooks 目錄的每支 hook 都在歸屬清單內 | 讀 `nextjs-pickball/hooks/` 下非測試檔的 hook 名稱 → 每一支都出現在 spec.md 該 Requirement 區塊內 → `missing` 為 `[]` | regression guard：同一漏更新已發生兩次（`4c5b724`、`add-player-roster`），散文規則證實擋不住 | unit |
| 歸屬清單提及的每個 hook 名稱都有對應檔案 | 歸屬清單提及的 hook 都有對應檔案 | 從該 Requirement 區塊抽出所有 `useXxx` 名稱 → 每個名稱在 `nextjs-pickball/hooks/` 有同名 `.ts` 或 `.tsx` → `stale` 為 `[]` | regression guard：守反向漂移（hook 被移除或改名而清單留著舊名） | unit |

## dev-workflow

### Requirement: 單檔測試指令必須能過濾出單一測試檔

無新增測試。本 Requirement 的改動只有「指令來源檔」的指標更正，其 Scenario 以 `grep` 人工驗收
（既有表述，本 change 未改變驗收方式）。

### Requirement: agent 資產與設計文件只有一份來源

無新增測試。同上，Scenario 皆為文件檢查表述。

## 驗證檢查

- 每個 requirement 至少一個 test：`pickleball-guide-page` 2 個；`dev-workflow` 2 條 Requirement
  的改動屬文件層，以 Scenario 內的 `grep` 指令驗收（見 tasks 的完成驗收區塊）
- 每個新增 Scenario 至少一個 test：2/2 對應
- 每列都有 Tier：是（皆為 unit）
