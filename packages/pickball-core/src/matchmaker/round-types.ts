import { z } from "zod";
import type { DoublesComposition, MatchFormat } from "./allocation-types";
import { MIN_COURT_COUNT, MAX_COURT_COUNT } from "./allocation-types";

// prd.md 6.1、5.6 都提到「進行中」的場次。狀態訂為三值列舉 pending｜scoring｜completed：
// 寫入路徑只會產生 pending 與 completed（場邊計分的進度存於計分板分槽），但未完成判定、
// 基準納入、重排排除、目標分數鎖定等讀取路徑都已一併處理 scoring。
// 預先納入 scoring 而非日後再擴值，與 restCount／gamesPlayed 提前納入 schema 的理由相同：
// 避免破壞性遷移。狀態列舉一旦擴值，所有使用者瀏覽器裡既有的 matchmaker:round:v1 都要
// 跨版本處理，而本機資料沒有遷移視窗，唯一補救辦法是清掉使用者進行中的回合。
export const MatchStatusSchema = z.enum(["pending", "scoring", "completed"]);

// 對戰方式：沿用 allocation-types.ts 的 MatchFormat。
const RoundFormatSchema: z.ZodType<MatchFormat> = z.enum([
	"singles",
	"doubles",
]);

// 對戰方式：沿用 allocation-types.ts 的 DoublesComposition。
const RoundDoublesCompositionSchema: z.ZodType<DoublesComposition> = z.enum([
	"mens",
	"womens",
	"mixed",
	"general",
]);

export const RoundTeamSchema = z.object({
	playerIds: z.array(z.string()),
	rating: z.number(),
});

// Round（matchmaker:round:v1）只存 playerIds 與該輪的 rating 快照，SHALL NOT 內嵌整個
// Player 物件——回合與名單同時活著，內嵌整個 Player 會在使用者於回合進行中改名、改分數、
// 切暫停時產生兩個互相矛盾的真相，UI 無從判斷該信哪一個。
// before 於建立回合時就填入（prd.md 6.1 明列「每輪需保存……賽前分數」），不是等送出比分
// 才抓——否則使用者在回合進行中手動改了某人的分數，賽前分數就會變成「改完之後的值」，
// 與當時實際發生的分差記錄不符。
// after 未完成時為 null：RoundMatch 一次帶齊 prd.md 6.1／6.5／8.2 列舉的全部欄位，
// 即使建立回合時有些欄位只會寫 null，理由同樣是避免破壞性遷移。
export const PlayerRatingSchema = z.object({
	playerId: z.string(),
	before: z.number(),
	after: z.number().nullable(),
});

export const RoundMatchSchema = z
	.object({
		id: z.string(),
		courtNumber: z.number().int().positive(),
		format: RoundFormatSchema,
		// doublesComposition 刻意維持 optional() 而非 allocation-types.ts 的 discriminated
		// union：(1) spec 沒有對應 Scenario／測試——改成 DU 是新增「單打 MUST 不帶／雙打
		// MUST 帶」的可觀察行為，依 TDD 硬規則需要先有紅燈測試；
		// (2) Match（in-memory）與 RoundMatch（persisted）的權衡不同：Match 只活在一次
		// 分配呼叫裡，DU 的編譯期保證零成本；RoundMatch 要從 LocalStorage 反序列化，DU
		// 在資料損壞時只吐 invalid_union、無法指出哪個欄位壞了，與「損壞降級要可診斷」的
		// 訴求相衝；(3) 呼叫端的實際消費形態是「就地更新單一場次」（matches.map(m =>
		// m.id === id ? { ...m, status: "completed", ... } : m)），對 DU 做 spread 更新
		// 在 TS 下會反覆需要收窄或斷言，與 playerRatings[].after「未完成時 null」的鬆散
		// 表達哲學一致。
		doublesComposition: RoundDoublesCompositionSchema.optional(),
		teams: z.tuple([RoundTeamSchema, RoundTeamSchema]),
		status: MatchStatusSchema,
		scores: z
			.object({
				teamA: z.number().int().nonnegative(),
				teamB: z.number().int().nonnegative(),
			})
			.nullable(),
		// "draw" 僅可能出現於計時回合：兩隊比分相同時計時回合允許判定平局，
		// 見 round-lifecycle 的「比分驗證」——非計時回合 SHALL NOT 產生 "draw"。
		winner: z.enum(["teamA", "teamB", "draw"]).nullable(),
		completedAt: z.iso.datetime().nullable(),
		playerRatings: z.array(PlayerRatingSchema),
	})
	.superRefine((data, ctx) => {
		// completed 場次必須帶齊 scores、winner、completedAt，且所有 playerRatings[].after
		// 必須為數字。用 superRefine 而非交由呼叫端自律：
		// 跨欄位一致性寫成 refinement 才擋得住「標成完成卻沒有比分」的損壞資料，而這種
		// 資料會從 LocalStorage 經同一個 schema 回讀。
		if (data.status === "completed") {
			if (data.scores === null) {
				ctx.addIssue({
					code: "custom",
					message: "completed 場次必須帶有 scores",
					path: ["scores"],
				});
			}
			if (data.winner === null) {
				ctx.addIssue({
					code: "custom",
					message: "completed 場次必須帶有 winner",
					path: ["winner"],
				});
			}
			if (data.completedAt === null) {
				ctx.addIssue({
					code: "custom",
					message: "completed 場次必須帶有 completedAt",
					path: ["completedAt"],
				});
			}
			for (const rating of data.playerRatings) {
				if (rating.after === null) {
					ctx.addIssue({
						code: "custom",
						message: "completed 場次的 playerRatings[].after 必須為數字",
						path: ["playerRatings"],
					});
					break;
				}
			}
		}
	});

// allocation-types.ts 的 SignatureIndex 三個欄位是 ReadonlySet<string>（Set 天然去重、
// O(1) 比對），該檔註解已明文「持久化時另以字串陣列表示，由第 3 段在讀取 LocalStorage
// 時轉換為 Set、寫回前轉換回陣列」——這裡就是那個「第 3 段」。Set 直接 JSON.stringify
// 會變成 {}，所以持久化格式必須是陣列。
export const SeenSignaturesSchema = z.object({
	teammateKeys: z.array(z.string()),
	opponentKeys: z.array(z.string()),
	fullMatchKeys: z.array(z.string()),
});

// lib/scoreboard/types.ts 已有 TargetScoreSchema（同為 11 | 15 | 21，但帶 .default(11)）。
// 不直接 import 的理由：.default(11) 是 scoreboard 為既有持久化資料的向後相容而加的
// （該檔註解明寫），回合的 targetScore 一律在建立時明確決定；若帶 default，一份
// targetScore 欄位損壞的回合資料會被靜默補成 11 而非被判為損壞——prd.md 6.3.1 說
// 這個值決定整輪所有場地的分制，靜默改值是使用者無從察覺的錯誤。
// 既有先例：allocation-types.ts 的 MatchFormat 與 scoreboard 的 Mode 同為
// "singles" | "doubles"，該檔註解明訂「分屬不同 capability、語意不同，不要合併」。
// 但值域必須一致（場邊計分會把回合的目標分數直接交給計分板），因此耦合放在測試層：
// round-types.test.ts 比對兩者的可接受值集合，值域漂移會轉紅，兩個 capability
// 的執行期程式碼則互不 import。
export const RoundTargetScoreSchema = z.union([
	z.literal(11),
	z.literal(15),
	z.literal(21),
]);

export type RoundTargetScore = z.infer<typeof RoundTargetScoreSchema>;

// 由 RoundTargetScoreSchema 的 union 選項推導，而非另外寫死一份 [11, 15, 21]——
// 否則有人日後在 union 加減字面量時，這裡不會有任何編譯錯誤或紅燈同步提醒。
export const TARGET_SCORE_OPTIONS: readonly RoundTargetScore[] =
	RoundTargetScoreSchema.options.flatMap((literal) => [...literal.values]);

// 預設目標分數（由本 capability 匯出，不由 UI 各自寫死）。satisfies RoundTargetScore
// 確保這裡的字面量不會脫離合法值域，同時仍保留字面量型別 11 而非收斂為 number。
export const DEFAULT_TARGET_SCORE = 11 satisfies RoundTargetScore;

// 計時長度僅接受 10 | 15 | 20 分鐘（prd.md 6.1／6.5 之外的每輪設定）。
// 與 RoundTargetScoreSchema 同樣定義為固定字面量 union，理由相同：值域一旦擴充，
// 依賴 ROUND_TIMER_DURATION_OPTIONS 的呼叫端要能被同步提醒，而不是各自寫死一份。
export const RoundTimerDurationMinutesSchema = z.union([
	z.literal(10),
	z.literal(15),
	z.literal(20),
]);

export type RoundTimerDurationMinutes = z.infer<
	typeof RoundTimerDurationMinutesSchema
>;

// 由 RoundTimerDurationMinutesSchema 的 union 選項推導，而非另外寫死一份 [10, 15, 20]——
// 理由同 TARGET_SCORE_OPTIONS：避免有人日後在 union 加減字面量時，這裡沒有任何編譯
// 錯誤或紅燈同步提醒。
export const ROUND_TIMER_DURATION_OPTIONS: readonly RoundTimerDurationMinutes[] =
	RoundTimerDurationMinutesSchema.options.flatMap((literal) => [
		...literal.values,
	]);

// 「本輪計時」物件：durationMinutes 決定倒數長度，startedAt 為 null 代表尚未按下
// 「開始計時」、一旦開始即寫入 ISO 字串。倒數與時間到的判定不放在 schema 這一層，
// 見 round-timer.ts 的純函式；schema 只描述資料形狀。
export const RoundTimerObjectSchema = z.object({
	durationMinutes: RoundTimerDurationMinutesSchema,
	startedAt: z.iso.datetime().nullable(),
});

// Round.timer 以 .nullable().default(null) 定義：null 代表「不計時」（預設值），
// 同時讓不含本欄位的既有 matchmaker:round:v1 資料（加入計時前寫入）在 safeParse 時
// 自動補上 null 而非被判為損壞——與 scoreboard capability 的「向後相容策略」及
// courtNumber 的處理是同一手法，因此 SHALL NOT 因本欄位而 bump storage key 版本。
export const RoundTimerSchema = RoundTimerObjectSchema.nullable().default(
	null,
);

export type RoundTimer = z.infer<typeof RoundTimerSchema>;

export const RoundSchema = z.object({
	roundNumber: z.number().int().positive(),
	createdAt: z.iso.datetime(),
	format: RoundFormatSchema,
	courtCount: z.number().int().min(MIN_COURT_COUNT).max(MAX_COURT_COUNT),
	targetScore: RoundTargetScoreSchema,
	matches: z.array(RoundMatchSchema),
	restingPlayerIds: z.array(z.string()),
	seenSignatures: SeenSignaturesSchema,
	timer: RoundTimerSchema,
});

export type MatchStatus = z.infer<typeof MatchStatusSchema>;
export type RoundTeam = z.infer<typeof RoundTeamSchema>;
export type PlayerRating = z.infer<typeof PlayerRatingSchema>;
export type RoundMatch = z.infer<typeof RoundMatchSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type SeenSignatures = z.infer<typeof SeenSignaturesSchema>;
