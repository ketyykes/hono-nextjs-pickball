import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { brands } from "./brands";
import { paddleMaterials } from "./paddleMaterials";
import { twMarketPrices } from "./twMarketPrices";

// 價位一律以 1~10 顆星表示，guide 的資料檔與元件原始碼都不得出現實際金額字樣。
describe("guide 資料的價位星級", () => {
	const allRows = [
		...brands.map((row) => ({ label: row.name, stars: row.priceStars })),
		...paddleMaterials.map((row) => ({
			label: row.material,
			stars: row.priceStars,
		})),
		...twMarketPrices.map((row) => ({ label: row.tier, stars: row.priceStars })),
	];

	it("每筆資料的 priceStars 都是 1~10 的整數", () => {
		for (const { label, stars } of allRows) {
			expect(Number.isInteger(stars), `${label} 的星數應為整數`).toBe(true);
			expect(stars, `${label} 的星數應 >= 1`).toBeGreaterThanOrEqual(1);
			expect(stars, `${label} 的星數應 <= 10`).toBeLessThanOrEqual(10);
		}
	});

	it("guide 原始碼（資料檔、元件、首頁）不得殘留金額字樣", () => {
		// 手法沿用 tocItems.test.ts：直接掃描原始檔內容，守住跨檔回歸。
		const targets = [
			join(process.cwd(), "data/guide"),
			join(process.cwd(), "components/guide"),
			join(process.cwd(), "components/guide/shared"),
			join(process.cwd(), "app"),
		];
		const currencyPattern = /NT\$|US\$|NTD|TWD|USD/;
		const offenders: string[] = [];

		for (const dir of targets) {
			for (const file of readdirSync(dir, { withFileTypes: true })) {
				if (!file.isFile()) continue;
				const isSource = /\.(ts|tsx)$/.test(file.name);
				const isTest = /\.test\.(ts|tsx)$/.test(file.name);
				if (!isSource || isTest) continue;
				const source = readFileSync(join(dir, file.name), "utf-8");
				if (currencyPattern.test(source)) {
					offenders.push(join(dir, file.name));
				}
			}
		}

		expect(offenders).toEqual([]);
	});
});
