const { test }=require('node:test');
const assert=require('node:assert/strict');
const model=require('../assets/js/deck-model.js');
const persistence=require('../assets/js/deck-store.js');
const rules=require('../assets/js/deck-rules.js');
const {card}=require('./helpers/cards.cjs');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
function fixture(){
 let d=model.add(model.createDeck({name:'Saved fixture'}),card(1,{type_line:'Legendary Creature — Test'}),{zone:'commander',finish:'foil'});
 d=model.add(d,card(2),{quantity:3});d=model.add(d,card(3),{zone:'sideboard',quantity:2,finish:'foil'});
 return model.select(model.edit(d,{view:'list'}),d.cards[d.entries[0].printingId],'foil');
}
const clone=o=>JSON.parse(JSON.stringify(o));
test('save/reopen preserves identity, finish, quantities, commander, format, name and selection',()=>{
 const storage=new MemoryStorage(),store=persistence.createStore({storage}),d=fixture(),saved=store.save(d),reopened=persistence.createStore({storage}).loadActive();
 assert.equal(reopened.token,saved.token);assert.equal(reopened.deck.id,d.id);assert.equal(reopened.deck.name,d.name);assert.equal(reopened.deck.view,'list');assert.equal(reopened.deck.format,'commander');
 assert.deepEqual(reopened.deck.entries,d.entries);assert.deepEqual(reopened.deck.selection,d.selection);assert.equal(reopened.deck.cards[d.selection.printingId].id,d.selection.printingId);
 assert.notEqual(reopened.deck.cards[d.selection.printingId],d.cards[d.selection.printingId]);assert.equal(rules.validate(reopened.deck).complete,false);
});
test('multiple named decks and same-name copies never overwrite an existing identity',()=>{
 const storage=new MemoryStorage(),store=persistence.createStore({storage}),a=fixture(),b={...fixture(),name:a.name};store.save(a);store.save(b);
 assert.equal(store.list().decks.length,2);assert.notEqual(a.id,b.id);assert.equal(store.load(a.id).deck.id,a.id);assert.equal(store.load(b.id).deck.id,b.id);
});
test('rename uses expected revision; prior snapshot restores as a separate draft',()=>{
 const store=persistence.createStore({storage:new MemoryStorage()}),d=fixture(),first=store.save(d),next=model.edit(d,{name:'Renamed'}),second=store.save(next,{expectedToken:first.token});
 assert.equal(store.load(d.id).deck.name,'Renamed');const recovered=store.restoreVersion(d.id,first.token);assert.equal(recovered.name,d.name);assert.notEqual(recovered.id,d.id);assert.equal(store.load(d.id).token,second.token);
});
test('stale write/delete tokens fail safely and retain the newer deck',()=>{
 const storage=new MemoryStorage(),a=persistence.createStore({storage}),b=persistence.createStore({storage}),d=fixture(),first=a.save(d),second=b.save(model.edit(d,{name:'Other tab'}),{expectedToken:first.token});
 assert.throws(()=>a.save(model.edit(d,{name:'Stale'}),{expectedToken:first.token}),e=>e.code==='conflict');assert.throws(()=>a.remove(d.id,first.token),e=>e.code==='conflict');assert.equal(a.load(d.id).token,second.token);assert.equal(a.load(d.id).deck.name,'Other tab');
});
test('an interleaved pointer change retains the losing writer as an immutable recovery version',()=>{
 const storage=new MemoryStorage(),store=persistence.createStore({storage}),other=persistence.createStore({storage}),d=fixture(),first=store.save(d);
 storage.beforeWrite=(key)=>{if(!key.includes('.snapshot.'))return;storage.beforeWrite=null;other.save(model.edit(d,{name:'Concurrent'}),{expectedToken:first.token});};
 assert.throws(()=>store.save(model.edit(d,{name:'My retained edits'}),{expectedToken:first.token}),e=>e.code==='conflict');assert.equal(store.load(d.id).deck.name,'Concurrent');assert.ok(store.versions().some(s=>s.deck.name==='My retained edits'));
});
test('storage unavailable/full never reports success or overwrites the last saved version',()=>{
 const storage=new MemoryStorage(),store=persistence.createStore({storage}),d=fixture(),first=store.save(d);storage.failWrites=true;
 assert.throws(()=>store.save(model.edit(d,{name:'Unsaved'}),{expectedToken:first.token}),e=>e.code==='quota');assert.equal(store.load(d.id).deck.name,d.name);
 assert.throws(()=>persistence.createStore().save(d),e=>e.code==='unavailable');storage.failReads=true;assert.throws(()=>store.load(d.id),e=>e.code==='unavailable');
});
test('failed live-pointer write leaves both the saved deck and new recovery snapshot available',()=>{
 const storage=new MemoryStorage(),store=persistence.createStore({storage}),d=fixture(),first=store.save(d);storage.failKey=key=>key===store.pointerKey(d.id);
 assert.throws(()=>store.save(model.edit(d,{name:'Recovery after failed pointer'}),{expectedToken:first.token}),e=>e.code==='quota');assert.equal(store.load(d.id).deck.name,d.name);assert.ok(store.versions().some(s=>s.deck.name==='Recovery after failed pointer'));
});
test('damaged primary recovers backup without modifying damaged bytes; bad journal cannot hide valid primary',()=>{
 const storage=new MemoryStorage(),store=persistence.createStore({storage}),d=fixture(),first=store.save(d);store.save(model.edit(d,{name:'Second'}),{expectedToken:first.token});storage.setItem(store.pointerKey(d.id),'{broken');
 const recovered=store.load(d.id);assert.equal(recovered.recovered,true);assert.equal(recovered.deck.name,d.name);assert.equal(storage.getItem(store.pointerKey(d.id)),'{broken');assert.equal(store.list().issues.length,1);
 const separate=fixture(),saved=store.save(separate);storage.setItem(persistence.PREFIX+'journal.'+separate.id,'{broken');assert.equal(store.load(separate.id).token,saved.token);
});
// Phase 3 explicitly supports version 2; version 3 remains an unknown future schema.
test('version/schema/entry errors are rejected without deleting or repairing originals',()=>{
 const d=fixture();for(const mutate of [x=>x.schemaVersion=3,x=>x.entries[0].quantity=-1,x=>x.entries.push({...x.entries[0]}),x=>x.entries[0].printingId='invalid',x=>x.entries[0].zone='companion',x=>x.entries[0].finish='invented']){const bad=clone(d);mutate(bad);assert.throws(()=>persistence.sanitizeDeck(bad),persistence.StorageError);}
 for(const text of ['null','{broken',JSON.stringify({application:'ManaScout Deck Studio',version:3,deck:d})])assert.throws(()=>persistence.decodeBackup(text),persistence.StorageError);
 assert.throws(()=>persistence.decodeBackup('x'.repeat(persistence.maxBytes+1)),/under 20 MB/);
});
test('backup roundtrip makes a new identity and blocks untrusted image/source/guide URLs',()=>{
 const d=fixture(),restored=persistence.decodeBackup(persistence.encodeBackup(d));assert.notEqual(restored.id,d.id);assert.deepEqual(restored.entries,d.entries);assert.deepEqual(restored.selection,d.selection);
 const unsafe=clone(d),c=unsafe.cards[unsafe.selection.printingId];c.images[0].url='https://evil.example/card.jpg';c.sourceUrl='javascript:alert(1)';c.guide='https://evil.example';const clean=persistence.sanitizeDeck(unsafe).cards[c.id];assert.deepEqual(clean.images,[]);assert.equal(clean.sourceUrl,'');assert.equal(clean.guide,'');
});
test('checkpoint resumes latest unsaved changes, including a first draft with no saved pointer',()=>{
 let now=0;const storage=new MemoryStorage(),store=persistence.createStore({storage,now:()=>++now}),d=fixture(),first=store.save(d),newer=model.edit(d,{name:'Last unsaved edit'});store.checkpoint(newer,first.token);
 const resumed=persistence.createStore({storage}).loadActive();assert.equal(resumed.deck.name,'Last unsaved edit');assert.equal(resumed.dirty,true);assert.equal(resumed.token,first.token);
 const fresh=model.createDeck({name:'Journal only'});store.checkpoint(fresh,null);assert.equal(store.loadActive().deck.name,'Journal only');assert.equal(store.loadActive().token,null);
});
test('a newer checkpoint is not lost when an older in-flight save finishes afterwards',()=>{
 let now=0;const store=persistence.createStore({storage:new MemoryStorage(),now:()=>++now}),d=fixture(),first=store.save(d),older=model.edit(d,{name:'Older in flight'}),latest=model.edit(older,{name:'Newest checkpoint'});
 store.checkpoint(latest,first.token);const savedOlder=store.save(older,{expectedToken:first.token});const resumed=store.load(d.id);
 assert.equal(resumed.deck.name,'Newest checkpoint');assert.equal(resumed.token,savedOlder.token);assert.equal(resumed.dirty,true);assert.equal(store.load(d.id,{includeJournal:false}).deck.name,'Older in flight');
});
test('foreign-tab recovery branches do not automatically replace the latest saved draft',()=>{
 const storage=new MemoryStorage(),a=persistence.createStore({storage}),b=persistence.createStore({storage}),d=fixture(),first=a.save(d);
 b.checkpoint(model.edit(model.edit(d,{name:'Foreign'}),{name:'Foreign branch'}),first.token);a.save(model.edit(d,{name:'Current saved branch'}),{expectedToken:first.token});
 assert.equal(a.load(d.id).deck.name,'Current saved branch');assert.ok(a.versions().some(s=>s.deck.name==='Foreign branch'));
});
test('explicit reload can ignore and discard a journal pointer while retaining the recovery snapshot',()=>{
 const store=persistence.createStore({storage:new MemoryStorage()}),d=fixture(),saved=store.save(d),checkpoint=store.checkpoint(model.edit(d,{name:'Unsaved'}),saved.token);
 assert.equal(store.load(d.id,{includeJournal:false}).deck.name,d.name);store.discardJournal(d.id,checkpoint.token);assert.equal(store.load(d.id).deck.name,d.name);assert.ok(store.versions().some(s=>s.deck.name==='Unsaved'));
});
test('delete is recoverable, never resurrects on reopen; explicit purge protects live decks',()=>{
 const storage=new MemoryStorage(),store=persistence.createStore({storage}),d=fixture(),first=store.save(d);assert.throws(()=>store.purgeDeleted(d.id),e=>e.code==='conflict');
 store.remove(d.id,first.token);assert.equal(store.list().decks.length,0);assert.equal(store.loadActive(),null);assert.throws(()=>store.load(d.id),e=>e.code==='missing');assert.ok(store.versions().length);
 store.purgeDeleted(d.id);assert.equal(store.versions().length,0);
});
test('ordinary saves retain bounded history plus the current/previous snapshots',()=>{
 let now=0;const store=persistence.createStore({storage:new MemoryStorage(),now:()=>++now});let d=fixture(),token=null;
 for(let i=0;i<10;i++){d=model.edit(d,{name:'Revision '+i});token=store.save(d,{expectedToken:token}).token;}
 assert.equal(store.load(d.id).deck.name,'Revision 9');assert.ok(store.versions().length<=3);assert.ok(store.versions().some(s=>s.token===token));
});
test('incomplete printing metadata can still be backed up without being declared valid',()=>{
 const incomplete=card(1,{set:undefined,collector_number:undefined}),d=model.add(model.createDeck(),incomplete),store=persistence.createStore({storage:new MemoryStorage()});
 store.save(d);assert.equal(store.load(d.id).deck.cards[incomplete.id].setCode,'');assert.equal(rules.validate(store.load(d.id).deck).complete,false);assert.doesNotThrow(()=>persistence.decodeBackup(persistence.encodeBackup(d)));
});
