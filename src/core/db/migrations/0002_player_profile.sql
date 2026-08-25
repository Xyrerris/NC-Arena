ALTER TABLE `players` ADD `level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `game_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `hp` integer DEFAULT 0 NOT NULL;