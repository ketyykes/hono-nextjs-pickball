// components/matchmaker/RosterCsvImportSection.tsx
"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { applyRosterImport, parseRosterCsv } from "@/lib/matchmaker/roster-csv";
import type { ParseRosterCsvResult } from "@/lib/matchmaker/roster-csv";
import { readRoster, writeRoster } from "@/lib/matchmaker/storage";

// 匯入分兩階段：選檔後先解析出預覽（可新增人數＋問題列），使用者確認後才寫入
// （spec「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」）。取消／關閉預覽不寫入任何資料。
type PreviewState =
	| { readonly status: "idle" }
	| { readonly status: "structuralError"; readonly message: string }
	| { readonly status: "ready"; readonly result: Extract<ParseRosterCsvResult, { ok: true }> };

// 參賽者名單 CSV 匯入區塊（M8 §8.6）：選檔 → parseRosterCsv → 顯示預覽
// （可新增人數＋問題列的列號／欄位／原因）→ 有錯誤列時確認鈕 disabled →
// 確認後 applyRosterImport → 寫入 → reload。
// File.text() 等瀏覽器 I/O 只出現在本層（design Decision 7）；parseRosterCsv／
// applyRosterImport 皆為純函式，不在此另外實作任何驗證或空列過濾邏輯
// （Decision 13：parseRosterCsv 已跳過空白列，本層不再過濾一次）。
export function RosterCsvImportSection() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

	async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		const text = await file.text();
		const parsed = parseRosterCsv(text);
		if (!parsed.ok) {
			setPreview({ status: "structuralError", message: parsed.message });
			return;
		}
		setPreview({ status: "ready", result: parsed });
	}

	function handleCancel() {
		setPreview({ status: "idle" });
	}

	function handleConfirm() {
		if (preview.status !== "ready" || preview.result.errors.length > 0) return;

		const { players } = readRoster();
		const ids = preview.result.rows.map(() => crypto.randomUUID());
		const now = new Date().toISOString();
		const updatedRoster = applyRosterImport(players, preview.result, { ids, now });
		writeRoster(updatedRoster);
		location.reload();
	}

	const canConfirm = preview.status === "ready" && preview.result.errors.length === 0;

	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">參賽者名單 CSV 匯入</h2>
				<p className="text-sm text-muted-foreground">
					欄位：名稱／性別／強度分數／顏色起點／顏色終點。匯入採附加模式，不覆蓋既有參賽者。
				</p>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex flex-wrap gap-2">
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv,text/csv"
						className="hidden"
						data-testid="roster-csv-import-input"
						onChange={handleFileChange}
					/>
					<Button variant="outline" onClick={() => fileInputRef.current?.click()}>
						選擇 CSV 檔…
					</Button>
					<Button disabled={!canConfirm} onClick={handleConfirm}>
						確認匯入
					</Button>
					{preview.status !== "idle" && (
						<Button variant="outline" onClick={handleCancel}>
							取消
						</Button>
					)}
				</div>

				{preview.status === "structuralError" && (
					<p role="alert" className="text-sm text-destructive">
						{preview.message}
					</p>
				)}

				{preview.status === "ready" && (
					<div className="flex flex-col gap-2 text-sm" data-testid="roster-csv-preview">
						<p>可新增 {preview.result.rows.length} 人</p>
						{preview.result.errors.length > 0 && (
							<ul className="list-disc pl-5 text-destructive">
								{preview.result.errors.map((error) => (
									<li key={`${error.row}-${error.column}`}>
										第 {error.row} 列．{error.column}：{error.reason}
									</li>
								))}
							</ul>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
