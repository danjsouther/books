ALTER TABLE "book_user_status" ADD COLUMN "percent_read" smallint;--> statement-breakpoint
ALTER TABLE "book_user_status" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "book_user_status" ADD COLUMN "public_note" text;--> statement-breakpoint
ALTER TABLE "book_user_status" ADD CONSTRAINT "book_user_status_percent_read_range" CHECK ("book_user_status"."percent_read" IS NULL OR "book_user_status"."percent_read" BETWEEN 0 AND 100);