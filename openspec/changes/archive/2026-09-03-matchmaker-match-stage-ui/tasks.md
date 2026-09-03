> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**：`app/**/page.tsx`、`app/**/layout.tsx` 與純呈現型元件屬本 workspace 的
> TDD 例外層（見 `nextjs-pickball/CLAUDE.md`），以 E2E 驗收；§11 的 E2E 紅燈多半來自
> 「路由還不存在」或「元素還沒渲染」，那是真紅燈。若某個測試加入後**立即全綠**，
> MUST 在該項後方誠實標註為 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 的 Open Questions 從假設
> 變成事實，避免 §7 之後整批建立在錯的介面上。

- [x] 1.1 確認目前 cwd 為 environment.md 宣告的 worktree，且 baseline `pnpm test` 全綠；把 baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [x] 1.2 讀 `main` 上 M4（`matchmaker-round-lifecycle`）的實際匯出——預期為 `nextjs-pickball/hooks/useRoundStore.ts` 與 `nextjs-pickball/lib/matchmaker/round-types.ts`：目前回合的型別與欄位、產生本輪／重設再排／送出比分三個 pipeline 的簽章與回傳形狀（成功與驗證失敗各長什麼樣）。與 design.md Decision 9 的假設逐項比對，**差異一律補記進 design.md 的 Open Questions 第 2 條**，不要默默改實作去遷就
- [x] 1.3 確認評分 capability（M3，`matchmaker-rating-engine`）上下限具名常數的**實際檔案路徑**——名稱已定案為 `RATING_MIN`／`RATING_MAX`，預期由 `nextjs-pickball/lib/matchmaker/rating-types.ts` 匯出（M3 的 spec「評分更新公式與常數」已明訂該 capability 以具名常數匯出，design 與 tasks 1.1 指名此二者，見 design Open Questions 第 1 條的已解決記錄）。以 `grep -rn "RATING_MAX" nextjs-pickball/lib/matchmaker/` 確認路徑後記下供 §6 取用；**路徑不同**（例如 M3 改由 `rating.ts` 轉出）→ 直接調整 import 往下做，**不需升級**；**完全找不到該匯出** → 才依 execution-plan 的升級條件回報人類由 M3 補匯出。任何情況都 SHALL NOT 在 `rating-bounds.ts` 內寫死 `1` 與 `8`
- [x] 1.4 確認 M4 是否匯出**可迭代的**目標分數選項清單（11／15／21）。M4 的 Round schema 已把 `targetScore` 定為 `11 | 15 | 21` 型別，但型別無法在執行期迭代出三顆按鈕；若只有型別沒有清單，MUST 於 M4 的 `round-types.ts` 補一個具名匯出再取用。SHALL NOT 從 `components/scoreboard/ScoreboardSetup.tsx` 的私有 `TARGET_SCORE_OPTIONS` 取用（那是 scoreboard 的內部實作，見 design Decision 6），也 SHALL NOT 在元件內寫死 `[11, 15, 21]`
- [x] 1.5 確認 `/matchmaker` 目前確實為 404（本 change 開始前的事實基準），並檢查 `nextjs-pickball/tests/e2e/specs/player-roster.spec.ts` 有無「頁面頂部第一個元素」這類位置性斷言——`app/matchmaker/layout.tsx` 會替該頁加上區段導覽（design Decision 1 的副作用）

## 2. 區段導覽的分頁與 active 判定（section-nav.ts）

- [x] 2.1 RED: 新增 `nextjs-pickball/lib/matchmaker/section-nav.test.ts`，寫入 it「目前路徑對應的分頁為 active，其餘分頁為非 active」：以 `"/matchmaker"` 與 `"/matchmaker/players"` 兩個輸入各斷言一次。跑單檔確認紅燈並貼出輸出
      - Stage 2 審查後補一個 it「分頁清單依序為對戰與參賽者兩筆」以 `toEqual` 釘住 label／href／順序（原測試只斷言 `active`，順序對調、label 對調、多回傳一筆三種 mutation 皆存活）。此 it 於實作完成後才補，寫入當下即為綠燈，**如實標註為 regression guard，非真紅燈**
- [x] 2.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/section-nav.ts` 的 `matchmakerSectionTabs(pathname)`：回傳兩筆分頁（「對戰」→ `/matchmaker`、「參賽者」→ `/matchmaker/players`），各帶 `label`、`href` 與 `active`
- [x] 2.3 REFACTOR: 分頁清單抽為模組層級 `as const` 常數，`active` 判定只有一處；確認函式為純函式、不 import 任何 React 或 `next/navigation`

## 3. 本輪設定的預設值與場地數夾值（round-settings.ts）

- [x] 3.1 RED: 新增 `nextjs-pickball/lib/matchmaker/round-settings.test.ts`，寫入兩個 it：「預設為單打與 1 個場地且取用分配引擎匯出的常數」（斷言直接比對 import 進來的 `DEFAULT_FORMAT`／`DEFAULT_COURT_COUNT`，**不寫字面量**）、「場地數加減夾在 1～8 並回報是否已達邊界」（8 加一仍為 8 且 `canIncrement` 為 false；1 減一仍為 1 且 `canDecrement` 為 false；4 加一為 5、減一為 3）。確認紅燈
- [x] 3.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/round-settings.ts`：`createRoundSettings()` 回傳 `{ format, courtCount, targetScore }`，`changeCourtCount(settings, delta)` 以 `MIN_COURT_COUNT`／`MAX_COURT_COUNT` 夾值並回報 `canIncrement`／`canDecrement`
- [x] 3.3 REFACTOR: 確認四個常數皆來自 `allocation-types.ts` 的 import，本檔沒有任何 `"singles"`／`1`／`8` 字面量；目標分數的預設值來自 1.4 確認的 M4 常數
      - Stage 2 審查後追加：`CourtCountChangeResult` 由「攤平繼承 RoundSettings」改為巢狀 `{ settings, canIncrement, canDecrement }`（攤平會讓它結構相容 RoundSettings，衍生旗標可被靜默存進 `useState<RoundSettings>`）；邊界判定抽為具名匯出 `courtCountBounds(courtCount)`，供 RoundControls 初次渲染直接取用，`changeCourtCount` 內部呼叫同一函式使判定仍只有一處。
      - Stage 2 的 16 次 mutation 中原有 6 次存活（旗標改用變動前的值、兩個旗標各自硬寫 false、上界改用 MIN 比、下界改用 MAX 比、丟棄 settings 展開），根因是測試從未斷言任何旗標為 `true`、也沒有「夾值前後不同」的案例。已補一個 it「場地數從邊界前一格加減至邊界時，回報的是變動後的邊界」與一個 `courtCountBounds` 的 describe，六者皆轉紅。**這些斷言於實作完成後才補，寫入當下即為綠燈，屬 regression guard 而非真紅燈。**

## 4. 色塊版面推導（stage-layout.ts）

- [x] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/stage-layout.test.ts`，寫入三個 it：「單打回傳兩格且兩格同列左右相鄰分屬兩隊」、「雙打回傳四格並排成 2x2」、「雙打上排兩格為第一隊下排兩格為第二隊」。第三個 it 是 design Decision 4 的判準——「對角同隊」的錯誤實作同樣會通過第二個 it，必須有獨立的一條把它擋下。確認紅燈
      - 三個 it 於實作前皆為真紅燈（模組不存在，`Failed to resolve import "./stage-layout"`）。
      - Stage 2 第一輪 28 次 mutation 有 **5 次存活**：單打／雙打回傳陣列順序對調、隊內球員順序反轉、單打兩隊 `columnOffset` 對調、單打 `row` 改為固定 5。根因是斷言用 `.sort()` 丟掉順序資訊，且 `row` 只驗「兩格相等」而未釘絕對值。補上有序的「球員—座標」tuple 斷言與 `row` 絕對值後六者（含雙打隊內 column 反轉）皆轉紅。
      - Stage 2 第二輪再抓到一個**複合變異**存活：回傳順序翻轉 **且** 兩隊 `columnOffset` 同時對調。根因是 it 1 用「陣列索引驗 `column`、球員身分驗 `teamIndex`」兩套互不交會的鍵，兩點同時變造會互相抵消。改為單一有序 `[player.id, teamIndex, row, column]` tuple 比對後轉紅。
      - **上述補強的斷言一律於實作完成後才寫，寫入當下即為綠燈，屬 regression guard 而非真紅燈。**
- [x] 4.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/stage-layout.ts` 的 `buildCourtTiles(match)`：依 `Match` 的 discriminated union 分支，單打回傳 2 格（同 `row`、`column` 為 0／1、`teamIndex` 為 0／1），雙打回傳 4 格（`row` 0 為第一隊兩人、`row` 1 為第二隊兩人）
      - 依 design Open Questions 第 2 條 (c)，參數型別為結構型別 `CourtTileSource`（只要求 `format` 與 `teams[].players`），`allocation-types.ts` 的 `Match` 可免 cast 直接指派；未另立 `RoundMatch → Match` 投影。
- [x] 4.3 REFACTOR: 確認單打與雙打共用同一個「由 `Team` 展開為 tile」的內部輔助函式，不各寫一份；回傳型別為純資料，不挾帶 React 節點
      - Stage 2 審查後追加三項：① 同一形狀 `{ readonly players: readonly Player[] }` 原本內聯三遍，抽為具名 `CourtTileTeamSource`（既有 codebase 在 tuple 位置一律放具名 interface）；② 刪除 `buildCourtTiles` 上方複述分支行為的 JSDoc（Decision 4 的理由檔頭已寫過一次）；③ 註解中的 tasks 章節編號改寫為不點編號的敘述。

## 5. 色塊樣式推導（tile-style.ts）

- [x] 5.1 RED: 新增 `nextjs-pickball/lib/matchmaker/tile-style.test.ts`，寫入兩個 it：「色塊背景為雙色漸層且前景取 pickTextColor 的結果」（斷言 `background` 同時含 `colorFrom` 與 `colorTo`，`color` 等於直接呼叫 `pickTextColor` 的回傳值——不硬寫顏色字串）、「已完成場次的色塊樣式降低不透明度與飽和度」（`completed: true` 相對 `false` 兩項皆較低，且 `false` 時不帶這兩項）。確認紅燈
      - 兩個 it 於實作前皆為真紅燈（模組不存在，`Failed to resolve import "./tile-style"`）。
      - Stage 2 的 30 次 mutation 有 **8 次存活，其中 7 次非等價**：`pickTextColor(colorFrom, colorFrom)`／`(colorTo, colorTo)`（只看單一端點）、完成分支的 `background`／`color` 被改壞或整個漏掉（3 種）、兩個分支各自多帶一個未預期的 CSS 鍵（2 種）。三個根因分別是：① 原測試只用一組「兩端皆淺色」的配色，擋不住「只看一端」——而 `pickTextColor` 的設計重點正是取**兩端**最小對比；② 完成分支的 `background`／`color` 從未被斷言；③ 逐鍵斷言不比對物件形狀。已改為「兩組互為反向的一深一淺配色」＋ `toStrictEqual` 完整物件比對，七者皆轉紅。
      - 第 8 個存活（`pickTextColor` 兩引數對調）經 Stage 2 獨立驗證為**等價變異**：`pickTextColor` 內部為 `min(contrast(from, fg), contrast(to, fg))`，`Math.min` 與 `contrastRatio` 對其兩引數皆對稱，任何輸入下對調結果相同。**刻意不殺。**
      - **上述補強的斷言一律於實作完成後才寫，寫入當下即為綠燈，屬 regression guard 而非真紅燈。**
- [x] 5.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/tile-style.ts` 的 `playerTileStyle(player, options)`：回傳可直接展開到 `style` 的物件；漸層寫法比照既有 `components/matchmaker/PlayerCard.tsx`
      - 回傳 `{ background, color }`，`completed: true` 時另帶 `opacity`／`filter`；`completed: false` 時該兩鍵**不存在**（非 `undefined`），對應驗收「不帶這兩項」的字面意思。
- [x] 5.3 REFACTOR: 完成場次的不透明度與飽和度抽為具名常數（不留裸數字），並在檔頭註解說明「為何走 inline style 而非 Tailwind class」與「降不透明度會削弱 `pickTextColor` 對比、但關鍵資訊顯示在色塊外」兩件事（design Decision 8）
      - 三個具名常數 `GRADIENT_ANGLE_DEG`／`COMPLETED_OPACITY`／`COMPLETED_SATURATION`，函式體內無裸數字（含漸層角度）。
      - 已知的跨檔重複（Stage 2 記錄，**本 change 不處理**）：漸層字串在 `tile-style.ts` 與 `components/matchmaker/PlayerCard.tsx` 各有一份字面量，格式完全一致但角度只在前者具名。建議後續 change 抽 `gradientCss(player)` 讓 `PlayerCard.tsx` 改為呼叫。

## 6. 強度觸頂／觸底判定（rating-bounds.ts）

- [x] 6.1 RED: 新增 `nextjs-pickball/lib/matchmaker/rating-bounds.test.ts`，寫入三個 it：「rating 為上限時判定為已達上限」、「rating 為下限時判定為已達下限」、「rating 介於上下限之間時不判定為觸界」（以 1.01、4.50、7.99 三個近界值，能抓到 `>=`／`>` 寫錯）。確認紅燈
      - 三個 it 於實作前皆為真紅燈（模組不存在，`Failed to resolve import "./rating-bounds"`）。近界值以 `RATING_MIN + 0.01`／`RATING_MAX - 0.01` 表達，斷言不寫死 `1`／`8`。
      - Stage 2 的 24 次 mutation **22 killed、2 存活，且兩個存活者在真實契約下皆為等價變異**——本組是唯一沒有斷言密度問題的一組（三態改名、觸頂觸底互換、恆回傳最常見態皆被殺）。
        兩個等價變異：① 兩個 `if` 先後順序對調（`rating >= RATING_MAX` 與 `rating <= RATING_MIN` 在 `RATING_MIN < RATING_MAX` 下互斥，`NaN` 在兩種順序下同樣落到 `within-bounds`）；② `>=`／`<=` 改 `===`（上游 `types.ts` 的 `z.number().min(1).max(8)` 與 `rating.ts` 的 `Math.max(RATING_MIN, Math.min(RATING_MAX, ...))` 雙重保證值域，兩種比較在 `[1, 8]` 內行為完全一致）。**兩者刻意不殺——為不可能的輸入寫斷言是假防護。**
      - Stage 2 退回的理由是**斷言逾越契約**（與前四組相反）：Implementer 交件前自行加入的兩條值域外斷言（`RATING_MAX + 0.01` → 觸頂、`RATING_MIN - 0.01` → 觸底）只多殺上述等價變異 ②、對真實契約可達的變異零貢獻，且其宣告的「飽和語意」並未被完整釘住（加 `Math.abs(rating)` 預處理仍全綠）。已移除該兩條斷言，三個 it 回到與 spec 的三個 Scenario 一一對應。
- [x] 6.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/rating-bounds.ts` 的 `ratingBoundState(rating)`：回傳觸頂／觸底／未觸界三態；上下限值取自 1.3 確認的來源
      - 上下限 `import { RATING_MIN, RATING_MAX } from "./rating-types"`（§1 前置確認已在 `main` 實測路徑正確）。
- [x] 6.3 REFACTOR: 確認本檔沒有 `1`／`8` 字面量，且回傳為可辨識的具名值而非布林對（布林對會讓呼叫端寫出「兩個都 true」的不可能狀態）
      - `grep -nE '\b1\b'`／`'\b8\b'` 皆無命中。回傳為 `export type RatingBoundState = "at-upper-bound" | "at-lower-bound" | "within-bounds"`（字面量聯集，屬 repo 慣例中 `export type` 的正當用途）。
      - Stage 2 審查後追加：實作端維持 `>=`／`<=`（比 `===` 穩健，上游若回歸夾值不會靜默漏標），並把該理由從測試承諾搬進 JSDoc；同時刪除與檔頭重複的 JSDoc 主句（慣例「不在檔頭與 JSDoc 各寫一次同一句話」）。

## 7. RoundControls 元件

Depends on: §3

- [x] 7.1 RED: 新增 `nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，寫入三個 it：「場地數為 1 時減號 disabled、為 8 時加號 disabled」、「對戰方式只提供單打與雙打且無性別限定模式選項」、「目標分數選項為 11／15／21 且預設選中 11」。確認紅燈（元件尚不存在，預期為模組解析失敗）
      - 真紅燈（`Failed to resolve import "./RoundControls"`）。
- [x] 7.2 GREEN: 實作 `nextjs-pickball/components/matchmaker/RoundControls.tsx` 的設定區：對戰方式、場地數加減（`aria-label` 明確）、目標分數 radiogroup（`role="radiogroup"` + 三顆 `role="radio"`，鍵盤索引重用 `@/lib/scoreboard/radio-navigation` 的 `nextRadioIndex`，見 design Decision 6）。所有資料與 callback 走 props，SHALL NOT 在元件內 import 任何 store
- [x] 7.3 RED: 補兩個 it：「目前回合存在時目標分數選擇器 disabled 並顯示已鎖定說明」、「按下產生本輪對戰會以目前設定呼叫回合產生函式一次」。確認紅燈
      - 兩者皆真紅燈（`Tests 2 failed | 3 passed (5)`）。
- [x] 7.4 GREEN: 補齊：有回合即鎖定目標分數（design Decision 5 的嚴格版）並顯示「本輪已鎖定」文字；「產生本輪對戰」按鈕以目前 `format`／`courtCount`／`targetScore` 呼叫 `onGenerate`
- [x] 7.5 RED: 補三個 it：「可出場人數不足一場時產生按鈕 disabled 並顯示繁體中文原因」、「無目前回合或場次全部完成時不顯示重設再排入口」、「目前回合仍有未完成場次時顯示重設再排入口並委派回合 capability」。確認紅燈
      - 三者中兩者真紅燈；**「無目前回合或場次全部完成時不顯示重設再排入口」寫入當下即為綠燈，如實標註為 regression guard**。原因是它為否定式斷言（`queryByRole(...).toBeNull()`），而重設按鈕整個區塊要到 7.6 才存在——功能缺席時否定式斷言天生成立，非以改斷言偽造紅燈。Stage 1 獨立判定此標註可信：同輪另兩個 it 確實真紅，顯示分類有區辨力；且該 it 在 7.6 之後仍具迴歸防護力（涵蓋 `round === null` 與「全部 completed」兩種情境）。
- [x] 7.6 GREEN: 補齊：人數不足時 disabled 並顯示含「每場所需人數」與「目前可出場人數」的繁體中文說明；重設／再排入口的顯示條件為「回合存在 **AND** 至少一場未完成」兩個條件同時成立
      - 「未完成」判定為 `status !== "completed"`（涵蓋 `pending` 與 `scoring`），非 `=== "pending"`（design Open Questions 2b）；測試以 `status: "scoring"` 的場次驗證此點。
- [x] 7.7 REFACTOR: 確認「每場人數」取自 `PLAYERS_PER_MATCH` 而非寫死 2／4；確認元件內沒有任何分配或評分計算；確認 disabled 一律以 `disabled` 屬性表達而非只調樣式
      - Implementer 自檢的 20 次 mutation 中 1 次存活（人數不足判定 `<` 改 `<=`，因 test-plan 指定的雙打 3 人與自加的單打 1 人都不在邊界上），補「雙打恰好 4 人時按鈕不得 disabled」後轉紅。
      - Stage 2 的 40 次 mutation 有 16 次存活，其中 **11 次為阻擋項**，根因是 **`onSettingsChange` 這條對外契約整條零斷言**（切換對戰方式／目標分數按了完全沒反應、加號會減場地、減號會加場地、回呼丟掉其他欄位、順手重設 `targetScore` 都能全綠），另加對戰方式的 `aria-checked` 無斷言、場地數**顯示值**無斷言、`round.matches` 為空陣列時的鎖定行為無斷言。已補兩個 regression guard it（`onSettingsChange` 完整物件契約、`matches: []` 仍鎖定）與三處既有 it 內的斷言，十一者皆轉紅（leader 以腳本機械複驗，還原後逐位元組相同）。
      - Stage 2 追加採納：`FORMAT_OPTIONS` 改為 `readonly MatchFormat[]` 且由 `FORMAT_LABEL` 的 key 推導，避免 `MatchFormat` 擴值時兩處各自漂移。
      - **上述補強的斷言一律於實作完成後才寫，寫入當下即為綠燈，屬 regression guard 而非真紅燈。**
      - 其餘 5 個存活變異經 Stage 2 判定**不阻擋**：`tabIndex` 全 0／全 -1、`if (locked) return;` 刪除、自寫索引計算取代 `nextRadioIndex` 三者屬「方向鍵導覽整體交由 §11 E2E」的分工結果；`PLAYERS_PER_MATCH[round?.format ?? settings.format]` 需要超出任何 Scenario 的情境才抓得到。**→ §11 的 E2E 驗收清單 MUST 補上「鎖定時按方向鍵目標分數不變」與「roving tabindex 只有選中項為 0」兩條**，否則 Decision 5 的鎖定嚴格性與 Decision 6 的重用點在整個 change 內將無任何一層測試保護。
      - Stage 2 記錄的跨 capability 重複（**本 change 不處理**）：`handleTargetScoreKeyDown` 與 `components/scoreboard/ScoreboardSetup.tsx` 近乎逐字相同，radiogroup 的 JSX 亦然；重複的是「roving tabindex + focus 管理」這段純機制程式碼而非產品決策，但 Decision 6（不搬檔不合併）與 Decision 3（不新增 `hooks/` 檔案）讓本 change 沒有可落地的抽法。建議後續 change 抽共用 hook 或 presentational 元件。

## 8. CourtCard 與 PlayerTile／ScoreEntry

Depends on: §4, §5, §6

> **§8 的完整審查紀錄（含 Stage 2 退回當下的原始狀態、mutation 明細、被判定為契約外而
> 不處理的項目）見 design.md Open Questions 第 6 條。** 本節只記結論。

- [x] 8.1 RED: 新增 `nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，寫入三個 it：「每個色塊顯示姓名、性別與強度分數」、「雙打場次顯示男雙女雙混雙或一般雙打的組成標示」（四個分支各斷言一次）、「場地與隊伍皆有文字標籤使色彩不是唯一資訊來源」。確認紅燈
      - 十個具名 it 於引入時皆為**真紅燈**（四輪 RED：8.1／8.3／8.5／8.7）。
- [x] 8.2 GREEN: 實作 `CourtCard.tsx` 與 `PlayerTile.tsx`：色塊網格由 `buildCourtTiles` 推導（§4）、樣式由 `playerTileStyle` 推導（§5）、格子為 `aspect-square` 並設最小高度（design Risks）；場地標題與隊伍標籤為可讀文字
      - `RoundMatch` 只存 `playerIds`，故以 `players` prop 查表解析為完整 `Player` 後組成 `CourtTileSource` 餵給 `buildCourtTiles`（design Open Questions 2c），未另立 `RoundMatch → Match` 投影。查無球員時該格略過不渲染、不拋錯（`roster.ts` 的 `removePlayer` 不禁止移除仍在場次中的人）。
- [x] 8.3 RED: 補三個 it：「比分欄位為 inputMode numeric 並標示所屬隊伍」、「送出比分會以場次識別與兩隊分數呼叫回合送出函式一次」、「送出失敗時於該場次以 role alert 顯示繁體中文錯誤訊息」。確認紅燈
- [x] 8.4 GREEN: 實作 `ScoreEntry.tsx`：兩個 `inputMode="numeric"` 欄位（各有指出隊伍的可存取名稱）與送出鈕；送出呼叫 props 傳入的 `onSubmitScore`；驗證失敗訊息由 props 傳入並以 `role="alert"` 呈現。**SHALL NOT 在此複製任何比分驗證規則**（空白／非數字／平局／已完成皆屬 M4）
      - **Stage 2 抓到的實質缺陷（非 mutation 發現）**：初版在呼叫父層 callback 前先做 `Number()` 轉換，銷毀了 M4 的 `validateScoreInput` 分辨空白與非數字所需的原字串——「只填第一隊 11」會讓空欄位被靜默補成 0 並完成整場（寫入 11:0 與評分變動）。已改為 **`onSubmitScore(matchId, rawScoreA: string, rawScoreB: string)` 原字串直傳**，`ScoreEntry` 內不再有任何 `Number()`。
        裁決：**不牴觸規格**——spec Scenario 的 THEN 只說「帶入該場次識別與兩隊分數」、未指定型別，tasks 8.3／8.4 亦然；test-plan 的 `[11, 7]` 屬計畫階段示意。**it 名稱不變**，斷言改為 `toHaveBeenCalledWith("match-42", "11", "7")`。
        **→ §11 接 `submitScore` 時直接把這兩個原字串餵給 `rawScoreA`／`rawScoreB`，SHALL NOT 再轉型。**
- [x] 8.5 RED: 補三個 it：「已完成場次的比分欄位與送出按鈕皆為 disabled」、「已完成場次顯示最終比分勝方與完成時間」、「勝方以文字標籤標示而非僅以顏色區分」。確認紅燈
- [x] 8.6 GREEN: 補齊完成場次呈現：色塊套 `playerTileStyle(..., { completed: true })`；場次資訊列顯示最終比分、勝方文字標籤與 `HH:mm` 完成時間（design Open Questions 第 3 條）；欄位與送出鈕 `disabled`
      - 完成時間讀本地時區的時／分並各自 `padStart(2, "0")`，不切片 ISO 字串（切片取到的是 UTC）。未抽共用格式化函式（Open Questions 3 的刻意決定）。
      - 比分與完成時間**各自獨立判斷是否顯示**，不讓 `completedAt` 損壞連坐拖累仍然合法的比分。
- [x] 8.7 RED: 補 it「色塊在觸頂或觸底時顯示已達上限或已達下限標示」：場次含 `rating` 8.00 與 1.00 兩人，分別斷言「已達上限」「已達下限」文字。確認紅燈
- [x] 8.8 GREEN: 於 `PlayerTile` 接上 `ratingBoundState`（§6），以文字（可搭配圖示）標示，比照既有 `PlayerCard.tsx` 的「暫停出場」Badge 做法——不倚賴顏色辨識
- [x] 8.9 REFACTOR: 確認 `CourtCard` 只做組裝，版面／樣式／觸界三項推導全在 `lib/` 的純函式；確認單打與雙打共用同一個 `PlayerTile`，沒有為雙打另寫一份
      - Implementer 自檢 25 次 mutation，2 次初次存活後補斷言（兩隊 `playerIds` 對調、勝方 badge 條件塌陷）。
      - Stage 2 的 55 次 mutation 有 **23 次存活、其中 11 次非等價**。六個根因：① 完成場次色塊樣式的 wiring 完全沒測；② 隊伍文字標籤與 testid 脫鉤（勝方 badge 可掛在寫著另一隊的格子上）；③ 完成比分順序沒釘（集合式斷言丟失順序，與 §4 同一個盲點）；④ **球場網格結構零斷言（7 次存活，最大缺口）**——單打的 it 只驗 `gridColumn`、雙打的 it 只驗 `gridRow`，一個三處互相抵消的複合鏡射就從這條縫穿過；⑤ 完成時間的補零分支從未被執行（測資小時本來就兩位數）；⑥ `scoring` 狀態零覆蓋。已逐項補斷言，**leader 以腳本機械複驗 18 個非等價變異全數轉紅**，還原後三檔皆與基準逐位元組相同。
      - Stage 2 追加採納的四項設計保真修正：雙打隊伍標籤改貼各自那一排（原本兩個標籤同放網格上方左右分置，「第二隊」壓在第一隊色塊上方，讀者仍得靠顏色連回色塊）；比分與完成時間的顯示條件拆開；`style={style as CSSProperties}` 改為 `style={{ ...style }}`（展開取得隱式索引簽章，不需繞過型別檢查）；補「查無球員」與 `min-h-*` 兩條 regression guard。
      - Stage 2 判定 `CourtCard` 內 `tile.row * 2 + 1`／`tile.column + 1` **不算第二份版面推導**（只是把 `buildCourtTiles` 已推導的邏輯座標翻譯成 CSS grid 列號），但正因這幾個數字的耦合只靠人腦維持，才需要根因 ④ 的網格結構斷言。
      - **上述補強的斷言中，除「原字串契約」與「雙打標籤位置」兩項伴隨實作改動而先紅後綠外，其餘一律於實作完成後才寫、寫入當下即為綠燈，屬 regression guard 而非真紅燈。**

## 9. RestingPanel 元件

- [x] 9.1 RED: 新增 `nextjs-pickball/components/matchmaker/RestingPanel.test.tsx`，寫入兩個 it：「休息名單顯示姓名顏色標記與累計休息次數」、「休息名單為空時區分本輪全員出場與全員暫停出場兩種文案」（兩段文案 MUST 不相等——分配引擎不把暫停者列入休息名單，兩種情況的資料完全相同，只有這條測試能分辨）。確認紅燈
      - 兩個 it 於實作前皆為**真紅燈**（模組不存在）。
      - 兩段文案除了「不相等」之外**各自釘住絕對值**（「本輪全員出場」／「目前沒有任何可出場的參賽者（全員暫停出場）」），並互相斷言對方文案不得出現——只驗不相等的話，把兩段都改成別的字仍會通過。
      - **兩階段審查都退回，且兩位 Reviewer 獨立指出同一個問題**：Implementer 在 mutation 自檢時，為了殺死「元件內加入 `resting.filter((p) => p.isActive)`」這個變異，把測試資料中第二位休息者改成 `isActive: false`。但 `match-allocation` 的 spec 明文「暫停出場者……**也不出現在休息名單**」，`candidates.ts` 的 `selectPlaying` 先 `filter((p) => p.isActive)` 再 slice，`resting` 在結構上**不可能**含暫停者——那是不可達狀態，等於為了殺一個契約外的變異而承諾 spec 沒要求的行為。已還原為 `isActive: true`，該變異**恢復存活且刻意不殺**（契約下的等價變異）。
        **這是本 change 第二次踩到同一顆地雷**（§6 同因被退回）。判準：補斷言前先自問「這個變異在合法輸入下可不可能發生」。
      - Stage 2 的 43 次 mutation 有 **4 個非等價、且對應真實可達生產狀態的變異存活**，三個根因皆為測試資料的邊界覆蓋不足：
        ① **無單人休息的案例**——空狀態門檻改成 `resting.length < 2` 仍全綠，單人名單被整個吞掉卻顯示「本輪全員出場」。奇數可出場人數必然產生單人休息（3 人單打 1 場地）。
        ② **無 `restCount === 0` 的休息者**——`filter(restCount > 0)` 與「`restCount > 0` 才顯示數字」兩個變異存活。**第一輪休息名單全員 `restCount` 恆為 0**（`round.ts` 的 `createRound` 只結算「上一輪」休息者），這是必然狀態而非理論邊界。
        ③ **測試資料的清單順序與排序鍵單調同向**——原 fixture 的 `restCount` 為 2 → 5，恰好已遞增排好，`sort((a,b) => a.restCount - b.restCount)` 無法轉紅；且分配引擎的真實輸出是 **`restCount` 遞減**（`candidates.ts` 的 `compareCandidates` 為 `b.restCount - a.restCount`），原 fixture 方向與真實資料相反。
        已把測試資料改為**三筆、`restCount` 為 5／0／3**（清單順序上兩個方向皆非單調），並補單人渲染的案例。**leader 機械複驗 10 個非等價變異全數轉紅、`filter(isActive)` 如預期存活**，還原後逐位元組相同。
      - **上述補強的斷言一律於實作完成後才寫，寫入當下即為綠燈，屬 regression guard 而非真紅燈。**
- [x] 9.2 GREEN: 實作 `RestingPanel.tsx`：每筆顯示姓名、帶該員漸層的顏色標記與「休息 N 次」；空狀態依 `hasActivePlayers` 分流為兩段文案
      - 顏色標記為純裝飾的空 `<span>`，帶 `aria-hidden`（姓名與「休息 N 次」的文字才是主要資訊；讀屏本來就讀不到顏色，資訊零損失）。做法與 `PlayerTile.tsx`、`EmptyRoster.tsx` 對裝飾元素的既有慣例一致。
- [x] 9.3 REFACTOR: 顏色標記重用 `playerTileStyle`（§5）而非另寫一份漸層字串；確認元件不含任何排序或篩選邏輯（休息名單的內容由分配引擎決定）
      - `grep` 機械確認：無 `linear-gradient` 字面量、無 `.sort(`／`.filter(`／`.slice(`、無 `players.find` 之類的 id 查表、未 import `hooks/` 或 `round.ts`。
      - 顏色標記**展開完整的 `playerTileStyle` 回傳物件**（`style={{ ...style }}`）而非只取 `background`：只取 `background` 會讓 `completed` 誤傳在 DOM 上完全不可觀察（實測 `completed: true` 在完整展開下轉紅、只取 `background` 時存活），且違反「元件不得對 `playerTileStyle` 的回傳值做挑選」的一致性。
      - Stage 2 另要求精簡註解：同一句「休息名單不對應任何場次，`completed` 恆傳 `false`」原本在檔內相距 11 行寫了兩次（§4、§6 被退回的同一條慣例），已合併；`{...style}` 的辯護由 5 行壓到 2 行（原註解密度約 29%，對照 `PlayerTile.tsx` 約 15%、`CourtCard.tsx` 約 18%）。
      - leader 裁決放行的一項：測試註解中的「（tasks 9.3）」引用形式。既有 codebase 大量存在此形式（`pairing.ts`、`allocation.ts`、`types.ts`、`round-types.ts`、`duplication.test.ts`），依「風格分歧時既有 codebase 風格勝出」放行；派工單禁止的是「§9」這種 openspec 章節符號。

## 10. SiteNavbar 新增第 5 條連結

- [x] 10.1 RED: 於既有 `nextjs-pickball/components/layout/SiteNavbar.test.tsx` 補兩個 it：「Navbar 顯示對戰分配連結且指向 /matchmaker」、「路由為 /matchmaker 時對戰分配連結套用 active 樣式」（沿用該檔既有的 `vi.mock("next/navigation")` 模式）。確認紅燈
      - 兩個 it 皆為**真紅燈**（`Tests 2 failed | 3 passed (5)`，既有三個 it 全數通過，證實紅燈只來自新斷言）。
      - active 樣式的 it 兩半都驗（該連結套 active、其餘四條為 muted），以 `className.split(/\s+/)` 的 exact token 比對而非 substring——`text-slate-900` 是 `hover:text-slate-900` 的子字串，substring 比對會誤判。
- [x] 10.2 GREEN: 於 `SiteNavbar.tsx` 的 `NAV_LINKS` 加入 `{ href: "/matchmaker", label: "對戰分配" }`；`transitionTypes` 沿用既有規則（非 `/` 一律 `nav-forward`）
      - **`transitionTypes` 以 code inspection 驗收，RTL 不可觀察**（不留下「有測試涵蓋」的錯覺）：Stage 2 獨立查證 `next/dist/esm/client/link.js`，`transitionTypes` 在解構後不會落進 `restProps`、整條路徑無 `setAttribute` 或 spread 到 DOM `<a>`；全 repo 四處使用（`HeroTourCta.tsx`、`TourSkipButton.tsx`、`ClosingStage.tsx`、`SiteNavbar.tsx`）皆無測試覆蓋。三種補法（mock `next/link`、為可測而抽 exported helper、E2E 反推動畫方向）都不划算。真正的護欄在程式碼形狀：該三元是 5 條連結**共用的同一個運算式、無 per-link 特例**，要製造偏差必須顯式加上一眼可見的特例。
- [x] 10.3 RED: 於 `nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts` **新增**一個 test「窄螢幕下對戰分配連結亦全部可見」（390px 下第 5 條連結 visible 且不換行）。**既有 test「窄螢幕下四個導航連結全部可見」原樣保留不改名**——openspec 的 MODIFIED 是整段取代語意，改 Scenario 標題會被 `validate --strict` 判為刪除既有 Scenario（spec 內已註明）。跑 E2E 確認紅燈；若順序上 10.2 已完成使新 test 立即全綠，此步為 regression guard，MUST 在此如實標註，SHALL NOT 偽造紅燈
      - **依 tasks 原順序執行（10.2 先於 10.3），新 test 寫入當下即為綠燈——如實標註為 regression guard，非真紅燈。** Stage 1 獨立判定此標註可信且**不需重排順序去追求真紅燈**：tasks 10.3 本身已預先授權這個情況；若該 test 在 10.2 之前寫，`getByRole("link", { name: "對戰分配" })` 必然找不到元素而紅燈。
      - 該 test 兩件事都驗：連結 visible，且窄／寬螢幕高度差 ≤ 4px（不換行）。
      - 既有四個 E2E test 與三個既有 it **原樣保留**：`git diff` 的 `^-` 行（排除 header）為空，證實整段改動為純新增。
- [x] 10.4 GREEN: 確認 390px 下 logo 與五個連結皆不換行（既有 test「窄螢幕下 logo 與導航連結皆不換行」為紅燈來源）。**若換行**：依 design Decision 7 的退路把連結文案由「對戰分配」縮短為「對戰」，並同步更新 10.1 的 it 斷言與 spec 的 MODIFIED 內文；**SHALL NOT 改為漢堡選單或橫向捲動**
      - 實測 390px 與 1280px 下 logo 皆 20px、連結皆 36px（一致，無換行），**未動用 Decision 7 的縮短文案退路**，spec 的 MODIFIED 內文不需調整。
- [x] 10.5 REFACTOR: 確認 `NAV_LINKS` 仍只含公開內容路由（`/health` 未被順手加入）；逐項確認四個既有 navbar E2E test 仍綠——「窄螢幕下 logo 與導航連結皆不換行」、「窄螢幕下四個導航連結全部可見」、「寬螢幕顯示 logo 文字，窄螢幕收合只留圖示」、「窄螢幕下導航列內容不橫向溢出」（後兩者本 change 不改動，屬既有 regression guard，在此列名以免收尾時漏跑）
      - E2E（chromium，該檔 `test.skip` 非 chromium）五個 test 全綠，逐項列名確認。跑前跑後 `lsof -i :3005 -i :8787` 與 `ps aux` 皆無殘留。
      - Stage 2 的 26 次 mutation 有 **3 個非等價變異存活，根因是 active 的「排他性」零護欄**：`|| link.href === "/matchmaker"`、`= link.href === "/matchmaker"`、`startsWith` 前綴比對（後者會讓 `/matchmaker/players` 下「對戰分配」也高亮）。原 active it 把 THEN 的兩半都驗了，但 **WHEN 只餵 `/matchmaker` 一個值**，整個測試檔從未觀察過「對戰分配在非 `/matchmaker` 路由下長什麼樣」。已補 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」（pathname 用 `/matchmaker/players`，一併釘住前綴比對這條邊界），三者皆轉紅。
      - Stage 2 另指出 **`whitespace-nowrap`（spec 明文的「本 Requirement 核心」）在單元與 E2E 兩層都是真空**：390px 下餘裕為正（約 28px），內容本來就排得下一行，拿掉 `whitespace-nowrap` 不會讓既有高度測試轉紅——它是「餘裕為負時才發揮作用」的保險絲，而本 change 剛把餘裕從 90px 砍到 28px。已補 it「logo 與所有導航連結皆套用 whitespace-nowrap」（走訪所有 link 斷言 class token），logo 與連結兩個變異皆轉紅。
      - Stage 2 另修兩項：① `SiteNavbar.tsx` 的路由列舉註解「（/tour、/scoreboard、/quiz）」加入第 5 條後已不完整，改為不列舉的寫法（每加一條連結就要維護一次的列舉本身就是漂移來源）；② `afterEach` 的 `vi.clearAllMocks()` 只做 `mockClear()`、**不會清掉 `mockReturnValue`**，`usePathname` 的回傳值會外洩到後續測試——原本因 active it 排最後才沒炸，新增第三個 it 會立刻引爆，已改用 `vi.resetAllMocks()`。
      - **leader 機械複驗 9 個 mutation 全數轉紅**（3 個 active 排他性 + 2 個 `whitespace-nowrap` + `href` 改子路由 + muted class 與 active 同值 + 順手加 `/health` + active 整體反轉），還原後逐位元組相同。
      - 兩位 Reviewer 一致判定為**契約外、刻意不殺**的存活變異：`NAV_LINKS` 陣列順序（spec 只說「並列顯示」未規定順序）、`transitionTypes` 給 `nav-back`（RTL 不可觀察，見 10.2 的註記）、label 前後加空白（accessible name 會正規化）、`key` 改用 label、`NAV_LINKS` 去 `readonly`、非 solid（首頁）分支的 active／muted 對調（既有缺口非本組新增）、`px-2` → `px-4`（E2E 的橫向溢出測試有機會抓到）。
      - **上述補強的斷言一律於實作完成後才寫，寫入當下即為綠燈，屬 regression guard 而非真紅燈。**
- [x] **10.6（coordinator 追加，tasks.md 原本未列）**：更新 `nextjs-pickball/app/matchmaker/players/page.tsx` 的檔頭註解。原文「刻意不加進全站 navbar——功能尚不完整（有名單但還無法產生對戰），導覽整合待對戰畫面完成後與 site-navbar capability 一併處理」在 §10 完成後即成為假敘述。改為描述現況：navbar 的 matchmaker 入口指向對戰頁 `/matchmaker`（不同時掛第二條指向本頁的連結，spec 明文），本頁改由 matchmaker 區段內的區段導覽抵達。**只改註解，程式碼零改動**（`git diff` 確認）。
      - `tests/e2e/specs/player-roster.spec.ts` 檔頭的類似敘述**未動**——該句說的是「此頁一律用 `page.goto()` 直接以網址存取，不走 navbar 連結」，這在 §10 之後**仍然成立**（navbar 沒有指向本頁的連結）。

## 11. 頁面組裝與 E2E

Depends on: §2, §3, §4, §5, §6, §7, §8, §9, §10

> **§11 的完整審查紀錄（兩階段退回的原因、mutation 明細、四項 leader 裁決、被判定為已知缺口
> 而不處理的項目）見 design.md Open Questions 第 7、8 條。** 本節只記結論。

- [x] 11.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，寫入三個 test：「對戰頁可經 /matchmaker 開啟並顯示場次舞台」、「區段導覽可在對戰頁與參賽者名單頁之間來回切換」、「從首頁點擊 Navbar 的對戰分配連結進入對戰頁」。確認紅燈（`/matchmaker` 目前為 404，見 1.5）
      - **真紅燈**（`/matchmaker` 為 404、`match-stage-region` 找不到、nav 找不到）。
- [x] 11.2 GREEN: 新增 `app/matchmaker/layout.tsx`（掛 `MatchmakerTabs`，分頁資料來自 §2 的 `matchmakerSectionTabs`，目前分頁帶 `aria-current="page"`）與 `app/matchmaker/page.tsx` 骨架（`"use client"`，此檔為**唯一** import M4 store 之處，design Decision 9）
      - `layout.tsx` 另加 `pt-14` 補償 fixed navbar——`/matchmaker/players` 原本沒有、一直壓在 navbar 下，屬引入共用 layout 帶來的**既有 bug 修正**（`app/quiz/page.tsx` 有逐字相同的先例）。兩位 Reviewer 皆確認**不需列 `player-roster` 為 Modified capability**（該 spec 全文無版面條款）。
- [x] 11.3 RED: 補三個 test：「有可出場參賽者但尚無回合時顯示空白球場與建立第一輪入口」、「名單為空時空白狀態提供前往參賽者名單的入口」、「空白狀態不顯示任何球員色塊或比分欄位」。種入 `matchmaker:roster:v1` 的方式沿用既有 `player-roster.spec.ts` 的 `addInitScript`。確認紅燈
      - **真紅燈**（`empty-stage` testid 三條皆找不到）。
      - tasks 此處有一處事實不精確：`player-roster.spec.ts` **並未**使用 `addInitScript`，而是 `goto("/")` + `evaluate` 的 `removeItem`（它只**清**資料、從不**種**資料）。本組改用 `page.addInitScript`（先例在 `scoreboard.spec.ts`），理由是要在首次 hydration 前就備妥資料。
- [x] 11.4 GREEN: 實作 `EmptyStage.tsx` 並於 `page.tsx` 依「有無回合」與「有無可出場參賽者」兩個條件分流入口
- [x] 11.5 RED: 補兩個 test：「單打場地為兩個接近正方形的色塊且左右排列」（量測 boundingBox 寬高比 0.85～1.15、垂直中心相同）、「完成一輪：產生本輪對戰後手動輸入比分並送出使場次進入完成狀態」（全程走 UI，不種回合資料）。確認紅燈
      - **真紅燈**（0 個色塊、score-label 找不到）。
- [x] 11.6 GREEN: 實作 `MatchStage.tsx`（場次網格 + 休息名單）並於 `page.tsx` 接上 M4 的產生／重排／送出 pipeline；種資料 helper 集中一處並註明「格式來源為 M4 的 `matchmaker:round:v1`，改動請同步」（design Risks）
      - **完全沒有種入 `matchmaker:round:v1`**：含「2 場對戰」「目標分數已鎖定」在內的每個情境都能用 UI 達成，因此不需要回合資料的 helper，也**徹底消滅了 design Risks ①「E2E 種入 `matchmaker:round:v1` 是對 M4 內部格式的硬耦合」這個風險**。tasks 此處的 helper 要求是 conditional（有種資料才需要），design Risks 亦明說「能用 UI 產生的優先用 UI」。**兩位 Reviewer 皆明確背書此偏離優於 tasks 字面要求。**
      - `submitScore` 依 §8 交接傳**原字串**、不做 `Number()` 轉換。
- [x] 11.7 RED: 補三個 test：「桌面斷點場地內容與休息名單左右並排」、「平板斷點休息名單移至場地內容下方」、「手機斷點觸控目標不小於 44px 且不橫向溢出」。確認紅燈
      - **regression guard，非真紅燈**：RWD 版面在 11.6 的 GREEN 就一併做完（同一個元件的版面決策），三個 test 寫入即綠、零程式碼改動。Stage 1 獨立判定此標註**誠實、不構成規避 TDD**。
- [x] 11.8 GREEN: 實作 RWD 三斷點版面：桌面 `lg` 起左右並排、平板單欄且休息名單下移、手機單欄；比分欄位與按鈕的觸控目標 ≥44px
      - 手機觸控目標以 `MatchStage.tsx` 的 `max-md:[&_input]:h-11 max-md:[&_button]:min-h-11` 後代選擇器覆寫 `CourtCard`／`ScoreEntry` 的 `h-8`／`h-9`（specificity `(0,1,1)` 勝 `(0,1,0)`，Stage 2 已獨立驗證；`min-h-11` 更是不同屬性天然勝出）。`ScoreEntry.tsx` 檔頭已補反向指標說明 44px 保證來自消費端。
      - **leader 裁決的「主要按鈕」範圍**：「產生本輪對戰」與「重設／再排」MUST ≥44px（spec 原文稱前者為「主要操作入口」），已納入覆寫與 E2E 量測；場地數加減（`icon-sm`，32×32）與目標分數／對戰方式的 radio（`sm`，32px）**本 change 不擴大範圍**——spec 的 MUST 對象是「比分欄位與主要按鈕」。**此界定明文記錄，避免後續 review 再撞一次。**
- [x] 11.9 RED: 補三個 test：「目標分數 radiogroup 支援方向鍵導覽與 roving tabindex」、「主要按鈕可由鍵盤聚焦並顯示 focus 樣式，停用者帶 disabled 屬性」、「對戰頁所有互動控制皆具備可存取名稱」。確認紅燈
      - **regression guard，非真紅燈**：`components/ui/button.tsx` 本就內建 `focus-visible:ring-ring/50 focus-visible:ring-[3px]` 與原生 `disabled`，§7～§9 也已把 roving tabindex 與 `aria-label` 做對，三個 test 寫入即綠。
- [x] 11.10 GREEN: 補齊無障礙缺口：圖示按鈕補 `aria-label`、focus 樣式可見、disabled 以屬性表達
      - **no-op、零實作**——未找到任何缺口（見 11.9 的說明）。
- [x] 11.11 REFACTOR: 以 `grep` **機械確認**（不靠印象）—— ① 對 M4 store 的 import 只出現在 `app/matchmaker/page.tsx`；② `git diff --stat` 顯示 `hooks/` 目錄零新增檔案（design Decision 3）；③ 元件的 props 命名一致（一律 `onXxx`）
      - 三項皆由兩位 Reviewer 獨立以 `grep`／`git status` 複驗通過。`hooks/useRoundStore.ts` 與 `useRoundStore.test.tsx` 皆為 `M`（修改既有檔），`hooks/` 零新增檔案，`hooksInventory.test.ts` 未受影響。
      - **兩階段皆退回一輪，且兩位 Reviewer 獨立收斂到同一個核心問題**：「鎖定時按方向鍵目標分數不變」那段 E2E 斷言**測不到**它要保護的 `RoundControls.tsx` 的 `if (locked) return;`——點擊「產生本輪對戰」後 focus 在 radiogroup **之外**（該按鈕是容器的手足），keydown 不會冒泡進 handler；且鎖定時三顆 radio 全 `disabled`，鍵盤無法把焦點放進容器。**已依裁決改放 integration 層**：`RoundControls.test.tsx` 以 `fireEvent.keyDown` 直接對 radiogroup 容器派發（RTL 不受「disabled 元素不可聚焦」限制），補鎖定與未鎖定兩條對照——順帶補上 §7 完全缺席的鍵盤導覽 integration 覆蓋（§7 Stage 2 有三個變異當初就是因「交由 §11 E2E」而存活）。
      - Stage 2 對 `hooks/useRoundStore.ts` 跑了 12 個 mutation、**存活 11 個**（唯一守住的是「移除 `hasHydratedRef` 守門」，由既有 hydration 測試擋下）。已在 `hooks/useRoundStore.test.tsx`（**既有檔，編輯它不違反 Decision 3**）補 6 個 it：`submitScore` 成功路徑（釘住 round 狀態、`updatePlayer` 呼叫次數等於該場人數、被 patch 的 id 集合）、連送兩場驗 history **依序附加而非覆蓋**、失敗路徑（`round` 參考以 `toBe` 比對不變、`updatePlayer` 未被呼叫）、`round === null` 時回 `MATCH_NOT_FOUND`、`resetIncompleteMatches` 成功／失敗兩條、history 持久化到 localStorage。同時修掉該檔已過期的「submitScore 尚未接線」註解。
      - Stage 2 另找到 **E2E 的四條空／缺席斷言**（皆為「改壞實作後全部 test 仍綠」）：① `aria-current="page"` 零斷言（spec 的 MUST）；② 「建立第一輪」從未被點過（tasks 11.4 明訂它等同「產生本輪對戰」）；③ focus 樣式斷言量的是 `variant="outline"` 本就有的 `shadow-xs`，把 `focus-visible:ring-*` 全砍光仍綠；④ 失敗路徑完全沒測，`submitError` 的**逐場次綁定**改成全場地一起亮紅字仍綠。已逐條補齊，E2E 由 14 個增為 **15 個 test**（第 15 個為多場地失敗路徑的 regression guard，不對應 spec 驗收錨點，已於該 test 上方註明）。
      - Stage 2 另修：三處**逐字重複註解**（本 change 第四次因同一條慣例被退回）、兩處 `§` 章節符號、`layout.tsx` 41.2% 與 `MatchStage.tsx` 25.9% 的過高註解密度、`hasActivePlayers` 在 `page.tsx` 與 `MatchStage.tsx` 各推導一次（改以 prop 傳入，Decision 9）、T8 的 `rating` 由 `not.toBe(5)` 強化為方向斷言（勝方 `>5`、敗方 `<5`）並加 history 筆數斷言、`trackConsoleIssues` 補到會種 roster 的 T4／T8（hydration mismatch 最可能發生的路徑）。
      - **上述補強的斷言中，除裁決 2 的 integration it（刪掉 `if (locked) return;` 會真的轉紅）外，其餘一律於實作完成後才寫、寫入當下即為綠燈，屬 regression guard 而非真紅燈。**
      - **leader 裁決記為已知缺口、本 change 不處理的三項**（詳見 design Open Questions 第 8 條）：`page.tsx` 未消費 `droppedCount`（留給 `matchmaker-history-page`）、「重設／再排」的 E2E 零覆蓋（由 hooks 層補測涵蓋）、`round.matches` 為空時畫面無說明文字（非 spec 違規、非死路）。

## 12. 收尾驗證

- [x] 12.1 逐條核對兩份 delta spec 的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**
      - 腳本抽出 **51 條**錨點（match-stage 43 + site-navbar 8），全數「檔案存在且 `it`／`test` 名稱逐字命中」。
- [x] 12.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 與 `--run components/matchmaker/` 全綠，貼出輸出
      - `lib/matchmaker/`：18 檔 / **172 passed**；`components/matchmaker/`：3 檔 / **28 passed**。
- [x] 12.3 `pnpm lint` 通過（0 errors；既有 warning 清單見前一個 change 的紀錄，本 change 不得新增）
      - **0 errors / 3 warnings**，三個 warning 全在 `hooks/useQuiz.ts`、`useRosterStore.ts`、`useScoreboardStore.ts`，皆為既有、本 change 未觸碰，與 baseline 完全相同。
- [x] 12.4 `pnpm typecheck` 通過
      - exit 0。
- [x] 12.5 `pnpm test` 全套通過（確認未破壞 M1～M4 既有測試與 hono-pickball 後端測試）
      - 前端 **54 檔 / 410 passed**（baseline 48 檔 / 364）、後端 **4 檔 / 16 passed**（未動）。
- [x] 12.6 `pnpm --filter ./nextjs-pickball test:e2e` 全套通過，**五個 browser project 皆跑**（`mobile-safari` 的預設 viewport 最矮，是最容易破的一個）
      - **`--workers=1`（memory 記載的零噪音設定）：244 passed / 0 failed / 21 skipped，五個 project 全跑。這是本項的通過依據。**
      - **預設併發（`workers=4`）下本機不穩定，且與本 change 無關**——三次全套實測的失敗集合**每次都不同、且會打到本 change 從未觸碰的 spec**：
        | 執行 | 設定 | 結果 | 失敗項 |
        |---|---|---|---|
        | 1 | 預設 | 1 failed / 243 passed | `player-roster` mobile-safari「重整後名單仍在」（ChunkLoadError） |
        | 2 | 預設 | 4 failed / 240 passed | `player-roster` webkit ×3（ChunkLoadError）＋ `match-stage` mobile-chrome ×1（`page.goto` 30s 逾時） |
        | 3 | `--workers=2` | 2 failed / 242 passed | **`scoreboard` chromium ×2（本 change 完全未觸碰該 spec）** |
        | 4 | `--workers=1` | **0 failed / 244 passed** | — |
      - 隔離重跑亦為機率性：`player-roster` mobile-safari 3 次中 2 次通過；`match-stage` mobile-chrome 3 次中 2 次通過（該次失敗為 `page.goto` 逾時，非斷言失敗）。
      - 根因與既有紀錄一致（`.claude/agent-memory/nextjs-expert/e2e-webserver-cold-start-chunkloaderror.md`）：Turbopack dev 的延遲 chunk 在高併發下被下一次導覽中斷；該 memory 已用 production build 對照證實 **dev-only、WebKit 系為主**，且明載 `--workers=1` 時零發生。
      - **但有一項與該 memory 不符、需要後續處理**：memory 寫「**從未看過關鍵首屏 bundle 本身載入失敗**」，本次失敗的卻是第一方 chunk `nextjs-pickball_app_layout_tsx_*`（經同一個 `react-server-dom-turbopack-client` 的 RSC client reference 路徑載入，機制相同、chunk 不同）。`player-roster.spec.ts` 的噪音濾除 `KNOWN_DEV_ONLY_NOISE = /ChunkLoadError.*(hmr-client|global-error)/` 只列舉了兩個 chunk 名，因此擋不住這一個。
        **本 change 刻意不改 `player-roster.spec.ts`**（該 capability 未列為 Modified，且失敗的是既有測試、既有 chunk）。**建議後續 change 把該 regex 放寬為涵蓋整個 `ChunkLoadError` 類別（維持只作用於 `pageerror`），並更新該 memory。** 留給人類決定。
- [x] 12.7 同步 `nextjs-pickball/CLAUDE.md` 的架構總覽：新增 `/matchmaker` 路由說明，並移除「對戰分配引擎已完成但尚未接 UI，等後續對戰畫面 milestone」這句已過期的敘述
      - 新增 `/matchmaker` 對戰頁條目、改寫 `/matchmaker/players` 條目（改註明「不在全站 navbar，由區段導覽抵達」）、新增兩頁共用 `app/matchmaker/layout.tsx` 區段導覽的說明；過期敘述已移除。Final Code Review 逐項對照實際程式碼確認三項宣稱皆屬實。
      - **順帶補上 Final Code Review 發現的既有漂移（S-1）**：CLAUDE.md 的 hooks 歸屬清單缺 `useRoundStore`（M4 遺留，`git show bbda8ff:nextjs-pickball/CLAUDE.md` 同樣缺）。`hooksInventory.test.ts` 比對的是 `openspec/specs/pickleball-guide-page/spec.md` 而非 CLAUDE.md，故綠燈掩蓋了這條漂移。已依主 spec 的歸屬名稱補為「round-lifecycle：`useRoundStore`」。
- [x] 12.8 `DO_NOT_TRACK=1 openspec validate matchmaker-match-stage-ui --strict` 通過
      - `Change 'matchmaker-match-stage-ui' is valid`，exit 0。
- [x] 12.9 spec 條目重複檢查（依 root `CLAUDE.md` 指定的 python 計數法，**不使用 BSD `uniq`**——它會把內容不同的中文標題誤判為重複）
      - `match-stage`：13 Requirement / 43 Scenario，無重複；`site-navbar`：2 Requirement / 8 Scenario，無重複。合計 15 Requirement / 51 Scenario，與 12.1 抽出的 51 條錨點一致。

## Final Code Review（execution-plan 的最後一關，全部 task 打勾後執行一次）

- [x] 跨群組一致性審查（opus）：**一項必改、四項建議**。
      - **必改（已修）**：§12 的 `nextjs-pickball/CLAUDE.md` 當時只存在於 working tree、未進任何 commit——若直接 archive／merge 會整段遺失。
      - **建議（已修三項）**：① CLAUDE.md 的 hooks 清單缺 `useRoundStore`（見 12.7）；② `CourtCard.tsx` 引用了一個**不存在的 design Decision**（「雙打的隊伍標籤位置需與色塊排列對應」是 leader 派工單的措辭，不是 design.md 的條目），已改為引用真實的 Decision 4 並寫出理由本體；`rating-bounds.ts` 的「design Open Questions」已補為「第 1 條」；③ `MatchStage.tsx` 的註解說 `ScoreEntry` 「不在本組可動檔案清單內」，但 §11 後續確實編輯了該檔（只加註解），已改寫為「刻意不改動其尺寸宣告」。
      - **建議（記錄不改）**：④ `PlayerTile.tsx` 與 `PlayerCard.tsx` 的 `{GENDER_LABEL[...]} · 強度 {rating.toFixed(2)}` 逐字相同——屬 §8 Stage 2 已裁決不合併的 `GENDER_LABEL` 重複的延伸，非新的第三份來源。
      - **機械確認通過的項目**：五個純函式模組 9/9 `export interface` 且欄位全標 `readonly`、唯一的 `export type` 是字面量聯集；八個元件 props callback 零個 `handleXxx`；`GENDER_LABEL` 恰好兩份無第三份；`linear-gradient` 新檔零新增；隊伍標籤／雙打組成／觸界標示／`HH:mm`／場地數邊界／`PLAYERS_PER_MATCH`／`TARGET_SCORE_OPTIONS` 各只有一處來源；`useRoundStore` 的唯一 import 點是 `app/matchmaker/page.tsx`、零元件 import `lib/matchmaker/round.ts`；`hooks/` 兩個 `M`、零 `A`；`openspec/specs/` 完全未被觸碰；**跨 25 個新／改檔的註解逐字重複掃描結果為「無」**；本 change 的檔案零 `§` 符號、零 `openspec/` 完整路徑；八個新測試檔慣例一致、零 jest-dom 匹配器；`package.json`／`pnpm-lock.yaml` 零改動。
      - Reviewer 對命名風格的獨立判斷：`buildCourtTiles`／`playerTileStyle` 等名詞式與 `createRoundSettings`／`changeCourtCount` 動詞式的混用**不構成不一致**——既有 46 個 lib 匯出函式的規則是「由輸入推導出一個值用名詞、建構或轉換用動詞」，本 change 五個模組全部落在既有規則內（`buildCourtTiles` 與既有 `buildSignatureIndex` 簽章形狀相同）。
