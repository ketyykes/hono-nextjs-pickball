> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> 本 change 三項工作皆落在 `nextjs-pickball/CLAUDE.md` 的 TDD 例外層（純呈現型元件與
> Playwright E2E），因此**沒有任何 `unit` 或 `integration` 列**——`EmptyMatches.tsx`、
> `MatchStage.tsx`、`HistoryView.tsx` 皆無單元測試檔（沿用 `EmptyStage.tsx` 的既有慣例：
> 純靜態呈現、無分支決策留在該檔本身），一律以 E2E 驗收（design Context）。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> 最後一節「重設／再排的端到端覆蓋（無對應 spec 異動）」**不對應任何 delta spec 的驗收錨點**——
> 這是刻意的（design Decision 3）：該行為已由 `round-lifecycle` 主 spec 的「重設與重排未完成
> 場次」Requirement 與 `match-stage` 主 spec 既有的「有未完成場次時顯示重設入口」Scenario
> 完整定義，本測試只是為既有行為補一層端到端證據，不新增、不修改任何 Requirement。

## match-stage

### Requirement: 本輪場次為空時的畫面說明

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 回合存在但本輪無場次時顯示說明文字與前往參賽者名單入口 | 回合存在但無場次時顯示說明與下一步入口 | 種 2 位參賽者 → 產生本輪對戰（1 場地單打，剛好用滿 2 人）→ 於參賽者頁把其中一人設為暫停出場 → 回對戰頁點擊「重設／再排」→ `getByTestId("empty-matches")` 可見、內容含指出「本輪目前沒有任何場次」的繁體中文說明；`getByTestId("match-stage-courts")` 筆數為 0；`getByRole("link", { name: "前往參賽者名單" })` 可見且可點擊導向 `/matchmaker/players` | golden path：`round.matches` 為空且 `round !== null` 是已由程式碼證實可達、但目前畫面完全沉默的狀態（proposal Why 第 1 條），也是本 change 三項工作中風險最高的一項——重現步驟本身就是驗收的一部分 | e2e |
| 回合存在且有場次時不顯示本輪場次為空的說明 | 回合存在且有場次時不顯示此說明 | 種 2 位參賽者 → 產生本輪對戰（正常成功，1 場） → `getByTestId("empty-matches")` 筆數為 0 | edge case：只寫「空場次要顯示」容易寫成「永遠顯示」的實作，這條反向斷言擋住那個退化 | e2e |

## match-history

### Requirement: 損毀歷史紀錄的可見提示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示 | 有損毀歷史紀錄時顯示提示 | 以 `page.addInitScript` 種入 `matchmaker:history:v1` = `{version:1, entries:[一筆合法紀錄, 一筆缺必要欄位的不合法紀錄]}` → 開啟 `/matchmaker/history` → `getByRole("alert")` 可見且文字含「1」與「損毀」與「歷史紀錄」；合法那筆紀錄的球員姓名仍可見 | golden path：`droppedCount` 是本 change 要接上的既有欄位，這是它第一次被實際渲染出來 | e2e |
| 沒有損毀歷史紀錄時不顯示損毀提示 | 沒有損毀歷史紀錄時不顯示提示 | 種入僅含合法紀錄的 `matchmaker:history:v1` → 開啟 `/matchmaker/history` → `getByRole("alert")` 筆數為 0；該筆紀錄的球員姓名仍可見 | edge case：只寫「有損毀要顯示」容易寫成「永遠顯示」的實作，這條反向斷言擋住那個退化，也確認提示不會誤跟正常資料一起出現 | e2e |

## match-stage：重設／再排的端到端覆蓋（無對應 spec 異動）

> 見 design Decision 3：本節測試不對應任何**新的**或**被修改的** delta spec 驗收錨點，
> `match-stage` 與 `round-lifecycle` 兩份主 spec 皆維持逐字不變。寫入當下即綠燈屬
> **regression guard**（底層行為已由 `lib/matchmaker/round.test.ts` 與
> `components/matchmaker/RoundControls.test.tsx` 覆蓋且正確），本表僅記錄「為何先寫、
> 斷言什麼」，供 tasks.md 引用同一組 Test name。

| Test name | 對應既有 Scenario（不修改） | Assertion | Why first | Tier |
|-----------|---------------------------|-----------|-----------|------|
| 重設／再排後已完成場次保留、未完成場次重新分配且休息名單排除已比賽者 | match-stage「有未完成場次時顯示重設入口」＋ round-lifecycle「重排保留已完成場次的比分與評分結果」「重排的候選池含休息名單成員但排除已比賽者」 | 種 6 位參賽者 → 增加場地數為 2 → 產生本輪對戰（2 場、各 2 人，2 人休息）→ 於第一場地送出比分 11:7 並確認完成 → 讀 `matchmaker:round:v1` 記錄完成場次 id／比分與待重排場次 id → 點擊「重設／再排」→ 再讀 `matchmaker:round:v1`：完成場次的 id／`scores`／`winner`／`courtNumber` 逐項不變；`matches.length` 仍為 2；非完成場次的 id 與重排前不同（證明真的重新分配而非 no-op）；`restingPlayerIds.length` 仍為 2 且不含完成場次那兩位球員的 id | golden path＋regression guard：`match-stage.spec.ts` 目前只在無關測試裡順手驗過這顆按鈕的可存取名稱，從未真正點擊過、也從未驗證點擊後的真實瀏覽器與 LocalStorage 行為（proposal Why 第 3 條、`matchmaker-runbook.md`「M5 留下的三項已知缺口」第 2 條） | e2e |

---

## Checklist

- [x] Every requirement has at least one matching test（`match-stage`「本輪場次為空時的畫面說明」2 條、`match-history`「損毀歷史紀錄的可見提示」2 條；額外的重設／再排端到端覆蓋不對應新 Requirement，見上方說明）
- [x] Every Scenario (####) has at least one matching test（delta spec 的 4 個 Scenario 各有 1 條）
- [x] Every row has a Tier value（全數為 `e2e`——本 change 全段落在 TDD 例外層，見檔頭說明）
- [x] Test names use imperative form（採本 repo既有慣例：中文完整句子，逐字對應 spec 的「驗收」錨點或 Requirement 標題）
