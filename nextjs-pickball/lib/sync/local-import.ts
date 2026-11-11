import { AppendImportResponseSchema, LocalImportResponseSchema, checkImportLimits } from "@pickball/core/api/import";
import type {
	AppendImportRequest,
	AppendImportResponse,
	LocalImportRequest,
	LocalImportResponse,
} from "@pickball/core/api/import";
import type { Player } from "@pickball/core/matchmaker/types";
import type { Backup } from "@pickball/core/matchmaker/transfer-types";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { readRoster } from "../matchmaker/storage";
import { readHistory, readRound } from "../matchmaker/round-storage";
import { readScoreboard } from "../scoreboard/storage";
import { requestJson } from "./api-client";
import { fetchRemotePlayers } from "./roster-api";

// 路徑集中在這一處，元件不直接拼字串，避免各處路徑漂移。
const IMPORT_PATH = "/api/import";
const APPEND_PATH = "/api/import/append";

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
	| { kind: "too-large" }
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

/**
 * 讀取本機五個 key 組成匯入請求。只經既有 reader：reader 對損毀資料的降級規則只有一份，
 * 直接 JSON.parse 會讓損毀在後端才以 400 失敗，使用者無從得知是哪一筆。
 * 本模組自身不寫入任何 key；reader 遇損毀資料時的既有清理（回寫或移除該 key）除外。
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
		// 與後端送出 D1 batch 前同一個判定：量的是 json_each 參數（含包裝），不是原始陣列
		oversize: !checkImportLimits(payload).ok,
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
	// 413 要讓使用者知道是資料量問題（重試無用）；其他 4xx 與 failed 對使用者沒有差別
	if (result.kind === "rejected" && result.status === 413) return { kind: "too-large" };
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

export type AppendImportOutcome =
	| { kind: "appended"; appended: AppendImportResponse["appended"] }
	| { kind: "unauthorized" }
	| { kind: "too-large" }
	| { kind: "failed" };

/** 附加只取參賽者與歷史；備份中的進行中回合不屬於附加，在這個唯一的轉換點丟棄。 */
export function backupToAppendRequest(backup: Backup): AppendImportRequest {
	return { players: backup.players, history: backup.history };
}

/**
 * 送出附加請求。不自動重試，也不寫入或清除任何本機 key。
 * 此端點不會回 409，因此 409 與其他非預期狀態一律視為失敗。
 */
export async function appendBackupToCloud(
	expectedUserId: string,
	request: AppendImportRequest,
): Promise<AppendImportOutcome> {
	const result = await requestJson("POST", APPEND_PATH, {
		body: request,
		schema: AppendImportResponseSchema,
		expectedUserId,
	});
	if (result.kind === "ok") {
		if (result.value === undefined) return { kind: "failed" };
		return { kind: "appended", appended: result.value.appended };
	}
	if (result.kind === "unauthorized") return { kind: "unauthorized" };
	if (result.kind === "rejected" && result.status === 413) return { kind: "too-large" };
	return { kind: "failed" };
}

export interface AppendPlayersPreview {
	/** 會新增到雲端的參賽者名稱（備份順序）。 */
	added: string[];
	/** 已在雲端、會被視為同一人而略過的參賽者名稱（備份中的名稱）。 */
	matched: string[];
}

/**
 * 預覽附加會新增與略過的參賽者。規則必須與後端 appendLocalBackup 一致，否則預覽會誤導使用者：
 * ① 先依名稱去重（同名只留備份中的第一位，名稱完全相同才算同名，不做任何正規化）；
 * ② 再對保留者判定：id 或名稱已在雲端者略過，其餘新增。
 * 順序不可顛倒：同名第一位若因 id 已在雲端而略過，第二位也不會被新增。
 */
export function previewAppendPlayers(
	backupPlayers: readonly Player[],
	cloudPlayers: readonly Player[],
): AppendPlayersPreview {
	const seenNames = new Set<string>();
	const uniquePlayers = backupPlayers.filter((player) => {
		if (seenNames.has(player.name)) return false;
		seenNames.add(player.name);
		return true;
	});

	const cloudIds = new Set(cloudPlayers.map((player) => player.id));
	const cloudNames = new Set(cloudPlayers.map((player) => player.name));
	const added: string[] = [];
	const matched: string[] = [];
	for (const player of uniquePlayers) {
		if (cloudIds.has(player.id) || cloudNames.has(player.name)) {
			matched.push(player.name);
		} else {
			added.push(player.name);
		}
	}
	return { added, matched };
}

export type AppendPreviewOutcome =
	| { kind: "ready"; preview: AppendPlayersPreview }
	| { kind: "unauthorized" }
	| { kind: "failed" };

/** 讀取雲端名單並算出附加預覽；只讀不寫，帳號由呼叫端給定。 */
export async function fetchAppendPreview(
	expectedUserId: string,
	request: AppendImportRequest,
): Promise<AppendPreviewOutcome> {
	const result = await fetchRemotePlayers(expectedUserId);
	if (result.kind === "unauthorized") return { kind: "unauthorized" };
	if (result.kind !== "ok" || result.value === undefined) return { kind: "failed" };
	const cloudPlayers = result.value.items.map((item) => item.data);
	return { kind: "ready", preview: previewAppendPlayers(request.players, cloudPlayers) };
}
