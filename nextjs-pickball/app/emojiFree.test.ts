// app/emojiFree.test.ts
//
// 守門測試：app、components、data、lib、hooks 中「會出現在介面上的文字」不得含 emoji 或 emoji 類符號，
// 品牌產地字串不得含國旗。介面文字指字串常值、樣板字串各段與 JSX 文字；
// 程式碼註解（//、/* */、JSX 的 {/* */}）不屬介面文字，允許出現 emoji。
// 判定以 TypeScript 編譯器 API 解析 AST，不用逐行 regex，才能正確區分註解與字串。
// 路徑以 process.cwd() 為基準（vitest root 即本 workspace）：
// 從 repo root 經 `pnpm --filter` 或在 workspace 內執行，cwd 都是 nextjs-pickball/；
// `import.meta.url` 在本專案 vitest 下不是 file: scheme（見 app/globals.print.test.ts 的說明）。
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { brands } from "@/data/guide/brands";

const WORKSPACE_ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "data", "lib", "hooks"];
// 三個分支：
// 1. \p{Emoji_Presentation}：預設以彩色呈現的 emoji，含國旗（區域指示符號）。
// 2. \uFE0F：變體選擇器，捕捉「文字符號 + 強制彩色」的組合（例如警告符號後面接的那個字元）。
// 3. [\u2715\u2713\u2605]：預設為文字呈現、但本專案已改用 lucide 圖示取代的叉、勾、星符號。
const EMOJI_PATTERN = /\p{Emoji_Presentation}|\uFE0F|[\u2715\u2713\u2605]/u;

/**
 * 找出原始碼中「介面文字」含 emoji 的行號（1-based，去重並由小到大排序）。
 * 介面文字 = 字串常值、樣板字串各段、JSX 文字；註解不是 AST 節點，自然不會被檢查。
 * 已知限制：JSX 文字中的 HTML entity（如 `&#x2713;`）不會被解碼，因此攔不到。
 * @param source 原始碼內容
 * @param fileName 檔名，副檔名為 .tsx 時才會以 JSX 語法解析
 */
function findEmojiInUiText(source: string, fileName: string): number[] {
	const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
	const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
	const lineSet = new Set<number>();

	function isUiTextNode(node: ts.Node): boolean {
		return (
			ts.isStringLiteral(node) ||
			ts.isNoSubstitutionTemplateLiteral(node) ||
			ts.isTemplateHead(node) ||
			ts.isTemplateMiddle(node) ||
			ts.isTemplateTail(node) ||
			ts.isJsxText(node)
		);
	}

	function recordHits(node: ts.Node): void {
		// JsxText 的 getStart 會跳過前導空白，直接用 pos；其餘節點用 getStart 避開前導註解
		const start = ts.isJsxText(node) ? node.pos : node.getStart(sourceFile);
		const startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
		const rawLines = source.slice(start, node.end).split("\n");
		let found = false;
		rawLines.forEach((rawLine, offset) => {
			if (EMOJI_PATTERN.test(rawLine)) {
				lineSet.add(startLine + offset);
				found = true;
			}
		});
		// 原始碼用跳脫序列（如 "\u2713"）寫 emoji 時，逐行比對不到，改回報節點起始行
		if (!found && EMOJI_PATTERN.test((node as ts.LiteralLikeNode).text)) {
			lineSet.add(startLine);
		}
	}

	function visit(node: ts.Node): void {
		if (isUiTextNode(node)) {
			recordHits(node);
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return [...lineSet].sort((a, b) => a - b);
}

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
	it("app、components、data、lib、hooks 的介面文字不含 emoji 或 emoji 類符號", () => {
		const hits: string[] = [];
		for (const scanDir of SCAN_DIRS) {
			for (const file of collectSourceFiles(join(WORKSPACE_ROOT, scanDir))) {
				const source = readFileSync(file, "utf-8");
				for (const line of findEmojiInUiText(source, file)) {
					hits.push(`${relative(WORKSPACE_ROOT, file)}:${line}`);
				}
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

	it("跳脫序列、JSX 屬性與跨行 JSX 文字中的 emoji 也會被攔下", () => {
		const source = [
			"const t = \"\\u{1F3C6}\";",
			"const A = () => <div title=\"✓\">x</div>;",
			"const B = () => (",
			"\t<p>",
			"\t\t💡 提示",
			"\t</p>",
			");",
		].join("\n");
		expect(findEmojiInUiText(source, "fixture.tsx")).toEqual([1, 2, 5]);
	});

	it("國旗 emoji 不視為違規，落單的區域指示符號仍會被攔下", () => {
		const source = [
			"const a = \"🇺🇸 美國・加州\";",
			"const View = () => <p>🇹🇼 台灣本土品牌</p>;",
			"const c = \"\\u{1F1FA}\";",
		].join("\n");
		expect(findEmojiInUiText(source, "fixture.tsx")).toEqual([3]);
	});

	it("品牌產地以國旗 emoji 加國家或地區名稱開頭", () => {
		for (const brand of brands) {
			expect(brand.origin).toMatch(/^[\u{1F1E6}-\u{1F1FF}]{2} (美國|德國|奧地利|台灣)/u);
		}
	});
});
