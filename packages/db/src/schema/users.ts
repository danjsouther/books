import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Discord snowflake. Also the bot's join key — `interaction.user.id` matches
     *  this directly, so linking a Discord account to an app account needs no flow. */
    discordId: text('discord_id').notNull().unique(),
    username: text('username').notNull(),
    displayName: text('display_name'),
    /** The avatar *hash*, not a URL: Discord's CDN path format has changed before,
     *  and a 32-character hash is cheaper to migrate than a stored URL. */
    avatarHash: text('avatar_hash'),
    isAdmin: boolean('is_admin').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    /** Case-insensitive, mirroring `authors_name_lower_key` — two members named
     *  `books_fan` and `Books_Fan` is a defect, not a cosmetic annoyance. */
    uniqueIndex('users_username_lower_key').on(sql`lower(${t.username})`),
  ],
);
