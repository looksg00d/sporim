/**
 * "Server-only database" rule set: keeps `server/db/*` and the raw Postgres driver out of
 * client components.
 *
 * The seam it defends is the same one `pure-package.js` defends for the domain, from the
 * other side. A module that opens a connection has the credential in scope; a module marked
 * `'use client'` is compiled into a bundle the browser downloads. Nothing stops those two
 * facts meeting except a rule that says so — and by the time a build has inlined a
 * connection string, telling people to be careful is not a control.
 *
 * Server actions (`server/actions/*`) are deliberately *not* banned: they are the sanctioned
 * way for a client component to reach the server, and they run on the server. Only the
 * database layer itself and the driver are out of bounds.
 *
 * Selection is by the `'use client'` directive rather than by folder, because that directive
 * is what actually decides where a module runs. A file moved to a new directory keeps its
 * protection; a file that gains the directive gains the rule with it.
 */

const SERVER_ONLY_MODULES = [
  // '@/server/db/client', './db/bets.repo', '../server/db/client', 'server/db'
  /(^|\/)server\/db(\/|$)/,
  // The driver itself, however it is reached.
  /^postgres$/,
];

/** Exported so the rule's judgement can be tested without standing up a linter. */
export function isServerOnlyModule(source) {
  return SERVER_ONLY_MODULES.some((pattern) => pattern.test(source));
}

function hasUseClientDirective(program) {
  return program.body.some((statement) => {
    if (statement.type !== 'ExpressionStatement') return false;
    if (statement.directive !== undefined) return statement.directive === 'use client';
    const { expression } = statement;
    return expression.type === 'Literal' && expression.value === 'use client';
  });
}

/** @type {import('eslint').Rule.RuleModule} */
export const noDbInClient = {
  meta: {
    type: 'problem',
    docs: {
      description: "ban server/db and the Postgres driver from 'use client' modules",
    },
    schema: [],
    messages: {
      serverOnly:
        "'{{source}}' is server-only: it opens a database connection, and this module is " +
        'compiled into the browser bundle. Reach it through a server action instead.',
    },
  },
  create(context) {
    let inClientComponent = false;

    const check = (node, source) => {
      if (!inClientComponent) return;
      if (typeof source !== 'string' || !isServerOnlyModule(source)) return;
      context.report({ node, messageId: 'serverOnly', data: { source } });
    };

    return {
      Program(node) {
        inClientComponent = hasUseClientDirective(node);
      },
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type !== 'Literal') return;
        check(node, node.source.value);
      },
    };
  },
};

export const plugin = { rules: { 'no-db-in-client': noDbInClient } };

/**
 * @param {string[]} files glob patterns the rule set applies to
 */
export default function noServerDb(files) {
  return [
    {
      files,
      plugins: { sporim: plugin },
      rules: { 'sporim/no-db-in-client': 'error' },
    },
  ];
}
