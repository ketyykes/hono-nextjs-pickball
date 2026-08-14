## Context

計分板的勝利判定目前是 `nextjs-pickball/lib/scoreboard/rules.ts` 的一行常數比較：

```ts
if (max < 11) return { won: false, winner: null };
```

規則本身只有這一處，但它被兩層機制包住，使「加一個可設定的目標分數」的實際影響面比看起來大：

```
   使用者設定  ──▶  ScoreboardState  ──▶  localStorage["scoreboard:current:v1"]
   (mode,              │                        │
    firstServer)       │                        └─ 讀取時 zod safeParse
                       │                           失敗即 removeItem（靜默清空）
                       ▼
              createInitialState({mode, firstServer})
                       ▲
                       └── reducer.ts 有 4 處呼叫：
                           SET_MODE / SET_FIRST_SERVER / UNDO / RESET
                           UNDO 走「重建初始 state 後 replay history」
```

亦即：新欄位必須同時穿過 **持久化的相容性** 與 **UNDO 的 replay 重建** 兩道關卡，任一處遺漏都會造成靜默的錯誤行為（分數消失、分制自己變回 11），而非明顯的例外。

現行三個設定值中，`mode` 與 `firstServer` 已經走完這條路徑，`targetScore` 是第三個同類型的值——本設計的主要工作是把這條路徑收斂成不會再漏第四個的形狀。

### 模組的 TDD 歸屬

依 `openspec/config.yaml` 與 `nextjs-pickball/CLAUDE.md` 的分層：

| 模組 | 歸屬 | 驗收方式 |
|---|---|---|
| `lib/scoreboard/rules.ts` | **行為邏輯，必 TDD** | `rules.test.ts` 三步 |
| `lib/scoreboard/reducer.ts` | **行為邏輯，必 TDD** | `reducer.test.ts` 三步 |
| `lib/scoreboard/types.ts` | **行為邏輯，必 TDD** | 非 `*.d.ts`；zod schema 帶執行期行為（`.default()` 補值），由 `storage.test.ts` 與 `reducer.test.ts` 覆蓋 |
| `lib/scoreboard/storage.ts` | **行為邏輯，必 TDD** | `storage.test.ts`；本次預期不需改碼，但相容性行為 MUST 有測試 |
| `components/scoreboard/ScoreboardSetup.tsx` | 例外層（純呈現型元件） | Playwright E2E |
| `components/scoreboard/TeamPanel.tsx` | 例外層（純呈現型元件） | Playwright E2E |
| `components/scoreboard/Scoreboard.tsx` | 例外層（組合層，僅傳遞 dispatch） | Playwright E2E |
| `tests/e2e/specs/scoreboard.spec.ts` | 例外層（測試基礎建設） | 不強制三步 |

## Goals / Non-Goals

**Goals:**

- 使用者可在賽前選擇 11／15／21 分制，勝利判定隨之改變，win by 2 不變。
- 既有使用者的進行中比賽在版本更新後不遺失（localStorage 向後相容）。
- 目標分數在專注模式（不渲染設定列）下仍然可見。
- 收斂賽前設定的傳遞路徑，使日後新增第四個設定值不必再逐一巡視 `createInitialState` 的所有呼叫點。

**Non-Goals:**

- rally scoring（落地得分制）與 side-out 的切換。規則引擎需分岔（每球得分、無第二發球員、0-0-2 不適用），另案處理。本設計僅確保 `MatchSettings` 的形狀能容納未來的 `scoringSystem` 欄位。
- 自訂任意目標分數（如 7 分、9 分）。官方僅有 11／15／21，開放數字輸入會引入驗證、行動裝置鍵盤遮擋版面等成本，對「場邊快速計分」的定位是負收益。
- 分數上限（hard cap）。官方三種分制皆為 win by 2 且無 cap。
- 比賽中變更分制。見 Decision 6。
- 指南頁 `ScoringSection` 的文案調整（屬 `pickleball-guide-page` capability）。

## Decisions

### Decision 1：`targetScore` 存在 `ScoreboardState` 內，而非獨立的 settings store

`UNDO` 的實作是「以 `createInitialState()` 重建再 replay `history`」。若 `targetScore` 存在 state 之外（例如獨立的 preferences hook），replay 過程就必須從外部注入，等於在純函式 reducer 上開一個外部依賴的洞。放在 state 內，`targetScore` 隨 state 一起被持久化、一起被 replay，無額外機制。

代價是它會被寫進 localStorage 的每一份快照——但 `mode` 與 `firstServer` 已經是這個模式，一致性優於節省幾個位元組。

**替代方案**：獨立 `useMatchPreferences` hook + localStorage 另一個 key。否決理由如上，且會讓「這場比賽當初是幾分制」與「使用者偏好的分制」兩個語意混在一起——重整後恢復的應該是前者。

### Decision 2：以 zod `.default(11)` 承擔向後相容，不 bump storage key

```
                  舊資料 { mode, scores, history, … }  ← 無 targetScore
                                  │
                                  ▼
                     ScoreboardStateSchema.safeParse
                                  │
        ┌─────────────────────────┴─────────────────────────┐
        ▼ 方案 A（採用）                                     ▼ 方案 B / C（否決）
  targetScore 宣告 .default(11)                    必填欄位 → 驗證失敗
        │                                                   │
  undefined → 補 11 → success                         removeItem → 回 null
        │                                                   │
  ✅ 進行中的比賽完整保留                          ❌ 使用者重整後分數歸零，
                                                       且無任何錯誤提示
```

`storage.ts` 現行的損壞資料處理是「清除並回 null」，這對真正損壞的資料是對的，但對「只是少了一個新欄位」的舊資料就變成資料破壞。zod 的 `.default()` 在輸入為 `undefined` 時套用預設值，正好覆蓋這個情境，且不需要在 `storage.ts` 寫任何遷移分支。

已於本機以專案實際安裝的 zod `4.4.3`（`nextjs-pickball/node_modules/zod`）實測確認三種輸入的行為：

| 輸入 | `safeParse` 結果 |
|---|---|
| 缺 `targetScore` 欄位 | `success: true`，補值為 `11` |
| `targetScore: 15` | `success: true`，保留 `15` |
| `targetScore: 13`（非法值） | `success: false` → 沿用既有的清除流程 |

第三列是刻意保留的行為：非法值屬真正的資料損壞，仍應清除。

**替代方案 B**：bump 到 `scoreboard:current:v2`。乾淨，但舊 key 的資料就此孤立，效果等同資料遺失。
**替代方案 C**：在 `readScoreboard()` 內手寫 migration 分支。可行但把版本知識散到 storage 層，且每加一個欄位就多一個分支；zod 的預設值是同一件事的宣告式寫法。

此策略已寫入 delta spec 的「localStorage 持久化」Requirement，成為往後新增欄位的通則。

### Decision 3：`isGameWon(scores, targetScore)` 第二參數必填，不給預設值

給 `targetScore = 11` 的預設值會讓漏傳的呼叫點靜默退回 11 分制。更關鍵的是它會破壞 TDD 的紅燈：既有的 5 個 `it` 在有預設值時會直接通過，我們就失去了「所有呼叫點都已更新」的編譯期證據。必填參數讓 TypeScript 把 `reducer.ts` 的呼叫點直接標紅。

**替代方案**：改為接受整個 state（`isGameWon(state)`）。否決——`rules.ts` 目前是不依賴 state 形狀的純函式集合，傳入完整 state 會讓它與 state schema 耦合，測試也要組出完整物件才能呼叫。

### Decision 4：把三個賽前設定收斂為 `MatchSettings`

```
   現在                                   改為
createInitialState({                type MatchSettings = {
  mode?: Mode                         mode: Mode
  firstServer?: Team                  firstServer: Team
})                                    targetScore: TargetScore
  ▲ 4 處呼叫各自列舉欄位            }
    漏一處 → 該設定被靜默重置       createInitialState(
                                        o: Partial<MatchSettings> = {}
                                      )
                                      ▲ 欄位清單只有一份
```

四處呼叫（`reducer.ts` 的 `SET_MODE`、`SET_FIRST_SERVER`、`UNDO`、`RESET`）改為以「取出目前 settings → 套用差異」的方式呼叫，新增設定值時不需再巡視每一處。這同時是 rally scoring 那個後續 change 的鋪路：加 `scoringSystem` 只要動 `MatchSettings` 的定義。

參數採 `Partial<MatchSettings> = {}` 而非必填的 `settings: MatchSettings`：既有測試有多處無參數呼叫 `createInitialState()` 取預設局面，改為必填會逼出十餘處與本 change 無關的呼叫點改動，收益卻只是型別上的嚴格性。收斂的目的是「欄位清單只有一份」，`Partial` 同樣達成——真正防止遺漏的是 `settingsOf(state)` helper，它讓每個重建點都帶齊三項設定，而不是靠簽章強制。

三個 `SET_*` case MUST 各自保持獨立分支（`createInitialState({ ...settingsOf(state), <該項> })`），SHALL NOT 合併為共用 fallthrough —— 專案慣例是清晰度優先於精簡，且合併後每個 action 各自改哪一項會變得不明顯。

此項屬 TDD 三步的 **refactor 階段**，MUST 在對應測試轉綠之後才進行。

### Decision 5：設定列用分段按鈕（11 | 15 | 21），不用第三個 Select

三個值是固定小集合，分段式 toggle 比下拉選單少一次點擊，符合「場邊比賽空檔快速操作」的頁面定位；寬度也比 shadcn `Select` 的 trigger 省。鎖定狀態仍用原生 `disabled`，與其餘兩個控制項一致（delta spec 的「賽前設定與階段鎖定」已要求）。

**版面取捨**：以 Tailwind class 推算，直向 390px 視口的設定列可用寬約 358px，現行兩個 Select 加專注鈕已佔約 332px，餘裕僅約 26px——**任何第三個控制項都會使設定列折行**。本設計選擇接受折行（並在 delta spec 明文寫成預期行為），而非為了單列而縮減橫向的控制項可讀性：橫向是主要使用姿勢，直向本來就掛著「建議橫向使用」的提示橫幅。

折行後設定列增高約 48px，分數面板的高度預算相應縮減；分數字級為 `clamp(2.5rem, min(37cqh,38cqw), 14rem)` 的流體值，推算仍落在 clamp 區間內。**以上皆為 class 推算而非量測，MUST 由 E2E 的多 viewport 零捲動驗收確認**——外層是 `overflow-hidden`，溢出不會產生捲軸，只會靜默裁切按鈕。

### Decision 6：三項賽前設定一律只在 `setup` 階段可改

`targetScore` 是三者中唯一「中途變更不會讓既有分數失去意義」的設定（`mode` 與 `firstServer` 一改，`serverNumber` 與發球權推導就失去基準）。因此「允許中途改分制」在技術上是可行的，且對應一個真實情境：兩隊打到 8-6 才發現今天要打 15 分。

仍選擇一律鎖定，理由有二：

1. 三項設定行為一致，使用者不需記憶「哪些改得動」。
2. 放寬會引入 `finished → playing` 的反向狀態轉換（11 分制已 11-9 判勝後改 15 分制，比賽要不要復活？），狀態機複雜度上升，而本 change 目前完全不需要動狀態機。

補救路徑是既有的重置（二次確認 AlertDialog），其文案「目前的分數與發球紀錄將會清空，比賽回到 0-0 起手」已涵蓋此情境，不需修改。

此取捨的理由已寫入 delta spec，避免日後有人以為只是漏想。

### Decision 7：目標分數顯示在 TeamPanel 的名稱行

專注模式不渲染 `ScoreboardSetup`，若分制只出現在設定列，使用者進入專注模式後會失去唯一線索——21 分制打到 11-9 沒結束時無從判斷是規則如此還是程式故障。

名稱行（`TeamPanel.tsx` 的 label 節點）是既有節點，附加文字不增加高度，對 `h-dvh` + `overflow-hidden` 的高度預算零影響。

**替代方案**：新增一列狀態條、或在 `GameOverDialog` 顯示。前者吃高度預算（頁面鎖高，新增節點會壓縮分數字級）；後者只在比賽結束時才看得到，解決不了比賽進行中的困惑。`GameOverDialog` 是否附帶顯示分制列為 Open Question。

## Risks / Trade-offs

- **[UNDO 靜默吃掉 targetScore]** → 這是本 change 最可能的缺陷，且只在使用者按 Undo 時顯現（正常計分完全正常，肉眼 review 難以察覺）。Mitigation：`reducer.test.ts` 有獨立 `it`（「UNDO 後保留 targetScore，不退回預設 11」），且 delta spec 有獨立 Scenario，不僅是測試案例。Decision 4 的 `MatchSettings` 收斂則從結構上讓這類遺漏不易再發生。

- **[localStorage 舊資料被清空]** → 若 Decision 2 執行有誤（例如 `.default()` 加在錯的層級），既有使用者重整後分數歸零且無提示。Mitigation：`storage.test.ts` 以「本次變更前格式的資料」為輸入的獨立 `it`（「舊版資料缺 targetScore 時補為 11 且不清除 key」），MUST 先看到紅燈再實作。

- **[直向設定列折行造成靜默裁切]** → `overflow-hidden` 使溢出不產生捲軸，按鈕可能被切掉而測試不報錯。Mitigation：既有 E2E「多 viewport 零捲動」已檢查按鈕 boundingBox 是否完整落在 viewport 內（水平與垂直兩軸），本 change MUST 在三控制項下重跑並通過；390x844 是其中一個 viewport。

- **[`isGameWon` 簽章變更波及既有測試]** → 5 個既有 `it` 會因型別錯誤而失敗。這是預期中的紅燈（Decision 3 的目的），非風險，但 tasks 需明確標示這些測試要一併更新而非刪除。

- **[E2E 既有劇本假設 11 分制]** → `scoreboard.spec.ts` 的「連贏 11 球觸發 GameOverDialog」依賴預設值。預設仍為 11，該測試不受影響；新增的 15 分制劇本需顯式切換分制後再計分。

## Migration Plan

無資料庫、無 API、無部署順序相依。使用者端的既有 `localStorage["scoreboard:current:v1"]` 由 Decision 2 的 schema 預設值向後相容，**不需要任何遷移動作**，也不需清除使用者資料。

回滾策略：本 change 若回滾（還原程式碼），新版寫入的資料會多帶一個 `targetScore` 欄位。已確認 `ScoreboardStateSchema` 使用 `z.object({...})` 且未加 `.strict()`，而 zod `4.4.3` 對未知欄位的預設行為經本機實測為「通過驗證並 strip 掉該欄位」（`safeParse({a:1, unknownField:99})` → `success: true`、`data` 不含 `unknownField`）。因此回滾後舊版程式仍能讀取新版資料並以 11 分制運作，不會觸發清空。

部署仍依 root `README.md` 的部署前手動檢查清單（lint → tsc → unit → e2e → preview → 部署順序）。本 change 只動前端，但部署順序規則不變。

## Open Questions

（實作前已全數決議，保留於此供追溯）

### 已決議：分段按鈕採 `role="radiogroup"`

三個目標分數為互斥單選，`radiogroup` 的語意比三顆 `aria-pressed` toggle button 準確——讀屏會告知「1 of 3」，使用者知道這是三選一而非三個獨立開關。

```tsx
<div role="radiogroup" aria-label="目標分數">
  <button role="radio" aria-checked={targetScore === 11} disabled={locked}>11</button>
  <button role="radio" aria-checked={targetScore === 15} disabled={locked}>15</button>
  <button role="radio" aria-checked={targetScore === 21} disabled={locked}>21</button>
</div>
```

E2E 一律以 `getByRole("radio", { name: "15" })` 選取，實作與測試的選取方式 MUST 對齊。

**未採用**：`aria-pressed` toggle button。它與設定列既有的專注模式按鈕語意一致，實作也較簡，但讀屏不會告知三者互斥。

### 已決議：`GameOverDialog` 不顯示分制

比分本身（如 15–13）已隱含分制，且該 dialog 的定位是比賽結束後快速關閉，內容越少越好。`GameOverDialog.tsx` 在本 change 中不變更。

比賽進行中的分制可見性由 Decision 7（TeamPanel 名稱行）承擔，此處不重複。
