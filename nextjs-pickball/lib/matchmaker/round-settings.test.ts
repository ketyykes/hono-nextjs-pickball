import { describe, it, expect } from "vitest";
import {
	DEFAULT_FORMAT,
	DEFAULT_COURT_COUNT,
	MIN_COURT_COUNT,
	MAX_COURT_COUNT,
} from "./allocation-types";
import { DEFAULT_TARGET_SCORE } from "./round-types";
import {
	createRoundSettings,
	changeCourtCount,
	courtCountBounds,
} from "./round-settings";

// 本輪設定的預設值與場地數夾值——純函式，元件層（RoundControls 的加減按鈕）以 useState
// 消費而非 hook，見 design Decision 3。
describe("createRoundSettings", () => {
	it("預設為單打與 1 個場地且取用分配引擎匯出的常數", () => {
		// 直接比對 import 進來的常數而非字面量，避免本檔與 round-settings.ts
		// 各自寫死 "singles"／1 卻同時通過測試。
		expect(createRoundSettings()).toEqual({
			format: DEFAULT_FORMAT,
			courtCount: DEFAULT_COURT_COUNT,
			targetScore: DEFAULT_TARGET_SCORE,
		});
	});
});

describe("changeCourtCount", () => {
	it("場地數加減夾在 1～8 並回報是否已達邊界", () => {
		const atMax = changeCourtCount(
			{ ...createRoundSettings(), courtCount: MAX_COURT_COUNT },
			1,
		);
		expect(atMax.settings.courtCount).toBe(MAX_COURT_COUNT);
		expect(atMax.canIncrement).toBe(false);
		// 上限時仍可再減，避免 canDecrement 被誤寫死為 false。
		expect(atMax.canDecrement).toBe(true);

		const atMin = changeCourtCount(
			{ ...createRoundSettings(), courtCount: MIN_COURT_COUNT },
			-1,
		);
		expect(atMin.settings.courtCount).toBe(MIN_COURT_COUNT);
		expect(atMin.canDecrement).toBe(false);
		// 下限時仍可再加，避免 canIncrement 被誤寫死為 false或邊界判定寫反。
		expect(atMin.canIncrement).toBe(true);

		const incremented = changeCourtCount(
			{ ...createRoundSettings(), courtCount: 4 },
			1,
		);
		expect(incremented.settings.courtCount).toBe(5);

		const decremented = changeCourtCount(
			{ ...createRoundSettings(), courtCount: 4 },
			-1,
		);
		expect(decremented.settings.courtCount).toBe(3);
	});

	// 變動前後的場地數不同（7→8、2→1）：既有案例都是「加減前後同值」（8→8、1→1），
	// 這種測資看不出「用變動前的值判定邊界」這種錯誤，這裡補上真的會變動的案例。
	it("場地數從邊界前一格加減至邊界時，回報的是變動後的邊界", () => {
		const toMax = changeCourtCount(
			{ ...createRoundSettings(), courtCount: MAX_COURT_COUNT - 1 },
			1,
		);
		expect(toMax.settings.courtCount).toBe(MAX_COURT_COUNT);
		expect(toMax.canIncrement).toBe(false);
		expect(toMax.canDecrement).toBe(true);
		// settings 的其餘欄位須原樣帶出，而非被夾值後的物件蓋掉。
		expect(toMax.settings.format).toBe(DEFAULT_FORMAT);
		expect(toMax.settings.targetScore).toBe(DEFAULT_TARGET_SCORE);

		const toMin = changeCourtCount(
			{ ...createRoundSettings(), courtCount: MIN_COURT_COUNT + 1 },
			-1,
		);
		expect(toMin.settings.courtCount).toBe(MIN_COURT_COUNT);
		expect(toMin.canDecrement).toBe(false);
		expect(toMin.canIncrement).toBe(true);
	});
});

// courtCountBounds 是 Stage 2 審查後才抽出的具名函式（讓 RoundControls 初次渲染時
// 不必呼叫 changeCourtCount(settings, 0) 這種怪寫法就能算出 disabled 狀態）。
// 行為在抽出當下已經確定，這裡的測試是 regression guard，寫入當下即為綠燈。
describe("courtCountBounds", () => {
	it("合法範圍內兩個方向皆可操作，觸及上下限時各自回報不可再加或不可再減", () => {
		expect(courtCountBounds(4)).toEqual({
			canIncrement: true,
			canDecrement: true,
		});
		expect(courtCountBounds(MAX_COURT_COUNT)).toEqual({
			canIncrement: false,
			canDecrement: true,
		});
		expect(courtCountBounds(MIN_COURT_COUNT)).toEqual({
			canIncrement: true,
			canDecrement: false,
		});
	});
});
