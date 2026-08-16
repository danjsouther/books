import { createDb } from '@books/db';
import { loadEnv } from '@books/config';
import { createClient } from './client';
import { upcomingCommand } from './commands/upcoming';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);

const client = createClient([upcomingCommand], { db, webBaseUrl: env.WEB_BASE_URL });

client.once('ready', (readyClient) => {
  console.log(`books bot logged in as ${readyClient.user.tag}`);
});

await client.login(env.DISCORD_BOT_TOKEN);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void client.destroy();
    void pool.end().finally(() => process.exit(0));
  });
}
