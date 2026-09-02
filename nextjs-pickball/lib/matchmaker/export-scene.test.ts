import { describe, it, expect } from "vitest";

import { buildExportScene, EXPORT_APP_NAME } from "./export-scene";
import { pickTextColor, DARK_FOREGROUND } from "./colors";
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

		// 升級為完整字串比對（Minor-5）：讓 ROUND_LABEL_PREFIX／SUFFIX／TITLE_SEPARATOR 改成
		// 空字串都會轉紅。App 名稱仍以 EXPORT_APP_NAME 常數組出期望值，不在期望字串裡寫死，
		// 「第 3 輪」「雙打」則是由 spec 保證的固定業務文案，直接寫死作為期望值。
		expect(scene.title).toBe(`${EXPORT_APP_NAME}　第 3 輪　雙打`);
	});

	it("EXPORT_APP_NAME 為裁決後的固定 App 名稱（design Open Question 3）", () => {
		expect(EXPORT_APP_NAME).toBe("匹克球對戰分配機");
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
			}
		}
		// 用能真正辨識球員身分的姓名＋teamIndex 序列比對，取代原本恆真的
		// expect([0, 1]).toContain(tile.teamIndex)：teamIndex 寫死 0 或兩隊對調都會被此斷言抓到。
		expect(scene.courts[0].tiles.map((tile) => [tile.name, tile.teamIndex])).toEqual([
			["小明", 0],
			["小華", 0],
			["小美", 1],
			["小強", 1],
		]);
		expect(scene.courts[1].tiles.map((tile) => [tile.name, tile.teamIndex])).toEqual([
			["小英", 0],
			["小豪", 0],
			["小芳", 1],
			["小龍", 1],
		]);
	});

	it("雙打場地的四格依 stage-layout 的上下分排，第一隊在 row 0、第二隊在 row 1", () => {
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
			makePlayer({ id: "p3", name: "小美" }),
			makePlayer({ id: "p4", name: "小強" }),
		];
		const round = makeRound({
			format: "doubles",
			matches: [
				makeRoundMatch({
					format: "doubles",
					teams: [
						{ playerIds: ["p1", "p2"], rating: 7 },
						{ playerIds: ["p3", "p4"], rating: 7 },
					],
				}),
			],
		});

		const scene = buildExportScene(round, players);

		expect(
			scene.courts[0].tiles.map((tile) => [tile.name, tile.teamIndex, tile.row, tile.column]),
		).toEqual([
			["小明", 0, 0, 0],
			["小華", 0, 0, 1],
			["小美", 1, 1, 0],
			["小強", 1, 1, 1],
		]);
	});

	it("單打場地的兩格左右並排且同列", () => {
		const players = [makePlayer({ id: "p1", name: "小明" }), makePlayer({ id: "p2", name: "小華" })];
		const round = makeRound({ format: "singles", matches: [makeRoundMatch({ format: "singles" })] });

		const scene = buildExportScene(round, players);

		expect(
			scene.courts[0].tiles.map((tile) => [tile.name, tile.teamIndex, tile.row, tile.column]),
		).toEqual([
			["小明", 0, 0, 0],
			["小華", 1, 0, 1],
		]);
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

		// 升級為完整字串（順序敏感）比對，取代原本的 toContain 組合：
		// 比分兩數對調、或勝方恆取第一隊都會被此斷言抓到。全形空白為 STATUS_SEPARATOR。
		expect(scene.courts[0].statusText).toBe("11 : 7　第一隊獲勝");
	});

	it("第二隊獲勝時狀態文字標示第二隊而非恆顯示第一隊", () => {
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const round = makeRound({
			matches: [
				makeRoundMatch({
					status: "completed",
					scores: { teamA: 7, teamB: 11 },
					winner: "teamB",
					completedAt: "2026-08-16T01:00:00.000Z",
					playerRatings: [
						{ playerId: "p1", before: 5, after: 4 },
						{ playerId: "p2", before: 6, after: 7 },
					],
				}),
			],
		});

		const scene = buildExportScene(round, players);

		expect(scene.courts[0].statusText).toBe("7 : 11　第二隊獲勝");
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

	it("scoring 狀態與 pending 同樣視為未完成，不另立第三種文案", () => {
		// regression guard：產品碼本來就正確（buildStatusText 只判斷 status === "completed"），
		// 此測試寫入當下即為綠燈，用來釘住「不為 scoring 另立第三種文案」這條 spec 語意。
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const pendingRound = makeRound({
			matches: [makeRoundMatch({ id: "m-pending", status: "pending", scores: null, winner: null })],
		});
		const scoringRound = makeRound({
			matches: [makeRoundMatch({ id: "m-scoring", status: "scoring", scores: null, winner: null })],
		});

		const pendingScene = buildExportScene(pendingRound, players);
		const scoringScene = buildExportScene(scoringRound, players);

		expect(scoringScene.courts[0].statusText).toBe(pendingScene.courts[0].statusText);
	});

	it("狀態非 completed 時即使意外帶有比分與勝方仍顯示未完成，status 是唯一判斷依據", () => {
		// regression guard：產品碼本來就以 status === "completed" 為第一個（且必要）條件，
		// 此測試寫入當下即為綠燈。RoundMatchSchema 的 superRefine 只約束「completed 場次
		// 必須帶 scores／winner」這個方向，未反向約束「非 completed 場次不得帶 scores／winner」，
		// 故此組合在型別上合法、屬於損壞資料也可能出現的狀態，須靠 status 判斷擋下。
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const round = makeRound({
			matches: [
				makeRoundMatch({
					status: "pending",
					scores: { teamA: 11, teamB: 7 },
					winner: "teamA",
				}),
			],
		});

		const scene = buildExportScene(round, players);

		expect(scene.courts[0].statusText).toBe("未完成");
	});

	it("狀態為 completed 但比分或勝方缺漏時退回未完成文字而非拋錯", () => {
		// regression guard：產品碼本來就以 && 而非 || 判斷三個條件，此測試寫入當下即為綠燈。
		// 之所以仍要補這條，是因為把 && 改成 || 是最危險的存活 mutant——
		// 「completed 但 scores 為 null」在 || 下會在 match.scores.teamA 直接拋 TypeError。
		const players = [
			makePlayer({ id: "p1", name: "小明" }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const missingScoresRound = makeRound({
			matches: [
				makeRoundMatch({
					id: "m-missing-scores",
					status: "completed",
					scores: null,
					winner: "teamA",
				}),
			],
		});
		const missingWinnerRound = makeRound({
			matches: [
				makeRoundMatch({
					id: "m-missing-winner",
					status: "completed",
					scores: { teamA: 11, teamB: 9 },
					winner: null,
				}),
			],
		});

		expect(() => buildExportScene(missingScoresRound, players)).not.toThrow();
		expect(() => buildExportScene(missingWinnerRound, players)).not.toThrow();

		const missingScoresScene = buildExportScene(missingScoresRound, players);
		const missingWinnerScene = buildExportScene(missingWinnerRound, players);

		expect(missingScoresScene.courts[0].statusText).toBe("未完成");
		expect(missingWinnerScene.courts[0].statusText).toBe("未完成");
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

	it("淺色漸層的球員格前景色改為深色而非恆為白色", () => {
		// 既有測試的 fixture（#2563EB／#1E3A8A）本身就回傳白色前景，
		// 與「textColor 寫死 #FFFFFF」的 mutant 恰好同義反覆、殺不掉它。
		// 這裡改用一組實測會讓 pickTextColor 回傳深色前景的淺色漸層作對照組。
		const colorFrom = "#FEF3C7";
		const colorTo = "#FDE68A";
		const players = [
			makePlayer({ id: "p1", name: "小明", colorFrom, colorTo }),
			makePlayer({ id: "p2", name: "小華" }),
		];
		const round = makeRound({ matches: [makeRoundMatch()] });

		const scene = buildExportScene(round, players);

		const tile = scene.courts[0].tiles[0];
		expect(pickTextColor(colorFrom, colorTo)).toBe(DARK_FOREGROUND);
		expect(tile.textColor).toBe(DARK_FOREGROUND);
		expect(tile.textColor).not.toBe("#FFFFFF");
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
		// Minor-4：佔位格漸層不得退化為單色，且前景色仍需委派給 pickTextColor 而非另立分支。
		expect(missingTile?.colorFrom).not.toBe(missingTile?.colorTo);
		expect(missingTile?.textColor).toBe(pickTextColor(missingTile!.colorFrom, missingTile!.colorTo));
		// 佔位色需與真實球員 fixture 的色碼區隔，視覺上才可辨識該格是佔位而非真實球員。
		expect(missingTile?.colorFrom).not.toBe(presentTile?.colorFrom);
		expect(missingTile?.colorTo).not.toBe(presentTile?.colorTo);
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

	it("每多一個場地，畫布高度就等量增加，且雙打的每場增量大於單打", () => {
		const players: Player[] = [];
		const singlesMatch = (id: string, courtNumber: number) =>
			makeRoundMatch({ id, courtNumber, format: "singles" });
		const doublesMatch = (id: string, courtNumber: number) =>
			makeRoundMatch({
				id,
				courtNumber,
				format: "doubles",
				teams: [
					{ playerIds: ["p1", "p2"], rating: 7 },
					{ playerIds: ["p3", "p4"], rating: 7 },
				],
			});

		const h1Singles = buildExportScene(
			makeRound({ format: "singles", matches: [singlesMatch("m1", 1)] }),
			players,
		).height;
		const h2Singles = buildExportScene(
			makeRound({ format: "singles", matches: [singlesMatch("m1", 1), singlesMatch("m2", 2)] }),
			players,
		).height;
		const h3Singles = buildExportScene(
			makeRound({
				format: "singles",
				matches: [singlesMatch("m1", 1), singlesMatch("m2", 2), singlesMatch("m3", 3)],
			}),
			players,
		).height;
		const h1Doubles = buildExportScene(
			makeRound({ format: "doubles", matches: [doublesMatch("m1", 1)] }),
			players,
		).height;
		const h2Doubles = buildExportScene(
			makeRound({ format: "doubles", matches: [doublesMatch("m1", 1), doublesMatch("m2", 2)] }),
			players,
		).height;

		const singlesStep = h2Singles - h1Singles;
		expect(h3Singles - h2Singles).toBe(singlesStep); // 線性成長
		expect(singlesStep).toBeGreaterThan(0);
		expect(h2Doubles - h1Doubles).toBeGreaterThan(singlesStep);
	});

	it("每個場地區塊自帶 blockHeight，單打與雙打各為公式推導出的固定值", () => {
		// blockHeight 存在的理由是讓 scene-canvas.ts 直接累加下一個場地的起點 y，
		// 而不必由 tiles 反推對戰方式再套公式——推導屬行為邏輯，不該住在例外層
		// （§7 Stage 2 Major-2）。這條把「本檔一併算好」這件事釘住：欄位漏填、
		// 填成 0、或單打與雙打填成同值都會轉紅。
		// 期望值＝COURT_HEADER_HEIGHT(56) + 該對戰方式的球員列數 × TILE_ROW_HEIGHT(88)：
		// 單打 56 + 1×88 = 144；雙打 56 + 2×88 = 232。
		const players: Player[] = [];
		const singlesScene = buildExportScene(
			makeRound({ format: "singles", matches: [makeRoundMatch({ format: "singles" })] }),
			players,
		);
		const doublesScene = buildExportScene(
			makeRound({
				format: "doubles",
				matches: [
					makeRoundMatch({
						format: "doubles",
						teams: [
							{ playerIds: ["p1", "p2"], rating: 7 },
							{ playerIds: ["p3", "p4"], rating: 7 },
						],
					}),
				],
			}),
			players,
		);

		expect(singlesScene.courts[0].blockHeight).toBe(144);
		expect(doublesScene.courts[0].blockHeight).toBe(232);
		expect(doublesScene.courts[0].blockHeight).toBeGreaterThan(singlesScene.courts[0].blockHeight);
	});

	it("畫布高度的組成為標題區、場地表頭、球員列與間距四項具名常數的固定公式", () => {
		// 直接釘住依公式推導出的精確高度值，取代單純的「越多越高」單調性檢查——
		// 讓 TITLE_AREA_HEIGHT／COURT_HEADER_HEIGHT／COURT_BLOCK_SPACING／TILE_ROW_HEIGHT
		// 任一者被歸零、或 TILE_ROWS_BY_FORMAT 的 singles／doubles 對調，都會使某個
		// 組態的高度偏離期望值而轉紅。期望值依 export-scene.ts 目前的公式與常數手算得出：
		// height(n, format) = TITLE_AREA_HEIGHT + n * (COURT_HEADER_HEIGHT + rows(format) * TILE_ROW_HEIGHT)
		//                      + (n + 1) * COURT_BLOCK_SPACING
		const players: Player[] = [];
		const singlesMatch = (id: string, courtNumber: number) =>
			makeRoundMatch({ id, courtNumber, format: "singles" });
		const doublesMatch = (id: string, courtNumber: number) =>
			makeRoundMatch({
				id,
				courtNumber,
				format: "doubles",
				teams: [
					{ playerIds: ["p1", "p2"], rating: 7 },
					{ playerIds: ["p3", "p4"], rating: 7 },
				],
			});

		const h0 = buildExportScene(makeRound({ format: "singles", matches: [] }), players).height;
		const h1Singles = buildExportScene(
			makeRound({ format: "singles", matches: [singlesMatch("m1", 1)] }),
			players,
		).height;
		const h1Doubles = buildExportScene(
			makeRound({ format: "doubles", matches: [doublesMatch("m1", 1)] }),
			players,
		).height;

		expect(h0).toBe(120);
		expect(h1Singles).toBe(288);
		expect(h1Doubles).toBe(376);
	});

	it("畫布寬度為固定正值，不隨場地數或對戰方式改變", () => {
		const players: Player[] = [];
		const singlesRound = makeRound({
			format: "singles",
			matches: [makeRoundMatch({ id: "m1", courtNumber: 1, format: "singles" })],
		});
		const doublesRound = makeRound({
			format: "doubles",
			matches: [
				makeRoundMatch({
					id: "m1",
					courtNumber: 1,
					format: "doubles",
					teams: [
						{ playerIds: ["p1", "p2"], rating: 7 },
						{ playerIds: ["p3", "p4"], rating: 7 },
					],
				}),
				makeRoundMatch({
					id: "m2",
					courtNumber: 2,
					format: "doubles",
					teams: [
						{ playerIds: ["p5", "p6"], rating: 7 },
						{ playerIds: ["p7", "p8"], rating: 7 },
					],
				}),
			],
		});

		const singlesWidth = buildExportScene(singlesRound, players).width;
		const doublesWidth = buildExportScene(doublesRound, players).width;

		expect(singlesWidth).toBeGreaterThan(0);
		expect(doublesWidth).toBe(singlesWidth);
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
		// design Decision 9 要的是「白」而非任意不透明色——單靠上面三條斷言無法排除
		// 例如 #000000 這種同樣不透明、同樣是合法 6 碼 hex 的錯誤底色。
		expect(scene.background.toUpperCase()).toBe("#FFFFFF");
	});
});
