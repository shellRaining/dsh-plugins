import { buildPlugin } from '../../tools/build-plugin.ts';

await buildPlugin({
  root: new URL('./', import.meta.url),
  client: { entry: 'src/client.ts', output: 'client.js', wrapped: false },
  host: { entry: 'src/index.ts', output: 'index.js' },
});
