CREATE TYPE "public"."activity_kind" AS ENUM('book.added', 'status.changed', 'rating.changed', 'shelf.removed', 'book.released');--> statement-breakpoint
CREATE TYPE "public"."book_status" AS ENUM('plan', 'backlog', 'reading', 'completed', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."change_kind" AS ENUM('created', 'edited', 'deleted', 'restored', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."release_precision" AS ENUM('day', 'month', 'year', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."token_client" AS ENUM('web', 'desktop', 'service');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_lower" text GENERATED ALWAYS AS (lower(name)) STORED NOT NULL,
	"sort_name" text,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"authors" text[] DEFAULT '{}'::text[] NOT NULL,
	"series_id" uuid,
	"series_position" numeric(6, 2),
	"release_date" date,
	"release_precision" "release_precision" DEFAULT 'unknown' NOT NULL,
	"released_announced_at" timestamp with time zone,
	"page_count" integer,
	"isbn13" text,
	"cover_url" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_release_precision_date_agree" CHECK (("books"."release_precision" = 'unknown') = ("books"."release_date" IS NULL)),
	CONSTRAINT "books_page_count_positive" CHECK ("books"."page_count" IS NULL OR "books"."page_count" > 0),
	CONSTRAINT "books_isbn13_format" CHECK ("books"."isbn13" IS NULL OR "books"."isbn13" ~ '^[0-9]{13}$')
);
--> statement-breakpoint
CREATE TABLE "book_user_status" (
	"book_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "book_status" DEFAULT 'backlog' NOT NULL,
	"rating" smallint,
	"started_at" date,
	"finished_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_user_status_book_id_user_id_pk" PRIMARY KEY("book_id","user_id"),
	CONSTRAINT "book_user_status_rating_range" CHECK ("book_user_status"."rating" IS NULL OR "book_user_status"."rating" BETWEEN 0 AND 10),
	CONSTRAINT "book_user_status_dates_ordered" CHECK ("book_user_status"."finished_at" IS NULL OR "book_user_status"."started_at" IS NULL OR "book_user_status"."finished_at" >= "book_user_status"."started_at")
);
--> statement-breakpoint
CREATE TABLE "book_revisions" (
	"book_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_kind" "change_kind" NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "book_revisions_book_id_version_pk" PRIMARY KEY("book_id","version")
);
--> statement-breakpoint
CREATE TABLE "series_revisions" (
	"series_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_kind" "change_kind" NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "series_revisions_series_id_version_pk" PRIMARY KEY("series_id","version")
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"actor_id" uuid,
	"book_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"subject_type" "token_client" DEFAULT 'service' NOT NULL,
	"user_id" uuid,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"redirect_to" text,
	"client" "token_client" DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"parent_id" uuid,
	"client" "token_client" DEFAULT 'web' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip" "inet",
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_user_status" ADD CONSTRAINT "book_user_status_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_user_status" ADD CONSTRAINT "book_user_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_revisions" ADD CONSTRAINT "book_revisions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_revisions" ADD CONSTRAINT "book_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_revisions" ADD CONSTRAINT "series_revisions_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_revisions" ADD CONSTRAINT "series_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "series_live_name_key" ON "series" USING btree ("name_lower") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "series_deleted_at_idx" ON "series" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "books_live_isbn13_key" ON "books" USING btree ("isbn13") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "books_authors_idx" ON "books" USING gin ("authors");--> statement-breakpoint
CREATE INDEX "books_series_id_idx" ON "books" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "books_release_date_idx" ON "books" USING btree ("release_date");--> statement-breakpoint
CREATE INDEX "books_deleted_at_idx" ON "books" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "book_user_status_user_status_idx" ON "book_user_status" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "book_user_status_book_idx" ON "book_user_status" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "book_revisions_changed_at_idx" ON "book_revisions" USING btree ("changed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "book_revisions_changed_by_idx" ON "book_revisions" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "series_revisions_changed_at_idx" ON "series_revisions" USING btree ("changed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "series_revisions_changed_by_idx" ON "series_revisions" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "activity_created_at_idx" ON "activity" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_actor_idx" ON "activity" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "activity_book_idx" ON "activity" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_released_once_idx" ON "activity" USING btree ("kind","book_id") WHERE kind = 'book.released';--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");