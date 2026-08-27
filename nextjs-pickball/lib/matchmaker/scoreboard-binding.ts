import { createInitialState } from "../scoreboard/reducer";
import { readMatchSlot, writeMatchSlot } from "../scoreboard/match-slots";
import type { MatchSlots } from "../scoreboard/match-slots";
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
		}),
		// matchId 只在這裡決定一次：createInitialState 的 matchId 型別為 string | null，
		// 在此覆寫同時完成型別窄化，故不再重複傳進 overrides——兩處寫同一件事會分歧。
		matchId: match.id,
	};
}

/**
 * 確保該場次的計分板槽存在：已有條目時原樣回傳、SHALL NOT 覆蓋既有進度
 * （覆蓋會讓「未完成的計分進度可離開後再進入接續」靜默失效，見 spec 的 SHALL NOT 條款）。
 *
 * 只收 seed 一個參數、槽位由 seed.matchId 推導：另傳一個 matchId 參數會讓
 * matchId !== seed.matchId 成為可能的靜默失效（讀甲場的槽卻寫入乙場的 seed），
 * 與 match-slots.ts 對 writeMatchSlot 的收斂同一理由。
 */
export function ensureMatchSlot(
	seed: ScoreboardState & { matchId: string },
): ScoreboardState & { matchId: string } {
	const existing = readMatchSlot(seed.matchId);
	if (existing !== null) {
		// 重申 matchId 而非用型別斷言：ScoreboardState.matchId 型別為 string | null，
		// 斷言會讓「槽內容的 matchId 為 null 或屬於別場」的舊資料靜默通過；
		// 槽位既以 seed.matchId 為 key 讀出，這裡重寫回該值才是結構上的保證。
		return { ...existing, matchId: seed.matchId };
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

/** 待送出清單的單一項目：`matchId` 與轉換為回合側形狀（`first`／`second`）的兩隊比分。 */
export interface FinishedSubmission {
	readonly matchId: string;
	readonly scores: RoundTeamScores;
}

/**
 * 計算目前回合中「應回填」的待送出清單：純函式，輸入為目前回合與計分板槽集合，
 * 不觸碰 localStorage（spec「回填條件」）。
 */
export function collectFinishedSubmissions(round: Round, slots: MatchSlots): FinishedSubmission[] {
	const result: FinishedSubmission[] = [];
	for (const [matchId, slot] of Object.entries(slots)) {
		if (slot.status !== "finished") continue;

		// 冪等的第二道防線（design Decision 5）：清槽是主要機制，此條件是清槽失敗
		// （例如 LocalStorage 寫入被配額擋下）時的最後防線，避免評分被重複雙倍更新。
		const match = round.matches.find((m) => m.id === matchId);
		if (match !== undefined && match.status === "completed") continue;

		result.push({ matchId, scores: mapTeamScores(slot.scores, "round") });
	}
	return result;
}
