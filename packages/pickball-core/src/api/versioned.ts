import { z } from "zod";

// 版本號是樂觀鎖的比對依據，小數或負數會讓條件式 SQL 永遠比對不到。
const VersionSchema = z.number().int().nonnegative();

/** GET 回應：尚無資料時 data 為 null、version 為 0。 */
export function versionedEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    version: VersionSchema,
  });
}

/** PUT 請求：data 不可為 null，version 為呼叫端最後讀到或寫成的版本。 */
export function versionedWriteSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    version: VersionSchema,
  });
}
