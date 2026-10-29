import type { Feature } from './feature.ts';
import type { Dispose, ThemeService, TokenOverrides } from './host/context.ts';
import { PLUGIN_ID } from './settings.ts';
import { FLUENT_PALETTE } from './palette.ts';
import { FLUENT_SHAPE } from './shape.ts';
import { FLUENT_SHADOWS } from './elevation.ts';

// One host override layer (ctx.theme) carrying shape, shadow and palette
// tokens. The host applies it on body for both schemes; removing it restores
// host values. Stroked elevations need a stylesheet instead (elevation.ts).
export const FLUENT_TOKENS: TokenOverrides = Object.freeze({ ...FLUENT_SHAPE, ...FLUENT_SHADOWS, ...FLUENT_PALETTE });

export function createFluentTheme(theme: ThemeService | undefined): Feature<boolean> {
  let remove: Dispose | null = null;
  return {
    update(enabled) {
      if (enabled && !remove && typeof theme?.overrideTokens === 'function') {
        remove = theme.overrideTokens(PLUGIN_ID, FLUENT_TOKENS);
      } else if (!enabled && remove) {
        const dispose = remove; remove = null; dispose();
      }
    },
    dispose() {
      const dispose = remove; remove = null; dispose?.();
    },
  };
}
