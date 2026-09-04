import { z } from 'zod';
import type { BetDraft } from '@sporim/domain';
import { deserializeDraft, serializeDraft } from './storage';

/**
 * Getting a half-written bet through a login.
 *
 * The draft lives in `sessionStorage`, which is per-tab, and that is the right home for it:
 * a draft belongs to this tab and this sitting, and a second tab opened to start a different
 * bet must not inherit the first one. The problem is that signing in is exactly the moment
 * the browser is most likely to hand the person a *different* tab — on iOS the mail app opens
 * a link in a new one, an in-app browser hands off to Safari, and Safari will discard and
 * re-create a backgrounded tab while somebody is reading a six-digit code. `sessionStorage`
 * does not follow any of that. `localStorage` does.
 *
 * So the draft is copied into `localStorage` at one moment and one moment only: when the
 * review screen sends the tab into the login round trip. Any tab of this app that starts with
 * no draft of its own picks the copy up and deletes it. The result is that the copy exists
 * for the duration of a login and not a second longer:
 *
 *   * **Written** when the person is asked to sign in, and never otherwise, so an ordinary
 *     second tab still starts empty — the existing decision holds everywhere except across
 *     the one hand-over it cannot survive.
 *   * **Read once.** Adoption removes it, so it cannot resurface days later in a tab opened
 *     for something else.
 *   * **Expiring.** Half an hour is longer than any login and shorter than a change of mind.
 *
 * It is not a security boundary and does not need to be: it holds what the person just typed
 * into their own browser, the server re-validates every field, and creation is idempotent by
 * the commitment hash — so even the pathological case of two tabs both finishing the same
 * draft produces one bet.
 */

export const DRAFT_HANDOFF_KEY = 'sporim.draft.handoff.v1';

/** Long enough to read an email and type a code; short enough not to haunt the next sitting. */
export const HANDOFF_TTL_MS = 30 * 60_000;

const envelopeSchema = z.object({
  savedAtMs: z.number().int().positive(),
  /** The draft in exactly the form `sessionStorage` holds it — one serialiser, one shape. */
  draft: z.string(),
});

export function writeHandoff(
  storage: Pick<Storage, 'setItem'>,
  draft: BetDraft,
  nowMs: number = Date.now(),
): void {
  try {
    storage.setItem(
      DRAFT_HANDOFF_KEY,
      JSON.stringify({ savedAtMs: nowMs, draft: serializeDraft(draft) }),
    );
  } catch {
    // Private-mode Safari and locked-down browsers throw. A draft that could not be handed
    // over is a worse login, never a broken one.
  }
}

export function clearHandoff(storage: Pick<Storage, 'removeItem'>): void {
  try {
    storage.removeItem(DRAFT_HANDOFF_KEY);
  } catch {
    // Same reason.
  }
}

/**
 * Takes the handed-over draft, if there is a fresh one, and consumes it either way.
 *
 * Removing an expired copy rather than leaving it is deliberate: it is dead weight in a
 * storage area shared with everything else on the origin, and the next tab should not have to
 * check the clock again to learn the same thing.
 */
export function takeHandoff(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  nowMs: number = Date.now(),
): BetDraft | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(DRAFT_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  clearHandoff(storage);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }

  const envelope = envelopeSchema.safeParse(parsedJson);
  if (!envelope.success) return null;
  // A clock that went backwards leaves `nowMs - savedAtMs` negative, which is inside the
  // window and therefore accepted — the draft is at worst recent, never stale.
  if (nowMs - envelope.data.savedAtMs > HANDOFF_TTL_MS) return null;

  return deserializeDraft(envelope.data.draft);
}
