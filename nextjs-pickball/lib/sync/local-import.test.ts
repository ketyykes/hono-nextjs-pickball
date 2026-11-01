import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import {
	IMPORT_SEGMENT_LIMIT_BYTES,
	LocalImportRequestSchema,
	checkImportLimits,
	serializeImportSegments,
	utf8ByteLength,
} from "@pickball/core/api/import";
import { MAX_PLAYERS_PER_IMPORT } from "@pickball/core/api/players";
import type { LocalImportRequest } from "@pickball/core/api/import";
import { createInitialState, scoreboardReducer } from "@pickball/core/scoreboard/reducer";
import { BackupSchema } from "@pickball/core/matchmaker/transfer-types";
import type { Player } from "@pickball/core/matchmaker/types";
import type { Round, RoundMatch } from "@pickball/core/matchmaker/round-types";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type { ScoreboardState, Team } from "@pickball/core/scoreboard/types";
import { HISTORY_STORAGE_KEY, ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY } from "../matchmaker/storage-keys";
import { MATCH_SLOTS_KEY, STORAGE_KEY as SCOREBOARD_CURRENT_KEY } from "../scoreboard/storage-keys";
import {
	backupToImportRequest,
	buildLocalImportPayload,
	hasImportableLocalData,
	importLocalData,
} from "./local-import";

const ALL_KEYS = [
	ROSTER_STORAGE_KEY,
	ROUND_STORAGE_KEY,
	HISTORY_STORAGE_KEY,
	MATCH_SLOTS_KEY,
	SCOREBOARD_CURRENT_KEY,
] as const;

const LIMIT_BYTES = IMPORT_SEGMENT_LIMIT_BYTES;

function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "Alice",
		gender: "female",
		colorFrom: "#ff0000",
		colorTo: "#00ff00",
		rating: 5,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-16T00:00:00.000Z",
		...overrides,
	};
}

function makeRoundMatch(overrides: Partial<RoundMatch> = {}): RoundMatch {
	return {
		id: "m1",
		courtNumber: 1,
		format: "singles",
		teams: [
			{ playerIds: ["p1"], rating: 5 },
			{ playerIds: ["p2"], rating: 6 },
		],
		status: "pending",
		scores: null,
		winner: null,
		completedAt: null,
		playerRatings: [
			{ playerId: "p1", before: 5, after: null },
			{ playerId: "p2", before: 6, after: null },
		],
		...overrides,
	};
}

function makeCompletedMatch(id: string, courtNumber: number): RoundMatch {
	return makeRoundMatch({
		id,
		courtNumber,
		status: "completed",
		scores: { teamA: 11, teamB: 7 },
		winner: "teamA",
		completedAt: "2026-08-16T01:00:00.000Z",
		playerRatings: [
			{ playerId: "p1", before: 5, after: 5.2 },
			{ playerId: "p2", before: 6, after: 5.8 },
		],
	});
}

function makeRound(matches: RoundMatch[]): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-16T00:00:00.000Z",
		format: "singles",
		courtCount: matches.length,
		targetScore: 11,
		matches,
		restingPlayerIds: [],
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		timer: null,
	};
}

/**
 * 每個欄位都不是 makePlayer 的預設值、id 不依字典序且夾一位停用者的名單：
 * 只用預設值 fixture 時，「原樣送出」與「改寫成預設值、篩選或排序」看起來一模一樣。
 */
const distinctFieldPlayers: Player[] = [
	makePlayer({
		id: "p8",
		name: "Hana",
		gender: "male",
		colorFrom: "#123456",
		colorTo: "#abcdef",
		rating: 6.5,
		restCount: 3,
		gamesPlayed: 7,
		createdAt: "2026-09-01T08:30:00.000Z",
	}),
	makePlayer({
		id: "p3",
		name: "Chen",
		gender: "other",
		colorFrom: "#0a0b0c",
		colorTo: "#fedcba",
		rating: 2.5,
		restCount: 1,
		gamesPlayed: 4,
		isActive: false,
		createdAt: "2026-09-02T09:15:00.000Z",
	}),
	makePlayer({
		id: "p6",
		name: "Fay",
		gender: "male",
		colorFrom: "#13579b",
		colorTo: "#2468ac",
		rating: 7,
		restCount: 2,
		gamesPlayed: 9,
		createdAt: "2026-09-03T10:45:00.000Z",
	}),
];

function makeHistoryEntry(matchId: string, scoreA = 11, name = "Alice"): MatchHistoryEntry {
	return {
		format: "singles",
		matchId,
		courtNumber: 1,
		playedAt: "2026-08-16T01:00:00.000Z",
		teamA: { rating: 5, players: [{ id: "p1", name, ratingBefore: 5, ratingAfter: 5.2 }] },
		teamB: { rating: 4, players: [{ id: "p2", name: "Bob", ratingBefore: 4, ratingAfter: 3.8 }] },
		scoreA,
		scoreB: 7,
		winner: "teamA",
	};
}

/**
 * 與 makeHistoryEntry 的單打紀錄在單雙打、勝方、scoreB、teamA 球員上全都不同的雙打紀錄。
 * 帶 doublesComposition，reader 才不會把它當損毀資料丟掉。
 */
function makeDoublesHistoryEntry(matchId: string): MatchHistoryEntry {
	return {
		format: "doubles",
		doublesComposition: "mixed",
		matchId,
		courtNumber: 2,
		playedAt: "2026-08-20T05:00:00.000Z",
		teamA: {
			rating: 5,
			players: [
				{ id: "p7", name: "Gina", ratingBefore: 5, ratingAfter: 4.8 },
				{ id: "p2", name: "Bob", ratingBefore: 5, ratingAfter: 4.8 },
			],
		},
		teamB: {
			rating: 6,
			players: [
				{ id: "p5", name: "Eve", ratingBefore: 6, ratingAfter: 6.2 },
				{ id: "p1", name: "Alice", ratingBefore: 6, ratingAfter: 6.2 },
			],
		},
		scoreA: 8,
		scoreB: 11,
		winner: "teamB",
	};
}

/** 以 reducer 實際打到分出勝負：history、比分與勝方彼此一致，而不是手填出來的形狀。 */
function playUntilFinished(initial: ScoreboardState, opening: Team[], closer: Team): ScoreboardState {
	let state = initial;
	for (const winner of opening) {
		state = scoreboardReducer(state, { type: "RALLY_WON", winner });
	}
	for (let guard = 0; state.status !== "finished" && guard < 200; guard++) {
		state = scoreboardReducer(state, { type: "RALLY_WON", winner: closer });
	}
	return state;
}

/** 分槽的 state；scores 各場不同，讓「讀錯槽」在比對時看得出來。 */
function makeSlot(matchId: string | null, usScore: number): ScoreboardState {
	const base = createInitialState({ targetScore: 15 });
	return { ...base, matchId, scores: { us: usScore, them: 1 } };
}

function seedRoster(players: Player[]) {
	localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players }));
}
function seedRound(round: Round | null) {
	localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 1, round }));
}
function seedHistory(entries: MatchHistoryEntry[]) {
	localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
}
function seedSlots(slots: Record<string, ScoreboardState>) {
	localStorage.setItem(MATCH_SLOTS_KEY, JSON.stringify(slots));
}
function seedCurrent(state: ScoreboardState) {
	localStorage.setItem(SCOREBOARD_CURRENT_KEY, JSON.stringify(state));
}

function snapshotKeys(): Record<string, string | null> {
	return Object.fromEntries(ALL_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

/** 五個 key 都有、且無損毀資料的完整 seed（回合含一個進行中場次，分槽才會被讀取）。 */
function seedFullLocalData() {
	seedRoster([makePlayer(), makePlayer({ id: "p2", name: "Bob" })]);
	seedRound(makeRound([makeRoundMatch()]));
	seedHistory([makeHistoryEntry("h1")]);
	seedSlots({ m1: makeSlot("m1", 3) });
	seedCurrent(makeSlot(null, 5));
}

/** 判定為空、但本機確實有 key 的兩種 seed：用來確認空資料路徑同樣不清除或改寫本機。 */
const emptyLikeSeeds: Array<[string, () => void]> = [
	[
		"空容器",
		() => {
			seedRoster([]);
			seedRound(null);
			seedHistory([]);
		},
	],
	["孤兒分槽", () => seedSlots({ m6: makeSlot("m6", 14) })],
];

const utf8Length = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("local-import", () => {
	it("buildLocalImportPayload 讀取本機五個 key 並略過孤兒分槽與重複歷史", () => {
		const players = [makePlayer(), makePlayer({ id: "p2", name: "Bob" }), makePlayer({ id: "p3", name: "Cara" })];
		const round = makeRound([makeRoundMatch({ id: "m1" }), makeCompletedMatch("m2", 2)]);
		// 第三筆與第一筆 matchId 相同但比分不同：保留第一筆、略過後者
		const firstH1 = makeHistoryEntry("h1", 11);
		const secondH2 = makeHistoryEntry("h2", 9);
		const duplicateH1 = makeHistoryEntry("h1", 4);
		const m1Slot = makeSlot("m1", 3);
		const current = makeSlot(null, 5);
		seedRoster(players);
		seedRound(round);
		seedHistory([firstH1, secondH2, duplicateH1]);
		seedSlots({ m1: m1Slot, m2: makeSlot("m2", 8), m9: makeSlot("m9", 9) });
		seedCurrent(current);
		const before = snapshotKeys();

		const result = buildLocalImportPayload();

		expect(result.payload.version).toBe(1);
		expect(result.payload.players).toEqual(players);
		expect(result.payload.currentRound).toEqual(round);
		expect(result.payload.history).toEqual([firstH1, secondH2]);
		expect(result.payload.scoreboard.matches).toEqual([m1Slot]);
		expect(result.payload.scoreboard.current).toEqual(current);
		expect(result.summary).toEqual({
			players: 3,
			round: true,
			slots: 1,
			history: 2,
			scoreboardCurrent: true,
			duplicateHistorySkipped: 1,
		});
		expect(result.isEmpty).toBe(false);
		expect(result.oversize).toBe(false);
		// 呼叫前後逐字相同（seed 不含損毀資料）
		expect(snapshotKeys()).toEqual(before);
		expect(LocalImportRequestSchema.safeParse(result.payload).success).toBe(true);

		// 進行中（scoring）也算未完成；分槽的 matchId 以場次 id 為準，不信任 state 內的值；
		// 未完成但沒有分槽的場次（m4）不產生分槽
		seedRound(
			makeRound([
				makeRoundMatch({ id: "m1" }),
				makeRoundMatch({ id: "m3", status: "scoring" }),
				makeCompletedMatch("m2", 2),
				makeRoundMatch({ id: "m4" }),
			]),
		);
		seedSlots({ m1: makeSlot(null, 3), m2: makeSlot("m2", 8), m3: makeSlot("m3", 6), m9: makeSlot("m9", 9) });

		const second = buildLocalImportPayload();

		expect(second.payload.scoreboard.matches.map((slot) => slot.matchId)).toEqual(["m1", "m3"]);
		expect(second.payload.scoreboard.matches.map((slot) => slot.scores.us)).toEqual([3, 6]);
		expect(second.summary.slots).toBe(2);

		// 場地順序任意：已完成場次與無分槽場次排在有分槽場次之前，後面的分槽也不能遺失
		seedRound(
			makeRound([
				makeCompletedMatch("m2", 2),
				makeRoundMatch({ id: "m5", courtNumber: 3 }),
				makeRoundMatch({ id: "m1" }),
				makeRoundMatch({ id: "m3", status: "scoring" }),
			]),
		);
		seedSlots({ m1: makeSlot("m1", 3), m3: makeSlot("m3", 6) });

		const third = buildLocalImportPayload();

		expect(third.payload.scoreboard.matches.map((slot) => slot.matchId)).toEqual(["m1", "m3"]);
		expect(third.summary.slots).toBe(2);

		// 去重鍵只有 matchId：同 matchId 但 playedAt 等欄位不同的紀錄仍是重複（送到後端會因主鍵重複回 400）；
		// 多筆重複要逐筆計數，且保留各 matchId 的第一筆、不改原順序。
		// 唯一筆數（4）與略過筆數（3）刻意不同，避免兩者互相頂替而不被察覺
		const firstH5 = makeHistoryEntry("h5", 11);
		const h6 = makeHistoryEntry("h6", 10);
		const laterH5 = { ...makeHistoryEntry("h5", 3, "Dora"), courtNumber: 2, playedAt: "2026-08-17T02:00:00.000Z" };
		const h7 = makeHistoryEntry("h7", 8);
		const thirdH5 = { ...makeHistoryEntry("h5", 6), playedAt: "2026-08-18T03:00:00.000Z" };
		const laterH7 = { ...makeHistoryEntry("h7", 2), playedAt: "2026-08-19T04:00:00.000Z" };
		const h8 = makeHistoryEntry("h8", 12);
		seedHistory([firstH5, h6, laterH5, h7, thirdH5, laterH7, h8]);

		const fourth = buildLocalImportPayload();

		expect(fourth.payload.history).toEqual([firstH5, h6, h7, h8]);
		expect(fourth.summary.history).toBe(4);
		expect(fourth.summary.duplicateHistorySkipped).toBe(3);

		// 名單原樣送出：後端的 sort_order 取自陣列索引，重排會改變參賽者頁的順序；
		// 停用者仍是名單成員，濾掉會讓匯入後名單少人。id 刻意不依字典序排列、停用者夾在中間
		const unorderedPlayers = [
			makePlayer({ id: "p7", name: "Gina" }),
			makePlayer({ id: "p2", name: "Bob", isActive: false }),
			makePlayer({ id: "p5", name: "Eve" }),
			makePlayer({ id: "p1", name: "Alice", isActive: false }),
		];
		seedRoster(unorderedPlayers);
		// 歷史不分單打雙打都要送出：前面的歷史 seed 全是單打，看不出依 format 篩選；
		// 雙打這筆帶 doublesComposition（reader 才不會把它當損毀資料丟掉）且由 teamB 勝
		const doublesH11: MatchHistoryEntry = {
			format: "doubles",
			doublesComposition: "mixed",
			matchId: "h11",
			courtNumber: 2,
			playedAt: "2026-08-20T05:00:00.000Z",
			teamA: {
				rating: 5,
				players: [
					{ id: "p7", name: "Gina", ratingBefore: 5, ratingAfter: 4.8 },
					{ id: "p2", name: "Bob", ratingBefore: 5, ratingAfter: 4.8 },
				],
			},
			teamB: {
				rating: 6,
				players: [
					{ id: "p5", name: "Eve", ratingBefore: 6, ratingAfter: 6.2 },
					{ id: "p1", name: "Alice", ratingBefore: 6, ratingAfter: 6.2 },
				],
			},
			scoreA: 8,
			scoreB: 11,
			winner: "teamB",
		};
		const singlesH10 = makeHistoryEntry("h10", 11);
		const singlesH12 = makeHistoryEntry("h12", 9);
		seedHistory([singlesH10, doublesH11, singlesH12]);
		const beforeFifth = snapshotKeys();

		const fifth = buildLocalImportPayload();

		expect(fifth.payload.players).toEqual(unorderedPlayers);
		expect(fifth.summary.players).toBe(4);
		expect(fifth.payload.history).toEqual([singlesH10, doublesH11, singlesH12]);
		expect(fifth.summary.history).toBe(3);
		// seed 全數合法：reader 沒有降級或回寫，上面的斷言才是在驗證匯入內容而非 reader 的清理
		expect(snapshotKeys()).toEqual(beforeFifth);
		expect(LocalImportRequestSchema.safeParse(fifth.payload).success).toBe(true);

		// 分槽與獨立計分板原樣送出：已打完但尚未送出比分（finished）與剛建立（0:0）的計分板都屬於未完成場次，
		// 濾掉或改寫狀態、勝方、rally 紀錄，匯入後的計分板就與本機不同。前面的計分板 seed 全是
		// setup 狀態、沒有 rally 紀錄的非零比分，看不出這類篩選或改寫
		const finishedM1 = playUntilFinished(
			createInitialState({ mode: "singles", matchId: "m1", courtNumber: 1 }),
			["us", "them", "them", "us"],
			"us",
		);
		const freshM3 = createInitialState({ mode: "singles", matchId: "m3", courtNumber: 2 });
		const finishedCurrent = playUntilFinished(
			createInitialState({ mode: "doubles", firstServer: "them", targetScore: 15 }),
			["us", "them", "us", "us"],
			"them",
		);
		expect(finishedM1).toMatchObject({ status: "finished", winner: "us" });
		expect(finishedM1.history.length).toBeGreaterThan(0);
		expect(finishedCurrent).toMatchObject({ status: "finished", winner: "them" });
		expect(finishedCurrent.history.length).toBeGreaterThan(0);
		seedRoster(distinctFieldPlayers);
		seedRound(
			makeRound([makeRoundMatch({ id: "m1" }), makeRoundMatch({ id: "m3", courtNumber: 2, status: "scoring" })]),
		);
		seedSlots({ m1: finishedM1, m3: freshM3 });
		seedCurrent(finishedCurrent);
		// 歷史依本機的追加順序送出（後端依陣列順序插入，同時間的紀錄才維持原順序），matchId 刻意不依字典序；
		// 重複的那筆與第一筆只有 matchId 相同，去重鍵若混入其他欄位就會把它當成另一筆送出
		const orderH30 = makeHistoryEntry("h30", 11);
		const orderH10 = makeHistoryEntry("h10", 6);
		const orderH20 = makeHistoryEntry("h20", 9);
		seedHistory([orderH30, orderH10, orderH20, makeDoublesHistoryEntry("h30")]);
		const beforeSixth = snapshotKeys();

		const sixth = buildLocalImportPayload();

		expect(sixth.payload.players).toEqual(distinctFieldPlayers);
		expect(sixth.payload.scoreboard.matches).toEqual([finishedM1, freshM3]);
		expect(sixth.payload.scoreboard.current).toEqual(finishedCurrent);
		expect(sixth.payload.history).toEqual([orderH30, orderH10, orderH20]);
		expect(sixth.summary).toEqual({
			players: 3,
			round: true,
			slots: 2,
			history: 3,
			scoreboardCurrent: true,
			duplicateHistorySkipped: 1,
		});
		expect(snapshotKeys()).toEqual(beforeSixth);
		expect(LocalImportRequestSchema.safeParse(sixth.payload).success).toBe(true);

		// 剛建立、尚未開打（0:0）的獨立計分板也是本機資料
		const freshCurrent = createInitialState({ mode: "singles" });
		seedCurrent(freshCurrent);
		const beforeSeventh = snapshotKeys();

		const seventh = buildLocalImportPayload();

		expect(seventh.payload.scoreboard.current).toEqual(freshCurrent);
		expect(seventh.summary.scoreboardCurrent).toBe(true);
		expect(snapshotKeys()).toEqual(beforeSeventh);
		expect(LocalImportRequestSchema.safeParse(seventh.payload).success).toBe(true);
	});

	it("本機沒有資料時回報 isEmpty，任一段超過上限時回報 oversize", () => {
		const empty = buildLocalImportPayload();
		expect(empty.isEmpty).toBe(true);
		expect(empty.oversize).toBe(false);
		expect(empty.summary).toEqual({
			players: 0,
			round: false,
			slots: 0,
			history: 0,
			scoreboardCurrent: false,
			duplicateHistorySkipped: 0,
		});

		// 只有空容器的 key（元件掛載時 write effect 會寫出）不算有資料
		seedRoster([]);
		seedHistory([]);
		seedRound(null);
		expect(buildLocalImportPayload().isEmpty).toBe(true);

		// 孤兒分槽（沒有回合）不會被讀取，因此不算有資料
		localStorage.clear();
		seedSlots({ m9: makeSlot("m9", 9) });
		expect(buildLocalImportPayload().isEmpty).toBe(true);

		// summary 的 round 與 scoreboardCurrent 各自獨立：只有其中一項時不能被另一項帶動
		localStorage.clear();
		seedCurrent(makeSlot(null, 2));
		expect(buildLocalImportPayload().summary).toEqual({
			players: 0,
			round: false,
			slots: 0,
			history: 0,
			scoreboardCurrent: true,
			duplicateHistorySkipped: 0,
		});
		localStorage.clear();
		seedRound(makeRound([makeCompletedMatch("m2", 1)]));
		expect(buildLocalImportPayload().summary).toEqual({
			players: 0,
			round: true,
			slots: 0,
			history: 0,
			scoreboardCurrent: false,
			duplicateHistorySkipped: 0,
		});

		// 五段中任一段有資料即非空
		const nonEmptySeeds: Array<[string, () => void]> = [
			["名單", () => seedRoster([makePlayer()])],
			["回合", () => seedRound(makeRound([makeCompletedMatch("m2", 1)]))],
			["歷史", () => seedHistory([makeHistoryEntry("h1")])],
			["獨立計分板", () => seedCurrent(makeSlot(null, 2))],
		];
		for (const [label, seed] of nonEmptySeeds) {
			localStorage.clear();
			seed();
			expect(buildLocalImportPayload().isEmpty, `只有${label}`).toBe(false);
		}
		localStorage.clear();
		seedRound(makeRound([makeRoundMatch()]));
		seedSlots({ m1: makeSlot("m1", 3) });
		expect(buildLocalImportPayload().isEmpty).toBe(false);

		// 三段各自以 UTF-8 位元組判定：恰為上限不算超過，多一位元組才算
		type Segment = "players" | "history" | "slots";
		const segmentSeeds: Record<Segment, (pad: string) => void> = {
			players: (pad) => seedRoster([makePlayer({ name: pad })]),
			history: (pad) => seedHistory([makeHistoryEntry("h1", 11, pad)]),
			slots: (pad) => {
				seedRound(makeRound([makeRoundMatch()]));
				const slot = makeSlot("m1", 3);
				seedSlots({
					m1: { ...slot, teamPlayers: { us: [{ name: pad, colorFrom: "#fff", colorTo: "#000", foreground: "#111" }], them: [{ name: "B", colorFrom: "#fff", colorTo: "#000", foreground: "#111" }] } },
				});
			},
		};
		const measureSegment = (segment: Segment): number => {
			const { payload } = buildLocalImportPayload();
			return utf8ByteLength(serializeImportSegments(payload)[segment]);
		};
		for (const segment of Object.keys(segmentSeeds) as Segment[]) {
			localStorage.clear();
			segmentSeeds[segment]("x");
			const baseBytes = measureSegment(segment);

			localStorage.clear();
			segmentSeeds[segment]("x".repeat(1 + LIMIT_BYTES - baseBytes));
			const atLimit = buildLocalImportPayload();
			expect(measureSegment(segment), `${segment} 恰為上限`).toBe(LIMIT_BYTES);
			expect(atLimit.oversize, `${segment} 恰為上限`).toBe(false);

			localStorage.clear();
			segmentSeeds[segment]("x".repeat(2 + LIMIT_BYTES - baseBytes));
			expect(buildLocalImportPayload().oversize, `${segment} 超過上限一位元組`).toBe(true);

			// 多位元組字元：字元數遠低於上限，但 UTF-8 位元組數超過
			localStorage.clear();
			segmentSeeds[segment]("中".repeat(700_000));
			expect(buildLocalImportPayload().oversize, `${segment} 多位元組字元`).toBe(true);
		}

		// 單段都沒超過時，各段加總超過也不算 oversize（D1 上限是每個參數各自計算）
		localStorage.clear();
		segmentSeeds.players("x".repeat(1_200_000));
		segmentSeeds.history("x".repeat(1_200_000));
		const combined = buildLocalImportPayload();
		expect(combined.oversize).toBe(false);

		// 使用者定案「保留本機資料」也涵蓋判定為空的情境：只有空容器或只有孤兒分槽時，
		// 組請求的過程同樣不得清除或改寫任何 key（有資料情境的快照比對不涵蓋這條路徑）
		for (const [label, seed] of emptyLikeSeeds) {
			localStorage.clear();
			seed();
			const beforeEmpty = snapshotKeys();
			expect(buildLocalImportPayload().isEmpty, `只有${label}`).toBe(true);
			expect(snapshotKeys(), `只有${label}`).toEqual(beforeEmpty);
		}

		// 上限量的是實際送出的歷史（去重後）：重複的那筆不會送到後端，不能讓它把可匯入的資料判成過大
		localStorage.clear();
		const hugeName = "x".repeat(1_000_000);
		const rawHistory = [makeHistoryEntry("h1", 11, hugeName), makeHistoryEntry("h1", 4, hugeName)];
		seedHistory(rawHistory);
		expect(utf8Length(rawHistory)).toBeGreaterThan(LIMIT_BYTES);
		const deduped = buildLocalImportPayload();
		expect(deduped.summary.duplicateHistorySkipped).toBe(1);
		expect(utf8Length(deduped.payload.history)).toBeLessThanOrEqual(LIMIT_BYTES);
		expect(deduped.oversize).toBe(false);

		// 名單的上限量的是整份名單：停用者同樣會送到後端，只量啟用者會漏判過大
		localStorage.clear();
		seedRoster([
			makePlayer({ id: "p1", name: "x".repeat(LIMIT_BYTES), isActive: false }),
			makePlayer({ id: "p2", name: "Bob" }),
		]);
		const beforeInactive = snapshotKeys();
		const inactiveOversize = buildLocalImportPayload();
		expect(inactiveOversize.payload.players).toHaveLength(2);
		expect(inactiveOversize.oversize).toBe(true);
		expect(snapshotKeys()).toEqual(beforeInactive);
	});

	it("oversize 以後端 json_each 參數的形狀判定，與後端對同一份請求的判定一致", () => {
		// 原始歷史陣列不超過上限，但後端參數每筆另含 matchId 與 playedAt，包裝後超過
		const idOf = (index: number) => `h${String(index).padStart(6, "0")}`;
		const entryBytes = utf8Length(makeHistoryEntry(idOf(0)));
		const count = Math.floor((LIMIT_BYTES - 1) / (entryBytes + 1));
		seedHistory(Array.from({ length: count }, (_, index) => makeHistoryEntry(idOf(index))));
		const wrapped = buildLocalImportPayload();
		const rawBytes = utf8Length(wrapped.payload.history);
		const wrappedBytes = utf8ByteLength(serializeImportSegments(wrapped.payload).history);
		expect(rawBytes).toBeLessThanOrEqual(LIMIT_BYTES);
		expect(wrappedBytes).toBeGreaterThan(LIMIT_BYTES);
		expect(wrapped.oversize).toBe(true);

		// 歷史段恰為上限與多一位元組：前端判定等於後端在 validator 之後的判定
		const historySegmentBytes = (pad: string): number => {
			localStorage.clear();
			seedHistory([makeHistoryEntry("h1", 11, pad)]);
			return utf8ByteLength(serializeImportSegments(buildLocalImportPayload().payload).history);
		};
		const baseBytes = historySegmentBytes("x");
		for (const [extra, expected] of [
			[1, false],
			[2, true],
		] as const) {
			historySegmentBytes("x".repeat(extra + LIMIT_BYTES - baseBytes));
			const result = buildLocalImportPayload();
			const backendVerdict = !checkImportLimits(LocalImportRequestSchema.parse(result.payload)).ok;
			expect(result.oversize, `歷史段 +${extra - 1}`).toBe(expected);
			expect(result.oversize, `歷史段 +${extra - 1} 與後端判定一致`).toBe(backendVerdict);
		}
	});

	it("本機參賽者超過 500 位時回報 oversize", () => {
		const makePlayers = (count: number) =>
			Array.from({ length: count }, (_, index) => makePlayer({ id: `p${index}`, name: `P${index}` }));

		seedRoster(makePlayers(MAX_PLAYERS_PER_IMPORT));
		const atLimit = buildLocalImportPayload();
		expect(atLimit.payload.players).toHaveLength(MAX_PLAYERS_PER_IMPORT);
		expect(atLimit.oversize).toBe(false);
		expect(hasImportableLocalData()).toBe(true);

		localStorage.clear();
		seedRoster(makePlayers(MAX_PLAYERS_PER_IMPORT + 1));
		const overLimit = buildLocalImportPayload();
		expect(overLimit.payload.players).toHaveLength(MAX_PLAYERS_PER_IMPORT + 1);
		expect(overLimit.oversize).toBe(true);
		expect(hasImportableLocalData()).toBe(true);
	});

	it("importLocalData 在 413 時回報資料過大且不改動本機", async () => {
		seedFullLocalData();
		const { payload } = buildLocalImportPayload();
		const before = snapshotKeys();
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);
		const json = (status: number, body: unknown) =>
			new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

		fetchMock.mockResolvedValueOnce(json(413, { error: "PAYLOAD_TOO_LARGE" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "too-large" });

		// 只有 413 是資料過大：低於與高於 413 的其他 4xx 都維持 failed
		for (const status of [400, 422, 429]) {
			fetchMock.mockResolvedValueOnce(json(status, { error: "REJECTED" }));
			expect(await importLocalData("user-a", payload), `狀態碼 ${status}`).toEqual({ kind: "failed" });
		}

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(snapshotKeys()).toEqual(before);
	});

	it("importLocalData 依回應分類為已匯入、雲端已有資料、未授權或失敗且不改動本機", async () => {
		seedFullLocalData();
		const { payload } = buildLocalImportPayload();
		const before = snapshotKeys();
		const importedBody = {
			imported: { players: 2, round: true, slots: 1, history: 1, scoreboardCurrent: "imported" },
		};
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);

		const respond = (response: Response) => fetchMock.mockResolvedValueOnce(response);
		const json = (status: number, body: unknown) =>
			new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

		respond(json(200, importedBody));
		expect(await importLocalData("user-a", payload)).toEqual({
			kind: "imported",
			imported: importedBody.imported,
		});

		respond(json(409, { error: "VERSION_CONFLICT" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "cloud-not-empty" });

		respond(json(401, { error: "ACCOUNT_MISMATCH" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "unauthorized" });

		respond(json(500, { error: "INTERNAL" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });

		// 其他 4xx（rejected）、不符 schema 的 200、無內容的 204、網路錯誤一律視為失敗
		respond(json(400, { error: "INVALID_BODY" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });
		respond(json(200, { imported: { players: "many" } }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });
		respond(new Response(null, { status: 204 }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });
		fetchMock.mockRejectedValueOnce(new TypeError("network"));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });

		// 每次呼叫恰好一個請求（不自動重試）
		expect(fetchMock).toHaveBeenCalledTimes(8);
		for (const call of fetchMock.mock.calls) {
			const [path, init] = call;
			expect(path).toBe("/api/import");
			expect(init?.method).toBe("POST");
			const headers = init?.headers as Record<string, string>;
			expect(headers[EXPECTED_USER_ID_HEADER]).toBe("user-a");
			expect(JSON.parse(init?.body as string)).toEqual(JSON.parse(JSON.stringify(payload)));
		}

		// 預期帳號只來自第一參數，不是固定值
		respond(json(200, importedBody));
		await importLocalData("user-b", payload);
		const lastHeaders = fetchMock.mock.calls[8][1]?.headers as Record<string, string>;
		expect(lastHeaders[EXPECTED_USER_ID_HEADER]).toBe("user-b");

		// 使用者定案：任何結果都保留本機資料，五個 key 逐字不變
		expect(snapshotKeys()).toEqual(before);

		// 送出的 body 只來自第二參數：傳入與本機內容不同的請求時，不得改由本機重新組出；
		// 回應的筆數原樣帶回，不得由請求內容推算（兩次回應的各欄刻意與請求及本機都不一致，
		// 布林欄位則兩個方向各出現一次）
		const distinctPayload: LocalImportRequest = {
			version: 1,
			players: [makePlayer({ id: "p9", name: "Ivy" })],
			currentRound: null,
			history: [makeHistoryEntry("h9", 1)],
			scoreboard: { current: null, matches: [] },
		};
		const unrelatedCountsA = {
			imported: { players: 7, round: true, slots: 4, history: 0, scoreboardCurrent: "skipped" },
		};
		respond(json(200, unrelatedCountsA));
		expect(await importLocalData("user-a", distinctPayload)).toEqual({
			kind: "imported",
			imported: unrelatedCountsA.imported,
		});
		expect(JSON.parse(fetchMock.mock.calls[9][1]?.body as string)).toEqual(
			JSON.parse(JSON.stringify(distinctPayload)),
		);

		const unrelatedCountsB = {
			imported: { players: 0, round: false, slots: 0, history: 5, scoreboardCurrent: "none" },
		};
		respond(json(200, unrelatedCountsB));
		expect(await importLocalData("user-a", payload)).toEqual({
			kind: "imported",
			imported: unrelatedCountsB.imported,
		});
		expect(fetchMock).toHaveBeenCalledTimes(11);

		// body 的名單原樣送出：停用者也是名單成員，前面各次請求的名單全是啟用者，看不出篩選
		const requestWithInactive: LocalImportRequest = {
			version: 1,
			players: distinctFieldPlayers,
			currentRound: null,
			history: [],
			scoreboard: { current: null, matches: [] },
		};
		expect(LocalImportRequestSchema.safeParse(requestWithInactive).success).toBe(true);
		respond(json(200, importedBody));
		await importLocalData("user-a", requestWithInactive);
		expect(JSON.parse(fetchMock.mock.calls[11][1]?.body as string)).toEqual(
			JSON.parse(JSON.stringify(requestWithInactive)),
		);

		// 前面的快照比對時送出的請求都等於本機內容，寫回也看不出差異；
		// 與本機不同的請求（JSON 備份匯入的情境）送出後再比一次，才能抓到把請求寫回本機
		expect(snapshotKeys()).toEqual(before);
	});

	it("JSON 備份轉為匯入請求時計分板為空", () => {
		const backup = BackupSchema.parse({
			version: 1,
			players: [makePlayer(), makePlayer({ id: "p2", name: "Bob" })],
			currentRound: makeRound([makeRoundMatch()]),
			history: [makeHistoryEntry("h1"), makeHistoryEntry("h2")],
		});

		// 本機有完整資料時，備份的計分板仍須為空：不得改讀本機
		seedFullLocalData();

		const request = backupToImportRequest(backup);

		expect(request.version).toBe(1);
		expect(request.players).toEqual(backup.players);
		expect(request.currentRound).toEqual(backup.currentRound);
		expect(request.history).toEqual(backup.history);
		expect(request.scoreboard).toEqual({ current: null, matches: [] });
		expect(LocalImportRequestSchema.safeParse(request).success).toBe(true);

		// 完整 seed 的名單與回合恰與備份逐欄相同，無法分辨「取自備份」與「改讀本機」；
		// 換成逐欄都與備份不同的本機資料（分槽對應本機回合的 m7，讓改讀本機分槽時一定非空）
		localStorage.clear();
		seedRoster([makePlayer({ id: "p9", name: "Ivy" })]);
		seedRound(makeRound([makeRoundMatch({ id: "m7", courtNumber: 4 })]));
		seedSlots({ m7: makeSlot("m7", 12) });
		seedCurrent(makeSlot(null, 13));
		seedHistory([makeHistoryEntry("h9", 2)]);

		const requestWithDistinctLocal = backupToImportRequest(backup);

		expect(requestWithDistinctLocal.players).toEqual(backup.players);
		expect(requestWithDistinctLocal.currentRound).toEqual(backup.currentRound);
		expect(requestWithDistinctLocal.history).toEqual(backup.history);
		expect(requestWithDistinctLocal.scoreboard).toEqual({ current: null, matches: [] });

		// 備份原樣轉換：上方備份恰為 fixture 預設值（全啟用、id 已排序、累計欄位為 0、只有單打、
		// 回合沒有已完成場次也不計時），看不出篩選、排序或改寫。換成停用者夾在中間、各欄非預設的名單，
		// 雙打歷史，以及含已完成場次且正在計時的回合
		const timer = { durationMinutes: 15, startedAt: "2026-08-16T00:05:00.000Z" } as const;
		const distinctBackup = BackupSchema.parse({
			version: 1,
			players: distinctFieldPlayers,
			currentRound: {
				...makeRound([makeCompletedMatch("m2", 1), makeRoundMatch({ id: "m1", courtNumber: 2 })]),
				timer,
			},
			history: [makeHistoryEntry("h4", 11), makeDoublesHistoryEntry("h3")],
		});

		const distinctRequest = backupToImportRequest(distinctBackup);

		expect(distinctRequest.players).toEqual(distinctFieldPlayers);
		expect(distinctRequest.currentRound).toEqual(distinctBackup.currentRound);
		expect(distinctRequest.currentRound?.matches.map((match) => match.status)).toEqual(["completed", "pending"]);
		expect(distinctRequest.currentRound?.timer).toEqual(timer);
		expect(distinctRequest.history).toEqual(distinctBackup.history);
		expect(distinctRequest.history.map((entry) => entry.format)).toEqual(["singles", "doubles"]);
		expect(LocalImportRequestSchema.safeParse(distinctRequest).success).toBe(true);
	});

	it("hasImportableLocalData 只在任一 key 有資料時為 true", () => {
		expect(hasImportableLocalData()).toBe(false);

		// 只有空容器的 key（訪客開過頁面就會有）不算有可匯入的資料
		seedRoster([]);
		seedHistory([]);
		expect(hasImportableLocalData()).toBe(false);

		localStorage.clear();
		seedCurrent(makeSlot(null, 2));
		expect(hasImportableLocalData()).toBe(true);

		localStorage.clear();
		seedHistory([makeHistoryEntry("h1")]);
		expect(hasImportableLocalData()).toBe(true);

		localStorage.clear();
		seedRoster([makePlayer()]);
		expect(hasImportableLocalData()).toBe(true);

		localStorage.clear();
		seedRound(makeRound([makeRoundMatch()]));
		expect(hasImportableLocalData()).toBe(true);

		// 使用者定案：判斷過程不得清除或改寫任何本機 key
		localStorage.clear();
		seedFullLocalData();
		const before = snapshotKeys();
		expect(hasImportableLocalData()).toBe(true);
		expect(snapshotKeys()).toEqual(before);

		// 判定為沒有資料時同樣不得清除或改寫本機 key（上方快照只涵蓋有資料的情境）
		for (const [label, seed] of emptyLikeSeeds) {
			localStorage.clear();
			seed();
			const beforeEmpty = snapshotKeys();
			expect(hasImportableLocalData(), `只有${label}`).toBe(false);
			expect(snapshotKeys(), `只有${label}`).toEqual(beforeEmpty);
		}

		// 資料過大仍是「本機有資料」：參賽者頁照樣提示，把使用者帶到資料頁，
		// 由匯入區塊說明超過上限的處理方式；在這裡回 false 會讓使用者完全不知道有資料沒匯入
		localStorage.clear();
		seedHistory([makeHistoryEntry("h1", 11, "x".repeat(LIMIT_BYTES))]);
		expect(buildLocalImportPayload().oversize).toBe(true);
		expect(hasImportableLocalData()).toBe(true);
	});
});
