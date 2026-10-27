import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
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
  test(`${manifest.name}: ships its host entry`, async () => {
    assert.ok((await readFile(new URL(manifest.main, root))).length > 0);
  });
  const patch = manifest.dsh?.bundle?.patch;
  test(`${manifest.name}: declares an independently installable bundle`, () => {
    assert.ok(patch, 'each plugin must declare dsh.bundle.patch');
  });
  if (manifest.dsh?.client) {
    test(`${manifest.name}: client registers its package name`, async () => {
      const registrations = [];
      const client = await readFile(new URL(manifest.exports['./client'], root), 'utf8');
      runInNewContext(client, {
        window: { __ModuleLoader__: { load: (value) => registrations.push(value) } },
      }, { timeout: 1000 });
      assert.deepEqual(registrations.map(value => value.id), [manifest.name]);
    });
  }
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
