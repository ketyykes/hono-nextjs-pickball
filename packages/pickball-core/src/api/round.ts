import { z } from "zod";
import { MatchHistoryEntrySchema } from "../matchmaker/history";
import { PlayerSchema } from "../matchmaker/types";
import { RoundSchema } from "../matchmaker/round-types";
import { ScoreboardStateSchema } from "../scoreboard/types";
import { versionedEnvelopeSchema, versionedWriteSchema } from "./versioned";

/** GET 回合：尚無回合時 data 為 null、version 為 0。 */
export const RoundGetResponseSchema = versionedEnvelopeSchema(RoundSchema);

/** PUT 回合：與單筆契約相同，data 不可為 null。 */
export const RoundPutRequestSchema = versionedWriteSchema(RoundSchema);

// 分槽一定綁定某個場次（matchId 是主鍵的一部分），獨立計分板的 null 不可進雲端分槽表。
export const MatchSlotSchema = ScoreboardStateSchema.extend({
  matchId: z.string(),
});

/** PUT 單筆分槽：data.matchId 與 path 的一致性由後端檢查。 */
export const MatchSlotPutRequestSchema = versionedWriteSchema(MatchSlotSchema);

// 列表中的每一筆都已存在於資料庫，版本至少為 1；0 只代表「尚未建立」。
const MatchSlotItemSchema = z.object({
  data: MatchSlotSchema,
  version: z.number().int().positive(),
});

/** GET 分槽清單：依 match_id 遞增排列。 */
export const MatchSlotListResponseSchema = z.object({
  items: z.array(MatchSlotItemSchema),
});

/** GET 單筆分槽：不存在時 data 為 null、version 為 0。 */
export const MatchSlotGetResponseSchema = versionedEnvelopeSchema(MatchSlotSchema);

/** 送出比分：比分維持字串，格式檢查由核心 submitScore 負責；roundVersion 至少為 1。 */
export const SubmitScoreRequestSchema = z.object({
  scoreA: z.string(),
  scoreB: z.string(),
  roundVersion: z.number().int().positive(),
});

// 送出成功後寫入資料庫的資料都已存在，版本至少為 1。
const VersionedPositiveSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({ data: dataSchema, version: z.number().int().positive() });

/** 送出比分成功回應：players 僅含被更新者；boundaryHits 為一次性提示，不持久化。 */
export const SubmitScoreResponseSchema = z.object({
  round: VersionedPositiveSchema(RoundSchema),
  players: z.array(VersionedPositiveSchema(PlayerSchema)),
  historyEntry: MatchHistoryEntrySchema,
  boundaryHits: z.array(
    z.object({
      playerId: z.string(),
      atUpperBound: z.boolean(),
      atLowerBound: z.boolean(),
    }),
  ),
});

export type RoundGetResponse = z.infer<typeof RoundGetResponseSchema>;
export type RoundPutRequest = z.infer<typeof RoundPutRequestSchema>;
export type MatchSlot = z.infer<typeof MatchSlotSchema>;
export type MatchSlotPutRequest = z.infer<typeof MatchSlotPutRequestSchema>;
export type MatchSlotListResponse = z.infer<typeof MatchSlotListResponseSchema>;
export type MatchSlotGetResponse = z.infer<typeof MatchSlotGetResponseSchema>;
export type SubmitScoreRequest = z.infer<typeof SubmitScoreRequestSchema>;
export type SubmitScoreResponse = z.infer<typeof SubmitScoreResponseSchema>;
