import { USDC_DECIMALS, formatUsdc, type SubmittableDraft } from '@sporim/domain';
import { createBetAction } from '@/server/actions/create-bet';
import { WalletError, WALLET_ERROR_COPY, type CreatedBet, type WalletPort } from './port';

/**
 * The real implementation of the wizard's seam: the same `WalletPort` the fake satisfies,
 * backed by the `create-bet` server action.
 *
 * The port shape is unchanged, so the review screen is unaware of the swap — which is what
 * the seam was for. What it does not do is send the finished `SubmittableDraft` across
 * wholesale: that object carries derived values (`feeBps`, `acceptDeadlineSeconds`) and the
 * server derives those itself. Sending them would invite somebody, one day, to read them.
 *
 * The stake travels as the decimal string a person would type, at full precision. A `bigint`
 * has no place in an argument that gets serialised, and a `number` has no place anywhere near
 * money — this is the same representation `storage.ts` writes for the same reason.
 */
export function createServerWallet(): WalletPort {
  return {
    async createBet(draft: SubmittableDraft): Promise<CreatedBet> {
      const result = await createBetAction({
        terms: draft.terms,
        format: draft.format,
        stake: formatUsdc(draft.stake, { maxDecimals: USDC_DECIMALS }),
        deadlineSeconds: draft.deadlineSeconds,
        decisionMode: draft.decisionMode,
        opponentRef: draft.opponentRef,
        refereeRef: draft.refereeRef,
        beneficiaryKind: draft.beneficiaryKind,
        beneficiaryRef: draft.beneficiaryRef,
        signature: draft.signature,
      });

      // A refusal arrives as data, not as an exception, and becomes the one thing the screen
      // knows how to say. The message never comes from the server: it comes from the copy
      // table next to the code, so no server string can reach a user unread.
      if (!result.ok) throw new WalletError(result.code, WALLET_ERROR_COPY[result.code]);
      return result.bet;
    },
  };
}
