ALTER TABLE "books" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_url_scheme" CHECK ("books"."url" IS NULL OR "books"."url" ~* '^https?://');