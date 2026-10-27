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
};
let unique = 0;
let runtime: Promise<MermaidRuntime> | null;
function loadRuntime() {
  return runtime ||= import('mermaid').then(m=>m.default).catch(error=>{runtime=null;throw error;});
}

export function mount(document: Document, load: () => Promise<MermaidRuntime> = loadRuntime, delay = 450) {
  const view = document.defaultView;
  if (!view) throw new Error('Mermaid requires a browser document');
  const window = view;
  let disposed = false, active = false, themeRevision = 0;
  const states = new Map<Element, BlockState>(), queue = new Set<BlockState>();
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-mermaid'; style.textContent = css; document.head.append(style);
  const chinese = () => (document.documentElement.lang || window.navigator.language).toLowerCase().startsWith('zh');
  const label = (mode: string) => chinese() ? (mode==='code'?'代码':'图形') : (mode==='code'?'Code':'Diagram');
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
    state.controls.setAttribute('aria-label',chinese()?'Mermaid 显示模式':'Mermaid view mode');
    for(const [mode,button] of Object.entries(state.buttons)) {
      button.title=label(mode); button.setAttribute('aria-label',label(mode));
    }
  }
  function invalidate(state: BlockState) {
    window.clearTimeout(state.timer ?? undefined); queue.delete(state); state.generation++;
    // Never leave a previous source's diagram displayed during streaming.
    if(state.source !== state.code.textContent) {state.pane.replaceChildren();state.error.textContent='';setView(state,'code');}
    state.timer = window.setTimeout(()=>{state.timer=null;queue.add(state);drain();},delay);
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
      const mermaid=await load();
      if(!valid(state,generation,source,revision)) return;
      mermaid.initialize(themeConfig(document));
      const {svg}=await mermaid.render(`dsh-mmd-acrylic-${Date.now()}-${++unique}`,source);
      if(!valid(state,generation,source,revision)) return;
      const result=sanitizeSvg(document,svg);
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
    window.clearTimeout(state.timer ?? undefined);state.generation++;queue.delete(state);
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
    const state: BlockState={code,pre,wrapper,controls,pane,error,status,buttons:{},timer:null,generation:0,source:null,revision:-1,view:'code',userChoice:null,host:pre.parentElement,banner:null,surfaces:[]};
    for(const mode of ['code','diagram'] as const) {
      const button=document.createElement('button');button.type='button';button.className='dsh-mmd-button';
      button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[mode]}</svg>`;
      button.addEventListener('click',()=>{
        state.userChoice=mode;setView(state,mode);
        if(mode==='diagram' && !state.pane.querySelector('svg')) {state.pane.textContent=loading();invalidate(state);}
      });
      state.buttons[mode]=button;controls.append(button);
    }
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
    themeFingerprint=next;themeRevision++;
    for(const state of states.values()) invalidate(state);
  });
  themeObserver.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme','data-acrylic-wallpaper','data-acrylic-fluent','style','class']});
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang','style','class']});
  document.querySelectorAll('pre code').forEach(mountCode);
  return ()=>{disposed=true;observer.disconnect();themeObserver.disconnect();for(const state of states.values()) cleanup(state);queue.clear();style.remove();};
}
export function apply(ctx: EffectContext) {ctx.effect(()=>typeof document==='undefined'?undefined:mount(document));}
