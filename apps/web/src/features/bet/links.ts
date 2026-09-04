import { env } from '@/lib/env';
import type { ShortCode } from '@sporim/domain';

/**
 * The link somebody pastes into a chat.
 *
 * Absolute, always. This one string is the product's entire growth channel — a bet spreads
 * because a person sends it to a friend — and a relative path is not a link anywhere outside
 * the tab that rendered it. It shipped relative once; hence a function, and hence a test.
 *
 * `env.appUrl` resolves per deployment, so a preview build advertises itself rather than
 * production. It is normalised here rather than trusted: a trailing slash in the variable
 * would otherwise produce `https://sporim.fun//b/ABCD1234`, which works and looks broken.
 */
export function betUrl(code: ShortCode | string, appUrl: string = env.appUrl): string {
  return `${appUrl.replace(/\/+$/, '')}/b/${code}`;
}
