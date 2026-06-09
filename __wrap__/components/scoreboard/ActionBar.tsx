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

interface ActionBarProps {
	canUndo: boolean;
	onUndo: () => void;
	onReset: () => void;
}

export function ActionBar({ canUndo, onUndo, onReset }: ActionBarProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	return (
		<div className="flex items-center justify-center gap-4 border-t border-border px-4 py-3">
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
