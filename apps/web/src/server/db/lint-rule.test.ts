import { RuleTester, type Rule } from 'eslint';
import { describe, expect, it } from 'vitest';
import { isServerOnlyModule, noDbInClient } from '@sporim/config/eslint/no-server-db.js';

/**
 * The rule that keeps this directory out of the browser bundle. Tested here rather than next
 * to the rule because `packages/config` has no test runner of its own, and because the thing
 * being protected is this folder.
 */

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

describe('sporim/no-db-in-client', () => {
  ruleTester.run('no-db-in-client', noDbInClient as Rule.RuleModule, {
    valid: [
      // A server component may reach the database directly — that is the whole point of one.
      { code: "import { withUser } from '@/server/db/client';" },
      { code: "import postgres from 'postgres';" },
      // Server actions are the sanctioned door for a client component.
      { code: "'use client';\nimport { createBet } from '@/server/actions/create-bet';" },
      { code: "'use client';\nimport { formatUsdc } from '@sporim/domain';" },
      // A near miss that is not the database layer.
      { code: "'use client';\nimport { track } from '@/server/analytics/db-events';" },
    ],
    invalid: [
      {
        code: "'use client';\nimport { withUser } from '@/server/db/client';",
        errors: [{ messageId: 'serverOnly' }],
      },
      {
        code: "'use client';\nimport { getBet } from '../server/db/bets.repo';",
        errors: [{ messageId: 'serverOnly' }],
      },
      {
        code: "'use client';\nimport postgres from 'postgres';",
        errors: [{ messageId: 'serverOnly' }],
      },
      {
        // Dynamic import is the obvious way around a rule that only reads static ones.
        code: "'use client';\nexport const load = () => import('@/server/db/client');",
        errors: [{ messageId: 'serverOnly' }],
      },
    ],
  });

  it('matches the database layer however the path is spelled', () => {
    expect(isServerOnlyModule('@/server/db/client')).toBe(true);
    expect(isServerOnlyModule('./db/bets.repo')).toBe(false);
    expect(isServerOnlyModule('../../server/db')).toBe(true);
    expect(isServerOnlyModule('postgres')).toBe(true);
    expect(isServerOnlyModule('@/server/actions/create-bet')).toBe(false);
    expect(isServerOnlyModule('postgres-migrations')).toBe(false);
  });
});
