import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const banner = '// Generated from TypeScript by pnpm run build.\n';
const client = await build({
  entryPoints: [fileURLToPath(new URL('src/client.ts', root))],
  bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022',
  charset: 'utf8', external: ['react'],
});
await writeFile(new URL('client.js', root), `${banner}window.__ModuleLoader__.load({
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
await writeFile(new URL('index.js', root), banner + host.outputFiles[0].text);
console.log(`Built ${pkg.name}`);
