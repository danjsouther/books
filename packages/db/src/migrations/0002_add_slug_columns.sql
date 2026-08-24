ALTER TABLE "series" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" USING btree (lower("username"));