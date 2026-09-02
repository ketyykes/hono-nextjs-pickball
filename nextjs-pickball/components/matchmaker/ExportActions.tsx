// components/matchmaker/ExportActions.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestPrint } from "@/lib/matchmaker/print-guard";
import type { ExportScene } from "@/lib/matchmaker/export-scene";

// 目前回合不存在時的說明文字（design Decision 5：停用不隱藏，disabled 狀態必須解釋
// 下一步該做什麼，比照 RoundControls.tsx／EmptyStage.tsx 既有的「停用並說明原因」寫法）。
const NO_ROUND_DESCRIPTION = "需先產生本輪對戰才能匯出。";

export interface ExportActionsProps {
	readonly scene: ExportScene | null;
	readonly fileName: string;
	/** JPG 匯出（繪製 → 編碼 → 下載）的注入點；實作於 §7 的 scene-canvas.ts，本元件不 import 它。 */
	readonly exportJpg: (scene: ExportScene, fileName: string) => Promise<void>;
	/** 列印函式的注入點；省略時元件層取 window.print（design Decision 4）。 */
	readonly printer?: unknown;
}

// 對戰頁的匯出入口（spec「對戰頁的匯出入口與可用狀態」）：兩顆按鈕、觸發匯出、被擋提示。
// 資料與 callback 一律走 props，本元件不 import 任何 store（design Decision 9 的既有裁決
// 延伸），也不做任何比分／勝方／姓名的字串組裝——那些全在 ExportScene 內完成（design Decision 2）。
export function ExportActions({ scene, fileName, exportJpg, printer }: ExportActionsProps) {
	// 列印被阻擋時的提示訊息；null 代表目前沒有提示，MUST 在每次點擊列印時重新判定
	// （成功時清除前一次的錯誤訊息，spec：列印成功時 MUST NOT 顯示任何錯誤訊息）。
	const [printMessage, setPrintMessage] = useState<string | null>(null);
	// JPG 匯出進行中旗標：繪製與編碼是非同步操作，連點會產生多份下載（spec：匯出入口的可用性與無障礙）。
	const [isExportingJpg, setIsExportingJpg] = useState(false);

	const hasNoRound = scene === null;

	async function handleExportJpg() {
		if (scene === null) {
			return;
		}
		setIsExportingJpg(true);
		try {
			await exportJpg(scene, fileName);
		} finally {
			setIsExportingJpg(false);
		}
	}

	function handlePrint() {
		// 判定 MUST 委派 requestPrint（lib/matchmaker/print-guard.ts），本元件不另寫
		// try/catch 判定或另寫訊息文案（tasks 5.4）。
		const result = requestPrint(printer ?? window.print?.bind(window));
		if (result.ok) {
			setPrintMessage(null);
			return;
		}
		setPrintMessage(result.message);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-2">
				<Button type="button" disabled={hasNoRound || isExportingJpg} onClick={handleExportJpg}>
					匯出 JPG
				</Button>
				<Button type="button" variant="outline" disabled={hasNoRound} onClick={handlePrint}>
					列印 PDF
				</Button>
			</div>
			{hasNoRound && <p className="text-xs text-muted-foreground">{NO_ROUND_DESCRIPTION}</p>}
			{printMessage !== null && (
				<p role="alert" className="text-sm text-destructive">
					{printMessage}
				</p>
			)}
		</div>
	);
}
