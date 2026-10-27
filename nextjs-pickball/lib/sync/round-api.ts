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

export function fetchRemoteRound(expectedUserId: string) {
	return requestJson("GET", ROUND_PATH, { schema: RoundGetResponseSchema, expectedUserId });
}

export function putRemoteRound(expectedUserId: string, round: Round, version: number) {
	return requestJson("PUT", ROUND_PATH, {
		body: { data: round, version },
		schema: PUT_ROUND_RESPONSE_SCHEMA,
		expectedUserId,
	});
}

export function fetchRemoteSlots(expectedUserId: string) {
	return requestJson("GET", SLOTS_PATH, { schema: MatchSlotListResponseSchema, expectedUserId });
}

export function fetchRemoteSlot(expectedUserId: string, matchId: string) {
	return requestJson("GET", slotPath(matchId), {
		schema: MatchSlotGetResponseSchema,
		expectedUserId,
	});
}

export function putRemoteSlot(expectedUserId: string, matchId: string, slot: MatchSlot, version: number) {
	return requestJson("PUT", slotPath(matchId), {
		body: { data: slot, version },
		schema: PUT_SLOT_RESPONSE_SCHEMA,
		expectedUserId,
	});
}

export function submitRemoteScore(
	expectedUserId: string,
	matchId: string,
	scoreA: string,
	scoreB: string,
	roundVersion: number,
) {
	return requestJson("POST", `${ROUND_PATH}/matches/${encodeURIComponent(matchId)}/score`, {
		body: { scoreA, scoreB, roundVersion },
		schema: SubmitScoreResponseSchema,
		expectedUserId,
	});
}
