// 分配引擎唯一對外入口。只做串接：selectPlaying → pairSingles／pairDoubles → avoidRepeats →
// 指派 1 起算的連續場地編號。四個子模組（candidates／pairing／duplication／本檔自身）的職責
// 不得外洩到本檔——本檔不重新實作排序、配對或重複迴避（design Decision 1、tasks 8.5）。

import { selectPlaying } from "./candidates";
import { avoidRepeats } from "./duplication";
import { labelDoublesComposition, pairDoubles, pairSingles } from "./pairing";
import { MAX_COURT_COUNT, MIN_COURT_COUNT } from "./allocation-types";
import type { AllocationInput, Match, RoundAllocation } from "./allocation-types";

/**
 * 邊界判斷集中於此，子模組不各自重複檢查（tasks 10.4）：`candidates.ts`／`pairing.ts`／
 * `duplication.ts` 對人數不足或空名單皆已自然回傳空結果（`countPlaying` 向下取整為 0、
 * `pairSingles`／`pairDoubles` 的迴圈條件 `i + perMatch <= length` 在長度不足時不執行），
 * 唯一缺口是場地數範圍——三個子模組都不知道「1～8」這個規則，只能在入口統一檢查
 * （design Decision 7）。
 */
function assertValidCourtCount(courtCount: number): void {
	if (courtCount < MIN_COURT_COUNT || courtCount > MAX_COURT_COUNT) {
		throw new Error(`場地數需介於 ${MIN_COURT_COUNT} 到 ${MAX_COURT_COUNT} 之間，請調整後再試一次（目前輸入：${courtCount}）。`);
	}
}

/**
 * 產生本輪分配結果：依序完成「出場名單決策 → 配對 → 重複迴避 → 場地編號指派」，
 * 對應 prd.md 5.1 的嚴格優先序（模式結構性約束 ＞ 累計休息次數 ＞ 強度接近 ＞ 重複配對迴避）。
 * 純函式、決定性——不修改 input.players 中的任何 Player 物件（design Decision 1、3、6、8）。
 *
 * tasks 9.5 refactor 記錄：後順位項目在結構上**不可能**推翻前順位，理由逐項如下——
 * - 強度配對（pairing.ts）無法推翻累計休息次數：`pairSingles`／`pairDoubles` 的參數型別是
 *   `readonly Player[]`（已決定的出場者），函式本身拿不到 `resting`，即使想把休息者換上場
 *   也沒有該陣列可讀取。
 * - 重複配對迴避（duplication.ts）無法推翻強度配對或出場名單：`avoidRepeats` 的參數與回傳都是
 *   `Match[]`，內部的 `swapPlayers`／`rebuildMatch` 只能在既有 `matches` 的位置間搬動球員
 *   （見該檔 `Slot` 型別），既無管道新增球員（無法引用 `resting`），也無法移除球員
 *   （`rebuildMatch` 永遠原地替換，不改變隊伍人數）；且採納條件為
 *   `repeats < current.repeats && spread <= current.spread`，強度劣化的交換一律被拒絕。
 * - `allocateRound` 本身在 avoidRepeats 之後只做「指派場地編號」，不做任何名單或配對的事後
 *   修補（tasks 9.2 的要求）。
 * 因此優先序是函式簽章與呼叫順序上的必然，不是靠慣例或註解維持。
 */
export function allocateRound(input: AllocationInput): RoundAllocation {
	const { players, format, courtCount, seenSignatures } = input;

	// 步驟 0：邊界檢查。場地數超出 1～8 時 MUST 拒絕輸入而非靜默夾值（design Decision 7、
	// tasks 10.3）——UI 層加減按鈕本該在邊界 disable，此處防的是程式錯誤與 LocalStorage
	// 回讀損壞設定的情況。人數不足與空名單 SHALL NOT 拋錯，故不在此檢查，留給步驟 1～4
	// 的既有邏輯自然回傳空結果（tasks 10.2）。
	assertValidCourtCount(courtCount);

	// 步驟 1：出場／休息名單決策。此步驟決定的名單即為最終結果，後續步驟 SHALL NOT 更動成員
	// （candidates.ts 的型別與邏輯已保證：pairing.ts 只接受「已決定的出場人員陣列」，
	// duplication.ts 只能重排既有球員，兩者在型別上都拿不到休息名單）。
	const { playing, resting } = selectPlaying(players, format, courtCount);

	// 步驟 2：依對戰方式配對，courtNumber 僅為初值（見 pairing.ts 註解，由步驟 4 覆寫）。
	const paired = format === "singles" ? pairSingles(playing) : pairDoubles(playing);

	// 步驟 3：受限交換以迴避重複，只重排既有球員在場地／隊伍間的位置（design Decision 6）。
	const avoided = avoidRepeats(paired, seenSignatures);

	// 步驟 3.5：重算雙打組成標示。duplication.ts 的 rebuildMatch 刻意不重算此標示
	// （該檔註解明寫屬本檔整合責任）——avoidRepeats 換人後，換入者的性別可能與原標示不符，
	// 標示雖不參與任何選人或配對決策，仍是使用者看得到的資料（PRD 13.3）。
	const relabeled = avoided.map(relabelDoublesComposition);

	// 步驟 4：指派 1 起算的連續場地編號，覆寫配對階段的初值。
	const matches: Match[] = relabeled.map((match, index) => ({
		...match,
		courtNumber: index + 1,
	}));

	return { matches, resting };
}

// 依當下兩隊實際成員重新判定雙打組成標示；單打場次原樣返回（無此標示可重算）。
function relabelDoublesComposition(match: Match): Match {
	if (match.format !== "doubles") {
		return match;
	}

	const [teamA, teamB] = match.teams;
	const [first, second] = teamA.players;
	const [third, fourth] = teamB.players;

	return { ...match, doublesComposition: labelDoublesComposition([first, second, third, fourth]) };
}
