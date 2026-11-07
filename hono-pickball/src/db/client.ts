import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * 取得 D1 的 drizzle 實例，是 src/** 唯一的 D1 入口。
 * 參數的 DB 允許 undefined（遠端 binding 可能遺失、測試會注入 undefined），缺 binding 時在取得實例當下拋錯，避免到第一次查詢才失敗。
 */
export function getDb(env: { DB?: D1Database }) {
	if (!env.DB) {
		throw new Error("D1 binding DB 不存在：請確認 wrangler.jsonc 的 d1_databases 已宣告 DB");
	}
	return drizzle(env.DB, { schema });
}

/** drizzle 實例型別；各 repository 共用，避免各檔重複推導。 */
export type Db = ReturnType<typeof getDb>;
