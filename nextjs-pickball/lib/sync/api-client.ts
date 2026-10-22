import type { z } from "zod";

// 使用者資料 API 的唯一 fetch 入口：把回應分類成固定幾種結果，且永不 throw，
// 呼叫端（雲端 store hook）不需要 try/catch，也不必各自解讀狀態碼。

export type RequestResult<T> =
	| { kind: "ok"; value: T | undefined }
	| { kind: "conflict" }
	| { kind: "unauthorized" }
	| { kind: "rejected"; status: number }
	| { kind: "failed" };

export type RequestMethod = "GET" | "PUT" | "POST" | "DELETE";

export interface RequestOptions<S extends z.ZodType> {
	body?: unknown;
	schema: S;
}

const FAILED = { kind: "failed" } as const;

export async function requestJson<S extends z.ZodType>(
	method: RequestMethod,
	path: string,
	{ body, schema }: RequestOptions<S>,
): Promise<RequestResult<z.output<S>>> {
	const init: RequestInit = { method, credentials: "same-origin" };
	if (method === "GET") {
		// 整頁導覽開始後才發出的一般 GET 會被 WebKit 擋下並記成 console 錯誤；
		// keepalive 不受導覽影響。PUT 不帶：keepalive 的 body 有 64 KiB 總量限制，
		// 超過時 fetch 直接失敗，會變成永遠重試。
		init.keepalive = true;
	}
	if (body !== undefined) {
		init.body = JSON.stringify(body);
		init.headers = { "Content-Type": "application/json" };
	}

	try {
		const response = await fetch(path, init);
		if (response.status === 409) return { kind: "conflict" };
		if (response.status === 401) return { kind: "unauthorized" };
		if (response.status >= 400 && response.status < 500) {
			return { kind: "rejected", status: response.status };
		}
		if (!response.ok) return FAILED;
		if (response.status === 204) return { kind: "ok", value: undefined };

		const parsed = schema.safeParse(await response.json());
		if (!parsed.success) return FAILED;
		return { kind: "ok", value: parsed.data };
	} catch {
		return FAILED;
	}
}
