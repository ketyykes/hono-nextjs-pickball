import { createInitialState } from "../scoreboard/reducer";
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
