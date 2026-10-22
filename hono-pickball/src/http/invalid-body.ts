import { API_ERROR_CODES } from "@pickball/core/api/errors";
import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * 使用者資料 sub-app 共用的 onError。
 * JSON 語法錯誤由 Hono 拋 HTTPException(400)（純文字）；契約要求統一回 INVALID_BODY。
 */
export const userDataOnError: ErrorHandler = (err, c) => {
	if (err instanceof HTTPException && err.status === 400) {
		return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
	}
	// 其餘錯誤維持 Hono 預設行為（sub-app 的 onError 會取代預設處理）
	if (err instanceof HTTPException) {
		return err.getResponse();
	}
	console.error(err);
	return c.text("Internal Server Error", 500);
};

/** zValidator 的 hook：schema 驗證失敗統一回 400 INVALID_BODY。 */
export function invalidBodyHook(result: { success: boolean }, c: Context) {
	if (!result.success) {
		return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
	}
}
