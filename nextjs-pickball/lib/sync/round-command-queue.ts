// 回合命令佇列：單一在途、先進先出，送出時才把命令套用在
// 「最新已確認的雲端回合」上。無 React 相依，由 useRemoteRoundStore 持有。
//
// 為什麼存命令而不是算好的回合資料：送出比分的回應（伺服器算出的完成場次與時間）必須成為
// 之後回合 PUT 的基礎。若排隊的是舊回合快照，帶新 version 會覆蓋伺服器的完成狀態，
// 帶舊 version 則必然 409；送出時重新套用命令可同時避免這兩種失敗。

import type { SubmitScoreResponse } from "@pickball/core/api/round";
import type { Round } from "@pickball/core/matchmaker/round-types";
import type { Player } from "@pickball/core/matchmaker/types";
import type { RequestResult } from "./api-client";
import { RETRY_DELAYS_MS, type SaverEvent } from "./latest-wins-saver";
import type { putRemoteRound, submitRemoteScore } from "./round-api";

/** 回合變更命令的套用結果；afterCommit 在該次 PUT 成功後才執行（例：休息次數結算）。 */
export interface RoundTransformResult {
	round: Round;
	afterCommit?: () => void;
}

export type RoundCommand =
	| {
			kind: "transform";
			/** 回傳 null 代表在目前已確認的回合上無法套用（例：換人對象已不在休息名單），該命令被丟棄。 */
			apply: (round: Round | null, players: readonly Player[]) => RoundTransformResult | null;
	  }
	| { kind: "submit"; matchId: string; scoreA: string; scoreB: string };

export interface ConfirmedRound {
	round: Round | null;
	version: number;
}

export interface RoundCommandQueueOptions {
	initial: ConfirmedRound;
	getPlayers: () => readonly Player[];
	/** 已綁定帳號的送出函式：佇列不知道帳號，由持有佇列的世代以閉包綁定。 */
	putRound: (round: Round, version: number) => ReturnType<typeof putRemoteRound>;
	submitScore: (
		matchId: string,
		scoreA: string,
		scoreB: string,
		roundVersion: number,
	) => ReturnType<typeof submitRemoteScore>;
	/** 狀態轉換；與 createLatestWinsSaver 的 onResult 同一組事件。 */
	onEvent: (event: SaverEvent) => void;
	/** 任何請求成功後，已確認的回合與版本都已更新。 */
	onConfirmed: (round: Round, version: number) => void;
	/** 送出比分成功後額外通知完整回應（名單與歷史資料由呼叫端接收）。 */
	onSubmitted: (response: SubmitScoreResponse) => void;
}

export interface RoundCommandQueue {
	enqueue: (command: RoundCommand) => void;
	getPending: () => readonly RoundCommand[];
	getConfirmed: () => ConfirmedRound;
	dispose: () => void;
}

interface TransformPlan {
	/** 佇列開頭連續的 transform 命令數。 */
	count: number;
	round: Round | null;
	changed: boolean;
	afterCommits: (() => void)[];
}

export function createRoundCommandQueue({
	initial,
	getPlayers,
	putRound,
	submitScore,
	onEvent,
	onConfirmed,
	onSubmitted,
}: RoundCommandQueueOptions): RoundCommandQueue {
	let confirmed: ConfirmedRound = initial;
	let queue: RoundCommand[] = [];
	let inFlight = false;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let failureCount = 0;
	let disposed = false;

	function clearRetryTimer(): void {
		if (retryTimer === null) return;
		clearTimeout(retryTimer);
		retryTimer = null;
	}

	function stop(reason: "conflict" | "unauthorized" | "rejected"): void {
		clearRetryTimer();
		queue = [];
		failureCount = 0;
		onEvent(reason);
	}

	function scheduleRetry(): void {
		const index = Math.min(failureCount, RETRY_DELAYS_MS.length - 1);
		failureCount += 1;
		onEvent("retrying");
		retryTimer = setTimeout(() => {
			retryTimer = null;
			flush();
		}, RETRY_DELAYS_MS[index]);
	}

	// 把請求結果分流成功與各種失敗；成功時由 onOk 更新已確認回合，之後移除本次送出的命令
	function finish<T>(
		result: RequestResult<T> | { kind: "failed" },
		count: number,
		onOk: (value: T) => void,
	): void {
		// 卸載後才到達的結果一律忽略，避免幽靈重試
		if (disposed) return;
		inFlight = false;

		if (result.kind === "ok" && result.value !== undefined) {
			onOk(result.value);
			queue.splice(0, count);
			failureCount = 0;
			flush();
			return;
		}
		if (result.kind === "ok" || result.kind === "failed") {
			scheduleRetry();
			return;
		}
		stop(result.kind);
	}

	function planTransforms(): TransformPlan {
		const players = getPlayers();
		const plan: TransformPlan = { count: 0, round: confirmed.round, changed: false, afterCommits: [] };
		while (plan.count < queue.length) {
			const command = queue[plan.count];
			if (command.kind !== "transform") break;
			plan.count += 1;
			const result = command.apply(plan.round, players);
			if (result === null) continue;
			plan.round = result.round;
			plan.changed = true;
			if (result.afterCommit !== undefined) plan.afterCommits.push(result.afterCommit);
		}
		return plan;
	}

	function sendPut(plan: TransformPlan, round: Round): void {
		inFlight = true;
		onEvent("saving");
		putRound(round, confirmed.version).then(
			(result) =>
				finish(result, plan.count, (value) => {
					confirmed = { round: value.data, version: value.version };
					onConfirmed(value.data, value.version);
					for (const afterCommit of plan.afterCommits) afterCommit();
				}),
			() => finish({ kind: "failed" }, plan.count, () => {}),
		);
	}

	function sendSubmit(command: Extract<RoundCommand, { kind: "submit" }>): void {
		inFlight = true;
		onEvent("saving");
		submitScore(command.matchId, command.scoreA, command.scoreB, confirmed.version).then(
			(result) =>
				finish(result, 1, (response) => {
					confirmed = { round: response.round.data, version: response.round.version };
					onConfirmed(response.round.data, response.round.version);
					onSubmitted(response);
				}),
			() => finish({ kind: "failed" }, 1, () => {}),
		);
	}

	function flush(): void {
		if (disposed || inFlight || retryTimer !== null) return;
		while (queue.length > 0) {
			const head = queue[0];
			if (head.kind === "submit") {
				sendSubmit(head);
				return;
			}
			const plan = planTransforms();
			if (plan.changed && plan.round !== null) {
				sendPut(plan, plan.round);
				return;
			}
			// 這一段 transform 全部無法套用：丟棄後繼續處理後面的命令
			queue.splice(0, plan.count);
		}
		onEvent("saved");
	}

	return {
		enqueue(command) {
			if (disposed) return;
			queue.push(command);
			flush();
		},
		getPending: () => [...queue],
		getConfirmed: () => confirmed,
		dispose() {
			disposed = true;
			clearRetryTimer();
			queue = [];
		},
	};
}
