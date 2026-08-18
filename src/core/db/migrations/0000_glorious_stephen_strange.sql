CREATE TABLE `head_to_head` (
	`viewer_id` text NOT NULL,
	`opponent_id` text NOT NULL,
	`wins` integer NOT NULL,
	`losses` integer NOT NULL,
	PRIMARY KEY(`viewer_id`, `opponent_id`),
	FOREIGN KEY (`viewer_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opponent_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `head_to_head_wins_idx` ON `head_to_head` (`wins`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rank` integer NOT NULL,
	`combat_power` integer NOT NULL,
	`score` integer NOT NULL,
	`atk` integer NOT NULL,
	`def` integer NOT NULL,
	`crit_bp` integer NOT NULL,
	`hit` integer NOT NULL,
	`spd` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_rank_idx` ON `players` (`rank`);--> statement-breakpoint
CREATE INDEX `players_combat_power_idx` ON `players` (`combat_power`);