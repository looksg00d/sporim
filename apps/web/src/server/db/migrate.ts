import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

/**
 * The migration runner. Deliberately standalone: it opens its own connection as the owning
 * role, because migrations create the very role and policies that `client.ts` relies on and
 * must not be subject to them.
 *
 * Run with `pnpm --filter @sporim/web migrate`. Safe to run any number of times — applied
 * files are recorded, and a file whose contents changed after it was applied stops the run
 * rather than silently diverging the schema from what is on disk.
 *
 * There is no Supabase CLI in this repo any more (docs/DECISIONS.md, 2026-09-03); the whole
 * tool is this file plus numbered `.sql` next to it.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const LEDGER_TABLE = '_sporim_migrations';

/**
 * One arbitrary but fixed key, so two runners cannot interleave against one database. Kept
 * inside the safe-integer range: it is a lock id, not money, and a `number` travels through
 * the driver without the bigint dance.
 */
const ADVISORY_LOCK_KEY = 814_023_390_721_561;

interface Migration {
  readonly id: string;
  readonly sql: string;
  readonly checksum: string;
}

/** CRLF is normalised away first: the same file must hash the same on Windows and on CI. */
function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export function readMigrations(dir: string = MIGRATIONS_DIR): readonly Migration[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((id) => {
      const sql = readFileSync(join(dir, id), 'utf8');
      return { id, sql, checksum: checksumOf(sql) };
    });
}

/**
 * Loads `.env.local` when the variable is not already in the environment. Next does this for
 * the app; a plain `node` process does not, and the connection string is not going to be
 * typed on a command line where it would land in shell history.
 */
function resolveDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    const envFile = join(process.cwd(), '.env.local');
    if (existsSync(envFile)) process.loadEnvFile(envFile);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (looked in the environment and .env.local)');
  return url;
}

export interface MigrationReport {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export async function runMigrations(
  sql: postgres.Sql,
  migrations: readonly Migration[] = readMigrations(),
): Promise<MigrationReport> {
  await sql.unsafe(`
    create table if not exists ${LEDGER_TABLE} (
      id text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const recorded = await sql<{ id: string; checksum: string }[]>`
    select id, checksum from ${sql(LEDGER_TABLE)}
  `;
  const byId = new Map(recorded.map((row) => [row.id, row.checksum]));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    const previous = byId.get(migration.id);
    if (previous !== undefined) {
      // An edited migration is the one failure mode a ledger exists to catch: the database
      // would keep the old shape while the file claims the new one.
      if (previous !== migration.checksum) {
        throw new Error(
          `Migration ${migration.id} changed after it was applied. ` +
            'Add a new numbered file instead of editing a released one.',
        );
      }
      skipped.push(migration.id);
      continue;
    }

    // One transaction per file: a migration either lands whole or not at all, and the ledger
    // row commits with it so a crash halfway cannot record work that was rolled back.
    await sql.begin(async (tx) => {
      await tx.unsafe(migration.sql).simple();
      await tx`
        insert into ${tx(LEDGER_TABLE)} (id, checksum)
        values (${migration.id}, ${migration.checksum})
      `;
    });
    applied.push(migration.id);
  }

  return { applied, skipped };
}

async function main(): Promise<void> {
  const sql = postgres(resolveDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(${ADVISORY_LOCK_KEY})`;
    try {
      const report = await runMigrations(sql);
      for (const id of report.skipped) console.warn(`  = ${id} (already applied)`);
      for (const id of report.applied) console.warn(`  + ${id}`);
      console.warn(
        report.applied.length === 0
          ? 'Database is up to date.'
          : `Applied ${report.applied.length} migration(s).`,
      );
    } finally {
      await sql`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    }
  } finally {
    await sql.end();
  }
}

// Only when executed directly, so the exported pieces stay importable from tests.
// `pathToFileURL` rather than string-building: a Windows path is not a URL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
