const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mount}=require('./helpers/studio-dom.cjs');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const {card,id}=require('./helpers/cards.cjs');
const model=require('../assets/js/deck-model.js');
const formats=require('../assets/js/deck-formats.js');
const storeAPI=require('../assets/js/deck-store.js');
const drain=()=>new Promise(resolve=>setTimeout(resolve,20));
function api(cards){return {search:async()=>({cards,nextPage:'',total:cards.length}),autocomplete:async()=>[],printing:async s=>{const c=cards.find(c=>c.id===s.id);return s.requestedFinish && c.availableFinishes.includes(s.requestedFinish)?{...c,finish:s.requestedFinish}:c;},refresh:async old=>old.map(c=>cards.find(v=>v.id===c.id)).filter(Boolean),isVerified:()=>true,proof:()=>false,commanderEligibility:async()=>false,clearProofs(){}};}
async function search(s){s.el('studio-search').value='Synthetic';await s.el('studio-search-form').emit('submit');await drain();}
async function choose(s,format){s.el('deck-format').value=format;await s.el('deck-format').emit('change');}
const quick=s=>s.el('search-results').querySelector('[data-action="quick-add"]');
const inspect=(s,id)=>[...s.el('search-results').querySelectorAll('[data-action="inspect-search"]')].find(b=>b.dataset.key===id);
test('Commander is default, Standard second, and Other Formats grouped with honest unsupported rules',t=>{
 const s=mount({client:api([])});t.after(s.cleanup);const options=s.el('deck-format').querySelectorAll('option');assert.equal(s.el('deck-format').value,'commander');assert.equal(options[0].value,'commander');assert.equal(options[1].value,'standard');assert.equal(options.length,formats.profiles.length);
 assert.equal(s.el('deck-format').querySelectorAll('optgroup').length,2);assert.match(s.el('unsupported-formats').textContent,/Draft.*card-pool/);assert.match(s.el('unsupported-formats').textContent,/Competitive Brawl/);
 assert.equal(s.el('format-commander').getAttribute('aria-pressed'),'true');
});
test('deck-name edits retain artwork/list nodes and search position while autosaving the new name',async t=>{
 const storage=new MemoryStorage(),s=mount({storage,client:api([card(1)])});t.after(s.cleanup);await search(s);await quick(s).emit('click');
 const article=s.el('deck-entries').querySelector('article'),result=quick(s);s.el('deck-entries').scrollTop=77;s.el('search-results').scrollTop=123;
 for(const name of ['M','My','My deck']){s.el('deck-name').value=name;await s.el('deck-name').emit('input');assert.equal(s.el('deck-entries').querySelector('article'),article);assert.equal(quick(s),result);assert.equal(s.el('deck-entries').scrollTop,77);assert.equal(s.el('search-results').scrollTop,123);}
 await s.runTimers(800);assert.equal(storeAPI.createStore({storage}).loadActive().deck.name,'My deck');
});
test('Standard prominence, sideboard editing, switching and saving retain exact printing/finish',async t=>{
 const c=card(1),storage=new MemoryStorage(),s=mount({storage,client:api([c]),search:`?printing=${c.id}&finish=foil`});t.after(s.cleanup);await drain();await s.el('preview-add').emit('click');await s.el('format-standard').emit('click');assert.equal(s.el('deck-format').value,'standard');assert.equal(s.el('format-standard').getAttribute('aria-pressed'),'true');assert.equal(s.el('preview-commander').hidden,true);assert.equal(s.el('preview-zone').querySelector('option[value="sideboard"]').disabled,false);
 s.el('preview-zone').value='sideboard';s.el('preview-quantity').value='2';await s.el('preview-add').emit('click');await s.el('save-deck').emit('click');
 const d=storeAPI.createStore({storage}).loadActive().deck;assert.equal(d.format,'standard');assert.deepEqual(d.entries.map(e=>[e.printingId,e.finish,e.quantity,e.zone]),[[c.id,'foil',1,'main'],[c.id,'foil',2,'sideboard']]);
 await s.el('format-commander').emit('click');assert.match(s.el('deck-issues').textContent,/no sideboard/);await s.el('save-deck').emit('click');assert.deepEqual(storeAPI.createStore({storage}).loadActive().deck.entries,d.entries);
});
test('all format choices save and restore through controller without discarding existing assignments',async t=>{
 const storage=new MemoryStorage(),c=card(1),seed=model.add(model.createDeck(),c,{zone:'commander',finish:'foil'});storeAPI.createStore({storage}).save(seed);
 const s=mount({storage,client:api([c])});t.after(s.cleanup);await drain();
 for(const p of formats.profiles){await choose(s,p.id);await s.el('save-deck').emit('click');const d=storeAPI.createStore({storage}).loadActive().deck;assert.equal(d.format,p.id);assert.deepEqual(d.entries,seed.entries);assert.match(s.el('format-note').textContent,new RegExp(p.platform==='arena'?'Arena':'Paper'));}
 const reopened=mount({storage,client:api([c])});t.after(reopened.cleanup);await drain();assert.equal(reopened.el('deck-format').value,'gladiator');assert.equal(reopened.el('stat-commanders').textContent,'1');assert.match(reopened.el('deck-issues').textContent,/no command zone/);
});
test('Oathbreaker compact workflow assigns a planeswalker and its signature, persists owner, and removes safely',async t=>{
 const a=card(1,{type_line:'Legendary Planeswalker — Test',color_identity:['G']}),b=card(2,{type_line:'Instant',color_identity:['G']}),storage=new MemoryStorage(),s=mount({storage,client:api([a,b]),narrow:true});t.after(s.cleanup);
 await choose(s,'oathbreaker');await search(s);await inspect(s,a.id).emit('click');assert.equal(s.el('preview-commander').disabled,false);assert.equal(s.el('preview-commander').textContent,'Use as Oathbreaker');await s.el('preview-add').emit('click');await s.el('preview-commander').emit('click');assert.equal(s.el('stat-commanders').textContent,'1');assert.equal(s.el('stat-count').textContent,'1 / 60');
 await inspect(s,b.id).emit('click');assert.equal(s.el('signature-controls').hidden,false);assert.equal(s.el('preview-signature').disabled,false);await s.el('preview-add').emit('click');await s.el('preview-signature').emit('click');assert.equal(s.el('stat-count').textContent,'2 / 60');assert.equal(s.el('stat-signatures').textContent,'1');assert.match(s.el('deck-entries').textContent,/Signature spells/);await s.el('save-deck').emit('click');
 const d=storeAPI.createStore({storage}).loadActive().deck;assert.equal(d.entries.find(e=>e.zone==='signature').assignedTo,a.id);assert.equal(d.entries.some(e=>e.zone==='main'),false);
 await s.el('preview-remove').emit('click');assert.equal(s.el('stat-signatures').textContent,'0');assert.equal(s.el('stat-commanders').textContent,'1');assert.match(s.el('deck-issues').textContent,/one signature spell/);
});
test('Oathbreaker rejects a signature outside its owner identity without deleting an existing card',async t=>{
 const a=card(1,{type_line:'Legendary Planeswalker — Test',color_identity:['G']}),b=card(2,{type_line:'Instant',color_identity:['U']}),s=mount({client:api([a,b])});t.after(s.cleanup);await choose(s,'oathbreaker');await search(s);await inspect(s,a.id).emit('click');await s.el('preview-commander').emit('click');await inspect(s,b.id).emit('click');await s.el('preview-add').emit('click');await s.el('preview-signature').emit('click');assert.match(s.el('deck-message').textContent,/own Oathbreaker/);assert.equal(s.el('stat-count').textContent,'2 / 60');assert.equal(s.el('stat-signatures').textContent,'0');
});
test('Brawl selects a planeswalker using Brawl eligibility rather than the Commander proof',async t=>{
 const c=card(1,{type_line:'Legendary Planeswalker — Test',games:['arena'],color_identity:[]}),s=mount({client:api([c]),search:`?printing=${c.id}&finish=foil`});t.after(s.cleanup);await drain();await choose(s,'brawl');assert.equal(s.el('preview-commander').disabled,false);await s.el('preview-commander').emit('click');assert.equal(s.el('stat-commanders').textContent,'1');assert.equal(s.el('stat-count').textContent,'1 / 100');assert.match(s.el('preview-legality').textContent,/eligibility checked/);
});
test('platform change cancels obsolete results and requests Arena printing results for Quick Add',async t=>{
 const p=card(1),a=card(2,{games:['arena']}),calls=[];let finishOld;
 const client={...api([p,a]),search:(_q,options)=>{calls.push(options);if(calls.length===1)return new Promise(resolve=>finishOld=resolve);return Promise.resolve({cards:[a],nextPage:'',total:1});}};
 const storage=new MemoryStorage(),s=mount({storage,client});t.after(s.cleanup);s.el('studio-search').value='Fixture';await s.el('studio-search-form').emit('submit');await choose(s,'standard_arena');await drain();assert.equal(calls[0].signal.aborted,true);assert.equal(calls[1].format,'standard_arena');finishOld({cards:[p],nextPage:'',total:1});await drain();assert.equal(quick(s).dataset.key,a.id);await quick(s).emit('click');await s.el('save-deck').emit('click');assert.equal(storeAPI.createStore({storage}).loadActive().deck.entries[0].printingId,a.id);
});
