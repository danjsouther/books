import { z } from 'zod';
import { BOOK_STATUSES } from './shelf';
import { ListQuerySchema } from './list';
import type { BookSummary } from './book';
import type { BookStatus, UserBookStatus } from './shelf';

/** Response item of `GET /users`. */
export interface UserSummary {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarHash: string | null;
  readonly bookCount: number;
  readonly avgRating: number | null;
}

/** Response body of `GET /users/:id`. */
export interface UserProfile extends UserSummary {
  readonly statusCounts: Record<BookStatus, number>;
}

export const UserListQuerySchema = ListQuerySchema.extend({
  q: z.string().optional(),
  sort: z.enum(['name', 'bookCount', 'avgRating']).default('name'),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

/** Response item of `GET /users/:id/shelf`. */
export interface ShelfEntry {
  readonly book: BookSummary;
  readonly status: UserBookStatus;
}

export const UserShelfQuerySchema = ListQuerySchema.extend({
  status: z.enum(BOOK_STATUSES).optional(),
  q: z.string().optional(),
  seriesId: z.string().uuid().optional(),
  sort: z.enum(['updated', 'title', 'rating', 'release']).default('updated'),
});
export type UserShelfQuery = z.infer<typeof UserShelfQuerySchema>;
