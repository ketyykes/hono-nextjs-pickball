import { LocalImportResponseSchema } from "@pickball/core/api/import";
import type { LocalImportRequest, LocalImportResponse } from "@pickball/core/api/import";
import type { Backup } from "@pickball/core/matchmaker/transfer-types";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { readRoster } from "../matchmaker/storage";
import { readHistory, readRound } from "../matchmaker/round-storage";
import { readScoreboard } from "../scoreboard/storage";
import { requestJson } from "./api-client";

// 路徑集中在這一處，元件不直接拼字串，避免各處路徑漂移。
const IMPORT_PATH = "/api/import";

// D1 單一參數上限為 2MB，留出餘量給 JSON 以外的包裝；超過時後端會整批回滾並回 500。
const SEGMENT_LIMIT_BYTES = 1_900_000;

export interface LocalImportSummary {
	players: number;
	round: boolean;
	slots: number;
	history: number;
	scoreboardCurrent: boolean;
	/** 因 matchId 重複而略過的歷史筆數（正常操作下為 0，是對損毀資料的防線）。 */
	duplicateHistorySkipped: number;
}

export interface LocalImportPreview {
	payload: LocalImportRequest;
	summary: LocalImportSummary;
	isEmpty: boolean;
	oversize: boolean;
}

export type LocalImportOutcome =
	| { kind: "imported"; imported: LocalImportResponse["imported"] }
	| { kind: "cloud-not-empty" }
	| { kind: "unauthorized" }
	| { kind: "failed" };

function dedupeHistory(entries: readonly MatchHistoryEntry[]): { history: MatchHistoryEntry[]; skipped: number } {
	const seen = new Set<string>();
	const history: MatchHistoryEntry[] = [];
	for (const entry of entries) {
		if (seen.has(entry.matchId)) continue;
		seen.add(entry.matchId);
		history.push(entry);
	}
	return { history, skipped: entries.length - history.length };
}

// 以位元組而非字元數判定：D1 的上限是位元組，中文姓名一個字元佔 3 位元組。
function utf8Bytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * 讀取本機五個 key 組成匯入請求。只經既有 reader、只讀不寫：reader 對損毀資料的降級規則只有一份，
 * 直接 JSON.parse 會讓損毀在後端才以 400 失敗，使用者無從得知是哪一筆。
 */
export function buildLocalImportPayload(): LocalImportPreview {
	const { players } = readRoster();
	const currentRound = readRound();
	const { history, skipped } = dedupeHistory(readHistory().entries);
	const current = readScoreboard(null);

	// 以回合的未完成場次為索引讀分槽，請求必然通過後端的不變式檢查（孤兒與已完成場次的分槽不讀）
	const matches: LocalImportRequest["scoreboard"]["matches"] = [];
	for (const match of currentRound?.matches ?? []) {
		if (match.status === "completed") continue;
		const slot = readScoreboard(match.id);
		if (slot === null) continue;
		// 分槽鍵以場次 id 為準，不信任分槽內自帶的 matchId
		matches.push({ ...slot, matchId: match.id });
	}

	const payload: LocalImportRequest = {
		version: 1,
		players,
		currentRound,
		history,
		scoreboard: { current, matches },
	};

	return {
		payload,
		summary: {
			players: players.length,
			round: currentRound !== null,
			slots: matches.length,
			history: history.length,
			scoreboardCurrent: current !== null,
			duplicateHistorySkipped: skipped,
		},
		// 有分槽必有回合，所以分槽不需要單獨列入判斷
		isEmpty: players.length === 0 && currentRound === null && history.length === 0 && current === null,
		oversize:
			utf8Bytes(players) > SEGMENT_LIMIT_BYTES ||
			utf8Bytes(history) > SEGMENT_LIMIT_BYTES ||
			utf8Bytes(matches) > SEGMENT_LIMIT_BYTES,
	};
}

/**
 * 送出匯入。不自動重試（匯入不是冪等的最新優先儲存，重送交給使用者決定），
 * 也不寫入或清除任何本機 key（使用者定案：匯入成功後保留本機資料）。
 */
export async function importLocalData(expectedUserId: string, payload: LocalImportRequest): Promise<LocalImportOutcome> {
	const result = await requestJson("POST", IMPORT_PATH, {
		body: payload,
		schema: LocalImportResponseSchema,
		expectedUserId,
	});
	if (result.kind === "ok") {
		if (result.value === undefined) return { kind: "failed" };
		return { kind: "imported", imported: result.value.imported };
	}
	if (result.kind === "conflict") return { kind: "cloud-not-empty" };
	if (result.kind === "unauthorized") return { kind: "unauthorized" };
	// rejected（其他 4xx）與 failed 對使用者沒有差別：都是「匯入失敗，請稍後再試」
	return { kind: "failed" };
}

/** JSON 備份沒有計分板資料，匯入時兩段皆為空。 */
export function backupToImportRequest(backup: Backup): LocalImportRequest {
	return {
		version: 1,
		players: backup.players,
		currentRound: backup.currentRound,
		history: backup.history,
		scoreboard: { current: null, matches: [] },
	};
}

/**
 * 本機是否有可匯入的資料。以組好的匯入內容判斷而非檢查 key 是否存在：
 * 元件掛載時 write effect 會寫出只含空陣列的容器，單看 key 會讓沒有資料的訪客也看到提示。
 */
export function hasImportableLocalData(): boolean {
	return !buildLocalImportPayload().isEmpty;
}
