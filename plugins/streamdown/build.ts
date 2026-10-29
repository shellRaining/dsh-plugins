import { buildPlugin } from '../../tools/build-plugin.ts';

await buildPlugin({
  root: new URL('./', import.meta.url),
  host: { entry: 'src/index.ts', output: 'lib/index.js' },
  client: {
    entry: 'src/client.tsx', output: 'lib/client.js', target: 'chrome120',
    external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  },
});
