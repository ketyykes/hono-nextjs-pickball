import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// hooks/ 由多個 capability 共用，但跨 capability 的歸屬清單只有一份，
// 維護在 pickleball-guide-page 規格內。新增或移除 hook 卻忘了同步清單不會弄壞任何東西，
// 只會讓規格靜默失真 —— 已經發生兩次（漏 useFocusMode、漏 useRosterStore）。
// 這支測試就是守這條縫，雙向比對：目錄 → 清單、清單 → 目錄。

const HOOKS_DIR = join(process.cwd(), "hooks");
const SPEC_PATH = join(
	process.cwd(),
	"..",
	"openspec",
	"specs",
	"pickleball-guide-page",
	"spec.md",
);
const REQUIREMENT_HEADING =
	"### Requirement: 互動行為由三支 hooks 提供且各有 smoke test";
// 清單段落的結束界線。之後是先例敘述，裡面也會出現 hook 名稱 ——
// 若把先例句算進比對範圍，某支 hook 只要曾被當成失誤例子提到，
// 就算清單真的漏列它也照樣綠燈（實測過，這正是本測試最初的漏洞）。
const OWNERSHIP_LIST_END = "此歸屬清單為";

/**
 * 只取歸屬清單段落：Requirement 起始至「此歸屬清單為」之前。
 * 涵蓋本 capability 自己的三支（第一段）與其餘 capability 的歸屬（第二段）。
 */
function readOwnershipList(): string {
	const spec = readFileSync(SPEC_PATH, "utf-8");
	const start = spec.indexOf(REQUIREMENT_HEADING);
	if (start === -1) {
		throw new Error(
			`規格中找不到「${REQUIREMENT_HEADING}」，歸屬清單可能已被改寫：${SPEC_PATH}`,
		);
	}
	const rest = spec.slice(start + REQUIREMENT_HEADING.length);
	const end = rest.indexOf(OWNERSHIP_LIST_END);
	if (end === -1) {
		throw new Error(
			`規格中找不到清單段落的結束界線「${OWNERSHIP_LIST_END}」：${SPEC_PATH}`,
		);
	}
	return rest.slice(0, end);
}

function listHookNames(): string[] {
	return readdirSync(HOOKS_DIR)
		.filter((file) => /^use.+\.tsx?$/.test(file) && !file.includes(".test."))
		.map((file) => file.replace(/\.tsx?$/, ""));
}

describe("hooks 歸屬清單", () => {
	it("hooks 目錄下每支 hook 都能在規格的歸屬清單中找到", () => {
		const section = readOwnershipList();

		// 後綴否定是為了避免前綴誤判：useScroll 不該被 useScrollSpy 的出現餵飽。
		const missing = listHookNames().filter(
			(name) => !new RegExp(`${name}(?![A-Za-z0-9])`).test(section),
		);

		expect(missing).toEqual([]);
	});

	it("歸屬清單提及的每個 hook 名稱都有對應檔案", () => {
		const mentioned = new Set(
			readOwnershipList().match(/use[A-Z][A-Za-z0-9]*/g) ?? [],
		);

		const stale = [...mentioned].filter(
			(name) =>
				!existsSync(join(HOOKS_DIR, `${name}.ts`)) &&
				!existsSync(join(HOOKS_DIR, `${name}.tsx`)),
		);

		expect(stale).toEqual([]);
	});
});
