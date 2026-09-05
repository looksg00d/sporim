import { expect, test, type Page } from '@playwright/test';

/**
 * The create flow, end to end. These specs deliberately assert *behaviour a user can see*
 * rather than internals: a blocked step must say why, a restored draft must still be there,
 * a deep link must not open a screen full of blanks, and a hold released early must do
 * nothing at all.
 *
 * `exact: true` on "Next" is not decoration — Next.js injects an "Open Next.js Dev Tools"
 * button in dev, and a substring match finds both.
 */

const TERMS = 'Ты не пробежишь 10 км до воскресенья.';

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true });

/**
 * Picks a deadline without naming a weekday.
 *
 * This used to click "Sunday", which works six days a week. On a Saturday the Sunday preset
 * falls on the same instant as "Tomorrow" and `deadlinePresets` drops the duplicate — correct
 * behaviour, pinned by its own unit test — so the button simply was not there, and thirty
 * specs failed with a timeout that said nothing about why.
 *
 * "Tomorrow" is the only chip that survives every day. "Tonight" goes late in the evening,
 * "Sunday" collides with "Tomorrow" on a Saturday, and "In a week" collides with "Sunday" on a
 * Sunday — which is not a guess: it is what the unit test caught when this helper first
 * reached for "In a week" instead.
 */
const pickDeadline = (page: Page) => page.getByRole('button', { name: 'Tomorrow' }).click();
const formatCard = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^${label}`) });

async function fillTerms(page: Page, terms = TERMS) {
  await page.goto('/new/terms');
  await page.fill('#terms', terms);
}

async function reachDeadline(page: Page) {
  await fillTerms(page);
  await next(page).click();
  await page.waitForURL('**/new/format');
  await page.getByRole('button', { name: '$25', exact: true }).click();
  await next(page).click();
  await page.waitForURL('**/new/deadline');
}

/** Draws a scrawl across the pad — enough ink to pass `isSignatureMeaningful`. */
async function sign(page: Page) {
  const pad = page.getByTestId('signature-pad');
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 20, y);
  await page.mouse.down();
  for (const fraction of [0.25, 0.4, 0.55, 0.7, 0.85]) {
    await page.mouse.move(box.x + box.width * fraction, y + (fraction > 0.5 ? -18 : 18));
  }
  await page.mouse.up();
}

async function reachReview(page: Page) {
  await reachDeadline(page);
  await pickDeadline(page);
  await next(page).click();
  await page.waitForURL('**/new/judge');
  await next(page).click();
  await page.waitForURL('**/new/review');
}

/**
 * Re-enters review with the wallet mocked. Locking in for real needs a verified Privy token,
 * which a headless browser cannot obtain, so the tests that walk past the commit button say
 * so in the URL rather than quietly appearing to have exercised the server.
 *
 * Re-navigating is safe: the draft lives in `sessionStorage` and the screen restores it.
 */
async function mockWallet(page: Page, failWith?: string) {
  const query = failWith === undefined ? 'mock=ok' : `mockFail=${failWith}`;
  await page.goto(`/new/review?${query}`);
  await expect(page.getByTestId('commit')).toBeEnabled();
}

test.describe('S1 — terms', () => {
  test('/new sends you to the first step', async ({ page }) => {
    await page.goto('/new');
    await expect(page).toHaveURL(/\/new\/terms$/);
  });

  test('will not advance on nine characters, and says why', async ({ page }) => {
    await fillTerms(page, 'too short');
    await expect(next(page)).toBeDisabled();
    await expect(page.getByText('1 more characters.')).toBeVisible();
  });

  test('advances once the terms are long enough', async ({ page }) => {
    await fillTerms(page);
    await expect(next(page)).toBeEnabled();
    await next(page).click();
    await expect(page).toHaveURL(/\/new\/format$/);
  });

  test('blocks terms past the 280-character limit', async ({ page }) => {
    await fillTerms(page, 'x'.repeat(281));
    await expect(next(page)).toBeDisabled();
    await expect(page.getByText('1 characters over.')).toBeVisible();
  });

  test('keeps the draft across a reload', async ({ page }) => {
    await fillTerms(page);
    await page.reload();
    await expect(page.locator('#terms')).toHaveValue(TERMS);
  });
});

test.describe('S2 — format and stake', () => {
  test('shows both outcomes with the numbers the domain produced', async ({ page }) => {
    await fillTerms(page);
    await next(page).click();
    await page.getByRole('button', { name: '$25', exact: true }).click();
    await expect(page.getByText('WHERE THE MONEY GOES')).toBeVisible();
    // 25 + 25 pot, 3% of the 25 net winnings = 0.75, so the winner takes 49.25.
    await expect(page.getByText('49.25 USDC').first()).toBeVisible();
  });

  test('a kept Commit returns the stake and charges nothing', async ({ page }) => {
    await fillTerms(page);
    await next(page).click();
    await formatCard(page, 'Commit').click();
    await page.getByRole('button', { name: '$25', exact: true }).click();
    await expect(page.getByText('You do it')).toBeVisible();
    await expect(page.getByText('25.00 USDC')).toBeVisible();
    await expect(page.getByText('No fee.').first()).toBeVisible();
  });

  test('a Commit cannot continue without saying where the money goes', async ({ page }) => {
    await fillTerms(page);
    await next(page).click();
    await formatCard(page, 'Commit').click();
    await page.getByRole('button', { name: '$25', exact: true }).click();
    await expect(next(page)).toBeDisabled();
    await expect(page.getByText('Say where the money goes if you miss it.')).toBeVisible();
    await page.getByRole('button', { name: 'A friend' }).click();
    await expect(next(page)).toBeEnabled();
  });

  test('a one-sided format warns that a referee is now required', async ({ page }) => {
    await fillTerms(page);
    await next(page).click();
    await formatCard(page, 'Commit').click();
    await expect(page.getByText(/a referee decides this one/i)).toBeVisible();
  });
});

test.describe('S3 — deadline', () => {
  test('offers only deadlines the domain would accept', async ({ page }) => {
    await reachDeadline(page);
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await expect(next(page)).toBeEnabled();
  });

  test('names the timezone, because both sides must read the same instant', async ({ page }) => {
    await reachDeadline(page);
    await expect(page.getByText('UTC', { exact: false }).first()).toBeVisible();
  });

  test('will not continue with no deadline picked', async ({ page }) => {
    await reachDeadline(page);
    await expect(next(page)).toBeDisabled();
    await expect(page.getByText('Pick a deadline.')).toBeVisible();
  });
});

test.describe('S4 — judge', () => {
  test('refuses a referee who is the other side of the bet', async ({ page }) => {
    await reachDeadline(page);
    await pickDeadline(page);
    await next(page).click();
    await page.waitForURL('**/new/judge');

    await page.getByRole('button', { name: /^A friend decides/ }).click();
    await page.fill('#opponent', 'dima');
    await page.fill('#referee', '@Dima');

    // Addressed by id: Next's route announcer is also role="alert".
    await expect(page.locator('#referee-error')).toContainText('other side of the bet');
    await expect(next(page)).toBeDisabled();
  });

  test('mutual confirmation needs no referee', async ({ page }) => {
    await reachDeadline(page);
    await pickDeadline(page);
    await next(page).click();
    await page.waitForURL('**/new/judge');
    await expect(next(page)).toBeEnabled();
  });
});

test.describe('S5 — review and signing', () => {
  test('states the whole agreement in one sentence', async ({ page }) => {
    await reachReview(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Sign your commitment/i);
    await expect(page.getByText(TERMS).first()).toBeVisible();
  });

  test('cannot be committed before it is signed', async ({ page }) => {
    await reachReview(page);
    await expect(page.getByTestId('commit')).toBeDisabled();
    await expect(page.getByText('Sign above to lock it in.')).toBeVisible();
  });

  test('a stray tap is not a signature', async ({ page }) => {
    await reachReview(page);
    const pad = page.getByTestId('signature-pad');
    await pad.scrollIntoViewIfNeeded();
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId('commit')).toBeDisabled();
  });

  test('signing enables the commit and puts the scrawl on the card', async ({ page }) => {
    await reachReview(page);
    await sign(page);
    await expect(page.getByTestId('commit')).toBeEnabled();
    await expect(page.getByRole('img', { name: 'Signature' })).toBeVisible();
    await expect(page.getByText('SIGNED')).toBeVisible();
  });

  test('clearing the signature takes the commit away again', async ({ page }) => {
    await reachReview(page);
    await sign(page);
    await expect(page.getByTestId('commit')).toBeEnabled();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByTestId('commit')).toBeDisabled();
  });

  test('a typed name signs it too — drawing is not the only way in', async ({ page }) => {
    await reachReview(page);
    await page.getByRole('button', { name: 'Type your name instead' }).click();
    await page.getByLabel('Type your name to sign').fill('Дима');
    await expect(page.getByTestId('commit')).toBeEnabled();
  });

  test('the signature survives a reload', async ({ page }) => {
    await reachReview(page);
    await sign(page);
    await page.reload();
    await expect(page.getByTestId('commit')).toBeEnabled();
  });

  test('never lets you believe you have a referee before they have agreed', async ({ page }) => {
    // The creator names somebody on S4 and that person has been asked nothing. If a
    // disagreement happened right now it would refund both sides, not go to Anya — so the
    // screen has to say so before the signature, not after.
    await reachDeadline(page);
    await pickDeadline(page);
    await next(page).click();
    await page.waitForURL('**/new/judge');
    await page.fill('#referee', '@anya');
    await next(page).click();
    await page.waitForURL('**/new/review');

    await expect(page.getByTestId('referee-unconfirmed')).toContainText(/hasn.t been asked yet/i);
    await expect(page.getByTestId('referee-unconfirmed')).toContainText(/refunds you both/i);
    await expect(page.getByText(/@anya · not yet accepted/)).toBeVisible();
  });

  test('never calls the signature legally binding', async ({ page }) => {
    await reachReview(page);
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const word of ['legally binding', 'e-signature', 'legally enforceable']) {
      expect(text, `"${word}" must not appear`).not.toContain(word);
    }
    await expect(page.getByText(/not a legal document/i)).toBeVisible();
  });

  test('a signed bet locks in and hands back a code', async ({ page }) => {
    await reachReview(page);
    await sign(page);
    await mockWallet(page);
    await page.getByTestId('commit').click();

    await page.waitForURL('**/new/done**', { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Locked in/i);
    await expect(page.getByText(/^#[0-9BCDFGHJKLMNPQRSTVWXYZ]{6}$/)).toBeVisible();
  });

  test('says plainly that nothing moved, because nothing did', async ({ page }) => {
    await reachReview(page);
    await sign(page);
    await mockWallet(page);
    await page.getByTestId('commit').click();
    await page.waitForURL('**/new/done**', { timeout: 15_000 });
    await expect(page.getByText(/Simulated/i)).toBeVisible();
  });

  test('a wallet failure is explained and the draft survives it', async ({ page }) => {
    await reachReview(page);
    await sign(page);
    await mockWallet(page, 'INSUFFICIENT_FUNDS');

    await page.getByTestId('commit').click();
    await expect(
      page.getByText('Not enough USDC in your wallet. Top up and try again.'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/new\/review/);

    await page.goto('/new/terms');
    await expect(page.locator('#terms')).toHaveValue(TERMS);
  });
});

test.describe('step guard', () => {
  test('a deep link into review with no draft lands on step one', async ({ page }) => {
    await page.goto('/new/review');
    await expect(page).toHaveURL(/\/new\/terms$/);
  });

  test('a deep link into the judge step with only terms lands on the format step', async ({
    page,
  }) => {
    await fillTerms(page);
    await page.goto('/new/judge');
    await expect(page).toHaveURL(/\/new\/format$/);
  });

  test('going back to an earlier step is allowed', async ({ page }) => {
    await reachDeadline(page);
    await page.goto('/new/terms');
    await expect(page).toHaveURL(/\/new\/terms$/);
    await expect(page.locator('#terms')).toHaveValue(TERMS);
  });
});

test.describe('vocabulary', () => {
  test('no wizard screen uses the words that would reclassify the product', async ({ page }) => {
    const banned = ['gamble', 'gambling', 'casino', 'jackpot', 'bookie', 'odds', 'wager'];
    for (const path of ['/new/terms', '/new/format', '/new/deadline', '/new/judge']) {
      await fillTerms(page);
      if (path !== '/new/terms') {
        await next(page).click();
        await page.getByRole('button', { name: '$25', exact: true }).click();
        if (path !== '/new/format') {
          await next(page).click();
          await pickDeadline(page);
          if (path !== '/new/deadline') await next(page).click();
        }
      }
      const text = (await page.locator('main, body').first().innerText()).toLowerCase();
      for (const word of banned) {
        expect(text, `"${word}" must not appear on ${path}`).not.toContain(word);
      }
    }
  });
});
