import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { bodyLimit } from "hono/body-limit";

/**
 * 批次寫入端點共用的 body 上限。
 * hono 預設的 onError 會拋出純文字的 413，沒有錯誤碼，前端與測試無法分辨原因，所以必須自訂回應。
 */
export function jsonBodyLimit(maxSize: number) {
	return bodyLimit({
		maxSize,
		onError: (c) => c.json({ error: API_ERROR_CODES.PAYLOAD_TOO_LARGE }, 413),
	});
}
