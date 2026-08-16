import type { Db } from '@books/db';
import {
  Client,
  Events,
  GatewayIntentBits,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';

export interface BotDeps {
  readonly db: Db;
  readonly webBaseUrl: string;
}

export interface BotCommand {
  readonly data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction, deps: BotDeps): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, deps: BotDeps): Promise<void>;
}

const SOMETHING_WENT_WRONG = 'Something went wrong.';

/**
 * Dispatch, factored out of `createClient` so it's testable with a plain
 * mock interaction — no real gateway connection required. Every command
 * handler is wrapped: a throw becomes an ephemeral "Something went wrong."
 * reply rather than leaving the interaction to time out. Which reply
 * mechanism applies depends on whether the command had already deferred —
 * `reply()` on an already-deferred (or already-replied) interaction throws
 * a second error of its own.
 */
export async function handleInteraction(
  interaction: Interaction,
  registry: ReadonlyMap<string, BotCommand>,
  deps: BotDeps,
): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const command = registry.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, deps);
    } catch (err) {
      console.error(err);
      const payload = { content: SOMETHING_WENT_WRONG, ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch((e: unknown) => {
          console.error(e);
        });
      } else {
        await interaction.reply(payload).catch((e: unknown) => {
          console.error(e);
        });
      }
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    const command = registry.get(interaction.commandName);
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction, deps);
    } catch (err) {
      console.error(err);
    }
  }
}

export function createClient(commands: readonly BotCommand[], deps: BotDeps): Client {
  // `Guilds` only — no `MessageContent`: privileged, unnecessary for slash
  // commands, and requesting it invites verification friction for no benefit.
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const registry = new Map(commands.map((c) => [c.data.name, c]));

  client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(interaction, registry, deps);
  });

  return client;
}
