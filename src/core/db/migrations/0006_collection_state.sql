CREATE TABLE `collection_reads` (
	`planet` text NOT NULL,
	`avatar_address` text NOT NULL,
	`unlocked_ids` text NOT NULL,
	`read_at` integer NOT NULL,
	`source` text NOT NULL,
	`block_index` integer,
	PRIMARY KEY(`planet`, `avatar_address`)
);
--> statement-breakpoint
CREATE TABLE `collection_ticks` (
	`planet` text NOT NULL,
	`avatar_address` text NOT NULL,
	`collection_id` integer NOT NULL,
	PRIMARY KEY(`planet`, `avatar_address`, `collection_id`)
);
