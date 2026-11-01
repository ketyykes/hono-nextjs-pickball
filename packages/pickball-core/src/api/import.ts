import { z } from "zod";
import { BackupSchema } from "../matchmaker/transfer-types";
import { PlayerWriteSchema } from "./players";
import { MatchSlotSchema } from "./round";
import { ScoreboardStateSchema } from "../scoreboard/types";

// 獨立計分板不綁定任何場次；有 matchId 的計分板屬於分槽，混進這裡會被當成獨立計分板寫入雲端。
const StandaloneScoreboardSchema = ScoreboardStateSchema.refine(
  (state) => state.matchId === null,
  { message: "獨立計分板的 matchId 必須為 null", path: ["matchId"] },
);

/**
 * 本機資料匯入請求：備份檔的四段資料加上計分機的獨立計分板與場次分槽。
 * 欄位一律沿用既有 schema，不重新宣告；跨段的一致性由 superRefine 檢查。
 */
export const LocalImportRequestSchema = BackupSchema.extend({
  players: z.array(PlayerWriteSchema),
  scoreboard: z.object({
    current: StandaloneScoreboardSchema.nullable(),
    matches: z.array(MatchSlotSchema),
  }),
}).superRefine((data, ctx) => {
  // 重複的 id 會讓後端單一 batch 在主鍵衝突時整批回滾，先在契約層擋下才能回 400 而非 500。
  const playerIds = data.players.map((player) => player.id);
  if (new Set(playerIds).size !== playerIds.length) {
    ctx.addIssue({ code: "custom", message: "players 內的 id 不可重複", path: ["players"] });
  }

  const historyMatchIds = data.history.map((entry) => entry.matchId);
  if (new Set(historyMatchIds).size !== historyMatchIds.length) {
    ctx.addIssue({ code: "custom", message: "history 內的 matchId 不可重複", path: ["history"] });
  }

  const slotMatchIds = data.scoreboard.matches.map((slot) => slot.matchId);
  if (new Set(slotMatchIds).size !== slotMatchIds.length) {
    ctx.addIssue({
      code: "custom",
      message: "scoreboard.matches 內的 matchId 不可重複",
      path: ["scoreboard", "matches"],
    });
  }

  // 分槽只服務尚在進行的場次；已完成場次的分槽或找不到場次的分槽匯入後沒有任何入口可讀取。
  const openMatchIds = new Set(
    (data.currentRound?.matches ?? [])
      .filter((match) => match.status !== "completed")
      .map((match) => match.id),
  );
  data.scoreboard.matches.forEach((slot, index) => {
    if (!openMatchIds.has(slot.matchId)) {
      ctx.addIssue({
        code: "custom",
        message: "分槽的 matchId 必須屬於目前回合中尚未完成的場次",
        path: ["scoreboard", "matches", index, "matchId"],
      });
    }
  });

  // 空匯入沒有任何可寫入的內容，卻會讓前端誤以為已完成匯入。
  const isEmpty =
    data.players.length === 0 &&
    data.currentRound === null &&
    data.history.length === 0 &&
    data.scoreboard.matches.length === 0 &&
    data.scoreboard.current === null;
  if (isEmpty) {
    ctx.addIssue({ code: "custom", message: "匯入內容不可全部為空" });
  }
});

/** 匯入成功回應：各段實際寫入的筆數；scoreboardCurrent 區分「寫入」「雲端已有而略過」「本機沒有」。 */
export const LocalImportResponseSchema = z.object({
  imported: z.object({
    players: z.number().int().nonnegative(),
    round: z.boolean(),
    slots: z.number().int().nonnegative(),
    history: z.number().int().nonnegative(),
    scoreboardCurrent: z.enum(["imported", "skipped", "none"]),
  }),
});

export type LocalImportRequest = z.infer<typeof LocalImportRequestSchema>;
export type LocalImportResponse = z.infer<typeof LocalImportResponseSchema>;
