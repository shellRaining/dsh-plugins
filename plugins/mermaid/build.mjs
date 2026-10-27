import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({
  entryPoints: [fileURLToPath(new URL('./src/client.js', import.meta.url))],
  outfile: fileURLToPath(new URL('./lib/client.js', import.meta.url)),
  bundle: true, format: 'cjs', platform: 'browser', target: 'chrome120',
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-mermaid",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
});
