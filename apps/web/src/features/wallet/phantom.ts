/**
 * Getting a phone user into a browser that has a wallet in it.
 *
 * Traffic arrives from a reel, and Instagram opens links in its own webview: no extensions,
 * nothing injected, so "connect Phantom" has nothing to connect to. Mobile Safari and Chrome
 * are no better. Phantom's answer is its browse deeplink, which reopens the page inside
 * Phantom's own browser, where the provider is injected and connecting works like a desktop
 * extension.
 *
 * Format checked against the live docs (docs.phantom.com/phantom-deeplinks/other-methods/browse,
 * 2026-09-23): `https://phantom.app/ul/browse/<url>?ref=<ref>`, both URL-encoded, both required.
 */

export function phantomBrowseUrl(target: string, ref: string): string {
  return `https://phantom.app/ul/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(ref)}`;
}

const MOBILE = /iPhone|iPad|iPod|Android/i;

export interface PhantomContext {
  readonly userAgent: string;
  /** True when a Solana provider is already in the page — i.e. we are inside Phantom (or a desktop with the extension). */
  readonly injected: boolean;
}

/**
 * Offer the hop only on a phone that has no wallet in the page. Inside Phantom's browser the
 * provider is injected and the offer would loop back to where the person already is; on a
 * desktop the extension is the path and the deeplink would open an app store.
 */
export function shouldOfferPhantom(context: PhantomContext): boolean {
  return !context.injected && MOBILE.test(context.userAgent);
}

interface WindowWithWallet {
  readonly phantom?: { readonly solana?: unknown };
  readonly solana?: { readonly isPhantom?: boolean };
}

export function hasInjectedSolana(win: WindowWithWallet): boolean {
  return Boolean(win.phantom?.solana ?? win.solana);
}
