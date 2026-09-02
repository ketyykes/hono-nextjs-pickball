import { describe, it, expect } from "vitest";

import { buildExportScene, EXPORT_APP_NAME } from "./export-scene";
import { pickTextColor } from "./colors";
import type { Round, RoundMatch } from "./round-types";
import type { Player } from "./types";

/** 建立一份合法的測試用 Player，可透過 overrides 覆寫特定欄位。與 stage-layout.test.ts 同構，刻意不共用。 */
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "小明",
		gender: "male",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-15T00:00:00.000Z",
		...overrides,
	};
}

/** 建立一份合法的測試用 RoundMatch，可透過 overrides 覆寫特定欄位。與 round-types.test.ts 同構。 */
function makeRoundMatch(overrides: Partial<RoundMatch> = {}): RoundMatch {
	return {
		id: "match-1",
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

/** 建立一份合法的測試用 Round，可透過 overrides 覆寫特定欄位。 */
function makeRound(overrides: Partial<Round> = {}): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-16T00:00:00.000Z",
		format: "singles",
		courtCount: 1,
		targetScore: 11,
		matches: [],
		restingPlayerIds: [],
		seenSignatures: {
			teammateKeys: [],
			opponentKeys: [],
			fullMatchKeys: [],
		},
		...overrides,
	};
}

describe("buildExportScene", () => {
	it("匯出標題含 App 名稱、回合編號與對戰方式", () => {
		const round = makeRound({ roundNumber: 3, format: "doubles" });
		const players: Player[] = [];

		const scene = buildExportScene(round, players);

		expect(scene.title).toContain(EXPORT_APP_NAME);
		expect(scene.title).toContain("3");
		expect(scene.title).toContain("雙打");
	});

	it("每個場地含場地編號與該場全部球員格", () => {
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
			makePlayer({ id: "p3", name: "小美" }),
			makePlayer({ id: "p4", name: "小強" }),
			makePlayer({ id: "p5", name: "小英" }),
			makePlayer({ id: "p6", name: "小豪" }),
			makePlayer({ id: "p7", name: "小芳" }),
			makePlayer({ id: "p8", name: "小龍" }),
		];
		const round = makeRound({
			format: "doubles",
			matches: [
				makeRoundMatch({
					id: "match-1",
					courtNumber: 1,
					format: "doubles",
					teams: [
						{ playerIds: ["p1", "p2"], rating: 7 },
						{ playerIds: ["p3", "p4"], rating: 7 },
					],
				}),
				makeRoundMatch({
					id: "match-2",
					courtNumber: 2,
					format: "doubles",
					teams: [
						{ playerIds: ["p5", "p6"], rating: 7 },
						{ playerIds: ["p7", "p8"], rating: 7 },
					],
				}),
			],
		});

		const scene = buildExportScene(round, players);

		expect(scene.courts).toHaveLength(2);
		expect(scene.courts.map((court) => court.courtNumber)).toEqual([1, 2]);
		for (const court of scene.courts) {
			expect(court.tiles).toHaveLength(4);
			for (const tile of court.tiles) {
				expect(typeof tile.name).toBe("string");
				expect(tile.name.length).toBeGreaterThan(0);
				expect([0, 1]).toContain(tile.teamIndex);
			}
		}
	});

	it("已完成場次顯示最終比分與勝方", () => {
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const round = makeRound({
			matches: [
				makeRoundMatch({
					status: "completed",
					scores: { teamA: 11, teamB: 7 },
					winner: "teamA",
					completedAt: "2026-08-16T01:00:00.000Z",
					playerRatings: [
						{ playerId: "p1", before: 5, after: 6 },
						{ playerId: "p2", before: 6, after: 5 },
					],
				}),
			],
		});

		const scene = buildExportScene(round, players);

		const statusText = scene.courts[0].statusText;
		expect(statusText).toContain("11");
		expect(statusText).toContain("7");
		expect(statusText).toContain("第一隊");
	});

	it("未完成場次顯示未完成狀態而非空白比分", () => {
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const round = makeRound({
			matches: [makeRoundMatch({ status: "pending", scores: null, winner: null })],
		});

		const scene = buildExportScene(round, players);

		const statusText = scene.courts[0].statusText;
		expect(statusText.length).toBeGreaterThan(0);
		expect(statusText).not.toMatch(/[0-9]/);
	});

	it("球員格帶該員雙色漸層與 pickTextColor 前景色", () => {
		const colorFrom = "#2563EB";
		const colorTo = "#1E3A8A";
		const players = [
			makePlayer({ id: "p1", name: "小明", colorFrom, colorTo }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const round = makeRound({ matches: [makeRoundMatch()] });

		const scene = buildExportScene(round, players);

		const tile = scene.courts[0].tiles.find((tile) => tile.name === "小明");
		expect(tile).toBeDefined();
		expect(tile?.colorFrom).toBe(colorFrom);
		expect(tile?.colorTo).toBe(colorTo);
		expect(tile?.textColor).toBe(pickTextColor(colorFrom, colorTo));
	});

	it("名單中找不到該球員時以替代文字呈現且不拋錯", () => {
		const players = [makePlayer({ id: "p1", name: "小明" })];
		const round = makeRound({
			matches: [
				makeRoundMatch({
					teams: [
						{ playerIds: ["p1"], rating: 5 },
						{ playerIds: ["missing-player"], rating: 6 },
					],
				}),
			],
		});

		expect(() => buildExportScene(round, players)).not.toThrow();

		const scene = buildExportScene(round, players);
		expect(scene.courts[0].tiles).toHaveLength(2);
		const presentTile = scene.courts[0].tiles.find((tile) => tile.name === "小明");
		expect(presentTile).toBeDefined();
		const missingTile = scene.courts[0].tiles.find((tile) => tile.name !== "小明");
		expect(missingTile).toBeDefined();
		expect(missingTile?.name.length).toBeGreaterThan(0);
	});

	it("畫布高度依場地數與對戰方式遞增", () => {
		const players: Player[] = [];
		const oneCourtSingles = makeRound({
			format: "singles",
			matches: [makeRoundMatch({ courtNumber: 1, format: "singles" })],
		});
		const threeCourtsSingles = makeRound({
			format: "singles",
			matches: [
				makeRoundMatch({ id: "m1", courtNumber: 1, format: "singles" }),
				makeRoundMatch({ id: "m2", courtNumber: 2, format: "singles" }),
				makeRoundMatch({ id: "m3", courtNumber: 3, format: "singles" }),
			],
		});
		const oneCourtDoubles = makeRound({
			format: "doubles",
			matches: [
				makeRoundMatch({
					courtNumber: 1,
					format: "doubles",
					teams: [
						{ playerIds: ["p1", "p2"], rating: 7 },
						{ playerIds: ["p3", "p4"], rating: 7 },
					],
				}),
			],
		});

		const oneCourtSinglesHeight = buildExportScene(oneCourtSingles, players).height;
		const threeCourtsSinglesHeight = buildExportScene(threeCourtsSingles, players).height;
		const oneCourtDoublesHeight = buildExportScene(oneCourtDoubles, players).height;

		expect(threeCourtsSinglesHeight).toBeGreaterThan(oneCourtSinglesHeight);
		expect(oneCourtDoublesHeight).toBeGreaterThan(oneCourtSinglesHeight);
	});

	it("組裝匯出內容不修改輸入的回合與名單", () => {
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const round = makeRound({
			matches: [
				makeRoundMatch({
					status: "completed",
					scores: { teamA: 11, teamB: 7 },
					winner: "teamA",
					completedAt: "2026-08-16T01:00:00.000Z",
					playerRatings: [
						{ playerId: "p1", before: 5, after: 6 },
						{ playerId: "p2", before: 6, after: 5 },
					],
				}),
			],
		});
		const roundSnapshot = structuredClone(round);
		const playersSnapshot = structuredClone(players);

		buildExportScene(round, players);

		expect(round).toEqual(roundSnapshot);
		expect(players).toEqual(playersSnapshot);
	});

	it("匯出場景以不透明白色為底色", () => {
		const round = makeRound();
		const players: Player[] = [];

		const scene = buildExportScene(round, players);

		expect(scene.background).not.toBe("transparent");
		expect(scene.background).not.toMatch(/rgba/i);
		// 6 碼 hex（不含 alpha），對齊 codebase 既有 HexColorSchema 的格式慣例。
		expect(scene.background).toMatch(/^#[0-9a-fA-F]{6}$/);
	});
});
