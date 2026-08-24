import { slugify, uniqueSlug } from '@books/domain';
import { asc, eq, isNull } from 'drizzle-orm';
import { createDb, type Db } from './client';
import { books } from './schema/books';
import { series } from './schema/series';

/**
 * Builds a resolver that assigns the next unique slug against an in-memory set
 * of everything already taken in one table — a single query up front instead
 * of one per row, which is what makes backfilling a whole table cheap.
 */
async function slugAssigner(
  allSlugs: Promise<{ slug: string | null }[]>,
): Promise<(base: string) => Promise<string>> {
  const taken = new Set<string>();
  for (const row of await allSlugs) {
    if (row.slug !== null) taken.add(row.slug);
  }
  return async (base: string) => {
    const slug = await uniqueSlug(base, (candidate) => Promise.resolve(taken.has(candidate)));
    taken.add(slug);
    return slug;
  };
}

async function backfillBooks(db: Db): Promise<void> {
  const assign = await slugAssigner(db.select({ slug: books.slug }).from(books));
  const rows = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(isNull(books.slug))
    .orderBy(asc(books.createdAt));
  for (const row of rows) {
    const slug = await assign(slugify(row.title));
    await db.update(books).set({ slug }).where(eq(books.id, row.id));
  }
}

async function backfillSeries(db: Db): Promise<void> {
  const assign = await slugAssigner(db.select({ slug: series.slug }).from(series));
  const rows = await db
    .select({ id: series.id, name: series.name })
    .from(series)
    .where(isNull(series.slug))
    .orderBy(asc(series.createdAt));
  for (const row of rows) {
    const slug = await assign(slugify(row.name));
    await db.update(series).set({ slug }).where(eq(series.id, row.id));
  }
}

/**
 * Assigns a slug to every existing book/series still missing one, oldest first
 * — so if two existing rows would derive the same base slug, whichever was
 * created first keeps the bare form and the other gets the `-2` suffix. Runs
 * once, between the nullable-column migration and the one that makes `slug`
 * `NOT NULL UNIQUE`; see `docs/data-model.md`'s Migrations section for the
 * required ordering. `npm run db:backfill-slugs` is the entry point.
 */
export async function backfillSlugs(): Promise<void> {
  const { db, pool } = createDb();
  try {
    await backfillBooks(db);
    await backfillSeries(db);
  } finally {
    await pool.end();
  }
}
