## ADDED Requirements

### Requirement: 對戰分配連結

`SiteNavbar` MUST 提供「對戰分配」連結指向 `/matchmaker`，與既有「完整體驗」「計分板」「測驗」
等連結並列顯示。當路由為 `/matchmaker` 時，該連結 MUST 呈現 active 標示樣式。

此連結是 M1（`add-player-roster`）明文遞延的導覽整合：`/matchmaker/players` 當時刻意未掛進
navbar，理由是「功能尚不完整（有名單但還無法產生對戰）」。對戰畫面完成後該理由消失，因此
入口指向對戰頁 `/matchmaker` 而非名單頁——名單頁由 matchmaker 區段內的區段導覽抵達
（見 `match-stage` capability 的「對戰頁路由與 matchmaker 區段動線」Requirement），
SHALL NOT 在全站 navbar 同時放兩條 matchmaker 連結。

`NAV_LINKS` 僅包含公開內容路由的既有約束不變：`/matchmaker` 為公開內容路由，`/health` 仍
SHALL NOT 列入。

#### Scenario: Navbar 顯示對戰分配連結

- **WHEN** 使用者位於任一頁面
- **THEN** Navbar 內可見文字為「對戰分配」的連結，`href === "/matchmaker"`
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「Navbar 顯示對戰分配連結且指向 /matchmaker」

#### Scenario: /matchmaker active 標示

- **WHEN** 路由為 `/matchmaker`
- **THEN** 「對戰分配」連結套用 active 樣式；其餘連結為 muted 樣式
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「路由為 /matchmaker 時對戰分配連結套用 active 樣式」

#### Scenario: E2E 從 Navbar 進入對戰頁

- **WHEN** 從首頁點擊 Navbar 的「對戰分配」連結
- **THEN** 導向 `/matchmaker` 並顯示對戰頁的場次舞台區域
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「從首頁點擊 Navbar 的對戰分配連結進入對戰頁」

## MODIFIED Requirements

### Requirement: 窄螢幕導航呈現

SiteNavbar SHALL 在所有斷點維持 5 個導航連結全部可見，SHALL NOT 收合為漢堡選單或橫向捲動
—— 連結只有 5 個共 15 個中文字，藏起來等於替每一次導航多加一次點擊。

> 本次由 4 個增為 5 個（新增「對戰分配」→ `/matchmaker`）。字數由 11 增為 15，
> 390px 寬視口下的估算餘裕見 design Decision 7；若實測換行，SHALL 先縮短連結文案
> （「對戰分配」→「對戰」），SHALL NOT 改為漢堡選單——「不收合」是本 Requirement 的立場，
> 不因多一條連結而放棄。
>
> 下方「窄螢幕下四個連結全部可見」Scenario 的標題**刻意未改名**：openspec 的 MODIFIED
> 語意是整段取代，改掉 Scenario 標題會被判為「刪除了既有 Scenario」而擋下（實測
> `openspec validate --strict` 會報 `omits scenario(s) the current spec still has`）。
> 該 Scenario 因此原樣保留為既有四條連結的 regression guard，第 5 條連結另立
> 「窄螢幕下對戰分配連結亦可見」一條。兩條合起來即為「5 個全部可見」。

窄螢幕的空間 SHALL 由下列方式讓出：logo 文字（「匹克球指南」）於 `sm` 斷點以下收合、只保留
🏓 圖示；容器間距由 `gap-6 px-6` 縮為 `gap-3 px-4`；連結水平內距由 `px-3` 縮為 `px-2`。

logo 與所有導航連結 MUST 套用 `whitespace-nowrap`。**這是本 Requirement 的核心** ——
實測發現真正的破口不是橫向溢出，而是文字在固定 `h-14`（56px）的 bar 內斷成兩行。

#### Scenario: 窄螢幕下 logo 與導航連結皆不換行

- **GIVEN** viewport 寬度為 390px（iPhone 12）
- **WHEN** 開啟任一路由
- **THEN** logo 與導航連結的高度不高於寬螢幕（1280px）下的高度（容許 4px 字型度量誤差）
- **實測基準**：修正前 logo 高度 20px → **40px**、連結高度 36px → **56px**（皆換行）；修正後兩者在窄寬螢幕一致
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下 logo 與導航連結皆不換行」

#### Scenario: 窄螢幕下四個連結全部可見

- **GIVEN** viewport 寬度為 390px
- **WHEN** 開啟任一路由
- **THEN** 「首頁」「完整體驗」「計分板」「測驗」四個連結皆為 visible
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下四個導航連結全部可見」

#### Scenario: 窄螢幕下對戰分配連結亦可見

- **GIVEN** viewport 寬度為 390px
- **WHEN** 開啟任一路由
- **THEN** 第 5 條連結「對戰分配」亦為 visible，且與其餘四條同列不換行
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下對戰分配連結亦全部可見」

#### Scenario: logo 文字依斷點收合

- **WHEN** viewport 寬度 ≥ 640px（`sm`）
- **THEN** logo 顯示「🏓 匹克球指南」
- **WHEN** viewport 寬度 < 640px
- **THEN** logo 只顯示 🏓，「匹克球指南」文字為 hidden
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「寬螢幕顯示 logo 文字，窄螢幕收合只留圖示」

#### Scenario: 窄螢幕下不橫向溢出

- **GIVEN** viewport 寬度為 390px
- **WHEN** 量測 header 內層容器
- **THEN** `scrollWidth <= clientWidth`
- ⚠️ **此條為輔助斷言，不可單獨作為驗收**：header 是 flex 容器，子元素會被壓縮到剛好填滿寬度，
  因此該等式在修正前後皆恆成立，驗不出換行問題
- **驗收**：`nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`，test 名稱「窄螢幕下導航列內容不橫向溢出」
