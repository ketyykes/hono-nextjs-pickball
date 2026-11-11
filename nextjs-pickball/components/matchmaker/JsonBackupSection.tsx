// components/matchmaker/JsonBackupSection.tsx
"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AppendImportRequest } from "@pickball/core/api/import";
import type { Backup } from "@pickball/core/matchmaker/transfer-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FileTextPicker } from "@/components/matchmaker/FileTextPicker";
import { LocalImportResultMessage } from "@/components/matchmaker/LocalImportResultMessage";
import {
	APPEND_ACTION_LABEL,
	APPEND_CANCEL_LABEL,
	APPEND_NAME_CHECK_HINT,
	APPEND_RULES,
	LOCAL_IMPORT_MESSAGES,
	describeAppendMatchedPlayers,
	describeAppendNewPlayers,
	describeAppendOutcome,
	describeAppendPreview,
	describeImportOutcome,
} from "@/components/matchmaker/local-import-view";
import type { ImportResultView } from "@/components/matchmaker/local-import-view";
import { downloadTextFile } from "@/components/matchmaker/downloadTextFile";
import { SyncStatusNotice } from "@/components/sync/SyncStatusNotice";
import { useSession } from "@/hooks/useSession";
import { backupFileName, buildBackup, parseBackup } from "@/lib/matchmaker/backup";
import { REMOTE_TRANSFER_MESSAGES, buildRemoteBackupSnapshot } from "@/lib/matchmaker/remote-transfer";
import { readSnapshot, writeBackup } from "@/lib/matchmaker/transfer-storage";
import {
	appendBackupToCloud,
	backupToAppendRequest,
	backupToImportRequest,
	fetchAppendPreview,
	importLocalData,
} from "@/lib/sync/local-import";
import type { AppendPlayersPreview } from "@/lib/sync/local-import";
import { pendingDataStatus, resolveStorageMode } from "@/lib/sync/storage-mode";

// JSON 完整備份區塊：涵蓋匯出（Blob + <a download>）與匯入
// （選檔 → File.text() → parseBackup → writeBackup → location.reload()，
// 「選檔 → 讀文字」的樣板抽到共用元件 FileTextPicker，「Blob → 下載」的樣板抽到
// 共用函式 downloadTextFile，與 HistoryCsvSection 共用）。
// Blob／<a download>／File.text() 等瀏覽器 I/O 只出現在元件層，
// lib/matchmaker/backup.ts 與 transfer-storage.ts 只回傳純資料或可判讀的結果物件。
//
// exportedAt MUST 直接來自 new Date().toISOString()（spec「JSON 完整備份的匯出內容」），
// SHALL NOT 由使用者輸入或其他來源取得。
//
// parseBackup／writeBackup 的失敗分支只有 message，沒有機器可讀的 code：語法／版本／結構三種失敗一律原樣顯示 message，不做分類、
// 不用字串比對 message 內容判斷類別。
// 附加確認的狀態：確認顯示中與請求進行中共用同一份內容，只差按鈕是否停用
type AppendState =
	| { kind: "idle" }
	| { kind: "confirm"; request: AppendImportRequest; preview: AppendPlayersPreview }
	| { kind: "appending"; request: AppendImportRequest; preview: AppendPlayersPreview };

export function JsonBackupSection() {
	const [message, setMessage] = useState<string | null>(null);
	// 雲端匯入成功的結果；失敗與驗證錯誤沿用 message
	const [cloudImportResult, setCloudImportResult] = useState<ImportResultView | null>(null);
	const [appendState, setAppendState] = useState<AppendState>({ kind: "idle" });
	// 每次選檔遞增；名單讀取或附加請求回來時若已不是同一次選檔，結果直接丟棄，不覆寫新的狀態
	const selectionRef = useRef(0);
	const session = useSession();
	const mode = resolveStorageMode(session);
	const isRemote = mode === "remote";
	// 以觸發當下畫面所見的帳號送出；帳號被其他分頁換掉時伺服器回 401，下面會刷新 session
	const userId = session.status === "ready" ? (session.user?.id ?? null) : null;

	async function handleRemoteExport() {
		if (userId === null) {
			setMessage(REMOTE_TRANSFER_MESSAGES.unauthorized);
			return;
		}
		const exportedAt = new Date().toISOString();
		const result = await buildRemoteBackupSnapshot(userId);
		if (!result.ok) {
			setMessage(result.message);
			if (result.unauthorized) void session.refresh();
			return;
		}
		setMessage(null);
		const backup = buildBackup(result.snapshot, { exportedAt });
		downloadTextFile(JSON.stringify(backup, null, 2), backupFileName(exportedAt), "application/json");
	}

	function handleExport() {
		if (isRemote) {
			void handleRemoteExport();
			return;
		}

		const exportedAt = new Date().toISOString();
		const backup = buildBackup(readSnapshot(), { exportedAt });
		downloadTextFile(JSON.stringify(backup, null, 2), backupFileName(exportedAt), "application/json");
	}

	function handleImportText(text: string) {
		const parsed = parseBackup(text);
		if (!parsed.ok) {
			setMessage(parsed.message);
			return;
		}

		const written = writeBackup(parsed.backup);
		if (!written.ok) {
			// 寫入失敗（LocalStorage 不可用／配額超出）只顯示訊息，不 reload
			// （spec「匯入匯出的錯誤處理與 LocalStorage 邊界」）。
			setMessage(written.message);
			return;
		}

		location.reload();
	}

	function showImportView(view: ImportResultView) {
		if (view.tone === "error") {
			setCloudImportResult(null);
			setMessage(view.text);
			return;
		}
		setMessage(null);
		setCloudImportResult(view);
	}

	// 雲端已有資料時的附加流程前半：先讀雲端名單算出預覽，讀完才顯示確認（讀取失敗不退回無預覽的確認）。
	async function prepareAppend(expectedUserId: string, backup: Backup, selection: number) {
		const request = backupToAppendRequest(backup);
		if (request.players.length === 0 && request.history.length === 0) {
			setMessage(LOCAL_IMPORT_MESSAGES.appendNothing);
			return;
		}

		const previewOutcome = await fetchAppendPreview(expectedUserId, request);
		if (selection !== selectionRef.current) return;
		if (previewOutcome.kind === "unauthorized") {
			void session.refresh();
			setMessage(REMOTE_TRANSFER_MESSAGES.unauthorized);
			return;
		}
		if (previewOutcome.kind === "failed") {
			setMessage(LOCAL_IMPORT_MESSAGES.appendPreviewFailed);
			return;
		}
		setAppendState({ kind: "confirm", request, preview: previewOutcome.preview });
	}

	// 雲端分支：備份檔只匯入雲端，不寫入任何本機 key、不 reload（與本機的覆寫式還原相反）。
	// userId 取自選檔當下的 render，onFileText 在 File.text() 讀完後才被呼叫，仍是同一份 closure。
	async function handleCloudImportText(text: string) {
		selectionRef.current += 1;
		const selection = selectionRef.current;
		setAppendState({ kind: "idle" });
		setMessage(null);
		setCloudImportResult(null);

		const parsed = parseBackup(text);
		if (!parsed.ok) {
			setMessage(parsed.message);
			return;
		}
		if (userId === null) {
			setMessage(REMOTE_TRANSFER_MESSAGES.unauthorized);
			return;
		}

		const outcome = await importLocalData(userId, backupToImportRequest(parsed.backup));
		if (selection !== selectionRef.current) return;
		if (outcome.kind === "cloud-not-empty") {
			await prepareAppend(userId, parsed.backup, selection);
			return;
		}
		if (outcome.kind === "unauthorized") void session.refresh();
		showImportView(describeImportOutcome(outcome));
	}

	// 按下當下才取 userId：確認顯示期間帳號可能已被換掉，送出的必須是目前畫面所見的帳號
	async function handleAppend() {
		if (appendState.kind !== "confirm") return;
		const { request, preview } = appendState;
		if (userId === null) {
			setAppendState({ kind: "idle" });
			setMessage(REMOTE_TRANSFER_MESSAGES.unauthorized);
			return;
		}

		const selection = selectionRef.current;
		setAppendState({ kind: "appending", request, preview });
		const outcome = await appendBackupToCloud(userId, request);
		if (selection !== selectionRef.current) return;
		setAppendState({ kind: "idle" });
		if (outcome.kind === "unauthorized") void session.refresh();
		showImportView(describeAppendOutcome(outcome));
	}

	let importPicker: ReactNode;
	if (isRemote) {
		// 雲端名單不能被備份檔整份覆蓋：改為「匯入到空的雲端」，拒絕規則與匯入本機資料相同
		importPicker = (
			<>
				<p className="w-full text-sm text-muted-foreground">{LOCAL_IMPORT_MESSAGES.jsonCloudImportHint}</p>
				<FileTextPicker
					label="選擇備份檔匯入雲端…"
					accept="application/json"
					testId="json-backup-cloud-import-input"
					onFileText={handleCloudImportText}
				/>
			</>
		);
	} else {
		importPicker = (
			<FileTextPicker
				label="選擇備份檔…"
				accept="application/json"
				testId="json-backup-import-input"
				onFileText={handleImportText}
			/>
		);
	}

	let content: ReactNode;
	if (mode === "pending") {
		// 儲存模式未定時不提供匯出與還原：兩種模式的操作會讀寫不同來源
		const pendingStatus = pendingDataStatus(session);
		content = (
			<CardContent data-sync-status={pendingStatus}>
				<SyncStatusNotice status={pendingStatus} />
			</CardContent>
		);
	} else {
		content = (
			<CardContent className="flex flex-wrap items-start gap-2">
				<Button onClick={handleExport}>匯出 JSON</Button>
				{importPicker}
				{appendState.kind !== "idle" && (
					<div
						data-testid="json-backup-append-confirm"
						className="flex w-full flex-col gap-3 rounded-md border p-4 text-sm"
					>
						<p>{describeAppendPreview(appendState.request.players.length, appendState.request.history.length)}</p>
						{appendState.preview.added.length > 0 && (
							<div className="flex flex-col gap-1">
								<p>{describeAppendNewPlayers(appendState.preview.added.length)}</p>
								<ul data-testid="json-backup-append-new-players" className="list-disc pl-5">
									{appendState.preview.added.map((name) => (
										<li key={name}>{name}</li>
									))}
								</ul>
							</div>
						)}
						{appendState.preview.added.length === 0 && (
							<p data-testid="json-backup-append-no-new-players">{LOCAL_IMPORT_MESSAGES.appendNoNewPlayers}</p>
						)}
						{appendState.preview.matched.length > 0 && (
							<div className="flex flex-col gap-1">
								<p>{describeAppendMatchedPlayers(appendState.preview.matched.length)}</p>
								<ul data-testid="json-backup-append-matched-players" className="list-disc pl-5">
									{appendState.preview.matched.map((name) => (
										<li key={name}>{name}</li>
									))}
								</ul>
							</div>
						)}
						{appendState.preview.added.length > 0 && <p>{APPEND_NAME_CHECK_HINT}</p>}
						<ul data-testid="json-backup-append-rules" className="list-disc pl-5 text-muted-foreground">
							{APPEND_RULES.map((rule) => (
								<li key={rule}>{rule}</li>
							))}
						</ul>
						<div className="flex gap-2">
							<Button type="button" onClick={handleAppend} disabled={appendState.kind === "appending"}>
								{APPEND_ACTION_LABEL}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => setAppendState({ kind: "idle" })}
								disabled={appendState.kind === "appending"}
							>
								{APPEND_CANCEL_LABEL}
							</Button>
						</div>
					</div>
				)}
				{cloudImportResult !== null && (
					<div className="flex w-full flex-col gap-1">
						<LocalImportResultMessage view={cloudImportResult} testId="json-backup-import-message" />
					</div>
				)}
				{message !== null && (
					<p role="alert" className="w-full text-sm text-destructive">
						{message}
					</p>
				)}
			</CardContent>
		);
	}

	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">JSON 完整備份</h2>
				<p className="text-sm text-muted-foreground">
					含參賽者、目前回合、歷史與重複配對簽章，可完整還原本機資料。
				</p>
			</CardHeader>
			{content}
		</Card>
	);
}
