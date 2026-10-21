import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { request } from "@playwright/test";
import {
	ensureTestAccountSeeded,
	readTestAccountResult,
} from "./helpers/test-account";
import { storageStatePath } from "./helpers/storage-state";

const FRONTEND_ORIGIN = "http://localhost:3005";

// webServer 先啟動才會執行本檔，所以可以直接呼叫前端 origin。
// seed 會重建 user 並連帶刪除 session，因此全 E2E 只在這裡 seed 一次，且必須早於存 storage state。
export default async function globalSetup(): Promise<void> {
	const result = readTestAccountResult();

	if (!result.ok) {
		// 舊 state 的 session 可能已失效，留著會讓登入 spec 誤以為可用而不 skip
		rmSync(storageStatePath, { force: true });
		console.warn(
			`[global-setup] .dev.vars 缺少 ${result.missing.join(", ")}，略過登入夾具；需要登入的 spec 會 skip`,
		);
		return;
	}

	ensureTestAccountSeeded();

	const context = await request.newContext({ baseURL: FRONTEND_ORIGIN });
	try {
		const response = await context.post("/api/auth/sign-in/email", {
			// better-auth 檢查 Origin；自寫 request 不像瀏覽器會自動帶
			headers: { Origin: FRONTEND_ORIGIN },
			data: {
				email: result.account.email,
				password: result.account.password,
			},
		});
		if (!response.ok()) {
			// 帳密齊備卻登不進去是真問題，不得吞掉
			throw new Error(
				`[global-setup] 測試帳號登入失敗，HTTP ${response.status()}（請確認 ENVIRONMENT=development 且 seed 成功）`,
			);
		}
		mkdirSync(dirname(storageStatePath), { recursive: true });
		await context.storageState({ path: storageStatePath });
	} finally {
		await context.dispose();
	}
}
