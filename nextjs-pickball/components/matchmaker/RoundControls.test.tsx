// components/matchmaker/RoundControls.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoundControls } from "./RoundControls";
import type { RoundControlsProps } from "./RoundControls";
import { createRoundSettings } from "@/lib/matchmaker/round-settings";
import type { RoundSettings } from "@/lib/matchmaker/round-settings";
import type { Round, RoundMatch } from "@/lib/matchmaker/round-types";
import { createInitialState } from "@/lib/scoreboard/reducer";
import type { MatchSlots } from "@/lib/scoreboard/match-slots";

// 測試專用預設 props：settings 給合法初始值，其餘 callback 一律用 vi.fn()——
// 本元件不持有任何 store（design Decision 9），測試因此不需要 mock 任何東西。
// matchSlots／setTargetScore 為 8.6 新增的必填 props：matchSlots 預設空集合
// （無任何場次開始場邊計分），setTargetScore 預設 vi.fn()——多數既有測試不涉及
// 目標分數鎖定判定或變更委派，給這兩個預設值即可，需要的測試再各自 override。
function buildProps(overrides: Partial<RoundControlsProps> = {}): RoundControlsProps {
	return {
		settings: createRoundSettings(),
		onSettingsChange: vi.fn(),
		round: null,
		activePlayerCount: 10,
		matchSlots: {},
		setTargetScore: vi.fn(),
		onGenerate: vi.fn(),
		onReset: vi.fn(),
		...overrides,
	};
}

// 建立計分板槽測試 fixture：只在需要模擬「該場已開始場邊計分」的測試中使用，
// 逐欄沿用 createInitialState 的預設值再覆寫 status，不使用 as any。
function buildSlot(overrides: Partial<ReturnType<typeof createInitialState>> = {}) {
	return { ...createInitialState({ matchId: "match-1" }), ...overrides };
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

	// match-stage delta 的 MODIFIED「目標分數選擇器」（8.5①）：M5 的舊規則是「有回合就
	// 鎖」，本 change 放寬為「本輪已開始計分才鎖」——鎖定與否 MUST 委派 §5.10 的
	// isTargetScoreLocked(round, matchSlots)。此處以「計分板槽非 setup」這個新增的
	// OR 條件觸發鎖定（場次本身仍為 pending），驗證元件確實把 matchSlots 一併考慮進去，
	// 而不是只看回合是否存在。
	it("本輪已開始計分時目標分數選擇器 disabled 並顯示鎖定原因", () => {
		const round = buildRound({ targetScore: 15, matches: [buildMatch({ status: "pending" })] });
		const matchSlots: MatchSlots = { "match-1": buildSlot({ status: "playing" }) };
		render(<RoundControls {...buildProps({ round, matchSlots })} />);
		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		const radios = within(targetGroup).getAllByRole("radio");

		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(true);
		});
		const checked = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toBe("15");
		// 畫面顯示的是 isTargetScoreLocked 回傳的鎖定原因，而非元件自行硬寫的文案。
		expect(screen.getByText("本輪已開始計分，目標分數不可更改。")).not.toBeNull();
	});

	// 8.5②：本次放寬的唯一可觀察差異——回合存在但尚未開始計分時仍可更改，
	// 變更委派回合 capability 的 setTargetScore（而非 onSettingsChange，那是給
	// 「尚無回合」情境下的未來設定值用的）。
	it("回合存在但尚未開始計分時目標分數選擇器 enabled 且變更委派 setTargetScore", async () => {
		const user = userEvent.setup();
		const round = buildRound({ targetScore: 11, matches: [buildMatch({ status: "pending" })] });
		const setTargetScore = vi.fn();
		render(<RoundControls {...buildProps({ round, matchSlots: {}, setTargetScore })} />);
		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		const radios = within(targetGroup).getAllByRole("radio");

		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(false);
		});

		await user.click(within(targetGroup).getByRole("radio", { name: "21" }));

		expect(setTargetScore).toHaveBeenCalledTimes(1);
		expect(setTargetScore).toHaveBeenCalledWith(21);
		expect(screen.queryByText(/本輪已開始計分/)).toBeNull();
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

	// 8.5 的必要連帶調整（非官方列出的三項之一，見本次交付說明）：這條 M5 既有 it
	// 原本斷言「有回合就鎖」，M5 的固定資料剛好是 matches: []。MODIFIED 規則改為
	// isTargetScoreLocked(round, matchSlots)——沒有任何場次即代表「所有場次皆為
	// pending」與「沒有任何槽離開 setup」皆 vacuously 成立，依 spec 的放寬條件應為
	// 未鎖定。若不更新此斷言，8.6 SHALL NOT 在元件內以「round !== null」判斷鎖定的
	// 要求將無法達成（該要求與此斷言互斥，兩者不可能同時成立）。
	it("回合存在但尚無場次時目標分數未鎖定（所有條件 vacuously 成立）", () => {
		const round = buildRound({ matches: [] });
		render(<RoundControls {...buildProps({ round })} />);

		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		const radios = within(targetGroup).getAllByRole("radio");
		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(false);
		});
		expect(screen.queryByText(/本輪已開始計分/)).toBeNull();
		// 沒有任何場次時「重設／再排」入口本就不該顯示（hasIncompleteMatch 與鎖定判定
		// 是各自獨立的判斷，此斷言不受本次鎖定規則放寬影響）。
		expect(screen.queryByRole("button", { name: "重設／再排" })).toBeNull();
	});

	// tasks 11 裁決 2：真實鍵盤路徑無法命中 handleTargetScoreKeyDown 內的 if (locked) return;
	// ——鎖定時三顆 radio 皆 disabled，Tab 進不去容器，方向鍵事件根本不會發生。E2E（
	// match-stage.spec.ts 的「目標分數 radiogroup」測試）因此只驗 disabled／aria-checked，
	// 這條防線本身改由這裡的 fireEvent.keyDown 直接對容器派發事件覆蓋——RTL 的 fireEvent
	// 不受「disabled 元素不可聚焦」限制，能真正命中 handler 內部邏輯。
	it("目標分數鎖定時方向鍵不得呼叫 onSettingsChange 或改變選取（覆蓋 if (locked) return; 防線）", () => {
		// 8.5 的必要連帶調整：round 本身不再等於鎖定（MODIFIED 規則），此處額外帶一個
		// 非 setup 的計分板槽讓本輪確實「已開始計分」，維持這條 it 原本要驗證的
		// 「鎖定時方向鍵無效」意圖不變。
		const round = buildRound({ targetScore: 15 });
		const matchSlots: MatchSlots = { "match-1": buildSlot({ status: "playing" }) };
		const onSettingsChange = vi.fn();
		render(
			<RoundControls
				{...buildProps({
					round,
					matchSlots,
					settings: buildSettings({ targetScore: 15 }),
					onSettingsChange,
				})}
			/>,
		);

		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		fireEvent.keyDown(targetGroup, { key: "ArrowRight" });

		expect(onSettingsChange).not.toHaveBeenCalled();
		const radios = within(targetGroup).getAllByRole("radio");
		const checked = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toBe("15");
	});

	// 對照組：未鎖定時方向鍵應正常運作，證明上一條測到的是「鎖定」這個條件本身，
	// 而不是 fireEvent.keyDown 這個手法本身就測不出東西。順帶補上本檔原本完全缺席的
	// 鍵盤導覽 integration 覆蓋（既有測試只覆蓋滑鼠點擊）。
	it("目標分數未鎖定時方向鍵呼叫 onSettingsChange 並移動到下一個選項", () => {
		const settings = buildSettings({ targetScore: 11 });
		const onSettingsChange = vi.fn();
		render(<RoundControls {...buildProps({ round: null, settings, onSettingsChange })} />);

		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		fireEvent.keyDown(targetGroup, { key: "ArrowRight" });

		expect(onSettingsChange).toHaveBeenCalledTimes(1);
		expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, targetScore: 15 });
	});
});
