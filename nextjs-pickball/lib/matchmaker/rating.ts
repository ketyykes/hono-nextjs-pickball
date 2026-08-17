// 匹克球對戰分配機的賽後評分引擎。全部為純函式：不讀寫 LocalStorage、不含 React、
// 不管理回合狀態、不累加 gamesPlayed、不寫入 Player（spec Purpose；design Non-Goals）。
// 只回答一個問題——「這場比完之後，每個人的分數該變成多少」。
//
// 零和成立的三個條件（design Decision 2，delta spec Requirement「零和的適用範圍」）：
//   1. 參與者的 K_eff 全部相同（即 gamesPlayed 全部相同）
//   2. 無人撞上下限
//   3. 忽略四捨五入至兩位小數造成的殘差
// 任一條件不滿足時守恆即被破壞，這是 prd.md 6.4.3／6.4.5／6.4.6 彼此衝突的必然結果，非實作缺陷。
//
// 第 1 批（commit cf81151）完成預測勝率、K 遞減、單打賽後更新；第 2 批（本次）完成雙打
// 賽後更新（§5）、上下限與撞邊界標記（§6）、零和觀測（§7）、無狀態驗證（§8）。單打是
// 「每隊 1 人」的雙打特例：`updateRatings` 已統一以「兩隊平均分數」計算 `E`、同隊球員
// 共用同一個 `(S − E)` 但各自套用自己的 `K_eff`（design Decision 1；tasks 5.4）。

import { roundRating } from "./rating-math";
import type { Player } from "./types";

/**
 * 預測勝率公式的分差校準常數（`prd.md` 6.4.2）。
 * 標準 Elo 用 400，是為西洋棋 1500 分級距設計；套在本產品 1～8 的尺度上會使預測勝率
 * 退化為約 51%（毫無鑑別度），故重新校準為 3.0。SHALL NOT 改用標準 Elo 的 400。
 */
export const RATING_D = 3.0;

/** 基礎 K 值：出場次數趨近無限大時，單場變動幅度的漸近下界（`prd.md` 6.4.1／6.4.3）。 */
export const K_BASE = 0.15;

/**
 * K 遞減公式的分母常數：`K_eff = K_base × (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed))`
 * （`prd.md` 6.4.3）。
 */
export const K_DECAY_GAMES = 20;

/** 分數下限（含）。 */
export const MIN_RATING = 1.0;

/** 分數上限（含）。 */
export const MAX_RATING = 8.0;

/**
 * 撞邊界標記：clamp 是否真的把理論賽後分數往內拉（`"at-max"`／`"at-min"`），或未撞邊界
 * （`"none"`）。判定基準是「值有沒有被改變」，不是「值是否等於邊界值」（tasks 6.4）
 * （design Decision 4：只回 `after` 不足以讓 UI 判讀「撞到邊界」與「結果剛好為零」的差異）。
 */
export type ClampFlag = "none" | "at-max" | "at-min";

/** 單一球員的一筆評分變動（design Decision 4）。 */
export interface RatingChange {
	/** 該員的 id，供歷史紀錄直接取用（`prd.md` 8.2）。 */
	readonly playerId: string;
	/** 賽前分數。 */
	readonly before: number;
	/** 賽後分數，已經 `roundRating` 取兩位小數並 clamp 於 `MIN_RATING`～`MAX_RATING`。 */
	readonly after: number;
	/** 實際生效的變動（`after − before`，在 round／clamp **之後**計算，design Decision 5）。 */
	readonly delta: number;
	/** clamp 前的理論變動量，保留完整精度（design Decision 4／5）。 */
	readonly rawDelta: number;
	/** 撞邊界標記。 */
	readonly clamped: ClampFlag;
}

/**
 * `updateRatings()` 的輸入：勝方與敗方球員陣列，而非 `match-allocation` 的 `Match`
 * 加勝方索引（design Decision 3）——評分與分配是兩個獨立 capability，比分可能來自
 * `/scoreboard`、手動輸入，甚至臨時換人代打的場次，不應強迫這些路徑先偽造一個 `Match`。
 */
export interface RatingUpdateInput {
	readonly winners: readonly Player[];
	readonly losers: readonly Player[];
}

/**
 * 計算 `ratingA` 相對於 `ratingB` 的預測勝率（`prd.md` 6.4.2）。
 * 中間結果不四捨五入（design Decision 5）——取整會讓誤差在公式內逐級放大。
 */
export function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + 10 ** (-(ratingA - ratingB) / RATING_D));
}

/**
 * 計算單一球員的有效 K 值，依其自身 `gamesPlayed` 遞減（`prd.md` 6.4.3）。
 * MUST 取該員自己的 `gamesPlayed`，SHALL NOT 取隊伍平均或全場平均——
 * 取平均會讓新加入者在雙打中被老手拖慢收斂，設計目的即失效（design Decision 1）。
 * `gamesPlayed = 0` 時分母為 `K_DECAY_GAMES + 0 = K_DECAY_GAMES`，不會除以零。
 */
export function effectiveK(gamesPlayed: number): number {
	return K_BASE * (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed));
}

/**
 * 將理論賽後分數 clamp 於 `MIN_RATING`～`MAX_RATING`，回傳實際寫回值與撞邊界標記。
 * 判定基準是「clamp 是否真的把值往內拉」，不是「值是否剛好等於邊界」——理論值恰好落在
 * 邊界（例如 clamp 前就精確等於 `8.00`）而未超出時 MUST 為 `"none"`（tasks 6.4）。
 * 單打與雙打共用同一份 clamp 邏輯（tasks 6.5）。
 */
function clampRating(theoreticalAfter: number): { readonly after: number; readonly clamped: ClampFlag } {
	if (theoreticalAfter > MAX_RATING) {
		return { after: MAX_RATING, clamped: "at-max" };
	}
	if (theoreticalAfter < MIN_RATING) {
		return { after: MIN_RATING, clamped: "at-min" };
	}
	return { after: theoreticalAfter, clamped: "none" };
}

/**
 * 計算單一球員的一筆評分變動：`rawDelta = K_eff(該員自己的 gamesPlayed) × sMinusE`。
 * `sMinusE` 是呼叫端算好的 `S − E`（勝方傳 `1 − E`、敗方傳 `0 − E`），讓單打與雙打
 * （同隊兩人共用同一個 `S − E` 但各自套用自己的 `K_eff`）共用同一段計算（tasks 4.5）。
 *
 * 撞邊界者（`clamped !== "none"`）只有**自身寫回值**被夾：`rawDelta` 與 clamp 前的理論
 * 賽後分數仍完整依公式算出，不回頭影響對手的計算（PRD 6.4.6；tasks 6.3）。
 */
function computePlayerChange(player: Player, sMinusE: number): RatingChange {
	const kEff = effectiveK(player.gamesPlayed);
	const rawDelta = kEff * sMinusE;
	const theoreticalAfter = roundRating(player.rating + rawDelta);
	const { after, clamped } = clampRating(theoreticalAfter);
	return {
		playerId: player.id,
		before: player.rating,
		after,
		// after 與 before 皆已是兩位小數的乾淨值，兩者之差在數學上必為 0.01 的整數倍；
		// IEEE754 減法仍可能殘留浮點雜訊（例如 5.08 − 5.0 = 0.07999999999999996 而非
		// 乾淨的 0.08）。套用 roundRating 只是清除雜訊、不改變意圖數值，讓 §7 零和斷言的
		// 0.01 容差建立在乾淨數字上，也讓消費端直接顯示 delta 時不會看到浮點尾數。
		delta: roundRating(after - player.rating),
		rawDelta,
		clamped,
	};
}

/**
 * 計算一支隊伍的平均分數（`sum / 人數`）。單打是「隊伍人數為 1」的特例——此時平均就是
 * 該員自己的分數，因此單打與雙打可共用同一段 `updateRatings` 邏輯（tasks 5.4）。
 * SHALL NOT 改回傳總和：總和會讓分差隨隊伍人數放大，脫離 `D = 3.0` 的校準（tasks 5.2）。
 */
function teamAverageRating(team: readonly Player[]): number {
	const sum = team.reduce((total, player) => total + player.rating, 0);
	return sum / team.length;
}

/**
 * 賽後更新（`prd.md` 6.4.1／6.4.4）：`Ra' = Ra + K_eff × (S - E)`。
 * `E` 一律取兩隊「平均分數」（單打時隊伍人數為 1，平均即該員自己的分數）；同隊球員共用
 * 同一個 `(S − E)`，但各自套用自己的 `K_eff`——出場次數不同的隊友，變動幅度因此不同
 * （design Decision 1；tasks 5.3）。`after` 經 `roundRating` 取兩位小數並 clamp 於上下限，
 * `delta` 在 round／clamp 之後計算，`rawDelta` 保留 clamp 前的完整精度（design Decision 5）。
 */
export function updateRatings(input: RatingUpdateInput): readonly RatingChange[] {
	const winnerAverage = teamAverageRating(input.winners);
	const loserAverage = teamAverageRating(input.losers);
	const winnerExpected = expectedScore(winnerAverage, loserAverage);

	const winnerChanges = input.winners.map((player) => computePlayerChange(player, 1 - winnerExpected));
	const loserChanges = input.losers.map((player) => computePlayerChange(player, winnerExpected - 1));

	return [...winnerChanges, ...loserChanges];
}
