const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';

export interface DiscordUser {
  readonly id: string;
  readonly username: string;
  readonly global_name: string | null;
  readonly avatar: string | null;
}

export interface DiscordGuild {
  readonly id: string;
  readonly name: string;
}

export interface DiscordTokens {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
}

export interface ExchangeCodeParams {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly code: string;
  readonly codeVerifier: string;
}

/**
 * The Discord half of login, behind an interface so tests substitute a double
 * rather than reaching the real network — everything the API needs is passed in,
 * matching how `createApiRouter` itself is built.
 */
export interface DiscordClient {
  buildAuthorizeUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;
  exchangeCode(params: ExchangeCodeParams): Promise<DiscordTokens>;
  fetchUser(accessToken: string): Promise<DiscordUser>;
  fetchGuilds(accessToken: string): Promise<DiscordGuild[]>;
}

async function discordFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${DISCORD_API}${path}`, init);
  if (!res.ok) {
    throw new Error(`Discord API ${path} failed: ${String(res.status)} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function createDiscordClient(): DiscordClient {
  return {
    buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge }) {
      const url = new URL(DISCORD_AUTHORIZE_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      // `guilds` is required: guild membership is the access control itself.
      url.searchParams.set('scope', 'identify guilds');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return url.toString();
    },

    exchangeCode({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });
      return discordFetch<DiscordTokens>('/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    },

    fetchUser(accessToken) {
      return discordFetch<DiscordUser>('/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    },

    fetchGuilds(accessToken) {
      return discordFetch<DiscordGuild[]>('/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    },
  };
}
