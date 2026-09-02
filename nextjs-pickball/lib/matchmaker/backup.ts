// 匯出功能的組裝層：buildBackup()／backupFileName()（design Decision 1）。

import type { Player } from "./types";
import type { Round } from "./round-types";
import type { MatchHistoryEntry } from "./history";
import { BackupSchema, TRANSFER_MESSAGES, type Backup } from "./transfer-types";

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
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		// SHALL NOT 拋出例外中斷操作——拋例外會讓整頁白畫面，是最糟的失敗模式
		// （design Risks／spec 第 11 節）。
		return fail(TRANSFER_MESSAGES.invalidJson);
	}

	// 版本不符須有專屬訊息，不與「結構不合法」共用（design「3.6 的順序」節）：
	// BackupSchema 的 version 為 z.literal(1)，若直接丟給 safeParse，「version 不是 1」
	// 會與其他結構問題混在同一份 issues 陣列裡，無法個別給出對應訊息。因此在此
	// 單獨檢視 version 欄位，SHALL NOT 為此放寬 BackupSchema（那會破壞既有守衛）。
	//
	// 這裡刻意要求 typeof json.version === "number"：「版本不支援」這則訊息只該在
	// 我們真的讀到一個不受支援的版本號時出現。若 version 的型別本身就不對
	// （null／布林／字串等，包含完全缺少 version 鍵時 json.version 為 undefined），
	// 那是結構問題，不是版本問題——把使用者導向「請改用符合目前版本的備份檔案」是
	// 錯誤的下一步（M8 §3 Stage 2 review m2 裁決）。
	//
	// 刻意 SHALL NOT 另外寫 "version" in json：json 經 isPlainObject 縮小為
	// Record<string, unknown> 後，存取不存在的鍵本就安全地回傳 undefined，
	// 而 typeof undefined === "number" 恆為 false——"in" 判斷對本函式的任何輸入
	// 都不會改變結果，是恆等突變（equivalent mutant），寫了也是死碼。
	if (isPlainObject(json) && typeof json.version === "number" && json.version !== 1) {
		return fail(TRANSFER_MESSAGES.unsupportedVersion);
	}

	const parsed = BackupSchema.safeParse(json);
	if (!parsed.success) {
		return fail(TRANSFER_MESSAGES.invalidStructure);
	}
	return { ok: true, backup: parsed.data };
}

/**
 * 失敗結果的唯一組裝點（tasks 3.11）：語法／版本／結構三種失敗只是取用不同訊息，
 * 不應各自在呼叫處重複拼一份 `{ ok: false, message }` 物件字面量。
 *
 * 回傳型別刻意窄化為 `Extract<ParseBackupResult, { ok: false }>`（而非整個
 * `ParseBackupResult` union）：若宣告成整個 union，把本函式誤改回
 * `{ ok: true, ... }` 只會是執行期錯誤，型別檢查看不出來；窄化後同樣的誤改會
 * 直接編譯失敗（M8 §3 Stage 2 review M21／m3 裁決）。
 */
function fail(message: string): Extract<ParseBackupResult, { ok: false }> {
	return { ok: false, message };
}

/**
 * 縮小為可安全用 in 運算子存取屬性的物件型別（陣列／null 皆非本函式要處理的形狀）。
 * `!Array.isArray(value)` 這條排除陣列的判斷主要是表達型別意圖（JSON 陣列本來就不會
 * 有自有的 `version` 屬性，"version" in [] 恆為 false）——即使拿掉也不影響行為，
 * 保留是為了讓型別縮小後的 `Record<string, unknown>` 語意誠實對應「純物件」。
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
