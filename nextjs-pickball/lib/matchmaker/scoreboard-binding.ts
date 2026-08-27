import { createInitialState } from "../scoreboard/reducer";
import { readMatchSlot, writeMatchSlot } from "../scoreboard/match-slots";
import type { ScoreboardState } from "../scoreboard/types";
import type { Round, RoundMatch } from "./round-types";

/**
 * 建立場地區塊「進入計分板」入口所需的 seed：帶入該輪的目標分數與對戰方式，
 * 分數與 history 一律自 0-0、空白起手（見 spec「場地區塊的計分板入口」）。
 */
export function buildMatchSlotSeed(
	round: Round,
	match: RoundMatch,
): ScoreboardState & { matchId: string } {
	return {
		...createInitialState({
			mode: round.format,
			targetScore: round.targetScore,
			matchId: match.id,
		}),
		matchId: match.id,
	};
}

/**
 * 確保該場次的計分板槽存在：已有條目時原樣回傳、SHALL NOT 覆蓋既有進度
 * （覆蓋會讓「未完成的計分進度可離開後再進入接續」靜默失效，見 spec 的 SHALL NOT 條款）。
 */
export function ensureMatchSlot(
	matchId: string,
	seed: ScoreboardState & { matchId: string },
): ScoreboardState & { matchId: string } {
	const existing = readMatchSlot(matchId);
	if (existing !== null) {
		return existing as ScoreboardState & { matchId: string };
	}

	writeMatchSlot(seed);
	return seed;
}

/** 該場的第一隊／第二隊分數（回合側的比分形狀） */
export interface RoundTeamScores {
	first: number;
	second: number;
}

/** 計分板側的比分形狀（`us` 為我方、`them` 為對方） */
export interface ScoreboardTeamScores {
	us: number;
	them: number;
}

/**
 * 隊伍對應的唯一實作：第一隊 ↔ `us`、第二隊 ↔ `them`。入口建立 seed 與回填
 * 都呼叫同一個函式的兩個方向，SHALL NOT 在兩處各自硬編碼一份——兩處若不一致，
 * 回填的比分會左右顛倒，而比分本身仍是合法數字，任何驗證都攔不下來（見 spec）。
 */
export function mapTeamScores(
	scores: RoundTeamScores,
	toward: "scoreboard",
): ScoreboardTeamScores;
export function mapTeamScores(
	scores: ScoreboardTeamScores,
	toward: "round",
): RoundTeamScores;
export function mapTeamScores(
	scores: RoundTeamScores | ScoreboardTeamScores,
	toward: "scoreboard" | "round",
): ScoreboardTeamScores | RoundTeamScores {
	if (toward === "scoreboard") {
		const { first, second } = scores as RoundTeamScores;
		return { us: first, them: second };
	}
	const { us, them } = scores as ScoreboardTeamScores;
	return { first: us, second: them };
}
