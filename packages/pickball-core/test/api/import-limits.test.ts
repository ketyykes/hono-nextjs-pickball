import { describe, it, expect } from "vitest";
import {
  IMPORT_BODY_LIMIT_BYTES,
  IMPORT_SEGMENT_LIMIT_BYTES,
  LocalImportRequestSchema,
  checkImportLimits,
  serializeImportSegments,
  utf8ByteLength,
  type LocalImportRequest,
} from "../../src/api/import";
import { MAX_PLAYERS_PER_IMPORT, PLAYER_IMPORT_BODY_LIMIT_BYTES } from "../../src/api/players";
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

/** 產生符合 RoundMatchSchema 的 pending 場次。 */
function makeRoundMatch(id: string) {
  return {
    id,
    courtNumber: 1,
    format: "singles",
    teams: [
      { playerIds: ["a"], rating: 4 },
      { playerIds: ["b"], rating: 4 },
    ],
    status: "pending",
    scores: null,
    winner: null,
    completedAt: null,
    playerRatings: [
      { playerId: "a", before: 4, after: null },
      { playerId: "b", before: 4, after: null },
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

/** 產生符合 MatchHistoryEntrySchema 的單打歷史；playedAt 由呼叫端指定以便驗證時間戳轉換。 */
function makeHistoryEntry(matchId: string, playedAt: string) {
  const team = (id: string) => ({
    players: [{ id, name: `球員${id}`, ratingBefore: 4, ratingAfter: 4.1 }],
    rating: 4,
  });
  return {
    matchId,
    courtNumber: 1,
    playedAt,
    format: "singles",
    teamA: team("a"),
    teamB: team("b"),
    scoreA: 11,
    scoreB: 7,
    winner: "teamA",
  };
}

function makeSlot(matchId: string) {
  return { ...createInitialState({ mode: "singles" }), matchId };
}

/** 五段皆有資料的合法請求；各段內容刻意不同，才能分辨序列化是否放錯段。 */
function makeBaseRequest(): LocalImportRequest {
  return LocalImportRequestSchema.parse({
    version: 1,
    players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
    currentRound: makeRound([makeRoundMatch("m1"), makeRoundMatch("m2")]),
    history: [
      makeHistoryEntry("h1", "2026-01-01T00:00:00.000Z"),
      makeHistoryEntry("h2", "2026-03-05T08:09:10.123Z"),
    ],
    scoreboard: {
      current: createInitialState({ mode: "doubles" }),
      matches: [makeSlot("m1"), makeSlot("m2")],
    },
  });
}

const encoder = new TextEncoder();

/** 以 TextEncoder 量測，作為核心自寫 utf8ByteLength 的對照。 */
function encodedLength(text: string): number {
  return encoder.encode(text).length;
}

type SegmentName = "players" | "round" | "slots" | "history" | "current";

/** 只有 us 的姓名會補長，them 維持短字串，補長的位元組才只出現一次。 */
function makeTeamPlayers(usName: string) {
  const badge = (name: string) => ({ name, colorFrom: "#000000", colorTo: "#ffffff", foreground: "#ffffff" });
  return { us: [badge(usName)], them: [badge("t")] };
}

/** 每一段各自可注入任意長度字串的欄位；其餘段落維持基準大小。 */
const PADDERS: Record<SegmentName, (request: LocalImportRequest, pad: string) => void> = {
  players: (request, pad) => {
    request.players[0].name += pad;
  },
  round: (request, pad) => {
    request.currentRound!.restingPlayerIds = [pad];
  },
  slots: (request, pad) => {
    // matchId 會在 json 內出現兩次（外層與 data），補長會加倍而無法精準對到上限，改補只出現一次的姓名欄位
    request.scoreboard.matches[0].teamPlayers = makeTeamPlayers(pad);
  },
  history: (request, pad) => {
    request.history[0].teamA.players[0].name += pad;
  },
  current: (request, pad) => {
    request.scoreboard.current!.teamPlayers = makeTeamPlayers(pad);
  },
};

const SEGMENT_NAMES = Object.keys(PADDERS) as SegmentName[];

function withPad(segment: SegmentName, pad: string): LocalImportRequest {
  const request = structuredClone(makeBaseRequest());
  PADDERS[segment](request, pad);
  return request;
}

/** 讓指定段落的 UTF-8 位元組數恰為 targetBytes；先量基準再補長，並斷言結果，避免邊界資料本身算錯。 */
function makeRequestWithSegmentBytes(segment: SegmentName, targetBytes: number): LocalImportRequest {
  const baseBytes = encodedLength(serializeImportSegments(withPad(segment, ""))[segment]);
  const request = withPad(segment, "x".repeat(targetBytes - baseBytes));
  expect(encodedLength(serializeImportSegments(request)[segment]), segment).toBe(targetBytes);
  return request;
}

describe("本機資料匯入的共用參數形狀與上限判定", () => {
  it("serializeImportSegments 產生後端 json_each 參數的五段 JSON", () => {
    const request = makeBaseRequest();
    const segments = serializeImportSegments(request);

    expect(segments.players).toBe(
      JSON.stringify([
        { id: "a", data: request.players[0], sortOrder: 0 },
        { id: "b", data: request.players[1], sortOrder: 1 },
        { id: "c", data: request.players[2], sortOrder: 2 },
      ]),
    );
    expect(segments.round).toBe(JSON.stringify([{ data: request.currentRound }]));
    expect(segments.slots).toBe(
      JSON.stringify([
        { matchId: "m1", data: request.scoreboard.matches[0] },
        { matchId: "m2", data: request.scoreboard.matches[1] },
      ]),
    );
    expect(segments.history).toBe(
      JSON.stringify([
        { matchId: "h1", playedAt: Date.parse("2026-01-01T00:00:00.000Z"), data: request.history[0] },
        { matchId: "h2", playedAt: Date.parse("2026-03-05T08:09:10.123Z"), data: request.history[1] },
      ]),
    );
    expect(segments.current).toBe(JSON.stringify([{ data: request.scoreboard.current }]));
    // 時間戳必須是數字而非原字串
    expect(JSON.parse(segments.history)[1].playedAt).toBe(1772698150123);

    // 回合與獨立計分板為 null 時，json_each 要吃到空陣列
    const withoutOptional = serializeImportSegments({
      ...request,
      currentRound: null,
      scoreboard: { current: null, matches: [] },
    });
    expect(withoutOptional.round).toBe("[]");
    expect(withoutOptional.current).toBe("[]");
    expect(withoutOptional.slots).toBe("[]");

    // 回合與獨立計分板各自獨立判斷 null：只有一段為 null 時，另一段仍要序列化
    const onlyRoundNull = serializeImportSegments({ ...request, currentRound: null });
    expect(onlyRoundNull.round).toBe("[]");
    expect(onlyRoundNull.current).toBe(JSON.stringify([{ data: request.scoreboard.current }]));
    const onlyCurrentNull = serializeImportSegments({
      ...request,
      scoreboard: { ...request.scoreboard, current: null },
    });
    expect(onlyCurrentNull.current).toBe("[]");
    expect(onlyCurrentNull.round).toBe(JSON.stringify([{ data: request.currentRound }]));

    // 其餘段落為空陣列時同樣是 "[]"
    const empty = serializeImportSegments({
      version: 1,
      players: [],
      currentRound: null,
      history: [],
      scoreboard: { current: null, matches: [] },
    });
    expect(empty).toEqual({ players: "[]", round: "[]", slots: "[]", history: "[]", current: "[]" });
  });

  it("utf8ByteLength 與 TextEncoder 的位元組數一致", () => {
    const samples = [
      "",
      "abc",
      "é",
      "中文",
      "😀",
      "a😀é中",
      // 單獨的代理字元（TextEncoder 以 U+FFFD 取代，同為 3 位元組）
      "\uD83D",
      "\uDE00",
      "\uDE00\uD83D",
      "\uD83Dx",
      "x\uD83D",
      "\uD83D😀",
      "a\uDE00b",
      // 各位元組數的分界
      "\u007F",
      "\u0080",
      "߿",
      "ࠀ",
      "￿",
      String.fromCodePoint(0x10000),
      String.fromCodePoint(0x10ffff),
    ];
    for (const sample of samples) {
      expect(utf8ByteLength(sample), JSON.stringify(sample)).toBe(encodedLength(sample));
    }

    // 代理字元前後的分界碼元，兩個與三個一組窮舉
    const units = [0x41, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xffff];
    for (const first of units) {
      for (const second of units) {
        const pair = String.fromCharCode(first, second);
        expect(utf8ByteLength(pair), pair.length + ":" + first + "," + second).toBe(encodedLength(pair));
        for (const third of units) {
          const triple = String.fromCharCode(first, second, third);
          expect(utf8ByteLength(triple), first + "," + second + "," + third).toBe(encodedLength(triple));
        }
      }
    }
  });

  it("checkImportLimits 依後端參數形狀判定，五段各自恰為上限時通過、多一位元組即超過", () => {
    // 基準請求本身必須通過，後面的失敗才能歸因於單一段落
    const base = makeBaseRequest();
    expect(checkImportLimits(base)).toEqual({ ok: true, segments: serializeImportSegments(base) });

    for (const segment of SEGMENT_NAMES) {
      const atLimit = makeRequestWithSegmentBytes(segment, IMPORT_SEGMENT_LIMIT_BYTES);
      const atLimitResult = checkImportLimits(atLimit);
      expect(atLimitResult.ok, `${segment} 恰為上限`).toBe(true);
      if (atLimitResult.ok) {
        expect(atLimitResult.segments).toEqual(serializeImportSegments(atLimit));
      }

      const overLimit = makeRequestWithSegmentBytes(segment, IMPORT_SEGMENT_LIMIT_BYTES + 1);
      expect(checkImportLimits(overLimit), `${segment} 多一位元組`).toEqual({ ok: false });
    }

    // 以位元組而非字元數判定：字元數未達上限但位元組數超過
    const multibyteBase = encodedLength(serializeImportSegments(withPad("players", ""))["players"]);
    const extraBytes = IMPORT_SEGMENT_LIMIT_BYTES + 1 - multibyteBase;
    const wideCount = Math.floor(extraBytes / 3);
    const pad = "中".repeat(wideCount) + "x".repeat(extraBytes - wideCount * 3);
    const multibyte = withPad("players", pad);
    const segmentText = serializeImportSegments(multibyte).players;
    expect(encodedLength(segmentText)).toBe(IMPORT_SEGMENT_LIMIT_BYTES + 1);
    expect(segmentText.length).toBeLessThan(IMPORT_SEGMENT_LIMIT_BYTES);
    expect(checkImportLimits(multibyte)).toEqual({ ok: false });

    // 同樣的多位元組內容少一位元組則通過
    const multibyteAtLimit = withPad("players", pad.slice(0, -1));
    expect(encodedLength(serializeImportSegments(multibyteAtLimit).players)).toBe(IMPORT_SEGMENT_LIMIT_BYTES);
    expect(checkImportLimits(multibyteAtLimit).ok).toBe(true);
  });

  it("checkImportLimits 拒絕超過 500 位參賽者且不以各段加總判定", () => {
    const withPlayerCount = (count: number): LocalImportRequest => {
      const request = structuredClone(makeBaseRequest());
      request.players = Array.from({ length: count }, (_, index) => ({
        ...request.players[0],
        id: `p${index}`,
      }));
      return request;
    };

    const atCount = withPlayerCount(500);
    const atCountResult = checkImportLimits(atCount);
    expect(atCountResult.ok).toBe(true);
    if (atCountResult.ok) {
      expect(atCountResult.segments).toEqual(serializeImportSegments(atCount));
    }
    // 筆數超過時位元組數遠低於單段上限，確認是筆數在擋
    const overCount = withPlayerCount(501);
    expect(encodedLength(serializeImportSegments(overCount).players)).toBeLessThan(IMPORT_SEGMENT_LIMIT_BYTES);
    expect(checkImportLimits(overCount)).toEqual({ ok: false });
    expect(MAX_PLAYERS_PER_IMPORT).toBe(500);

    // 兩段各約 1,200,000 位元組：加總超過單段上限，但各段都沒超過
    const split = structuredClone(makeBaseRequest());
    PADDERS.players(split, "x".repeat(1_200_000));
    PADDERS.history(split, "x".repeat(1_200_000));
    const segments = serializeImportSegments(split);
    expect(encodedLength(segments.players)).toBeLessThan(IMPORT_SEGMENT_LIMIT_BYTES);
    expect(encodedLength(segments.history)).toBeLessThan(IMPORT_SEGMENT_LIMIT_BYTES);
    expect(encodedLength(segments.players) + encodedLength(segments.history)).toBeGreaterThan(
      IMPORT_SEGMENT_LIMIT_BYTES,
    );
    const splitResult = checkImportLimits(split);
    expect(splitResult.ok).toBe(true);
    if (splitResult.ok) {
      expect(splitResult.segments).toEqual(segments);
    }
  });

  it("批次寫入的上限常數皆小於 D1 單一字串上限", () => {
    const D1_MAX_STRING_BYTES = 2_000_000;
    expect(MAX_PLAYERS_PER_IMPORT).toBe(500);
    expect(PLAYER_IMPORT_BODY_LIMIT_BYTES).toBe(1_000_000);
    expect(IMPORT_SEGMENT_LIMIT_BYTES).toBe(1_900_000);
    expect(IMPORT_BODY_LIMIT_BYTES).toBe(10_000_000);
    expect(IMPORT_SEGMENT_LIMIT_BYTES).toBeLessThan(D1_MAX_STRING_BYTES);
    expect(PLAYER_IMPORT_BODY_LIMIT_BYTES).toBeLessThan(D1_MAX_STRING_BYTES);
  });
});
