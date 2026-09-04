import { describe, expect, it } from 'vitest';
import { betUrl } from './links';

describe('betUrl', () => {
  it('is absolute, so it survives being pasted somewhere else', () => {
    expect(betUrl('ABCD1234', 'https://sporim.fun')).toBe('https://sporim.fun/b/ABCD1234');
  });

  it('does not double the slash when the deployment URL has a trailing one', () => {
    expect(betUrl('ABCD1234', 'https://sporim.fun/')).toBe('https://sporim.fun/b/ABCD1234');
    expect(betUrl('ABCD1234', 'https://sporim.fun///')).toBe('https://sporim.fun/b/ABCD1234');
  });

  it('advertises the deployment it is running on, not a hard-coded host', () => {
    expect(betUrl('ABCD1234', 'https://sporim-abc123.vercel.app')).toBe(
      'https://sporim-abc123.vercel.app/b/ABCD1234',
    );
    expect(betUrl('ABCD1234', 'http://localhost:3000')).toBe('http://localhost:3000/b/ABCD1234');
  });

  /*
   * The regression this file exists for. A relative path renders fine, reads fine, and is
   * useless the moment it leaves the browser — which is the only thing it is ever used for.
   */
  it('never returns a bare path', () => {
    expect(betUrl('ABCD1234', 'https://sporim.fun')).not.toBe('/b/ABCD1234');
    expect(betUrl('ABCD1234', 'https://sporim.fun')).toMatch(/^https?:\/\//);
  });
});
