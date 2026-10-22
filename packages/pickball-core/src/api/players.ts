import { z } from "zod";
import { PlayerSchema } from "../matchmaker/types";

// 列表中的每一筆都已存在於資料庫，版本至少為 1；0 只代表「尚未建立」。
const PlayerItemSchema = z.object({
  data: PlayerSchema,
  version: z.number().int().positive(),
});

/** GET 清單回應：依建立順序排列，每一筆以 PlayerSchema 驗證。 */
export const PlayerListResponseSchema = z.object({
  items: z.array(PlayerItemSchema),
});

/** 批次匯入請求：至少一位，且 id 不可重複（重複會讓後端 batch 在 D1 層失敗）。 */
export const PlayerImportRequestSchema = z
  .object({ players: z.array(PlayerSchema).min(1) })
  .refine(
    ({ players }) => new Set(players.map((player) => player.id)).size === players.length,
    { message: "players 內的 id 不可重複", path: ["players"] },
  );

export type PlayerListResponse = z.infer<typeof PlayerListResponseSchema>;
export type PlayerImportRequest = z.infer<typeof PlayerImportRequestSchema>;
