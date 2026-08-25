const DISCORD_API = 'https://discord.com/api/v10';

export interface AnnouncedBook {
  readonly title: string;
  readonly slug: string;
}

/**
 * Posts new-book and release activity to a Discord channel. A different
 * Discord identity than `../auth/discord-client.ts`'s `DiscordClient`: that
 * one is user-token-scoped and only ever used transiently during sign-in;
 * this one is bot-token-scoped and long-lived, the same credential
 * `apps/bot` uses for channel posts (`apps/bot/src/post-changelog.ts`), just
 * called directly from the server instead.
 */
export interface ActivityAnnouncer {
  announceBookAdded(book: AnnouncedBook): Promise<void>;
  announceBookReleased(book: AnnouncedBook): Promise<void>;
}

function bookUrl(webBaseUrl: string, slug: string): string {
  return `${webBaseUrl}/books/${slug}`;
}

export interface DiscordAnnouncerConfig {
  readonly botToken: string;
  readonly channelId: string;
  readonly webBaseUrl: string;
}

/**
 * Never throws — a Discord outage must never fail the book creation or
 * release job that triggered the announcement, so every failure (network
 * error or a non-2xx response) is caught and logged here, not surfaced to
 * the caller.
 */
export function createDiscordAnnouncer(config: DiscordAnnouncerConfig): ActivityAnnouncer {
  const { botToken, channelId, webBaseUrl } = config;

  async function post(content: string): Promise<void> {
    try {
      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        console.error(
          `Discord activity announcement failed: ${String(res.status)} ${await res.text()}`,
        );
      }
    } catch (err: unknown) {
      console.error('Discord activity announcement failed', err);
    }
  }

  return {
    announceBookAdded(book) {
      return post(`📚 **New book added:** [${book.title}](${bookUrl(webBaseUrl, book.slug)})`);
    },
    announceBookReleased(book) {
      return post(`🎉 **Released today:** [${book.title}](${bookUrl(webBaseUrl, book.slug)})`);
    },
  };
}
