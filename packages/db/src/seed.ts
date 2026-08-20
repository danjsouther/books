import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { createBook, deleteBook, updateBook, type BookInput } from './mutations/books';
import { createSeries, deleteSeries, restoreSeries, type SeriesInput } from './mutations/series';
import { activity } from './schema/activity';
import { bookUserStatus } from './schema/shelf';
import { users } from './schema/users';
import type { Actor } from './mutations/with-revision';

/**
 * A realistic fixture set, used by local development *and* by the Playwright
 * suite. It deliberately includes the awkward cases — every release precision, a
 * `1.5` novella, a soft-deleted book and series, a record deleted and then
 * restored, a book with three revisions, and a backdated addition — because a
 * seed that only contains happy-path rows lets the failure modes this schema is
 * designed around go unnoticed.
 */

/** Fixed so tests can assert on them. */
const DAY = 24 * 60 * 60 * 1000;

function isoDate(offsetDays: number, from = new Date()): string {
  const d = new Date(from.getTime() + offsetDays * DAY);
  return d.toISOString().slice(0, 10);
}

function book(partial: Partial<BookInput> & { title: string }): BookInput {
  return {
    subtitle: null,
    description: null,
    authors: [],
    seriesId: null,
    seriesPosition: null,
    releaseDate: null,
    releasePrecision: 'unknown',
    pageCount: null,
    asin: null,
    coverUrl: null,
    url: null,
    deletedAt: null,
    deletedBy: null,
    ...partial,
  };
}

function seriesInput(partial: Partial<SeriesInput> & { name: string }): SeriesInput {
  return { sortName: null, description: null, deletedAt: null, deletedBy: null, ...partial };
}

/** Order matters: `activity` and the revision tables reference books, and books
 *  reference series. */
async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE activity, book_revisions, series_revisions, book_user_status,
                   author_books, authors, refresh_tokens, api_tokens, oauth_states,
                   books, series, users
    RESTART IDENTITY CASCADE
  `);
}

export async function seed(db: Db): Promise<void> {
  await truncateAll(db);

  const inserted = await db
    .insert(users)
    .values([
      { discordId: '100000000000000001', username: 'dan', displayName: 'Dan', isAdmin: true },
      { discordId: '100000000000000002', username: 'sam', displayName: 'Sam' },
      { discordId: '100000000000000003', username: 'ali', displayName: 'Ali' },
    ])
    .returning({ id: users.id, username: users.username });

  const byName = new Map(inserted.map((u) => [u.username, u.id]));
  const userId = (username: string): string => {
    const id = byName.get(username);
    if (id === undefined) throw new Error(`Seed user ${username} was not inserted.`);
    return id;
  };
  const danId = userId('dan');
  const samId = userId('sam');
  const aliId = userId('ali');
  const dan: Actor = { id: danId };
  const sam: Actor = { id: samId };
  const ali: Actor = { id: aliId };

  const expanse = await createSeries(
    db,
    seriesInput({
      name: 'The Expanse',
      sortName: 'Expanse, The',
      description: 'Nine books of solar-system politics and alien horror.',
    }),
    dan,
  );
  const stormlight = await createSeries(
    db,
    seriesInput({ name: 'The Stormlight Archive', sortName: 'Stormlight Archive, The' }),
    sam,
  );
  const murderbot = await createSeries(db, seriesInput({ name: 'The Murderbot Diaries' }), ali);

  // Deleted and then restored, so the multi-version delete path has a fixture.
  const restored = await createSeries(db, seriesInput({ name: 'Wayfarers' }), dan);
  await deleteSeries(db, restored.id, sam);
  await restoreSeries(db, restored.id, sam);

  // Left in the trash.
  const trashedSeries = await createSeries(db, seriesInput({ name: 'Abandoned Trilogy' }), ali);
  await deleteSeries(db, trashedSeries.id, ali);

  const corey = ['James S. A. Corey'];
  const sanderson = ['Brandon Sanderson'];
  const wells = ['Martha Wells'];

  // --- Released, day precision -------------------------------------------------
  const leviathan = await createBook(
    db,
    book({
      title: 'Leviathan Wakes',
      authors: corey,
      seriesId: expanse.id,
      seriesPosition: '1.00',
      releaseDate: '2011-06-15',
      releasePrecision: 'day',
      pageCount: 561,
      asin: '0316129089',
    }),
    dan,
  );

  // Three revisions on one record, so the history and diff views have something
  // real to render.
  await updateBook(db, leviathan.id, { pageCount: 577 }, sam);
  await updateBook(
    db,
    leviathan.id,
    { description: 'Humanity has colonised the solar system.' },
    ali,
  );

  await createBook(
    db,
    book({
      title: "Caliban's War",
      authors: corey,
      seriesId: expanse.id,
      seriesPosition: '2.00',
      releaseDate: '2012-06-26',
      releasePrecision: 'day',
      pageCount: 595,
      asin: '0316129062',
    }),
    dan,
  );
  const abaddon = await createBook(
    db,
    book({
      title: "Abaddon's Gate",
      authors: corey,
      seriesId: expanse.id,
      seriesPosition: '3.00',
      releaseDate: '2013-06-04',
      releasePrecision: 'day',
      asin: '0316129070',
    }),
    sam,
  );

  /** The novella that justifies a decimal position. */
  await createBook(
    db,
    book({
      title: 'The Churn',
      authors: corey,
      seriesId: expanse.id,
      seriesPosition: '3.50',
      releaseDate: '2014-04-29',
      releasePrecision: 'day',
      pageCount: 80,
    }),
    sam,
  );

  await createBook(
    db,
    book({
      title: 'The Way of Kings',
      authors: sanderson,
      seriesId: stormlight.id,
      seriesPosition: '1.00',
      releaseDate: '2010-08-31',
      releasePrecision: 'day',
      pageCount: 1007,
      asin: '0765326353',
    }),
    sam,
  );
  await createBook(
    db,
    book({
      title: 'Words of Radiance',
      authors: sanderson,
      seriesId: stormlight.id,
      seriesPosition: '2.00',
      releaseDate: '2014-03-04',
      releasePrecision: 'day',
      pageCount: 1087,
    }),
    sam,
  );
  const allSystems = await createBook(
    db,
    book({
      title: 'All Systems Red',
      authors: wells,
      seriesId: murderbot.id,
      seriesPosition: '1.00',
      releaseDate: '2017-05-02',
      releasePrecision: 'day',
      pageCount: 149,
      asin: '0765397536',
    }),
    ali,
  );
  await createBook(
    db,
    book({
      title: 'Artificial Condition',
      authors: wells,
      seriesId: murderbot.id,
      seriesPosition: '2.00',
      releaseDate: '2018-05-08',
      releasePrecision: 'day',
      pageCount: 158,
    }),
    ali,
  );
  await createBook(
    db,
    book({
      title: 'The Long Way to a Small, Angry Planet',
      authors: ['Becky Chambers'],
      seriesId: restored.id,
      seriesPosition: '1.00',
      releaseDate: '2014-07-29',
      releasePrecision: 'day',
      pageCount: 404,
    }),
    dan,
  );

  // Standalones, no series.
  await createBook(
    db,
    book({
      title: 'Piranesi',
      authors: ['Susanna Clarke'],
      releaseDate: '2020-09-15',
      releasePrecision: 'day',
      pageCount: 245,
    }),
    ali,
  );
  await createBook(
    db,
    book({
      title: 'A Memory Called Empire',
      authors: ['Arkady Martine'],
      releaseDate: '2019-03-26',
      releasePrecision: 'day',
      pageCount: 462,
    }),
    sam,
  );

  /** Added long after it came out — the release job must NOT announce this as
   *  new. See the backdating caveat in the plan's Phase 8. */
  await createBook(
    db,
    book({
      title: 'Dune',
      authors: ['Frank Herbert'],
      releaseDate: '1965-08-01',
      releasePrecision: 'day',
      pageCount: 412,
      asin: '0441013597',
    }),
    dan,
  );

  /** Co-authored, so author ordering has a fixture. The credited order is Gaiman
   *  first — alphabetical would give the same answer, which is why the *next* book
   *  reverses a pair whose credited order and alphabetical order disagree. */
  await createBook(
    db,
    book({
      title: 'Good Omens',
      authors: ['Neil Gaiman', 'Terry Pratchett'],
      releaseDate: '1990-05-01',
      releasePrecision: 'day',
      pageCount: 288,
    }),
    dan,
  );
  await createBook(
    db,
    book({
      title: 'The Long Earth',
      authors: ['Terry Pratchett', 'Stephen Baxter'],
      releaseDate: '2012-06-21',
      releasePrecision: 'day',
      pageCount: 336,
    }),
    sam,
  );

  /** Deliberately mis-cased. Author resolution must fold this onto the existing
   *  "Martha Wells" row rather than creating a second one. */
  await createBook(
    db,
    book({
      title: 'The Cloud Roads',
      authors: ['martha wells'],
      releaseDate: '2011-03-01',
      releasePrecision: 'day',
      pageCount: 278,
    }),
    ali,
  );

  // --- Upcoming, day precision — these drive the calendar ----------------------
  const upcomingSoon = await createBook(
    db,
    book({
      title: 'The Tides of Memory',
      authors: corey,
      seriesId: expanse.id,
      seriesPosition: '10.00',
      releaseDate: isoDate(21),
      releasePrecision: 'day',
    }),
    dan,
  );
  const upcomingLater = await createBook(
    db,
    book({
      title: 'Winds of Roshar',
      authors: sanderson,
      seriesId: stormlight.id,
      seriesPosition: '6.00',
      releaseDate: isoDate(96),
      releasePrecision: 'day',
    }),
    sam,
  );
  await createBook(
    db,
    book({
      title: 'System Collapse Revisited',
      authors: wells,
      seriesId: murderbot.id,
      seriesPosition: '8.00',
      releaseDate: isoDate(150),
      releasePrecision: 'day',
    }),
    ali,
  );
  /** Two books sharing one release date, so paging over a duplicate sort key is
   *  exercised by the fixtures rather than only by a synthetic test. */
  await createBook(
    db,
    book({
      title: 'Parallel Release A',
      authors: ['Test Author'],
      releaseDate: isoDate(45),
      releasePrecision: 'day',
    }),
    dan,
  );
  await createBook(
    db,
    book({
      title: 'Parallel Release B',
      authors: ['Test Author'],
      releaseDate: isoDate(45),
      releasePrecision: 'day',
    }),
    dan,
  );

  // --- Month precision — the strip below the calendar, never a grid cell -------
  await createBook(
    db,
    book({
      title: 'Nemesis Rising',
      authors: corey,
      seriesId: expanse.id,
      seriesPosition: '11.00',
      releaseDate: isoDate(70).slice(0, 8) + '01',
      releasePrecision: 'month',
    }),
    sam,
  );
  await createBook(
    db,
    book({
      title: 'The Unnamed Sequel',
      authors: ['Arkady Martine'],
      releaseDate: isoDate(200).slice(0, 8) + '01',
      releasePrecision: 'month',
    }),
    ali,
  );

  // --- Year precision — "2027 (month TBA)" ------------------------------------
  await createBook(
    db,
    book({
      title: 'Stormlight Five',
      authors: sanderson,
      seriesId: stormlight.id,
      seriesPosition: '5.00',
      releaseDate: `${String(new Date().getUTCFullYear() + 2)}-01-01`,
      releasePrecision: 'year',
    }),
    sam,
  );
  await createBook(
    db,
    book({
      title: 'Untitled Wayfarers Novel',
      authors: ['Becky Chambers'],
      seriesId: restored.id,
      releaseDate: `${String(new Date().getUTCFullYear() + 3)}-01-01`,
      releasePrecision: 'year',
    }),
    dan,
  );

  // --- Unknown precision — the "Undated" section -------------------------------
  await createBook(
    db,
    book({ title: 'Murderbot: Untitled', authors: wells, seriesId: murderbot.id }),
    ali,
  );
  await createBook(db, book({ title: 'The Expanse: Untitled Coda', authors: corey }), dan);

  // --- Left in the trash --------------------------------------------------------
  const trashedBook = await createBook(
    db,
    book({ title: 'Mistaken Entry', authors: ['Nobody'], asin: '1234567897' }),
    ali,
  );
  await deleteBook(db, trashedBook.id, ali);

  // --- Shelves: statuses and ratings across users -------------------------------
  await db.insert(bookUserStatus).values([
    {
      bookId: leviathan.id,
      userId: danId,
      status: 'completed',
      rating: 9,
      finishedAt: '2024-02-11',
    },
    { bookId: leviathan.id, userId: samId, status: 'reading', startedAt: '2026-08-01' },
    { bookId: leviathan.id, userId: aliId, status: 'completed', rating: 7 },
    { bookId: abaddon.id, userId: danId, status: 'backlog' },
    { bookId: abaddon.id, userId: samId, status: 'dropped', rating: 4 },
    { bookId: allSystems.id, userId: aliId, status: 'completed', rating: 10 },
    { bookId: allSystems.id, userId: danId, status: 'backlog' },
    // `plan` on unreleased titles is what makes "only my planned" meaningful.
    { bookId: upcomingSoon.id, userId: danId, status: 'plan' },
    { bookId: upcomingSoon.id, userId: samId, status: 'plan' },
    { bookId: upcomingLater.id, userId: samId, status: 'plan' },
  ]);

  // Activity rows for the shelf actions above. `book.added` rows were already
  // written inside each `createBook` transaction, so only these are needed here.
  await db.insert(activity).values([
    {
      kind: 'status.changed',
      actorId: dan.id,
      bookId: leviathan.id,
      payload: { from: 'reading', to: 'completed' },
    },
    {
      kind: 'rating.changed',
      actorId: dan.id,
      bookId: leviathan.id,
      payload: { from: null, to: 9 },
    },
    {
      kind: 'status.changed',
      actorId: sam.id,
      bookId: leviathan.id,
      payload: { from: 'backlog', to: 'reading' },
    },
    {
      kind: 'rating.changed',
      actorId: ali.id,
      bookId: allSystems.id,
      payload: { from: 8, to: 10 },
    },
    {
      kind: 'status.changed',
      actorId: dan.id,
      bookId: upcomingSoon.id,
      payload: { from: null, to: 'plan' },
    },
    { kind: 'shelf.removed', actorId: ali.id, bookId: abaddon.id, payload: {} },
  ]);
}
