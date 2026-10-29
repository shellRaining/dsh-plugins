import type { Feature } from './feature.ts';
import type { ThemeModes, TokenOverrides } from './host/context.ts';
import { createStyleSheet } from './style.ts';

// Win10 depth: Fluent's shadow ramp (depth 4/8/16/64, from Fluent UI
// FluentDepths) replaces the host's faint elevations. Dark scheme doubles the
// alpha so surfaces still separate on dark canvases.
const ramp = (alpha: [number, number], [y1, b1]: [number, number], [y2, b2]: [number, number]) =>
  `0 ${y1}px ${b1}px 0 rgb(0 0 0 / ${alpha[0]}), 0 ${y2}px ${b2}px 0 rgb(0 0 0 / ${alpha[1]})`;
const depth = (strong: boolean, ...geometry: [[number, number], [number, number]]): ThemeModes => Object.freeze({
  light: ramp(strong ? [0.22, 0.18] : [0.132, 0.108], ...geometry),
  dark: ramp(strong ? [0.44, 0.36] : [0.264, 0.216], ...geometry),
});

export const DEPTH = Object.freeze({
  4: depth(false, [1.6, 3.6], [0.3, 0.9]),
  8: depth(false, [3.2, 7.2], [0.6, 1.8]),
  16: depth(false, [6.4, 14.4], [1.2, 3.6]),
  64: depth(true, [25.6, 57.6], [4.8, 14.4]),
});
type Depth = keyof typeof DEPTH;

// Plain shadow tokens are declared once on body: the theme layer replaces them.
export const FLUENT_SHADOWS = Object.freeze({
  '--dsw-shadow-lv1': DEPTH[4],
  '--dsw-shadow-lv1-blur': DEPTH[8],
  '--dsw-shadow-lv2': DEPTH[8],
  '--dsw-shadow-lv3': DEPTH[16], // toasts
} satisfies TokenOverrides);

// The host re-declares the stroked elevations on every element (body, body *)
// so a subtree's --dsw-elevation-stroke-color reaches them; a body-level
// override would stop at body. Re-declare them the same way, keeping the
// host's 0.5px stroke in front.
const ELEVATIONS = {
  '--dsw-elevation-soft': 4, // resting cards: composer
  '--dsw-elevation-panel': 8, // cards, previews, callouts
  '--dsw-elevation-prominent': 16, // menus, pickers
} as const satisfies Partial<Record<keyof TokenOverrides, Depth>>;
// Window-like surfaces share --dsw-elevation-prominent with menus and float
// highest: modal dialogs and floating dock panes.
const WINDOWS = ':is(body > [role="presentation"] > [role="dialog"][aria-modal="true"], [data-dockkit-float])';

const declare = (scheme: keyof ThemeModes, entries: [string, Depth][]) =>
  entries.map(([name, level]) => `${name}: var(--dsw-elevation-stroke), ${DEPTH[level][scheme]};`).join(' ');
export const ELEVATION_CSS = (['light', 'dark'] as const).map((scheme) => {
  const body = scheme === 'dark' ? 'body[data-acrylic-fluent][data-ds-dark-theme]' : 'body[data-acrylic-fluent]';
  return `${body}, ${body} * { ${declare(scheme, Object.entries(ELEVATIONS))} }
${body} ${WINDOWS} { ${declare(scheme, [['--dsw-elevation-prominent', 64]])} }`;
}).join('\n');

export function createElevation(document: Document): Feature<boolean> {
  const sheet = createStyleSheet(document, 'dsh-acrylic-wallpaper-elevation', ELEVATION_CSS);
  return { update: sheet.toggle, dispose: sheet.dispose };
}
