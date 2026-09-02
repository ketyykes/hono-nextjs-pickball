// 判定「列印是否被阻擋」的純函式。列印函式由呼叫端注入（元件層傳入
// window.print.bind(window)），本檔 SHALL NOT 讀取 window／document 等任何全域物件
// （matchmaker-visual-export design Decision 4）——直接讀取會讓這段判定只能靠 E2E 驗證，
// 而 Playwright 沒有「模擬彈出視窗阻擋器」的能力，spec 要求的邊界情境會永遠沒有測試。
//
// 為何不監聽 afterprint 事件反推是否成功：afterprint 在使用者按「取消」時同樣會觸發，
// 無法區分「被阻擋」與「使用者主動取消」，會對正常操作誤報錯誤（design Decision 4）。

/** requestPrint 的回傳結果。成功時刻意不帶 message 欄位——讓「不回報任何訊息」
 * 成為型別層面的保證，而不是只靠測試斷言。 */
export type PrintOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

// 「列印函式呼叫時拋出例外」與「執行環境根本未提供列印能力」對使用者是同一件事——印不出來，
// 因此兩條失敗路徑 MUST 共用同一則訊息（spec、tasks 4.3）。訊息同時給兩條退路：
// 開啟彈出視窗權限、或改用瀏覽器選單的列印（Ctrl／Cmd + P）——本頁採同頁列印理論上不經過
// 彈出視窗阻擋器，但使用者無從分辨，且擴充功能與嵌入情境確實會讓 window.print 失效
// （design Decision 4 用語說明）。
export const PRINT_BLOCKED_MESSAGE =
	"目前無法開啟列印，請確認瀏覽器已允許本頁開啟彈出視窗權限後再試一次，或改用瀏覽器選單的列印功能（Ctrl／Cmd + P）。";

/**
 * 判定列印是否被阻擋。printer 型別刻意採 unknown 而非 `(() => void) | undefined`——
 * 呼叫端可能傳入任何非函式值，收窄型別會讓「非函式值」這條路徑變成型別錯誤而測不到。
 */
export function requestPrint(printer: unknown): PrintOutcome {
	if (typeof printer !== "function") {
		return { ok: false, message: PRINT_BLOCKED_MESSAGE };
	}

	try {
		printer();
		return { ok: true };
	} catch {
		return { ok: false, message: PRINT_BLOCKED_MESSAGE };
	}
}
