import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({
  entryPoints: [fileURLToPath(new URL('./src/client.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./lib/client.js', import.meta.url)),
  bundle: true, format: 'cjs', platform: 'browser', target: 'chrome120',
  banner: { js: 'window.__ModuleLoader__.load({id:"@shellraining/dsh-mermaid",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
});
await build({
  entryPoints: [fileURLToPath(new URL('./src/index.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./lib/index.js', import.meta.url)),
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
});
