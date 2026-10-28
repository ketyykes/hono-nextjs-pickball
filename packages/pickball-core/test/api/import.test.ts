import { describe, it, expect, expectTypeOf } from "vitest";
import {
  LocalImportRequestSchema,
  LocalImportResponseSchema,
  type LocalImportRequest,
} from "../../src/api/import";
import { createInitialState } from "../../src/scoreboard/reducer";

/** 產生符合 PlayerSchema 的測試資料。 */
function makePlayer(id: string) {
  return {
    id,
    name: `球員${id}`,
    gender: "male",
    colorFrom: "#112233",
    colorTo: "#445566",
    rating: 4,
    restCount: 0,
    gamesPlayed: 0,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** 產生符合 RoundMatchSchema 的場次；completed 須帶齊比分、勝方、完成時間與賽後分數。 */
function makeRoundMatch(id: string, status: "pending" | "scoring" | "completed") {
  const isCompleted = status === "completed";
  return {
    id,
    courtNumber: 1,
    format: "singles",
    teams: [
      { playerIds: ["a"], rating: 4 },
      { playerIds: ["b"], rating: 4 },
    ],
    status,
    scores: isCompleted ? { teamA: 11, teamB: 7 } : null,
    winner: isCompleted ? "teamA" : null,
    completedAt: isCompleted ? "2026-01-01T01:00:00.000Z" : null,
    playerRatings: [
      { playerId: "a", before: 4, after: isCompleted ? 4.1 : null },
      { playerId: "b", before: 4, after: isCompleted ? 3.9 : null },
    ],
  };
}

function makeRound(matches: ReturnType<typeof makeRoundMatch>[]) {
  return {
    roundNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    format: "singles",
    courtCount: 1,
    targetScore: 11,
    matches,
    restingPlayerIds: [],
    seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
    timer: null,
  };
}

/** 產生符合 MatchHistoryEntrySchema 的單打歷史。 */
function makeHistoryEntry(matchId: string) {
  const team = (id: string) => ({
    players: [{ id, name: `球員${id}`, ratingBefore: 4, ratingAfter: 4.1 }],
    rating: 4,
  });
  return {
    matchId,
    courtNumber: 1,
    playedAt: "2026-01-01T00:00:00.000Z",
    format: "singles",
    teamA: team("a"),
    teamB: team("b"),
    scoreA: 11,
    scoreB: 7,
    winner: "teamA",
  };
}

/** 分槽：matchId 由呼叫端指定。 */
function makeSlot(matchId: string | null) {
  return { ...createInitialState({ mode: "singles" }), matchId };
}

/** 一份合法且五段皆有資料的請求；各情境以覆寫單一段落做出變體。 */
function makeValidRequest(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    players: [makePlayer("a"), makePlayer("b")],
    currentRound: makeRound([makeRoundMatch("m1", "pending")]),
    history: [makeHistoryEntry("h1"), makeHistoryEntry("h2")],
    scoreboard: {
      current: createInitialState({ mode: "singles" }),
      matches: [makeSlot("m1")],
    },
    ...overrides,
  };
}

/** 回傳 issue 的 path 清單，用來確認請求是被「預期的那一條檢查」拒絕，而非被其他欄位的格式錯誤擋下。 */
function issuePaths(input: unknown): (string | number)[][] {
  const result = LocalImportRequestSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.map((segment) => (typeof segment === "symbol" ? String(segment) : segment)));
}

describe("本機資料匯入 API 契約", () => {
  it("LocalImportRequestSchema 拒絕重複 id、孤兒分槽與空匯入", () => {
    // 合法基準：五段皆有資料
    expect(LocalImportRequestSchema.safeParse(makeValidRequest()).success).toBe(true);
    // 分槽可對應 pending 與 scoring 的場次
    expect(
      LocalImportRequestSchema.safeParse(
        makeValidRequest({
          currentRound: makeRound([makeRoundMatch("m1", "pending"), makeRoundMatch("m2", "scoring")]),
          scoreboard: { current: null, matches: [makeSlot("m1"), makeSlot("m2")] },
        }),
      ).success,
    ).toBe(true);
    // 只有獨立計分板也是合法匯入（不能要求一定要有名單）
    expect(
      LocalImportRequestSchema.safeParse({
        version: 1,
        players: [],
        currentRound: null,
        history: [],
        scoreboard: { current: createInitialState({ mode: "singles" }), matches: [] },
      }).success,
    ).toBe(true);
    // 只有名單、只有歷史、只有分槽以外的任一段有資料都算非空
    expect(
      LocalImportRequestSchema.safeParse({
        version: 1,
        players: [makePlayer("a")],
        currentRound: null,
        history: [],
        scoreboard: { current: null, matches: [] },
      }).success,
    ).toBe(true);
    expect(
      LocalImportRequestSchema.safeParse({
        version: 1,
        players: [],
        currentRound: null,
        history: [makeHistoryEntry("h1")],
        scoreboard: { current: null, matches: [] },
      }).success,
    ).toBe(true);
    // 回合所有場次皆完成、沒有分槽：合法
    expect(
      LocalImportRequestSchema.safeParse(
        makeValidRequest({
          currentRound: makeRound([makeRoundMatch("m1", "completed")]),
          scoreboard: { current: null, matches: [] },
        }),
      ).success,
    ).toBe(true);

    // 參賽者 id 重複
    const duplicatePlayers = makeValidRequest({ players: [makePlayer("a"), makePlayer("a")] });
    expect(LocalImportRequestSchema.safeParse(duplicatePlayers).success).toBe(false);
    expect(issuePaths(duplicatePlayers)).toContainEqual(["players"]);

    // 歷史 matchId 重複
    const duplicateHistory = makeValidRequest({
      history: [makeHistoryEntry("h1"), makeHistoryEntry("h1")],
    });
    expect(LocalImportRequestSchema.safeParse(duplicateHistory).success).toBe(false);
    expect(issuePaths(duplicateHistory)).toContainEqual(["history"]);

    // 分槽 matchId 重複
    const duplicateSlots = makeValidRequest({
      scoreboard: { current: null, matches: [makeSlot("m1"), makeSlot("m1")] },
    });
    expect(LocalImportRequestSchema.safeParse(duplicateSlots).success).toBe(false);
    expect(issuePaths(duplicateSlots)).toContainEqual(["scoreboard", "matches"]);

    // 孤兒分槽：matchId 不屬於 currentRound 的任何場次
    const orphanSlot = makeValidRequest({
      scoreboard: { current: null, matches: [makeSlot("m1"), makeSlot("ghost")] },
    });
    expect(LocalImportRequestSchema.safeParse(orphanSlot).success).toBe(false);
    expect(issuePaths(orphanSlot)).toContainEqual(["scoreboard", "matches", 1, "matchId"]);

    // 分槽屬於已完成場次
    const completedSlot = makeValidRequest({
      currentRound: makeRound([makeRoundMatch("m1", "pending"), makeRoundMatch("m2", "completed")]),
      scoreboard: { current: null, matches: [makeSlot("m1"), makeSlot("m2")] },
    });
    expect(LocalImportRequestSchema.safeParse(completedSlot).success).toBe(false);
    expect(issuePaths(completedSlot)).toContainEqual(["scoreboard", "matches", 1, "matchId"]);

    // currentRound 為 null 卻有分槽
    const slotWithoutRound = makeValidRequest({ currentRound: null });
    expect(LocalImportRequestSchema.safeParse(slotWithoutRound).success).toBe(false);
    expect(issuePaths(slotWithoutRound)).toContainEqual(["scoreboard", "matches", 0, "matchId"]);

    // 五段皆空
    const emptyImport = {
      version: 1,
      players: [],
      currentRound: null,
      history: [],
      scoreboard: { current: null, matches: [] },
    };
    expect(LocalImportRequestSchema.safeParse(emptyImport).success).toBe(false);
    expect(issuePaths(emptyImport)).toContainEqual([]);

    // version 只接受 1
    expect(LocalImportRequestSchema.safeParse(makeValidRequest({ version: 2 })).success).toBe(false);
    expect(LocalImportRequestSchema.safeParse(makeValidRequest({ version: 0 })).success).toBe(false);

    // 獨立計分板（current）不可綁定場次
    expect(
      LocalImportRequestSchema.safeParse(
        makeValidRequest({ scoreboard: { current: makeSlot("m1"), matches: [] } }),
      ).success,
    ).toBe(false);

    // 分槽（matches）不可有 matchId 為 null 的項目
    expect(
      LocalImportRequestSchema.safeParse(
        makeValidRequest({ scoreboard: { current: null, matches: [makeSlot(null)] } }),
      ).success,
    ).toBe(false);

    // 缺少 scoreboard 整段即格式錯誤
    const { scoreboard: _omitted, ...withoutScoreboard } = makeValidRequest();
    expect(LocalImportRequestSchema.safeParse(withoutScoreboard).success).toBe(false);
  });

  it("LocalImportResponseSchema 只接受固定的回應形狀", () => {
    const base = {
      imported: { players: 3, round: true, slots: 1, history: 3, scoreboardCurrent: "imported" },
    };
    expect(LocalImportResponseSchema.safeParse(base).success).toBe(true);
    for (const scoreboardCurrent of ["imported", "skipped", "none"]) {
      expect(
        LocalImportResponseSchema.safeParse({ imported: { ...base.imported, scoreboardCurrent } }).success,
        scoreboardCurrent,
      ).toBe(true);
    }
    // 零值合法（該段沒有資料）
    expect(
      LocalImportResponseSchema.safeParse({
        imported: { players: 0, round: false, slots: 0, history: 0, scoreboardCurrent: "none" },
      }).success,
    ).toBe(true);
    // 未知的計分板結果、負數、小數、非布林的 round 皆拒絕
    expect(
      LocalImportResponseSchema.safeParse({ imported: { ...base.imported, scoreboardCurrent: "overwritten" } }).success,
    ).toBe(false);
    expect(LocalImportResponseSchema.safeParse({ imported: { ...base.imported, players: -1 } }).success).toBe(false);
    expect(LocalImportResponseSchema.safeParse({ imported: { ...base.imported, slots: -1 } }).success).toBe(false);
    expect(LocalImportResponseSchema.safeParse({ imported: { ...base.imported, history: 1.5 } }).success).toBe(false);
    expect(LocalImportResponseSchema.safeParse({ imported: { ...base.imported, round: "yes" } }).success).toBe(false);
    // 缺少 imported 或其欄位
    expect(LocalImportResponseSchema.safeParse({}).success).toBe(false);
    const { history: _omitted, ...withoutHistory } = base.imported;
    expect(LocalImportResponseSchema.safeParse({ imported: withoutHistory }).success).toBe(false);
  });

  // Stage 2 補強（regression guard）：以下斷言對既有實作加入即綠，用來釘住存活的變異。
  it("LocalImportRequestSchema 的邊界輸入：僅回合、id 去重鍵、空字串 matchId 與缺漏段落", () => {
    // 只有回合（場次皆完成），其餘四段皆空：非空匯入，合法
    expect(
      LocalImportRequestSchema.safeParse({
        version: 1,
        players: [],
        currentRound: makeRound([makeRoundMatch("m1", "completed")]),
        history: [],
        scoreboard: { current: null, matches: [] },
      }).success,
    ).toBe(true);

    // 重複判斷看 id：id 相同但 name 不同仍要拒絕
    expect(
      LocalImportRequestSchema.safeParse(
        makeValidRequest({ players: [makePlayer("a"), { ...makePlayer("b"), id: "a" }] }),
      ).success,
    ).toBe(false);

    // current 的 matchId 為空字串也屬於「綁定場次」，不可當成 null 放行
    expect(
      LocalImportRequestSchema.safeParse(
        makeValidRequest({ scoreboard: { current: makeSlot(""), matches: [] } }),
      ).success,
    ).toBe(false);

    // scoreboard 兩個欄位皆為必填，缺任一個即格式錯誤
    expect(
      LocalImportRequestSchema.safeParse(makeValidRequest({ scoreboard: { matches: [] } })).success,
    ).toBe(false);
    expect(
      LocalImportRequestSchema.safeParse(makeValidRequest({ scoreboard: { current: null } })).success,
    ).toBe(false);

    // 分槽的 matchId 型別必須是 string（改用不限 matchId 的 ScoreboardStateSchema 時，這行在 typecheck 轉紅）
    expectTypeOf<LocalImportRequest["scoreboard"]["matches"][number]["matchId"]>().toEqualTypeOf<string>();
  });

  it("LocalImportResponseSchema 的欄位皆為必填且筆數為非負整數", () => {
    const imported: Record<string, unknown> = { players: 3, round: true, slots: 1, history: 3, scoreboardCurrent: "imported" };
    // 五個 key 逐一省略皆要被拒
    for (const key of Object.keys(imported)) {
      const { [key]: _omitted, ...rest } = imported;
      expect(LocalImportResponseSchema.safeParse({ imported: rest }).success, `省略 ${key}`).toBe(false);
    }
    // 三個筆數欄位：小數與負數皆拒絕
    for (const key of ["players", "slots", "history"]) {
      expect(LocalImportResponseSchema.safeParse({ imported: { ...imported, [key]: 1.5 } }).success, `${key}=1.5`).toBe(false);
      expect(LocalImportResponseSchema.safeParse({ imported: { ...imported, [key]: -1 } }).success, `${key}=-1`).toBe(false);
    }
  });
});
