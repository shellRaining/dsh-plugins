import { suspendUnanchoredHas } from './host-css.js';
import { css } from './styles.js';
import { themeConfig, sanitizeSvg } from './theme.js';

export const inject: string[] = [];
type View = 'code' | 'diagram';
interface MermaidRuntime {
  initialize(config: ReturnType<typeof themeConfig>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}
interface EffectContext {
  effect(callback: () => (() => void) | undefined): unknown;
}
interface BlockState {
  code: Element;
  pre: HTMLPreElement;
  wrapper: HTMLDivElement;
  controls: HTMLDivElement;
  pane: HTMLDivElement;
  error: HTMLDivElement;
  status: HTMLDivElement;
  buttons: Partial<Record<View, HTMLButtonElement>>;
  copy: HTMLButtonElement;
  copyTimer: number | null;
  /** Observed elements (pre or wrapper) currently near the viewport. */
  near: Set<Element>;
  timer: number | null;
  generation: number;
  source: string | null;
  revision: number;
  view: View;
  userChoice: View | null;
  host: HTMLElement;
  banner: Element | null;
  surfaces: HTMLElement[];
}
const TYPES = new Set('flowchart graph sequenceDiagram classDiagram stateDiagram stateDiagram-v2 erDiagram gantt pie journey timeline mindmap gitGraph quadrantChart requirementDiagram C4Context C4Container C4Component C4Dynamic C4Deployment block-beta packet-beta architecture-beta sankey-beta xychart-beta'.split(' '));
export function isMermaid(code: Element) {
  if(!code.closest('pre') || code.closest('[data-dsh-mmd-owned]')) return false;
  const languages = [...code.classList].filter(name=>name.startsWith('language-'));
  if(languages.length) return languages.some(name=>/^language-(mermaid|mermaidjs|mmd)$/i.test(name));
  return TYPES.has((code.textContent || '').trim().match(/^([\w-]+)/)?.[1] ?? '');
}
const ICONS = {
  code:'<path d="m8 5-7 7 7 7m8-14 7 7-7 7m-3-18-2 22"/>',
  diagram:'<rect x="8" y="2" width="8" height="5" rx="1"/><rect x="1" y="17" width="8" height="5" rx="1"/><rect x="15" y="17" width="8" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  copied:'<path d="M20 6 9 17l-5-5"/>',
};
const icon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
// Start rendering shortly before a block scrolls in. scrollMargin extends the
// clip of the conversation scroller; rootMargin only extends the page viewport.
const NEAR = '300px 0px';
const COPIED_MS = 1000;
const CACHE_LIMIT = 32;
let unique = 0;
let runtime: Promise<MermaidRuntime> | null;
function loadRuntime() {
  return runtime ||= import('mermaid').then(m=>m.default).catch(error=>{runtime=null;throw error;});
}
async function copyText(document: Document, text: string) {
  const window = document.defaultView;
  if(!window) return false;
  if(window.navigator.clipboard && window.isSecureContext) {
    try {await window.navigator.clipboard.writeText(text);return true;}
    catch {/* Electron may deny the async API without focus; fall back. */}
  }
  const active = document.activeElement;
  const area = document.createElement('textarea');
  area.value = text; area.readOnly = true; area.dataset.dshMmdOwned = '';
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.append(area);
  try {area.select();return document.execCommand('copy');}
  catch {return false;}
  finally {area.remove();if(active instanceof window.HTMLElement) active.focus({preventScroll:true});}
}

export function mount(document: Document, load: () => Promise<MermaidRuntime> = loadRuntime, delay = 450) {
  const view = document.defaultView;
  if (!view) throw new Error('Mermaid requires a browser document');
  const window = view;
  let disposed = false, active = false, themeRevision = 0;
  const states = new Map<Element, BlockState>(), queue = new Set<BlockState>();
  const targets = new Map<Element, BlockState>();
  // Rendered SVG by source for the current theme; remounted blocks skip Mermaid.
  const cache = new Map<string, {id: string; svg: string}>();
  const viewport = new window.IntersectionObserver(entries=>{
    const touched = new Set<BlockState>();
    for(const entry of entries) {
      const state = targets.get(entry.target);if(!state) continue;
      if(entry.isIntersecting) state.near.add(entry.target);else state.near.delete(entry.target);
      touched.add(state);
    }
    for(const state of touched) if(state.near.size) request(state);else queue.delete(state);
  },{rootMargin:NEAR,scrollMargin:NEAR});
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-mermaid'; style.textContent = css; document.head.append(style);
  const chinese = () => (document.documentElement.lang || window.navigator.language).toLowerCase().startsWith('zh');
  const label = (mode: string) => chinese() ? (mode==='code'?'代码':'图形') : (mode==='code'?'Code':'Diagram');
  const copyLabel = (copied: boolean) => chinese() ? (copied?'已复制':'复制源代码') : (copied?'Copied':'Copy source');
  const loading = () => chinese()?'正在绘制图表…':'Rendering diagram…';

  function setView(state: BlockState, view: View) {
    state.view = view;
    state.pre.toggleAttribute('data-dsh-mmd-hidden',view==='diagram');
    state.pane.hidden = view==='code';
    state.wrapper.hidden = view==='code' && !state.error.textContent;
    state.host.dataset.dshMmdView = view;
    state.wrapper.dataset.view = view;
    for(const [mode,button] of Object.entries(state.buttons)) button.setAttribute('aria-pressed',String(view===mode));
  }
  function localize(state: BlockState) {
    state.controls.setAttribute('aria-label',chinese()?'Mermaid 图表操作':'Mermaid diagram actions');
    for(const [mode,button] of Object.entries(state.buttons)) {
      button.title=label(mode); button.setAttribute('aria-label',label(mode));
    }
    const copy=copyLabel(state.copyTimer!==null);
    state.copy.title=copy; state.copy.setAttribute('aria-label',copy);
  }
  function showCopied(state: BlockState, copied: boolean) {
    window.clearTimeout(state.copyTimer ?? undefined);
    state.copyTimer=copied?window.setTimeout(()=>showCopied(state,false),COPIED_MS):null;
    state.copy.innerHTML=icon(copied?ICONS.copied:ICONS.copy);
    localize(state);
  }
  function invalidate(state: BlockState) {
    window.clearTimeout(state.timer ?? undefined); queue.delete(state); state.generation++;
    // Never leave a previous source's diagram displayed during streaming.
    if(state.source !== state.code.textContent) {state.pane.replaceChildren();state.error.textContent='';setView(state,'code');}
    state.timer = window.setTimeout(()=>{state.timer=null;request(state);},delay);
  }
  // Only blocks near the viewport enter the render queue. The edit debounce
  // still applies unless a cached result already matches the current source.
  function request(state: BlockState) {
    if(!state.near.size || states.get(state.code)!==state) return;
    if(state.timer!==null) {
      if(!cache.has(state.code.textContent || '')) return;
      window.clearTimeout(state.timer);state.timer=null;
    }
    queue.add(state);drain();
  }
  function valid(state: BlockState,generation: number,source: string,revision: number) {
    return !disposed && states.get(state.code)===state && state.code.isConnected && state.wrapper.isConnected && generation===state.generation && source===state.code.textContent && revision===themeRevision;
  }
  async function render(state: BlockState) {
    const source=state.code.textContent || '', generation=state.generation, revision=themeRevision;
    if(!source.trim() || !valid(state,generation,source,revision)) return;
    if(state.source===source && state.revision===revision && state.pane.querySelector('svg')) return;
    state.status.textContent=loading();state.wrapper.dataset.state='loading';
    try {
      if(source.length>50000 || source.split('\n',2002).length>2000) throw new Error(chinese()?'图表超过 50,000 字符或 2,000 行限制':'Diagram exceeds 50,000 characters or 2,000 lines');
      let rendered=cache.get(source);
      if(rendered) {cache.delete(source);cache.set(source,rendered);}
      else {
        const mermaid=await load();
        if(!valid(state,generation,source,revision)) return;
        const id=`dsh-mmd-acrylic-${Date.now()}-${++unique}`;
        // Theme probing and Mermaid's text measurement both insert then read layout.
        const restore=suspendUnanchoredHas(document);
        let svg: string;
        try {mermaid.initialize(themeConfig(document));({svg}=await mermaid.render(id,source));}
        finally {restore();}
        if(!valid(state,generation,source,revision)) return;
        rendered={id,svg};cache.set(source,rendered);
        for(const key of cache.keys()) {if(cache.size<=CACHE_LIMIT) break;cache.delete(key);}
      }
      // Every inserted copy gets its own ids for markers and scoped styles.
      const result=sanitizeSvg(document,rendered.svg.replaceAll(rendered.id,`dsh-mmd-acrylic-${Date.now()}-${++unique}`));
      result.setAttribute('role','img');
      if(!result.hasAttribute('aria-label') && !result.hasAttribute('aria-labelledby')) result.setAttribute('aria-label','Mermaid '+label('diagram'));
      state.pane.replaceChildren(result);state.source=source;state.revision=revision;
      state.error.textContent='';state.error.hidden=true;state.wrapper.dataset.state='ok';state.status.textContent='';
      setView(state,state.userChoice || 'diagram');
    } catch(error) {
      if(!valid(state,generation,source,revision)) return;
      state.wrapper.dataset.state='error';state.pane.replaceChildren();
      state.error.textContent=(chinese()?'图表未能渲染，已保留源码：':'Could not render diagram; source preserved: ')+String(error instanceof Error ? error.message : error).slice(0,1000);
      state.error.hidden=false;state.status.textContent=state.error.textContent;setView(state,'code');
    }
  }
  async function drain() {
    if(active || disposed) return;
    active=true;
    try {
      while(queue.size && !disposed) {
        const state=queue.values().next().value;if (!state) break;queue.delete(state);
        if(states.get(state.code)===state) await render(state);
        await new Promise<void>(resolve=>window.setTimeout(resolve,0));
      }
    } finally {active=false;}
  }
  function cleanup(state: BlockState) {
    window.clearTimeout(state.timer ?? undefined);window.clearTimeout(state.copyTimer ?? undefined);state.generation++;queue.delete(state);
    for(const target of [state.pre,state.wrapper]) {viewport.unobserve(target);targets.delete(target);}
    state.pre.removeAttribute('data-dsh-mmd-hidden');state.controls.remove();state.wrapper.remove();
    for(const element of state.surfaces) element.removeAttribute('data-dsh-mmd-surface');
    state.banner?.removeAttribute('data-dsh-mmd-banner');
    state.host.removeAttribute('data-dsh-mmd-host');state.host.removeAttribute('data-dsh-mmd-view');
    states.delete(state.code);
  }
  function mountCode(code: Element) {
    if(states.has(code) || !isMermaid(code)) return;
    const pre=code.closest('pre');if(!pre?.parentElement) return;
    const wrapper=document.createElement('div');wrapper.className='dsh-mmd';wrapper.dataset.dshMmdOwned='';
    const controls=document.createElement('div');controls.className='dsh-mmd-controls';controls.dataset.dshMmdOwned='';controls.setAttribute('role','group');
    const pane=document.createElement('div');pane.className='dsh-mmd-pane';
    const error=document.createElement('div');error.className='dsh-mmd-error';error.hidden=true;
    const status=document.createElement('div');status.className='dsh-mmd-status';status.setAttribute('role','status');
    const copy=document.createElement('button');copy.type='button';copy.className='dsh-mmd-button';copy.innerHTML=icon(ICONS.copy);
    const state: BlockState={code,pre,wrapper,controls,pane,error,status,buttons:{},copy,copyTimer:null,near:new Set(),timer:null,generation:0,source:null,revision:-1,view:'code',userChoice:null,host:pre.parentElement,banner:null,surfaces:[]};
    for(const mode of ['code','diagram'] as const) {
      const button=document.createElement('button');button.type='button';button.className='dsh-mmd-button';
      button.innerHTML=icon(ICONS[mode]);
      button.addEventListener('click',()=>{
        state.userChoice=mode;setView(state,mode);
        if(mode==='diagram' && !state.pane.querySelector('svg')) {state.pane.textContent=loading();invalidate(state);}
      });
      state.buttons[mode]=button;controls.append(button);
    }
    // The native header (and its copy button) is hidden, so copying lives here.
    copy.addEventListener('click',()=>{
      void copyText(document,state.code.textContent || '').then(ok=>{if(ok && states.get(code)===state) showCopied(state,true);});
    });
    const divider=document.createElement('span');divider.className='dsh-mmd-divider';divider.setAttribute('aria-hidden','true');
    controls.append(divider,copy);
    // Hide the entire native header (wrap/copy/title), not just its contents.
    // Keep React's nodes in place; owned markers are removed on disposal.
    let ancestor: HTMLElement | null=pre.parentElement;
    for(let depth=0;ancestor && depth<3;depth++,ancestor=ancestor.parentElement) {
      if(ancestor.querySelectorAll('pre').length!==1) break;
      const banner=ancestor.querySelector('[data-code-block-banner]');
      if(banner){state.host=ancestor;state.banner=banner;break;}
    }
    state.host.setAttribute('data-dsh-mmd-host','');
    state.banner?.setAttribute('data-dsh-mmd-banner','');
    for(let element: HTMLElement | null=pre.parentElement;element;element=element.parentElement) {
      element.setAttribute('data-dsh-mmd-surface','');state.surfaces.push(element);
      if(element===state.host) break;
    }
    state.host.append(controls);
    wrapper.append(pane,error,status);pre.before(wrapper);states.set(code,state);
    localize(state);setView(state,'code');invalidate(state);
    // Code view shows the pre and diagram view shows the wrapper; watch both.
    for(const target of [pre,wrapper]) {targets.set(target,state);viewport.observe(target);}
  }
  function discover(root: Node) {
    if(!(root instanceof window.Element) || root.closest('[data-dsh-mmd-owned]')) return;
    if(root.matches('pre code')) mountCode(root);
    root.querySelectorAll('pre code').forEach(mountCode);
  }
  const observer=new window.MutationObserver(records=>{
    const changed=new Set<Element>();let removed=false;
    for(const record of records) {
      const element=record.target instanceof window.Element?record.target:record.target.parentElement;
      if(element?.closest('[data-dsh-mmd-owned]')) continue;
      const code=element?.closest('pre code');if(code) changed.add(code);
      for(const node of record.addedNodes) discover(node);
      if(record.removedNodes.length) removed=true;
    }
    for(const code of changed) {const state=states.get(code);if(state && isMermaid(code)) invalidate(state);else {if(state) cleanup(state);mountCode(code);}}
    if(removed) for(const state of states.values()) if(!state.code.isConnected || !state.wrapper.isConnected || !state.controls.isConnected) {const code=state.code;cleanup(state);if(code.isConnected) mountCode(code);}
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
  let themeFingerprint=JSON.stringify(themeConfig(document));
  const themeObserver=new window.MutationObserver(()=>{
    for(const state of states.values()) localize(state);
    const next=JSON.stringify(themeConfig(document));
    if(next===themeFingerprint) return;
    themeFingerprint=next;themeRevision++;cache.clear();
    for(const state of states.values()) invalidate(state);
  });
  themeObserver.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme','data-acrylic-wallpaper','data-acrylic-fluent','style','class']});
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang','style','class']});
  document.querySelectorAll('pre code').forEach(mountCode);
  return ()=>{disposed=true;observer.disconnect();themeObserver.disconnect();for(const state of states.values()) cleanup(state);viewport.disconnect();queue.clear();cache.clear();style.remove();};
}
export function apply(ctx: EffectContext) {ctx.effect(()=>typeof document==='undefined'?undefined:mount(document));}
