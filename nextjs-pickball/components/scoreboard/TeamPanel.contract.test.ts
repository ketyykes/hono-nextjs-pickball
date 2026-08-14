import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// scoreboard-target-score spec（Requirement「橫直式排版」Scenario「分數字級隨面板高度
// 縮放而非寬度斷點」）：TeamPanel 的分數字級 SHALL 以 cqh/cqw + clamp() 表達，
// SHALL NOT 出現以寬度斷點（sm:/md:/lg:/xl:/2xl:）指定字級的 class——這是先前
// 平板直向、橫向手機誤中過大字級而溢出的根因，僅靠 code review 把關無自動化守門。
//
// 陷阱：TeamPanel.tsx 原始碼的註解本身就示範了被禁止的寫法（例如
// 「md:text-[14rem] 會讓平板直向、橫向手機誤中大字而溢出」），天真的
// rawSource.includes("md:text-") 會被這段說明文字誤報為違規。因此檢查
// MUST 先剝除註解再比對，本檔的 stripComments() 即為此目的。
const TEAM_PANEL_PATH = join(process.cwd(), "components/scoreboard/TeamPanel.tsx");

// 剝除 // 行註解與 /* */ 區塊註解。TeamPanel.tsx 原始碼中不含 "://" 字串
// （無 URL 字面值），故逐行以第一個 "//" 截斷是安全的簡化實作。
function stripComments(source: string): string {
	const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
	return withoutBlockComments
		.split("\n")
		.map((line) => line.replace(/\/\/.*$/, ""))
		.join("\n");
}

describe("TeamPanel 分數字級斷點守門（scoreboard-target-score spec：字級 SHALL NOT 用寬度斷點）", () => {
	const rawSource = readFileSync(TEAM_PANEL_PATH, "utf-8");
	const strippedSource = stripComments(rawSource);

	it("陷阱驗證：未剝除註解的原始碼確實含反例字串，證明本測試的剝除步驟不是空轉的多餘動作", () => {
		// 若這個斷言未來失敗（例如有人改寫了註解措辭），代表陷阱本身已不存在，
		// 屆時應檢視是否仍需要 stripComments，而非放寬下面的主斷言。
		expect(rawSource).toContain("md:text-");
	});

	it("反向驗證：剝除註解後仍保留正在使用的 clamp 字級 class，證明剝除邏輯沒有把整個檔案吃掉", () => {
		expect(strippedSource).toContain("text-[clamp(2.5rem,min(37cqh,38cqw),14rem)]");
	});

	it("剝除註解後的原始碼不存在任何寬度斷點字級 class（sm:text- / md:text- / lg:text- / xl:text- / 2xl:text-）", () => {
		const breakpointTextSizePattern = /\b(?:sm|md|lg|xl|2xl):text-/;
		expect(strippedSource).not.toMatch(breakpointTextSizePattern);
	});

	it("間距（gap/padding）刻意允許用寬度斷點分流：portrait:md:gap- 與 portrait:md:p- 須存在", () => {
		// 標記「間距可用斷點、字級不可」的界線——若日後有人把字級也加上斷點，
		// 上一個測試會紅；若有人誤刪了間距分流，這個測試會紅。
		expect(strippedSource).toContain("portrait:md:gap-");
		expect(strippedSource).toContain("portrait:md:p-");
	});
});
