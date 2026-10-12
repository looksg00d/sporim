// Regenerates src/devnet/generated from the program's IDL. The IDL is the contract: nothing in
// generated/ is edited by hand, and a program change lands here only through this script.
//
//   pnpm --filter @sporim/chain generate
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFromRoot } from 'codama';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { renderVisitor } from '@codama/renderers-js';

const idlPath = fileURLToPath(new URL('../../program/programs/sporim/idl.json', import.meta.url));
const packageDir = fileURLToPath(new URL('..', import.meta.url));

const codama = createFromRoot(rootNodeFromAnchor(JSON.parse(readFileSync(idlPath, 'utf8'))));
await codama.accept(
  renderVisitor(packageDir, {
    generatedFolder: 'src/devnet/generated',
    // package.json is ours; the renderer must not rewrite its dependencies.
    syncPackageJson: false,
    kitImportStrategy: 'rootOnly',
  }),
);
console.log('generated src/devnet/generated from', idlPath);
