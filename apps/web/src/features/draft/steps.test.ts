import { describe, expect, it } from 'vitest';
import { WIZARD_STEPS } from '@sporim/domain';
import { STEP_ROUTES, isAtOrBefore, stepFromPathname, stepNumber, stepRoute } from './steps';

describe('step routes', () => {
  it('covers every step the domain defines', () => {
    expect(Object.keys(STEP_ROUTES).sort()).toEqual([...WIZARD_STEPS].sort());
  });

  it('gives every step a distinct route', () => {
    const routes = Object.values(STEP_ROUTES);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('keeps the whole wizard under /new', () => {
    for (const route of Object.values(STEP_ROUTES)) {
      expect(route.startsWith('/new/')).toBe(true);
    }
  });

  it('numbers steps from one, in wizard order', () => {
    expect(WIZARD_STEPS.map(stepNumber)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('stepFromPathname', () => {
  it('reads the step back out of its own route', () => {
    for (const step of WIZARD_STEPS) {
      expect(stepFromPathname(stepRoute(step))).toBe(step);
    }
  });

  it('tolerates a trailing slash', () => {
    expect(stepFromPathname('/new/terms/')).toBe('terms');
  });

  it('returns null for a path that is not a step', () => {
    expect(stepFromPathname('/new')).toBeNull();
    expect(stepFromPathname('/')).toBeNull();
    expect(stepFromPathname('/new/settle')).toBeNull();
  });
});

describe('isAtOrBefore', () => {
  it('is true for a step at the limit', () => {
    expect(isAtOrBefore('deadline', 'deadline')).toBe(true);
  });

  it('is true for an earlier step', () => {
    expect(isAtOrBefore('terms', 'review')).toBe(true);
  });

  it('is false for a later step — this is what blocks a deep link', () => {
    expect(isAtOrBefore('review', 'terms')).toBe(false);
  });
});
