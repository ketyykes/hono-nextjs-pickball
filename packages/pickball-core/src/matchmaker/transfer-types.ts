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
// 與 PlayerForm 既有的錯誤訊息語氣一致。以下 localStorageUnavailable／quotaExceeded
// 兩則為 §7（transfer-storage.ts）追加，同樣受 backup.test.ts「所有錯誤訊息…」遍歷
// 測試檢查：以「。」分段後至少 3 段、最後一段以「請」開頭、長度 ≥ 30 字、
// 不含未翻譯的 zod issue 字串（M8 §3 Stage 2 review J2 裁決）。
export const TRANSFER_MESSAGES = {
	invalidJson:
		"備份檔案的內容不是合法的 JSON 格式。檔案可能已損毀或遭手動修改，資料未被匯入。請確認檔案未損毀，或重新匯出一份備份後再試一次。",
	unsupportedVersion:
		"備份檔案的版本不受目前系統支援。系統僅能讀取 version 1 的備份格式，資料未被匯入。請改用符合目前版本的備份檔案，或以現在的系統重新匯出一份最新格式的備份。",
	// 此則承載「非語法／非版本」的所有失敗（缺欄位、參賽者／回合／歷史紀錄格式不合法、
	// 甚至檔案根本不是備份），第二段刻意不預設「這一定是一份備份」——實測這則訊息會
	// 涵蓋完全不像備份的輸入（例如純數字、空物件），若寫死「備份中有一位參賽者不合法」
	// 反而會誤導使用者去檢查一份根本不存在的名單（M8 §3 Stage 2 review J4 裁決）。
	invalidStructure:
		"備份檔案的內容不符合預期的結構。檔案可能缺少備份必要的欄位、其中的參賽者／目前回合／歷史紀錄之一不合法，也可能這根本不是本系統匯出的備份檔，資料未被匯入。請確認匯入的是本系統匯出的備份檔，並確認參賽者等欄位是否完整（例如強度分數需介於 1.00 至 8.00 之間），必要時重新匯出一份備份後再試一次。",
	// localStorage 存取本身拋出例外（SSR、私密模式等）。匯出不受此影響（讀不到資料時
	// 匯出空備份），此則只在匯入的寫入路徑用到。
	localStorageUnavailable:
		"此瀏覽器目前無法使用 LocalStorage 儲存空間。可能處於私密瀏覽模式或瀏覽器限制寫入，資料未被匯入。請改用一般瀏覽模式，或更換瀏覽器後再試一次。",
	// setItem 拋出配額相關例外（QuotaExceededError 等）。
	quotaExceeded:
		"寫入本機儲存空間時已超出瀏覽器的容量上限。這份資料因此未被儲存，但備份檔案本身沒有遺失。請先清除舊資料或減少匯入筆數後再試一次。",
	// roster-csv.ts 的 parseRosterCsv 原本在此則訊息外自行拼字面值，逃過本表的集中管理
	// 與 backup.test.ts 的遍歷 guard（M8 Final Review M1 裁決）。缺欄清單為動態內容，
	// 故此則以函式形式帶入，而非固定字串；訊息仍固定寫成「＜發生了什麼＞。＜目前資料
	// 狀態＞。請＜下一步＞。」三段式，與其餘四則同一語氣。
	missingRosterCsvHeaders(missing: readonly string[]): string {
		return `CSV 標題列缺少必填欄位：${missing.join("、")}。缺少的欄位無法對應到任何一行資料，因此整份 CSV 未被匯入。請於標題列補齊缺少的欄位名稱後重新匯入。`;
	},
} as const;
