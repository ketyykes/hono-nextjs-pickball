import type { SubmitScoreResponse } from "@pickball/core/api/round";
import { submitScore, VALIDATE_SCORE_FAILURE_CODE } from "@pickball/core/matchmaker/round";
import type { Player } from "@pickball/core/matchmaker/types";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { matchmakerHistory, matchmakerMatchSlots, matchmakerPlayers, matchmakerRound } from "../db/schema";
import { insertBatchGuard, isBatchGuardViolation, releaseBatchGuard } from "./batch-guard";
import { getRound } from "./round-repository";

export interface SubmitScoreForUserInput {
	matchId: string;
	scoreA: string;
	scoreB: string;
	roundVersion: number;
}

/** invalid 對應 400（比分格式錯誤），conflict 對應 409（版本、場次狀態或歷史主鍵衝突）。 */
export type SubmitScoreOutcome =
	| { kind: "ok"; value: SubmitScoreResponse }
	| { kind: "invalid" }
	| { kind: "conflict" };

/** 只供測試：afterRead 在「讀取並計算完成、batch 送出前」執行，用來模擬另一個請求插隊。 */
export interface SubmitScoreOptions {
	afterRead?: () => Promise<void>;
}

// 比分字串的格式錯誤回 400；其餘失敗（場次不存在、已完成、評分失敗）是資料狀態不符，回 409。
const INVALID_BODY_CODES: readonly string[] = [
	VALIDATE_SCORE_FAILURE_CODE.EMPTY_FIELD,
	VALIDATE_SCORE_FAILURE_CODE.INVALID_NUMBER,
	VALIDATE_SCORE_FAILURE_CODE.NEGATIVE_SCORE,
	VALIDATE_SCORE_FAILURE_CODE.TIE,
];

/** 只認 matchmaker_history 的主鍵衝突，避免把其他表的唯一性錯誤（如殘留守衛列）吞成 409。 */
function isHistoryPrimaryKeyViolation(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		if (current.message.includes("UNIQUE constraint failed: matchmaker_history.")) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

/**
 * 後端權威的送出比分：讀回合與名單 → 核心 submitScore → 單一 batch 寫入。
 * batch 的結構（B9 可照抄）：守衛 → 各項寫入 → 刪守衛。
 * 影響 0 列的 UPDATE 不會回滾，所以版本條件全部放進守衛，由守衛在資料庫內對目前內容比較。
 */
export async function submitScoreForUser(
	db: Db,
	userId: string,
	input: SubmitScoreForUserInput,
	options: SubmitScoreOptions = {},
): Promise<SubmitScoreOutcome> {
	const round = await getRound(db, userId);
	if (!round || round.version !== input.roundVersion) {
		return { kind: "conflict" };
	}
	const playerRows = await db
		.select()
		.from(matchmakerPlayers)
		.where(eq(matchmakerPlayers.userId, userId))
		.orderBy(asc(matchmakerPlayers.sortOrder), sql`rowid`);

	// 完成時間一律取伺服器時間，不接受請求帶入
	const now = new Date();
	const result = submitScore({
		round: round.data,
		players: playerRows.map((row) => row.data),
		matchId: input.matchId,
		rawScoreA: input.scoreA,
		rawScoreB: input.scoreB,
		now: now.toISOString(),
	});
	if (!result.ok) {
		return INVALID_BODY_CODES.includes(result.code) ? { kind: "invalid" } : { kind: "conflict" };
	}

	await options.afterRead?.();

	const updatedPlayers = result.playerPatches.map((patch) => {
		const row = playerRows.find((candidate) => candidate.id === patch.id) as (typeof playerRows)[number];
		const data: Player = { ...row.data, rating: patch.rating, gamesPlayed: patch.gamesPlayed };
		return { id: patch.id, data, readVersion: row.version };
	});

	// 守衛條件在 SQL 內比對資料庫目前的內容：回合版本，以及每位被更新球員的版本
	const playerConditions: SQL[] = updatedPlayers.map(
		(player) => sql`(id = ${player.id} AND version = ${player.readVersion})`,
	);
	const guardCondition = sql`(SELECT version FROM matchmaker_round WHERE user_id = ${userId}) = ${round.version}
		AND (SELECT COUNT(*) FROM matchmaker_players WHERE user_id = ${userId} AND (${sql.join(playerConditions, sql` OR `)})) = ${updatedPlayers.length}`;

	const statements = [
		insertBatchGuard(db, userId, guardCondition, now),
		// 不加 onConflictDoNothing：主鍵衝突必須拋出，使整批回滾
		db.insert(matchmakerHistory).values({
			userId,
			matchId: input.matchId,
			playedAt: new Date(result.historyEntry.playedAt),
			data: result.historyEntry,
			version: 1,
			updatedAt: now,
		}),
		db
			.update(matchmakerRound)
			.set({ data: result.round, version: round.version + 1, updatedAt: now })
			.where(and(eq(matchmakerRound.userId, userId), eq(matchmakerRound.version, round.version))),
		...updatedPlayers.map((player) =>
			db
				.update(matchmakerPlayers)
				.set({ data: player.data, version: player.readVersion + 1, updatedAt: now })
				.where(
					and(
						eq(matchmakerPlayers.userId, userId),
						eq(matchmakerPlayers.id, player.id),
						eq(matchmakerPlayers.version, player.readVersion),
					),
				),
		),
		db
			.delete(matchmakerMatchSlots)
			.where(and(eq(matchmakerMatchSlots.userId, userId), eq(matchmakerMatchSlots.matchId, input.matchId))),
		releaseBatchGuard(db, userId),
	];

	try {
		await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
	} catch (error) {
		if (isBatchGuardViolation(error) || isHistoryPrimaryKeyViolation(error)) {
			return { kind: "conflict" };
		}
		throw error;
	}

	return {
		kind: "ok",
		value: {
			round: { data: result.round, version: round.version + 1 },
			players: updatedPlayers.map((player) => ({ data: player.data, version: player.readVersion + 1 })),
			historyEntry: result.historyEntry,
			boundaryHits: result.boundaryHits.map((hit) => ({ ...hit })),
		},
	};
}
