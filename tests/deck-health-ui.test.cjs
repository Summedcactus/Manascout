/* Controller/DOM behaviour only; no native browser or visual claims. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {mount}=require('./helpers/studio-dom.cjs'),{identityFixture,fakeClient}=require('./helpers/deck-identity.cjs'),{MemoryStorage}=require('./helpers/memory-storage.cjs'),store=require('../assets/js/deck-store.js');
async function until(fn){for(let i=0;i<1000&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert.ok(fn(),'Expected controller state did not settle');}
async function start(t,{index=0,storage=new MemoryStorage(),narrow=true}={}){
 const f=identityFixture(index),client=Object.assign(fakeClient(f),{printing:async s=>{const c=f.records.find(c=>c.id===s.id);return c?{...c,finish:s.requestedFinish||c.finish}:c;},clearProofs(){},autocomplete:async()=>[],search:async()=>({cards:f.records,nextPage:'',total:f.records.length})});
 const s=mount({client,storage,narrow,search:`?printing=${f.commander.id}&finish=foil`});t.after(s.cleanup);await until(()=>!s.el('preview-commander').disabled);await s.el('preview-commander').emit('click');await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100',s.el('generation-status').textContent);return {s,f,client,storage};
}
const chip=(s,key)=>s.el('deck-filters').querySelector(`[data-filter="${key}"]`);
const visibleMain=s=>s.el('deck-entries').querySelectorAll('.ds-deck-entry').filter(e=>e.dataset.zone==='main'&&!e.hidden);
test('generated health is compact, collapsed and shows actual theme/infrastructure targets',async t=>{
 const {s}=await start(t);assert.equal(s.el('deck-health').hidden,false);assert.equal(s.el('deck-health').open,false);assert.equal(s.el('health-state').textContent,'Healthy');assert.match(s.el('health-theme').textContent,/Vampires/);assert.match(s.el('health-theme').textContent,/28\+/);assert.match(s.el('health-infrastructure').textContent,/Ramp/);assert.match(s.el('health-brief').textContent,/Theme: Meets target/);assert.ok(!s.el('deck-filters').hidden);assert.ok(chip(s,'tribal:vampire'));assert.equal(chip(s,'spellPayoff'),null);assert.equal(chip(s,'landPayoff'),null);
});
test('filters hide correct main-deck entries in place and pin commander, exact printing and selection',async t=>{
 const {s,f}=await start(t),grid=s.el('deck-entries').querySelector('.ds-card-grid'),art=s.el('deck-entries').querySelector('img'),name=s.el('preview-name').textContent;
 await chip(s,'land').emit('click');assert.ok(visibleMain(s).every(e=>e.dataset.roles.split(' ').includes('land')));assert.ok(!s.el('deck-entries').querySelector(`[data-key="${f.commander.id}:foil:commander"]`).hidden);assert.equal(s.el('deck-entries').querySelector('.ds-card-grid'),grid);assert.equal(s.el('deck-entries').querySelector('img'),art);assert.equal(s.el('preview-name').textContent,name);assert.equal(s.el('preview-id').textContent,f.commander.id);assert.equal(s.el('stat-count').textContent,'100 / 100');assert.match(s.el('deck-filter-status').textContent,/38 \/ 99 main-deck cards/);
 await chip(s,'tribal:vampire').emit('click');assert.ok(visibleMain(s).every(e=>e.dataset.roles.split(' ').includes('tribal:vampire')));await chip(s,'all').emit('click');assert.ok(visibleMain(s).length>30);
});
test('filter clicks never regenerate, edit the model, change settings or create different saved entries',async t=>{
 const {s,client,storage}=await start(t);await s.el('save-deck').emit('click');const before=store.createStore({storage}).loadActive().deck,calls=client.calls.length;
 for(const key of ['land','creature','ramp','draw','all'])await chip(s,key).emit('click');assert.equal(client.calls.length,calls);await s.el('save-deck').emit('click');const after=store.createStore({storage}).loadActive().deck;assert.equal(after.revision,before.revision);assert.deepEqual(after.entries,before.entries);assert.deepEqual(after.selection,before.selection);assert.deepEqual(after.generation,before.generation);
});
test('native filter buttons have selected state, touch targets and keyboard focus without a custom key trap',async t=>{
 const {s}=await start(t),b=chip(s,'ramp');b.focus();await b.emit('click');assert.equal(s.document.activeElement,b);assert.equal(b.getAttribute('aria-pressed'),'true');assert.equal(b.type,'button');assert.equal(b.getAttribute('aria-controls'),'deck-entries');assert.equal(chip(s,'all').getAttribute('aria-pressed'),'false');
});
test('removing ramp updates warnings immediately without regenerating or relying on saved counts',async t=>{
 const {s,client}=await start(t),pools=client.calls.filter(c=>c.kind==='pool').length;await chip(s,'ramp').emit('click');const keys=visibleMain(s).map(e=>e.dataset.key);
 for(const key of keys)await s.el('deck-entries').querySelector(`[data-key="${key}"][data-action="remove"]`).emit('click');assert.match(s.el('health-warnings').textContent,/Ramp: 0 \/ target 12/);assert.notEqual(s.el('health-state').textContent,'Healthy');assert.equal(chip(s,'ramp'),null);assert.equal(chip(s,'all').getAttribute('aria-pressed'),'true');assert.equal(client.calls.filter(c=>c.kind==='pool').length,pools);assert.equal(s.el('deck-health').open,false);
});
test('artwork/list switches retain the selected filter and exact-entry actions',async t=>{
 const {s}=await start(t);await chip(s,'land').emit('click');await s.el('view-list').emit('click');assert.equal(chip(s,'land').getAttribute('aria-pressed'),'true');assert.ok(visibleMain(s).every(e=>e.dataset.roles.split(' ').includes('land')));assert.equal(s.el('deck-entries').querySelector('.ds-card-grid').dataset.view,'list');await s.el('view-artwork').emit('click');assert.equal(chip(s,'land').getAttribute('aria-pressed'),'true');
});
test('renaming does not rebuild the gallery, health details or filters',async t=>{
 const {s}=await start(t),grid=s.el('deck-entries').querySelector('.ds-card-grid'),filter=chip(s,'land'),metric=s.el('health-theme').children[0];s.el('deck-name').value='New deck name';await s.el('deck-name').emit('input');assert.equal(s.el('deck-entries').querySelector('.ds-card-grid'),grid);assert.equal(chip(s,'land'),filter);assert.equal(s.el('health-theme').children[0],metric);
});
test('saved draft restore reconstructs role counts and health targets, keeping the health panel initially collapsed',async t=>{
 const {s,client,storage}=await start(t);await s.el('save-deck').emit('click');const before=s.el('health-theme').textContent,again=mount({client,storage,narrow:true});t.after(again.cleanup);await until(()=>again.el('deck-validity').textContent==='Construction checks passed');assert.equal(again.el('health-theme').textContent,before);assert.equal(again.el('deck-health').open,false);assert.ok(chip(again,'tribal:vampire'));assert.equal(chip(again,'all').getAttribute('aria-pressed'),'true');
});
test('switching to another format preserves every card and exposes only universal filters',async t=>{
 const {s}=await start(t);await chip(s,'tribal:vampire').emit('click');const before=s.el('stat-count').textContent;s.el('deck-format').value='standard';await s.el('deck-format').emit('change');assert.equal(s.el('deck-health').hidden,true);assert.equal(chip(s,'tribal:vampire'),null);assert.equal(chip(s,'all').getAttribute('aria-pressed'),'true');assert.equal(s.el('stat-commanders').textContent,'1');assert.ok(before.includes('100'));assert.ok(s.el('deck-entries').querySelectorAll('.ds-deck-entry').length>30);
});
test('filter state survives mobile panel navigation without changing selected cards',async t=>{
 const {s}=await start(t);await chip(s,'tribal:vampire').emit('click');const id=s.el('preview-id').textContent;await s.document.querySelector('[data-panel="stats"]').emit('click');await s.document.querySelector('[data-panel="deck"]').emit('click');assert.equal(chip(s,'tribal:vampire').getAttribute('aria-pressed'),'true');assert.equal(s.el('preview-id').textContent,id);
});
test('mobile health/filter structure is bounded, scrollable and accessible; analysis dependency loads before the controller',()=>{
 const html=fs.readFileSync('deck/index.html','utf8'),css=fs.readFileSync('assets/css/deck-studio.css','utf8');assert.match(html,/<details class="ds-health" id="deck-health" hidden>/);assert.doesNotMatch(html,/<details[^>]*id="deck-health"[^>]*open/);assert.match(css,/\.ds-filter-track \{[^}]*max-width: 100%[^}]*overflow-x: auto/);assert.match(css,/\.ds-filter-chip \{[^}]*min-height: 44px/);assert.match(css,/\.ds-filter-chip\[aria-pressed="true"\]/);assert.ok(html.indexOf('deck-identity.js')<html.indexOf('deck-health.js'));assert.ok(html.indexOf('deck-health.js')<html.indexOf('deck-studio.js'));assert.doesNotMatch(html,/87\.3%|deck quality score/i);
});
test('primary/supporting style counts are visible in expanded health without imposing a new target',async t=>{
 const {s}=await start(t);assert.match(s.el('health-style-coverage').textContent,/Primary · Vampire Tribal/);assert.match(s.el('health-style-coverage').textContent,/supporting cards/);assert.equal(s.el('deck-health').open,false);
});
test('additional role counts filter cards on demand without adding a permanent universal chip list',async t=>{
 const {s,client}=await start(t),tax=require('./helpers/cards.cjs').card(9599,{type_line:'Enchantment',oracle_text:'Spells your opponents cast cost {1} more to cast.'});client.search=async()=>({cards:[tax],nextPage:'',total:1});s.el('studio-search').value='tax fixture';await s.el('studio-search-submit').emit('click');await until(()=>s.el('search-results').querySelector('[data-action="quick-add"]'));await s.el('search-results').querySelector('[data-action="quick-add"]').emit('click');assert.equal(chip(s,'stax'),null);const control=s.el('deck-health').querySelector('[data-filter="stax"]');assert.ok(control);s.el('deck-health').open=true;s.el('health-other-roles').parentElement.open=true;const grid=s.el('deck-entries').querySelector('.ds-card-grid'),calls=client.calls.length;control.focus();await control.emit('click');assert.equal(s.el('deck-health').open,false);assert.equal(s.document.activeElement,chip(s,'stax'));assert.equal(chip(s,'stax').getAttribute('aria-pressed'),'true');assert.equal(visibleMain(s).length,1);assert.ok(visibleMain(s)[0].dataset.key.startsWith(tax.id));assert.equal(s.el('deck-entries').querySelector('.ds-card-grid'),grid);assert.equal(client.calls.length,calls);await chip(s,'all').emit('click');assert.equal(chip(s,'stax'),null);
});
test('a filter that hides the focused entry returns focus to its selected chip',async t=>{
 const {s}=await start(t),entry=visibleMain(s).find(e=>!e.dataset.roles.split(' ').includes('land'));entry.querySelector('button').focus();await chip(s,'land').emit('click');assert.equal(entry.hidden,true);assert.equal(s.document.activeElement,chip(s,'land'));
});
