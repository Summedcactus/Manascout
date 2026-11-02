const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=require('../assets/js/deck-model.js');
const persistence=require('../assets/js/deck-store.js');
const {mount}=require('./helpers/studio-dom.cjs');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const {card}=require('./helpers/cards.cjs');
const drain=()=>new Promise(resolve=>setTimeout(resolve,20));
function client(cards=[card(1),card(2)],{offline=false,eligible=[]}={}) {
 const proofs=new Map(),verified=new Set(cards),byId=new Map(cards.map(c=>[c.id,c]));
 return { search:async()=>({cards,nextPage:'',total:cards.length}),autocomplete:async()=>cards.map(c=>c.name),
 printing:async s=>{if(offline)throw Error('API unavailable');const c=byId.get(s.id);if(!c)throw Error('Printing missing');const fresh=s.requestedFinish&&c.availableFinishes.includes(s.requestedFinish)?{...c,finish:s.requestedFinish}:c;verified.add(fresh);byId.set(fresh.id,fresh);return fresh;},
 isVerified:c=>verified.has(c),proof:c=>proofs.has(c.oracleId)?proofs.get(c.oracleId):null,
 commanderEligibility:async c=>{if(offline)throw Error('Eligibility unavailable');const value=eligible.includes(c.id);proofs.set(c.oracleId,value);return value;},
 refresh:async old=>{if(offline)throw Error('Refresh unavailable');return old.map(c=>byId.get(c.id)).filter(Boolean);},clearProofs:()=>proofs.clear() };
}
async function searchAdd(s) { s.el('studio-search').value='Fixture';await s.el('studio-search-form').emit('submit');await drain();await s.el('search-results').querySelector('[data-action="quick-add"]').emit('click'); }
function seed(storage,{name='Seed deck',cards=true,format='pauper'}={}) {const store=persistence.createStore({storage});let d=model.createDeck({name,format});if(cards)d=model.add(d,card());const saved=store.save(d);return {store,deck:d,token:saved.token};}

test('complete editing/save/reopen journey retains exact entries and both view modes',async t=>{
 const storage=new MemoryStorage(),cards=[card(),card(2)],s=mount({storage,client:client(cards),narrow:true});t.after(s.cleanup);
 await searchAdd(s);await s.el('search-results').querySelector('[data-action="quick-add"]').emit('click');s.el('deck-name').value='A real working draft';await s.el('deck-name').emit('input');
 s.el('deck-format').value='pauper';await s.el('deck-format').emit('change');await s.el('view-list').emit('click');await s.el('save-deck').emit('click');
 assert.equal(s.el('deck-state').textContent,'Saved locally');const store=persistence.createStore({storage}),saved=store.loadActive();assert.equal(saved.deck.entries[0].quantity,2);assert.equal(saved.deck.entries[0].printingId,cards[0].id);assert.equal(saved.deck.entries[0].finish,'nonfoil');
 const reopened=mount({storage,client:client(cards)});t.after(reopened.cleanup);await drain();assert.equal(reopened.el('deck-name').value,'A real working draft');assert.equal(reopened.el('deck-format').value,'pauper');assert.equal(reopened.el('deck-entries').querySelector('.ds-card-grid').dataset.view,'list');assert.equal(reopened.el('stat-count').textContent,'2 / 60+');
 await reopened.el('view-artwork').emit('click');assert.equal(reopened.el('deck-entries').querySelector('.ds-card-grid').dataset.view,'artwork');
});
test('autosave runs after the debounce and renaming updates the same saved identity',async t=>{
 const storage=new MemoryStorage(),s=mount({storage,client:client()});t.after(s.cleanup);s.el('deck-name').value='First name';await s.el('deck-name').emit('input');assert.equal(persistence.createStore({storage}).list().decks.length,0);
 await s.runTimers(800);const store=persistence.createStore({storage}),first=store.loadActive();assert.equal(first.deck.name,'First name');
 s.el('deck-name').value='Renamed locally';await s.el('deck-name').emit('input');await s.runTimers(800);assert.equal(store.loadActive().deck.id,first.deck.id);assert.equal(store.list().decks.length,1);assert.equal(store.loadActive().deck.name,'Renamed locally');
});
test('preview selection and foil commander survive save/refresh without re-adding a card',async t=>{
 const c=card(1,{type_line:'Legendary Creature — Fixture'}),storage=new MemoryStorage();const s=mount({storage,client:client([c],{eligible:[c.id]}),search:`?printing=${c.id}&finish=foil`});t.after(s.cleanup);await drain();
 s.el('preview-quantity').value='1';await s.el('preview-add').emit('click');await s.el('preview-commander').emit('click');await s.el('save-deck').emit('click');
 const saved=persistence.createStore({storage}).loadActive();assert.equal(saved.deck.entries[0].zone,'commander');assert.equal(saved.deck.entries[0].finish,'foil');assert.equal(saved.deck.selection.finish,'foil');assert.equal(saved.deck.selection.printingId,c.id);
 const reopened=mount({storage,client:client([c],{offline:true})});t.after(reopened.cleanup);await drain();assert.equal(reopened.el('preview-id').textContent,c.id);assert.equal(reopened.el('preview-finish').textContent,'Foil');assert.equal(reopened.el('stat-commanders').textContent,'1');assert.equal(reopened.el('stat-count').textContent,'1 / 100');assert.notEqual(reopened.el('deck-validity').textContent,'Construction checks passed');assert.match(reopened.el('data-check-status').textContent,/Refresh unavailable/);
});
test('page-exit checkpoints recover the latest unsaved draft and deduplicate repeated exit events',async t=>{
 const storage=new MemoryStorage(),s=mount({storage,client:client()});t.after(s.cleanup);await searchAdd(s);s.el('deck-name').value='Last keystrokes';await s.el('deck-name').emit('input');
 let prevented=false;s.listeners.beforeunload[0]({preventDefault(){prevented=true;}});s.listeners.pagehide[0]();assert.equal(prevented,true);const store=persistence.createStore({storage});assert.equal(store.versions().length,1);assert.equal(store.loadActive().deck.name,'Last keystrokes');
 const recovered=mount({storage,client:client()});t.after(recovered.cleanup);await drain();assert.equal(recovered.el('deck-name').value,'Last keystrokes');assert.match(recovered.el('deck-count').textContent,/1 \/ 100/);
});
test('multiple deck switching, save-a-copy and confirmed deletion preserve unrelated decks',async t=>{
 const storage=new MemoryStorage(),a=seed(storage,{name:'Deck A',cards:false}),b=seed(storage,{name:'Deck B',cards:false});a.store.active(a.deck.id);
 const s=mount({storage,client:client()});t.after(s.cleanup);s.el('saved-decks').value=b.deck.id;await s.el('saved-decks').emit('change');assert.equal(s.el('deck-name').value,'Deck B');
 await s.el('save-copy').emit('click');assert.equal(a.store.list().decks.length,3);assert.match(s.el('deck-name').value,/copy/);
 const current=a.store.loadActive().deck.id;const deleting=s.el('delete-deck').emit('click');await drain();assert.equal(s.el('draft-confirm').open,true);await s.el('draft-confirm-cancel').emit('click');await deleting;assert.equal(a.store.isSaved(current),true);
 const accepted=s.el('delete-deck').emit('click');await drain();await s.el('draft-confirm-accept').emit('click');await accepted;assert.equal(a.store.isSaved(current),false);assert.equal(a.store.isSaved(a.deck.id),true);assert.equal(a.store.isSaved(b.deck.id),true);
});
test('storage errors keep edits in memory, pause autosave and require explicit confirmation before switching',async t=>{
 const storage=new MemoryStorage(),a=seed(storage,{name:'Keep A',cards:false}),b=seed(storage,{name:'Other B',cards:false});a.store.active(a.deck.id);
 const s=mount({storage,client:client()});t.after(s.cleanup);storage.failWrites=true;s.el('deck-name').value='Unsaved important edits';await s.el('deck-name').emit('input');await s.el('save-deck').emit('click');assert.equal(s.el('deck-state').textContent,'Save failed');assert.match(s.el('save-status-message').textContent,/unavailable or full/);
 s.el('saved-decks').value=b.deck.id;const switching=s.el('saved-decks').emit('change');await drain();assert.equal(s.el('draft-confirm').open,true);await s.el('draft-confirm-cancel').emit('click');await switching;assert.equal(s.el('deck-name').value,'Unsaved important edits');assert.equal(a.store.load(a.deck.id).deck.name,'Keep A');
 await s.runTimers(800);assert.equal(a.store.load(a.deck.id).deck.name,'Keep A');await s.el('download-backup').emit('click');assert.match(s.el('deck-message').textContent,/JSON backup prepared/);
});
test('cross-tab changes pause autosave; saving a copy cannot overwrite the other tab',async t=>{
 const storage=new MemoryStorage(),a=seed(storage,{name:'Original',cards:false}),s=mount({storage,client:client()});t.after(s.cleanup);
 const external=a.store.save(model.edit(a.deck,{name:'Other tab version'}),{expectedToken:a.token});s.listeners.storage[0]({key:a.store.pointerKey(a.deck.id),newValue:JSON.stringify({version:1,token:external.token})});assert.equal(s.el('deck-state').textContent,'Save conflict');
 s.el('deck-name').value='My local version';await s.el('deck-name').emit('input');await s.runTimers(800);assert.equal(a.store.load(a.deck.id).deck.name,'Other tab version');
 await s.el('save-copy').emit('click');assert.equal(a.store.list().decks.length,2);assert.equal(a.store.load(a.deck.id).deck.name,'Other tab version');assert.equal(s.el('deck-state').textContent,'Saved locally');
});
test('JSON restore creates a separate draft; invalid files never replace the current deck',async t=>{
 const storage=new MemoryStorage(),a=seed(storage,{name:'Original backup'}),s=mount({storage,client:client()});t.after(s.cleanup);await drain();await s.el('save-deck').emit('click');
 const json=persistence.encodeBackup(a.deck);s.el('backup-file').files=[{size:json.length,text:async()=>json}];await s.el('backup-file').emit('change');await drain();
 assert.equal(a.store.list().decks.length,2);const restored=a.store.loadActive();assert.notEqual(restored.deck.id,a.deck.id);assert.deepEqual(restored.deck.entries,a.deck.entries);assert.match(restored.deck.name,/restored/);
 const before=s.el('deck-name').value;s.el('backup-file').files=[{size:4,text:async()=>'{bad'}];await s.el('backup-file').emit('change');assert.equal(s.el('deck-name').value,before);assert.match(s.el('deck-message').textContent,/not valid JSON/);
});
test('explicit Reload restores the saved content instead of reloading its unsaved checkpoint',async t=>{
 const storage=new MemoryStorage(),a=seed(storage,{name:'Saved version',cards:false}),s=mount({storage,client:client()});t.after(s.cleanup);
 s.el('deck-name').value='Unsaved variation';await s.el('deck-name').emit('input');const pending=s.el('reload-deck').emit('click');await drain();await s.el('draft-confirm-accept').emit('click');await pending;
 assert.equal(s.el('deck-name').value,'Saved version');assert.equal(a.store.load(a.deck.id).deck.name,'Saved version');assert.ok(a.store.versions().some(r=>r.deck.name==='Unsaved variation'));
});
test('damaged primary activates a recovered copy and never overwrites the damaged original',async t=>{
 const storage=new MemoryStorage(),a=seed(storage,{name:'Previous good',cards:false});a.store.save(model.edit(a.deck,{name:'Newer version'}),{expectedToken:a.token});storage.setItem(a.store.pointerKey(a.deck.id),'{bad');
 const s=mount({storage,client:client()});t.after(s.cleanup);assert.equal(s.el('deck-name').value,'Previous good');await s.el('save-deck').emit('click');assert.equal(storage.getItem(a.store.pointerKey(a.deck.id)),'{bad');assert.notEqual(a.store.loadActive().deck.id,a.deck.id);
});
test('recovery controls restore deleted versions as new drafts and require confirmation before erasing backups',async t=>{
 const storage=new MemoryStorage(),a=seed(storage,{name:'Deleted fixture'});a.store.remove(a.deck.id,a.token);const s=mount({storage,client:client()});t.after(s.cleanup);
 const originalVersion=a.store.versions()[0];s.el('recovery-versions').value=`${a.deck.id}.${originalVersion.token}`;await s.el('recovery-versions').emit('change');assert.equal(s.el('recover-version').disabled,false);await s.el('recover-version').emit('click');await drain();
 const copy=a.store.loadActive().deck;assert.notEqual(copy.id,a.deck.id);assert.deepEqual(copy.entries,a.deck.entries);assert.equal(a.store.isSaved(a.deck.id),false);
 s.el('recovery-versions').value=`${a.deck.id}.${originalVersion.token}`;await s.el('recovery-versions').emit('change');assert.equal(s.el('erase-recovery').disabled,false);
 const erase=s.el('erase-recovery').emit('click');await drain();await s.el('draft-confirm-accept').emit('click');await erase;assert.equal(a.store.versions().some(r=>r.deck.id===a.deck.id),false);assert.equal(a.store.isSaved(copy.id),true);
});
test('a storage-clear event invalidates Saved status and prevents automatic recreation of a deleted saved identity',async t=>{
 const storage=new MemoryStorage(),a=seed(storage,{cards:false}),s=mount({storage,client:client()});t.after(s.cleanup);storage.values.clear();s.listeners.storage[0]({key:null,newValue:null});assert.equal(s.el('deck-state').textContent,'Save conflict');
 s.el('deck-name').value='Kept in memory';await s.el('deck-name').emit('input');await s.runTimers(800);assert.equal(storage.length,0);assert.equal(s.el('deck-name').value,'Kept in memory');
});
