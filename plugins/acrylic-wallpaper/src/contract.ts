// Public contract for other plugins. Win10 mode adapts any UI styled with the
// host's --dsw-* tokens (palette, radius, elevation) on its own; these names
// cover what tokens cannot, and stay stable across versions.
// - body[data-acrylic-fluent]: present while Win10 mode is on. Key Win10-only
//   rules off it.
// - body[data-acrylic-wallpaper]: present while the wallpaper shows behind the
//   app. Surfaces painted with the canvas tokens are already transparent then.
// - [data-acrylic-popup] on the root of a self-drawn popup: it gets the Win10
//   enter and exit motion. "flyout" (the default) slides from the trigger,
//   "dialog" zooms and fades, "tooltip" fades. Mount the root to open it and
//   remove it from the DOM to close it.
// - [data-acrylic-no-reveal] on a control or container: no reveal light on it
//   or anything inside it.
export const FLUENT_MARKER = 'data-acrylic-fluent';
export const WALLPAPER_MARKER = 'data-acrylic-wallpaper';
export const POPUP_ATTRIBUTE = 'data-acrylic-popup';
export const NO_REVEAL_ATTRIBUTE = 'data-acrylic-no-reveal';

export type PopupKind = 'flyout' | 'dialog' | 'tooltip';
