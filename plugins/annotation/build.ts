import { buildPlugin } from '../../tools/build-plugin.ts';

await buildPlugin({
  root: new URL('./', import.meta.url),
  host: { entry: 'src/index.ts', output: 'lib/index.js' },
  client: {
    entry: 'src/client.tsx', output: 'lib/client.js',
    external: ['react', 'react/jsx-runtime', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives'],
  },
});
