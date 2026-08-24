// components/matchmaker/CourtCard.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourtCard } from "./CourtCard";
import type { CourtCardProps } from "./CourtCard";
import type { Player } from "@/lib/matchmaker/types";
import type { RoundMatch } from "@/lib/matchmaker/round-types";

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

// 測試專用預設 props：match／players 給合法單打初始值，其餘 callback 一律用 vi.fn()——
// CourtCard 不持有任何 store（design Decision 9），測試不需要 mock 任何東西。
function buildProps(overrides: Partial<CourtCardProps> = {}): CourtCardProps {
	return {
		match: buildMatch(),
		players: [
			buildPlayer({ id: "p1" }),
			buildPlayer({ id: "p2", name: "陳小華", gender: "female" }),
		],
		onSubmitScore: vi.fn(),
		submitError: null,
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
		// 未完成場次不得預先鎖住欄位——與 8.5 的「已完成場次才 disabled」互為對照組。
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

		// 完成場次的色塊 MUST 套用 playerTileStyle(..., { completed: true }) 的減弱樣式
		// （design Decision 8）——這裡驗證的是 CourtCard 有沒有把 completed 正確 wiring
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
		// 避免測試在不同時區的機器上假紅（design Open Questions 3）。
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
		// 分隔角色（design Decision 4）——不能只驗有沒有渲染 ScoreEntry，位置本身就是
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
});
