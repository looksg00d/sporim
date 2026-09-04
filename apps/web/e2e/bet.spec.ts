import { expect, test } from '@playwright/test';

/**
 * `/b/[code]` — what a visitor without a session sees.
 *
 * The signed-in paths are not reachable from here: reading a bet needs a verified Privy token
 * and a row in the database, and a headless browser has neither. What *is* reachable is the
 * boundary, and the boundary is the part that must not leak — so that is what these assert.
 */

/** Eight base58 characters, correctly shaped and belonging to nothing. */
const UNKNOWN_CODE = 'ZZZZZZZZ';

test.describe('the bet page', () => {
  test('asks an anonymous visitor to sign in rather than showing anything', async ({ page }) => {
    await page.goto(`/b/${UNKNOWN_CODE}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Sign in to see this bet/i);
  });

  /*
   * The important half. A well-formed code that is not yours and a well-formed code that
   * never existed have to be indistinguishable, or the page becomes an oracle for which codes
   * are real. Anonymously both land on the same wall, and neither says a bet is there.
   */
  test('says nothing about whether that bet exists', async ({ page }) => {
    await page.goto(`/b/${UNKNOWN_CODE}`);
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const leak of ['not found', 'no such bet', 'does not exist', 'usdc']) {
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
