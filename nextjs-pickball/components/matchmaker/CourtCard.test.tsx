// components/matchmaker/CourtCard.test.tsx
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourtCard } from "./CourtCard";
import type { CourtCardProps } from "./CourtCard";
import type { Player } from "@pickball/core/matchmaker/types";
import type { Round, RoundMatch } from "@pickball/core/matchmaker/round-types";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import { DRAW_LABEL } from "@pickball/core/matchmaker/labels";
import { useSession } from "@/hooks/useSession";
import { putRemoteSlot } from "@/lib/sync/round-api";

// 預設為訪客快照：既有的 it 都走本機分支，不受 CourtCard 讀取 session 影響；
// 雲端分槽的 it 自行覆寫回傳值。
vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(() => ({
		status: "ready",
		authEnabled: false,
		user: null,
		refresh: vi.fn(),
	})),
}));
vi.mock("@/lib/sync/round-api", () => ({ putRemoteSlot: vi.fn() }));

// 測試專用預設球員：colorFrom／colorTo 沿用調色盤既有第一組即可，色塊背景本身不是本檔
// 斷言重點（漸層與對比已由 tile-style.test.ts、colors.test.ts 涵蓋），這裡只需要合法 hex。
function buildPlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "王小明",
		gender: "male",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-23T00:00:00.000Z",
		...overrides,
	};
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

// round 只需型別合法：CourtCard 只在使用者點擊計分板入口時才會讀取 round.format／
// round.targetScore（建立 seed），本檔既有測試皆不涉及點擊入口，給合法預設值即可。
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

// 測試專用預設 props：match／players 給合法單打初始值，其餘 callback 一律用 vi.fn()——
// CourtCard 不持有任何 store，測試不需要 mock 任何東西。
// round／matchSlot 為必填 props：round 給合法預設值，matchSlot 預設 null
// （尚未開始場邊計分），既有測試皆不涉及計分板接線，不受影響。
function buildProps(overrides: Partial<CourtCardProps> = {}): CourtCardProps {
	return {
		match: buildMatch(),
		players: [
			buildPlayer({ id: "p1" }),
			buildPlayer({ id: "p2", name: "陳小華", gender: "female" }),
		],
		round: buildRound(),
		matchSlot: null,
		onSubmitScore: vi.fn(),
		submitError: null,
		onSwapPlayer: vi.fn(),
		swapError: null,
		...overrides,
	};
}

describe("CourtCard", () => {
	it("每個色塊顯示姓名、性別與強度分數", () => {
		const players = [
			buildPlayer({ id: "p1", name: "王小明", gender: "male", rating: 3.5 }),
			buildPlayer({ id: "p2", name: "陳小華", gender: "female", rating: 4.25 }),
		];
		const match = buildMatch({
			teams: [
				{ playerIds: ["p1"], rating: 3.5 },
				{ playerIds: ["p2"], rating: 4.25 },
			],
			// doublesComposition 在真實資料中不會出現在單打場次，但欄位本身允許（round-types.ts
			// 的設計取捨），這裡刻意帶一個雜訊值，驗證顯示條件 MUST 同時檢查 format——只檢查
			// doublesComposition 是否存在會讓這個雜訊值意外顯示出來。
			doublesComposition: "mixed",
		});
		render(<CourtCard {...buildProps({ match, players })} />);

		const tileA = screen.getByTestId("player-tile-p1");
		expect(within(tileA).getByText("王小明")).not.toBeNull();
		expect(within(tileA).getByText(/男/)).not.toBeNull();
		expect(within(tileA).getByText(/3\.50/)).not.toBeNull();

		const tileB = screen.getByTestId("player-tile-p2");
		expect(within(tileB).getByText("陳小華")).not.toBeNull();
		expect(within(tileB).getByText(/女/)).not.toBeNull();
		expect(within(tileB).getByText(/4\.25/)).not.toBeNull();

		// 第一隊（p1）在左欄、第二隊（p2）在右欄，且單打只有一排——防止「兩隊 playerIds
		// 解析對調」或「排／欄互換」等版面變異：僅驗證格內文字，換了位置也測不出來，
		// 兩個座標軸都要釘住。
		expect((tileA.parentElement as HTMLElement).style.gridColumn).toBe("1");
		expect((tileA.parentElement as HTMLElement).style.gridRow).toBe("1");
		expect((tileB.parentElement as HTMLElement).style.gridColumn).toBe("2");
		expect((tileB.parentElement as HTMLElement).style.gridRow).toBe("1");

		// 色塊網格容器固定兩欄（design Risks：極窄容器仍要放得下姓名／性別／分數三行，
		// 版面不得退化成單欄或意外變成四欄）。
		expect(screen.getByTestId("court-match-1-grid").style.gridTemplateColumns).toBe(
			"repeat(2, minmax(0, 1fr))",
		);

		// 色塊 MUST 設最小高度（design Risks）：極窄容器下仍要放得下三行文字，
		// 不必連帶驗證 aspect-square／truncate（既有元件測試不驗 Tailwind class的慣例）。
		expect(tileA.className).toMatch(/min-h-\d/);

		// 單打場次不得顯示雙打組成標示（防止「單打也顯示組成標示」的錯誤實作）。
		expect(screen.queryByText("混雙")).toBeNull();
		expect(screen.queryByText("男雙")).toBeNull();
		expect(screen.queryByText("女雙")).toBeNull();
		expect(screen.queryByText("一般雙打")).toBeNull();
	});

	it("雙打場次顯示男雙女雙混雙或一般雙打的組成標示", () => {
		const players = [
			buildPlayer({ id: "p1", name: "球員一" }),
			buildPlayer({ id: "p2", name: "球員二" }),
			buildPlayer({ id: "p3", name: "球員三" }),
			buildPlayer({ id: "p4", name: "球員四" }),
		];
		const baseMatch = buildMatch({
			format: "doubles",
			teams: [
				{ playerIds: ["p1", "p2"], rating: 6 },
				{ playerIds: ["p3", "p4"], rating: 6 },
			],
		});

		const cases: Array<[NonNullable<RoundMatch["doublesComposition"]>, string]> = [
			["mixed", "混雙"],
			["mens", "男雙"],
			["womens", "女雙"],
			["general", "一般雙打"],
		];

		for (const [doublesComposition, expectedLabel] of cases) {
			const view = render(
				<CourtCard {...buildProps({ match: { ...baseMatch, doublesComposition }, players })} />,
			);
			expect(view.getByText(expectedLabel)).not.toBeNull();
			view.unmount();
		}
	});

	it("場地與隊伍皆有文字標籤使色彩不是唯一資訊來源", () => {
		const players = [
			buildPlayer({ id: "p1", name: "球員一" }),
			buildPlayer({ id: "p2", name: "球員二" }),
			buildPlayer({ id: "p3", name: "球員三" }),
			buildPlayer({ id: "p4", name: "球員四" }),
		];
		const match = buildMatch({
			courtNumber: 2,
			format: "doubles",
			doublesComposition: "general",
			teams: [
				{ playerIds: ["p1", "p2"], rating: 6 },
				{ playerIds: ["p3", "p4"], rating: 6 },
			],
		});
		render(<CourtCard {...buildProps({ match, players })} />);

		expect(screen.getByText(/第 2 場地/)).not.toBeNull();
		expect(screen.getByText("第一隊")).not.toBeNull();
		expect(screen.getByText("第二隊")).not.toBeNull();
	});

	it("比分欄位為 inputMode numeric 並標示所屬隊伍", () => {
		render(<CourtCard {...buildProps()} />);

		const teamAInput = screen.getByLabelText("第一隊比分") as HTMLInputElement;
		const teamBInput = screen.getByLabelText("第二隊比分") as HTMLInputElement;

		expect(teamAInput.getAttribute("inputmode")).toBe("numeric");
		expect(teamBInput.getAttribute("inputmode")).toBe("numeric");
		// 未完成場次不得預先鎖住欄位——與「已完成場次才 disabled」互為對照組。
		expect(teamAInput.disabled).toBe(false);
		expect(teamBInput.disabled).toBe(false);
	});

	it("送出比分會以場次識別與兩隊分數呼叫回合送出函式一次", async () => {
		const user = userEvent.setup();
		const onSubmitScore = vi.fn();
		const match = buildMatch({ id: "match-42" });
		render(<CourtCard {...buildProps({ match, onSubmitScore })} />);

		await user.type(screen.getByLabelText("第一隊比分"), "11");
		await user.type(screen.getByLabelText("第二隊比分"), "7");
		await user.click(screen.getByRole("button", { name: "送出比分" }));

		expect(onSubmitScore).toHaveBeenCalledTimes(1);
		// 傳原始字串而非 Number() 轉換後的值：lib/matchmaker/round.ts 的 validateScoreInput
		// 靠原始字串才分得出「欄位空白」（EMPTY_FIELD）與「非數字」（INVALID_NUMBER）——
		// 先在 UI 轉成數字會讓空白欄位被 Number("") 靜默補成 0，等同把「空白＝0」這條
		// 驗證規則搬進了 UI（違反 UI SHALL NOT 複製驗證規則）。
		expect(onSubmitScore).toHaveBeenCalledWith("match-42", "11", "7");
	});

	// regression guard：不對應任何 spec 驗收錨點，但直接對應一個曾經真實存在的資料完整性
	// 缺陷——只填第一隊的比分就按送出，若 UI 在送出前把空白欄位 Number() 成 0，會傳出
	// ("11", 0)，讓 validateScoreInput 誤判為合法輸入（0 是有效整數）並完成整場比賽，
	// 而非回報 EMPTY_FIELD。這裡驗證空白欄位傳給父層的是原始空字串 ""，不是 "0" 或 0——
	// 是否拒絕這筆輸入，一律交給 lib/matchmaker/round.ts 判斷。
	it("只填一欄比分送出時傳遞原始空字串，不靜默補成 0", async () => {
		const user = userEvent.setup();
		const onSubmitScore = vi.fn();
		const match = buildMatch({ id: "match-42" });
		render(<CourtCard {...buildProps({ match, onSubmitScore })} />);

		await user.type(screen.getByLabelText("第一隊比分"), "11");
		// 第二隊比分欄位刻意不填，直接送出。
		await user.click(screen.getByRole("button", { name: "送出比分" }));

		expect(onSubmitScore).toHaveBeenCalledWith("match-42", "11", "");
	});

	// regression guard：不對應任何 spec 驗收錨點。用「11」「7」這種乾淨輸入無法驗出
	// 「偷偷 Number() 再 String() 回來」或「送出前先 trim()」這類變異——乾淨輸入經過
	// 這些轉換後結果與原字串相同。前導零與前後空白的欄位不受此限：
	// Number("007") 與 String(Number("007")) 皆為 "7"、" 11 ".trim() 為 "11"，
	// 若實作偷偷做了這些轉換，這裡會收到被改寫過的值而非使用者實際輸入的原始字串——
	// 原始字串要不要 trim 是 lib/matchmaker/round.ts 的 parseScoreField 的職責，不是 UI。
	it("送出比分傳遞使用者輸入的原始字串，不做任何往返轉換或前處理", async () => {
		const user = userEvent.setup();

		const onSubmitScoreA = vi.fn();
		const viewA = render(<CourtCard {...buildProps({ onSubmitScore: onSubmitScoreA })} />);
		await user.type(viewA.getByLabelText("第一隊比分"), "007");
		await user.type(viewA.getByLabelText("第二隊比分"), "7");
		await user.click(viewA.getByRole("button", { name: "送出比分" }));
		expect(onSubmitScoreA).toHaveBeenCalledWith("match-1", "007", "7");
		viewA.unmount();

		const onSubmitScoreB = vi.fn();
		const viewB = render(<CourtCard {...buildProps({ onSubmitScore: onSubmitScoreB })} />);
		await user.type(viewB.getByLabelText("第一隊比分"), " 11 ");
		await user.type(viewB.getByLabelText("第二隊比分"), "7");
		await user.click(viewB.getByRole("button", { name: "送出比分" }));
		expect(onSubmitScoreB).toHaveBeenCalledWith("match-1", " 11 ", "7");
		viewB.unmount();
	});

	it("送出失敗時於該場次以 role alert 顯示繁體中文錯誤訊息", () => {
		const message = "兩隊比分相同時無法判定勝方，請確認比分後再試一次。";
		const withError = render(<CourtCard {...buildProps({ submitError: message })} />);
		const alert = withError.getByRole("alert");
		expect(alert.textContent).toBe(message);
		// 錯誤碼（如 SCORE_TIE、VALIDATION_ERROR 等）不得未經轉譯外露。
		expect(alert.textContent).not.toMatch(/[A-Z_]{3,}/);
		withError.unmount();

		// submitError 為 null 時不得渲染 alert 容器（防止「恆顯示 alert」的錯誤實作）。
		const withoutError = render(<CourtCard {...buildProps({ submitError: null })} />);
		expect(withoutError.queryByRole("alert")).toBeNull();
		withoutError.unmount();
	});

	it("在比分欄位按 Enter 會以場次識別與兩隊分數送出一次", async () => {
		const user = userEvent.setup();
		const onSubmitScore = vi.fn();
		const view = render(
			<CourtCard {...buildProps({ match: buildMatch({ id: "match-42" }), onSubmitScore })} />,
		);

		await user.type(view.getByLabelText("第一隊比分"), "11");
		await user.type(view.getByLabelText("第二隊比分"), "7{Enter}");

		expect(onSubmitScore).toHaveBeenCalledTimes(1);
		expect(onSubmitScore).toHaveBeenCalledWith("match-42", "11", "7");
	});

	it("只填一欄比分按 Enter 時與按送出按鈕同樣傳遞原始空字串", async () => {
		const user = userEvent.setup();
		const onSubmitScore = vi.fn();
		const view = render(
			<CourtCard {...buildProps({ match: buildMatch({ id: "match-42" }), onSubmitScore })} />,
		);

		await user.type(view.getByLabelText("第一隊比分"), "11{Enter}");

		expect(onSubmitScore).toHaveBeenCalledTimes(1);
		expect(onSubmitScore).toHaveBeenCalledWith("match-42", "11", "");
	});

	it("已完成場次的比分欄位按 Enter 不會送出", async () => {
		const user = userEvent.setup();
		const onSubmitScore = vi.fn();
		const match = buildMatch({
			status: "completed",
			scores: { teamA: 11, teamB: 5 },
			winner: "teamA",
			completedAt: "2026-08-23T01:00:00.000Z",
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3.1 },
				{ playerId: "p2", before: 3, after: 2.9 },
			],
		});
		const view = render(<CourtCard {...buildProps({ match, onSubmitScore })} />);

		await user.click(view.getByLabelText("第一隊比分"));
		await user.keyboard("{Enter}");

		expect(onSubmitScore).not.toHaveBeenCalled();
	});

	it("比分欄位與送出按鈕包在以場地編號命名的群組內", () => {
		const view = render(<CourtCard {...buildProps({ match: buildMatch({ courtNumber: 2 }) })} />);

		const group = view.getByRole("group", { name: "第 2 場地比分" });
		expect(within(group).getByLabelText("第一隊比分")).not.toBeNull();
		expect(within(group).getByLabelText("第二隊比分")).not.toBeNull();
		expect(within(group).getByRole("button", { name: "送出比分" })).not.toBeNull();
	});

	it("已完成場次的比分欄位與送出按鈕皆為 disabled", () => {
		const match = buildMatch({
			status: "completed",
			scores: { teamA: 11, teamB: 5 },
			winner: "teamA",
			completedAt: "2026-08-23T01:00:00.000Z",
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3.1 },
				{ playerId: "p2", before: 3, after: 2.9 },
			],
		});
		const completedView = render(<CourtCard {...buildProps({ match })} />);

		const teamAInput = completedView.getByLabelText("第一隊比分") as HTMLInputElement;
		const teamBInput = completedView.getByLabelText("第二隊比分") as HTMLInputElement;
		const submitButton = completedView.getByRole("button", { name: "送出比分" }) as HTMLButtonElement;

		expect(teamAInput.disabled).toBe(true);
		expect(teamBInput.disabled).toBe(true);
		expect(submitButton.disabled).toBe(true);

		// 完成場次的色塊 MUST 套用 playerTileStyle(..., { completed: true }) 的減弱樣式，
		// 這裡驗證的是 CourtCard 有沒有把 completed 正確 wiring
		// 進 PlayerTile，不是 playerTileStyle 本身的計算（那已由 tile-style.test.ts 涵蓋）。
		const completedTileStyle = (completedView.getByTestId("player-tile-p1") as HTMLElement).style;
		expect(completedTileStyle.opacity).not.toBe("");
		expect(completedTileStyle.filter).not.toBe("");
		completedView.unmount();

		// 對照組：未完成場次不得套用減弱樣式。兩個方向都要驗證，否則「completed 恆傳
		// true（不論實際場次狀態）」這種變異會被上面那組斷言放過。
		const pendingView = render(<CourtCard {...buildProps()} />);
		const pendingTileStyle = (pendingView.getByTestId("player-tile-p1") as HTMLElement).style;
		expect(pendingTileStyle.opacity).toBe("");
		expect(pendingTileStyle.filter).toBe("");
		pendingView.unmount();
	});

	it("已完成場次顯示最終比分勝方與完成時間", () => {
		// 不硬寫時區換算後的字串——happy-dom 跑在本機時區，改用 Date 物件推導期望值，
		// 避免測試在不同時區的機器上假紅。
		function expectedTimeOf(iso: string): string {
			const date = new Date(iso);
			return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
		}

		const completedAt = "2026-08-23T13:05:00.000Z";
		const match = buildMatch({
			status: "completed",
			scores: { teamA: 11, teamB: 7 },
			winner: "teamA",
			completedAt,
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3.1 },
				{ playerId: "p2", before: 3, after: 2.9 },
			],
		});
		const view = render(<CourtCard {...buildProps({ match })} />);

		// 比分順序敏感（集合式 getByText 會丟掉順序資訊，兩隊對調也測不出來）。
		expect(view.getByTestId(`court-${match.id}-score`).textContent).toBe("11:7");
		// 勝方文字標籤釘住容器的完整文字，而非只查「有沒有『勝』字」——避免標籤與
		// testid 各自漂移到相反的隊伍時仍被判定通過。
		expect(view.getByTestId(`court-${match.id}-team-a`).textContent).toBe("第一隊勝");
		expect(view.getByTestId(`court-${match.id}-completed-at`).textContent).toBe(
			expectedTimeOf(completedAt),
		);
		view.unmount();

		// 補零分支的對照案例：本地時間單位數小時（Asia/Taipei 為 UTC+8，00:05Z → 08:05）
		// 若拿掉 padStart，"8:05" 不會等於 "08:05"，這條案例才會真的執行到補零分支——
		// 上面那條 13:05Z→21:05 的小時本來就是兩位數，測不出拿掉 padStart 的差異。
		const earlyCompletedAt = "2026-08-23T00:05:00.000Z";
		const earlyMatch = buildMatch({
			status: "completed",
			scores: { teamA: 11, teamB: 7 },
			winner: "teamA",
			completedAt: earlyCompletedAt,
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3.1 },
				{ playerId: "p2", before: 3, after: 2.9 },
			],
		});
		const earlyView = render(<CourtCard {...buildProps({ match: earlyMatch })} />);
		expect(earlyView.getByTestId(`court-${earlyMatch.id}-completed-at`).textContent).toBe(
			expectedTimeOf(earlyCompletedAt),
		);
		earlyView.unmount();
	});

	it("勝方以文字標籤標示而非僅以顏色區分", () => {
		// 兩個方向都驗證：只測 teamB 獲勝測不出「teamA 分支被誤植為恆顯示」這類錯誤——
		// 那種實作在 winner 為 teamB 時看起來完全正常，只有 winner 為 teamA 時才會露餡。
		const winsB = render(
			<CourtCard
				{...buildProps({
					match: buildMatch({
						status: "completed",
						scores: { teamA: 5, teamB: 11 },
						winner: "teamB",
						completedAt: "2026-08-23T01:00:00.000Z",
						playerRatings: [
							{ playerId: "p1", before: 3, after: 2.9 },
							{ playerId: "p2", before: 3, after: 3.1 },
						],
					}),
				})}
			/>,
		);
		// 釘住容器的完整文字，而非只查「有沒有『勝』字」——標籤文字與勝方 badge 若各自
		// 用不同資料源（TEAM_LABELS 的順序、match.winner 的比對），兩者可能各自漂移到
		// 相反的隊伍：只驗「某處查得到『勝』」與「某處查不到」測不出這種錯位。
		expect(winsB.getByTestId("court-match-1-team-a").textContent).toBe("第一隊");
		expect(winsB.getByTestId("court-match-1-team-b").textContent).toBe("第二隊勝");
		winsB.unmount();

		const winsA = render(
			<CourtCard
				{...buildProps({
					match: buildMatch({
						status: "completed",
						scores: { teamA: 11, teamB: 5 },
						winner: "teamA",
						completedAt: "2026-08-23T01:00:00.000Z",
						playerRatings: [
							{ playerId: "p1", before: 3, after: 3.1 },
							{ playerId: "p2", before: 3, after: 2.9 },
						],
					}),
				})}
			/>,
		);
		expect(winsA.getByTestId("court-match-1-team-a").textContent).toBe("第一隊勝");
		expect(winsA.getByTestId("court-match-1-team-b").textContent).toBe("第二隊");
		winsA.unmount();
	});

	it("色塊在觸頂或觸底時顯示已達上限或已達下限標示", () => {
		// p3／p4 刻意帶未觸界的 rating，作為對照組：防止「未觸界時也顯示標示」的錯誤實作。
		const players = [
			buildPlayer({ id: "p1", name: "球員一", rating: 8 }),
			buildPlayer({ id: "p2", name: "球員二", rating: 1 }),
			buildPlayer({ id: "p3", name: "球員三", rating: 4 }),
			buildPlayer({ id: "p4", name: "球員四", rating: 4.5 }),
		];
		const match = buildMatch({
			format: "doubles",
			doublesComposition: "general",
			teams: [
				{ playerIds: ["p1", "p2"], rating: 9 },
				{ playerIds: ["p3", "p4"], rating: 8.5 },
			],
		});
		render(<CourtCard {...buildProps({ match, players })} />);

		expect(
			within(screen.getByTestId("player-tile-p1")).getByText("已達上限"),
		).not.toBeNull();
		expect(
			within(screen.getByTestId("player-tile-p2")).getByText("已達下限"),
		).not.toBeNull();
		expect(
			within(screen.getByTestId("player-tile-p3")).queryByText("已達上限"),
		).toBeNull();
		expect(
			within(screen.getByTestId("player-tile-p3")).queryByText("已達下限"),
		).toBeNull();
		// 未觸界時不得顯示任何觸界標示元素（不能只查特定文字——若標示變成文字改成圖示，
		// 上面兩個 queryByText 仍會誤判為「沒有顯示」）。
		expect(
			screen.getByTestId("player-tile-p3").querySelector('[data-slot="badge"]'),
		).toBeNull();

		// 第一隊（p1／p2）在上排、第二隊（p3／p4）在下排，且各自左右分欄——防止「兩隊
		// playerIds 解析對調」「排／欄互換」或「同隊兩人疊在同一欄」等版面變異：僅驗證
		// 格內文字內容或只驗單一座標軸都測不出來，兩個座標軸都要對四格逐一釘住。
		// 雙打的色塊列固定在第 2、4 列（第 1、5 列留給隊伍標籤、第 3 列留給比分區，
		// 詳見 CourtCard 的 tileGridRow：這是本檔選定版面的翻譯結果，不是另一份版面推導）。
		const tileP1 = screen.getByTestId("player-tile-p1").parentElement as HTMLElement;
		const tileP2 = screen.getByTestId("player-tile-p2").parentElement as HTMLElement;
		const tileP3 = screen.getByTestId("player-tile-p3").parentElement as HTMLElement;
		const tileP4 = screen.getByTestId("player-tile-p4").parentElement as HTMLElement;
		expect(tileP1.style.gridRow).toBe("2");
		expect(tileP1.style.gridColumn).toBe("1");
		expect(tileP2.style.gridRow).toBe("2");
		expect(tileP2.style.gridColumn).toBe("2");
		expect(tileP3.style.gridRow).toBe("4");
		expect(tileP3.style.gridColumn).toBe("1");
		expect(tileP4.style.gridRow).toBe("4");
		expect(tileP4.style.gridColumn).toBe("2");

		// 比分與送出控制區必須落在上下兩排「之間」且橫跨兩欄，同時扮演雙打版面「網」的
		// 分隔角色——不能只驗有沒有渲染 ScoreEntry，位置本身就是
		// 這條 Requirement 的一部分（控制區移到最下、或只跨左半，都不該是綠燈）。
		const scoreEntry = screen.getByTestId("court-match-1-score-entry");
		expect(scoreEntry.style.gridRow).toBe("3");
		expect(scoreEntry.style.gridColumn).toBe("1 / 3");

		// 色塊網格容器固定兩欄，雙打與單打共用同一份版面推導來源。
		expect(screen.getByTestId("court-match-1-grid").style.gridTemplateColumns).toBe(
			"repeat(2, minmax(0, 1fr))",
		);

		// 雙打的隊伍標籤本身也要貼在各自那一排色塊旁，而非只驗證標籤文字內容——
		// 標籤文字正確但位置放反（例如第一隊標籤貼到第二隊色塊那排）不該是綠燈，
		// 那正是色彩以外唯一能分辨「哪兩格是同一隊」的線索。
		const teamALabelRow = (screen.getByTestId("court-match-1-team-a").parentElement as HTMLElement)
			.style.gridRow;
		const teamBLabelRow = (screen.getByTestId("court-match-1-team-b").parentElement as HTMLElement)
			.style.gridRow;
		expect(teamALabelRow).toBe("1");
		expect(teamBLabelRow).toBe("5");
	});

	// regression guard：查無球員（該員已被移除，roster.ts 的 removePlayer 不禁止移除仍在
	// 場次中的人）時色塊網格 MUST 略過該格、不得拋出例外讓整張場地卡片崩潰。不對應任何
	// spec 驗收錨點——這是防禦性行為，spec 未明文規範查無球員時的呈現，但「渲染 n-1 格
	// 且不崩潰」是目前實作的既有行為，值得釘住避免日後被 resolveTeamPlayers 的改動破壞。
	it("查無球員時色塊網格略過該員且不拋出例外", () => {
		const players = [buildPlayer({ id: "p1", name: "球員一" })];
		const match = buildMatch({
			format: "doubles",
			doublesComposition: "general",
			teams: [
				{ playerIds: ["p1", "missing-player"], rating: 6 },
				{ playerIds: ["p3", "p4"], rating: 6 },
			],
		});

		expect(() => render(<CourtCard {...buildProps({ match, players })} />)).not.toThrow();
		// 四個 playerId 中只有 p1 能在 players 名單查到，色塊應只渲染 1 格。
		expect(screen.getByTestId("player-tile-p1")).not.toBeNull();
		expect(screen.queryByTestId("player-tile-missing-player")).toBeNull();
		expect(screen.queryByTestId("player-tile-p3")).toBeNull();
		expect(screen.queryByTestId("player-tile-p4")).toBeNull();
	});

	// regression guard：scoring（場邊計分中）狀態不是 completed，比分欄位與送出鈕不得被
	// 鎖定、也不該套用完成場次的視覺與資訊列——RoundControls.test.tsx 已對 scoring 狀態
	// 建立同等規格的覆蓋，此處對齊。不對應任何 spec 驗收錨點（spec 的 disabled／完成資訊
	// Scenario 固定資料只用 completed，未涵蓋 scoring 這個中間態）。
	it("scoring 狀態的場次比分欄位與送出鈕不得被鎖定，也不顯示完成資訊列", () => {
		const match = buildMatch({ status: "scoring" });
		render(<CourtCard {...buildProps({ match })} />);

		const teamAInput = screen.getByLabelText("第一隊比分") as HTMLInputElement;
		const teamBInput = screen.getByLabelText("第二隊比分") as HTMLInputElement;
		const submitButton = screen.getByRole("button", { name: "送出比分" }) as HTMLButtonElement;
		expect(teamAInput.disabled).toBe(false);
		expect(teamBInput.disabled).toBe(false);
		expect(submitButton.disabled).toBe(false);

		expect(screen.queryByTestId(`court-${match.id}-score`)).toBeNull();
		expect(screen.queryByTestId(`court-${match.id}-completed-at`)).toBeNull();

		const tileStyle = (screen.getByTestId("player-tile-p1") as HTMLElement).style;
		expect(tileStyle.opacity).toBe("");
		expect(tileStyle.filter).toBe("");
	});

	// 場地區塊的換人操作。以下六個 it 對應
	// specs/match-stage/spec.md「場地區塊的換人操作」Requirement 的六個 Scenario。

	it("pending 且未開始計分的場次每位球員格皆提供換人操作", () => {
		const players = [
			buildPlayer({ id: "p1", name: "球員一" }),
			buildPlayer({ id: "p2", name: "球員二" }),
			buildPlayer({ id: "p3", name: "球員三" }),
			buildPlayer({ id: "p4", name: "球員四" }),
			buildPlayer({ id: "p5", name: "候補一", isActive: true }),
		];
		const match = buildMatch({
			format: "doubles",
			doublesComposition: "general",
			teams: [
				{ playerIds: ["p1", "p2"], rating: 6 },
				{ playerIds: ["p3", "p4"], rating: 6 },
			],
		});
		const round = buildRound({ matches: [match], restingPlayerIds: ["p5"] });
		render(<CourtCard {...buildProps({ match, players, round })} />);

		// 四位在場球員格，各自應提供一個換人操作（Select 觸發器的 role 為 combobox）。
		expect(screen.getAllByRole("combobox")).toHaveLength(4);
	});

	it("選擇休息名單中的球員後呼叫 onSwapPlayer 並帶入場次 id、換出者與換入者 id", async () => {
		const user = userEvent.setup();
		const onSwapPlayer = vi.fn();
		const players = [
			buildPlayer({ id: "p1", name: "王小明" }),
			buildPlayer({ id: "p2", name: "陳小華", gender: "female" }),
			buildPlayer({ id: "p3", name: "候選一", isActive: true }),
			buildPlayer({ id: "p4", name: "候選二", isActive: true }),
			buildPlayer({ id: "p5", name: "已退出", isActive: false }),
		];
		const match = buildMatch({ id: "match-42" });
		const round = buildRound({ matches: [match], restingPlayerIds: ["p3", "p4", "p5"] });
		render(<CourtCard {...buildProps({ match, players, round, onSwapPlayer })} />);

		const trigger = screen.getByRole("combobox", { name: "替 王小明 換人" });
		await user.click(trigger);
		const option = await screen.findByRole("option", { name: "候選一" });

		// 選項為休息名單中「所有」目前 active 的球員，不是其中任意一位——只斷言「找得到
		// 候選一」測不出「清單被截成只剩第一位」這類變異；同時以非 active 的已退出球員
		// 作為對照，確認 isActive 篩選在正向路徑上同樣生效。
		expect(screen.getAllByRole("option").map((item) => item.textContent)).toEqual([
			"候選一",
			"候選二",
		]);
		expect(screen.queryByRole("option", { name: "已退出" })).toBeNull();

		await user.click(option);

		expect(onSwapPlayer).toHaveBeenCalledTimes(1);
		expect(onSwapPlayer).toHaveBeenCalledWith("match-42", "p1", "p3");
	});

	it("已完成場次不顯示換人操作", () => {
		const match = buildMatch({
			status: "completed",
			scores: { teamA: 11, teamB: 5 },
			winner: "teamA",
			completedAt: "2026-08-23T01:00:00.000Z",
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3.1 },
				{ playerId: "p2", before: 3, after: 2.9 },
			],
		});
		const round = buildRound({ matches: [match], restingPlayerIds: [] });
		render(<CourtCard {...buildProps({ match, round })} />);

		expect(screen.queryAllByRole("combobox")).toHaveLength(0);
	});

	it("已有計分板槽的場次不顯示換人操作", () => {
		const match = buildMatch({ id: "match-1", status: "pending" });
		const round = buildRound({ matches: [match], restingPlayerIds: [] });
		const matchSlot = createInitialState({ matchId: "match-1" });
		render(<CourtCard {...buildProps({ match, round, matchSlot })} />);

		expect(screen.queryAllByRole("combobox")).toHaveLength(0);
	});

	it("休息名單無 active 球員可換時換人操作停用並顯示無可換之人", () => {
		// 休息名單非空但唯一成員已非 active（例如已被移出名單）：候選人篩選 MUST 同時
		// 檢查 isActive，僅檢查「休息名單是否為空」測不出漏篩非 active 球員的變異。
		const players = [
			buildPlayer({ id: "p1" }),
			buildPlayer({ id: "p2", name: "陳小華", gender: "female" }),
			buildPlayer({ id: "p5", name: "已退出", isActive: false }),
		];
		const round = buildRound({ restingPlayerIds: ["p5"] });
		render(<CourtCard {...buildProps({ players, round })} />);

		const triggers = screen.getAllByRole("combobox");
		expect(triggers).toHaveLength(2);
		for (const trigger of triggers) {
			expect((trigger as HTMLButtonElement).disabled).toBe(true);
			expect(trigger.textContent).toContain("無可換之人");
		}

		// 停用原因也 MUST 進入可存取名稱：aria-label 會蓋掉觸發器的內部文字，只驗
		// textContent 的話，讀屏使用者實際聽不到「無可換之人」這件事測不出來。
		// 順帶釘住兩格的可存取名稱在停用狀態下仍互不相同。
		expect(triggers.map((trigger) => trigger.getAttribute("aria-label"))).toEqual([
			"替 王小明 換人（無可換之人）",
			"替 陳小華 換人（無可換之人）",
		]);
	});

	// 平局場次（僅計時回合可能出現）不得為任一隊顯示
	// 「勝」文字標籤，MUST 改顯示「平手」文字標籤——色彩不得為唯一資訊來源（prd.md 12.5），
	// 且顯示任一隊「勝」會誤導使用者以為該隊真的獲勝。
	it("平局場次不顯示任一隊勝方標籤而顯示平手標籤", () => {
		const match = buildMatch({
			status: "completed",
			scores: { teamA: 11, teamB: 11 },
			winner: "draw",
			completedAt: "2026-08-23T01:00:00.000Z",
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3 },
				{ playerId: "p2", before: 3, after: 3 },
			],
		});
		const view = render(<CourtCard {...buildProps({ match })} />);

		// 兩隊都要驗，不是只驗一隊——避免「只有一隊漏改」的變異存活。
		expect(view.getByTestId("court-match-1-team-a").textContent).not.toMatch(/勝/);
		expect(view.getByTestId("court-match-1-team-b").textContent).not.toMatch(/勝/);
		expect(view.getByText(DRAW_LABEL)).not.toBeNull();
		view.unmount();

		// 對照組：非平局的一般勝負場次不得顯示「平手」標籤，防止「平手標籤無條件渲染」
		// 這種變異存活（只驗平局案例測不出恆渲染）。
		const winMatch = buildMatch({
			status: "completed",
			scores: { teamA: 11, teamB: 5 },
			winner: "teamA",
			completedAt: "2026-08-23T01:00:00.000Z",
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3.1 },
				{ playerId: "p2", before: 3, after: 2.9 },
			],
		});
		const winView = render(<CourtCard {...buildProps({ match: winMatch })} />);
		expect(winView.queryByText(DRAW_LABEL)).toBeNull();
		winView.unmount();

		// 第二組對照：比分同樣是 11:11，但 winner 為 "teamA"。這組 fixture 刻意內部不一致
		// （正常資料不會出現），存在的唯一理由是釘住平手標籤的資料來源是 match.winner，
		// 而不是 UI 自己比較兩隊比分——上面平局案例的 11:11 是對稱的，少了這組，把條件寫成
		// match.scores.teamA === match.scores.teamB 的實作測不出任何差異（實測確認該變異在
		// 補這組之前完全存活）。「比分相同是否算平局」是回合層的判定，RoundMatchSchema 只
		// 保證 completed 場次帶有 winner，並未保證「比分相同 ⇔ 平局」，UI SHALL NOT 自行
		// 複製一份這條規則。
		const tieScoreWithWinnerMatch = buildMatch({
			status: "completed",
			scores: { teamA: 11, teamB: 11 },
			winner: "teamA",
			completedAt: "2026-08-23T01:00:00.000Z",
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3.1 },
				{ playerId: "p2", before: 3, after: 2.9 },
			],
		});
		const tieScoreView = render(<CourtCard {...buildProps({ match: tieScoreWithWinnerMatch })} />);
		expect(tieScoreView.queryByText(DRAW_LABEL)).toBeNull();
		expect(tieScoreView.getByTestId("court-match-1-team-a").textContent).toBe("第一隊勝");
		tieScoreView.unmount();
	});

	// UI 層 SHALL NOT 複製「兩隊比分相同是否可送出」這條
	// 驗證規則——一律原樣往上傳，由 round-lifecycle 的
	// validateScoreInput 決定是否接受平局。這條測試證明 CourtCard 本身沒有這種複製。
	it("兩隊比分相同時 UI 仍照常委派送出而不自行攔截", async () => {
		const user = userEvent.setup();
		const onSubmitScore = vi.fn();
		const match = buildMatch({ id: "match-42" });
		render(<CourtCard {...buildProps({ match, onSubmitScore })} />);

		await user.type(screen.getByLabelText("第一隊比分"), "11");
		await user.type(screen.getByLabelText("第二隊比分"), "11");
		await user.click(screen.getByRole("button", { name: "送出比分" }));

		expect(onSubmitScore).toHaveBeenCalledTimes(1);
		expect(onSubmitScore).toHaveBeenCalledWith("match-42", "11", "11");
		// 「有委派」證明不了「沒有攔截」：一個「比分相同時照常委派、但自己另外顯示錯誤」的
		// 實作會通過上面兩條斷言（實測確認這種變異在補這條之前完全存活）。錯誤要不要顯示
		// 一律等 round-lifecycle 回傳後由 submitError 決定，送出當下畫面不得自行冒出 alert。
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("換人被拒絕時顯示帶 role alert 的繁體中文錯誤訊息", () => {
		const message = "換人失敗，請確認休息名單後再試一次。";
		const withError = render(<CourtCard {...buildProps({ swapError: message })} />);
		const alert = withError.getByRole("alert");
		expect(alert.textContent).toBe(message);
		expect(alert.textContent).not.toMatch(/[A-Z_]{3,}/);
		withError.unmount();

		const withoutError = render(<CourtCard {...buildProps({ swapError: null })} />);
		expect(withoutError.queryByRole("alert")).toBeNull();
		withoutError.unmount();
	});
});

describe("CourtCard 的雲端分槽入口", () => {
	afterEach(() => {
		vi.mocked(useSession).mockReturnValue({
			status: "ready",
			authEnabled: false,
			user: null,
			refresh: vi.fn(),
		});
		vi.mocked(putRemoteSlot).mockReset();
	});

	it("雲端建立分槽帶入目前帳號且未授權時刷新 session 並不導向", async () => {
		const refresh = vi.fn().mockResolvedValue(undefined);
		vi.mocked(useSession).mockReturnValue({
			status: "ready",
			authEnabled: true,
			user: { id: "user-a", email: "a@example.com", name: "A" },
			refresh,
		});
		vi.mocked(putRemoteSlot).mockResolvedValue({ kind: "unauthorized" });
		const remoteNavigate = vi.fn();
		render(<CourtCard {...buildProps({ remoteNavigate })} />);

		await userEvent.setup().click(screen.getByRole("link", { name: "進入計分板" }));

		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
		expect(putRemoteSlot).toHaveBeenCalledTimes(1);
		expect(vi.mocked(putRemoteSlot).mock.calls[0][0]).toBe("user-a");
		expect(await screen.findByText("無法建立計分板，請稍後再試")).not.toBeNull();
		expect(remoteNavigate).not.toHaveBeenCalled();
	});
});
