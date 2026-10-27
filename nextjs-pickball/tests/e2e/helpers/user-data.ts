import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { USER_DATA_TABLES } from "@pickball/core/api/user-data-tables";
import { deriveSwitchAccountEmail, readTestAccountResult } from "./test-account";

// 以 helper 檔位置推導，避免依賴執行時的 cwd
const honoRoot = join(__dirname, "..", "..", "..", "..", "hono-pickball");

/**
 * 清空測試帳號（含衍生的第二帳號）在所有使用者資料表的列，不碰 user／session／account／verification，
 * 因此 storage state 仍然有效。每個使用者資料 spec 的 beforeEach 都要呼叫。
 */
export function clearTestAccountUserData(): void {
	const result = readTestAccountResult();
	if (!result.ok) {
		throw new Error(`缺少測試帳密：${result.missing.join(", ")}`);
	}
	// SQL 字串內的單引號以兩個單引號跳脫
	const emails = [result.account.email, deriveSwitchAccountEmail(result.account.email)]
		.map((email) => `'${email.replaceAll("'", "''")}'`)
		.join(", ");
	const sql = USER_DATA_TABLES.map(
		(table) =>
			`DELETE FROM ${table} WHERE user_id IN (SELECT id FROM user WHERE email IN (${emails}));`,
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

/**
 * 以傳入的 request context 目前的 session 取得預期帳號標頭。
 * 直接呼叫使用者資料 API 的 spec 必須帶上它，否則後端守衛回 401 ACCOUNT_MISMATCH。
 */
export async function expectedUserHeaders(
	request: APIRequestContext,
): Promise<Record<string, string>> {
	const response = await request.get("/api/session");
	if (!response.ok()) {
		throw new Error(`取得目前帳號失敗，HTTP ${response.status()}`);
	}
	const body = (await response.json()) as { user: { id: string } | null };
	if (!body.user) {
		throw new Error("取得目前帳號失敗：session 沒有 user");
	}
	return { [EXPECTED_USER_ID_HEADER]: body.user.id };
}
