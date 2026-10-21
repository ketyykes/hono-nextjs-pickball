// 瀏覽器端的登入狀態與登入／登出請求。
// 對應 hono-pickball 的 GET /api/session 與 better-auth 的 /api/auth/*（皆 same-origin）。
// 三個函式絕不 throw：呼叫端（store、表單）不需要 try/catch。

export interface SessionUser {
	id: string;
	email: string;
	name: string;
}

export interface SessionState {
	authEnabled: boolean;
	user: SessionUser | null;
}

export type SignInResult =
	| { ok: true }
	| { ok: false; reason: "invalid-credentials" | "unavailable" | "failed" };

const DISABLED: SessionState = { authEnabled: false, user: null };

function isValidUser(value: unknown): value is SessionUser {
	if (typeof value !== "object" || value === null) return false;
	const user = value as Record<string, unknown>;
	return (
		typeof user.id === "string" &&
		typeof user.email === "string" &&
		typeof user.name === "string"
	);
}

function isValidPayload(value: unknown): value is SessionState {
	if (typeof value !== "object" || value === null) return false;
	const payload = value as Record<string, unknown>;
	return (
		typeof payload.authEnabled === "boolean" &&
		(payload.user === null || isValidUser(payload.user))
	);
}

// 取不到狀態一律視為「未啟用」（fail-closed），訪客介面才不會因後端異常出現半套登入 UI。
export async function fetchSession(): Promise<SessionState> {
	try {
		// keepalive：hydration 晚於 beforeunload 時（快速整頁換頁），WebKit 會擋下一般 fetch
		// 並輸出 console 錯誤，catch 擋不住；keepalive 請求不受導覽中止。
		const res = await fetch("/api/session", { keepalive: true });
		if (!res.ok) return DISABLED;
		const payload: unknown = await res.json();
		if (!isValidPayload(payload)) return DISABLED;
		return { authEnabled: payload.authEnabled, user: payload.user };
	} catch {
		return DISABLED;
	}
}

export async function signInWithEmail(
	email: string,
	password: string,
): Promise<SignInResult> {
	try {
		const res = await fetch("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});
		if (res.status === 200) return { ok: true };
		if (res.status === 401) return { ok: false, reason: "invalid-credentials" };
		if (res.status === 404) return { ok: false, reason: "unavailable" };
		return { ok: false, reason: "failed" };
	} catch {
		return { ok: false, reason: "failed" };
	}
}

export async function signOut(): Promise<boolean> {
	try {
		const res = await fetch("/api/auth/sign-out", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		return res.ok;
	} catch {
		return false;
	}
}
