// components/matchmaker/RoundControls.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoundControls } from "./RoundControls";
import type { RoundControlsProps } from "./RoundControls";
import { ROUND_TIMER_LOCKED_REASON } from "@pickball/core/matchmaker/labels";
import { createRoundSettings } from "@/lib/matchmaker/round-settings";
import type { RoundSettings } from "@/lib/matchmaker/round-settings";
import type { Round, RoundMatch } from "@pickball/core/matchmaker/round-types";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { MatchSlots } from "@/lib/scoreboard/match-slots";

// 測試專用預設 props：settings 給合法初始值，其餘 callback 一律用 vi.fn()——
// 本元件不持有任何 store，測試因此不需要 mock 任何東西。
// matchSlots／setTargetScore 為必填 props：matchSlots 預設空集合
// （無任何場次開始場邊計分），setTargetScore 預設 vi.fn()——多數既有測試不涉及
// 目標分數鎖定判定或變更委派，給這兩個預設值即可，需要的測試再各自 override。
// setTimerDuration／startTimer 同為必填 props，理由與上述兩個相同：
// 既有測試都不涉及計時，一律給 vi.fn() 預設值，涉及計時的測試再各自 override。
function buildProps(overrides: Partial<RoundControlsProps> = {}): RoundControlsProps {
	return {
		settings: createRoundSettings(),
		onSettingsChange: vi.fn(),
		round: null,
		activePlayerCount: 10,
		matchSlots: {},
		setTargetScore: vi.fn(),
		setTimerDuration: vi.fn(),
		startTimer: vi.fn(),
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
		// Round 的 timer 欄位（null 代表不計時）；本檔既有案例都不涉及計時，
		// 一律給不計時，避免既有斷言被無關的計時狀態干擾。
		timer: null,
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

	// 目標分數選擇器的鎖定規則是「本輪已開始計分才鎖」（而非「有回合就鎖」）——
	// 鎖定與否 MUST 委派 isTargetScoreLocked(round, matchSlots)。此處以「計分板槽非 setup」這個新增的
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

	// isTargetScoreLocked 的兩個鎖定條件是 OR，本檔原本只以
	// 「計分板槽非 setup」觸發過鎖定，另一條（任一場次非 pending）在本元件層零覆蓋——
	// 把傳入的 round.matches 換成空陣列，本檔所有測試仍全綠（只有 match-stage.spec.ts
	// 的 e2e 會轉紅）。這條補上「有已完成場次但完全沒有計分板槽」的情境，讓兩個條件
	// 在元件層各自被釘住。
	it("任一場次已完成時目標分數選擇器 disabled，即使完全沒有計分板槽", () => {
		const round = buildRound({
			targetScore: 15,
			matches: [
				buildMatch({
					status: "completed",
					scores: { teamA: 11, teamB: 5 },
					winner: "teamA",
					completedAt: "2026-08-23T01:00:00.000Z",
				}),
			],
		});
		render(<RoundControls {...buildProps({ round, matchSlots: {} })} />);
		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		const radios = within(targetGroup).getAllByRole("radio");

		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(true);
		});
		expect(screen.getByText("本輪已開始計分，目標分數不可更改。")).not.toBeNull();
	});

	// 回合存在但尚未開始計分時仍可更改，
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
		// 雙打情境：每場需 4 人，可出場僅 3 人。
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
			timerDurationMinutes: null,
		});

		await user.click(screen.getByRole("button", { name: "增加場地數" }));
		expect(onSettingsChange).toHaveBeenNthCalledWith(2, {
			format: "singles",
			courtCount: 4,
			targetScore: 21,
			timerDurationMinutes: null,
		});

		await user.click(screen.getByRole("button", { name: "減少場地數" }));
		expect(onSettingsChange).toHaveBeenNthCalledWith(3, {
			format: "singles",
			courtCount: 2,
			targetScore: 21,
			timerDurationMinutes: null,
		});

		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		await user.click(within(targetGroup).getByRole("radio", { name: "15" }));
		expect(onSettingsChange).toHaveBeenNthCalledWith(4, {
			format: "singles",
			courtCount: 3,
			targetScore: 15,
			timerDurationMinutes: null,
		});

		expect(onSettingsChange).toHaveBeenCalledTimes(4);
	});

	// 鎖定規則為 isTargetScoreLocked(round, matchSlots)——沒有任何場次即代表「所有場次皆為
	// pending」與「沒有任何槽離開 setup」皆 vacuously 成立，依 spec 的放寬條件應為
	// 未鎖定。元件 SHALL NOT 以「round !== null」判斷鎖定，故回合存在不等於鎖定。
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
		// 是各自獨立的判斷，此斷言不受鎖定規則影響）。
		expect(screen.queryByRole("button", { name: "重設／再排" })).toBeNull();
	});

	// 真實鍵盤路徑無法命中 handleTargetScoreKeyDown 內的 if (locked) return;
	// ——鎖定時三顆 radio 皆 disabled，Tab 進不去容器，方向鍵事件根本不會發生。E2E（
	// match-stage.spec.ts 的「目標分數 radiogroup」測試）因此只驗 disabled／aria-checked，
	// 這條防線本身改由這裡的 fireEvent.keyDown 直接對容器派發事件覆蓋——RTL 的 fireEvent
	// 不受「disabled 元素不可聚焦」限制，能真正命中 handler 內部邏輯。
	it("目標分數鎖定時方向鍵不得呼叫 onSettingsChange 或 setTargetScore，也不改變選取（覆蓋 if (locked) return; 防線）", () => {
		// round 本身不等於鎖定，此處額外帶一個
		// 非 setup 的計分板槽讓本輪確實「已開始計分」，維持這條 it 原本要驗證的
		// 「鎖定時方向鍵無效」意圖不變。
		//
		// 回合存在時的變更委派 setTargetScore、不經過 onSettingsChange，
		// 只斷言「不得呼叫 onSettingsChange」會變成恆真
		// （aria-checked 也不會變，因為 setTargetScore 是 spy、不會真的改動 round）——
		// 必須連 setTargetScore 一起釘住，這條防線才重新有偵測力。
		const round = buildRound({ targetScore: 15 });
		const matchSlots: MatchSlots = { "match-1": buildSlot({ status: "playing" }) };
		const onSettingsChange = vi.fn();
		const setTargetScore = vi.fn();
		render(
			<RoundControls
				{...buildProps({
					round,
					matchSlots,
					settings: buildSettings({ targetScore: 15 }),
					onSettingsChange,
					setTargetScore,
				})}
			/>,
		);

		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		fireEvent.keyDown(targetGroup, { key: "ArrowRight" });

		expect(onSettingsChange).not.toHaveBeenCalled();
		expect(setTargetScore).not.toHaveBeenCalled();
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

	// handleTargetScoreKeyDown 的起算索引 MUST 取自「畫面上選中的值」（displayedTargetScore），
	// SHALL NOT 取自 settings——任何呼叫端傳入的 settings 都可能與目前回合分歧，以 settings
	// 起算會讓方向鍵從畫面上看不到的位置開始移動，與計時方向鍵的規則一致。
	// 起算刻意用 ArrowRight：從畫面選中的 15（index 1）往右為 21，而以 settings 的 11
	// （index 0）起算往右會是 15，兩者結果不同才測得出來。
	it("目標分數方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算", () => {
		const round = buildRound({ targetScore: 15, matches: [buildMatch({ status: "pending" })] });
		const setTargetScore = vi.fn();
		render(
			<RoundControls
				{...buildProps({
					round,
					matchSlots: {},
					settings: buildSettings({ targetScore: 11 }),
					setTargetScore,
				})}
			/>,
		);

		const targetGroup = screen.getByRole("radiogroup", { name: "目標分數" });
		// 前提：畫面上選中的是回合的 15，而非 settings 的 11。
		const checkedBefore = within(targetGroup)
			.getAllByRole("radio")
			.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checkedBefore[0].textContent).toBe("15");

		fireEvent.keyDown(targetGroup, { key: "ArrowRight" });

		expect(setTargetScore).toHaveBeenCalledTimes(1);
		expect(setTargetScore).toHaveBeenCalledWith(21);
		// focus 也 MUST 落在新選中的那一顆。
		expect(document.activeElement?.textContent).toBe("21");
	});

	// 計時設定控制項。選項清單為「不計時」＋ round-lifecycle 匯出的
	// ROUND_TIMER_DURATION_OPTIONS（10／15／20），元件內 SHALL NOT 另寫一份
	// [10, 15, 20]；此處只釘住畫面上的四個選項、其可用性與預設選中項。
	it("計時選項為不計時／10／15／20 分鐘且預設選中不計時", () => {
		render(<RoundControls {...buildProps({ round: null })} />);
		const timerGroup = screen.getByRole("radiogroup", { name: "計時" });
		const radios = within(timerGroup).getAllByRole("radio");

		expect(radios).toHaveLength(4);
		expect(radios.map((radio) => radio.textContent)).toEqual([
			"不計時",
			"10 分鐘",
			"15 分鐘",
			"20 分鐘",
		]);
		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(false);
		});
		const checked = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toBe("不計時");
		// roving tabindex（WAI-ARIA APG radio group）：只有選中項可被 Tab 聚焦，其餘為 -1。
		expect(radios.map((radio) => radio.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
		// 尚無目前回合時不應顯示鎖定說明——避免鎖定文字被寫死成恆顯示。
		expect(screen.queryByText(ROUND_TIMER_LOCKED_REASON)).toBeNull();
	});

	// 鎖定與否重用 isTargetScoreLocked 的 locked 布林值（此處以
	// 「任一場次 completed」這條件觸發），但顯示的原因文案 MUST 是 labels.ts 的
	// ROUND_TIMER_LOCKED_REASON，而非 isTargetScoreLocked 回傳的 reason。
	it("本輪已開始計分時計時控制項 disabled 並顯示鎖定原因", () => {
		const round = buildRound({
			timer: { durationMinutes: 10, startedAt: null },
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
		render(<RoundControls {...buildProps({ round, matchSlots: {} })} />);
		const timerGroup = screen.getByRole("radiogroup", { name: "計時" });
		const radios = within(timerGroup).getAllByRole("radio");

		expect(radios).toHaveLength(4);
		radios.forEach((radio) => {
			expect((radio as HTMLButtonElement).disabled).toBe(true);
		});
		const checked = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toBe("10 分鐘");
		expect(screen.getByText(ROUND_TIMER_LOCKED_REASON)).not.toBeNull();
		// 文案本身也釘住：套在計時控制項旁的說明 SHALL NOT 提及「目標分數」。
		expect(ROUND_TIMER_LOCKED_REASON).not.toContain("目標分數");
	});

	// 計時長度刻意用 20（前兩條計時測試用 10）：fixture 對 durationMinutes 只餵單一值時，
	// 「忽略該欄位、寫死一個值」的實作會恆綠。
	it("已設定計時長度且尚未開始時顯示可點擊的開始計時按鈕", () => {
		const round = buildRound({ timer: { durationMinutes: 20, startedAt: null } });
		render(<RoundControls {...buildProps({ round })} />);

		const startButton = screen.getByRole("button", { name: "開始計時" }) as HTMLButtonElement;
		expect(startButton.disabled).toBe(false);
	});

	// spec 明訂條件不成立時 MUST 不渲染，SHALL NOT 渲染一顆恆為 disabled 的按鈕——
	// 因此三種情境都用 queryByRole 斷言「不存在」而非斷言 disabled。
	it("不計時或計時已開始時不顯示開始計時按鈕", () => {
		const withoutTimer = render(
			<RoundControls {...buildProps({ round: buildRound({ timer: null }) })} />,
		);
		expect(withoutTimer.queryByRole("button", { name: "開始計時" })).toBeNull();
		withoutTimer.unmount();

		const started = render(
			<RoundControls
				{...buildProps({
					round: buildRound({
						timer: { durationMinutes: 15, startedAt: "2026-08-23T00:30:00.000Z" },
					}),
				})}
			/>,
		);
		expect(started.queryByRole("button", { name: "開始計時" })).toBeNull();
		started.unmount();

		// 尚無目前回合時同樣沒有可開始的計時。
		const withoutRound = render(<RoundControls {...buildProps({ round: null })} />);
		expect(withoutRound.queryByRole("button", { name: "開始計時" })).toBeNull();
		withoutRound.unmount();
	});

	it("點擊開始計時會呼叫注入的 startTimer 一次", async () => {
		const user = userEvent.setup();
		const startTimer = vi.fn();
		const setTimerDuration = vi.fn();
		const round = buildRound({ timer: { durationMinutes: 20, startedAt: null } });
		render(<RoundControls {...buildProps({ round, startTimer, setTimerDuration })} />);

		await user.click(screen.getByRole("button", { name: "開始計時" }));

		expect(startTimer).toHaveBeenCalledTimes(1);
		// 零參數：now 由 useRoundStore 注入，本元件不得把事件物件或時間傳進去。
		expect(startTimer).toHaveBeenCalledWith();
		// 「開始計時」是獨立入口，SHALL NOT 順手改動計時長度。
		expect(setTimerDuration).not.toHaveBeenCalled();
	});

	// 不對應 spec 驗收錨點，為 regression guard（加入即綠）：
	// 上述五條 spec 測試都沒有點過計時選項，因此「回合存在時仍走 onSettingsChange」與
	// 「尚無回合時改走 setTimerDuration」兩種接線反轉都測不出來。比照既有的
	// 「onSettingsChange 契約」與「回合存在但尚未開始計分時……委派 setTargetScore」兩條
	// 對目標分數的覆蓋方式，替計時補上同一組斷言。
	it("計時變更契約：尚無回合時以完整設定物件回呼 onSettingsChange，回合存在時委派 setTimerDuration", async () => {
		const user = userEvent.setup();
		const settings = buildSettings({ format: "doubles", courtCount: 3, targetScore: 15 });
		const onSettingsChange = vi.fn();
		const setTimerDuration = vi.fn();
		const withoutRound = render(
			<RoundControls
				{...buildProps({ round: null, settings, onSettingsChange, setTimerDuration })}
			/>,
		);
		await user.click(
			within(withoutRound.getByRole("radiogroup", { name: "計時" })).getByRole("radio", {
				name: "15 分鐘",
			}),
		);
		expect(onSettingsChange).toHaveBeenCalledTimes(1);
		expect(onSettingsChange).toHaveBeenCalledWith({
			format: "doubles",
			courtCount: 3,
			targetScore: 15,
			timerDurationMinutes: 15,
		});
		expect(setTimerDuration).not.toHaveBeenCalled();
		withoutRound.unmount();

		// 回合存在且尚未開始計分：變更 MUST 委派 round-lifecycle 的 setTimerDuration，
		// SHALL NOT 走 onSettingsChange（那是給「尚無回合」情境的預備設定用的）。
		// 起始長度 10、點選 20，兩個值不同才能證明傳進去的是被點的那一個。
		const round = buildRound({
			timer: { durationMinutes: 10, startedAt: null },
			matches: [buildMatch({ status: "pending" })],
		});
		const onSettingsChangeWithRound = vi.fn();
		const setTimerDurationWithRound = vi.fn();
		render(
			<RoundControls
				{...buildProps({
					round,
					matchSlots: {},
					onSettingsChange: onSettingsChangeWithRound,
					setTimerDuration: setTimerDurationWithRound,
				})}
			/>,
		);
		await user.click(
			within(screen.getByRole("radiogroup", { name: "計時" })).getByRole("radio", {
				name: "20 分鐘",
			}),
		);
		expect(setTimerDurationWithRound).toHaveBeenCalledTimes(1);
		expect(setTimerDurationWithRound).toHaveBeenCalledWith(20);
		expect(onSettingsChangeWithRound).not.toHaveBeenCalled();
	});

	// regression guard：比照目標分數既有的同款測試——鎖定時四顆
	// radio 皆 disabled，真實鍵盤路徑進不了容器，handleTimerKeyDown 內的 if (locked) return;
	// 只能用 fireEvent 直接對容器派發事件才命中得到。
	it("計時鎖定時方向鍵不得呼叫 setTimerDuration 或 onSettingsChange，也不改變選取（覆蓋 if (locked) return; 防線）", () => {
		const round = buildRound({ timer: { durationMinutes: 10, startedAt: null } });
		const matchSlots: MatchSlots = { "match-1": buildSlot({ status: "playing" }) };
		const onSettingsChange = vi.fn();
		const setTimerDuration = vi.fn();
		render(
			<RoundControls
				{...buildProps({ round, matchSlots, onSettingsChange, setTimerDuration })}
			/>,
		);

		const timerGroup = screen.getByRole("radiogroup", { name: "計時" });
		fireEvent.keyDown(timerGroup, { key: "ArrowRight" });

		expect(onSettingsChange).not.toHaveBeenCalled();
		expect(setTimerDuration).not.toHaveBeenCalled();
		const checked = within(timerGroup)
			.getAllByRole("radio")
			.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toBe("10 分鐘");
	});

	// regression guard（加入即綠）：handleTimerKeyDown 的起算索引
	// MUST 取自「畫面上選中的值」（displayedTimerDuration），SHALL NOT 取自 settings——
	// 回合已產生後 settings.timerDurationMinutes 不再被同步（page.tsx 只在無回合時才寫回
	// settings），兩者會分歧，以 settings 起算會讓方向鍵從畫面上看不到的位置開始移動。
	// 把起算值換成 settings.timerDurationMinutes 時本檔其他測試全綠，這條補上偵測力。
	// 起算刻意用 ArrowLeft：從畫面選中的「20 分鐘」（index 3）往左為 15，而以 settings
	// 的 null（index 0）起算往左會循環到 20，兩者結果不同才測得出來。
	it("計時方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算", () => {
		const round = buildRound({
			timer: { durationMinutes: 20, startedAt: null },
			matches: [buildMatch({ status: "pending" })],
		});
		const setTimerDuration = vi.fn();
		render(
			<RoundControls
				{...buildProps({
					round,
					matchSlots: {},
					settings: buildSettings({ timerDurationMinutes: null }),
					setTimerDuration,
				})}
			/>,
		);

		const timerGroup = screen.getByRole("radiogroup", { name: "計時" });
		// 前提：畫面上選中的是回合的 20 分鐘，而非 settings 的「不計時」。
		const checkedBefore = within(timerGroup)
			.getAllByRole("radio")
			.filter((radio) => radio.getAttribute("aria-checked") === "true");
		expect(checkedBefore[0].textContent).toBe("20 分鐘");

		fireEvent.keyDown(timerGroup, { key: "ArrowLeft" });

		expect(setTimerDuration).toHaveBeenCalledTimes(1);
		expect(setTimerDuration).toHaveBeenCalledWith(15);
		// focus 也 MUST 落在新選中的那一顆，而不是索引錯位後的另一顆。
		expect(document.activeElement?.textContent).toBe("15 分鐘");
	});

	// 對照組（regression guard）：未鎖定時方向鍵應正常運作，證明上一條測到的是「鎖定」
	// 這個條件本身，而不是 fireEvent.keyDown 這個手法本來就測不出東西。
	it("計時未鎖定時方向鍵呼叫 onSettingsChange 並移動到下一個選項", () => {
		const settings = buildSettings({ timerDurationMinutes: null });
		const onSettingsChange = vi.fn();
		render(<RoundControls {...buildProps({ round: null, settings, onSettingsChange })} />);

		const timerGroup = screen.getByRole("radiogroup", { name: "計時" });
		fireEvent.keyDown(timerGroup, { key: "ArrowRight" });

		expect(onSettingsChange).toHaveBeenCalledTimes(1);
		expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, timerDurationMinutes: 10 });
	});
});
