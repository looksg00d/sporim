import { expect, test } from '@playwright/test';

/**
 * Finding your way back.
 *
 * The product had no navigation at all: you could create a bet, read "locked in", close the
 * tab, and there was no route to it from anywhere. These assert the exits exist — which is a
 * thing a screenshot review catches and a unit test never does.
 */

test.describe('navigation', () => {
  test('the wordmark is a way home, not decoration', async ({ page }) => {
    await page.goto('/new/terms');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'SPORIM' })).toBeVisible();
  });

  /*
   * Signed out there is deliberately no "My bets" and no "Sign in" on the landing page: an
   * account that buys a stranger nothing yet is a wall in front of the one screen reel traffic
   * actually lands on.
   */
  test('offers no account links to a visitor who has none', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'MY BETS' })).toHaveCount(0);
  });

  test('my bets asks an anonymous visitor to sign in, and says why', async ({ page }) => {
    await page.goto('/me');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Sign in to see your bets/i);
    await expect(page.getByText(/only readable by the people on it/i)).toBeVisible();
  });

  test('stays on /me rather than redirecting, so signing in lands where you were going', async ({
    page,
  }) => {
    await page.goto('/me');
    await expect(page).toHaveURL(/\/me$/);
  });

  /*
   * The dead end that started all of this. "Locked in" used to offer only "start another" and
   * "home" — a person could make a bet and have no route to it from anywhere in the product.
   */
  test('the locked-in screen leads to the bet it just made', async ({ page }) => {
    await page.goto('/new/done?code=ABCD1234');
    await expect(page.getByRole('link', { name: 'Open it' })).toHaveAttribute(
      'href',
      '/b/ABCD1234',
    );
    await expect(page.getByRole('link', { name: 'My bets' })).toHaveAttribute('href', '/me');
  });

  test('and still offers a way out when there is no code to open', async ({ page }) => {
    await page.goto('/new/done');
    await expect(page.getByRole('link', { name: 'Open it' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'My bets' })).toBeVisible();
  });
});
