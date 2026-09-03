import type { SubmittableDraft } from '@sporim/domain';
import {
  WalletError,
  WALLET_ERROR_COPY,
  isWalletErrorCode,
  type CreatedBet,
  type WalletPort,
} from './port';

/**
 * Stands in for a wallet until M3. It is deliberately slow — a signature that returns
 * instantly makes the pending state untestable and the product feel fake — and it can be
 * made to fail from the URL, which is how the e2e suite covers every error copy path:
 *
 *   /new/review?mockFail=INSUFFICIENT_FUNDS
 */

const SIGN_DELAY_MS = 900;

/** No vowels: a code read aloud across a table should never turn into a word. */
const CODE_ALPHABET = '0123456789BCDFGHJKLMNPQRSTVWXYZ';
const CODE_LENGTH = 6;

export function generateShortCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export interface FakeWalletOptions {
  readonly failWith?: string | null;
  readonly delayMs?: number;
  readonly random?: () => number;
}

export function createFakeWallet(options: FakeWalletOptions = {}): WalletPort {
  const { failWith = null, delayMs = SIGN_DELAY_MS, random = Math.random } = options;

  return {
    async createBet(_draft: SubmittableDraft): Promise<CreatedBet> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      if (failWith) {
        // The URL is untrusted input: anything unrecognised collapses to UNKNOWN.
        const code = isWalletErrorCode(failWith) ? failWith : 'UNKNOWN';
        throw new WalletError(code, WALLET_ERROR_COPY[code]);
      }

      return {
        shortCode: generateShortCode(random),
        // No signature is invented here. Mock mode says "Simulated" and means it.
        txSignature: null,
        simulated: true,
      };
    },
  };
}
