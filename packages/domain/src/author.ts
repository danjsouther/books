import { z } from 'zod';

/** Response item of `GET /authors?q=`. */
export interface Author {
  readonly id: string;
  readonly name: string;
}

export const AuthorListQuerySchema = z.object({
  q: z.string().default(''),
});
export type AuthorListQuery = z.infer<typeof AuthorListQuerySchema>;
