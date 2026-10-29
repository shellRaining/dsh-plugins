// Win10 neutral surface palette: every background/fill/stroke token the host
// paints surfaces with. Text, accent, status, diff and static swatches stay
// host-owned. Canvas tokens are the page backgrounds that the wallpaper
// material clears inside the shell; everything else keeps its own fill.
import type { ThemeModes, TokenOverrides } from './host/context.ts';

const pair = (light: string, dark = light): ThemeModes => Object.freeze({ light, dark });

export const CANVAS_TOKENS = Object.freeze({
  '--dsw-alias-bg-base': pair('#ffffff', '#1f1f1f'),
  '--dsw-alias-bg-document-preview': pair('#e6e6e6', '#171717'),
  '--dsw-specific-sidebar-fill': pair('#f2f2f2', '#2b2b2b'),
} satisfies TokenOverrides);

const LAYER_TOKENS = {
  '--dsw-alias-bg-layer-1': pair('#f5f5f5', '#252525'),
  '--dsw-alias-bg-layer-2': pair('#fafafa', '#2b2b2b'),
  '--dsw-alias-bg-layer-3': pair('#ffffff', '#303030'),
  '--dsw-alias-bg-module-platform': pair('#ededed', '#333333'),
  '--dsw-alias-bg-multi-select': pair('#f2f2f2', '#262626'),
  '--dsw-alias-bg-overlay': pair('#e6e6e6', '#5c5c5c'),
  '--dsw-alias-bg-mask-drop': pair('rgb(255 255 255 / .7)', 'rgb(31 31 31 / .7)'),
  '--dsw-alias-settings-card-fill': pair('#f5f5f5', '#252525'),
  '--dsw-specific-input-major': pair('#ffffff', '#2b2b2b'),
  '--dsw-specific-login-input': pair('#f9f9f9', '#1c1c1c'),
  '--dsw-specific-selector': pair('#f2f2f2', '#333333'),
  '--dsw-specific-tip': pair('#f2f2f2', '#333333'),
  '--dsw-specific-bubble': pair('#ededed', '#2d2d2d'),
  '--dsw-specific-bubble-highlight': pair('#dedede', '#3d3d3d'),
} satisfies TokenOverrides;

const CONTENT_TOKENS = {
  '--dsw-alias-markdown-code-block': pair('#f7f7f7', '#1e1e1e'),
  '--dsw-alias-markdown-code-block-banner': pair('#efefef', '#2b2b2b'),
  '--dsw-alias-markdown-inline-code': pair('#f0f0f0', '#2d2d2d'),
  '--dsw-alias-markdown-tag': pair('#ebebeb', '#2d2d2d'),
  '--dsw-alias-markdown-placeholder': pair('#f2f2f2', '#2b2b2b'),
  '--dsw-alias-markdown-citation': pair('#e6e6e6', '#333333'),
  '--dsw-alias-markdown-code-segment-selected': pair('#ffffff', '#333333'),
  '--dsw-alias-markdown-code-segment-unselected': pair('#ebebeb', '#1e1e1e'),
  '--dsw-linear-gradient-think': pair('linear-gradient(180deg, #ffffff 20.19%, #ffffff00 100%)', 'linear-gradient(180deg, #1f1f1f 20.19%, #1f1f1f00 100%)'),
  '--dsw-linear-think-select': pair('linear-gradient(180deg, #f2f2f2 20.19%, #f2f2f200 100%)', 'linear-gradient(180deg, #262626 20.19%, #26262600 100%)'),
} satisfies TokenOverrides;

const CONTROL_TOKENS = {
  '--dsw-alias-button-elevated-fill': pair('#ffffff', '#3a3a3a'),
  '--dsw-alias-button-floating-fill': pair('#ffffff', '#2b2b2b'),
  '--dsw-alias-button-floating-hover': pair('#f2f2f2', '#333333'),
  '--dsw-alias-button-ghost-active-fill': pair('#e6e6e6', '#3d3d3d'),
  '--dsw-alias-button-ghost-active-hover': pair('#dedede', '#4d4d4d'),
  '--dsw-alias-button-ghost-active-border': pair('#999999', '#858585'),
  '--dsw-alias-button-primary-dimmed': pair('#e6e6e6', '#3d3d3d'),
  '--dsw-alias-interactive-bg-hover': pair('rgb(0 0 0 / .06)', 'rgb(255 255 255 / .08)'),
  '--dsw-alias-interactive-bg-active': pair('rgb(0 0 0 / .10)', 'rgb(255 255 255 / .12)'),
  '--dsw-alias-interactive-bg-hover-accent': pair('rgb(0 0 0 / .14)', 'rgb(255 255 255 / .22)'),
  '--dsw-alias-interactive-bg-hover-solid': pair('#ededed', '#333333'),
  '--dsw-specific-sidebar-nav-item-hover': pair('rgb(0 0 0 / .05)', 'rgb(255 255 255 / .06)'),
  '--dsw-specific-sidebar-nav-item-active': pair('rgb(0 0 0 / .09)', 'rgb(255 255 255 / .11)'),
  '--dsw-alias-turn-trigger-bg': pair('#f7f7f7', 'rgb(255 255 255 / .08)'),
  '--dsw-alias-turn-trigger-bg-hover': pair('rgb(0 0 0 / .06)', 'rgb(255 255 255 / .14)'),
  '--dsw-alias-switch-thumb': pair('#ffffff', '#cccccc'),
  '--dsw-alias-scrollbar-bg-l1': pair('#e0e0e0', '#3d3d3d'),
  '--dsw-alias-scrollbar-hover-l1': pair('#cccccc', '#555555'),
  '--dsw-alias-scrollbar-bg-l2': pair('#e0e0e0', '#555555'),
  '--dsw-alias-scrollbar-hover-l2': pair('#cccccc', '#666666'),
} satisfies TokenOverrides;

const STROKE_TOKENS = {
  '--dsw-alias-settings-card-stroke': pair('rgb(0 0 0 / .16)', 'rgb(255 255 255 / .16)'),
  '--dsw-alias-border-l1': pair('rgb(0 0 0 / .22)', 'rgb(255 255 255 / .22)'),
  '--dsw-alias-border-l2': pair('rgb(0 0 0 / .16)', 'rgb(255 255 255 / .16)'),
  '--dsw-alias-border-l3': pair('rgb(0 0 0 / .12)', 'rgb(255 255 255 / .12)'),
  '--dsw-alias-border-l4': pair('rgb(0 0 0 / .08)', 'rgb(255 255 255 / .08)'),
  '--dsw-alias-border-l2-darkmode-thin': pair('rgb(0 0 0 / .10)', 'rgb(255 255 255 / .08)'),
} satisfies TokenOverrides;

// Floating surfaces. Tooltip and hover-card text is a static white swatch,
// so their fills stay dark in both schemes.
const FLOATING_TOKENS = {
  '--dsw-menu-surface-fill': pair('rgb(248 248 248 / .88)', 'rgb(32 32 32 / .85)'),
  '--dsw-specific-menu': pair('rgb(248 248 248 / .88)', 'rgb(32 32 32 / .85)'),
  '--dsw-menu-backdrop-filter': pair('blur(24px) saturate(1.15)'),
  '--dsw-alias-menu-group-header-fill': pair('rgb(248 248 248 / .94)', 'rgb(40 40 40 / .94)'),
  '--dsw-alias-tooltip-bg': pair('#2b2b2b', '#3d3d3d'),
  '--dsw-alias-toast-bg': pair('#333333', '#3d3d3d'),
} satisfies TokenOverrides;

export const FLUENT_PALETTE: TokenOverrides = Object.freeze({
  ...CANVAS_TOKENS, ...LAYER_TOKENS, ...CONTENT_TOKENS, ...CONTROL_TOKENS, ...STROKE_TOKENS, ...FLOATING_TOKENS,
});
