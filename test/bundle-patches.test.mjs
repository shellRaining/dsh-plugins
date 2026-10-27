import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { load } from 'js-yaml';

const plugins = new URL('../plugins/', import.meta.url);
for (const entry of await readdir(plugins, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const root = new URL(`${entry.name}/`, plugins);
  let source;
  try {
    source = await readFile(new URL('package.json', root), 'utf8');
  } catch (error) {
    // Removed workspaces can leave an untracked node_modules directory behind.
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const manifest = JSON.parse(source);
  const patch = manifest.dsh?.bundle?.patch;
  if (patch === undefined) continue;
  for (const filename of Array.isArray(patch) ? patch : [patch]) {
    test(`${manifest.name}: ${filename} is a valid YAML overlay`, async () => {
      const rows = load(await readFile(new URL(filename, root), 'utf8'));
      assert.ok(Array.isArray(rows), 'bundle patch must be an array');
      for (const row of rows) {
        assert.ok(row && typeof row === 'object', 'overlay entries must be objects');
        if (row.insert === undefined) continue;
        assert.ok(Array.isArray(row.insert), 'insert must be an array');
        for (const plugin of row.insert) {
          assert.equal(typeof plugin.id, 'string');
          assert.equal(typeof plugin.name, 'string');
          assert.ok(plugin.name.length > 0);
        }
      }
    });
  }
}
