## Context

本 capability 是分配機的第一塊，也是唯一一塊不依賴其他階段的。它的形狀決定了後續四個階段能不能不做破壞性遷移就接上去：

```
   ┌──────────────────────────────────────────────────────┐
   │  本次範圍：player-roster                              │
   │                                                      │
   │   PlayerForm ──▶ useRosterStore ──▶ lib/matchmaker/  │
   │   PlayerList ◀──      │              types  (zod)    │
   │                       │              roster (CRUD)   │
   │                       │              colors (對比)   │
   │                       ▼              storage         │
   │              localStorage["matchmaker:roster:v1"]    │
   └───────────────────────┬──────────────────────────────┘
                           │  後續階段從這裡取用，不改動 schema
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   分配演算法(M2)      評分更新(M4)        歷史紀錄(M6)
   讀 restCount        寫 rating           讀 player 快照
   寫 restCount        寫 gamesPlayed
```

三個既有條件約束了設計：

1. **`lib/scoreboard/storage.ts` 已經確立了本 repo 的持久化模式**——zod `safeParse` + 失敗即清除 + `hasLocalStorage()` 防 SSR。新模組應沿用同一形狀，但**不應照抄它的失敗處理**（見 Decision 3）。
2. **PRD 4.1 的資料表格有兩個本次不寫入的欄位**（`累計休息次數`、`累計出場次數`）。它們屬於 M2／M4 的行為，但屬於 M1 的 schema。
3. **PRD 10 的「重置名單」在完整產品中要清除名單＋回合＋歷史**，但本次只有名單存在。重置的實作形狀必須讓後兩者能無痛加入。

### 模組的 TDD 歸屬

依 `openspec/config.yaml` 與 `nextjs-pickball/CLAUDE.md` 的分層：

| 模組 | 歸屬 | 驗收方式 |
|---|---|---|
| `lib/matchmaker/types.ts` | **行為邏輯，必 TDD** | 非 `*.d.ts`；zod schema 帶執行期驗證行為（範圍、精度、Hex 格式），由 `types.test.ts` 與 `storage.test.ts` 覆蓋 |
| `lib/matchmaker/roster.ts` | **行為邏輯，必 TDD** | `roster.test.ts` 三步 |
| `lib/matchmaker/colors.ts` | **行為邏輯，必 TDD** | `colors.test.ts` 三步 |
| `lib/matchmaker/storage.ts` | **行為邏輯，必 TDD** | `storage.test.ts` 三步 |
| `hooks/useRosterStore.ts` | **行為邏輯，必 TDD** | `useRosterStore.test.tsx` 三步（`@testing-library/react`） |
| `app/matchmaker/players/page.tsx` | 例外層（入口） | Playwright E2E |
| `components/matchmaker/*.tsx` | 例外層（純呈現型元件） | Playwright E2E |
| `tests/e2e/specs/player-roster.spec.ts` | 例外層（測試基礎建設） | 不強制三步 |

## Goals / Non-Goals

**Goals:**

- 使用者可建立、編輯、刪除參賽者，資料在重整與關閉瀏覽器後仍存在。
- 首次開啟為空白，不出現任何假資料。
- 重置名單有二次確認，取消時完全不動資料。
- 漸層背景上的文字在任何使用者選色下都可讀。
- schema 一次到位，M2／M4／M6 接上時**不需要對 `matchmaker:roster:v1` 做破壞性遷移**。
- 損壞的持久化資料不會讓整份名單無聲消失（見 Decision 3）。

**Non-Goals:**

- 分配演算法、對戰畫面、比分、評分更新、歷史紀錄、匯入匯出。
- 全站導覽入口（見 proposal 的不在範圍）。
- 舊版種子資料的一次性清除——本 capability 全新，無清除對象。
- 參賽者排序、搜尋、分組。名單規模為 8～40 人（PRD 12.1），單一列表即可；加篩選是尚未被證實的需求。
- 同名偵測與合併。球聚常有同名，靜默合併的風險高於重複建立（此決策已寫入 PRD 9.3.2 的 CSV 匯入，此處保持一致）。

## Decisions

### Decision 1：路由與目錄命名為 `matchmaker`，不是 `roster` 或 `players`

路由 `/matchmaker/players`，程式碼放 `lib/matchmaker/`、`components/matchmaker/`。

分配機完整型態有三頁（名單、場次、歷史），需要一個共同 section 前綴，否則 `/players`、`/rounds`、`/history` 三個頂層路由與既有的 `/quiz`、`/tour`、`/scoreboard`（各自獨立的單頁工具）混在一起，看不出它們屬於同一個工具。

命名用 `matchmaker` 而非 `roster`——`roster`（名單）只是三頁中的一頁，拿它當 section 名，之後 `/roster/history` 會很怪。

### Decision 2：schema 一次納入 `restCount` 與 `gamesPlayed`，本次只初始化不累加

```ts
restCount:    z.number().int().nonnegative().default(0)   // M2 分配演算法寫入
gamesPlayed:  z.number().int().nonnegative().default(0)   // M4 評分更新寫入
```

替代方案是本次不放、M2 再加。否決理由與 `scoreboard` 的 `targetScore` 是同一個教訓（見 `changes/archive/2026-08-14-scoreboard-target-score`）：欄位後加就得處理「舊資料缺欄位」的相容性，而失敗模式是**靜默的**——驗證失敗 → 清除 key → 使用者的整份名單消失。

一次放好，代價只是兩個永遠為 0 的欄位；後加的代價是一次相容性遷移，以及遷移沒寫好時使用者資料歸零。用 `.default(0)` 是額外的保險，即使日後真的出現缺欄位的資料也能補值而非驗證失敗。

### Decision 3：持久化失敗採**逐筆降級**，不整份清除

這是本設計唯一刻意偏離 `lib/scoreboard/storage.ts` 既有模式的地方。

`scoreboard` 的策略是「zod 驗證失敗 → `removeItem` → 回 `null`」。那對計分板是對的：資料是**一場**比賽，丟了重開一場即可。

名單不同——它是使用者逐筆手建的**幾十筆**資料。若某一筆因為未來的 schema 變動或外部干擾而不合法，就把整團人清空，損失不成比例。

```
        讀取 matchmaker:roster:v1
                  │
        ┌─────────┴─────────┐
        │ JSON.parse 失敗？  │──是──▶ 清除 key，回空名單（無法逐筆搶救）
        └─────────┬─────────┘
                  否
                  ▼
        逐筆 safeParse 每個 player
                  │
        ┌─────────┴──────────┐
        │ 合法的保留          │
        │ 不合法的丟棄並計數  │──▶ 回 { players, droppedCount }
        └────────────────────┘
                  │
                  ▼
        droppedCount > 0 時 UI 提示「有 N 筆資料損毀已略過」
        並將清理後的名單寫回，使損壞不再累積
```

外層容器（`{ version, players }`）本身不合法時仍整份清除——那代表結構層級的損壞，無筆可救。

### Decision 4：時間與 ID 由呼叫端注入，純函式不自己產生

```ts
addPlayer(roster, input, { id, now })   // 而非在函式內呼叫 randomUUID()／Date.now()
```

`roster.ts` 的 CRUD 必須是純函式才能穩定測試。若在內部呼叫 `crypto.randomUUID()` 與 `new Date()`，每次執行結果不同，斷言只能用寬鬆的 `expect.any(String)`，等於放棄驗證這兩個欄位。

由 `useRosterStore` 這一層負責產生真實的 id 與時間戳，純函式只接受它們。測試注入固定值，斷言可以是精確相等。

### Decision 5：文字對比取「兩端皆可讀」而非平均亮度

參賽者背景是雙色漸層，文字覆蓋整片。常見做法是算平均亮度再選黑或白，但那在一深一淺的漸層（例如 `#0E1A1A` → `#E8F5F0`）會失敗：平均落在中間，選黑或選白都有一端讀不到。

改為分別計算兩個端點色與黑、白的 WCAG 對比度，選**兩端最小對比較高**的那個前景色：

```
foreground = argmax( min( contrast(c1, fg), contrast(c2, fg) ) )   fg ∈ { 深色, 淺色 }
```

這保證不會出現「某一端完全讀不到」。若兩者的最小對比都低於 4.5:1，仍取較高者並不阻擋使用者選色——PRD 12.5 要求色彩不可作為唯一資訊來源，可讀性的最後保障是文字本身存在，而非強制改色。

### Decision 6：重置以列舉的 key 清單實作，不用前綴掃描

```ts
const RESET_KEYS = ["matchmaker:roster:v1"] as const;   // M2 加 rounds、M6 加 history
```

PRD 10 的重置在完整產品中要清掉名單、目前回合與歷史賽果。本次只有名單。

用 `localStorage` 前綴掃描（清除所有 `matchmaker:` 開頭的 key）看似更省事，但會誤刪未來加入的、不該被重置的資料（例如場地數這類使用者偏好）。列舉清單的擴充成本是一行，且新增資料域時**必須**主動決定它該不該被重置，這個強制的決策點正是要的。

### Decision 7：強度分數存 `number`，寫入前 round 至兩位小數

PRD 4.1 規定 1.00～8.00、小數點後兩位。zod 驗證範圍，並在寫入前 `Math.round(v * 100) / 100`。

不採「存整數（分數 × 100）」——那能完全避開浮點誤差，但 M4 的評分更新公式（`R + K × (S - E)`）本來就產出任意小數，兩種表示法之間反覆換算的錯誤機會，高於直接存 `number` 並統一在寫入點 round 一次。

UI 一律以 `toFixed(2)` 呈現，避免 `3.0499999` 這類顯示。

### Decision 9：`RosterSchema.version` 定為 `z.literal(1)`，不是開放的 `z.number()`

外層容器帶一個 `version` 欄位，但它的允許值必須收斂為字面量 `1`。

寫成 `z.number()` 會讓任何數字通過——包括未來真的出現的 `2`。那正是最糟的情況：一份 v2 結構的資料會通過 v1 的外層驗證，然後在逐筆 `PlayerSchema` 驗證時因欄位對不上而被整批丟棄，使用者看到的是「名單莫名少了很多人」，而不是一個明確的版本不符。

用 `z.literal(1)` 則讓版本不符在**外層**就失敗，走 Decision 3 的「無筆可救 → 清除 key」路徑，行為明確且可預期。日後真要支援多版本時，改為 `z.union([z.literal(1), z.literal(2)])` 並在該處加遷移分支，是一個顯眼且必須主動處理的改動點。

此欄位與 `STORAGE_KEY` 名稱中的 `v1` 看似重複，但兩者用途不同：key 名稱隔離的是**不同版本的儲存空間**（v2 寫到新 key，v1 資料原地保留），`version` 欄位標記的是**這份內容本身的結構版本**，在 JSON 匯出檔（`prd.md` 9.2 要求含版本號）離開 LocalStorage 之後，key 名稱就不存在了，只剩這個欄位能表明結構版本。

### Decision 8：hydration 沿用 scoreboard 的 HYDRATE 模式

首次 render 在 server 與 client 都以空名單開始，`useEffect` 讀取 LocalStorage 後 dispatch `HYDRATE`。與 `hooks/useScoreboardStore.ts` 相同，避免 SSR／CSR 首次輸出不一致造成的 hydration mismatch。

代價是空狀態畫面會閃現一瞬。既有 scoreboard 已接受此取捨，此處保持一致，不另引入 `suppressHydrationWarning` 或 `next/dynamic` 的第二種模式。
