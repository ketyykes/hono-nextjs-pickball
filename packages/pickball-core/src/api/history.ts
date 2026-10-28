import { z } from "zod";
import { MatchHistoryEntrySchema } from "../matchmaker/history";

// 查詢字串的毫秒界線。不可用 z.coerce.number()：它對空字串得 0，
// 對 " 12 "、"1e3"、"0x10" 也會轉成數字；先以 regex 限定只含十進位數字，
// 再轉數字並要求安全整數（zod 4 的 int() 即拒絕超出安全範圍的值）。
const MillisecondsParamSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int());

/** GET 歷史清單的查詢參數：皆選填；同時給 from 與 to 時 from 不得大於 to（相等為合法的空區間）。 */
export const HistoryQuerySchema = z
  .object({
    from: MillisecondsParamSchema.optional(),
    to: MillisecondsParamSchema.optional(),
    order: z.enum(["desc", "asc"]).optional(),
  })
  .refine(({ from, to }) => from === undefined || to === undefined || from <= to, {
    message: "from 不得大於 to",
    path: ["from"],
  });

// 列表中的每一筆都已存在於資料庫，版本至少為 1（與 players 一致）。
const HistoryItemSchema = z.object({
  data: MatchHistoryEntrySchema,
  version: z.number().int().positive(),
});

/** GET 歷史清單回應：total 為本人全部歷史列數，droppedCount 為本次範圍內略過的列數。 */
export const HistoryListResponseSchema = z.object({
  items: z.array(HistoryItemSchema),
  total: z.number().int().nonnegative(),
  droppedCount: z.number().int().nonnegative(),
});

export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
export type HistoryListResponse = z.infer<typeof HistoryListResponseSchema>;
