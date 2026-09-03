import { expect, test } from '@playwright/test';

test.describe('home', () => {
  test('warns that the money is not real', async ({ page }) => {
    await page.goto('/');
    // Non-dismissible by design: nobody should mistake test money for real money.
    await expect(page.getByRole('status')).toContainText(/devnet/i);
  });

  test('leads with the offer and a way in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /start one/i })).toBeVisible();
  });

  test('never says the words that would reclassify the product', async ({ page }) => {
    await page.goto('/');
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const word of ['gamble', 'gambling', 'casino', 'jackpot', 'bookie', 'odds']) {
      expect(text, `"${word}" must not appear in user-facing copy`).not.toContain(word);
    }
  });

  test('shows the CTA without scrolling on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewport-specific');
    await page.goto('/');
    const cta = page.getByRole('link', { name: /start one/i });
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });
});
