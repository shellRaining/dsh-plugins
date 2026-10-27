import { WALLPAPER_MARKER } from './contract.ts';
import type { Feature } from './feature.ts';
import { PLUGIN_ID, type Settings } from './settings.ts';
import { CANVAS_TOKENS } from './palette.ts';
import { createStyleSheet } from './style.ts';
import { COMPOSER_CARD } from './composer.ts';

// Wallpaper material: a fixed image/tint/noise layer behind the app, plus the
// shell canvases cleared so it shows through. Canvases are cleared by rebinding
// their tokens on the frame, not by overriding component backgrounds, so every
// page and dock pane that paints the canvas follows (conversation, dock panes,
// document/PDF previews, file tree, browser chrome, schedule and other pages).
// Cards, code, inputs, menus and dialogs keep their own fills.
const FRAME = 'body[data-acrylic-wallpaper] div:has(> [data-shell-bottom]):has(> [data-rightbar-col])';
const COMPACTION_HEADER = 'button[aria-expanded="true"]:has(> span > [data-compaction-disclosure])';
const CODE_BANNER = '.md-code-block > :has(> [data-code-block-banner])';
const TINT = { light: '247 247 247', dark: '24 24 24' };
// Per canvas token: a kept opaque copy, cleared, restored and sticky-bar values.
const CANVAS_RULES = (() => {
  type Canvas = keyof typeof CANVAS_TOKENS;
  const names = Object.keys(CANVAS_TOKENS) as Canvas[];
  const kept = (name: Canvas) => `--acrylic-opaque${name.slice(1)}`;
  const join = (value: (name: Canvas) => string) => names.map(name => `${name}: ${value(name)};`).join(' ');
  return {
    keep: names.map(name => `${kept(name)}: var(${name});`).join(' '),
    clear: join(() => 'transparent'),
    restore: join(name => `var(${kept(name)})`),
    bar: join(name => `color-mix(in srgb, var(${kept(name)}) 82%, transparent)`),
    acrylic: `color-mix(in srgb, var(${kept('--dsw-alias-bg-base')}) 82%, transparent)`,
  };
})();

export const WALLPAPER_CSS = `
body[data-acrylic-wallpaper] { isolation: isolate; --acrylic-tint-rgb: ${TINT.light}; }
body[data-acrylic-wallpaper][data-ds-dark-theme] { --acrylic-tint-rgb: ${TINT.dark}; }
[data-acrylic-layer] { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; background: rgb(var(--acrylic-tint-rgb, ${TINT.light})); }
[data-acrylic-layer] > div { position: absolute; pointer-events: none; }
[data-acrylic-image] { inset: calc(-3 * var(--acrylic-blur)); background-position: center; background-size: cover; background-repeat: no-repeat; filter: blur(var(--acrylic-blur)); }
[data-acrylic-tint] { inset: 0; background: rgb(var(--acrylic-tint-rgb, ${TINT.light}) / var(--acrylic-tint)); }
[data-acrylic-noise] { inset: 0; background-repeat: repeat; opacity: var(--acrylic-noise); }

/* Custom properties substitute where declared: body children keep the opaque
   palette values that the frame below replaces with transparent. */
body[data-acrylic-wallpaper] > * { ${CANVAS_RULES.keep} }
${FRAME} { ${CANVAS_RULES.clear} }
/* Keep terminal palette sampling opaque: the host also uses this color for
   inverse text, selection and cursor contrast. Paint wallpaper over the fill
   instead of feeding transparent black into the emulator's theme. */
${FRAME} > [data-shell-overlay], ${FRAME} :has(> .xterm) { ${CANVAS_RULES.restore} }
/* Both the host padding and xterm's inline-painted scroll surface need the
   material. clip-path clips viewport-fixed decoration without changing its
   containing block; fixed coordinates keep it aligned with the main wallpaper.
   Only DOM-rendered terminals are supported; never cover canvas renderers. */
${FRAME} :has(> .xterm .xterm-rows),
${FRAME} .xterm:has(.xterm-rows) :is(.xterm-scrollable-element,.xterm-viewport) {
  isolation: isolate; clip-path: inset(0);
}
${FRAME} :has(> .xterm .xterm-rows)::before,
${FRAME} .xterm:has(.xterm-rows) :is(.xterm-scrollable-element,.xterm-viewport)::before {
  content: ''; position: fixed; inset: var(--acrylic-terminal-inset); z-index: 0; pointer-events: none;
  background-color: rgb(var(--acrylic-tint-rgb));
  background-image: var(--acrylic-terminal-image); background-position: center;
  background-size: var(--acrylic-terminal-size); background-repeat: var(--acrylic-terminal-repeat);
  filter: blur(var(--acrylic-terminal-blur));
}
${FRAME} :has(> .xterm .xterm-rows)::after,
${FRAME} .xterm:has(.xterm-rows) :is(.xterm-scrollable-element,.xterm-viewport)::after {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: rgb(var(--acrylic-tint-rgb) / var(--acrylic-terminal-tint));
}
${FRAME} :has(> .xterm .xterm-rows) > .xterm,
${FRAME} .xterm:has(.xterm-rows) .xterm-screen { position: relative; z-index: 1; }

/* Reading surfaces (center column, docked panes) gain the same subtle tint. */
${FRAME} > div:nth-child(2),
${FRAME} [data-dockkit-host="dock"] > [data-dockkit-content],
${FRAME} [data-dockkit-empty] { background: rgb(var(--acrylic-tint-rgb) / .08); }
/* A right panel without its own track (narrow window, fullscreen) lies over
   the conversation; give its panes in-app acrylic instead of see-through. */
${FRAME}:is([data-rightbar-collapsed], [data-rightbar-fullscreen]) [data-rightbar-col] [data-dockkit-host="dock"] > [data-dockkit-content],
${FRAME}:is([data-rightbar-collapsed], [data-rightbar-fullscreen]) [data-rightbar-col] [data-dockkit-empty] {
  background: ${CANVAS_RULES.acrylic};
  backdrop-filter: blur(30px) saturate(1.2);
}

/* Sticky rows that used the canvas to hide scrolled content become acrylic
   bars, matched by the host's own semantic anchors (host/modules.ts): an open
   compaction header (sticky exactly while expanded), and a code block's banner
   wrapper, which the host itself selects as :has(>[data-code-block-banner]). */
${FRAME} [data-expanded] [data-open] [data-disclosure-header],
${FRAME} ${COMPACTION_HEADER},
${FRAME} ${CODE_BANNER},
${FRAME} th {
  ${CANVAS_RULES.bar}
}
${FRAME} [data-expanded] [data-open] [data-disclosure-header],
${FRAME} ${COMPACTION_HEADER} {
  backdrop-filter: blur(20px) saturate(1.2);
}

/* Composer cards (host input bar, side chat) stay readable inputs over
   transcript text: blur a decorative pseudo-element, never the card (fixed
   menus inside it must stay viewport-relative). ::after belongs to the host
   workspace card. */
body[data-acrylic-wallpaper] ${COMPOSER_CARD} { position: relative; isolation: isolate; background: transparent !important; }
body[data-acrylic-wallpaper] ${COMPOSER_CARD}::before {
  content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none;
  background: var(--dsw-specific-input-major);
}
@supports (backdrop-filter: blur(1px)) {
  body[data-acrylic-wallpaper] ${COMPOSER_CARD}::before {
    background: color-mix(in srgb, var(--dsw-specific-input-major) 88%, transparent);
    backdrop-filter: blur(24px) saturate(1.15);
  }
  body[data-acrylic-wallpaper][data-ds-dark-theme] ${COMPOSER_CARD}::before {
    background: color-mix(in srgb, var(--dsw-specific-input-major) 85%, transparent);
  }
}
/* The opaque layer already backs every menu; the macOS menu backing would
   otherwise sit between the wallpaper and the menu's acrylic. Host and Fluent
   adapter both paint it, hence !important. */
html[data-platform="darwin"] body[data-acrylic-wallpaper] > [data-menu-backing] { background: transparent !important; }
@media (forced-colors: active), (prefers-reduced-transparency: reduce) {
  [data-acrylic-layer] { display: none; }
}
`;

function createNoise(document: Document): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const data = context.createImageData(64, 64);
  let seed = 0x53a9d;
  for (let i = 0; i < data.data.length; i += 4) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const value = seed & 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
    data.data[i + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

/** What the wallpaper shows; null hides it. */
export interface WallpaperState {
  readonly url: string;
  readonly settings: Settings;
}

export function createWallpaper(document: Document, window: Window & typeof globalThis): Feature<WallpaperState | null> {
  const sheet = createStyleSheet(document, PLUGIN_ID, WALLPAPER_CSS);
  const layer = document.createElement('div');
  layer.setAttribute('data-acrylic-layer', '');
  layer.setAttribute('aria-hidden', 'true');
  const image = document.createElement('div');
  image.setAttribute('data-acrylic-image', '');
  const tint = document.createElement('div');
  tint.setAttribute('data-acrylic-tint', '');
  const noise = document.createElement('div');
  noise.setAttribute('data-acrylic-noise', '');
  const noiseUrl = createNoise(document);
  if (noiseUrl) noise.style.backgroundImage = `url("${noiseUrl}")`;
  layer.append(image, tint, noise);
  const terminalProperties = ['image', 'size', 'repeat', 'inset', 'blur', 'tint'] as const;
  function hide() {
    layer.remove(); sheet.toggle(false);
    document.body.removeAttribute(WALLPAPER_MARKER);
    for (const name of terminalProperties) document.body.style.removeProperty(`--acrylic-terminal-${name}`);
  }
  return {
    update(state) {
      if (!state?.url || !window.CSS.supports('filter', 'blur(1px)')) return hide();
      const { settings, url } = state;
      const { fit } = settings;
      image.style.backgroundImage = `url(${JSON.stringify(url)})`;
      image.style.backgroundSize = fit === 'stretch' ? '100% 100%' : fit === 'tile' ? 'auto' : fit;
      image.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
      // Do not enlarge contain/stretch: their fit must use the viewport itself.
      image.style.inset = fit === 'cover' || fit === 'tile' ? 'calc(-3 * var(--acrylic-blur))' : '0';
      layer.style.setProperty('--acrylic-blur', `${settings.blur}px`);
      layer.style.setProperty('--acrylic-tint', String(settings.tint / 100));
      layer.style.setProperty('--acrylic-noise', String(settings.noise / 100));
      // Inherit the same viewport material into terminal padding and scroll
      // surfaces without observing/mutating terminal rows or emulator options.
      const terminal = [image.style.backgroundImage, image.style.backgroundSize, image.style.backgroundRepeat, fit === 'cover' || fit === 'tile' ? `${-3 * settings.blur}px` : '0px', `${settings.blur}px`, String(settings.tint / 100)];
      terminalProperties.forEach((name, index) => document.body.style.setProperty(`--acrylic-terminal-${name}`, terminal[index] ?? ''));
      sheet.toggle(true);
      if (!layer.isConnected) document.body.prepend(layer);
      document.body.setAttribute(WALLPAPER_MARKER, '');
    },
    dispose() {
      hide();
      image.style.backgroundImage = '';
    },
  };
}
