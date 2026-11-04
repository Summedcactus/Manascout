const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {mount}=require('./helpers/studio-dom.cjs');
const {fixture,fakeClient}=require('./helpers/generation.cjs');
const model=require('../assets/js/deck-model.js');
const store=require('../assets/js/deck-store.js');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const drain=()=>new Promise(r=>setTimeout(r,25));
async function until(fn){for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert.ok(fn(),'Expected UI state did not settle');}
function api(f,extra={}){return Object.assign(fakeClient(f,extra),{printing:async s=>{const c=f.records.find(c=>c.id===s.id);return c?{...c,finish:s.requestedFinish||c.finish}:c;},random:async()=>f.original,autocomplete:async()=>[],search:async()=>({cards:f.records,nextPage:'',total:f.records.length}),clearProofs(){}});}
async function start(t,{f=fixture(),storage=new MemoryStorage(),extra={},narrow=true,assigned=true}={}){
 const client=api(f,extra),s=mount({client,storage,narrow,search:`?printing=${f.commander.id}&finish=foil`});t.after(s.cleanup);await until(()=>!s.el('preview-commander').disabled);if(assigned)await s.el('preview-commander').emit('click');return {s,f,storage,client};
}
test('generation is hidden before role assignment; assigned selections reveal a compact action and initially collapsed options',async t=>{
 const {s}=await start(t,{assigned:false});assert.equal(s.el('generation-controls').hidden,true);await s.el('preview-commander').emit('click');assert.equal(s.el('generation-controls').hidden,false);assert.equal(s.el('generate-deck').disabled,false);assert.equal(s.el('generation-options').getAttribute('open'),undefined);assert.equal(s.el('generation-options').open,false);assert.equal(s.el('generation-custom-label').hidden,true);assert.equal(s.el('generation-bracket').value,'2');assert.equal(s.el('generation-curve').value,'balanced');assert.equal(s.el('generation-strategy').value,'auto');
});
test('manual commander generation populates normal views/statistics and survives Save Deck and reload',async t=>{
 const {s,f,storage}=await start(t);await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100');assert.equal(s.el('stat-commanders').textContent,'1');assert.equal(s.el('deck-validity').textContent,'Construction checks passed');assert.equal(s.el('card-preview').open,false);assert.match(s.el('deck-message').textContent,/Generated an? artifacts? starting deck/);await s.el('view-list').emit('click');await s.el('save-deck').emit('click');const saved=store.createStore({storage}).loadActive().deck;assert.equal(saved.entries.find(e=>e.zone==='commander').printingId,f.commander.id);assert.equal(saved.entries.find(e=>e.zone==='commander').finish,'foil');const again=mount({client:api(f),storage});t.after(again.cleanup);await until(()=>again.el('deck-validity').textContent==='Construction checks passed');assert.equal(again.el('stat-count').textContent,'100 / 100');assert.equal(again.el('deck-entries').querySelector('.ds-card-grid').dataset.view,'list');
});
test('a discovered seed follows Add to the 99 then generation without replacing the exact seed',async t=>{
 const f=fixture({seed:true}),storage=new MemoryStorage(),client=api(f),s=mount({client,storage,narrow:true});t.after(s.cleanup);await s.el('studio-discover-random').emit('click');await drain();assert.equal(s.el('generation-controls').hidden,true);await s.el('preview-add').emit('click');assert.equal(s.el('generation-controls').hidden,false);await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100');await s.el('save-deck').emit('click');const d=store.createStore({storage}).loadActive().deck;assert.ok(d.entries.some(e=>e.printingId===f.original.id&&e.zone==='main'&&e.finish===f.original.finish));assert.equal(d.selection.printingId,f.original.id);
});
test('confirmation cancel protects existing manual contents; accept checkpoints them before replacement',async t=>{
 const {s,storage}=await start(t);s.el('preview-quantity').value='2';await s.el('preview-add').emit('click');await s.el('save-deck').emit('click');const before=store.createStore({storage}).loadActive().deck;
 let pending=s.el('generate-deck').emit('click');await until(()=>s.el('draft-confirm').open);assert.match(s.el('draft-confirm-message').textContent,/contents will be replaced/);await s.el('draft-confirm-cancel').emit('click');await pending;assert.equal(s.el('stat-count').textContent,'3 / 100');
 // Add a distinct manual card; replacement still preserves only seed and commanders.
 const f=fixture();s.el('studio-search').value='fixture';await s.el('studio-search-submit').emit('click');await s.el('search-results').querySelector(`[data-key="${f.forest.id}"][data-action="quick-add"]`).emit('click');
 pending=s.el('generate-deck').emit('click');await until(()=>s.el('draft-confirm').open);await s.el('draft-confirm-accept').emit('click');await pending;assert.equal(s.el('stat-count').textContent,'100 / 100');const versions=store.createStore({storage}).versions();assert.ok(versions.some(r=>r.kind==='recovery'&&model.count(r.deck)===4));assert.equal(model.count(before),3);
});
test('API failure leaves existing entries and current selection unchanged with a retryable action',async t=>{
 const {s,storage,f}=await start(t,{extra:{fail:true}});await s.el('save-deck').emit('click');const before=store.createStore({storage}).loadActive().deck;await s.el('generate-deck').emit('click');assert.match(s.el('generation-status').textContent,/Candidate service unavailable/);assert.equal(s.el('stat-count').textContent,'1 / 100');assert.equal(s.el('preview-id').textContent,f.commander.id);assert.equal(s.el('generate-deck').disabled,false);await s.el('save-deck').emit('click');assert.deepEqual(store.createStore({storage}).loadActive().deck.entries,before.entries);
});
test('Cancel aborts generation, restores its button, and ignores a late API response',async t=>{
 let release;const gate=new Promise(r=>release=r);const {s}=await start(t,{extra:{wait:()=>gate}});const pending=s.el('generate-deck').emit('click');await until(()=>!s.el('cancel-generation').hidden);await drain();await s.el('cancel-generation').emit('click');release();await pending;assert.equal(s.el('stat-count').textContent,'1 / 100');assert.equal(s.el('cancel-generation').hidden,true);assert.equal(s.el('generate-deck').disabled,false);assert.match(s.el('generation-status').textContent,/cancelled/);
});
for(const change of ['format','name','selection','draft'])test(`late generation cannot overwrite a newer ${change}`,async t=>{
 let release;const gate=new Promise(r=>release=r);const {s}=await start(t,{extra:{wait:()=>gate}});const pending=s.el('generate-deck').emit('click');await drain();
 if(change==='format'){s.el('deck-format').value='standard';await s.el('deck-format').emit('change');}if(change==='name'){s.el('deck-name').value='Newer edit';await s.el('deck-name').emit('input');}if(change==='selection'){await s.el('studio-discover-random').emit('click');}if(change==='draft'){await s.el('new-deck').emit('click');}
 release();await pending;assert.notEqual(s.el('stat-count').textContent,'100 / 100');if(change==='format'){assert.equal(s.el('deck-format').value,'standard');assert.equal(s.el('generation-controls').hidden,true);}if(change==='name')assert.equal(s.el('deck-name').value,'Newer edit');
});
test('changing options cancels an in-flight deck; custom budget input stays disclosed only when requested',async t=>{
 let release;const gate=new Promise(r=>release=r);const {s}=await start(t,{extra:{wait:()=>gate}});const pending=s.el('generate-deck').emit('click');await drain();s.el('generation-budget').value='custom';await s.el('generation-budget').emit('change');assert.equal(s.el('generation-custom-label').hidden,false);release();await pending;assert.equal(s.el('stat-count').textContent,'1 / 100');assert.match(s.el('generation-status').textContent,/options changed/);
});
test('all other formats retain manual editing and never show generation controls',async t=>{
 const {s}=await start(t);for(const profile of require('../assets/js/deck-formats.js').profiles.filter(p=>p.id!=='commander')){s.el('deck-format').value=profile.id;await s.el('deck-format').emit('change');assert.equal(s.el('generation-controls').hidden,true);assert.equal(s.el('stat-commanders').textContent,'1');}
});
test('mobile structure keeps all options in one initially closed details within the existing drawer',()=>{
 const html=fs.readFileSync('deck/index.html','utf8'),css=fs.readFileSync('assets/css/deck-studio.css','utf8');assert.match(html,/<details id="generation-options">/);assert.doesNotMatch(html,/<details id="generation-options"[^>]*open/);assert.match(css,/\.ds-generation-fields \{[^}]*minmax\(0,1fr\)/);assert.match(css,/@media \(max-width: 360px\) \{ \.deck-studio \.ds-generation-fields \{ grid-template-columns: minmax\(0,1fr\)/);assert.match(html,/id="generation-controls"[^>]*hidden/);
});
test('recovery checkpoint failure prevents replacement instead of discarding an existing manual deck',async t=>{
 const {s,storage}=await start(t);s.el('studio-search').value='fixture';await s.el('studio-search-submit').emit('click');await s.el('search-results').querySelector('[data-action="quick-add"]').emit('click');await s.el('save-deck').emit('click');storage.setItem=()=>{throw Error('Storage full');};const pending=s.el('generate-deck').emit('click');await until(()=>s.el('draft-confirm').open);await s.el('draft-confirm-accept').emit('click');await pending;assert.equal(s.el('stat-count').textContent,'2 / 100');assert.match(s.el('generation-status').textContent,/storage is unavailable or full/);
});
test('blank custom budget cannot silently become unlimited generation',async t=>{
 const {s}=await start(t);s.el('generation-budget').value='custom';await s.el('generation-budget').emit('change');s.el('generation-custom-budget').value='';await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'1 / 100');assert.match(s.el('generation-status').textContent,/Enter a custom GBP budget/);
});
test('duplicate Generate clicks make only one job and Cancel returns keyboard focus to Generate',async t=>{
 let release;const gate=new Promise(r=>release=r);const {s,client}=await start(t,{extra:{wait:()=>gate}});const first=s.el('generate-deck').emit('click');await drain();await s.el('generate-deck').emit('click');assert.equal(client.calls.filter(c=>c.kind==='pool').length,1);await s.el('cancel-generation').emit('click');assert.equal(s.document.activeElement,s.el('generate-deck'));release();await first;assert.equal(s.el('stat-count').textContent,'1 / 100');
});
test('a cross-tab save conflict cancels pending generation and protects the active working deck',async t=>{
 let release;const gate=new Promise(r=>release=r);const {s,storage}=await start(t,{extra:{wait:()=>gate}});await s.el('save-deck').emit('click');const p=store.createStore({storage}),d=p.loadActive().deck;const pending=s.el('generate-deck').emit('click');await drain();for(const fn of s.listeners.storage)fn({key:p.pointerKey(d.id),newValue:JSON.stringify({token:'external-change'})});release();await pending;assert.equal(s.el('stat-count').textContent,'1 / 100');assert.equal(s.el('deck-state').textContent,'Save conflict');assert.match(s.el('save-status-message').textContent,/another tab/);
});
