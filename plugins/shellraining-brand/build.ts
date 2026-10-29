import { buildPlugin } from '../../tools/build-plugin.ts';

await buildPlugin({
  root: new URL('./', import.meta.url),
  host: { entry: 'src/index.ts', output: 'index.js' },
  client: { entry: 'src/client.ts', output: 'client.js', external: ['react'] },
});
