"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Undo2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionBarProps {
	canUndo: boolean;
	onUndo: () => void;
	onReset: () => void;
	focusMode?: boolean;
}

export function ActionBar({
	canUndo,
	onUndo,
	onReset,
	focusMode = false,
}: ActionBarProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	return (
		// 專注模式時收為浮動縮小版，把整列的固定高度讓給分數面板。
		// z-40 需低於 portal 到 body 的 AlertDialog/GameOverDialog（z-50），
		// 否則浮動列會蓋在確認框之上。
		<div
			className={cn(
				"flex items-center justify-center",
				focusMode
					? "fixed bottom-2 left-1/2 z-40 -translate-x-1/2 gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 shadow-lg backdrop-blur"
					: "gap-4 border-t border-border px-4 py-3",
			)}
		>
			<Button variant="outline" disabled={!canUndo} onClick={onUndo} aria-label="撤銷上一分">
				<Undo2 className="mr-2 size-4" />
				Undo
			</Button>
			<Button variant="outline" onClick={() => setConfirmOpen(true)} aria-label="重置比賽">
				<RotateCcw className="mr-2 size-4" />
				重置
			</Button>
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>確定要重置比賽？</AlertDialogTitle>
						<AlertDialogDescription>
							目前的分數與發球紀錄將會清空，比賽回到 0-0 起手。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								onReset();
							}}
						>
							確定重置
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
