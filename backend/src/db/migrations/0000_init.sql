-- Hand-written to match src/db/schema.ts exactly, so a fresh `npm run db:migrate` has
-- something to run before `db:generate` has ever been invoked against a real database
-- (drizzle-kit needs a reachable Postgres to diff against, which this sandbox does not
-- have). Regenerate with `npm run db:generate` after the first schema change and commit
-- the result the same way src/core/db/migrations/ already does (ARCHITECTURE.md §7).

CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recovery_code_hash" text NOT NULL,
	"viewer_id" uuid,
	"season" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_recovery_code_hash_unique" UNIQUE("recovery_code_hash")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_folded" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"game_code" text DEFAULT '' NOT NULL,
	"rank" integer NOT NULL,
	"combat_power" bigint NOT NULL,
	"score" bigint NOT NULL,
	"hp" bigint DEFAULT 0 NOT NULL,
	"atk" bigint NOT NULL,
	"def" bigint NOT NULL,
	"crit_bp" bigint NOT NULL,
	"hit" bigint NOT NULL,
	"spd" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "head_to_head" (
	"account_id" uuid NOT NULL,
	"viewer_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "head_to_head_account_id_viewer_id_opponent_id_pk" PRIMARY KEY("account_id","viewer_id","opponent_id")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "head_to_head" ADD CONSTRAINT "head_to_head_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "head_to_head" ADD CONSTRAINT "head_to_head_viewer_id_players_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "head_to_head" ADD CONSTRAINT "head_to_head_opponent_id_players_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "players_account_rank_idx" ON "players" USING btree ("account_id","rank");
--> statement-breakpoint
CREATE INDEX "players_account_name_folded_idx" ON "players" USING btree ("account_id","name_folded");
--> statement-breakpoint
CREATE INDEX "players_account_combat_power_idx" ON "players" USING btree ("account_id","combat_power");
--> statement-breakpoint
CREATE INDEX "head_to_head_account_idx" ON "head_to_head" USING btree ("account_id");
