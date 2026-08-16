import { findUserByDiscordId, listSeries, listUpcomingReleases } from '@books/db';
import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { buildUpcomingEmbed } from '../format/embeds';
import type { BotCommand, BotDeps } from '../client';

const WITHIN_CHOICES = [30, 90, 180, 365] as const;
const DEFAULT_WITHIN_DAYS = 90;
const AUTOCOMPLETE_LIMIT = 25;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Reads the real clock once — the bot has no "viewer's local timezone" to
 *  anchor to, unlike the web app's calendar, so this reads UTC rather than a
 *  local time. Isolated the same way the calendar page isolates its own. */
function todayIsoUtc(): string {
  const d = new Date();
  return `${String(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${String(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const data = new SlashCommandBuilder()
  .setName('upcoming')
  .setDescription('Show upcoming book releases.')
  .addIntegerOption((opt) =>
    opt
      .setName('within')
      .setDescription(`How many days ahead to look (default ${String(DEFAULT_WITHIN_DAYS)}).`)
      .addChoices(WITHIN_CHOICES.map((days) => ({ name: `${String(days)} days`, value: days })))
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName('series')
      .setDescription('Only show releases in this series.')
      .setAutocomplete(true)
      .setRequired(false),
  )
  .addBooleanOption((opt) =>
    opt
      .setName('mine')
      .setDescription('Only show books you have marked as planned.')
      .setRequired(false),
  )
  .addBooleanOption((opt) =>
    opt
      .setName('include-tba')
      .setDescription('Also include releases with only a month or year known.')
      .setRequired(false),
  );

async function execute(
  interaction: ChatInputCommandInteraction,
  { db, webBaseUrl }: BotDeps,
): Promise<void> {
  const mine = interaction.options.getBoolean('mine') ?? false;
  const includeTba = interaction.options.getBoolean('include-tba') ?? false;
  const within = interaction.options.getInteger('within') ?? DEFAULT_WITHIN_DAYS;
  const seriesId = interaction.options.getString('series') ?? undefined;

  await interaction.deferReply({ ephemeral: mine });

  let mineUserId: string | undefined;
  if (mine) {
    const user = await findUserByDiscordId(db, interaction.user.id);
    if (!user) {
      await interaction.editReply(`You haven't signed in yet — visit ${webBaseUrl}/login.`);
      return;
    }
    mineUserId = user.id;
  }

  const from = todayIsoUtc();
  const to = addDaysIso(from, within);

  const releases = await listUpcomingReleases(db, {
    from,
    to,
    includeTba,
    ...(seriesId !== undefined && { seriesId }),
    ...(mineUserId !== undefined && { mineUserId }),
  });
  const embed = buildUpcomingEmbed(releases, webBaseUrl);
  await interaction.editReply({ embeds: [embed] });
}

async function autocomplete(interaction: AutocompleteInteraction, { db }: BotDeps): Promise<void> {
  const focused = interaction.options.getFocused();
  const { items } = await listSeries(db, {
    q: focused,
    page: 1,
    pageSize: AUTOCOMPLETE_LIMIT,
    sort: 'name',
    dir: 'asc',
    includeDeleted: false,
  });
  await interaction.respond(items.map((s) => ({ name: s.name, value: s.id })));
}

export const upcomingCommand: BotCommand = { data, execute, autocomplete };
