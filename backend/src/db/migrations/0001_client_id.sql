ALTER TABLE "players" ADD COLUMN "client_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "players_account_client_id_idx" ON "players" USING btree ("account_id","client_id");