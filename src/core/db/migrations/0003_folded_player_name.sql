ALTER TABLE `players` ADD `name_folded` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `players_name_folded_idx` ON `players` (`name_folded`);