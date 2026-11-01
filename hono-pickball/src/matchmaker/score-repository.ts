import type { SubmitScoreResponse } from "@pickball/core/api/round";
import { submitScore, VALIDATE_SCORE_FAILURE_CODE } from "@pickball/core/matchmaker/round";
import type { Player } from "@pickball/core/matchmaker/types";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { matchmakerHistory, matchmakerMatchSlots, matchmakerPlayers, matchmakerRound } from "../db/schema";
import {
	insertBatchGuard,
	isBatchGuardViolation,
	isHistoryPrimaryKeyViolation,
	releaseBatchGuard,
} from "./batch-guard";
import { getRound } from "./round-repository";
import { raiseVersionFloor } from "./version-floor";

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

/**
 * 後端權威的送出比分：讀回合與名單 → 核心 submitScore → 單一 batch 寫入。
 * batch 的結構（其他多表寫入依此形態）：守衛 → 各項寫入 → 刪守衛。
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
		// playerPatches 的 id 必然來自 playerRows，find 不會落空；斷言只為滿足型別，不用額外的錯誤分支
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
		// 第一條：必須在任何寫入之前，否則會讀到自己剛寫入的新 version 而失效
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
		// 版本條件已由守衛保證；這裡仍帶 version 只是縱深防禦（0 列 UPDATE 不會回滾）
		db
			.update(matchmakerRound)
			.set({ data: result.round, version: round.version + 1, updatedAt: now })
			.where(and(eq(matchmakerRound.userId, userId), eq(matchmakerRound.version, round.version))),
		// 只更新這場的參賽者；同樣帶 user_id 與 version 條件
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
		// 下限必須在刪除之前，且選取條件與下一條刪除相同；否則日後以同場次 id 重建的分槽會落回舊版本
		raiseVersionFloor(
			db,
			userId,
			sql`SELECT version AS v FROM matchmaker_match_slots WHERE user_id = ${userId} AND match_id = ${input.matchId}`,
			now,
		),
		// 場次完成後計分板分槽不再有意義，與其他寫入同批刪除以維持「分槽只存在於未完成場次」
		db
			.delete(matchmakerMatchSlots)
			.where(and(eq(matchmakerMatchSlots.userId, userId), eq(matchmakerMatchSlots.matchId, input.matchId))),
		// 最後一條：使守衛表在 batch 結束後恆為空
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
			// 核心回傳 readonly，複製一份才能指派給回應型別
			boundaryHits: result.boundaryHits.map((hit) => ({ ...hit })),
		},
	};
}
