/** Response body of `GET /api/v1/auth/me`. */
export interface CurrentUser {
  readonly id: string;
  readonly discordId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarHash: string | null;
  readonly isAdmin: boolean;
}

/** Response body of `POST /api/v1/auth/refresh`. */
export interface RefreshResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
}
