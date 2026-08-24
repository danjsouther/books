ALTER TABLE "series" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "series_slug_key" ON "series" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "books_slug_key" ON "books" USING btree ("slug");