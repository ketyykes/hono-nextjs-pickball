// components/matchmaker/RoundControls.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoundControls } from "./RoundControls";
import type { RoundControlsProps } from "./RoundControls";
import { createRoundSettings } from "@/lib/matchmaker/round-settings";
import type { RoundSettings } from "@/lib/matchmaker/round-settings";
import type { Round, RoundMatch } from "@/lib/matchmaker/round-types";

// 測試專用預設 props：settings 給合法初始值，其餘 callback 一律用 vi.fn()——
// 本元件不持有任何 store（design Decision 9），測試因此不需要 mock 任何東西。
function buildProps(overrides: Partial<RoundControlsProps> = {}): RoundControlsProps {
	return {
		settings: createRoundSettings(),
		onSettingsChange: vi.fn(),
		round: null,
		activePlayerCount: 10,
		onGenerate: vi.fn(),
		onReset: vi.fn(),
		...overrides,
	};
}

function buildSettings(overrides: Partial<RoundSettings> = {}): RoundSettings {
	return { ...createRoundSettings(), ...overrides };
}

function buildMatch(overrides: Partial<RoundMatch> = {}): RoundMatch {
	return {
		id: "match-1",
		courtNumber: 1,
		format: "singles",
		teams: [
			{ playerIds: ["p1"], rating: 3 },
			{ playerIds: ["p2"], rating: 3 },
		],
		status: "pending",
		scores: null,
		winner: null,
		completedAt: null,
		playerRatings: [
			{ playerId: "p1", before: 3, after: null },
			{ playerId: "p2", before: 3, after: null },
		],
		...overrides,
	};
}

function buildRound(overrides: Partial<Round> = {}): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-23T00:00:00.000Z",
		format: "singles",
		courtCount: 1,
		targetScore: 11,
		matches: [buildMatch()],
		restingPlayerIds: [],
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		...overrides,
	};
}

describe("RoundControls", () => {
	it("場地數為 1 時減號 disabled、為 8 時加號 disabled", () => {
		const atMin = render(
			<RoundControls {...buildProps({ settings: buildSettings({ courtCount: 1 }) })} />,
		);
		expect((atMin.getByRole("button", { name: "減少場地數" }) as HTMLButtonElement).disabled).toBe(
			true,
		);
		expect((atMin.getByRole("button", { name: "增加場地數" }) as HTMLButtonElement).disabled).toBe(
			false,
		);
		// 場地數的顯示值也要釘住，而不是只驗加減按鈕的 disabled——用 aria-live 屬性
		// 精準定位顯示區塊，避免與目標分數的「11」等文字誤配。
		expect(atMin.container.querySelector('[aria-live="polite"]')?.textContent).toBe("1");
		atMin.unmount();

		const atMax = render(
			<RoundControls {...buildProps({ settings: buildSettings({ courtCount: 8 }) })} />,
		);
		expect((atMax.getByRole("button", { name: "增加場地數" }) as HTMLButtonElement).disabled).toBe(
			true,
		);
		expect((atMax.getByRole("button", { name: "減少場地數" }) as HTMLButtonElement).disabled).toBe(
			false,
		);
		expect(atMax.container.querySelector('[aria-live="polite"]')?.textContent).toBe("8");
		atMax.unmount();
	});

	it("對戰方式只提供單打與雙打且無性別限定模式選項", () => {
		render(<RoundControls {...buildProps()} />);
		const formatGroup = screen.getByRole("radiogroup", { name: "對戰方式" });
		const options = within(formatGroup).getAllByRole("radio");

		expect(options).toHaveLength(2);
		expect(options.map((option) => option.textContent)).toEqual(["單打", "雙打"]);
		const checked = options.filter((option) => option.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toBe("單打");
		expect(within(formatGroup).queryByText("混雙")).toBeNull();
		expect(within(formatGroup).queryByText("男雙")).toBeNull();
		expect(within(formatGroup).queryByText("女雙")).toBeNull();
	});

	it("目標分數選項為 11／15／21 且預設選中 11", () => {
		render(<RoundControls {...buildProps()} />);
		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		const radios = within(targetGroup).getAllByRole("radio");

		expect(radios).toHaveLength(3);
		expect(radios.map((radio) => radio.textContent)).toEqual(["11", "15", "21"]);
		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(false);
		});
		const checked = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toBe("11");
		// 無目前回合時不應顯示鎖定說明——避免鎖定文字被寫死成恆顯示。
		expect(screen.queryByText(/本輪已鎖定/)).toBeNull();
	});

	it("目前回合存在時目標分數選擇器 disabled 並顯示已鎖定說明", () => {
		const round = buildRound({ targetScore: 15 });
		render(<RoundControls {...buildProps({ round })} />);
		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		const radios = within(targetGroup).getAllByRole("radio");

		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(true);
		});
		const checked = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toBe("15");
		expect(screen.queryByText(/本輪已鎖定/)).not.toBeNull();
	});

	it("按下產生本輪對戰會以目前設定呼叫回合產生函式一次", async () => {
		const user = userEvent.setup();
		const settings = buildSettings({ format: "doubles", courtCount: 3, targetScore: 15 });
		const onGenerate = vi.fn();
		render(<RoundControls {...buildProps({ settings, onGenerate })} />);

		await user.click(screen.getByRole("button", { name: "產生本輪對戰" }));

		expect(onGenerate).toHaveBeenCalledTimes(1);
		expect(onGenerate).toHaveBeenCalledWith(settings);
	});

	it("可出場人數不足一場時產生按鈕 disabled 並顯示繁體中文原因", () => {
		// 雙打情境（test-plan 指定的驗收情境）：每場需 4 人，可出場僅 3 人。
		const doubles = render(
			<RoundControls
				{...buildProps({
					settings: buildSettings({ format: "doubles" }),
					activePlayerCount: 3,
				})}
			/>,
		);
		expect(
			(doubles.getByRole("button", { name: "產生本輪對戰" }) as HTMLButtonElement).disabled,
		).toBe(true);
		expect(doubles.getByText(/4 人/)).not.toBeNull();
		expect(doubles.getByText(/目前可出場人數/)).not.toBeNull();
		expect(doubles.getByText(/3 人/)).not.toBeNull();
		doubles.unmount();

		// 額外覆蓋單打情境：確保所需人數取自 PLAYERS_PER_MATCH[format]，而非把雙打的
		// 4 寫死——若寫死為 4，此處單打每場僅需 2 人的案例會轉紅。
		const singles = render(
			<RoundControls
				{...buildProps({
					settings: buildSettings({ format: "singles" }),
					activePlayerCount: 1,
				})}
			/>,
		);
		expect(
			(singles.getByRole("button", { name: "產生本輪對戰" }) as HTMLButtonElement).disabled,
		).toBe(true);
		expect(singles.getByText(/2 人/)).not.toBeNull();
		expect(singles.getByText(/1 人/)).not.toBeNull();
		singles.unmount();

		// 邊界覆蓋：可出場人數剛好等於所需人數時視為足夠，按鈕不得 disabled——
		// 判定式 MUST 為「<」而非「<=」，否則剛好足額的情況會被誤判為不足。
		const exact = render(
			<RoundControls
				{...buildProps({
					settings: buildSettings({ format: "doubles" }),
					activePlayerCount: 4,
				})}
			/>,
		);
		expect(
			(exact.getByRole("button", { name: "產生本輪對戰" }) as HTMLButtonElement).disabled,
		).toBe(false);
		exact.unmount();
	});

	it("無目前回合或場次全部完成時不顯示重設再排入口", () => {
		const withoutRound = render(<RoundControls {...buildProps({ round: null })} />);
		expect(withoutRound.queryByRole("button", { name: "重設／再排" })).toBeNull();
		withoutRound.unmount();

		const allCompletedRound = buildRound({
			matches: [
				buildMatch({
					status: "completed",
					scores: { teamA: 11, teamB: 5 },
					winner: "teamA",
					completedAt: "2026-08-23T01:00:00.000Z",
					playerRatings: [
						{ playerId: "p1", before: 3, after: 3.1 },
						{ playerId: "p2", before: 3, after: 2.9 },
					],
				}),
			],
		});
		const withCompletedRound = render(
			<RoundControls {...buildProps({ round: allCompletedRound })} />,
		);
		expect(withCompletedRound.queryByRole("button", { name: "重設／再排" })).toBeNull();
		withCompletedRound.unmount();
	});

	it("目前回合仍有未完成場次時顯示重設再排入口並委派回合 capability", async () => {
		const user = userEvent.setup();
		const onReset = vi.fn();
		// 未完成場次刻意用 scoring（而非 pending）：「未完成」判定 MUST 為
		// status !== "completed"，若誤寫成 status === "pending" 這裡會轉紅。
		const round = buildRound({
			matches: [
				buildMatch({
					id: "match-1",
					status: "completed",
					scores: { teamA: 11, teamB: 5 },
					winner: "teamA",
					completedAt: "2026-08-23T01:00:00.000Z",
					playerRatings: [
						{ playerId: "p1", before: 3, after: 3.1 },
						{ playerId: "p2", before: 3, after: 2.9 },
					],
				}),
				buildMatch({ id: "match-2", status: "scoring" }),
			],
		});
		render(<RoundControls {...buildProps({ round, onReset })} />);

		const resetButton = screen.getByRole("button", { name: "重設／再排" });
		await user.click(resetButton);

		expect(onReset).toHaveBeenCalledTimes(1);
	});

	// regression guard：補強 onSettingsChange 這條對外契約（不對應任何 spec 驗收錨點）。
	// 三個設定控制項（對戰方式／場地數加減／目標分數）都必須把「完整的下一個設定物件」
	// 回呼給父層，而不是只回傳有改動的欄位，也不能順手把其他欄位重設掉。
	it("onSettingsChange 契約：對戰方式／場地數／目標分數變更皆以完整設定物件回呼", async () => {
		const user = userEvent.setup();
		const settings = buildSettings({ format: "singles", courtCount: 3, targetScore: 21 });
		const onSettingsChange = vi.fn();
		render(<RoundControls {...buildProps({ settings, onSettingsChange })} />);

		const formatGroup = screen.getByRole("radiogroup", { name: "對戰方式" });
		await user.click(within(formatGroup).getByRole("radio", { name: "雙打" }));
		expect(onSettingsChange).toHaveBeenNthCalledWith(1, {
			format: "doubles",
			courtCount: 3,
			targetScore: 21,
		});

		await user.click(screen.getByRole("button", { name: "增加場地數" }));
		expect(onSettingsChange).toHaveBeenNthCalledWith(2, {
			format: "singles",
			courtCount: 4,
			targetScore: 21,
		});

		await user.click(screen.getByRole("button", { name: "減少場地數" }));
		expect(onSettingsChange).toHaveBeenNthCalledWith(3, {
			format: "singles",
			courtCount: 2,
			targetScore: 21,
		});

		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		await user.click(within(targetGroup).getByRole("radio", { name: "15" }));
		expect(onSettingsChange).toHaveBeenNthCalledWith(4, {
			format: "singles",
			courtCount: 3,
			targetScore: 15,
		});

		expect(onSettingsChange).toHaveBeenCalledTimes(4);
	});

	// regression guard：補強 Decision 5 嚴格版鎖定條件——「有回合就鎖」不依場次是否存在，
	// 不對應任何 spec 驗收錨點（spec 的鎖定 Scenario 用的固定資料一律帶至少一場）。
	it("回合存在但尚無場次時目標分數仍鎖定，且不顯示重設再排入口", () => {
		const round = buildRound({ matches: [] });
		render(<RoundControls {...buildProps({ round })} />);

		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		const radios = within(targetGroup).getAllByRole("radio");
		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(true);
		});
		expect(screen.queryByText(/本輪已鎖定/)).not.toBeNull();
		expect(screen.queryByRole("button", { name: "重設／再排" })).toBeNull();
	});
});
