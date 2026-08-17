// components/matchmaker/PlayerList.tsx
"use client";

import { useState } from "react";
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
import { PlayerCard } from "@/components/matchmaker/PlayerCard";
import type { Player } from "@/lib/matchmaker/types";

interface PlayerListProps {
	players: Player[];
	onEdit: (player: Player) => void;
	onRemove: (id: string) => void;
	onToggleActive: (id: string) => void;
}

// 列表容器：組合 PlayerCard，並在此層集中管理「刪除確認」的本地 UI 狀態
// （pendingDelete 記錄目前待確認刪除的對象）。刪除 MUST 二次確認（prd.md 第 10 節），
// 故點擊卡片上的刪除鈕不會直接呼叫 onRemove，而是先開這裡的 AlertDialog。
// 編輯則不在此層開 Dialog——交由父層（app/matchmaker/players/page.tsx）統一管理
// 單一個編輯 Dialog，避免每筆卡片各自持有一份重複的編輯狀態與表單元件。
export function PlayerList({ players, onEdit, onRemove, onToggleActive }: PlayerListProps) {
	const [pendingDelete, setPendingDelete] = useState<Player | null>(null);

	return (
		<>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{players.map((player) => (
					<PlayerCard
						key={player.id}
						player={player}
						onEdit={() => onEdit(player)}
						onToggleActive={() => onToggleActive(player.id)}
						onDeleteRequest={() => setPendingDelete(player)}
					/>
				))}
			</div>

			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>刪除參賽者</AlertDialogTitle>
						<AlertDialogDescription>
							確定要刪除「{pendingDelete?.name}」嗎？此操作無法復原。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (pendingDelete) onRemove(pendingDelete.id);
								setPendingDelete(null);
							}}
						>
							確定刪除
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
