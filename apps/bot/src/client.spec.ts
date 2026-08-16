import type { Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { handleInteraction, type BotCommand, type BotDeps } from './client';

const DEPS = { db: {} as BotDeps['db'], webBaseUrl: 'https://books.example.com' };

function fakeChatInputInteraction(
  commandName: string,
  overrides: Partial<{ deferred: boolean; replied: boolean }> = {},
) {
  return {
    isChatInputCommand: () => true,
    isAutocomplete: () => false,
    commandName,
    deferred: overrides.deferred ?? false,
    replied: overrides.replied ?? false,
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeAutocompleteInteraction(commandName: string) {
  return {
    isChatInputCommand: () => false,
    isAutocomplete: () => true,
    commandName,
  };
}

describe('handleInteraction', () => {
  it("invokes the matching command's execute", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const command: BotCommand = { data: { name: 'upcoming' } as BotCommand['data'], execute };
    const interaction = fakeChatInputInteraction('upcoming');

    await handleInteraction(
      interaction as unknown as Interaction,
      new Map([['upcoming', command]]),
      DEPS,
    );

    expect(execute).toHaveBeenCalledWith(interaction, DEPS);
  });

  it('is a no-op for an unrecognized command name', async () => {
    const interaction = fakeChatInputInteraction('unknown-command');
    await handleInteraction(interaction as unknown as Interaction, new Map(), DEPS);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('replies ephemerally with a generic message when a not-yet-deferred command throws', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('boom'));
    const command: BotCommand = { data: { name: 'upcoming' } as BotCommand['data'], execute };
    const interaction = fakeChatInputInteraction('upcoming', { deferred: false, replied: false });

    await handleInteraction(
      interaction as unknown as Interaction,
      new Map([['upcoming', command]]),
      DEPS,
    );

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Something went wrong.',
      ephemeral: true,
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('edits the deferred reply with a generic message when an already-deferred command throws', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('boom'));
    const command: BotCommand = { data: { name: 'upcoming' } as BotCommand['data'], execute };
    const interaction = fakeChatInputInteraction('upcoming', { deferred: true, replied: false });

    await handleInteraction(
      interaction as unknown as Interaction,
      new Map([['upcoming', command]]),
      DEPS,
    );

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Something went wrong.',
      ephemeral: true,
    });
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('invokes autocomplete for a focused option', async () => {
    const autocomplete = vi.fn().mockResolvedValue(undefined);
    const command: BotCommand = {
      data: { name: 'upcoming' } as BotCommand['data'],
      execute: vi.fn(),
      autocomplete,
    };
    const interaction = fakeAutocompleteInteraction('upcoming');

    await handleInteraction(
      interaction as unknown as Interaction,
      new Map([['upcoming', command]]),
      DEPS,
    );

    expect(autocomplete).toHaveBeenCalledWith(interaction, DEPS);
  });

  it('does not throw when an autocomplete handler throws', async () => {
    const autocomplete = vi.fn().mockRejectedValue(new Error('boom'));
    const command: BotCommand = {
      data: { name: 'upcoming' } as BotCommand['data'],
      execute: vi.fn(),
      autocomplete,
    };
    const interaction = fakeAutocompleteInteraction('upcoming');

    await expect(
      handleInteraction(
        interaction as unknown as Interaction,
        new Map([['upcoming', command]]),
        DEPS,
      ),
    ).resolves.toBeUndefined();
  });
});
