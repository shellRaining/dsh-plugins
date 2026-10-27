import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mount,isMermaid} from '../src/client.js';
import {themeConfig,sanitizeSvg} from '../src/theme.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await tick();}throw new Error('Timed out');}
function fixture(){const window=new Window();const d=window.document;d.documentElement.lang='zh';d.body.innerHTML='<section><div data-code-block-banner><button>复制</button></div><pre><code class="language-mermaid">flowchart LR\n A-->B</code></pre></section>';return {window,d,code:d.querySelector('code')};}
function engine(){return {calls:[],initialize(config){this.config=config;},async render(id,source){this.calls.push(source);return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><text>${source.includes('C')?'C':'B'}</text></svg>`};}};}
test('native header is hidden; two floating icon controls and original source survive; cleanup restores',async()=>{
 const {window,d}=fixture();const m=engine();const dispose=mount(d,async()=>m,1);
 await until(()=>d.querySelector('.dsh-mmd[data-state="ok"]'));
 assert.equal(d.querySelectorAll('.dsh-mmd-button').length,2);
 assert.equal(d.querySelectorAll('.dsh-mmd-bar').length,0);
 assert.equal(d.querySelector('.dsh-mmd-button').textContent,'');
 assert.equal(d.querySelectorAll('[data-code-block-banner] button').length,1);
 assert.ok(d.querySelector('[data-code-block-banner]').hasAttribute('data-dsh-mmd-banner'));
 assert.equal(d.querySelectorAll('[data-dsh-mmd-host] > .dsh-mmd-controls').length,1);
 assert.ok(d.querySelector('pre').hasAttribute('data-dsh-mmd-hidden'));
 d.querySelector('[aria-label="代码"]').click();assert.ok(!d.querySelector('pre').hasAttribute('data-dsh-mmd-hidden'));
 d.querySelector('[aria-label="图形"]').click();assert.ok(d.querySelector('pre').hasAttribute('data-dsh-mmd-hidden'));
 dispose();assert.equal(d.querySelectorAll('.dsh-mmd,.dsh-mmd-controls,style').length,0);assert.ok(!d.querySelector('pre').hasAttribute('data-dsh-mmd-hidden'));await window.happyDOM.close();
});
test('nested native surfaces and header are marked and restored without affecting other code',async()=>{
 const {window,d}=fixture();d.body.innerHTML='<section><div class="header"><div data-code-block-banner>换行 复制</div></div><div class="surface"><pre><code class="language-mermaid">flowchart LR\nA-->B</code></pre></div></section><section><pre><code class="language-js">let x=1</code></pre></section>';
 const dispose=mount(d,async()=>engine(),1);await until(()=>d.querySelector('.dsh-mmd[data-state="ok"]'));assert.equal(d.querySelectorAll('[data-dsh-mmd-host]').length,1);assert.equal(d.querySelectorAll('[data-dsh-mmd-surface]').length,2);dispose();assert.equal(d.querySelectorAll('[data-dsh-mmd-host],[data-dsh-mmd-surface],[data-dsh-mmd-banner]').length,0);await window.happyDOM.close();
});
test('streaming source invalidates old SVG and draws latest source',async()=>{
 const {window,d,code}=fixture();const m=engine();const dispose=mount(d,async()=>m,1);
 await until(()=>d.querySelector('.dsh-mmd[data-state="ok"]'));
 code.textContent='flowchart LR\n A-->C';await until(()=>m.calls.length===2 && d.querySelector('.dsh-mmd-pane text')?.textContent==='C');
 assert.equal(d.querySelector('.dsh-mmd').dataset.view,'diagram');dispose();await window.happyDOM.close();
});
test('theme changes rerender; explicit code mode persists',async()=>{
 const {window,d}=fixture();const m=engine();const dispose=mount(d,async()=>m,1);await until(()=>m.calls.length===1);
 d.querySelector('[aria-label="代码"]').click();d.body.setAttribute('data-ds-dark-theme','');await until(()=>m.calls.length===2);
 assert.equal(m.config.themeVariables.darkMode,true);assert.equal(d.querySelector('.dsh-mmd').dataset.view,'code');dispose();await window.happyDOM.close();
});
test('parse errors preserve original source and report error',async()=>{
 const {window,d}=fixture();const m=engine();m.render=async()=>{throw new Error('bad syntax');};const dispose=mount(d,async()=>m,1);
 await until(()=>d.querySelector('.dsh-mmd[data-state="error"]'));assert.ok(!d.querySelector('pre').hasAttribute('data-dsh-mmd-hidden'));assert.match(d.querySelector('.dsh-mmd-error').textContent,/bad syntax/);dispose();await window.happyDOM.close();
});
test('in-flight result cannot reinsert a disposed diagram',async()=>{
 const {window,d}=fixture();let resolve;const m=engine();m.render=()=>new Promise(r=>resolve=r);const dispose=mount(d,async()=>m,1);await until(()=>resolve);dispose();resolve({svg:'<svg xmlns="http://www.w3.org/2000/svg"/>'});await tick();assert.equal(d.querySelectorAll('.dsh-mmd').length,0);await window.happyDOM.close();
});
test('unrelated languages are not captured; source length bound',async()=>{
 const {window,d,code}=fixture();code.className='language-js';assert.equal(isMermaid(code),false);code.className='language-mermaid';code.textContent='x'.repeat(50001);const m=engine();const dispose=mount(d,async()=>m,1);await until(()=>d.querySelector('.dsh-mmd[data-state="error"]'));assert.equal(m.calls.length,0);dispose();await window.happyDOM.close();
});
test('language class changes mount and unmount without text changes',async()=>{
 const {window,d,code}=fixture();code.className='language-js';const m=engine();const dispose=mount(d,async()=>m,1);assert.equal(d.querySelector('.dsh-mmd'),null);
 code.className='language-mermaid';await until(()=>d.querySelector('.dsh-mmd[data-state="ok"]'));code.className='language-js';await until(()=>!d.querySelector('.dsh-mmd'));assert.ok(!d.querySelector('pre').hasAttribute('data-dsh-mmd-hidden'));dispose();await window.happyDOM.close();
});
test('unrelated body changes do not rerender; CSS external resources are removed',async()=>{
 const {window,d}=fixture();const m=engine();const dispose=mount(d,async()=>m,1);await until(()=>m.calls.length===1);d.body.classList.add('unrelated-modal');await tick();assert.equal(m.calls.length,1);
 const svg=sanitizeSvg(d,'<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://example.com/a.css);</style><rect style="fill:url(https://example.com/a.svg)"/><path marker-end="url(#arrow)"/></svg>');assert.equal(svg.querySelector('style'),null);assert.equal(svg.querySelector('rect').hasAttribute('style'),false);assert.equal(svg.querySelector('path').getAttribute('marker-end'),'url(#arrow)');dispose();await window.happyDOM.close();
});
test('theme resolves tokens and locks theme overrides; SVG removes external resources',async()=>{
 const {window,d}=fixture();d.body.style.setProperty('--dsw-alias-label-primary','#123456');const cfg=themeConfig(d);assert.equal(cfg.themeVariables.primaryTextColor,'#123456');assert.ok(cfg.secure.includes('themeVariables'));assert.equal(cfg.securityLevel,'strict');
 const svg=sanitizeSvg(d,'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><image href="https://example.com/x"/><foreignObject/><a href="https://example.com"><text>x</text></a></svg>');assert.equal(svg.querySelectorAll('image,foreignObject').length,0);assert.equal(svg.hasAttribute('onload'),false);assert.equal(svg.querySelector('a').hasAttribute('href'),false);await window.happyDOM.close();
});
