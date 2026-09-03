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
  const parsed = publicSchema.safeParse({
    appUrl: resolveAppUrl(source),
    appEnv: source.NEXT_PUBLIC_APP_ENV ?? 'local',
    chainMode: source.NEXT_PUBLIC_CHAIN_MODE ?? 'mock',
    solanaCluster: source.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet',
    feeBps: source.NEXT_PUBLIC_FEE_BPS ?? '300',
    maxStakeUsdc: source.NEXT_PUBLIC_MAX_STAKE_USDC ?? '100',
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
