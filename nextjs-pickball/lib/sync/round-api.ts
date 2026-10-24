import type { Round } from "@pickball/core/matchmaker/round-types";
import { RoundSchema } from "@pickball/core/matchmaker/round-types";
import {
	MatchSlotGetResponseSchema,
	MatchSlotListResponseSchema,
	MatchSlotSchema,
	RoundGetResponseSchema,
	SubmitScoreResponseSchema,
	type MatchSlot,
} from "@pickball/core/api/round";
import { versionedWriteSchema } from "@pickball/core/api/versioned";
import { requestJson } from "./api-client";

// 路徑與回應 schema 集中在這一處，hook 不直接拼字串，避免各處路徑漂移。
const ROUND_PATH = "/api/matchmaker/round";
const SLOTS_PATH = "/api/matchmaker/slots";

/** PUT 回應：寫入後的資料與新版本號。 */
export const PUT_ROUND_RESPONSE_SCHEMA = versionedWriteSchema(RoundSchema);
export const PUT_SLOT_RESPONSE_SCHEMA = versionedWriteSchema(MatchSlotSchema);

// matchId 是前端產生的字串，編碼後即使含 `/` 也不會改變路徑結構。
function slotPath(matchId: string): string {
	return `${SLOTS_PATH}/${encodeURIComponent(matchId)}`;
}

export function fetchRemoteRound() {
	return requestJson("GET", ROUND_PATH, { schema: RoundGetResponseSchema });
}

export function putRemoteRound(round: Round, version: number) {
	return requestJson("PUT", ROUND_PATH, {
		body: { data: round, version },
		schema: PUT_ROUND_RESPONSE_SCHEMA,
	});
}

export function fetchRemoteSlots() {
	return requestJson("GET", SLOTS_PATH, { schema: MatchSlotListResponseSchema });
}

export function fetchRemoteSlot(matchId: string) {
	return requestJson("GET", slotPath(matchId), { schema: MatchSlotGetResponseSchema });
}

export function putRemoteSlot(matchId: string, slot: MatchSlot, version: number) {
	return requestJson("PUT", slotPath(matchId), {
		body: { data: slot, version },
		schema: PUT_SLOT_RESPONSE_SCHEMA,
	});
}

export function submitRemoteScore(
	matchId: string,
	scoreA: string,
	scoreB: string,
	roundVersion: number,
) {
	return requestJson("POST", `${ROUND_PATH}/matches/${encodeURIComponent(matchId)}/score`, {
		body: { scoreA, scoreB, roundVersion },
		schema: SubmitScoreResponseSchema,
	});
}
