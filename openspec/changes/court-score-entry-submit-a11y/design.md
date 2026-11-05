# Design: court-score-entry-submit-a11y

## Context

- `nextjs-pickball/components/matchmaker/ScoreEntry.tsx`（:45-82）以 `<div>` 排列兩個 `Input` 與一顆 `Button type="button" onClick={handleSubmit}`；`handleSubmit` 只呼叫 `onSubmitScore(teamAValue, teamBValue)`。沒有 `<form>`，Enter 無作用。
- `nextjs-pickball/components/matchmaker/CourtCard.tsx`（:309-315）是 `ScoreEntry` 的唯一使用端，以 `TEAM_LABELS[0]`／`[1]` 為隊伍標籤，`handleScoreSubmit`（:170-172）補上 `match.id` 後往上委派。場地標題為 :239 的 `<h3>第 {match.courtNumber} 場地</h3>`。
- 主 spec `match-stage`「對戰頁的可用性與無障礙」只要求互動控制可存取名稱非空、功能不得只能以滑鼠操作；「手動輸入比分與送出」規範委派與驗證歸屬，兩者都未提 Enter 送出與多場地區分（稽核敘述正確）。
- `MatchStage.tsx` :84 以 `max-md:[&_input]:min-h-11 max-md:[&_button]:min-h-11` 的**後代**選擇器覆寫觸控尺寸，多包一層 `<form>`／`<div role="group">` 不影響命中。
- 以名稱定位比分控制項的既有測試（propose 時 grep）：`CourtCard.test.tsx` 25 行；E2E 64 行（`match-stage.spec.ts` 26、`round-timer.spec.ts` 6、`scoreboard-binding.spec.ts` 7、`visual-export.spec.ts` 1、`user-data/` 四檔 24）。多場地的既有 E2E（`match-stage.spec.ts`「送出比分失敗時 role=alert 只出現在對應的場地卡片…」）以 `[data-testid$="-grid"]` 先限定場地再 `getByLabel`。

## Goals

- 在任一比分欄位按 Enter 即送出，行為與點「送出比分」完全相同（同一函式、同樣傳原始字串）。
- 多場地時，輔助科技與以 role／name 定位的自動化能區分每個場地的比分控制項。
- 既有測試零修改。

## Non-Goals

- 版面、尺寸、`inputMode`、數字鍵盤樣式。
- 送出資料流、驗證規則、hooks、後端、核心套件。
- 其他頁面的表單、計分板頁。
- 送出成功後清空欄位或移動焦點（現行行為不變）。

## Decisions

### Decision 1：以 `<form onSubmit>` 取得 Enter 送出，按鈕改 `type="submit"`

`ScoreEntry` 的外層改為 `<form onSubmit={handleFormSubmit}>`，`handleFormSubmit(event)` 先 `event.preventDefault()` 再呼叫既有 `onSubmitScore(teamAValue, teamBValue)`；按鈕改 `type="submit"`、移除 `onClick`。
點按鈕與 Enter 都經由瀏覽器原生的隱式送出（implicit submission）進入同一個 submit handler，沒有第二條路徑。已完成場次的欄位與按鈕皆 `disabled`：disabled 欄位無法取得焦點，且預設按鈕 disabled 時瀏覽器不做隱式送出，兩層都擋住。

- 替代方案 A：在兩個 `Input` 上掛 `onKeyDown`，偵測 `Enter` 時呼叫 `handleSubmit`——要自行處理 IME 組字（`isComposing`）與重複觸發，且是第二條送出路徑；捨棄。
- 替代方案 B：保留 `type="button"` 並在 form `onSubmit` 呼叫——按鈕不會觸發 submit，點擊與 Enter 仍是兩條路徑；捨棄。
- 不加 `noValidate`：兩欄為 `type="text"` 且無 `required`／`pattern`，瀏覽器原生驗證不會介入；加了也無作用，最小改動不加。
- 不在 `handleFormSubmit` 額外判斷 `disabled`：disabled 的原生語意已擋住，重複防線屬臆測性程式碼。

### Decision 2：採方案 (a)——具名群組，不改個別控制項名稱

兩個比分欄位與送出按鈕包進 `<div role="group" aria-label={groupLabel}>`，`groupLabel` 由 `CourtCard` 傳入「第 ${match.courtNumber} 場地比分」。欄位與按鈕的 `Label` 文字、按鈕文字一律不動。

- 理由：① 既有約 89 行以「第一隊比分」「第二隊比分」「送出比分」定位的測試全部不必改（Playwright `getByLabel` 與 Testing Library `getByLabelText` 雖也會比對 `aria-label`，但「第 N 場地比分」不含「第一隊比分」等子字串，不會多命中）；
  ② 主流螢幕閱讀器（NVDA、JAWS、VoiceOver）在焦點進入具名 `group` 時會先讀出群組名稱，再讀欄位名稱，足以區分場地；③ 以 role／name 定位的自動化可用 `getByRole("group", { name: "第 2 場地比分" })` 限定範圍。
- 替代方案 (b)：把名稱改為「第 N 場地第一隊比分」——每個控制項自帶場地，在瀏覽模式逐項閱讀時更直接；但需授權改寫約 89 行既有測試、也改了可見文字或需另加 `aria-label` 使可見文字與名稱不一致（WCAG 2.5.3 Label in Name 的風險），範圍遠超本 change；捨棄。
- 替代方案 `<fieldset>`＋`<legend>`：語意相同，但 `legend` 為可見文字（或需 sr-only），且 fieldset 的 `min-inline-size: min-content` 與 grid 內版面互動需額外驗證；`role="group"`＋`aria-label` 零版面影響，選後者。
- 替代方案 `aria-labelledby` 指向 `<h3>` 場地標題：名稱會是「第 N 場地」而少了「比分」語意，且需把 `<h3>` 的 id 從 `CourtCard` 往下傳；選字串 prop 較單純。
- 不把群組做在 `<form>` 本身：HTML-ARIA 不允許 `form` 元素改為 `role="group"`；具名 `form` 則會成為 `form` landmark，每個場地一個 landmark 會讓 landmark 清單變吵。因此 `<form>` 不給名稱、群組另包一層。
- `role="alert"` 的錯誤訊息留在群組外、`<form>` 內，位置與現行相同。

### Decision 3：`groupLabel` 為必填 prop、由 `CourtCard` 組字

`ScoreEntry` 只有 `CourtCard` 一個使用端；設為必填讓型別系統保證不會出現無名群組。場地編號的組字放 `CourtCard`（它擁有 `match`），`ScoreEntry` 不知道「場地」概念，維持純呈現。

### Decision 4：新增 Requirement 而非 MODIFY 既有兩個

「手動輸入比分與送出」與「對戰頁的可用性與無障礙」的既有 Scenario 與驗收錨點都不變；新行為集中在一個 ADDED Requirement，避免複製兩個大區塊、也讓 archive 後的差異一目了然。

### Decision 5：TDD 層級——`CourtCard.test.tsx` 單元＋一條 E2E

`ScoreEntry` 沒有獨立測試檔，既有比分行為皆在 `CourtCard.test.tsx` 以 `buildProps`／`buildMatch` 驗收；新 it 沿用同檔與 helper，不新增測試檔。
`user-event` v14 會對 form 內文字欄位的 Enter 執行隱式送出，happy-dom 下即可得到真紅（現行無 form，Enter 無作用）。E2E 驗真實瀏覽器的隱式送出與群組定位。

## Risks / Trade-offs

1. **群組名稱與既有 locator 互撞**：若有測試以 `getByLabel(/場地/)` 之類的寬鬆正規式定位，會多命中群組。propose 時 grep 無此用法；§1 再 grep 一次。
2. **E2E 的 Enter 送出依賴瀏覽器隱式送出**：五個 browser project（含 mobile-safari）行為一致是 HTML 標準要求；若某 project 不一致，證據上報，不得改用點按鈕繞過。
3. **已完成場次的 it 為 regression guard**：現行 Enter 本來就不送出，寫入即綠；其偵測力來自 mutation「移除欄位 disabled」。
4. 螢幕閱讀器在「瀏覽模式」逐行閱讀時可能不讀群組名稱（只在焦點進入時讀）；本 change 接受此取捨（Decision 2 方案 (b) 的代價過高）。

## Migration Plan

無資料或設定遷移；前端單純部署即可。回退為還原兩個產品檔。

## Open Questions

（無）
