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

/** 單次批次匯入的參賽者人數上限；兩個批次寫入端點共用，使同一份名單在兩邊的接受度一致。 */
export const MAX_PLAYERS_PER_IMPORT = 500;

/** 名單批次匯入的 body 上限；小於 D1 單一列 2,000,000 位元組，單一參賽者的 data 因此不會超過列大小。 */
export const PLAYER_IMPORT_BODY_LIMIT_BYTES = 1_000_000;

/**
 * 寫入雲端時的參賽者：id 必須非空。
 * 只在寫入邊界收緊；PlayerSchema 同時服務訪客本機名單與備份還原，收緊它會讓既有的空 id 資料被捨棄。
 */
export const PlayerWriteSchema = PlayerSchema.extend({ id: z.string().min(1) });

/** 批次匯入請求：至少一位，且 id 不可重複（重複會讓後端 batch 在 D1 層失敗）。 */
export const PlayerImportRequestSchema = z
  .object({ players: z.array(PlayerWriteSchema).min(1) })
  .refine(
    ({ players }) => new Set(players.map((player) => player.id)).size === players.length,
    { message: "players 內的 id 不可重複", path: ["players"] },
  );

export type PlayerListResponse = z.infer<typeof PlayerListResponseSchema>;
export type PlayerImportRequest = z.infer<typeof PlayerImportRequestSchema>;
