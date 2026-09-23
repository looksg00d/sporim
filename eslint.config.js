import base from '@sporim/config/eslint/base.js';
import noServerDb from '@sporim/config/eslint/no-server-db.js';
import purePackage from '@sporim/config/eslint/pure-package.js';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.next-e2e/**',
      '**/next-env.d.ts',
      '**/coverage/**',
      '**/target/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'data/**',
      'reference/**',
      'tools/**',
      // Local output of the /brag video skill: generated HTML/JS, not project code.
      'brag-output/**',
    ],
  },
  ...base,
  // Domain and chain logic must stay framework-free so it can be reused by the Expo app later.
  ...purePackage(['packages/domain/src/**/*.ts', 'packages/chain/src/**/*.ts']),
  // The database layer holds the only credential in the system; a `'use client'` module is
  // shipped to the browser. The glob is broad because the rule itself selects on the
  // directive, so a component moved to a new folder does not lose the guard.
  ...noServerDb(['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}']),
];
