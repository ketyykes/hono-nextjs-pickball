# Specification: scoreboard

## MODIFIED Requirements

### Requirement: RWD 排版

系統 SHALL 依 `(orientation: landscape)` 切換兩種排版：橫式時兩隊面板左右並排，直式時上下排並顯示「建議橫向使用」提示橫幅。該橫幅 MUST 可關閉，且關閉狀態 MUST 存於 `sessionStorage`（分頁存活期間有效），SHALL NOT 使用 localStorage —— 換裝置方向的偏好不應跨分頁持久保留。

版面 SHALL 鎖定於視口高度且零垂直捲動：外層容器 MUST 使用 `h-dvh` + `overflow-hidden`（SHALL NOT 使用 `min-h-screen`／100vh —— 行動瀏覽器工具列展開時 100vh 大於可視高度），flex 鏈 MUST 補 `min-h-0` 使子項可收縮。手機直向、手機橫向、平板直向與桌機（含 1024x600 臨界尺寸）MUST 滿足 `scrollHeight <= clientHeight + 1`（容許 1px 次像素誤差），且「贏這球+」與 Undo／重置按鈕的 boundingBox MUST 完整落在 viewport 內（水平與垂直兩軸皆須檢查） —— `overflow-hidden` 使排版錯誤的失敗模式從「可捲動」變成「內容被裁切」，此驗收是唯一防線。

設定列（`ScoreboardSetup`）在窄視口下 MAY 折行為多列：三個控制項加上專注模式按鈕於 390px 寬視口無法單列容納，此折行為**預期行為而非缺陷**（實測折行後設定列約 115px，單列時約 60px）。折行後設定列高度增加，MUST 由多 viewport 零捲動驗收確認分數面板仍完整可見；SHALL NOT 為避免折行而縮減控制項尺寸或控制項間距 —— 縮減設定列容器自身的上下 padding 不在此限。

面板內的**所有**流體尺寸（分數字級、`gap`、`padding`）MUST 以同一基準收斂，即容器查詢單位（cqh/cqw）而非 `dvh`：`dvh` 反映整個視口高度，不會隨設定列折行擠壓掉的面板可用高度而縮小，與會縮小的分數字級步調不一致，內容總高度將超出面板實際可用高度。`justify-content: center` 在無 `safe` 關鍵字時會向頭尾**對稱溢出**，使相鄰面板在分隔線處互相重疊。

由於容器查詢單位在容器**自身**查不到自己（規格上會 fallback 回視口），`gap`／`padding` MUST 掛在 `@container-size` 容器的**內層 wrapper** 而非容器自身。容器自身 MUST 加 `overflow-hidden` 作為次像素殘差的最後防線，使溢出裁切在自己格內而不侵犯相鄰面板的可點擊區域。

**支援範圍下限為 390px 寬**（下方 Scenario 列出的四個 viewport 之最小寬度）。實測 320x568（初代 iPhone SE 尺寸）下名稱行會溢出面板頂部約 0.83px 並被裁切；該尺寸不在支援清單內，**此為已知且接受的限制**。成因是固定尺寸元素（名稱行 + 分數 + 發球指示 + 按鈕）的總高超出面板可用高度，屬結構性問題，SHALL NOT 以調整 `gap`／`padding` 係數嘗試補救 —— 真要支援 390px 以下需重新設計面板組成（例如在極矮面板隱藏發球指示文字），應另案提出。

分數字級 SHALL 隨面板實際可用高度流體縮放：每個 TeamPanel MUST 為 size container（`@container-size`，需 tailwindcss >= 4.3），分數字級 MUST 以容器查詢單位（cqh/cqw）搭配 `clamp()` 表達，`gap`／`padding` 同步流體化；SHALL NOT 以寬度斷點決定字級（如 `md:text-[14rem]` —— 平板直向與橫向手機以寬度誤中大字級正是溢出根因）。

上述禁令**僅及於字級**。`gap`／`padding` MAY 以 orientation 疊加寬度斷點分流密度：直向兩面板垂直對切、橫向並排，同一 cqh 係數在兩種形態下的「面板高度佔比」需求相差近兩倍（平板直向約 5.15%、桌機橫向約 2.83%），單一線性係數只能擇一。分流條件 MUST 精確到不牽動其他形態（實作採 `portrait:md:`，只命中「直向且寬 ≥768px」，手機直向與橫向手機皆不受影響）。字級 SHALL NOT 比照辦理 —— 字級已用 `min(37cqh,38cqw)` 讓兩種形態共用同一組平滑曲線，重新引入斷點正是先前的溢出根因。

實作位於 `nextjs-pickball/hooks/useOrientation.ts` 與 `nextjs-pickball/components/scoreboard/`。

#### Scenario: 橫式排版（landscape）

- **WHEN** `window.matchMedia("(orientation: landscape)").matches === true`
- **THEN** 兩隊面板左右並排（flex-row），分數大字，發球指示顯示
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「橫式 viewport 兩隊面板左右並排」

#### Scenario: 直式排版（portrait）

- **WHEN** `window.matchMedia("(orientation: landscape)").matches === false`
- **THEN** 兩隊面板上下排（flex-col），上方顯示「建議橫向使用」提示橫幅
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「直式 viewport 顯示「建議橫向使用」提示橫幅」

#### Scenario: 提示橫幅可關閉

- **WHEN** 使用者按下提示橫幅的關閉按鈕（`X` 圖示，accessible name「關閉提示」）
- **THEN** 橫幅消失，`sessionStorage["scoreboard:hint-dismissed"]` 設為 "1"；分頁存活期間不再顯示
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「直式提示橫幅可關閉並記入 sessionStorage」

#### Scenario: 多 viewport 零捲動

- **GIVEN** viewport 為 390x844（手機直向）、844x390（手機橫向）、768x1024（平板直向）或 1024x600（桌機臨界）之一
- **WHEN** 開啟 `/scoreboard`
- **THEN** `document.scrollingElement.scrollHeight <= clientHeight + 1`（容許次像素誤差），且「贏這球+」（兩顆）與「撤銷上一分」「重置比賽」按鈕的 boundingBox 完整落在 viewport 內
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」

#### Scenario: 設定列折行不破壞零捲動

- **GIVEN** viewport 為 390x844（手機直向），設定列因三個控制項而折為兩列
- **WHEN** 開啟 `/scoreboard`
- **THEN** 仍滿足零捲動驗收，且兩顆「贏這球+」與 Undo／重置按鈕的 boundingBox 完整落在 viewport 內
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」（既有 test 涵蓋，本情境為其在三控制項下的再確認）

#### Scenario: 核心按鈕不得被其他元素遮蔽

- **GIVEN** 任一支援的 viewport，**特別是高度最受限者**（Playwright `mobile-safari` project 的預設 viewport 為 390x664，是五個 project 中最矮；`mobile-chrome` 為 390x727）
- **WHEN** 點擊「贏這球+」、Undo 或重置按鈕
- **THEN** 點擊 MUST 實際命中目標按鈕，SHALL NOT 被隊伍面板名稱行或其他元素的 subtree 攔截
- **理由**：boundingBox 落在 viewport 內**不等於**可點擊 —— 兩個元素可以各自都在 viewport 內卻互相重疊。本 change 曾因設定列折行增高使 TeamPanel 內容溢出自身 box 約 10px、在分隔線處與相鄰面板碰頭，當時「多 viewport 零捲動」驗收全數通過卻仍無法點擊按鈕，即為此缺口的實例
- **與瀏覽器引擎無關**：同一組 390x664 尺寸下，webkit 與 chromium 引擎量測到的 `panelRect`／`buttonRect` 數值完全相同。`mobile-safari` 之所以是唯一失敗的 project，純粹因其預設 viewport 比 `mobile-chrome` 矮 63px，headroom 不足以吸收折行擠壓。驗收 SHALL NOT 僅跑高度較寬裕的 project 就宣告通過
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts` 的既有互動測試（Undo、重置二次確認、localStorage 持久化、連贏觸發 GameOverDialog）在 `--project=mobile-safari` 下 MUST 全數通過；Playwright 的 `subtree intercepts pointer events` 錯誤即為此情境失效的訊號

#### Scenario: 面板內容須保留邊界安全餘量

- **GIVEN** viewport 為 390x664（`mobile-safari` project 的預設尺寸，五個 project 中最矮）
- **WHEN** 量測兩個 TeamPanel 的 boundingBox 與其內容（名稱行、「贏這球+」按鈕）的 boundingBox
- **THEN** 內容距面板頂部與底部的餘量 MUST ≥ 4px
- **理由**：「有沒有重疊」是布林判定，餘量被壓到 0.94px 時它仍然回答「沒有」。本 change 曾一度處於這個狀態 —— 全部驗收皆綠，但任何 label 文案加長、按鈕 padding 微調或平台字型 hinting 差異都會使版面重新破裂，且因面板帶 `overflow-hidden` 而表現為靜默裁切。量化餘量使「防護正在變薄」本身成為可偵測的事件，SHALL NOT 僅以「目前沒有重疊」作為通過條件
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「面板內容不得貼齊邊界：底部餘量須保留安全值」。該 test MUST 自行 `setViewportSize(390, 664)` 而非依賴 project 預設值，使五個引擎都在已知最脆弱尺寸下受驗

#### Scenario: 分數字級隨面板高度縮放而非寬度斷點

- **GIVEN** TeamPanel 的可用高度因 orientation 切換、提示橫幅顯示／關閉而改變
- **WHEN** 檢視分數數字的字級來源
- **THEN** TeamPanel 根節點帶 `@container-size`，分數字級以 cqh/cqw + `clamp()` 表達；程式碼中不存在以寬度斷點（`md:` 等）指定分數字級的 class
- **驗收**：`nextjs-pickball/components/scoreboard/TeamPanel.contract.test.ts`（讀取原始碼的契約測試，剝除註解後斷言不存在 `sm|md|lg|xl:text-`，並反向驗證剝除邏輯未空轉）

---
