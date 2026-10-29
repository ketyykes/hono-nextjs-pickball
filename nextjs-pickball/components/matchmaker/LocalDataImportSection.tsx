// components/matchmaker/LocalDataImportSection.tsx
"use client";

import { useEffect, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LocalImportResultMessage } from "@/components/matchmaker/LocalImportResultMessage";
import {
	LOCAL_IMPORT_ANCHOR_ID,
	LOCAL_IMPORT_MESSAGES,
	describeImportOutcome,
	describeLocalSummary,
} from "@/components/matchmaker/local-import-view";
import type { ImportResultView } from "@/components/matchmaker/local-import-view";
import { useSession } from "@/hooks/useSession";
import { REMOTE_TRANSFER_MESSAGES } from "@/lib/matchmaker/remote-transfer";
import { resolveStorageMode } from "@/lib/sync/storage-mode";
import { buildLocalImportPayload, importLocalData } from "@/lib/sync/local-import";
import type { LocalImportPreview } from "@/lib/sync/local-import";

interface ImportSectionState {
	/** null 代表尚未讀取本機：localStorage 只能在 effect 內讀，首次 render 不可碰（hydration 安全）。 */
	readonly preview: LocalImportPreview | null;
	readonly isSubmitting: boolean;
	readonly result: ImportResultView | null;
}

type ImportSectionAction =
	| { readonly type: "loaded"; readonly preview: LocalImportPreview }
	| { readonly type: "submit-started" }
	| { readonly type: "submit-finished"; readonly result: ImportResultView }
	| { readonly type: "rejected-before-submit"; readonly result: ImportResultView };

const INITIAL_STATE: ImportSectionState = { preview: null, isSubmitting: false, result: null };

// 用 reducer 而非 useState：effect 內需要設定狀態時 dispatch 不會觸發 react-hooks/set-state-in-effect
function reducer(state: ImportSectionState, action: ImportSectionAction): ImportSectionState {
	switch (action.type) {
		case "loaded":
			return { ...state, preview: action.preview };
		case "submit-started":
			return { ...state, isSubmitting: true, result: null };
		case "submit-finished":
			return { ...state, isSubmitting: false, result: action.result };
		case "rejected-before-submit":
			return { ...state, result: action.result };
	}
}

// 資料頁的「匯入本機資料到雲端」區塊（B9）：把訪客時期留在本機的五個 key 一次匯入雲端。
// 只在雲端模式渲染，本機模式不輸出任何元素，訪客的 DOM 不變。
// 匯入成功後本機資料保留不動（使用者定案），本元件不寫入也不清除任何本機 key、不 reload；
// 失敗不自動重試，重送交給使用者決定（後端的拒絕規則保證不會重複匯入）。
export function LocalDataImportSection() {
	const session = useSession();
	const isRemote = resolveStorageMode(session) === "remote";
	// 以觸發當下畫面所見的帳號送出；帳號被其他分頁換掉時伺服器回 401，下面會刷新 session
	const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
	const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

	useEffect(() => {
		if (!isRemote) return;
		dispatch({ type: "loaded", preview: buildLocalImportPayload() });
	}, [isRemote]);

	if (!isRemote) return null;

	async function handleImport() {
		if (state.preview === null) return;
		if (userId === null) {
			dispatch({
				type: "rejected-before-submit",
				result: { tone: "error", text: REMOTE_TRANSFER_MESSAGES.unauthorized },
			});
			return;
		}
		dispatch({ type: "submit-started" });
		const outcome = await importLocalData(userId, state.preview.payload);
		if (outcome.kind === "unauthorized") void session.refresh();
		dispatch({ type: "submit-finished", result: describeImportOutcome(outcome) });
	}

	const { preview } = state;

	return (
		<Card id={LOCAL_IMPORT_ANCHOR_ID} data-testid="local-import-section">
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">匯入本機資料到雲端</h2>
				<p className="text-sm text-muted-foreground">
					把這台裝置上以訪客身分留下的參賽者、回合、歷史與計分板匯入目前登入的帳號。
				</p>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{preview !== null && preview.isEmpty && (
					<p data-testid="local-import-empty" className="text-sm text-muted-foreground">
						{LOCAL_IMPORT_MESSAGES.empty}
					</p>
				)}
				{preview !== null && !preview.isEmpty && preview.oversize && (
					<p data-testid="local-import-oversize" role="alert" className="text-sm text-destructive">
						{LOCAL_IMPORT_MESSAGES.oversize}
					</p>
				)}
				{preview !== null && !preview.isEmpty && !preview.oversize && (
					<>
						<p data-testid="local-import-summary" className="text-sm">
							{describeLocalSummary(preview.summary)}
						</p>
						<p className="text-sm text-muted-foreground">{LOCAL_IMPORT_MESSAGES.hint}</p>
						<div>
							<Button disabled={state.isSubmitting} onClick={() => void handleImport()}>
								匯入本機資料到雲端
							</Button>
						</div>
					</>
				)}
				{state.result !== null && <LocalImportResultMessage view={state.result} testId="local-import-message" />}
			</CardContent>
		</Card>
	);
}
