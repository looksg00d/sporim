/**
 * "Pure package" rule set: applies to code that must run unchanged in Node, the browser,
 * and React Native (Expo). Bans framework, DOM and Node-builtin imports.
 *
 * @param {string[]} files glob patterns the rule set applies to
 */
export default function purePackage(files) {
  return [
    {
      files,
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'react',
                message: 'packages/domain and packages/chain must stay React-free.',
              },
              { name: 'react-dom', message: 'No DOM in pure packages.' },
              { name: 'next', message: 'No Next.js in pure packages.' },
            ],
            patterns: [
              { group: ['react/*', 'react-dom/*'], message: 'No React in pure packages.' },
              { group: ['next/*'], message: 'No Next.js in pure packages.' },
              { group: ['node:*'], message: 'No Node builtins in pure packages (Expo reuse).' },
              {
                group: [
                  'fs',
                  'path',
                  'os',
                  'crypto',
                  'child_process',
                  'http',
                  'https',
                  'net',
                  'url',
                ],
                message: 'No Node builtins in pure packages (Expo reuse).',
              },
            ],
          },
        ],
        'no-restricted-globals': [
          'error',
          { name: 'window', message: 'No DOM globals in pure packages.' },
          { name: 'document', message: 'No DOM globals in pure packages.' },
          { name: 'localStorage', message: 'No DOM globals in pure packages.' },
          { name: 'process', message: 'Read config through function arguments, not process.env.' },
        ],
      },
    },
  ];
}
