import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { USER_DATA_TABLES } from "@pickball/core/api/user-data-tables";
import { readTestAccountResult } from "./test-account";

// 以 helper 檔位置推導，避免依賴執行時的 cwd
const honoRoot = join(__dirname, "..", "..", "..", "..", "hono-pickball");

/**
 * 清空測試帳號在所有使用者資料表的列，不碰 user／session／account／verification，
 * 因此 storage state 仍然有效。每個使用者資料 spec 的 beforeEach 都要呼叫。
 */
export function clearTestAccountUserData(): void {
	const result = readTestAccountResult();
	if (!result.ok) {
		throw new Error(`缺少測試帳密：${result.missing.join(", ")}`);
	}
	// SQL 字串內的單引號以兩個單引號跳脫
	const email = result.account.email.replaceAll("'", "''");
	const sql = USER_DATA_TABLES.map(
		(table) =>
			`DELETE FROM ${table} WHERE user_id IN (SELECT id FROM user WHERE email = '${email}');`,
	).join(" ");
	try {
		execFileSync(
			"pnpm",
			["--dir", honoRoot, "exec", "wrangler", "d1", "execute", "DB", "--local", "--env", "local", "--command", sql],
			{ stdio: "pipe" },
		);
	} catch (error) {
		// Node 的錯誤訊息會帶完整指令（含 SQL 與測試帳號 email），所以只回報表名與 exit status
		const status =
			error instanceof Error && "status" in error ? String(error.status) : "unknown";
		throw new Error(
			`清空測試帳號使用者資料失敗（表：${USER_DATA_TABLES.join(", ")}；exit status：${status}）`,
		);
	}
}
