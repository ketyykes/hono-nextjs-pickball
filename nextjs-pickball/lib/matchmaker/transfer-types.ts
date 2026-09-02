// 備份檔的 zod schema 與型別（design Decision 1）。純 schema 與常數，不含函式——
// 斷言掛在消費它的 backup.test.ts，不為本檔硬造一份測試檔（design「與 M4 的介面對齊」節）。

import { z } from "zod";
import { PlayerSchema } from "./types";
import { RoundSchema } from "./round-types";
import { MatchHistoryEntrySchema } from "./history";

// 巢狀 schema 全部 import 自既有模組，不重新宣告任何欄位——重新宣告等於製造第二個
// 真相來源，M4 日後改欄位時本段不會編譯失敗（design「與 M4 的介面對齊」節）。
// 重複配對簽章隨 currentRound 一併備份，不另設頂層欄位（design Decision 11）。
export const BackupSchema = z.object({
	version: z.literal(1),
	players: z.array(PlayerSchema),
	currentRound: RoundSchema.nullable(),
	history: z.array(MatchHistoryEntrySchema),
});

export type Backup = z.infer<typeof BackupSchema>;

// 匯入／匯出流程的全部錯誤訊息集中於此（design Decision 1）：spec 要求「所有錯誤
// 訊息皆為繁體中文且各自包含可採取的修正方式」，這句話只有在訊息可被逐一列舉時才
// 驗得起來——若訊息散落在各個 return 裡，測試只能一則一則手抄，漏掉新加的那則
// 不會紅。集中成常數表後，測試改為遍歷整張表，新增訊息卻忘了寫修正方式會立刻紅燈。
// 每則訊息固定寫成「＜發生了什麼＞。＜目前資料狀態＞。請＜下一步＞。」三段式，
// 與 PlayerForm 既有的錯誤訊息語氣一致。§7 會再往這張表追加兩則
// （localStorage 不可用／寫入超出配額），本組只放本組用得到的三則。
export const TRANSFER_MESSAGES = {
	invalidJson:
		"備份檔案的內容不是合法的 JSON 格式。檔案可能已損毀或遭手動修改，資料未被匯入。請確認檔案未損毀，或重新匯出一份備份後再試一次。",
	unsupportedVersion:
		"備份檔案的版本不受目前系統支援。系統僅能讀取 version 1 的備份格式，資料未被匯入。請改用符合目前版本的備份檔案，或以現在的系統重新匯出一份最新格式的備份。",
	invalidStructure:
		"備份檔案的內容不符合預期的結構。備份中至少有一位參賽者、目前回合或歷史紀錄的欄位不合法或缺漏，資料未被匯入。請確認備份檔案中參賽者的欄位是否完整（例如強度分數需介於 1.00 至 8.00 之間），或改用未經手動修改的備份檔案再試一次。",
} as const;
