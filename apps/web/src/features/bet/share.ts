/**
 * Getting the bet link out of the tab and into a chat.
 *
 * The link is the product's only growth channel, and printing it for a long-press was the
 * floor, not the goal. A phone should get its share sheet — that is one tap to the chat the
 * person already meant to paste into. A desktop should get the clipboard: Chrome on Windows
 * does have `navigator.share`, and what it opens is a system dialog nobody wanted.
 *
 * Pure over the navigator it is handed, so every branch is testable without a browser.
 */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable';

export interface ShareNavigator {
  readonly share?: (data: { url: string; text?: string }) => Promise<void>;
  readonly clipboard?: { readonly writeText: (text: string) => Promise<void> };
}

export interface ShareRequest {
  readonly url: string;
  readonly text: string;
  /** True on touch devices, where the share sheet is where the chats are. */
  readonly preferSheet: boolean;
}

function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

export async function shareLink(request: ShareRequest, nav: ShareNavigator): Promise<ShareOutcome> {
  if (request.preferSheet && nav.share) {
    try {
      await nav.share({ url: request.url, text: request.text });
      return 'shared';
    } catch (cause) {
      // Closing the sheet is a choice, not a failure — do not overrule it with the clipboard.
      if (isAbort(cause)) return 'cancelled';
      // Anything else (no user activation, blocked by a webview) falls through to copying.
    }
  }

  if (nav.clipboard) {
    try {
      await nav.clipboard.writeText(request.url);
      return 'copied';
    } catch {
      // Insecure context or a denied permission: the printed link is still on screen.
    }
  }

  return 'unavailable';
}
