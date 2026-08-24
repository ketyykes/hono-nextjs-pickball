// 強度分數觸頂／觸底判定——純函式，色塊層以文字標示消費本函式的回傳值（design Decision 2）。
// 上下限值取自評分 capability 匯出的具名常數，SHALL NOT 在本檔另寫字面量
// （design Open Questions 第 1 條：評分界限常數的來源）。

import { RATING_MIN, RATING_MAX } from "./rating-types";

/**
 * 強度分數的觸界狀態：以具名聯集表示觸頂、觸底、未觸界三態，
 * 取代「兩個布林旗標」的寫法——後者能表達出「兩者同時為 true」的不可能狀態。
 */
export type RatingBoundState =
	| "at-upper-bound"
	| "at-lower-bound"
	| "within-bounds";

/**
 * prd.md 6.4.6、13.4。
 * 比較採 `>=`／`<=` 而非 `===`：上游（types.ts 的 zod `rating: z.number().min(1).max(8)`
 * 保證輸入值域、rating.ts 寫回前以 `Math.max(RATING_MIN, Math.min(RATING_MAX, ...))` 夾值）
 * 已確保 rating 落在 [RATING_MIN, RATING_MAX] 內，兩種比較在此值域內行為等價；
 * 寬鬆比較是留作防線——上游若日後回歸夾值邏輯，本函式仍不會靜默漏標。
 */
export function ratingBoundState(rating: number): RatingBoundState {
	if (rating >= RATING_MAX) {
		return "at-upper-bound";
	}
	if (rating <= RATING_MIN) {
		return "at-lower-bound";
	}
	return "within-bounds";
}
