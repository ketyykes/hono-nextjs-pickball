> **獨立小 change，無 milestone 編號**。本 change 是 **M1 `add-player-roster`（已歸檔於
> `openspec/changes/archive/2026-08-17-add-player-roster`）的規格回填**：把 M1 當時實作了、
> 但沒有寫進 `openspec/specs/player-roster/spec.md` 的「快速帶入強度分數」補進主 spec，
> 並補上對應的 regression guard 測試。**不新增功能、不改既有行為。**
>
> 本 repo 已有同型前例：`2026-08-12-seo-metadata-spec-backfill`（追認 `/quiz`、`/scoreboard`
> 的 metadata）與 `2026-08-12-scoreboard-spec-completion`。

## Why

`prd.md` 13.2 的驗收清單有一項「可使用新手／中階／高階快速分數」（規格見 `prd.md` 4.1.3：新手 1.00、中階 3.00、高階 5.00），但 `openspec/specs/player-roster/spec.md` **從頭到尾沒有出現「快速分數」四個字**——七條 Requirement（資料模型、新增編輯刪除、出場狀態、雙色漸層、空白初始狀態、重置、持久化）沒有一條涵蓋它。

實作其實早就存在：`nextjs-pickball/components/matchmaker/PlayerForm.tsx` 的 `RATING_PRESETS` 提供三顆按鈕，點擊後以 `toFixed(2)` 填入強度分數欄位。也就是說這是**規格漏記，不是功能未做**。

問題在於「改壞了不會有測試轉紅」：

- `nextjs-pickball/components/matchmaker/` 底下**一個測試檔都沒有**（`PlayerForm` 從未被單元測試覆蓋）。
- 唯一碰到快速分數的是 E2E：`tests/e2e/specs/player-roster.spec.ts` 的 helper `addPlayerViaDialog` 會點「新手 1.00」——但它只是**借用**這顆按鈕來填分數，**沒有斷言任何快速分數行為**。把三顆按鈕砍成兩顆、把 `toFixed(2)` 改成 `String(value)`、把 `type="button"` 拿掉（按鈕變成 submit），現行測試套件**依然全綠**（最後一項甚至會讓 helper 送出一張只有姓名的表單而路徑照樣走得完）。

規格債與測試債同時存在，任何人重構 `PlayerForm` 時都沒有東西擋下他。

**Why now**：M3～M9 七個 change 正在平行進行，其中 M4、M6 都會 MODIFY `player-roster` 的既有 Requirement。這批 change 每 archive 一次，就把「主 spec 沒提快速分數」的現狀原樣複製一次；愈晚補，回填時要比對的主 spec 版本愈多。本 change 只 ADDED 一條新 Requirement、不碰任何既有 Requirement，因此可以插進這批平行作業而不影響任何人。

## What Changes

- **`player-roster` 新增一條 Requirement「快速帶入強度分數」**（ADDED，非 MODIFIED）：三個級別與分數、點擊後以兩位小數填入強度分數欄位、填入後仍可手動改為 1.00～8.00 內任意兩位小數、按鈕不得觸發表單送出、三組級別由單一常數渲染。
- **新增 `nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`**：4 個 regression guard 單元測試。這是 `components/matchmaker/` 的**第一個**測試檔，也是本 repo 第一個帶互動（click／type）的元件測試。
- **於既有 `nextjs-pickball/tests/e2e/specs/player-roster.spec.ts` 補 1 個 E2E test**，讓 `prd.md` 13.2 的該項驗收有端到端證據；既有 helper `addPlayerViaDialog` 加一個**選填**參數，既有 4 個 test 的呼叫方式不變。
- **產品程式碼預期 diff 為 0 行**。若實作與本 delta 有任何出入，以 delta 為準修正實作並如實記錄（見 design「Decision 3」）。

**明確不做**：

- 不新增第四個級別、不調整三個級別的分數、不把快速分數改成下拉或滑桿——那是產品決策，不該夾帶在規格回填裡。
- 不重構 `PlayerForm.tsx`（不抽 `RatingPresetButtons` 子元件、不把 `RATING_PRESETS` 搬去 `lib/`）。本 change 的目的是讓現況**可被驗證**，不是讓現況變好看。
- 不動 `PlayerSchema` 的 `rating` 欄位定義（1.00～8.00、兩位小數）——那由既有的「參賽者資料模型」Requirement 管，本次唯讀引用。
- 不補其他 `components/matchmaker/` 元件（`PlayerCard`、`PlayerList`、`EmptyRoster`、`ResetRosterDialog`）的測試。它們沒有同型的規格缺口，一起補會讓本 change 從 small 膨脹成 medium。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `player-roster`：**1 條 ADDED**（「快速帶入強度分數」）。本 change **不 MODIFY、不 REMOVE、不 RENAME** 任何既有 Requirement。

## Impact

- **新增檔案**：
  - `nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`
- **修改檔案**：
  - `nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`（新增 1 個 test，helper 加 1 個選填參數）
- **唯讀、不修改**：
  - `nextjs-pickball/components/matchmaker/PlayerForm.tsx`（被測目標；預期零改動）
  - `nextjs-pickball/lib/matchmaker/types.ts` 的 `PlayerSchema`（`PlayerForm` 內部沿用，本次不碰）
- **不動**：`lib/matchmaker/**`、`hooks/**`、`app/**`、`components/matchmaker/` 的其餘元件、`tests/setup.ts`、`vitest.config.ts`、任何後端檔案。
- **無外部相依**：`@testing-library/react` 與 `@testing-library/user-event` 皆已在 `nextjs-pickball/package.json` 的 devDependencies（後者目前尚無任何測試使用，本 change 是第一個），**不新增任何 npm 套件**。
- **執行相依：無**。行為已在 `main` 上，worktree 可隨時從 `main` 開出。

### 與其他平行 change 的衝突確認

本 change 與 **M3～M9 七個 change 皆可平行、任何順序合併**：

| 對象 | 交集 | 結論 |
|---|---|---|
| M4 `matchmaker-round-lifecycle` | 同樣有 `specs/player-roster/` delta，內容為 MODIFY「參賽者資料模型」與「重置名單與二次確認」 | **零衝突**：兩條被 MODIFY 的 Requirement 都不提快速分數；本 change 只 ADDED 一條新 Requirement，archive 時是往主 spec **追加**，不與任何 MODIFIED 區塊爭同一段文字 |
| M6 `matchmaker-scoreboard-binding` | 同樣有 `specs/player-roster/` delta，內容為 MODIFY「重置名單與二次確認」 | **零衝突**：同上 |
| M5 `matchmaker-match-stage-ui` | 其 tasks 會**讀取** `tests/e2e/specs/player-roster.spec.ts`（檢查有無位置性斷言），但不修改該檔 | 語意零重疊。本 change 在該檔 `describe` 尾端追加 test，若日後有人同樣在尾端追加，git 可能報文字衝突，解法是兩邊的 test 都保留 |
| M3、M7、M8、M9 | 無 `player-roster` delta，也不碰 `PlayerForm` 與該 E2E 檔 | 零交集 |

archive 時 `## ADDED Requirements` 是往主 spec 追加新段落，與 M4／M6 的 `## MODIFIED Requirements` 各自作用在不同的 Requirement 區塊上，**因此三者的合併順序不拘**。
