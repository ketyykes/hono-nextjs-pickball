/**
 * 本機測試帳號登入是否啟用，是整個 auth 功能唯一的啟用判斷。
 * 採嚴格相等 "development" 的反向設計：遠端沒有 .dev.vars，
 * 忘了設變數時預設為關閉；"Development"、空字串都視為停用。
 * 參數收窄為 string | undefined，因為 cf-typegen 產的必填 string 與遠端實況（undefined）不符。
 */
export function isLocalAuthEnabled(env: { ENVIRONMENT: string | undefined }): boolean {
	return env.ENVIRONMENT === "development";
}
