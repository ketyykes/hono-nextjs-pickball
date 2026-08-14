import { describe, it, expect } from "vitest";
import { nextRadioIndex } from "./radio-navigation";

// ScoreboardSetup 目標分數 radiogroup 的方向鍵索引計算——對應 WAI-ARIA APG
// radio group pattern（roving tabindex + 方向鍵移動即選取）。純函式，不碰 DOM，
// 元件層（ScoreboardSetup.tsx）以 E2E 驗收，見 tests/e2e/specs/scoreboard.spec.ts。
describe("nextRadioIndex", () => {
	it("ArrowRight 前進到下一個索引", () => {
		expect(nextRadioIndex(0, 3, "ArrowRight")).toBe(1);
		expect(nextRadioIndex(1, 3, "ArrowRight")).toBe(2);
	});

	it("ArrowDown 前進到下一個索引（與 ArrowRight 同義）", () => {
		expect(nextRadioIndex(0, 3, "ArrowDown")).toBe(1);
		expect(nextRadioIndex(1, 3, "ArrowDown")).toBe(2);
	});

	it("ArrowLeft 後退到上一個索引", () => {
		expect(nextRadioIndex(2, 3, "ArrowLeft")).toBe(1);
		expect(nextRadioIndex(1, 3, "ArrowLeft")).toBe(0);
	});

	it("ArrowUp 後退到上一個索引（與 ArrowLeft 同義）", () => {
		expect(nextRadioIndex(2, 3, "ArrowUp")).toBe(1);
		expect(nextRadioIndex(1, 3, "ArrowUp")).toBe(0);
	});

	it("在尾端按 ArrowRight／ArrowDown 循環回第一個", () => {
		expect(nextRadioIndex(2, 3, "ArrowRight")).toBe(0);
		expect(nextRadioIndex(2, 3, "ArrowDown")).toBe(0);
	});

	it("在開頭按 ArrowLeft／ArrowUp 循環到最後一個", () => {
		expect(nextRadioIndex(0, 3, "ArrowLeft")).toBe(2);
		expect(nextRadioIndex(0, 3, "ArrowUp")).toBe(2);
	});

	it("Home 跳到第一個索引", () => {
		expect(nextRadioIndex(2, 3, "Home")).toBe(0);
		expect(nextRadioIndex(0, 3, "Home")).toBe(0);
	});

	it("End 跳到最後一個索引", () => {
		expect(nextRadioIndex(0, 3, "End")).toBe(2);
		expect(nextRadioIndex(2, 3, "End")).toBe(2);
	});

	it("非導覽鍵回傳 null", () => {
		expect(nextRadioIndex(0, 3, "Enter")).toBeNull();
		expect(nextRadioIndex(0, 3, " ")).toBeNull();
		expect(nextRadioIndex(0, 3, "Tab")).toBeNull();
		expect(nextRadioIndex(0, 3, "a")).toBeNull();
	});
});
