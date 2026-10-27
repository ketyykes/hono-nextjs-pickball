import { z } from "zod";
import type { Player } from "@pickball/core/matchmaker/types";
import { PlayerSchema } from "@pickball/core/matchmaker/types";
import { PlayerListResponseSchema } from "@pickball/core/api/players";
import { versionedWriteSchema } from "@pickball/core/api/versioned";
import { requestJson } from "./api-client";

// 路徑與回應 schema 集中在這一處，hook 不直接拼字串，避免各處路徑漂移。
const PLAYERS_PATH = "/api/matchmaker/players";

/** PUT 回應：寫入後的資料與新版本號。 */
export const PUT_PLAYER_RESPONSE_SCHEMA = versionedWriteSchema(PlayerSchema);

/** 204 端點（DELETE、reset）沒有回應內容，requestJson 不會驗證；用 unknown 明示「不關心內容」。 */
export const NO_CONTENT_SCHEMA = z.unknown();

// id 是前端產生的字串，編碼後即使含 `/` 也不會改變路徑結構。
function playerPath(id: string): string {
	return `${PLAYERS_PATH}/${encodeURIComponent(id)}`;
}

export function fetchRemotePlayers(expectedUserId: string) {
	return requestJson("GET", PLAYERS_PATH, { schema: PlayerListResponseSchema, expectedUserId });
}

export function putRemotePlayer(expectedUserId: string, player: Player, version: number) {
	return requestJson("PUT", playerPath(player.id), {
		body: { data: player, version },
		schema: PUT_PLAYER_RESPONSE_SCHEMA,
		expectedUserId,
	});
}

export function deleteRemotePlayer(expectedUserId: string, id: string) {
	return requestJson("DELETE", playerPath(id), { schema: NO_CONTENT_SCHEMA, expectedUserId });
}

export function importRemotePlayers(expectedUserId: string, players: Player[]) {
	return requestJson("POST", `${PLAYERS_PATH}/import`, {
		body: { players },
		schema: PlayerListResponseSchema,
		expectedUserId,
	});
}

export function resetRemoteMatchmaker(expectedUserId: string) {
	return requestJson("POST", "/api/matchmaker/reset", { schema: NO_CONTENT_SCHEMA, expectedUserId });
}
