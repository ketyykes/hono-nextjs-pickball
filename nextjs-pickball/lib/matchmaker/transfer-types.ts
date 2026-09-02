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
