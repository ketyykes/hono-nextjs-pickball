import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

export interface TestAccount {
	email: string;
	password: string;
	name: string;
}

export type ReadTestAccountResult =
	| { ok: true; account: TestAccount }
	| { ok: false; missing: string[] };

const requiredVars = [
	"TEST_ACCOUNT_EMAIL",
	"TEST_ACCOUNT_PASSWORD",
	"TEST_ACCOUNT_NAME",
] as const;

// 以 helper 檔位置推導，避免依賴執行時的 cwd（Playwright 以 CJS 載入 TS，故用 __dirname）
const honoRoot = join(__dirname, "..", "..", "..", "..", "hono-pickball");
const devVarsPath = join(honoRoot, ".dev.vars");

/**
 * 讀取 hono-pickball/.dev.vars 的測試帳密。
 * 不經 process.env：與 seed 腳本一致，避免 shell 已 export 的值蓋掉檔案內容。
 * 缺值時回報缺少的變數名稱（不含任何值），讓呼叫端能在 skip 原因中寫明。
 */
export function readTestAccountResult(): ReadTestAccountResult {
	if (!existsSync(devVarsPath)) {
		return { ok: false, missing: [...requiredVars] };
	}
	const devVars = parseEnv(readFileSync(devVarsPath, "utf8"));
	const missing = requiredVars.filter((name) => !devVars[name]);
	if (missing.length > 0) {
		return { ok: false, missing };
	}
	return {
		ok: true,
		account: {
			email: devVars.TEST_ACCOUNT_EMAIL as string,
			password: devVars.TEST_ACCOUNT_PASSWORD as string,
			name: devVars.TEST_ACCOUNT_NAME as string,
		},
	};
}

/** 缺任何值回 null；需要缺哪些變數時改用 readTestAccountResult()。 */
export function readTestAccount(): TestAccount | null {
	const result = readTestAccountResult();
	return result.ok ? result.account : null;
}

/**
 * 依序對本機 D1 執行 migrate 與 seed。
 * wrangler dev 執行中寫入同一份本機 sqlite 會立即可見（B2 §1 實測），不必重啟後端。
 * 只由 globalSetup 呼叫（執行一次）：seed 會重建 user 並連帶刪除 session，spec 自行呼叫會讓已存的 storage state 失效，
 * 多 worker 並行呼叫也會撞 SQLITE_BUSY。
 */
export function ensureTestAccountSeeded(): void {
	for (const script of ["db:migrate:local", "db:seed:local"]) {
		execFileSync("pnpm", ["--dir", honoRoot, script], { stdio: "pipe" });
	}
}
