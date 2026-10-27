import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
await build({
  entryPoints: [fileURLToPath(new URL('./src/client.js', import.meta.url))],
  outfile: fileURLToPath(new URL('./lib/client.js', import.meta.url)),
  bundle: true, format: 'cjs', platform: 'browser', target: 'chrome120',
  banner: { js: 'window.__ModuleLoader__.load({id:"@shellraining/dsh-mermaid",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
});
await copyFile(new URL('./src/index.js', import.meta.url), new URL('./lib/index.js', import.meta.url));
