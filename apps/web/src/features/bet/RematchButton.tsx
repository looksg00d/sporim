'use client';

import { useRouter } from 'next/navigation';
import type { BetDraft } from '@sporim/domain';
import { PillButton } from '@sporim/ui';
import { writeStoredDraft } from '@/features/draft/storage';

/**
 * Seeds the wizard with the last bet's shape and opens it at step one.
 *
 * Through the same `sessionStorage` slot the wizard restores from, so the wizard needs no
 * notion of a rematch: it simply finds a draft, as it would after a reload. That also means
 * pressing this replaces a half-written draft in this tab — an explicit tap, so acceptable.
 */
export function RematchButton({ draft }: { readonly draft: BetDraft }) {
  const router = useRouter();

  function start() {
    try {
      writeStoredDraft(window.sessionStorage, draft);
    } catch {
      // Storage refused (private mode): the wizard still opens, just without the seed.
    }
    router.push('/new/terms');
  }

  return (
    <PillButton type="button" variant="secondary" fullWidth onClick={start}>
      Rematch
    </PillButton>
  );
}
