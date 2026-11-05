/* Controller/DOM regression tests; no browser rendering claims. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {mount}=require('./helpers/studio-dom.cjs');
const {identityFixture,fakeClient}=require('./helpers/deck-identity.cjs');
const store=require('../assets/js/deck-store.js'),{MemoryStorage}=require('./helpers/memory-storage.cjs');
async function start(t,extra={}){
 const f=identityFixture(),storage=new MemoryStorage(),client=Object.assign(fakeClient(f,extra),{printing:async()=>f.commander,clearProofs(){},autocomplete:async()=>[],search:async()=>({cards:[],nextPage:'',total:0})}),s=mount({client,storage,search:`?printing=${f.commander.id}&finish=foil`,narrow:true});t.after(s.cleanup);
 for(let i=0;i<100&&s.el('preview-commander').disabled;i++)await new Promise(r=>setTimeout(r,5));assert.equal(s.el('preview-commander').disabled,false);await s.el('preview-commander').emit('click');return {f,s,storage,client};
}
test('assigned commander reveals only relevant styles; default primary is inferred and priorities stay collapsed',async t=>{
 const {s}=await start(t);const p=s.el('generation-strategy');assert.match(p.querySelector('option').textContent,/Vampire Tribal/);assert.ok(p.querySelectorAll('option').length<=8);assert.ok(!p.querySelectorAll('option').some(x=>x.value==='vehicles'||x.value==='poison'));assert.equal(s.el('generation-options').open,false);for(const k of ['secondary','tertiary','ramp','draw','removal','wipes','protection','tutors','combo','adherence'])assert.ok(s.el('generation-options').contains(s.el('generation-'+k)));assert.equal(s.el('generation-tutors').value,'none');assert.equal(s.el('generation-combo').value,'none');assert.equal(s.el('generation-adherence').value,'balanced');
});
test('user style and priority choices reach generation and the existing local draft store',async t=>{
 const {s,storage}=await start(t);s.el('generation-secondary').value='tokens';await s.el('generation-secondary').emit('change');s.el('generation-removal').value='heavy';await s.el('generation-removal').emit('change');s.el('generation-adherence').value='strict';await s.el('generation-adherence').emit('change');await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100');await s.el('save-deck').emit('click');const saved=store.createStore({storage}).loadActive().deck;assert.equal(saved.generation.primaryStyle,'tribal:vampire');assert.equal(saved.generation.secondaryStyle,'tokens');assert.equal(saved.generation.priorities.removal,'heavy');assert.ok(saved.generation.counts.interaction>=16&&saved.generation.counts['tribal:vampire']>=36);
});
test('changing the primary style clears duplicate supporting selections',async t=>{
 const {s}=await start(t);s.el('generation-secondary').value='tokens';await s.el('generation-secondary').emit('change');s.el('generation-strategy').value='tokens';await s.el('generation-strategy').emit('change');assert.equal(s.el('generation-secondary').value,'');assert.ok(!s.el('generation-secondary').querySelectorAll('option').some(x=>x.value==='tokens'));
});
test('priority and style changes cancel in-flight generation and ignore late candidate responses',async t=>{
 let release;const gate=new Promise(r=>release=r);const {s}=await start(t,{wait:()=>gate});const pending=s.el('generate-deck').emit('click');await new Promise(r=>setTimeout(r,20));s.el('generation-removal').value='heavy';await s.el('generation-removal').emit('change');release();await pending;assert.equal(s.el('stat-count').textContent,'1 / 100');assert.match(s.el('generation-status').textContent,/options changed/);
});
test('new identity dependency loads before generator; responsive controls retain scoped minimum widths and touch targets',()=>{
 const html=fs.readFileSync('deck/index.html','utf8'),css=fs.readFileSync('assets/css/deck-studio.css','utf8');assert.ok(html.indexOf('deck-identity.js')<html.indexOf('deck-generator.js'));assert.match(css,/\.ds-priorities \{ min-width: 0/);assert.match(css,/min-height: 44px/);assert.match(css,/@media \(max-width: 360px\)/);assert.doesNotMatch(html,/<details id="generation-options"[^>]*open/);
});
test('generated identity preferences restore through the existing draft reload path',async t=>{
 const {s,storage,client}=await start(t);s.el('generation-strategy').value='aristocrats';await s.el('generation-strategy').emit('change');s.el('generation-secondary').value='tribal:vampire';await s.el('generation-secondary').emit('change');s.el('generation-removal').value='light';await s.el('generation-removal').emit('change');await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100');await s.el('save-deck').emit('click');const again=mount({client,storage,narrow:true});t.after(again.cleanup);for(let i=0;i<100&&again.el('stat-count').textContent!=='100 / 100';i++)await new Promise(r=>setTimeout(r,5));assert.equal(again.el('generation-strategy').value,'aristocrats');assert.equal(again.el('generation-secondary').value,'tribal:vampire');assert.equal(again.el('generation-removal').value,'light');assert.ok(!again.el('generation-tertiary').querySelectorAll('option').some(x=>x.value==='tribal:vampire'));assert.equal(again.el('generation-options').open,false);
});
