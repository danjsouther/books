import { index, pgTable, smallint, unique, uuid } from 'drizzle-orm/pg-core';
import { authors } from './authors';
import { books } from './books';

/**
 * Which authors wrote which book, in credited order.
 *
 * `position` exists because the `text[]` column this replaces preserved that order for
 * free and a join table does not. "Gaiman and Pratchett" should stay in the order it is
 * credited rather than collapsing to alphabetical.
 */
export const authorBooks = pgTable(
  'author_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => authors.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
  },
  (t) => [
    unique('author_books_pair_key').on(t.authorId, t.bookId),
    index('author_books_book_idx').on(t.bookId, t.position),
    index('author_books_author_idx').on(t.authorId),
  ],
);
