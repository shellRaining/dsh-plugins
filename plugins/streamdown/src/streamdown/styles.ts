export const STREAM_FADE_DURATION = 180;

export const STREAMDOWN_ANIMATED_CLASS = 'streamdown-animated';

// Fork: upstream renders this sheet as a React 19 `<style href precedence>`
// element inside the root. React 18 cannot hoist it, and a leading <style>
// child would also break `:first-child` margin rules of the host typography,
// so the consumer installs the sheet once in <head> instead.
// Fork: reduced motion also disables the per-char fade, not only the block fade.
export const STREAMDOWN_CSS = `
@keyframes streamdown-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.${STREAMDOWN_ANIMATED_CLASS} .stream-char,
.${STREAMDOWN_ANIMATED_CLASS} .stream-block {
  opacity: 0;
  animation-name: streamdown-fade-in;
  animation-duration: ${STREAM_FADE_DURATION}ms;
  animation-timing-function: cubic-bezier(0.33, 0, 0.67, 1);
  animation-fill-mode: forwards;
}
.${STREAMDOWN_ANIMATED_CLASS} .stream-char-revealed {
  opacity: 1;
  animation: none;
}
.${STREAMDOWN_ANIMATED_CLASS} .katex-display .katex-html span {
  mask: none !important;
  animation: none !important;
}
@media (prefers-reduced-motion: reduce) {
  .${STREAMDOWN_ANIMATED_CLASS} .stream-char,
  .${STREAMDOWN_ANIMATED_CLASS} .stream-block {
    opacity: 1;
    animation: none;
  }
}
`;
