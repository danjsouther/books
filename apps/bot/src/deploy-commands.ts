import { loadEnv } from '@books/config';
import { REST, Routes } from 'discord.js';
import { upcomingCommand } from './commands/upcoming';

/**
 * Run manually via `npm run bot:deploy-commands` — never on container start.
 * Re-registering on every boot is a rate-limit hazard and makes restarts slow
 * for no benefit, since command definitions change far less often than the
 * process restarts.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const commands = [upcomingCommand.data.toJSON()];
  const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);

  const route =
    env.DISCORD_GUILD_ID !== undefined
      ? Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_GUILD_ID)
      : Routes.applicationCommands(env.DISCORD_APP_ID);

  await rest.put(route, { body: commands });
  console.log(
    `Deployed ${String(commands.length)} command(s) ${env.DISCORD_GUILD_ID !== undefined ? 'to guild ' + env.DISCORD_GUILD_ID : 'globally'}.`,
  );
}

void main();
