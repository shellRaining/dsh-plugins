import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const banner = '// Generated from TypeScript by pnpm run build.\n';
const lib = new URL('lib/', root);
await mkdir(lib, { recursive: true });
async function output(name, text) {
  const target = new URL(name, lib);
  const temporary = new URL(`${name}.${process.pid}.tmp`, lib);
  // Both paths are fixed children of this package's lib/; never rename outside it.
  if (!target.href.startsWith(lib.href) || !temporary.href.startsWith(lib.href)) throw new Error('Invalid output path');
  await writeFile(temporary, text);
  await rename(temporary, target);
}
const client = await build({
  entryPoints: [fileURLToPath(new URL('src/client.tsx', root))],
  bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022',
  jsx: 'automatic', charset: 'utf8', external: ['react', 'react/jsx-runtime', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives'],
});
await output('client.js', `${banner}window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${client.outputFiles[0].text}
    return module.exports;
  }
});\n`);
const host = await build({
  entryPoints: [fileURLToPath(new URL('src/index.ts', root))],
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'node20',
});
await output('index.js', banner + host.outputFiles[0].text);
console.log(`Built ${pkg.name}: ${client.outputFiles[0].text.length} client characters`);
