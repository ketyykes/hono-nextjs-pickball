/**
 * 本機測試帳號（email／密碼）登入是否啟用。
 * 採嚴格相等 "development" 的反向設計：遠端沒有 .dev.vars，
 * 忘了設變數時預設為關閉；"Development"、空字串都視為停用。
 * 參數收窄為 string | undefined，因為 cf-typegen 產的必填 string 與遠端實況（undefined）不符。
 */
export function isLocalAuthEnabled(env: { ENVIRONMENT: string | undefined }): boolean {
	return env.ENVIRONMENT === "development";
}

/**
 * Google 登入是否設定齊全：client id 與 secret 皆為非空字串才為真。
 * 只設一半時 provider 會半啟用（按鈕在、callback 失敗），因此缺值一律視為未設定。
 */
export function isGoogleSignInConfigured(env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET);
}

/**
 * auth 整體是否啟用：本機測試帳號或 Google 任一可用即啟用。
 * 兩者皆未成立時整組停用（404、不建立 auth、不碰 D1）。
 */
export function isAuthEnabled(env: {
	ENVIRONMENT: string | undefined;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
}): boolean {
	return isLocalAuthEnabled(env) || isGoogleSignInConfigured(env);
}
