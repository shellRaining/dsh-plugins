import { buildPlugin } from '../../tools/build-plugin.ts';

await buildPlugin({
  root: new URL('./', import.meta.url),
  host: { entry: 'src/host/index.ts', output: 'lib/index.js', external: 'packages' },
  client: {
    entry: 'src/client/index.tsx', output: 'lib/client.js',
    external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  },
});
