import { schema, type Db } from '@books/db';
import { connectForTests, hasDatabase, truncateAll } from '@books/db/test-support';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { upcomingCommand } from './upcoming';

const { books, users } = schema;
const WEB_BASE_URL = 'https://books.example.com';

function fakeInteraction(discordUserId: string, options: Record<string, unknown>) {
  return {
    user: { id: discordUserId },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getBoolean: (name: string) => (options[name] as boolean | undefined) ?? null,
      getInteger: (name: string) => (options[name] as number | undefined) ?? null,
      getString: (name: string) => (options[name] as string | undefined) ?? null,
    },
  };
}

describe.skipIf(!hasDatabase)('upcomingCommand.execute', () => {
  let db: Db;
  let pool: Pool;

  beforeAll(async () => {
    ({ db, pool } = await connectForTests());
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('replies ephemerally with a sign-in prompt for an unknown Discord user when mine:true', async () => {
    const interaction = fakeInteraction('unknown-discord-id', { mine: true });

    await upcomingCommand.execute(interaction as unknown as ChatInputCommandInteraction, {
      db,
      webBaseUrl: WEB_BASE_URL,
    });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith(
      `You haven't signed in yet — visit ${WEB_BASE_URL}/login.`,
    );
  });

  it("restricts results to the linked user's planned books when mine:true", async () => {
    const [user] = await db
      .insert(users)
      .values({ discordId: 'discord-42', username: 'linked-member' })
      .returning({ id: users.id });
    if (user === undefined) throw new Error('no user row');

    const today = new Date().toISOString().slice(0, 10);
    const [book] = await db
      .insert(books)
      .values({ title: 'Planned Book', releaseDate: today, releasePrecision: 'day' })
      .returning({ id: books.id });
    if (book === undefined) throw new Error('no book row');

    await db
      .insert(schema.bookUserStatus)
      .values({ bookId: book.id, userId: user.id, status: 'plan' });

    const interaction = fakeInteraction('discord-42', { mine: true, within: 90 });

    await upcomingCommand.execute(interaction as unknown as ChatInputCommandInteraction, {
      db,
      webBaseUrl: WEB_BASE_URL,
    });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const reply = interaction.editReply.mock.calls[0]?.[0] as {
      embeds: { fields: { value: string }[] }[];
    };
    const fieldValues = reply.embeds[0]?.fields.map((f) => f.value).join('\n') ?? '';
    expect(fieldValues).toContain('Planned Book');
  });
});
