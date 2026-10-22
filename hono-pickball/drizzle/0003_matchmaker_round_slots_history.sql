CREATE TABLE `matchmaker_history` (
	`user_id` text NOT NULL,
	`match_id` text NOT NULL,
	`played_at` integer NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `match_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `matchmaker_match_slots` (
	`user_id` text NOT NULL,
	`match_id` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `match_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `matchmaker_round` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_batch_guards` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
