import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Next reads `.env.local` for the app; vitest does not. The integration tests talk to the
 * same database the app does, and the connection string is never going to live anywhere a
 * test could import it from — so it is loaded here, from the gitignored file, at setup time.
 *
 * Nothing fails if the file is missing: the integration suites skip themselves when
 * `DATABASE_URL` is unset, which is how CI runs them.
 */
const envFile = join(process.cwd(), '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
