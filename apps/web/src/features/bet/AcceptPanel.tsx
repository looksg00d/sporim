'use client';

import { useState } from 'react';
import { TRUST_COPY, isSignatureMeaningful, type Signature } from '@sporim/domain';
import { PillButton, SignaturePad, color, radius, space, typeStyle } from '@sporim/ui';
import { acceptByLink } from '@/server/actions/accept';

/**
 * Taking the other side.
 *
 * The one interactive piece on an otherwise server-rendered page, and it is a client component
 * only because the pad is: strokes are captured from pointer events, and there is no way to
 * gather them on a server.
 *
 * The signature crosses to the server as JSON in a hidden field. That looks roundabout next to
 * passing an object, and it is deliberate — a `<form action={…}>` posts strings, so the shape
 * is re-parsed on the other side by `signatureSchema` rather than trusted because this
 * component happened to produce it. Somebody posting to that action directly gets the same
 * parse, which is the property that matters.
 *
 * Symmetric with the creator's review screen on purpose. They signed to commit; a card with
 * one scrawl on it is a card that says only one person meant it.
 */
export function AcceptPanel({
  code,
  stakeLabel,
}: {
  readonly code: string;
  readonly stakeLabel: string;
}) {
  const [signature, setSignature] = useState<Signature | null>(null);
  const signed = isSignatureMeaningful(signature);

  return (
    <form
      action={acceptByLink}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        border: `1px solid ${color.hairline}`,
        background: color.surface,
      }}
    >
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="signature" value={signature ? JSON.stringify(signature) : ''} />

      <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
        TAKE THE OTHER SIDE
      </span>
      <p style={{ margin: 0, ...typeStyle('bodySm'), color: color.inkSecondary }}>
        You put in {stakeLabel}. {TRUST_COPY.noBackingOut}
      </p>

      <SignaturePad value={signature} onChange={setSignature} label="Sign to take it" />

      <PillButton type="submit" fullWidth icon="lock" disabled={!signed} data-testid="accept">
        I&apos;m in
      </PillButton>
      <p
        aria-live="polite"
        style={{
          margin: 0,
          minHeight: 18,
          textAlign: 'center',
          ...typeStyle('micro'),
          color: color.inkFaint,
        }}
      >
        {signed ? TRUST_COPY.escrow : 'Sign above to take it.'}
      </p>
    </form>
  );
}
