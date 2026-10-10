// app/emojiFree.test.ts
//
// 守門測試：app、components、data、lib、hooks 的原始碼不得含 emoji 或 emoji 類符號，
// 品牌產地字串不得含國旗。路徑以 process.cwd() 為基準（vitest root 即本 workspace）。
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { brands } from "@/data/guide/brands";

const WORKSPACE_ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "data", "lib", "hooks"];
const EMOJI_PATTERN = /\p{Emoji_Presentation}|️|[✕✓★]/u;

function collectSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectSourceFiles(fullPath));
			continue;
		}
		const isSource = /\.(ts|tsx)$/.test(entry.name);
		const isTest = /\.(test|spec)\./.test(entry.name);
		if (isSource && !isTest) {
			files.push(fullPath);
		}
	}
	return files;
}

describe("emoji-free 守門", () => {
	it("app、components、data、lib、hooks 的原始碼不含 emoji 或 emoji 類符號", () => {
		const hits: string[] = [];
		for (const scanDir of SCAN_DIRS) {
			for (const file of collectSourceFiles(join(WORKSPACE_ROOT, scanDir))) {
				const lines = readFileSync(file, "utf-8").split("\n");
				lines.forEach((line, index) => {
					if (EMOJI_PATTERN.test(line)) {
						hits.push(`${relative(WORKSPACE_ROOT, file)}:${index + 1}`);
					}
				});
			}
		}
		expect(hits).toEqual([]);
	});

	it("品牌產地不含國旗且以國家或地區名稱開頭", () => {
		for (const brand of brands) {
			expect(brand.origin).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
			expect(brand.origin).toMatch(/^(美國|德國|奧地利|台灣)/);
		}
	});
});
