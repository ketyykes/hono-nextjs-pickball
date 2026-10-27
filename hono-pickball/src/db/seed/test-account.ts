import { hashPassword } from "better-auth/crypto";

// 此檔會被 Node type stripping 直接載入（scripts/seed-test-account.ts），
// 因此只能 import 套件、不得有相對 import 或需轉譯的 TS 語法。
export interface TestAccountSeedInput {
	email: string;
	password: string;
	name: string;
	now: Date;
}

// SQL 字串字面值只需將單引號重複一次即可跳脫。
function quote(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

/**
 * 產生可交給 `wrangler d1 execute --file` 的 SQL：每行一個以 `;` 結尾的敘述。
 * 先刪除同 email 的使用者（cascade 帶走 account／session），讓重複 seed 可冪等。
 */
export async function buildTestAccountSeedSql(
	input: TestAccountSeedInput,
): Promise<string> {
	const userId = crypto.randomUUID();
	const accountId = crypto.randomUUID();
	const passwordHash = await hashPassword(input.password);
	const timestamp = input.now.getTime();

	return [
		`DELETE FROM user WHERE email = ${quote(input.email)};`,
		`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (${quote(userId)}, ${quote(input.name)}, ${quote(input.email)}, 1, ${timestamp}, ${timestamp});`,
		`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${quote(accountId)}, ${quote(userId)}, 'credential', ${quote(userId)}, ${quote(passwordHash)}, ${timestamp}, ${timestamp});`,
	].join("\n");
}

/**
 * 由測試帳號 email 衍生第二個帳號（plus addressing），供「另一分頁換帳號」E2E 使用。
 * 本地部分已含 `+` 時改附加 `-switch`，確保任何輸入都得到不同於原值的結果。
 */
export function deriveSwitchAccountEmail(email: string): string {
	const atIndex = email.lastIndexOf("@");
	const local = email.slice(0, atIndex);
	const domain = email.slice(atIndex);
	if (local.includes("+")) {
		return `${local}-switch${domain}`;
	}
	return `${local}+switch${domain}`;
}
