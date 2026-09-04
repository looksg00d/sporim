import { z } from 'zod';

/**
 * Environment as a parsed value, never as raw `process.env` reads scattered through the
 * app. A missing or malformed variable fails the build or the first request — a bet page
 * that renders against the wrong program id is worse than one that does not render.
 */

const publicSchema = z.object({
  appUrl: z.url(),
  appEnv: z.enum(['local', 'preview', 'production']),
  /** `mock` keeps every "transaction" in memory; nothing on screen may claim to be on-chain. */
  chainMode: z.enum(['mock', 'devnet']),
  solanaCluster: z.enum(['devnet', 'mainnet-beta']),
  feeBps: z.coerce.number().int().min(0).max(1000),
  maxStakeUsdc: z.coerce.number().int().positive().max(100),
  /**
   * The Privy application. Public by design — it ships in the browser bundle and is also the
   * `aud` claim the server checks a token against, so the two halves cannot drift apart.
   *
   * Nullable rather than required, because a deployment without it is a real state and the
   * honest behaviour is to keep serving: the wizard, the landing page and a referee's read of
   * the terms all work without an account. What it cannot do is sign anybody in, and every
   * screen that needs one says so instead of pretending. It fails closed — there is no branch
   * anywhere that treats "not configured" as "everyone is authenticated".
   */
  privyAppId: z.string().min(1).nullable(),
  /**
   * Replaces the sign-in provider with a stub that is always ready and always signed in, so
   * the e2e suite can exercise the wizard offline and identically on CI, where there is no
   * `.env.local` and no Privy application.
   *
   * Two properties make this safe to have in the shipped bundle:
   *
   *   * It is refused unless `appEnv` is `local`. Setting the variable on a preview or a
   *     production deployment does nothing at all — the parse below drops it.
   *   * It is a client-side belief and nothing more. A stubbed session produces no token, and
   *     `create-bet` believes only a Privy JWT it has verified against the JWKS, so a request
   *     made under it is refused by the server exactly like an anonymous one.
   */
  authStub: z.boolean(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export class EnvError extends Error {
  constructor(scope: 'client' | 'server', error: z.ZodError) {
    const lines = error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    super(`Invalid ${scope} environment:\n${lines.join('\n')}`);
    this.name = 'EnvError';
  }
}

/**
 * Where this deployment actually lives.
 *
 * Every preview build gets a fresh hostname, so pinning `NEXT_PUBLIC_APP_URL` to one value
 * would make every preview advertise the production URL — and `metadataBase` feeds the share
 * card, which is the whole growth loop. Vercel injects `VERCEL_URL` (host only, no scheme)
 * per deployment, so it is the right default there; an explicit value still wins, because
 * production runs on a domain Vercel does not know about.
 */
function resolveAppUrl(source: Record<string, string | undefined>): string {
  const explicit = source.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit;
  const vercel = (source.NEXT_PUBLIC_VERCEL_URL ?? source.VERCEL_URL)?.trim();
  if (vercel) return vercel.startsWith('http') ? vercel : `https://${vercel}`;
  return 'http://localhost:3000';
}

/** Exported so tests can drive the same parse from an explicit record. */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const appEnv = source.NEXT_PUBLIC_APP_ENV ?? 'local';
  const parsed = publicSchema.safeParse({
    appUrl: resolveAppUrl(source),
    appEnv,
    chainMode: source.NEXT_PUBLIC_CHAIN_MODE ?? 'mock',
    solanaCluster: source.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet',
    feeBps: source.NEXT_PUBLIC_FEE_BPS ?? '300',
    maxStakeUsdc: source.NEXT_PUBLIC_MAX_STAKE_USDC ?? '100',
    privyAppId: source.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || null,
    // The `appEnv` half is the guard, not a convenience: it is what makes the flag inert
    // everywhere except a local build, whatever anybody sets in a deployment's variables.
    authStub: source.NEXT_PUBLIC_AUTH_MODE === 'stub' && appEnv === 'local',
  });
  if (!parsed.success) throw new EnvError('client', parsed.error);
  return parsed.data;
}

/*
 * Each key is written out literally: Next inlines `NEXT_PUBLIC_*` into the browser bundle
 * only when it can see the whole `process.env.NEXT_PUBLIC_X` expression, so a computed
 * `process.env[key]` would be `undefined` on the client.
 */
export const env: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  // Written out literally like the rest: Next only inlines what it can see whole.
  NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_CHAIN_MODE: process.env.NEXT_PUBLIC_CHAIN_MODE,
  NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  NEXT_PUBLIC_FEE_BPS: process.env.NEXT_PUBLIC_FEE_BPS,
  NEXT_PUBLIC_MAX_STAKE_USDC: process.env.NEXT_PUBLIC_MAX_STAKE_USDC,
  NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE,
});

/** True while the money on screen is test money. Drives the banner that must never be hidden. */
export const isMockChain = env.chainMode === 'mock';

/**
 * Postgres (Xata). Server-only and deliberately without a browser-facing counterpart:
 * authorization lives in the repository layer, so there is no anon key to leak.
 */
const databaseUrlSchema = z.string().min(1).startsWith('postgres');

const serverSchema = z.object({
  databaseUrl: databaseUrlSchema,
  solanaRpcUrl: z.url(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverSchema.safeParse({
    databaseUrl: source.DATABASE_URL,
    solanaRpcUrl: source.SOLANA_RPC_URL,
  });
  if (!parsed.success) throw new EnvError('server', parsed.error);
  return parsed.data;
}

/**
 * Server-only environment, resolved lazily: importing this module from a client component
 * must not touch secrets, and a missing Supabase key should fail the route that needs it
 * rather than every page in the app.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') throw new Error('serverEnv() was called in the browser');
  return parseServerEnv(process.env);
}

export function parseDatabaseUrl(source: Record<string, string | undefined>): string {
  const parsed = databaseUrlSchema.safeParse(source.DATABASE_URL);
  if (!parsed.success) throw new EnvError('server', parsed.error);
  return parsed.data;
}

/**
 * The connection string on its own. Narrower than `serverEnv()` on purpose: the database
 * layer has no business failing because a Solana RPC endpoint is unset, and half this
 * product's server code touches Postgres without ever touching a chain.
 */
export function databaseUrl(): string {
  if (typeof window !== 'undefined') throw new Error('databaseUrl() was called in the browser');
  return parseDatabaseUrl(process.env);
}

/**
 * What the server needs to verify a Privy access token, and nothing else.
 *
 * Narrow like `databaseUrl()` for the same reason: a page that renders for an anonymous
 * visitor should not fail because a Solana RPC endpoint is unset, and the session layer has
 * no business reading a connection string.
 *
 * The app id appears on both sides of the fence on purpose. In the browser it selects the
 * Privy application; here it is the `aud` claim a token must carry, so a token minted for
 * somebody else's Privy app — a real, correctly-signed token — is refused rather than
 * accepted as one of ours.
 *
 * The JWKS URL is a variable rather than derived from the app id so a key rotation or a
 * self-hosted proxy is a deployment change, not a code change.
 */
const authSchema = z.object({
  privyAppId: z.string().min(1),
  privyJwksUrl: z.url(),
});

export type AuthEnv = z.infer<typeof authSchema>;

export function parseAuthEnv(source: Record<string, string | undefined>): AuthEnv {
  const parsed = authSchema.safeParse({
    privyAppId: source.NEXT_PUBLIC_PRIVY_APP_ID,
    privyJwksUrl: source.PRIVY_JWKS_URL,
  });
  if (!parsed.success) throw new EnvError('server', parsed.error);
  return parsed.data;
}

/**
 * Throws when the variables are missing, and that is the intended behaviour: reaching here
 * means a token was actually presented, and a deployment that cannot check one must not
 * quietly decide the answer is "no". The caller only asks once it has something to verify.
 */
export function authEnv(): AuthEnv {
  if (typeof window !== 'undefined') throw new Error('authEnv() was called in the browser');
  return parseAuthEnv(process.env);
}
