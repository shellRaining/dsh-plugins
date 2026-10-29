import { buildPlugin } from '../../tools/build-plugin.ts';

// Preserve both existing JavaScript paths; tsc emits their declarations separately.
for (const entry of ['index', 'format']) {
  await buildPlugin({
    root: new URL('./', import.meta.url),
    host: { entry: `src/${entry}.ts`, output: `lib/${entry}.js`, external: 'packages' },
  });
}
