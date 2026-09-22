import { describe, expect, it } from 'vitest';
import { ok, type Result } from '@sporim/domain';
import { asConflict } from './bets.repo';
import type { RepoError } from './errors';

/**
 * The half of the single writer that needs no database: what a lost race *looks like* on the
 * way out.
 *
 * Two people opening the same link race twice over — once for the seat, which
 * `participants_one_row_per_role` decides, and once for the transition, which
 * `applyTransition` decides. The second is asserted against the real database
 * (`bets.repo.integration.test.ts`, "writes nothing when the bet moved"). The first cannot be
 * staged there: a seat that is taken while the bet is still `open` is not a state the database
 * will let anybody produce, which is the whole point of the constraint. So the error it raises
 * is handed to `asConflict` directly.
 *
 * What is being pinned is narrow and load-bearing: the loser gets an answer, not a stack trace.
 */
describe('asConflict', () => {
  const pass = (): Promise<Result<true, RepoError>> => Promise.resolve(ok(true));

  const uniqueViolation = (constraint: string): Error =>
    Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint_name: constraint,
    });

  it('passes a success through untouched', async () => {
    expect(await asConflict(pass())).toEqual(ok(true));
  });

  it('turns a lost seat race into a refusal', async () => {
    const result = await asConflict(
      Promise.reject(uniqueViolation('participants_one_row_per_role')),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
      if (result.error.code === 'CONFLICT') expect(result.error.reason).toMatch(/already took/i);
    }
  });

  /*
   * Everything else stays an exception, and that is deliberate. A unique violation somewhere
   * else is a bug, and a bug that returns `CONFLICT` reads to the caller as "somebody got here
   * first" — a plausible, wrong answer, which is worse than a five hundred.
   */
  it('lets any other unique violation through as an exception', async () => {
    await expect(
      asConflict(Promise.reject(uniqueViolation('bets_short_code_key'))),
    ).rejects.toThrow(/unique constraint/);
  });

  it('lets an unrelated failure through as an exception', async () => {
    await expect(asConflict(Promise.reject(new Error('connection lost')))).rejects.toThrow(
      'connection lost',
    );
  });
});
