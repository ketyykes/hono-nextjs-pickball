import { describe, it, expect } from "vitest";

import { playerTileStyle } from "./tile-style";
import { pickTextColor } from "./colors";
import type { Player } from "./types";

// 測試用的完整參賽者建構器，與 duplication.test.ts／candidates.test.ts 等同構，
// 刻意不共用——本檔保持獨立、不依賴其他測試檔。
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

describe("playerTileStyle", () => {
	it("色塊背景為雙色漸層且前景取 pickTextColor 的結果", () => {
		// 兩組配色皆為一深一淺（colors.ts 檔頭點名的實際情境），且刻意互為「反向」：
		// 第一組若實作只看 colorFrom（忽略 colorTo）會算錯，第二組則反過來——若實作
		// 只看 colorTo（忽略 colorFrom）會算錯。單一組配色無法同時擋下這兩種偏移，
		// 因為 pickTextColor 是取兩端最小對比，只用其中一端仍可能巧合算對。
		const colorPairs: ReadonlyArray<Pick<Player, "colorFrom" | "colorTo">> = [
			{ colorFrom: "#A7F3D0", colorTo: "#0E1A1A" },
			{ colorFrom: "#E8F5F0", colorTo: "#134E4A" },
		];

		for (const { colorFrom, colorTo } of colorPairs) {
			const player = makePlayer({ colorFrom, colorTo });

			const style = playerTileStyle(player, { completed: false });

			// 用 toBe 精確比對完整字串（而非只驗證「含」兩色），連帶擋下漸層角度被
			// 改掉、colorFrom／colorTo 順序對調、或其中一端被複製成單色的 mutation。
			expect(style.background).toBe(`linear-gradient(135deg, ${colorFrom}, ${colorTo})`);
			// 直接呼叫 pickTextColor 取得期望值，不硬寫顏色字串——避免另寫一套亮度判斷
			// 與 colors.ts 的 pickTextColor 走岔。
			expect(style.color).toBe(pickTextColor(colorFrom, colorTo));
		}
	});

	it("已完成場次的色塊樣式降低不透明度與飽和度", () => {
		const player = makePlayer();
		const expectedBackground = `linear-gradient(135deg, ${player.colorFrom}, ${player.colorTo})`;
		const expectedColor = pickTextColor(player.colorFrom, player.colorTo);

		const notCompleted = playerTileStyle(player, { completed: false });
		const completed = playerTileStyle(player, { completed: true });

		// toStrictEqual 比對完整物件形狀（非逐鍵斷言）：
		// - 擋下 background／color 被 completed 分支改壞或整個漏掉（未完成分支不變）。
		// - 擋下任一分支多帶非預期的鍵（例如額外塞一個會影響渲染的 CSS 屬性）。
		// - 順帶擋下「completed: false 卻帶著值為 undefined 的 opacity／filter 鍵」——
		//   toStrictEqual 視 { opacity: undefined } 與缺少該鍵為不同物件，toEqual 不會。
		// 完成與否不改變漸層與前景色本身，只疊加不透明度與飽和度，故兩分支的
		// background／color 預期相同。
		expect(notCompleted).toStrictEqual({ background: expectedBackground, color: expectedColor });
		expect(completed).toStrictEqual({
			background: expectedBackground,
			color: expectedColor,
			opacity: 0.6,
			filter: "saturate(0.5)",
		});

		// 額外保留兩條「性質」斷言（不釘死具體數值），與上面的絕對值斷言互為佐證：
		// 即使日後常數數值調整，這兩條仍能單獨驗證「completed 確實比未完成弱」與
		// 「completed: false 確實不帶這兩項」的語意，不是唯一防線但值得留著說明意圖。
		expect(completed.opacity).toBeLessThan(1);
		expect(notCompleted).not.toHaveProperty("opacity");
		expect(notCompleted).not.toHaveProperty("filter");
	});
});
