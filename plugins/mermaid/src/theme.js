// Mermaid 11 derives additional colors from hex; resolve CSS tokens first.
export function themeConfig(document) {
  const window = document.defaultView;
  const probe = document.createElement('span');
  probe.dataset.dshMmdOwned = '';
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  const dark = document.body.hasAttribute('data-ds-dark-theme');
  function color(token, fallback) {
    probe.style.color = `var(${token},${fallback})`;
    const value = window.getComputedStyle(probe).color;
    if(/^#[0-9a-f]{6}$/i.test(value)) return value;
    if(/^#[0-9a-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(c=>c+c).join('');
    const rgb = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[, ]+\s*(\d+(?:\.\d+)?)[, ]+\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*([\d.]+))?/);
    if(!rgb) return fallback;
    // Resolve alpha over a neutral canvas, not pure black/white foreground.
    const alpha = rgb[4] === undefined ? 1 : Math.min(1,Math.max(0,Number(rgb[4])));
    const canvas = dark ? 31 : 255;
    return '#' + rgb.slice(1,4).map(n => Math.round(Number(n)*alpha+canvas*(1-alpha)).toString(16).padStart(2,'0')).join('');
  }
  const bg = color('--dsw-alias-markdown-code-block',dark?'#1e1e1e':'#f7f7f7');
  const surface = color('--dsw-alias-bg-layer-2',dark?'#2b2b2b':'#fafafa');
  const text = color('--dsw-alias-label-primary',dark?'#eeeeee':'#222222');
  const line = color('--dsw-alias-label-tertiary',dark?'#aaaaaa':'#666666');
  const accent = color('--dsw-alias-state-business-primary',dark?'#79b8ff':'#0067c0');
  const border = color('--dsw-alias-border-l1',dark?'#505050':'#bbbbbb');
  const fontFamily = window.getComputedStyle(document.body).fontFamily || 'sans-serif';
  probe.remove();
  return {
    startOnLoad:false, securityLevel:'strict', suppressErrorRendering:true,
    theme:'base', maxTextSize:50000, maxEdges:2000,
    // Keep Mermaid's default secure keys, plus theme and HTML controls.
    secure:['secure','securityLevel','startOnLoad','maxTextSize','suppressErrorRendering','maxEdges','theme','themeVariables','themeCSS','htmlLabels','flowchart'],
    htmlLabels:false, flowchart:{htmlLabels:false,curve:'linear',nodeSpacing:36,rankSpacing:44,padding:14},
    themeVariables:{darkMode:dark,fontFamily,fontSize:'14px',background:bg,
      primaryColor:surface,primaryTextColor:text,primaryBorderColor:border,
      secondaryColor:bg,secondaryTextColor:text,secondaryBorderColor:line,
      tertiaryColor:surface,tertiaryTextColor:text,tertiaryBorderColor:line,
      lineColor:line,textColor:text,mainBkg:surface,nodeBorder:border,
      clusterBkg:bg,clusterBorder:border,edgeLabelBackground:bg,
      actorBkg:surface,actorBorder:border,actorTextColor:text,actorLineColor:line,
      signalColor:line,signalTextColor:text,labelBoxBkgColor:surface,labelBoxBorderColor:line,labelTextColor:text,
      noteBkgColor:bg,noteBorderColor:line,noteTextColor:text,activationBkgColor:surface,activationBorderColor:accent,
    },
  };
}

// Do not bind diagram click handlers. Remove external resources before adopting
// the SVG. This is defense-in-depth, not a network sandbox for Mermaid itself.
export function sanitizeSvg(document, source) {
  const parsed = new document.defaultView.DOMParser().parseFromString(source,'image/svg+xml');
  const svg = parsed.documentElement;
  if(svg.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('Invalid SVG');
  for(const node of svg.querySelectorAll('script,foreignObject,iframe,object,embed,image,img,audio,video')) node.remove();
  // Conservatively reject CSS escapes/imports and non-fragment URLs. This can
  // discard authored styling; it is deliberately not a complete CSS sandbox.
  const unsafeCss = value => /\\|@import|@font-face/i.test(value) || /url\s*\(/i.test(value.replace(/url\(\s*(['"]?)#[\w:.-]+\1\s*\)/gi,''));
  for(const node of svg.querySelectorAll('style')) if(unsafeCss(node.textContent || '')) node.remove();
  for(const node of [svg,...svg.querySelectorAll('*')]) {
    for(const attr of [...node.attributes]) {
      if((attr.name==='style' || /url\s*\(/i.test(attr.value)) && unsafeCss(attr.value)) {node.removeAttribute(attr.name);continue;}
      if(/^on/i.test(attr.name) || (['href','xlink:href','src'].includes(attr.name) && !attr.value.startsWith('#'))) node.removeAttribute(attr.name);
    }
  }
  return document.importNode(svg,true);
}
