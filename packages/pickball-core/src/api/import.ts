import { z } from "zod";
import { MatchHistoryEntrySchema, type MatchHistoryEntry } from "../matchmaker/history";
import { BackupSchema } from "../matchmaker/transfer-types";
import { MAX_PLAYERS_PER_IMPORT, PlayerWriteSchema } from "./players";
import { MatchSlotSchema } from "./round";
import { ScoreboardStateSchema } from "../scoreboard/types";

// 獨立計分板不綁定任何場次；有 matchId 的計分板屬於分槽，混進這裡會被當成獨立計分板寫入雲端。
const StandaloneScoreboardSchema = ScoreboardStateSchema.refine(
  (state) => state.matchId === null,
  { message: "獨立計分板的 matchId 必須為 null", path: ["matchId"] },
);

/**
 * 本機資料匯入請求：備份檔的四段資料加上計分機的獨立計分板與場次分槽。
 * 欄位一律沿用既有 schema，不重新宣告；跨段的一致性由 superRefine 檢查。
 */
export const LocalImportRequestSchema = BackupSchema.extend({
  players: z.array(PlayerWriteSchema),
  scoreboard: z.object({
    current: StandaloneScoreboardSchema.nullable(),
    matches: z.array(MatchSlotSchema),
  }),
}).superRefine((data, ctx) => {
  // 重複的 id 會讓後端單一 batch 在主鍵衝突時整批回滾，先在契約層擋下才能回 400 而非 500。
  const playerIds = data.players.map((player) => player.id);
  if (new Set(playerIds).size !== playerIds.length) {
    ctx.addIssue({ code: "custom", message: "players 內的 id 不可重複", path: ["players"] });
  }

  const historyMatchIds = data.history.map((entry) => entry.matchId);
  if (new Set(historyMatchIds).size !== historyMatchIds.length) {
    ctx.addIssue({ code: "custom", message: "history 內的 matchId 不可重複", path: ["history"] });
  }

  const slotMatchIds = data.scoreboard.matches.map((slot) => slot.matchId);
  if (new Set(slotMatchIds).size !== slotMatchIds.length) {
    ctx.addIssue({
      code: "custom",
      message: "scoreboard.matches 內的 matchId 不可重複",
      path: ["scoreboard", "matches"],
    });
  }

  // 分槽只服務尚在進行的場次；已完成場次的分槽或找不到場次的分槽匯入後沒有任何入口可讀取。
  const openMatchIds = new Set(
    (data.currentRound?.matches ?? [])
      .filter((match) => match.status !== "completed")
      .map((match) => match.id),
  );
  data.scoreboard.matches.forEach((slot, index) => {
    if (!openMatchIds.has(slot.matchId)) {
      ctx.addIssue({
        code: "custom",
        message: "分槽的 matchId 必須屬於目前回合中尚未完成的場次",
        path: ["scoreboard", "matches", index, "matchId"],
      });
    }
  });

  // 空匯入沒有任何可寫入的內容，卻會讓前端誤以為已完成匯入。
  const isEmpty =
    data.players.length === 0 &&
    data.currentRound === null &&
    data.history.length === 0 &&
    data.scoreboard.matches.length === 0 &&
    data.scoreboard.current === null;
  if (isEmpty) {
    ctx.addIssue({ code: "custom", message: "匯入內容不可全部為空" });
  }
});

/** 匯入成功回應：各段實際寫入的筆數；scoreboardCurrent 區分「寫入」「雲端已有而略過」「本機沒有」。 */
export const LocalImportResponseSchema = z.object({
  imported: z.object({
    players: z.number().int().nonnegative(),
    round: z.boolean(),
    slots: z.number().int().nonnegative(),
    history: z.number().int().nonnegative(),
    scoreboardCurrent: z.enum(["imported", "skipped", "none"]),
  }),
});

export type LocalImportRequest = z.infer<typeof LocalImportRequestSchema>;
export type LocalImportResponse = z.infer<typeof LocalImportResponseSchema>;

/** 單一段 json_each 參數的位元組上限；D1 單一字串上限為 2,000,000，保留 5% 餘裕。 */
export const IMPORT_SEGMENT_LIMIT_BYTES = 1_900_000;

/** 本機資料匯入的 body 上限，只用來在解析 JSON 前擋下明顯過大的請求。 */
export const IMPORT_BODY_LIMIT_BYTES = 10_000_000;

/** 後端 json_each 的五個參數，皆為 JSON 字串。 */
export interface ImportSegments {
  players: string;
  round: string;
  slots: string;
  history: string;
  current: string;
}

/** 歷史段的 json_each 參數；整份匯入與附加共用同一個函式，兩邊的歷史段才會逐字相同。 */
function serializeHistorySegment(history: MatchHistoryEntry[]): string {
  return JSON.stringify(
    history.map((data) => ({
      matchId: data.matchId,
      playedAt: Date.parse(data.playedAt),
      data,
    })),
  );
}

/**
 * 產生送進 D1 json_each 的五段 JSON。
 * 前後端都用這個函式量測與送出，量測的字串與寫入的字串才不會漂移。
 */
export function serializeImportSegments(request: LocalImportRequest): ImportSegments {
  return {
    players: JSON.stringify(
      request.players.map((data, index) => ({ id: data.id, data, sortOrder: index })),
    ),
    round: JSON.stringify(request.currentRound === null ? [] : [{ data: request.currentRound }]),
    slots: JSON.stringify(request.scoreboard.matches.map((data) => ({ matchId: data.matchId, data }))),
    history: serializeHistorySegment(request.history),
    current: JSON.stringify(
      request.scoreboard.current === null ? [] : [{ data: request.scoreboard.current }],
    ),
  };
}

/**
 * 計算字串的 UTF-8 位元組數。
 * 核心套件的型別環境沒有 TextEncoder，所以自行計算；單獨的代理字元與 TextEncoder 一樣視為 3 位元組（U+FFFD）。
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export type ImportLimitCheck = { ok: true; segments: ImportSegments } | { ok: false };

/**
 * 判定匯入請求是否超過筆數或單段位元組上限。
 * D1 的限制是每個字串而非每個請求，所以五段各自比較、不加總；恰等於上限時通過。
 */
export function checkImportLimits(request: LocalImportRequest): ImportLimitCheck {
  if (request.players.length > MAX_PLAYERS_PER_IMPORT) {
    return { ok: false };
  }
  const segments = serializeImportSegments(request);
  const texts = [segments.players, segments.round, segments.slots, segments.history, segments.current];
  for (const text of texts) {
    if (utf8ByteLength(text) > IMPORT_SEGMENT_LIMIT_BYTES) {
      return { ok: false };
    }
  }
  return { ok: true, segments };
}

/**
 * 本機備份附加到雲端的請求：只含參賽者與歷史，備份中的進行中回合不屬於附加。
 * 未知欄位由 zod 預設剝除。
 */
export const AppendImportRequestSchema = z
  .object({
    players: z.array(PlayerWriteSchema),
    history: z.array(MatchHistoryEntrySchema),
  })
  .superRefine((data, ctx) => {
    // 附加端點以 ON CONFLICT DO NOTHING 略過已存在的列；請求內重複若放行，會被當成「略過」悄悄吞掉而計數失真，所以在契約層拒絕。
    const playerIds = data.players.map((player) => player.id);
    if (new Set(playerIds).size !== playerIds.length) {
      ctx.addIssue({ code: "custom", message: "players 內的 id 不可重複", path: ["players"] });
    }

    const historyMatchIds = data.history.map((entry) => entry.matchId);
    if (new Set(historyMatchIds).size !== historyMatchIds.length) {
      ctx.addIssue({ code: "custom", message: "history 內的 matchId 不可重複", path: ["history"] });
    }

    if (data.players.length === 0 && data.history.length === 0) {
      ctx.addIssue({ code: "custom", message: "附加內容不可全部為空" });
    }
  });

const AppendCountSchema = z.object({
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/** 附加成功回應：參賽者與歷史各自實際新增與略過的筆數。 */
export const AppendImportResponseSchema = z.object({
  appended: z.object({
    players: AppendCountSchema,
    history: AppendCountSchema,
  }),
});

export type AppendImportRequest = z.infer<typeof AppendImportRequestSchema>;
export type AppendImportResponse = z.infer<typeof AppendImportResponseSchema>;

/** 後端附加端點 json_each 的三個參數，皆為 JSON 字串。 */
export interface AppendSegments {
  /** 每個名稱只含第一位的參賽者，寫入 matchmaker_players。 */
  players: string;
  /** 請求中全部參賽者的 id 與名稱，只用來改寫歷史中的球員 id，不寫入任何表。 */
  playerNames: string;
  history: string;
}

/**
 * 產生附加端點送進 D1 json_each 的三段 JSON。
 * 同名去重必須在這裡完成：同一條 INSERT ... SELECT 看不到自己剛插入的列，SQL 無法替同批資料去重。
 */
export function serializeAppendSegments(request: AppendImportRequest): AppendSegments {
  const seenNames = new Set<string>();
  const uniquePlayers = request.players.filter((player) => {
    if (seenNames.has(player.name)) {
      return false;
    }
    seenNames.add(player.name);
    return true;
  });

  return {
    players: JSON.stringify(uniquePlayers.map((data) => ({ id: data.id, data }))),
    playerNames: JSON.stringify(request.players.map((player) => ({ id: player.id, name: player.name }))),
    history: serializeHistorySegment(request.history),
  };
}

export type AppendLimitCheck = { ok: true; segments: AppendSegments } | { ok: false };

/**
 * 判定附加請求是否超過筆數或單段位元組上限。
 * 筆數以去重前的請求計算；三段各自比較、不加總，恰等於上限時通過。
 */
export function checkAppendLimits(request: AppendImportRequest): AppendLimitCheck {
  if (request.players.length > MAX_PLAYERS_PER_IMPORT) {
    return { ok: false };
  }
  const segments = serializeAppendSegments(request);
  const texts = [segments.players, segments.playerNames, segments.history];
  for (const text of texts) {
    if (utf8ByteLength(text) > IMPORT_SEGMENT_LIMIT_BYTES) {
      return { ok: false };
    }
  }
  return { ok: true, segments };
}
