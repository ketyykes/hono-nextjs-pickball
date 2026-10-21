import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

const staleMs = 10 * 60 * 1000;
const waitTimeoutMs = 120 * 1000;

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
 *
 * 每次 Playwright 執行（同一個 runner 行程）只 seed 一次：多個 worker 並行時，
 * 重複 seed 會讓 migrate 撞 SQLITE_BUSY，且 seed 會重建 user 使其他 worker 的 session 失效。
 * 以 runner 的 pid 為 key，用 mkdir 的原子性選出負責 seed 的 worker，其餘等待其完成。
 */
export function ensureTestAccountSeeded(): void {
	const lockDir = join(tmpdir(), `pickball-e2e-seed-${process.ppid}`);
	const doneFile = join(lockDir, "done");
	const failedFile = join(lockDir, "failed");

	// 前次執行遺留的同 pid 目錄視為過期（pid 可能被重用）
	if (existsSync(lockDir) && Date.now() - statSync(lockDir).mtimeMs > staleMs) {
		rmSync(lockDir, { recursive: true, force: true });
	}

	try {
		mkdirSync(lockDir);
	} catch {
		const deadline = Date.now() + waitTimeoutMs;
		while (!existsSync(doneFile)) {
			if (existsSync(failedFile)) {
				throw new Error("另一個 worker 的測試帳號 seed 失敗");
			}
			if (Date.now() > deadline) {
				throw new Error("等待測試帳號 seed 逾時");
			}
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
		}
		return;
	}

	try {
		for (const script of ["db:migrate:local", "db:seed:local"]) {
			execFileSync("pnpm", ["--dir", honoRoot, script], { stdio: "pipe" });
		}
		writeFileSync(doneFile, "");
	} catch (error) {
		writeFileSync(failedFile, "");
		throw error;
	}
}
