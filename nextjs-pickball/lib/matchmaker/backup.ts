// 匯出功能的組裝層：buildBackup()／backupFileName()（design Decision 1）。

import type { Player } from "./types";
import type { Round } from "./round-types";
import type { MatchHistoryEntry } from "./history";
import type { Backup } from "./transfer-types";

/**
 * 重複配對簽章的鍵集合：可能是記憶體表示法 ReadonlySet<string>（allocation-types.ts
 * 的 SignatureIndex），也可能是已持久化的表示法 readonly string[]（round-types.ts 的
 * SeenSignaturesSchema）。buildBackup 兩者都要吃，一律輸出排序後的字串陣列。
 */
type SignatureKeys = ReadonlySet<string> | readonly string[];

interface BackupSnapshotSeenSignatures {
	readonly teammateKeys: SignatureKeys;
	readonly opponentKeys: SignatureKeys;
	readonly fullMatchKeys: SignatureKeys;
}

/**
 * buildBackup 的輸入快照。currentRound 的 seenSignatures 三個欄位允許 Set 或字串陣列
 * 兩種表示法（見 BackupSnapshotSeenSignatures），其餘欄位與 Round 相同。
 */
export interface BackupSnapshot {
	readonly players: readonly Player[];
	readonly currentRound:
		| (Omit<Round, "seenSignatures"> & { readonly seenSignatures: BackupSnapshotSeenSignatures })
		| null;
	readonly history: readonly MatchHistoryEntry[];
}

/**
 * 把 Set 或字串陣列正規化為排序後的字串陣列（design Decision 11：排序是為了讓相同
 * 內容產生相同備份，便於 round-trip 斷言與 diff）。
 */
function toSortedSignatureKeys(keys: SignatureKeys): string[] {
	return [...keys].sort();
}

/**
 * 由目前的本機資料快照產生一份完整備份物件（prd.md 9.2 的五項：version／players／
 * currentRound／history／重複配對簽章，簽章隨 currentRound 一併備份，見 design Decision 11）。
 * SHALL NOT 呼叫 new Date()——exportedAt 目前只用於 backupFileName，本函式用不到它，
 * 但仍保留參數形狀以對齊 spec 的 buildBackup(snapshot, context) 簽章。
 */
export function buildBackup(snapshot: BackupSnapshot, context: { exportedAt: string }): Backup {
	void context;
	return {
		version: 1,
		players: [...snapshot.players],
		currentRound:
			snapshot.currentRound === null
				? null
				: {
						...snapshot.currentRound,
						seenSignatures: {
							teammateKeys: toSortedSignatureKeys(snapshot.currentRound.seenSignatures.teammateKeys),
							opponentKeys: toSortedSignatureKeys(snapshot.currentRound.seenSignatures.opponentKeys),
							fullMatchKeys: toSortedSignatureKeys(snapshot.currentRound.seenSignatures.fullMatchKeys),
						},
					},
		history: [...snapshot.history],
	};
}

/**
 * 依注入的 exportedAt 產生匯出檔名。SHALL NOT 內部呼叫 new Date()——內部產生會使
 * 回傳值每次不同，測試只能寬鬆斷言而失去驗證力（沿用 player-roster 的同一原則）。
 * exportedAt 一律來自 new Date().toISOString()（固定輸出 UTC，`YYYY-MM-DDTHH:mm:ss.sssZ`），
 * 故直接切字串前 10 碼取得日期，不繞道 Date 物件重新格式化。
 */
export function backupFileName(exportedAt: string): string {
	const date = exportedAt.slice(0, 10);
	return `matchmaker-backup-${date}.json`;
}
