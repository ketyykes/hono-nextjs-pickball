// 色塊背景是使用者自訂的任意 hex 漸層，Tailwind class 只能表達預先定義的固定色階，
// 無法涵蓋任意 hex 組合，故走 inline style（比照 components/matchmaker/PlayerCard.tsx
// 既有先例，design Decision 8）；完成場次的「半透明、低飽和」同理走 inline style，
// 理由是它必須與漸層在同一個地方決定——若不透明度用 Tailwind class、漸層用
// inline style，兩者來源分家，日後調整完成場次視覺要改兩個檔案，且純函式測試
// 只能看到其中一半。
//
// 已知副作用：整格降不透明度會削弱 pickTextColor 針對完全不透明文字算出的對比
// （見 colors.ts／PlayerCard.tsx 的相關註解），但這是刻意的——prd.md 6.5 明訂
// 已完成場次 MUST 以半透明、低飽和度呈現。緩解方式是完成場次的關鍵資訊（比分、
// 勝方、完成時間）顯示在色塊外的場次資訊列，不受此處的減弱影響。

import { pickTextColor } from "./colors";
import type { Player } from "./types";

/** 呼叫 playerTileStyle 時，指定該場次是否已完成。 */
export interface PlayerTileStyleOptions {
	readonly completed: boolean;
}

/** 色塊可直接展開到 style 屬性的樣式；completed 為 false 時不含 opacity／filter。 */
export interface PlayerTileStyle {
	readonly background: string;
	readonly color: string;
	readonly opacity?: number;
	readonly filter?: string;
}

// 漸層角度沿用 PlayerCard.tsx 既有寫法，同一顏色來源在不同呈現位置採一致角度。
const GRADIENT_ANGLE_DEG = 135;

// 已完成場次的不透明度：對應 prd.md 6.5「半透明」。
const COMPLETED_OPACITY = 0.6;

// 已完成場次的飽和度倍率（CSS filter: saturate()）：對應 prd.md 6.5「低飽和度」。
const COMPLETED_SATURATION = 0.5;

export function playerTileStyle(
	player: Player,
	options: PlayerTileStyleOptions,
): PlayerTileStyle {
	const background = `linear-gradient(${GRADIENT_ANGLE_DEG}deg, ${player.colorFrom}, ${player.colorTo})`;
	const color = pickTextColor(player.colorFrom, player.colorTo);

	if (!options.completed) {
		return { background, color };
	}

	return {
		background,
		color,
		opacity: COMPLETED_OPACITY,
		filter: `saturate(${COMPLETED_SATURATION})`,
	};
}
