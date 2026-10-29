import { buildPlugin } from '../../tools/build-plugin.ts';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const src = fileURLToPath(new URL('src/', root));
const EXTERNAL = ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'];
const TOKEN = /--dsw-[a-z0-9-]+/g;

// src/ holds TypeScript only: a JavaScript file there is a stale or concurrent
// edit that the bundle would silently leave out.
const files = (await readdir(src, { recursive: true })).filter(name => /\.[cm]?[jt]sx?$/.test(name));
const strays = files.filter(name => /\.[cm]?jsx?$/.test(name));
if (strays.length) throw new Error(`src/ contains JavaScript the build ignores: ${strays.join(', ')}`);

// tsc checks token names in typed overrides; CSS strings it cannot see. Every
// --dsw-* name anywhere in src/ must be one the host defines (src/host/tokens.ts).
const known = new Set((await readFile(join(src, 'host', 'tokens.ts'), 'utf8')).match(TOKEN));
const unknown = new Set<string>();
for (const name of files) {
  for (const [token] of (await readFile(join(src, name), 'utf8')).matchAll(TOKEN)) {
    if (!known.has(token)) unknown.add(`${token} (src/${name})`);
  }
}
if (unknown.size) throw new Error(`Tokens the host does not define:\n  ${[...unknown].join('\n  ')}`);

// Host CSS-module class names are hashed per build (src/host/modules.ts): no
// literal package (`.kB3qhq_root`) or Vite (`._block_7gxqk_4`) names, and no
// substring class matches that depend on either naming format.
const HASHED = /\.(?:[\w-]{6,7}_[a-z]\w*|_[a-z]\w*_[a-z0-9]{5}_\d+)(?![\w-])|\[class\s*[*^$|]?=/g;
const hashed: string[] = [];
for (const name of files) {
  for (const [match] of (await readFile(join(src, name), 'utf8')).matchAll(HASHED)) hashed.push(`${match} (src/${name})`);
}
if (hashed.length) throw new Error(`Build-specific host class selectors; use semantic anchors or src/host/modules.ts:\n  ${hashed.join('\n  ')}`);

await buildPlugin({
  root,
  host: { entry: 'src/index.ts', output: 'index.js' },
  client: { entry: 'src/client.ts', output: 'client.js', external: EXTERNAL },
});
