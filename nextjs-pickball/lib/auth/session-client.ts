// 瀏覽器端的登入狀態與登入／登出請求。
// 對應 hono-pickball 的 GET /api/session 與 better-auth 的 /api/auth/*（皆 same-origin）。
// 四個函式絕不 throw：呼叫端（store、表單）不需要 try/catch。

export interface SessionUser {
	id: string;
	email: string;
	name: string;
}

export interface SignInMethods {
	google: boolean;
	emailPassword: boolean;
}

export interface SessionState {
	authEnabled: boolean;
	user: SessionUser | null;
	// 缺省代表 Google 登入上線前的後端（當時 authEnabled 只可能是測試帳號登入），不補預設值。
	signInMethods?: SignInMethods;
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

function isValidSignInMethods(value: unknown): value is SignInMethods {
	if (typeof value !== "object" || value === null) return false;
	const methods = value as Record<string, unknown>;
	return (
		typeof methods.google === "boolean" &&
		typeof methods.emailPassword === "boolean"
	);
}

function isValidPayload(value: unknown): value is SessionState {
	if (typeof value !== "object" || value === null) return false;
	const payload = value as Record<string, unknown>;
	return (
		typeof payload.authEnabled === "boolean" &&
		(payload.user === null || isValidUser(payload.user)) &&
		(!("signInMethods" in payload) || isValidSignInMethods(payload.signInMethods))
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
		const session: SessionState = {
			authEnabled: payload.authEnabled,
			user: payload.user,
		};
		if (payload.signInMethods !== undefined) {
			session.signInMethods = payload.signInMethods;
		}
		return session;
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

export type GoogleSignInResult = { ok: true } | { ok: false };

// 只接受 https：後端回應被竄改或替身回傳 javascript: 等協定時，前端不能照導。
function isHttpsUrl(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

// navigate 參數只為讓單元測試替換導向（happy-dom 的 location.assign 無法可靠 spy）。
export async function startGoogleSignIn(
	navigate: (url: string) => void = (url) => window.location.assign(url),
): Promise<GoogleSignInResult> {
	try {
		const res = await fetch("/api/auth/sign-in/social", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: "google",
				callbackURL: "/",
				errorCallbackURL: "/login",
			}),
		});
		if (res.status !== 200) return { ok: false };
		const payload: unknown = await res.json();
		const url =
			typeof payload === "object" && payload !== null
				? (payload as Record<string, unknown>).url
				: undefined;
		if (!isHttpsUrl(url)) return { ok: false };
		navigate(url);
		return { ok: true };
	} catch {
		return { ok: false };
	}
}
