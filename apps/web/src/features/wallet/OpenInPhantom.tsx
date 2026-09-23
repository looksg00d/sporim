'use client';

import { useEffect, useState } from 'react';
import { PillLink, color, space, typeStyle } from '@sporim/ui';
import { hasInjectedSolana, phantomBrowseUrl, shouldOfferPhantom } from './phantom';

/**
 * "Open in Phantom" for a phone with no wallet in the page.
 *
 * An offer, not a wall: email sign-in still works in the webview and creates a wallet for
 * whoever has none. This is for the person who already has Phantom and USDC, which is who
 * the product is built for first (`docs/NEXT-SESSION.md`, 5 September).
 *
 * Decided after mount, never on the server: the provider only exists in `window`, and a
 * server guess from the user agent would be wrong inside Phantom's own browser.
 *
 * Kept off `/new/*` on purpose. A draft survives only in this browser's storage, and
 * Phantom's browser has its own, so hopping mid-wizard would lose what the person wrote.
 */
export function OpenInPhantom() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const offer = shouldOfferPhantom({
      userAgent: navigator.userAgent,
      injected: hasInjectedSolana(window as Parameters<typeof hasInjectedSolana>[0]),
    });
    if (offer) setHref(phantomBrowseUrl(window.location.href, window.location.origin));
  }, []);

  if (!href) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
      <PillLink href={href} variant="secondary" fullWidth>
        Open in Phantom
      </PillLink>
      <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>
        Have Phantom? Your wallet connects there in one tap. No Phantom — just sign in here.
      </span>
    </div>
  );
}
