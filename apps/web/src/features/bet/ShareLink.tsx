'use client';

import { useState } from 'react';
import { PillButton, color, typeStyle } from '@sporim/ui';
import { shareLink, type ShareOutcome } from './share';

/**
 * One tap to send the bet: the share sheet on a phone, the clipboard on a desktop.
 *
 * The printed link stays on the page beside this button. It is the fallback that needs no
 * permission and no JavaScript, and in an in-app webview that blocks both APIs it is still
 * the thing a person can long-press.
 */

const RESULT_COPY: Record<ShareOutcome, string | null> = {
  shared: null,
  cancelled: null,
  copied: 'Copied. Paste it into the chat.',
  unavailable: 'Could not copy here — long-press the link above.',
};

export function ShareLink({ url, text }: { readonly url: string; readonly text: string }) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);

  async function onClick() {
    const preferSheet =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    setOutcome(await shareLink({ url, text, preferSheet }, navigator));
  }

  const message = outcome ? RESULT_COPY[outcome] : null;

  return (
    <>
      <PillButton type="button" fullWidth icon="link" onClick={onClick}>
        Send the link
      </PillButton>
      {message ? (
        <span role="status" style={{ ...typeStyle('micro'), color: color.inkSecondary }}>
          {message}
        </span>
      ) : null}
    </>
  );
}
