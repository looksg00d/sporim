import { describe, expect, it } from 'vitest';
import { hasInjectedSolana, phantomBrowseUrl, shouldOfferPhantom } from './phantom';

const INSTAGRAM_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

describe('phantomBrowseUrl', () => {
  it('matches the documented shape, both parts encoded', () => {
    expect(phantomBrowseUrl('https://sporim.fun/b/Ab3xK9mQ', 'https://sporim.fun')).toBe(
      'https://phantom.app/ul/browse/https%3A%2F%2Fsporim.fun%2Fb%2FAb3xK9mQ?ref=https%3A%2F%2Fsporim.fun',
    );
  });

  it('keeps the target query string inside the target, not on the deeplink', () => {
    const url = phantomBrowseUrl('https://sporim.fun/?ref=reel&x=1', 'https://sporim.fun');
    expect(new URL(url).searchParams.get('ref')).toBe('https://sporim.fun');
    expect(url).toContain('%3Fref%3Dreel%26x%3D1');
  });
});

describe('shouldOfferPhantom', () => {
  it('offers it inside the Instagram webview', () => {
    expect(shouldOfferPhantom({ userAgent: INSTAGRAM_IOS, injected: false })).toBe(true);
  });

  it('offers it in a plain mobile browser, which has no wallet either', () => {
    expect(shouldOfferPhantom({ userAgent: ANDROID_CHROME, injected: false })).toBe(true);
  });

  it('does not loop someone already inside Phantom', () => {
    expect(shouldOfferPhantom({ userAgent: INSTAGRAM_IOS, injected: true })).toBe(false);
  });

  it('does not send a desktop to an app store', () => {
    expect(shouldOfferPhantom({ userAgent: DESKTOP_CHROME, injected: false })).toBe(false);
  });
});

describe('hasInjectedSolana', () => {
  it('sees the modern and the legacy provider', () => {
    expect(hasInjectedSolana({ phantom: { solana: {} } })).toBe(true);
    expect(hasInjectedSolana({ solana: { isPhantom: true } })).toBe(true);
    expect(hasInjectedSolana({})).toBe(false);
  });
});
