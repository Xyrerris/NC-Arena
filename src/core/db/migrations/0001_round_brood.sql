ALTER TABLE `players` ADD `origin` text DEFAULT 'REMOTE' NOT NULL;--> statement-breakpoint
CREATE INDEX `players_origin_idx` ON `players` (`origin`);