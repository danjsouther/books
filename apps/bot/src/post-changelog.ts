import { readFileSync } from 'node:fs';
import { loadBotEnv } from '@books/config';
import { REST, Routes } from 'discord.js';
import { parseChangelogSection } from './format/changelog';
import { buildChangelogEmbed } from './format/embeds';

// Hardcoded — this is a single-repo project with no existing config surface
// for "the app's own GitHub URL," unlike WEB_BASE_URL/PUBLIC_BASE_URL which
// genuinely vary per deployment.
const REPO_URL = 'https://github.com/danjsouther/books';

/**
 * `APP_VERSION` is only set in the built, bundled script — see
 * `scripts/build-bot.mjs`'s `define`. Under local `tsx` (`npm run
 * bot:post-changelog`) it's unset, so this falls back to reading
 * `package.json` directly, the same source `build-bot.mjs` itself reads.
 */
function resolveVersion(): string {
  const fromBuild = process.env['APP_VERSION'];
  if (fromBuild !== undefined && fromBuild !== '') return fromBuild;
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  return pkg.version;
}

/**
 * Run manually right after a release lands, never on container start — see
 * `deploy-commands.ts`'s doc comment for the same reasoning, and note this
 * reads `CHANGELOG.md` off disk, so it only produces a correct post when run
 * against a checkout already at the release commit.
 *
 * Locally: `npm run bot:post-changelog`. Against a Compose deployment, this
 * file is bundled alongside `main.js` (see `scripts/build-bot.mjs`) so it can
 * run with that container's own env and no local `node_modules`:
 * `docker compose run --rm bot node dist/bot/post-changelog.js`. Wired to the
 * repo's `vX.Y.Z` tag-push convention by
 * `.github/workflows/discord-changelog.yml`.
 */
async function main(): Promise<void> {
  const env = loadBotEnv();
  const version = resolveVersion();

  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const section = parseChangelogSection(changelog, version);
  if (!section) {
    throw new Error(
      `No CHANGELOG.md section found for version ${version} — did the release commit move the ` +
        `Unreleased entries under "## ${version} - <date>"?`,
    );
  }

  const embed = buildChangelogEmbed(version, section, `${REPO_URL}/blob/v${version}/CHANGELOG.md`);
  const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);
  await rest.post(Routes.channelMessages(env.DISCORD_CHANGELOG_CHANNEL_ID), {
    body: { embeds: [embed] },
  });

  console.log(`Posted the v${version} changelog to channel ${env.DISCORD_CHANGELOG_CHANNEL_ID}.`);
}

void main();
