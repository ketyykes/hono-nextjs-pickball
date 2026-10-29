import type { MatchSlot } from "@pickball/core/api/round";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type { Round } from "@pickball/core/matchmaker/round-types";
import type { Player } from "@pickball/core/matchmaker/types";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 欄位對應 better-auth 1.6 核心 schema（account 不含 1.7 才新增的 issuer）。
// 欄位若與 adapter 不符，以新增 migration 修正，不改寫 0000。

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

// 使用者資料表慣例：user_id FK cascade、version、updated_at；JSON 快照放 data。
export const scoreboardCurrent = sqliteTable("scoreboard_current", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).$type<ScoreboardState>().notNull(),
  version: integer("version").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// 複合主鍵 (user_id, id)：參賽者 id 由前端產生，不同使用者匯入同一份備份會有相同 id，
// 若以 id 單獨當主鍵，一位使用者的匯入會因另一位的資料失敗並洩漏「某 id 已存在」。
export const matchmakerPlayers = sqliteTable(
  "matchmaker_players",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    data: text("data", { mode: "json" }).$type<Player>().notNull(),
    sortOrder: integer("sort_order").notNull(),
    version: integer("version").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

// 每位使用者一筆目前回合；回合的所有變更都是整份替換，所以不拆欄。
export const matchmakerRound = sqliteTable("matchmaker_round", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).$type<Round>().notNull(),
  version: integer("version").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// 場次 id 由前端產生，只在同一使用者內唯一，故用複合主鍵。
export const matchmakerMatchSlots = sqliteTable(
  "matchmaker_match_slots",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull(),
    data: text("data", { mode: "json" }).$type<MatchSlot>().notNull(),
    version: integer("version").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.matchId] })],
);

// played_at 拆欄供依區間查詢與排序；歷史只增不改，version 恆為 1。
// 主鍵 (user_id, match_id) 是同一場次重複完成的第二道防線。
export const matchmakerHistory = sqliteTable(
  "matchmaker_history",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull(),
    playedAt: integer("played_at", { mode: "timestamp_ms" }).notNull(),
    data: text("data", { mode: "json" }).$type<MatchHistoryEntry>().notNull(),
    version: integer("version").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.matchId] })],
);

// 整批守衛：平時恆為空。version 刻意不設 DEFAULT 且為 NOT NULL，
// 否則 NULL 會被預設值取代而使守衛失效。
export const syncBatchGuards = sqliteTable("sync_batch_guards", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
