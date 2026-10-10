// app/emojiFree.test.ts
//
// 守門測試：app、components、data、lib、hooks 的原始碼不得含 emoji 或 emoji 類符號，
// 品牌產地字串不得含國旗。路徑以 process.cwd() 為基準（vitest root 即本 workspace）：
// 從 repo root 經 `pnpm --filter` 或在 workspace 內執行，cwd 都是 nextjs-pickball/；
// `import.meta.url` 在本專案 vitest 下不是 file: scheme（見 app/globals.print.test.ts 的說明）。
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { brands } from "@/data/guide/brands";

const WORKSPACE_ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "data", "lib", "hooks"];
// 三個分支：
// 1. \p{Emoji_Presentation}：預設以彩色呈現的 emoji，含國旗（區域指示符號）。
// 2. \uFE0F：變體選擇器，捕捉「文字符號 + 強制彩色」的組合（例如警告符號後面接的那個字元）。
// 3. [\u2715\u2713\u2605]：預設為文字呈現、但本專案已改用 SVG 取代的叉、勾、星符號。
const EMOJI_PATTERN = /\p{Emoji_Presentation}|\uFE0F|[✕✓★]/u;

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

	it("註解中的 emoji 不視為違規", () => {
		const source = [
			"// ⚠️ 注意",
			"/* ✕ 犯規 */",
			"const label = \"犯規\";",
			"export const View = () => <div>{/* 「✕ 犯規」印章 */}犯規</div>;",
		].join("\n");
		expect(findEmojiInUiText(source, "fixture.tsx")).toEqual([]);
	});

	it("字串、樣板字串與 JSX 文字中的 emoji 會被攔下", () => {
		const source = [
			"const a = \"🏓 匹克球\";",
			"const b = `共 ${count} 項 ✓`;",
			"const View = () => <p>💡 提示</p>;",
			"const url = \"https://x\"; // ⚠️",
		].join("\n");
		expect(findEmojiInUiText(source, "fixture.tsx")).toEqual([1, 2, 3]);
	});

	it("品牌產地不含國旗且以國家或地區名稱開頭", () => {
		for (const brand of brands) {
			expect(brand.origin).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
			expect(brand.origin).toMatch(/^(美國|德國|奧地利|台灣)/);
		}
	});
});
