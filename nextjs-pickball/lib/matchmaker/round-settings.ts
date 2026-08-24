// 本輪設定的預設值與場地數夾值——純函式，元件內以 useState 管理狀態，
// 刻意不做 useRoundSettings hook（design Decision 3）。

import type { MatchFormat } from "./allocation-types";
import {
	DEFAULT_FORMAT,
	DEFAULT_COURT_COUNT,
	MIN_COURT_COUNT,
	MAX_COURT_COUNT,
} from "./allocation-types";
import type { RoundTargetScore } from "./round-types";
import { DEFAULT_TARGET_SCORE } from "./round-types";

/** 本輪設定：對戰方式、場地數、目標分數。 */
export interface RoundSettings {
	readonly format: MatchFormat;
	readonly courtCount: number;
	readonly targetScore: RoundTargetScore;
}

/** 場地數是否已達加減的上下限，供 RoundControls 的加減按鈕接到 disabled 屬性。 */
export interface CourtCountBounds {
	readonly canIncrement: boolean;
	readonly canDecrement: boolean;
}

/**
 * 場地數加減後的結果：夾值後的設定，附帶是否已達上下限。
 * settings 獨立成一個鍵，而非把 RoundSettings 的欄位攤平進本介面——攤平會讓本型別
 * 結構上相容 RoundSettings，`setSettings(changeCourtCount(settings, 1))` 在
 * useState<RoundSettings>（design Decision 3 指定的狀態形式）下會被型別放行，
 * 兩個衍生旗標就這樣混進 state，並在後續 `{ ...settings, format: "doubles" }`
 * 之類的更新中繼續帶著過期旗標傳播。
 */
export interface CourtCountChangeResult extends CourtCountBounds {
	readonly settings: RoundSettings;
}

/** 建立一組全新的本輪設定，三個欄位皆取自 match-allocation／round-types 匯出的常數。 */
export function createRoundSettings(): RoundSettings {
	return {
		format: DEFAULT_FORMAT,
		courtCount: DEFAULT_COURT_COUNT,
		targetScore: DEFAULT_TARGET_SCORE,
	};
}

/**
 * 給定場地數，判定加減按鈕是否已達邊界。獨立匯出而非只讓 changeCourtCount 回報：
 * RoundControls 在初次渲染（使用者還沒按過加減）就需要知道要不要 disabled，若只能靠
 * changeCourtCount 的回傳值，元件要嘛得呼叫 changeCourtCount(settings, 0) 這種怪寫法，
 * 要嘛自行重寫一次邊界判斷——後者會讓邊界判定出現第二處，違反 spec「SHALL NOT 在 UI
 * 層另行寫死」。抽出後 changeCourtCount 內部也呼叫本函式，邊界判定仍只有一處。
 */
export function courtCountBounds(courtCount: number): CourtCountBounds {
	return {
		canIncrement: courtCount < MAX_COURT_COUNT,
		canDecrement: courtCount > MIN_COURT_COUNT,
	};
}

/**
 * 場地數加減，超界時夾值而非拋錯——分配引擎對超界 courtCount 是拋錯，UI 若讓超界值
 * 有機會傳入等於把程式錯誤丟給使用者，這層是**範圍**夾值的唯一防線（不含整數性；
 * spec 未要求非整數 delta 的防線，故未夾）。
 */
export function changeCourtCount(
	settings: RoundSettings,
	delta: number,
): CourtCountChangeResult {
	const courtCount = Math.min(
		MAX_COURT_COUNT,
		Math.max(MIN_COURT_COUNT, settings.courtCount + delta),
	);
	return {
		settings: { ...settings, courtCount },
		...courtCountBounds(courtCount),
	};
}
