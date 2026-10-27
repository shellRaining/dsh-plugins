import { FLUENT_MARKER } from './contract.ts';
import type { Snapshot } from './controller.ts';
import type { Feature } from './feature.ts';
import type { ThemeService } from './host/context.ts';
import { createHostModules } from './host/modules.ts';
import { createFluentTheme } from './theme.ts';
import { createAdapters } from './adapters.ts';
import { createElevation } from './elevation.ts';
import { createMotion } from './motion.ts';
import { createReveal } from './reveal.ts';
import { createWallpaper } from './wallpaper.ts';

// Maps a controller snapshot onto the feature modules. Body markers are the
// only shared switches, and public ones (contract.ts): data-acrylic-fluent
// (Win10 mode, owned here) and data-acrylic-wallpaper (owned by the wallpaper
// while its layer is shown).
export function createAppearance(document: Document, window: Window & typeof globalThis, theme: ThemeService | undefined): Feature<Snapshot | null> {
  const modules = createHostModules(document, window);
  const fluent = createFluentTheme(theme);
  const adapters = createAdapters(document, modules);
  const elevation = createElevation(document);
  const reveal = createReveal(document, window, modules);
  const motion = createMotion(document, window, { onSettle: reveal.refresh });
  const wallpaper = createWallpaper(document, window);
  // Contrast and transparency preferences switch the whole material off.
  const media = [window.matchMedia('(forced-colors: active)'), window.matchMedia('(prefers-reduced-transparency: reduce)')];
  let snapshot: Snapshot | null = null;
  let disposed = false;
  function render() {
    if (disposed) return;
    const settings = snapshot?.settings;
    const on = Boolean(settings?.enabled && !media.some(query => query.matches));
    const win10 = Boolean(on && settings?.fluent);
    document.body.toggleAttribute(FLUENT_MARKER, win10);
    fluent.update(win10);
    adapters.update(win10);
    elevation.update(win10);
    motion.update(win10);
    reveal.update(Boolean(win10 && settings?.reveal));
    wallpaper.update(on && snapshot?.url && settings ? { url: snapshot.url, settings } : null);
  }
  media.forEach(query => query.addEventListener('change', render));
  return {
    update(next) { snapshot = next; render(); },
    dispose() {
      disposed = true;
      media.forEach(query => query.removeEventListener('change', render));
      for (const feature of [fluent, adapters, elevation, motion, reveal, wallpaper]) feature.dispose();
      modules.dispose();
      document.body.removeAttribute(FLUENT_MARKER);
      snapshot = null;
    },
  };
}
