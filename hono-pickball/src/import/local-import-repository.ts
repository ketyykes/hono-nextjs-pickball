import {
	type AppendImportRequest,
	type AppendImportResponse,
	checkAppendLimits,
	checkImportLimits,
	type LocalImportRequest,
	type LocalImportResponse,
} from "@pickball/core/api/import";
import { type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { matchmakerHistory, matchmakerMatchSlots, matchmakerPlayers, matchmakerRound, scoreboardCurrent } from "../db/schema";
import { insertBatchGuard, isBatchGuardViolation, releaseBatchGuard } from "../matchmaker/batch-guard";
import { initialVersion } from "../matchmaker/version-floor";

/**
 * conflict 對應 409：雲端的四張對戰分配機表任一已有本人的資料。
 * too-large 對應 413：參賽者筆數或任一段 JSON 參數超過上限，尚未碰 D1。
 */
export type ImportOutcome =
	| { kind: "ok"; value: LocalImportResponse["imported"] }
	| { kind: "conflict" }
	| { kind: "too-large" };

/**
 * 把 JSON 陣列在資料庫內展開成待插入的列：user_id、依序抽出的欄位、version、updated_at。
 * ORDER BY key（陣列索引）集中在這裡，各段不可能漏掉而讓 rowid 失去追加順序；
 * WHERE true 是 drizzle 的 insert().select() 搭配 ON CONFLICT 子句時避免解析歧義的必要寫法。
 * fields 只接受程式碼內的常數路徑，不可傳入使用者輸入。
 */
function selectFromJsonEach(userId: string, fields: readonly string[], json: string, updatedAt: number, version: SQL): SQL {
	const extracted = fields.map((field) => sql.raw(`json_extract(value, '$.${field}')`));
	return sql`SELECT ${userId}, ${sql.join(extracted, sql`, `)}, ${version}, ${updatedAt} FROM json_each(${json}) WHERE true ORDER BY key`;
}

/**
 * 把本機資料一次寫入空的雲端。整個 batch 固定 7 條陳述式，不隨筆數增加：
 * D1 每條陳述式最多 100 個參數，逐筆 values 展開在數十筆時就會失敗，所以每段陣列整個當成單一 JSON 參數，
 * 由 json_each 在資料庫內展開。回合與獨立計分板最多一列，也走同樣寫法（0 或 1 個元素），使陳述式數量與資料有無無關。
 * 順序一律 ORDER BY key（陣列索引）：rowid 因此依本機的追加順序遞增，歷史同時間的排序才與本機一致。
 * 刻意不用 db.run／db.all：drizzle 0.45.2 的 batch 內帶參數的 raw 陳述式會失敗。
 */
export async function importLocalData(db: Db, userId: string, input: LocalImportRequest): Promise<ImportOutcome> {
	// 先判定上限再碰 D1：超過 D1 單一字串上限的參數會讓 batch 失敗，且送出的 JSON 形狀必須與判定時量測的同一份
	const limits = checkImportLimits(input);
	if (!limits.ok) {
		return { kind: "too-large" };
	}
	const { players: playersJson, round: roundJson, slots: slotsJson, history: historyJson, current: currentJson } =
		limits.segments;

	const now = new Date();
	const updatedAt = now.getTime();

	// 條件在 SQL 內對資料庫目前內容判定：先讀後寫之間的競態（兩台裝置同時匯入）正是守衛要消除的。
	// 獨立計分板不在條件內：登入後用過一次計分板的使用者雲端就有一列，納入會讓名單永遠無法匯入。
	const guardCondition = sql`NOT EXISTS (SELECT 1 FROM matchmaker_players WHERE user_id = ${userId})
		AND NOT EXISTS (SELECT 1 FROM matchmaker_round WHERE user_id = ${userId})
		AND NOT EXISTS (SELECT 1 FROM matchmaker_match_slots WHERE user_id = ${userId})
		AND NOT EXISTS (SELECT 1 FROM matchmaker_history WHERE user_id = ${userId})`;

	try {
		const results = await db.batch([
			// 第一條：必須在任何寫入之前，否則會看到自己剛寫入的列而永遠失敗
			insertBatchGuard(db, userId, guardCondition, now),
			db
				.insert(matchmakerPlayers)
				.select(selectFromJsonEach(userId, ["id", "data", "sortOrder"], playersJson, updatedAt, initialVersion(userId))),
			db.insert(matchmakerRound).select(selectFromJsonEach(userId, ["data"], roundJson, updatedAt, initialVersion(userId))),
			db
				.insert(matchmakerMatchSlots)
				.select(selectFromJsonEach(userId, ["matchId", "data"], slotsJson, updatedAt, initialVersion(userId))),
			db
				.insert(matchmakerHistory)
				.select(selectFromJsonEach(userId, ["matchId", "playedAt", "data"], historyJson, updatedAt, sql`1`)),
			// 雲端已有獨立計分板時略過、不覆寫；RETURNING 有無列即「寫入」或「略過」
			db
				.insert(scoreboardCurrent)
				.select(selectFromJsonEach(userId, ["data"], currentJson, updatedAt, sql`1`))
				.onConflictDoNothing()
				.returning({ userId: scoreboardCurrent.userId }),
			// 最後一條：使守衛表在 batch 結束後恆為空
			releaseBatchGuard(db, userId),
		]);

		// batch 的第 6 條（索引 5）是獨立計分板的 INSERT ... RETURNING；調整陳述式順序時必須同步這個索引
		const scoreboardRows = results[5];
		let scoreboardResult: LocalImportResponse["imported"]["scoreboardCurrent"] = "none";
		if (input.scoreboard.current !== null) {
			scoreboardResult = scoreboardRows.length > 0 ? "imported" : "skipped";
		}
		return {
			kind: "ok",
			value: {
				players: input.players.length,
				round: input.currentRound !== null,
				slots: input.scoreboard.matches.length,
				history: input.history.length,
				scoreboardCurrent: scoreboardResult,
			},
		};
	} catch (error) {
		if (isBatchGuardViolation(error)) {
			return { kind: "conflict" };
		}
		throw error;
	}
}

/**
 * too-large 對應 413：參賽者筆數或任一段 JSON 參數超過上限，尚未碰 D1。
 * 附加沒有 409：逐列略過即為預期語意。
 */
export type AppendOutcome = { kind: "ok"; value: AppendImportResponse["appended"] } | { kind: "too-large" };

/**
 * 把備份中的參賽者與歷史附加到雲端：只新增雲端沒有的，不覆寫任何既有的列。
 * 固定兩條陳述式、同一個 batch，不使用整批守衛（逐列略過就是預期語意，略過條件都在各自的 SQL 內判定）：
 * - 第一條（參賽者）看不到同批資料自己插入的列，所以備份內的同名去重已由核心 serializeAppendSegments 完成。
 * - 第二條（歷史）在 batch 內依序執行，看得到第一條插入之後的名單，
 *   因此歷史的球員 id 改寫與參賽者的略過判定看到的是同一份名單。
 * 送進 json_each 的三個字串就是 checkAppendLimits 量測過的 segments，不另組 JSON。
 * 新增筆數取自 RETURNING 的列數：ON CONFLICT DO NOTHING 下 meta.changes 的語意沒有文件保證。
 */
export async function appendLocalBackup(db: Db, userId: string, input: AppendImportRequest): Promise<AppendOutcome> {
	const limits = checkAppendLimits(input);
	if (!limits.ok) {
		return { kind: "too-large" };
	}
	const { players: playersJson, playerNames: playerNamesJson, history: historyJson } = limits.segments;
	const updatedAt = Date.now();

	// 新增者的 sort_order 接在附加前的最大值之後；row_number 在 WHERE 過濾之後才計算，所以序號連續
	// 略過條件：本人雲端已有同名者，或 id 已存在（同一筆資料，即使名稱不同）
	const playersSelect = sql`SELECT ${userId}, json_extract(j.value, '$.id'), json_extract(j.value, '$.data'),
		(SELECT coalesce(max(m.sort_order), -1) FROM matchmaker_players m WHERE m.user_id = ${userId}) + row_number() OVER (ORDER BY j.key),
		${initialVersion(userId)}, ${updatedAt}
		FROM json_each(${playersJson}) AS j
		WHERE NOT EXISTS (
			SELECT 1 FROM matchmaker_players m
			WHERE m.user_id = ${userId} AND json_extract(m.data, '$.name') = json_extract(j.value, '$.data.name')
		)
		AND NOT EXISTS (
			SELECT 1 FROM matchmaker_players m
			WHERE m.user_id = ${userId} AND m.id = json_extract(j.value, '$.data.id')
		)
		ORDER BY j.key`;

	// id 對應表：備份名單中「id 不在本人雲端名單」的每位參賽者，對應到雲端同名且 sort_order 最小（同值依 rowid）者。
	// 這張表在第二條陳述式執行時才計算，所以已包含第一條新增的參賽者；找不到同名者時 dst 為 NULL，歷史維持原 id。
	// 用 MATERIALIZED 讓它只算一次，而不是在每位歷史球員的子查詢內重複掃描名單。
	const idMap = sql`WITH id_map AS MATERIALIZED (
			SELECT json_extract(n.value, '$.id') AS src,
				(SELECT m.id FROM matchmaker_players m
					WHERE m.user_id = ${userId} AND json_extract(m.data, '$.name') = json_extract(n.value, '$.name')
					ORDER BY m.sort_order, m.rowid LIMIT 1) AS dst
			FROM json_each(${playerNamesJson}) AS n
			WHERE NOT EXISTS (
				SELECT 1 FROM matchmaker_players m
				WHERE m.user_id = ${userId} AND m.id = json_extract(n.value, '$.id')
			)
		)`;
	const rewriteTeam = (team: "teamA" | "teamB") => sql.raw(`json((
			SELECT json_group_array(json_set(t.value, '$.id', coalesce((SELECT dst FROM id_map WHERE src = t.value ->> '$.id'), t.value ->> '$.id')))
			FROM (SELECT value FROM json_each(h.value, '$.data.${team}.players') ORDER BY key) AS t
		))`);
	// 只改寫球員 id；姓名、分數與陣列順序原樣保留
	const historySelect = sql`${idMap}
		SELECT ${userId}, json_extract(h.value, '$.matchId'), json_extract(h.value, '$.playedAt'),
			json_set(json_extract(h.value, '$.data'), '$.teamA.players', ${rewriteTeam("teamA")}, '$.teamB.players', ${rewriteTeam("teamB")}),
			1, ${updatedAt}
		FROM json_each(${historyJson}) AS h
		WHERE true
		ORDER BY h.key`;

	const [playerRows, historyRows] = await db.batch([
		db
			.insert(matchmakerPlayers)
			.select(playersSelect)
			.onConflictDoNothing()
			.returning({ id: matchmakerPlayers.id }),
		db
			.insert(matchmakerHistory)
			.select(historySelect)
			.onConflictDoNothing()
			.returning({ matchId: matchmakerHistory.matchId }),
	]);

	const playersAdded = playerRows.length;
	const historyAdded = historyRows.length;
	return {
		kind: "ok",
		value: {
			players: { added: playersAdded, skipped: input.players.length - playersAdded },
			history: { added: historyAdded, skipped: input.history.length - historyAdded },
		},
	};
}
