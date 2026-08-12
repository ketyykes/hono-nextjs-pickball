import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tocItems } from "./tocItems";

// TOC 的 id 與 section 元件的 id 屬性是跨檔耦合：改任一邊而忘了另一邊，
// 頁面不會報錯，只會變成「點目錄跳不動」。這支測試就是守這條縫。
describe("tocItems", () => {
	it("每個 TOC item 的 id 都能在 guide section 元件中找到對應 id 屬性", () => {
		const guideDir = join(process.cwd(), "components/guide");
		const sectionIds = new Set<string>();

		for (const file of readdirSync(guideDir)) {
			if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) continue;
			const source = readFileSync(join(guideDir, file), "utf-8");
			for (const match of source.matchAll(/id="([^"]+)"/g)) {
				sectionIds.add(match[1]);
			}
		}

		const missing = tocItems
			.map((item) => item.id)
			.filter((id) => !sectionIds.has(id));

		expect(missing).toEqual([]);
	});
});
