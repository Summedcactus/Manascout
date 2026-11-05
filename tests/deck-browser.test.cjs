/* Production controller/renderers with a DOM double; no native layout or focus claims. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {mount}=require('./helpers/studio-dom.cjs'),{identityFixture,fakeClient}=require('./helpers/deck-identity.cjs');
const {MemoryStorage}=require('./helpers/memory-storage.cjs'),store=require('../assets/js/deck-store.js'),model=require('../assets/js/deck-model.js');
async function until(fn){for(let i=0;i<1000&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert.ok(fn(),'Controller did not settle');}
async function start(t,index=0){
 const f=identityFixture(index),storage=new MemoryStorage(),client=Object.assign(fakeClient(f),{printing:async s=>{const c=f.records.find(c=>c.id===s.id);return c?{...c,finish:s.requestedFinish||c.finish}:c;},clearProofs(){},autocomplete:async()=>[],search:async()=>({cards:f.records,nextPage:'',total:f.records.length})});
 const s=mount({client,storage,narrow:true,search:`?printing=${f.commander.id}&finish=foil`});t.after(s.cleanup);await until(()=>!s.el('preview-commander').disabled);await s.el('preview-commander').emit('click');await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100',s.el('generation-status').textContent);return {s,f,client,storage};
}
const chip=(s,key)=>s.el('deck-filters').querySelector(`[data-filter="${key}"]`);
const entries=s=>s.el('deck-entries').querySelectorAll('.ds-deck-entry');
const button=(entry,action)=>entry.querySelector(`[data-action="${action}"]`);
const main=s=>entries(s).filter(e=>e.dataset.zone==='main');

test('quantity updates retain every existing card, image and focused action, while counts and health update',async t=>{
 const {s}=await start(t),before=entries(s),images=before.map(e=>e.querySelector('img')),entry=main(s).find(e=>e.dataset.roles.split(' ').includes('land')),plus=button(entry,'increase');
 s.el('studio-deck').scrollTop=640;plus.focus();const lands=Number(chip(s,'land').textContent.match(/\d+/)[0]),quantity=Number(entry.querySelector('.ds-entry-quantity').textContent);await plus.emit('click');
 assert.equal(Number(entry.querySelector('.ds-entry-quantity').textContent),quantity+1);assert.equal(s.document.activeElement,plus);assert.equal(s.el('studio-deck').scrollTop,640);assert.deepEqual(entries(s),before);assert.deepEqual(entries(s).map(e=>e.querySelector('img')),images);assert.equal(s.el('stat-count').textContent,'101 / 100');assert.equal(chip(s,'land').textContent,'Lands '+(lands+1));
 await button(entry,'decrease').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100');assert.equal(s.el('health-state').textContent,'Healthy');
});
test('one removed entry leaves unrelated nodes and lazy images connected and returns focus to a visible control',async t=>{
 const {s}=await start(t),all=entries(s),target=main(s).find(e=>!e.dataset.roles.split(' ').includes('land')),rest=all.filter(e=>e!==target),images=rest.map(e=>e.querySelector('img'));
 button(target,'remove').focus();await button(target,'remove').emit('click');assert.equal(target.isConnected,false);assert.deepEqual(entries(s),rest);assert.deepEqual(rest.map(e=>e.querySelector('img')),images);assert.ok(s.document.activeElement.isConnected);assert.ok(!s.document.activeElement.closest('.ds-deck-entry')?.hidden);
});
test('filters preserve nodes, exact finishes, roles, view, preview, saved revision and API request count',async t=>{
 const {s,storage,client}=await start(t);await s.el('save-deck').emit('click');const before=store.createStore({storage}).loadActive().deck,nodes=entries(s),calls=client.calls.length;
 s.el('studio-deck').scrollTop=510;s.el('deck-filter-track').scrollLeft=180;
 for(const key of ['land','tribal:vampire','ramp','draw','all']){await chip(s,key).emit('click');assert.equal(s.el('studio-deck').scrollTop,510);assert.equal(s.el('deck-filter-track').scrollLeft,180);assert.deepEqual(entries(s),nodes);assert.equal(chip(s,key).getAttribute('aria-pressed'),'true');}
 await s.el('save-deck').emit('click');const after=store.createStore({storage}).loadActive().deck;assert.deepEqual(after,before);assert.equal(client.calls.length,calls);nodes.forEach(e=>{const value=before.entries.find(x=>x.key===e.dataset.key);assert.equal(e.dataset.printingId,value.printingId);assert.equal(e.dataset.finish,value.finish);});
});
test('list/artwork toggles reuse cards, printings and filter state without losing scroll or chip position',async t=>{
 const {s}=await start(t);await chip(s,'land').emit('click');const all=entries(s),images=all.map(e=>e.querySelector('img')),printing=all.map(e=>e.querySelector('.ds-entry-printing'));
 s.el('studio-deck').scrollTop=540;s.el('deck-filter-track').scrollLeft=250;
 for(const mode of ['list','artwork']){await s.el('view-'+mode).emit('click');assert.equal(chip(s,'land').getAttribute('aria-pressed'),'true');assert.deepEqual(entries(s),all);assert.deepEqual(all.map(e=>e.querySelector('img')),images);assert.deepEqual(all.map(e=>e.querySelector('.ds-entry-printing')),printing);assert.equal(s.el('studio-deck').scrollTop,540);assert.equal(s.el('deck-filter-track').scrollLeft,250);assert.ok(s.el('deck-entries').querySelectorAll('.ds-card-grid').every(g=>g.dataset.view===mode));}
});
test('mobile Deck / Stats / Discover navigation keeps independent positions, filter, view and selection',async t=>{
 const {s}=await start(t);await chip(s,'tribal:vampire').emit('click');await s.el('view-list').emit('click');const nodes=entries(s),id=s.el('preview-id').textContent;
 s.el('studio-deck').scrollTop=720;s.el('deck-filter-track').scrollLeft=220;await s.document.querySelector('[data-panel="stats"]').emit('click');s.el('studio-stats').scrollTop=150;await s.document.querySelector('[data-panel="discover"]').emit('click');s.el('studio-discover').scrollTop=95;await s.document.querySelector('[data-panel="deck"]').emit('click');assert.equal(s.el('studio-deck').scrollTop,720);assert.equal(s.el('deck-filter-track').scrollLeft,220);assert.equal(chip(s,'tribal:vampire').getAttribute('aria-pressed'),'true');assert.equal(s.el('preview-id').textContent,id);assert.deepEqual(entries(s),nodes);assert.equal(s.el('deck-entries').querySelector('.ds-card-grid').dataset.view,'list');
 await s.document.querySelector('[data-panel="stats"]').emit('click');assert.equal(s.el('studio-stats').scrollTop,150);await s.document.querySelector('[data-panel="discover"]').emit('click');assert.equal(s.el('studio-discover').scrollTop,95);
});
test('Quick Add from Discover preserves the hidden deck scroll bookmark and active filter',async t=>{
 const {s,client,f}=await start(t);await chip(s,'land').emit('click');s.el('studio-deck').scrollTop=730;await s.document.querySelector('[data-panel="discover"]').emit('click');
 // A display:none panel can report zero scrollTop in a real browser.
 s.el('studio-deck').scrollTop=0;client.search=async()=>({cards:[f.records[1]],nextPage:'',total:1});s.el('studio-search').value=f.records[1].name;await s.el('studio-search-submit').emit('click');await until(()=>s.el('search-results').querySelector('[data-action="quick-add"]'));await s.el('search-results').querySelector('[data-action="quick-add"]').emit('click');assert.equal(s.el('studio-deck').hidden,true);await s.el('search-results').querySelector('[data-action="inspect-search"]').emit('click');assert.equal(s.el('card-preview').open,true);assert.equal(s.el('preview-id').textContent,f.records[1].id);await s.el('close-preview').emit('click');client.random=async()=>f.records[2];await s.el('studio-discover-random').emit('click');assert.equal(s.el('card-preview').open,true);assert.equal(s.el('preview-id').textContent,f.records[2].id);await s.el('close-preview').emit('click');await s.document.querySelector('[data-panel="deck"]').emit('click');assert.equal(s.el('studio-deck').scrollTop,730);assert.equal(chip(s,'land').getAttribute('aria-pressed'),'true');assert.equal(s.el('stat-count').textContent,'101 / 100');
});
test('preview open/close leaves the selected printing, card DOM, filters and browse position intact',async t=>{
 const {s}=await start(t);await chip(s,'draw').emit('click');const selected=main(s).find(e=>!e.hidden),inspect=button(selected,'inspect-entry');s.el('studio-deck').scrollTop=410;await inspect.emit('click');assert.equal(s.el('card-preview').open,true);assert.equal(s.el('preview-id').textContent,selected.dataset.printingId);await s.el('close-preview').emit('click');assert.equal(s.document.activeElement,inspect);assert.equal(s.el('studio-deck').scrollTop,410);assert.equal(chip(s,'draw').getAttribute('aria-pressed'),'true');assert.equal(selected.isConnected,true);
});
test('Deck Health disclosure does not edit or rebuild cards; closing restores the former browse position',async t=>{
 const {s}=await start(t),nodes=entries(s),health=s.el('deck-health');assert.equal(health.open,false);s.el('studio-deck').scrollTop=320;await health.querySelector('summary').emit('click');health.open=true;await health.emit('toggle');assert.deepEqual(entries(s),nodes);assert.equal(s.el('studio-deck').scrollTop,320);
 // Simulate native layout expansion and a user scroll. No surviving anchor is on screen in this DOM double.
 for(const n of nodes)n.getBoundingClientRect=()=>({top:-100,bottom:-50});s.el('studio-deck').scrollTop=900;health.open=false;await health.emit('toggle');assert.equal(s.el('studio-deck').scrollTop,320);assert.deepEqual(entries(s),nodes);assert.equal(s.el('stat-count').textContent,'100 / 100');
});
test('a surviving visible card anchors scroll after a layout shift rather than resetting to the top',async t=>{
 const {s}=await start(t),nodes=entries(s),first=nodes[0],panel=s.el('studio-deck');let top=100;first.getBoundingClientRect=()=>({top,bottom:top+300});s.el('deck-filters').getBoundingClientRect=()=>({top:0,bottom:80});panel.getBoundingClientRect=()=>({top:0,bottom:700});panel.scrollTop=500;
 // Render method is frozen; emulate a 60px document shift caused by updated content above an anchored card.
 let reads=0;first.getBoundingClientRect=()=>{reads++;return {top:reads>2?160:100,bottom:reads>2?460:400};};
 await button(main(s).find(e=>e.dataset.roles.split(' ').includes('land')),'increase').emit('click');assert.equal(panel.scrollTop,560);assert.equal(first.isConnected,true);
});
test('filter counts exclude the command zone; filtering never hides special zones or leaves focus in a hidden card',async t=>{
 const {s}=await start(t),commander=entries(s).find(e=>e.dataset.zone==='commander'),target=main(s).find(e=>!e.dataset.roles.split(' ').includes('land'));button(target,'inspect-entry').focus();await chip(s,'land').emit('click');assert.equal(commander.hidden,false);assert.equal(target.hidden,true);assert.equal(s.document.activeElement,chip(s,'land'));const visible=main(s).filter(e=>!e.hidden).reduce((n,e)=>n+Number(e.querySelector('.ds-entry-quantity').textContent),0);assert.equal(chip(s,'land').textContent,'Lands '+visible);assert.match(s.el('deck-filter-status').textContent,new RegExp(visible+' / 99 main-deck cards'));assert.equal(s.el('stat-count').textContent,'100 / 100');
});
test('restored generated draft retains exact printing/finish, list preference and classification',async t=>{
 const {s,storage,client}=await start(t);await s.el('view-list').emit('click');await s.el('save-deck').emit('click');const saved=store.createStore({storage}).loadActive().deck;
 const reopened=mount({client,storage,narrow:true});t.after(reopened.cleanup);await until(()=>reopened.el('deck-validity').textContent==='Construction checks passed');assert.equal(reopened.el('deck-health').open,false);assert.equal(reopened.el('deck-entries').querySelector('.ds-card-grid').dataset.view,'list');assert.equal(chip(reopened,'tribal:vampire').textContent,chip(s,'tribal:vampire').textContent);entries(reopened).forEach(e=>{const record=saved.entries.find(x=>x.key===e.dataset.key),card=saved.cards[record.printingId];assert.equal(e.dataset.printingId,record.printingId);assert.equal(e.dataset.finish,record.finish);assert.equal(e.querySelector('.ds-entry-meta').textContent,`${card.setCode} #${card.collectorNumber} · ${record.finish}`);});
});
test('printing metadata is an updatable subcomponent; same-key refresh preserves artwork and actions',async t=>{
 const {s,storage}=await start(t);await s.el('save-deck').emit('click');const saved=store.createStore({storage}).loadActive().deck,entry=saved.entries.find(e=>e.zone==='main'),container=s.el('deck-entries'),article=entries(s).find(e=>e.dataset.key===entry.key),printing=article.querySelector('.ds-entry-printing'),inspect=button(article,'inspect-entry'),img=article.querySelector('img');
 const next={...saved,cards:{...saved.cards,[entry.printingId]:{...saved.cards[entry.printingId],setCode:'TEST',collectorNumber:'42'}}};s.window.ManaScoutDeckView.renderEntries(next,container,{isVerified:()=>true});assert.equal(entries(s).find(e=>e.dataset.key===entry.key),article);assert.equal(article.querySelector('.ds-entry-printing'),printing);assert.equal(button(article,'inspect-entry'),inspect);assert.equal(article.querySelector('img'),img);assert.equal(printing.textContent,`TEST #42 · ${entry.finish}`);assert.equal(printing.dataset.printingId,entry.printingId);assert.match(inspect.getAttribute('aria-label'),/TEST #42/);assert.ok(!article.querySelector('[data-action="change-printing"]'));
});
test('new exact printing key replaces only its own card; filters use existing health keys and original model',async t=>{
 const {s,storage}=await start(t);await s.el('save-deck').emit('click');const original=store.createStore({storage}).loadActive().deck,entry=original.entries.find(e=>e.zone==='main'),old=entries(s).find(e=>e.dataset.key===entry.key),other=entries(s).find(e=>e.dataset.zone==='commander');
 const newCard={...original.cards[entry.printingId],id:'abcdef12-1234-4123-8123-abcdef123456',setCode:'TEST',collectorNumber:'88'},next=model.add(model.setQuantity(original,entry.key,0),newCard,{quantity:entry.quantity,finish:entry.finish});
 s.window.ManaScoutDeckView.renderEntries(next,s.el('deck-entries'),{isVerified:()=>true},s.window.ManaScoutDeckHealth.analyse(next));assert.equal(old.isConnected,false);assert.equal(other.isConnected,true);assert.ok(entries(s).some(e=>e.dataset.printingId===newCard.id));assert.deepEqual(original,store.createStore({storage}).loadActive().deck);
});
for(const [index,name]of [[1,'tokens'],[2,'artifacts'],[3,'spellslinger'],[4,'graveyard'],[5,'landfall']])test(`${name} generation, current commander verification and dynamic filtering survive browser changes`,async t=>{
 const {s,f,client}=await start(t,index);assert.equal(s.el('deck-validity').textContent,'Construction checks passed');assert.equal(client.isVerified(f.commander),true);assert.ok(entries(s).find(e=>e.dataset.zone==='commander').dataset.key.includes(f.commander.id));
 const strategy=s.el('deck-filter-strategy').querySelector('button');assert.ok(strategy);const nodes=entries(s),calls=client.calls.length;await strategy.emit('click');assert.equal(strategy.getAttribute('aria-pressed'),'true');assert.deepEqual(entries(s),nodes);await s.el('view-list').emit('click');assert.equal(chip(s,strategy.dataset.filter).getAttribute('aria-pressed'),'true');assert.equal(client.calls.length,calls);assert.equal(s.el('stat-count').textContent,'100 / 100');
});
