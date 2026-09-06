## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- **本 change 的兩個 capability 分屬不同層，且有既定的單向相依**：`matchmaker-scoreboard-binding`
  （M6）design Decision 2 明訂「`lib/scoreboard/` SHALL NOT import `lib/matchmaker/`」——
  `scoreboard` 是先於分配機存在的獨立工具頁，不能讓它去理解 matchmaker 的資料模型。本 change
  新增的球員姓名／顏色資訊天生就是 matchmaker 的資料（`Player.name`／`colorFrom`／`colorTo`），
  這條相依規則因此是本 change 最核心的結構約束，而非可協商的風格偏好。
- `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的 `buildMatchSlotSeed(round, match)`
  是目前唯一組出計分板 seed 的地方，`nextjs-pickball/components/matchmaker/CourtCard.tsx` 是
  唯一呼叫點（`ensureMatchSlot(buildMatchSlotSeed(round, match))`）。`CourtCard` 已持有
  `players: readonly Player[]` prop（用於色塊版面推導），本 change 只需把它一併傳給
  `buildMatchSlotSeed`，不需要新增任何 prop 傳遞路徑。
- `nextjs-pickball/lib/scoreboard/types.ts` 的 `ScoreboardStateSchema` 已有兩個先例
  （`matchId`、`courtNumber`）示範「新增欄位、`.nullable().default(null)`、不 bump storage
  key」的向後相容做法；`nextjs-pickball/lib/scoreboard/reducer.ts` 的
  `createInitialState(overrides)` 與 `settingsOf(state)` 是一對，新增「要被保留的欄位」只需改
  這兩處。本 change 的 `teamPlayers` 完全比照這個既有形態，不引入新的資料流路徑。
- `nextjs-pickball/components/scoreboard/TeamPanel.tsx` 已收到完整的 `state: ScoreboardState`
  prop（非拆散的個別欄位），因此 `state.teamPlayers` 一旦存在於 schema，元件端不需要新增
  props、只需要讀取既有 `state` 上多出的欄位。
- `nextjs-pickball/lib/matchmaker/export-scene.ts`（`visual-export` capability，M9）已有完全
  同構的問題並留下可直接沿用的解法：「回合只存 playerId、名單查無此人時如何呈現」
  （design Decision 8：輸出替代文字「已離開名單」＋中性灰色 `#9CA3AF`／`#4B5563`，不跳過該格、
  不拋錯）。本 change 沿用同一套文案與色碼，但**各自持有一份**私有常數
  （`matchmaker-scoreboard-binding` design Decision 6 已建立「格式對齊、不跨 change import」
  的先例），理由同構：`visual-export` 與本 change 是不同時期的獨立 capability，import 對方的
  私有常數會製造一條非必要的跨 capability 相依。
- `components/scoreboard/` 目前**沒有任何元件層級的單元測試**（`TeamPanel.contract.test.ts`
  是唯讀原始碼掃描，不算元件渲染測試），全數以 `tests/e2e/specs/scoreboard.spec.ts`／
  `scoreboard-binding.spec.ts` 驗收，符合 `nextjs-pickball/CLAUDE.md`「純呈現型元件不強制單元
  TDD，以 Playwright E2E 驗收」的既定分層。本 change 的 `TeamPanel.tsx` 改動沿用同一分層，
  不另開先例新增元件單元測試檔。
- `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts:26` 既有斷言
  `page.getByText("我方", { exact: true })`：獨立計分板（`matchId === null`）路徑下
  `state.teamPlayers` 恆為 `null`，本 change 的渲染邏輯以此為早退條件，因此這條既有斷言
  SHALL NOT 被本 change 影響，可直接作為「獨立模式零行為變更」的既有迴歸防線，不需要為此另開
  一條新 Scenario。
- `/scoreboard` 為 `h-dvh` + `overflow-hidden` 鎖高頁面，`scoreboard` spec 的「RWD 排版」
  Requirement 已詳細記載多起「新增內容擠壓面板高度預算」的既往事故（設定列折行、`courtNumber`
  加入後的 `ScoreboardSetup` 版面）。本 change 在既有名稱行內新增可見內容，屬於同一類風險，
  設計上必須沿用「不新增列、只在既有節點內擴充」的既定原則（見「目標分數可見性」Requirement）。
- `RoundTeam.playerIds: string[]` 只存 id（`lib/matchmaker/round-types.ts`），姓名與顏色需由
  `players: readonly Player[]` 名單解析；`Player.name` 沒有長度上限（`PlayerSchema` 只有
  `trim().min(1)`），因此球員顯示資料的姓名長度在理論上無界，需要在呈現層而非資料層處理。

## Goals

- 讓主持人在計分板前不需要回頭確認「這場地上是誰在打」：兩隊面板直接顯示球員姓名與雙色漸層
  色塊，與對戰頁的色塊呈現同一套視覺語言（同一組 `colorFrom`／`colorTo`）。
- 維持 `matchmaker-scoreboard-binding` 已建立的單向相依（`scoreboard` 不 import
  `matchmaker`）：前景文字色在 seed 建立時算好存入，計分板端零亮度判斷邏輯。
- 獨立 `/scoreboard`（`matchId === null`）與本次變更前已建立的計分板槽維持零行為變更。
- 新增欄位遵循既有的 schema 向後相容策略（`.nullable().default(null)`、不 bump storage key），
  且與 `matchId`／`courtNumber` 一樣被 UNDO／RESET／HYDRATE 正確保留。

## Non-Goals

- **不做跨分頁即時同步**（`storage` 事件／`BroadcastChannel`）：`matchmaker-scoreboard-binding`
  design Open Questions 第 2 條已列為不做，本 change 不重啟討論。
- **不改 `firstServer` 的決定方式**：同上 Open Questions 第 3 條，先發球方仍為現場可調。
- **不改計分規則、Undo 的還原邏輯本身、專注模式的顯示條件**：本 change 只多帶一個欄位隨
  UNDO／RESET／HYDRATE 一併保留，不改變這些機制既有的觸發條件與版面切換邏輯。
- **不即時同步球員改名或改色**：`teamPlayers` 為 seed 建立當下的快照，之後改名或改色不會回頭
  更新已存在的分槽（見 Decision 2）。
- **不回溯補上舊分槽的 `teamPlayers`**：本次變更前已建立、仍在使用中的計分板槽維持
  `teamPlayers: null`，回到我方／對方純文字，不寫遷移邏輯逐筆回填。
- **不新增 `components/scoreboard/` 的元件單元測試檔**：沿用既有的 E2E-only 驗收分層。
- **不改動 `components/matchmaker/CourtCard.tsx` 色塊本身的姓名／顏色呈現**：本 change 只讀取
  該色塊已使用的 `Player` 欄位來組裝 seed，不改變對戰頁色塊呈現的既有行為。

## Decisions

### Decision 1：前景文字色於 seed 建立時預先算好存入，計分板只讀不算

`teamPlayers` 每筆球員資料的 `foreground` 欄位，由 `nextjs-pickball/lib/matchmaker/colors.ts`
的 `pickTextColor(colorFrom, colorTo)` 在 `buildMatchSlotSeed`（matchmaker 側）呼叫時算好、
寫入 seed；`TeamPanel.tsx`（scoreboard 側）拿到 `state.teamPlayers` 後只是把 `foreground`
當作 CSS `color` 值直接套用，不做任何亮度或對比計算。

| 替代方案 | 否決理由 |
|---|---|
| 計分板拿到 `colorFrom`／`colorTo` 後自行呼叫某個亮度判斷 | 唯一能重用的判斷邏輯是 `lib/matchmaker/colors.ts` 的 `pickTextColor`，呼叫它就等於讓 `lib/scoreboard/` import `lib/matchmaker/`，直接打破 `matchmaker-scoreboard-binding` design Decision 2 的單向相依 |
| 計分板自行另寫一套獨立的亮度判斷（不 import，複製邏輯） | 兩份邏輯必然漂移：`pickTextColor` 未來若調整公式（例如加入 WCAG AAA 門檻），對戰頁與計分板會呈現不同的文字色，使用者會覺得同一位球員在兩個畫面「顏色深淺不一致」 |
| 計分板拿到色碼後用 CSS 的 `color-mix()` 或簡單反相規則即時決定 | 精確度遠低於 `pickTextColor`（WCAG 對比度公式），且仍是「第二套判斷邏輯」，否決理由與上一列相同 |

代價是 `PlayerBadge`（新的 seed 資料形狀）比單純的色碼多帶一個看似可推導的欄位；接受，因為
這正是讓單向相依維持乾淨的唯一方法——`foreground` 是「在正確的一端算一次」，不是「算兩次」。

### Decision 2：`teamPlayers` 為快照，不與名單即時同步

球員顯示資料在「進入計分板」建立 seed 的當下解析一次並寫死，之後該員即使改名或改色，
已存在的計分板槽內容不會回頭更新，直到該場次重新走一次 seed 建立流程（但 seed 建立流程本身
SHALL NOT 覆蓋已有進度的槽，見 `match-stage` spec 的「已有進度時再次進入不覆蓋」Scenario——
因此進行中的場次即使重新點擊入口也不會更新姓名色塊）。

| 替代方案 | 否決理由 |
|---|---|
| 計分板即時查詢名單（`matchmaker:round:v1` 或名單 store）取得最新姓名／顏色 | 這正是 Decision 1 已否決的相依方向——即時查詢必然需要 `lib/scoreboard/` 或其 hook 去讀 matchmaker 的資料，違反單向相依 |
| 對戰頁在名單變更時主動把新資料寫回所有相關計分板槽 | 需要一個「名單變更 → 找出所有引用該球員的進行中槽 → 逐一改寫」的同步機制，複雜度與收益不成比例；`prd.md` 未要求此即時性，且比賽進行中途改名／改色本身是邊緣情境 |

這與 `match-history` capability 的既有設計精神同構——歷史紀錄保存**姓名快照**正是為了
「刪人或改名不該讓過去的資料變空白或跟著變動」。差別在於 `match-history` 的快照是永久的
（比賽已結束），本 change 的快照則會在下一次成功建立 seed 時整筆替換（比賽是進行中的可變狀態，
只是「更新」的觸發點被刻意限制在「seed 尚未建立或已被清除」的時刻，而非任意時刻）。

### Decision 3：名單中找不到球員時顯示替代文字，不跳過、不拋錯——沿用 `visual-export` 的判斷但獨立實作

`RoundTeam.playerIds` 中若有 id 在傳入的 `players` 名單找不到（該員已被移除），該筆球員顯示
資料以固定的替代文字「已離開名單」與中性灰色（`#9CA3AF` → `#4B5563`）呈現，該隊其餘球員與另
一隊照常輸出。

| 替代方案 | 否決理由 |
|---|---|
| 拋錯 | 整個 seed 建立失敗，主持人只知道「進不去計分板」，不知道是誰的資料出了問題；`prd.md` 第 11 節的錯誤處理精神要求可判讀的降級而非中斷 |
| 跳過該筆（比照 `CourtCard.tsx` 的 `resolveTeamPlayers` 做法） | 雙打某隊會從 2 人變 1 人，面板版面與 `TeamPlayersSchema` 的 `min(1).max(2)` 邊界都會變得曖昧——2 人隊伍少一人後看起來像單打隊伍，主持人可能誤以為排錯對戰方式 |
| **顯示替代文字（採用）** | 該格照常呈現，人數不變，使用者一眼看出「這裡曾經有人、現在不見了」，與 `visual-export` capability（M9）design Decision 8 的既有判斷完全同構 |

`components/matchmaker/CourtCard.tsx` 的 `resolveTeamPlayers` 目前是「跳過」邏輯，本 change
**不修改它**——那是對戰頁色塊呈現的既有行為，屬 proposal 的「明確不做」清單。兩個函式對「名單
查無此人」給出不同答案是**已知且刻意接受的不一致**：對戰頁色塊格子有版面上的理由（`row`／
`column` 是離散格位，缺一個格位比多一個「已離開名單」格位更符合現有版面推導的資料形狀），
計分板面板則沒有這層版面約束，兩者的正確答案本來就不必相同。

替代文字與色碼**不 import** `visual-export` 的 `export-scene.ts`（該檔的常數為 module-private，
且兩個 capability 各自獨立、不建立跨 capability 相依，沿用 `matchmaker-scoreboard-binding`
design Decision 6「格式對齊、不跨 change import」的既有慣例），改在
`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 內重新宣告同一組字面量。

### Decision 4：`buildMatchSlotSeed` 新增必填的 `players` 參數，不做成 optional

```ts
export function buildMatchSlotSeed(
	round: Round,
	match: RoundMatch,
	players: readonly Player[],
): ScoreboardState & { matchId: string };
```

`players` 為**必填**而非 `players?: readonly Player[]`。

| 替代方案 | 否決理由 |
|---|---|
| `players` 設為 optional，缺省時 `teamPlayers` 為 `null` | 唯一的生產呼叫點（`CourtCard.tsx`）本來就已經持有 `players` prop，沒有任何合法情境需要省略它；optional 只會讓「忘記傳」這個錯誤從編譯期錯誤退化成執行期的靜默降級（該場次悄悄回到我方／對方純文字，且沒有任何測試會因此變紅） |
| 新增第二個函式（如 `buildMatchSlotSeedWithPlayers`）保留舊簽章 | `buildMatchSlotSeed` 全 repo只有一個生產呼叫點與一份測試檔，維護兩份幾乎相同的函式沒有任何呼叫端會受益，純粹增加維護面 |

代價：本 change 需要同步修改 `scoreboard-binding.test.ts` 內既有的三處呼叫（見 tasks §9.5
「本 change 唯一容許變動的既有測試」），每處只補第三個參數，不改動任何既有斷言。

### Decision 5：顯示位置為 `TeamPanel.tsx` 既有的名稱行，不新增列或區塊

球員姓名色塊渲染在既有的名稱行（目前只有 `<span>{label}</span>` 與
`<span>· {targetScore} 分制</span>` 兩個 inline 節點的那個 `<div>`）內，「我方」／「對方」
文字維持不變，姓名色塊接續其後、`· N 分制` 文字接續在姓名色塊之後；不新增獨立的列、不壓縮
既有分數字級的可用高度預算。

| 替代方案 | 否決理由 |
|---|---|
| 在名稱行上方或下方新增一列專門顯示球員姓名色塊 | `scoreboard` spec 的「RWD 排版」Requirement 已明文警告：頁面為 `h-dvh` + `overflow-hidden` 鎖高，新增節點會壓縮分數面板的高度預算，溢出時的失敗模式是靜默裁切；「目標分數可見性」Requirement 已為同一類需求（顯示目標分數）明確選擇「既有名稱行」而非新列，本 change 沿用同一條已被驗證過的原則 |
| 移除「我方」／「對方」文字，改由球員姓名完全取代 | 會改變既有的 `aria-label`（`${label}贏這一球，當前 ${score} 分`）錨點文案與既有 E2E 斷言（`page.getByRole("button", { name: /我方贏這一球/ })` 等），牽動範圍遠超過本 change 的核心目的，且「我方／對方」提供的「這是哪一側」語意與球員姓名的「這是誰」語意並不衝突，沒有理由二選一 |

姓名長度沒有上限（見 Context），色塊 MUST 以 `truncate` 加固定 `max-width` 呈現超長姓名，並以
原生 `title` 屬性提供完整姓名（滑鼠停留可見）；視覺截斷不影響可存取名稱——螢幕閱讀器讀取的是
DOM 內完整的姓名文字，不受 CSS `text-overflow` 影響。此為呈現層的防禦性設計，不是可獨立驗收的
行為分支，不在 spec 內另立 Scenario（沿用 `visual-export` design 對「不可自動化驗證的視覺
細節」的處理方式：記錄決策但不為此發明測試）。

加入球員姓名色塊後，delta spec 新增「綁定模式含球員姓名色塊時多 viewport 仍零捲動」Scenario，
以雙打（兩隊各 2 筆姓名色塊，內容量最大的情境）重新跑一次既有的零捲動驗收公式，而非信任「新增
內容量不大所以應該沒事」的直覺——`scoreboard` spec 的「RWD 排版」Requirement 記載的多起既往
事故，起因都是「當下看起來沒事」的微小增量。

### Decision 6：`TeamPlayersSchema` 以 `us`／`them` 兩個陣列表達，長度 1～2

```ts
export const PlayerBadgeSchema = z.object({
	name: z.string(),
	colorFrom: z.string(),
	colorTo: z.string(),
	foreground: z.string(),
});

export const TeamPlayersSchema = z.object({
	us: z.array(PlayerBadgeSchema).min(1).max(2),
	them: z.array(PlayerBadgeSchema).min(1).max(2),
});
```

`us`／`them` 兩個 key 沿用 `scoreboard-binding.ts` 既有的 `ScoreboardTeamScores` 命名慣例
（「第一隊對應 `us`、第二隊對應 `them`」，`match-stage` spec 已明文規定此對應），不另外發明
一組新的隊伍索引語彙。

| 替代方案 | 否決理由 |
|---|---|
| 陣列長度不加 `.min(1).max(2)` 邊界（單純 `z.array(PlayerBadgeSchema)`） | schema 應該把「單打 1 人、雙打 2 人」這條已知的值域限制表達出來，而非留給呼叫端自律；`round-lifecycle` 與 `player-roster` 既有 schema 也習慣把已知值域寫進 zod（如 `TargetScoreSchema` 的三個字面量聯集），本 change 沿用同一慣例 |
| `colorFrom`／`colorTo` 用 hex 格式的 regex 驗證（比照 `PlayerSchema` 的 `HexColorSchema`） | `lib/scoreboard/` 刻意不依賴 `lib/matchmaker/` 的任何 schema（同 Decision 1 的單向相依），而 `lib/matchmaker/colors.ts` 檔頭註解本身也寫明「只處理 hex 色碼字串，不依賴參賽者資料模型，刻意保持獨立」；本 change 的 `PlayerBadgeSchema` 比照同一原則，色碼欄位維持 `z.string()`，格式正確性由寫入端（`buildMatchSlotSeed`，唯一生產者）負責，schema 只驗證「這是不是一個字串」 |

`PlayerBadge` 不含 `gender`／`rating`：proposal 的範圍明確只要求姓名與雙色漸層色塊，不需要
的欄位不預先加入 schema（`nextjs-pickball/CLAUDE.md`「清晰度優先、寧可多寫幾行」不等於「預先
加入用不到的欄位」）。

## Risks / Trade-offs

- **[加入球員姓名色塊可能壓縮既有的零捲動安全餘量]** → `scoreboard` spec 的「面板內容須保留
  邊界安全餘量」Scenario 已把最脆弱的 viewport（390x664）與最小安全餘量（4px）寫入既有驗收；
  本 change 新增的「綁定模式含球員姓名色塊時多 viewport 仍零捲動」Scenario 直接在該既有驗收
  公式上加測，不另立新的容許誤差。若加入後餘量不足，正解是縮小姓名色塊本身的字級／padding，
  而非放寬既有的零捲動或安全餘量門檻。

- **[球員姓名沒有長度上限，極端長姓名可能撐開色塊]** → Decision 5 已加入 `truncate` +
  `max-width` 的呈現層防禦；殘餘風險是視覺上看不到完整姓名（`title` 屬性提供滑鼠停留查看，
  觸控裝置無此手段）。判定為可接受：`prd.md` 12.1 描述的參賽者姓名通常為真實姓名或暱稱，
  常態長度遠低於會觸發截斷的門檻，且色塊本身仍完整顯示、比分計分不受影響。

- **[`teamPlayers` 快照與名單不同步可能造成使用者困惑]**（Decision 2 的必然代價）→ 已在 spec
  的 Requirement 文字內明確記載此限制與更新時機（重新走一次 seed 建立流程），且此為刻意接受
  的邊緣情境（比賽進行中途改名／改色）。若日後使用者回饋顯示此為真實痛點，應另開 change 討論
  是否要為「進行中場次的即時同步」設計反向相依例外或跨層事件機制，不在本 change 內處理。

- **[兩個 capability 對「名單找不到球員」給出不同答案（Decision 3 的已知不一致）]** →
  已在 Decision 3 明確記錄理由，且兩者面對的版面約束本就不同（離散格位 vs. 無版面約束的姓名
  文字），不視為需要統一的缺陷。

- **[本文件撰寫時 `matchmaker-player-stats`（M11）尚未合併，`main` 上的實際狀態以此文件撰寫
  時為準]** → 本 change 讀取的介面（`Player`、`RoundTeam`、`buildCourtTiles` 的間接消費、
  `CourtCard` 的 `players` prop）皆為 M1～M9 已合併且長期穩定的既有介面，M11（球員統計）
  依其 milestone 定位不預期會改動這些介面的形狀；但 apply 的 §0 仍 MUST 以合併後的 `main`
  重新核對本 change 引用的每一個既有函式簽章與 Requirement 標題（見 Open Questions 第 1 條），
  不得依本文件撰寫時的假設直接開工。

## Migration Plan

**無資料遷移。** 既有 `scoreboard:current:v1` 與 `scoreboard:matches:v1` 原地沿用，新欄位
`teamPlayers` 以 zod `.default(null)` 補值，使本次變更前寫入的資料（含正在進行中的比賽）在
讀取時被判為「無球員姓名色塊資訊」而非「損壞」。不新增 storage key、不 bump 既有 key 版本。

**部署**：前後端無 API 變更，`hono-pickball` 完全不受影響，仍依 root `README.md` 的部署前
手動檢查清單（lint → tsc → 前端 unit → 後端 unit → e2e → preview → 先後端後前端）。

**Rollback**：revert 本 change 的 commits 即可。回退後 `scoreboard:matches:v1` 內多出的
`teamPlayers` 欄位會被舊版的 `ScoreboardStateSchema` 判為未知欄位——zod 物件預設會**剝除**
未知欄位而非拒絕，因此舊版仍能正常讀取（與 `matchmaker-scoreboard-binding` design 的
`matchId`／`courtNumber` rollback 分析同構）。此點 MUST 於 apply 時以一個測試實測確認
（比照既有 `matchId`／`courtNumber` 的處理方式），SHALL NOT 只憑推論寫進本文件。

## Open Questions

1. **apply §0 MUST 以合併後的 `main` 重新對齊本 change 的兩處 MODIFIED delta**（`scoreboard`
   capability 的「localStorage 持久化」與 `match-stage` capability 的「場地區塊的計分板入口」）。
   本 change 序列執行於 M11（`matchmaker-player-stats`）之後，M11 的實際改動範圍在本文件撰寫
   時尚未可見；若 M11 恰好也改到這兩條 Requirement 或其實作檔案（`lib/scoreboard/types.ts`、
   `lib/matchmaker/scoreboard-binding.ts`），apply 的 §0 MUST 重新讀取合併後的 `main` 上的
   實際文字，把本文件的 MODIFIED 區塊在該實際版本上重新對齊後再編輯，SHALL NOT 直接假設本文件
   撰寫時的版本仍是最新基底。

   **【apply §1 已執行，結論：零漂移】**（2026-09-06，基底 `b7541af`，含 M10 `56331b0` 與
   M11 `e8e97cf`）：
   - `git diff 56331b0~1 HEAD -- lib/scoreboard/ lib/matchmaker/scoreboard-binding.ts
     components/matchmaker/CourtCard.tsx components/scoreboard/ lib/matchmaker/colors.ts
     lib/matchmaker/types.ts lib/matchmaker/round-types.ts
     tests/e2e/specs/scoreboard-binding.spec.ts` 輸出為空——M10／M11 完全沒有動到本 change
     引用的任何檔案。
   - 兩處 MODIFIED delta 逐行 `diff` 主 spec 的對應 Requirement：`scoreboard` 的
     「localStorage 持久化」與 `match-stage` 的「場地區塊的計分板入口」皆為主 spec 現況文字的
     **逐字超集**，差異只有本 change 刻意新增的段落與 Scenario，無需重新對齊。
   - 既有簽章逐一核對通過：`buildMatchSlotSeed(round, match)` 兩參數、
     `createInitialState(overrides)`／`settingsOf(state)` 成對且已帶入 `matchId`／`courtNumber`、
     `pickTextColor(colorFrom: string, colorTo: string): string`、
     `RoundTeam.playerIds: string[]`、`Player` 具備 `name`／`colorFrom`／`colorTo`、
     `CourtCard` 持有 `players: readonly Player[]` prop 且 `handleEnterScoreboard` 為唯一
     生產呼叫點。

4. **Decision 4 的「既有的三處呼叫」為本文件撰寫時的誤記**（apply §1.5 實測更正）：
   `scoreboard-binding.test.ts` 內實際有 **7 個 `buildMatchSlotSeed(round, match)` 呼叫運算式，
   分佈於 6 個 `it`**（「seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手」、
   「seed 帶入該場次的場地編號」、「多場次時 seed 取該場自己的場地編號，而非回合的第一場」
   ——此 it 內有 **2 次**呼叫、「已有進度的場次再次進入時保留既有進度不覆蓋」、
   「尚無條目時 ensureMatchSlot 寫入 seed 並回傳 seed」、「SSR（無 window）時 ensureMatchSlot
   不寫入也不 throw，仍回傳 seed」）。tasks.md §3.2 與 §5 結尾的清單所列的六個 it 才是正確
   基準；Decision 4 內文另誤指「tasks §9.5」，正確位置為 tasks.md §5 之後的「本 change 唯一
   容許變動的既有測試」段落。實作以 tasks.md 為準，斷言一律不變。

2. **姓名色塊的視覺樣式（padding、字級、圓角）留給 apply 的 Stage 1／2 審查依既有
   `components/scoreboard/`、`components/matchmaker/PlayerTile.tsx` 的既有視覺語言判斷**，
   design 不預先訂死確切的 px 數值——本 change 的核心是「資料要不要顯示、從哪裡來、怎麼保證
   單向相依」，具體樣式數值屬 Code-Quality Reviewer 依既有慣例把關的範圍，過度預先訂死反而可能
   與屆時 `main` 上的實際字級／間距慣例衝突。

3. **`components/scoreboard/` 是否該為本次改動新增一份元件單元測試（打破既有的 E2E-only
   慣例）？** 已於 Context／Non-Goals 決定**不新增**，沿用既有分層。若日後 `scoreboard` 元件
   整體改為採用元件單元測試（例如與 `components/matchmaker/` 統一慣例），那是一個獨立的、
   影響全 capability 的決策，不該由本 change 單方面開先例。
