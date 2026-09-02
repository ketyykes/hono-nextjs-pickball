// 匯出功能的組裝層：buildBackup()／backupFileName()（design Decision 1）。

import type { Player } from "./types";
import type { Round } from "./round-types";
import type { MatchHistoryEntry } from "./history";
import { BackupSchema, type Backup } from "./transfer-types";

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
 *
 * 交棒給 §3：排序使 `buildBackup` 對**亂序輸入非恆等**——而 `round.ts` 的私有函式
 * `toArrays()` 只做 `[...index.teammateKeys]`，保留 Set 插入序、不排序。因此從
 * LocalStorage 讀出的 `Round.seenSignatures` 可能是亂序的，經 `buildBackup` 後會被
 * 排序；§3 若要寫 round-trip 斷言，期望值須是**排序後**的結果，不能直接比對原始
 * LocalStorage 內容（M8 §2 Stage 2 實測發現）。
 *
 * 刻意 SHALL NOT 去重：輸入若是記憶體表示法 Set，本就不含重複值；輸入若是已持久化
 * 的字串陣列，理論上也不會有重複（`round.ts` 的 `toArrays` 只從 Set 產生）。但本函式
 * 不對「輸入是否已去重」做任何假設或修正——多做一層去重只是把成本轉嫁到這個單純的
 * 正規化函式，卻換不到任何額外能力，還可能掩蓋上游其實產生了重複值的錯誤（去重後
 * 從備份檔看不出源頭壞了）。此決定由 `backup.test.ts` 的重複值測試釘住。
 */
function toSortedSignatureKeys(keys: SignatureKeys): string[] {
	return [...keys].sort();
}

/**
 * 由目前的本機資料快照產生一份完整備份物件（prd.md 9.2 的五項：version／players／
 * currentRound／history／重複配對簽章，簽章隨 currentRound 一併備份，見 design Decision 11）。
 * SHALL NOT 呼叫 new Date()。
 *
 * 刻意只做頂層淺拷貝：`players`／`history` 僅淺拷貝陣列本身，元素（以及
 * `currentRound.matches`）與輸入 `snapshot` 共用參考。深拷貝在此無實質需求——輸出
 * 隨即交給 `JSON.stringify`／schema 驗證，不會被就地修改；深拷貝只會讓這個純函式
 * 多一層無人使用的成本。呼叫端 MUST 視傳入的 `snapshot` 為唯讀，不要在呼叫
 * `buildBackup` 之後再修改其內容。
 */
export function buildBackup(snapshot: BackupSnapshot, context: { exportedAt: string }): Backup {
	// context／exportedAt 本函式用不到，但仍保留參數形狀以對齊 spec 的
	// buildBackup(snapshot, context) 簽章（exportedAt 目前只給 backupFileName 用）。
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

/**
 * parseBackup 的結果型別。失敗分支刻意 SHALL NOT 帶任何部分資料欄位——只有成功分支
 * 拿得到 Backup，§7 之後的寫入函式只接受 Backup 型別，型別上就無法讓未驗證的資料
 * 流到寫入層（design Decision 1「原子性由型別強制」）。
 */
export type ParseBackupResult =
	| { readonly ok: true; readonly backup: Backup }
	| { readonly ok: false; readonly message: string };

/**
 * 解析並驗證匯入的備份檔內容（design Decision 1／4：先全部驗證、再一次寫入；
 * 單筆參賽者不合法即整份拒絕，不走逐筆降級）。
 */
export function parseBackup(text: string): ParseBackupResult {
	const json: unknown = JSON.parse(text);
	const parsed = BackupSchema.safeParse(json);
	if (parsed.success) {
		return { ok: true, backup: parsed.data };
	}
	return { ok: false, message: "備份格式不合法" };
}
