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
