import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiscordAnnouncer } from './announcer';

describe('createDiscordAnnouncer', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a new-book announcement to the configured channel with the bot token', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const announcer = createDiscordAnnouncer({
      botToken: 'test-token',
      channelId: '900000000000000003',
      webBaseUrl: 'https://books.example.com',
    });

    await announcer.announceBookAdded({ title: 'Leviathan Wakes', slug: 'leviathan-wakes' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/v10/channels/900000000000000003/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bot test-token' });
    expect(JSON.parse(init.body as string)).toEqual({
      content:
        '📚 **New book added:** [Leviathan Wakes](https://books.example.com/books/leviathan-wakes)',
    });
  });

  it('posts a release announcement', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const announcer = createDiscordAnnouncer({
      botToken: 'test-token',
      channelId: '900000000000000003',
      webBaseUrl: 'https://books.example.com',
    });

    await announcer.announceBookReleased({ title: 'Leviathan Wakes', slug: 'leviathan-wakes' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      content:
        '🎉 **Released today:** [Leviathan Wakes](https://books.example.com/books/leviathan-wakes)',
    });
  });

  it('swallows a non-2xx response instead of throwing', async () => {
    fetchMock.mockResolvedValue(new Response('bad channel', { status: 403 }));
    const announcer = createDiscordAnnouncer({
      botToken: 'test-token',
      channelId: '900000000000000003',
      webBaseUrl: 'https://books.example.com',
    });

    await expect(
      announcer.announceBookAdded({ title: 'Anything', slug: 'anything' }),
    ).resolves.toBeUndefined();
  });

  it('swallows a network error instead of throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const announcer = createDiscordAnnouncer({
      botToken: 'test-token',
      channelId: '900000000000000003',
      webBaseUrl: 'https://books.example.com',
    });

    await expect(
      announcer.announceBookAdded({ title: 'Anything', slug: 'anything' }),
    ).resolves.toBeUndefined();
  });
});
