// JPG 匯出檔名組成（design Decision 6／7）。
//
// 格式刻意與 M8 的 backup.ts backupFileName（`matchmaker-backup-<YYYY-MM-DD>.json`）
// 對齊同一套「呼叫端注入 exportedAt、取 ISO 前 10 碼」慣例，但**不跨 change import**：
// M8 與本 change 並行開發，本 change 的 worktree 從不含 M8 的 main 開出，import 一個
// 當時不存在的模組會讓整批 task 建立在幻想的介面上。本檔是 repo 內第三個採同一 idiom
// 的檔名函式（另兩個為 backup.ts 的 backupFileName、history-csv.ts 的 historyCsvFileName），
// 這種重複是已知且可接受的——格式決策各自屬於自己的 capability，日後 JPG 想在檔名帶
// 場地數也不該去動備份檔名。
//
// 已知取捨：取 ISO 字串前 10 碼等於一律採 UTC 日期。台灣（UTC+8）在當地時間 08:00
// 前匯出會得到前一天的日期。仍採此法，因為「與 M8 一致」比「日期在午夜前後絕對精確」
// 重要——檔名日期的用途是排序與辨識，不是稽核憑證。

/** 檔名前綴：`matchmaker-round-<回合編號>-<日期>` 的固定字首。 */
const FILE_NAME_PREFIX = "matchmaker-round-";

/** 檔名副檔名：固定輸出 JPG。 */
const FILE_NAME_EXTENSION = ".jpg";

// 介面後綴用 Input 而非 Params，與 lib/ 既有九個同類介面的命名一致（既有慣例勝出）。
/** jpgExportFileName 的輸入。 */
export interface JpgExportFileNameInput {
	/**
	 * 目前回合編號，原樣嵌入檔名，不補零、不轉換。
	 * 呼叫端保證為正整數（來源是 round-types.ts 的 `RoundSchema`，其 `roundNumber` 為
	 * `z.number().int().positive()`），故本層刻意不做驗證——在純字串組裝函式裡重做一次
	 * schema 已保證的事，只會多一條永遠走不到的分支。
	 */
	readonly roundNumber: number;
	/**
	 * 匯出當下的時間，格式為 `new Date().toISOString()` 產生的 UTC ISO 字串
	 * （`YYYY-MM-DDTHH:mm:ss.sssZ`）。MUST 由呼叫端注入。
	 */
	readonly exportedAt: string;
}

/**
 * 依回合編號與注入的 exportedAt 組成 JPG 匯出檔名。
 * SHALL NOT 於函式內部呼叫 new Date() 或 Date.now()——內部取時間會讓測試只能寬鬆
 * 斷言，也讓同一份輸入產生不同輸出（沿用 backup.ts backupFileName 的同一原則）。
 * exportedAt 一律來自呼叫端的 new Date().toISOString()（固定輸出 UTC），故直接切
 * 字串前 10 碼取得日期，不繞道 Date 物件重新格式化。
 */
export function jpgExportFileName(input: JpgExportFileNameInput): string {
	const date = input.exportedAt.slice(0, 10);
	return `${FILE_NAME_PREFIX}${input.roundNumber}-${date}${FILE_NAME_EXTENSION}`;
}
