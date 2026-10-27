import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const bundle = await build({ entryPoints: [new URL('../src/wallpaper.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { createWallpaper, WALLPAPER_CSS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('terminal material follows wallpaper settings and is removed on disable/dispose', async t => {
  const window = new Window();
  window.CSS.supports = () => true;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  const wallpaper = createWallpaper(window.document, window);
  t.after(async () => { wallpaper.dispose(); await window.happyDOM.close(); });
  const style = window.document.body.style;
  const get = name => style.getPropertyValue(`--acrylic-terminal-${name}`);
  for (const fit of ['cover', 'contain', 'stretch', 'tile']) {
    wallpaper.update({ url: 'blob:test-wallpaper', settings: { fit, blur: 20, tint: 65, noise: 3 } });
    assert.match(get('image'), /blob:test-wallpaper/);
    assert.equal(get('size'), fit === 'stretch' ? '100% 100%' : fit === 'tile' ? 'auto' : fit);
    assert.equal(get('inset'), fit === 'cover' || fit === 'tile' ? '-60px' : '0px');
    assert.equal(get('repeat'), fit === 'tile' ? 'repeat' : 'no-repeat');
    assert.equal(get('blur'), '20px');
    assert.equal(get('tint'), '0.65');
  }
  wallpaper.update(null);
  assert.equal(get('image'), '');
  assert.equal(window.document.querySelector('[data-acrylic-layer]'), null);
  wallpaper.update({ url: 'blob:new', settings: { fit: 'cover', blur: 10, tint: 50, noise: 0 } });
  wallpaper.dispose();
  assert.equal(get('image'), '');
});

test('terminal material decorates DOM surfaces without changing palette or cells', () => {
  assert.match(WALLPAPER_CSS, /:has\(> \.xterm\) \{ --dsw-alias-bg-base: var\(--acrylic-opaque-dsw-alias-bg-base\)/);
  assert.match(WALLPAPER_CSS, /\.xterm-scrollable-element,\.xterm-viewport/);
  assert.match(WALLPAPER_CSS, /position: fixed; inset: var\(--acrylic-terminal-inset\)/);
  assert.match(WALLPAPER_CSS, /isolation: isolate; clip-path: inset\(0\)/);
  assert.doesNotMatch(WALLPAPER_CSS, /\.xterm-rows\s+(?:span|div)/);
});
