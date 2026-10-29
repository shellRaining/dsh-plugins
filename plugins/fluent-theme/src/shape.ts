// Win10 corner geometry: square controls and cards, a small panel radius for
// floating windows. Circles and pills declare 50%/999px locally and are unaffected.
import type { ThemeModes, TokenOverrides } from './host/context.ts';

const corner = (value: string): ThemeModes => Object.freeze({ light: value, dark: value });

export const FLUENT_SHAPE = Object.freeze({
  '--dsw-radius-xs': corner('2px'),
  '--dsw-radius-sm': corner('2px'),
  '--dsw-radius-md': corner('2px'),
  '--dsw-radius-lg': corner('0px'),
  '--dsw-radius-xl': corner('0px'),
  '--dsw-radius-panel': corner('6px'),
} satisfies TokenOverrides);
