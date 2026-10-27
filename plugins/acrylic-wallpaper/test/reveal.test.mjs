import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const bundle = await build({ entryPoints: [new URL('../src/reveal.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { createReveal } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function fixture(t, html = '') {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = `<div style="position:relative;z-index:1000"><button id="target">Target</button></div>${html}`;
  const target = document.querySelector('#target');
  const rect = (x, y, w, h) => new window.DOMRect(x, y, w, h);
  target.getBoundingClientRect = () => rect(0, 0, 100, 100);
  // Deliberately miss a small overlapping popup between the bounded probes.
  document.elementFromPoint = () => target;
  const computed = window.getComputedStyle.bind(window);
  window.getComputedStyle = node => new Proxy(computed(node), {
    get(css, key) {
      const defaults = { opacity: '1', zIndex: 'auto', transform: 'none', filter: 'none', backdropFilter: 'none', visibility: 'visible', pointerEvents: 'auto' };
      return css[key] || defaults[key] || '';
    },
  });
  window.matchMedia = query => ({ matches: query.includes('pointer: fine'), addEventListener() {}, removeEventListener() {} });
  let frame;
  window.requestAnimationFrame = callback => { frame = callback; return 1; };
  window.cancelAnimationFrame = () => { frame = undefined; };
  const reveal = createReveal(document, window, { select: () => null, subscribe: () => () => {} });
  t.after(async () => { reveal.dispose(); await window.happyDOM.close(); });
  const measure = node => { node.getBoundingClientRect = () => rect(20, 20, 10, 10); return node; };
  for (const node of document.querySelectorAll('[role="dialog"],[role="tooltip"]')) measure(node);
  reveal.update(true);
  function flush() { const callback = frame; frame = undefined; callback?.(); }
  function move() { document.dispatchEvent(new window.PointerEvent('pointermove', { pointerType: 'mouse', clientX: 50, clientY: 50 })); flush(); }
  const light = () => document.querySelector('[data-acrylic-reveal]');
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  const mutations = async () => { await settle(); flush(); };
  return { window, document, target, reveal, measure, move, light, mutations, settle, pending: () => Boolean(frame) };
}

test('body light keeps the outer stacking level and leaves host controls untouched', async t => {
  const f = fixture(t);
  const before = f.target.outerHTML;
  f.move();
  assert.equal(f.light()?.parentElement, f.document.body);
  assert.equal(f.light()?.style.getPropertyValue('--reveal-z'), '1000');
  assert.equal(f.target.outerHTML, before);
  await f.mutations();
  assert.equal(f.pending(), false, 'overlay writes must not cause an animation loop');
  f.reveal.update(false);
  assert.equal(f.light(), null);
});

test('existing nested annotation dialog blocks a body light even when probes miss it', t => {
  const f = fixture(t, '<div data-local-annotation-card><section role="dialog"></section></div>');
  f.move();
  assert.equal(f.light(), null);
});

test('dialog inserted into an existing wrapper clears the light without pointer movement', async t => {
  const f = fixture(t, '<div data-local-annotation-card></div>');
  f.move();
  assert.ok(f.light());
  const dialog = f.measure(f.document.createElement('section'));
  dialog.setAttribute('role', 'dialog');
  f.document.querySelector('[data-local-annotation-card]').append(dialog);
  await f.mutations();
  assert.equal(f.light(), null);
  dialog.remove();
  await f.mutations();
  assert.ok(f.light());
});

test('new wrapper discovers nested pointer-transparent popup and hidden reuse', async t => {
  const f = fixture(t);
  f.move();
  const wrapper = f.document.createElement('div');
  wrapper.innerHTML = '<div role="tooltip" style="pointer-events:none"></div>';
  f.measure(wrapper.firstElementChild);
  f.document.body.append(wrapper);
  await f.mutations();
  assert.equal(f.light(), null);
  wrapper.hidden = true;
  await f.mutations();
  assert.ok(f.light());
  wrapper.hidden = false;
  await f.mutations();
  assert.equal(f.light(), null);
  wrapper.remove();
  await f.mutations();
  assert.ok(f.light());
});

test('controls inside the active annotation dialog still receive reveal', t => {
  const f = fixture(t, '<div data-local-annotation-card style="position:fixed;z-index:1000"><section role="dialog"></section></div>');
  f.document.querySelector('[role="dialog"]').append(f.target);
  f.move();
  assert.ok(f.light());
  assert.equal(f.light().style.getPropertyValue('--reveal-z'), '1000');
});

test('terminal/editor churn and unrelated subtrees neither scan renderers nor redraw', async t => {
  const f = fixture(t, '<div class="xterm"><div id="rows"></div></div><div class="monaco-editor"><div id="lines"></div></div><div id="unrelated"></div>');
  f.move();
  await f.settle();
  assert.equal(f.pending(), false);
  for (const id of ['rows', 'lines']) {
    const host = f.document.getElementById(id);
    const row = f.document.createElement('span');
    row.querySelectorAll = () => { throw new Error('must not scan terminal/editor rows'); };
    host.append(row);
    host.setAttribute('aria-hidden', 'true');
    row.textContent = 'streaming output';
  }
  f.document.getElementById('unrelated').innerHTML = '<span>unrelated streamed text</span>';
  await f.settle();
  assert.equal(f.pending(), false);
  assert.ok(f.light());
});

test('adding and removing popup semantics updates existing nested nodes', async t => {
  const f = fixture(t, '<div><section id="popup"></section></div>');
  const popup = f.measure(f.document.querySelector('#popup'));
  f.move();
  assert.ok(f.light());
  popup.setAttribute('data-acrylic-popup', 'flyout');
  await f.mutations();
  assert.equal(f.light(), null);
  popup.removeAttribute('data-acrylic-popup');
  await f.mutations();
  assert.ok(f.light());
});
