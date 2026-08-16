// app/matchmaker/players/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyRoster } from "@/components/matchmaker/EmptyRoster";
import { PlayerForm } from "@/components/matchmaker/PlayerForm";
import type { PlayerFormSubmitValues } from "@/components/matchmaker/PlayerForm";
import { PlayerList } from "@/components/matchmaker/PlayerList";
import { ResetRosterDialog } from "@/components/matchmaker/ResetRosterDialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { defaultGradient } from "@/lib/matchmaker/colors";
import { useRosterStore } from "@/hooks/useRosterStore";
import type { Player } from "@/lib/matchmaker/types";

// 參賽者名單頁。刻意不加進全站 navbar——功能尚不完整（有名單但還無法產生對戰），
// 導覽整合待對戰畫面完成後與 site-navbar capability 一併處理（見 proposal 的不在範圍）。
//
// 新增／編輯共用同一個 PlayerForm，但各自開在獨立的 Dialog：新增 Dialog 由頁首按鈕
// 與 EmptyRoster 的入口共用同一份 open 狀態；編輯 Dialog 的開關則由「目前正在編輯
// 哪一位」（editingPlayer）決定，避免額外一顆 boolean 與 editingPlayer 脫鉤。
export default function PlayersPage() {
	const { players, droppedCount, addPlayer, updatePlayer, removePlayer, togglePlayerActive, resetRoster } =
		useRosterStore();
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

	// 僅供新增表單的顏色選擇器預覽用起始值；實際配色由 addPlayer 決定
	// （使用者未動過顏色選擇器時，PlayerForm 不會送出 colorFrom／colorTo，
	// 交由 lib/matchmaker/roster.ts 的 nextAutoGradient 掃描目前名單後取用）。
	const suggestedGradient = defaultGradient(players.length);

	function handleAddSubmit(values: PlayerFormSubmitValues) {
		addPlayer(values);
		setIsAddOpen(false);
	}

	function handleEditSubmit(values: PlayerFormSubmitValues) {
		if (!editingPlayer) return;
		updatePlayer(editingPlayer.id, values);
		setEditingPlayer(null);
	}

	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-bold">參賽者名單</h1>
					<p className="text-sm text-muted-foreground">
						共 {players.length} 位參賽者
					</p>
				</div>
				<div className="flex gap-2">
					<Button onClick={() => setIsAddOpen(true)}>新增參賽者</Button>
					<ResetRosterDialog onConfirm={resetRoster} />
				</div>
			</div>

			{/* droppedCount > 0：讀取持久化資料時有損壞筆數被逐筆丟棄，SHALL NOT 靜默處理 */}
			{droppedCount > 0 && (
				<div
					role="alert"
					className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
				>
					有 {droppedCount} 筆資料損毀已略過，其餘參賽者資料不受影響。
				</div>
			)}

			{players.length === 0 ? (
				<EmptyRoster onAddPlayer={() => setIsAddOpen(true)} />
			) : (
				<PlayerList
					players={players}
					onEdit={(player) => setEditingPlayer(player)}
					onRemove={removePlayer}
					onToggleActive={togglePlayerActive}
				/>
			)}

			<Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>新增參賽者</DialogTitle>
						<DialogDescription>填寫姓名、性別、顏色與強度分數後送出。</DialogDescription>
					</DialogHeader>
					<PlayerForm
						mode="add"
						suggestedColorFrom={suggestedGradient.colorFrom}
						suggestedColorTo={suggestedGradient.colorTo}
						onSubmit={handleAddSubmit}
						onCancel={() => setIsAddOpen(false)}
					/>
				</DialogContent>
			</Dialog>

			<Dialog
				open={editingPlayer !== null}
				onOpenChange={(open) => {
					if (!open) setEditingPlayer(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>編輯參賽者</DialogTitle>
						<DialogDescription>修改參賽者的姓名、性別、顏色或強度分數。</DialogDescription>
					</DialogHeader>
					{editingPlayer && (
						<PlayerForm
							mode="edit"
							initialPlayer={editingPlayer}
							onSubmit={handleEditSubmit}
							onCancel={() => setEditingPlayer(null)}
						/>
					)}
				</DialogContent>
			</Dialog>
		</main>
	);
}
