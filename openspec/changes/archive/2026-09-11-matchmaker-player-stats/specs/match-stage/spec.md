# Specification: match-stage

## MODIFIED Requirements

### Requirement: 對戰頁路由與 matchmaker 區段動線

系統 SHALL 於 `/matchmaker` 提供對戰頁（場次舞台），實作入口為
`nextjs-pickball/app/matchmaker/page.tsx`。

matchmaker 區段（`/matchmaker` 與 `/matchmaker/players`）SHALL 共用同一個區段外框
`nextjs-pickball/app/matchmaker/layout.tsx`，其中 MUST 包含區段導覽，使兩頁能互相切換，
並以 `aria-current="page"` 標示目前所在頁。SHALL NOT 只在對戰頁提供單向連結——
使用者建立名單後要回頭排對戰、排完對戰要回頭改名單，兩個方向都是常態動線。

區段導覽的分頁清單與 active 判定 MUST 抽為純函式
（`nextjs-pickball/lib/matchmaker/section-nav.ts`）並於該層 TDD，SHALL NOT 只寫在元件內——
依 `nextjs-pickball/CLAUDE.md` 的分層規範，元件的行為邏輯須下放到可單元測試的層級
（既有先例為 `lib/scoreboard/radio-navigation.ts`）。

本 change 新增第五個分頁「統計」（`/matchmaker/stats`），同樣掛載於同一個區段外框並顯示於
區段導覽，分頁清單與 active 判定沿用既有 `matchmakerSectionTabs()` 的推導方式
（`MATCHMAKER_SECTION_HREFS`／`MATCHMAKER_SECTION_LABELS` 各新增一筆），SHALL NOT 另立
第二套判定邏輯。

#### Scenario: 對戰頁可經路由開啟

- **WHEN** 使用者開啟 `/matchmaker`
- **THEN** 顯示對戰頁的場次舞台區域，不出現 404
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「對戰頁可經 /matchmaker 開啟並顯示場次舞台」

#### Scenario: 區段導覽標示目前所在頁

- **WHEN** 以 `/matchmaker` 與 `/matchmaker/players` 兩個路徑分別呼叫分頁清單函式
- **THEN** 對應該路徑的分頁 `active` 為 `true`，另一個為 `false`
- **驗收**：`nextjs-pickball/lib/matchmaker/section-nav.test.ts`，it 名稱「目前路徑對應的分頁為 active，其餘分頁為非 active」

#### Scenario: 兩頁可互相切換

- **WHEN** 於對戰頁點擊區段導覽的「參賽者」，再於名單頁點擊「對戰」
- **THEN** 依序導向 `/matchmaker/players` 與 `/matchmaker`，兩頁皆顯示區段導覽
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「區段導覽可在對戰頁與參賽者名單頁之間來回切換」

#### Scenario: 統計分頁納入區段導覽並可點擊進入

- **WHEN** 於對戰頁點擊區段導覽的「統計」
- **THEN** 導向 `/matchmaker/stats`，且該分頁標示為 `aria-current="page"`
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「可由對戰頁的區段導覽點擊進入統計頁」
