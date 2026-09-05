import { expect, test } from '@playwright/test';

/**
 * `/b/[code]` — what a visitor sees for a code that opens nothing.
 *
 * The paths that need a real bet are not reachable from here: reading one takes a row in the
 * database, and accepting one takes a verified Privy token as well, which a headless browser
 * cannot obtain. What *is* reachable is the boundary, and the boundary is the part that must
 * not leak — so that is what these assert. The rest is covered against the live database in
 * `accept.repo.integration.test.ts`.
 */

/** Eight base58 characters, correctly shaped and belonging to nothing. */
const UNKNOWN_CODE = 'ZZZZZZZZ';

test.describe('the bet page', () => {
  /*
   * The first of these changed meaning with `0011`, deliberately: the short code is now a
   * capability, so an anonymous visitor holding a real one *does* read the terms before
   * deciding whether to put money on the other side. What did not change is the answer for a
   * code that opens nothing — and that is the property worth guarding, because a page which
   * distinguishes "not yours" from "not a bet" tells a guesser which codes are real.
   */
  test('gives a code that opens nothing the same answer as a malformed one', async ({ page }) => {
    const response = await page.goto(`/b/${UNKNOWN_CODE}`);
    expect(response?.status()).toBe(404);
  });

  test('says nothing about whether that bet exists', async ({ page }) => {
    await page.goto(`/b/${UNKNOWN_CODE}`);
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const leak of ['usdc', 'take the other side', 'on the line', 'deadline']) {
      expect(body, `"${leak}" must not appear`).not.toContain(leak);
    }
  });

  test('refuses a code of the wrong shape outright', async ({ page }) => {
    // `0`, `O`, `I` and `l` are not in the alphabet, and eight is the only length.
    const response = await page.goto('/b/OOOOOOOO');
    expect(response?.status()).toBe(404);
  });

  test('does not treat a referee token as a bet code', async ({ page }) => {
    // 32 characters: the referee capability. Lengths are exclusive on purpose, so a token
    // pasted into the accept route buys nothing.
    const response = await page.goto('/b/2bK9wPqRt4mNvXcZ7hJfLdGyU3sAeQ8n');
    expect(response?.status()).toBe(404);
  });
});
