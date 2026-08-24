import { describe, it, expect } from "vitest";

import { buildCourtTiles } from "./stage-layout";
import type { Match } from "./allocation-types";
import type { Player } from "./types";

// 測試用的完整參賽者建構器，與 allocation.test.ts 同構，刻意不共用——
// stage-layout.test.ts 保持獨立、不依賴其他測試檔。
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

// buildCourtTiles 的參數型別放寬為結構型別（design Open Questions 2c），這裡直接宣告
// 真正的 Match 傳入，藉此在型別層驗證 Match 可免 cast 指派給該結構型別。
describe("buildCourtTiles", () => {
	it("單打回傳兩格且兩格同列左右相鄰分屬兩隊", () => {
		const match: Match = {
			courtNumber: 1,
			format: "singles",
			teams: [
				{ players: [makePlayer({ id: "p1" })], rating: 3 },
				{ players: [makePlayer({ id: "p2" })], rating: 4 },
			],
		};

		const tiles = buildCourtTiles(match);

		expect(tiles).toHaveLength(2);
		// 單一有序的「球員—隊伍—座標」tuple 比對，取代原本分散在 row／column／
		// find(...).teamIndex 各自獨立的斷言——分散寫法各鎖各的鍵，「回傳順序翻轉
		// 且兩隊 columnOffset 同時對調」這種複合變異可以讓每一條分散斷言各自通過
		// （身分鍵與座標鍵沒有交會）卻仍然左右顛倒。綁在同一條有序比對後身分與座標
		// 無法分開變造，對齊 it 2 已採用的寫法。
		expect(
			tiles.map((tile) => [
				tile.player.id,
				tile.teamIndex,
				tile.row,
				tile.column,
			]),
		).toEqual([
			["p1", 0, 0, 0],
			["p2", 1, 0, 1],
		]);
	});

	it("雙打回傳四格並排成 2x2", () => {
		const match: Match = {
			courtNumber: 1,
			format: "doubles",
			doublesComposition: "general",
			teams: [
				{
					players: [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })],
					rating: 7,
				},
				{
					players: [makePlayer({ id: "p3" }), makePlayer({ id: "p4" })],
					rating: 7,
				},
			],
		};

		const tiles = buildCourtTiles(match);

		expect(tiles).toHaveLength(4);
		expect(tiles.filter((tile) => tile.row === 0)).toHaveLength(2);
		expect(tiles.filter((tile) => tile.row === 1)).toHaveLength(2);
		expect(tiles.filter((tile) => tile.column === 0)).toHaveLength(2);
		expect(tiles.filter((tile) => tile.column === 1)).toHaveLength(2);
		// 有序的「球員—座標」斷言：只驗證數量分布無法擋下回傳順序被打亂、隊內球員順序
		// 反轉、或隊內 column 反轉（例如把 p1／p2 的 column 對調）這幾種錯置——這三種
		// 錯置都不改變 row／column 各自的分布計數，只有綁定「特定球員在特定座標」才擋得住。
		expect(
			tiles.map((tile) => [tile.player.id, tile.row, tile.column]),
		).toEqual([
			["p1", 0, 0],
			["p2", 0, 1],
			["p3", 1, 0],
			["p4", 1, 1],
		]);
	});

	// design Decision 4 的落地判準：「對角同隊」的錯誤實作同樣會通過上一條 2x2 斷言，
	// 需要獨立一條把它擋下。
	it("雙打上排兩格為第一隊下排兩格為第二隊", () => {
		const match: Match = {
			courtNumber: 1,
			format: "doubles",
			doublesComposition: "general",
			teams: [
				{
					players: [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })],
					rating: 7,
				},
				{
					players: [makePlayer({ id: "p3" }), makePlayer({ id: "p4" })],
					rating: 7,
				},
			],
		};

		const tiles = buildCourtTiles(match);

		const topRow = tiles.filter((tile) => tile.row === 0);
		const bottomRow = tiles.filter((tile) => tile.row === 1);
		expect(topRow.every((tile) => tile.teamIndex === 0)).toBe(true);
		expect(bottomRow.every((tile) => tile.teamIndex === 1)).toBe(true);
		// 上排 MUST 是第一隊（teams[0]，p1／p2）本人，下排 MUST 是第二隊（teams[1]，
		// p3／p4）本人，且順序不排序——只驗證 teamIndex 或排序後的球員集合，
		// 無法擋下「把 teams[0]／teams[1] 對調」或「隊內球員順序反轉」的錯置。
		expect(topRow.map((tile) => tile.player.id)).toEqual(["p1", "p2"]);
		expect(bottomRow.map((tile) => tile.player.id)).toEqual(["p3", "p4"]);
	});
});
