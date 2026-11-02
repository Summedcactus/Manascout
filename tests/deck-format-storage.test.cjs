const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fixture=require('./fixtures/deck-v1-5bc.json');
const storeAPI=require('../assets/js/deck-store.js');
const model=require('../assets/js/deck-model.js');
const formats=require('../assets/js/deck-formats.js');
const rules=require('../assets/js/deck-rules.js');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const {card}=require('./helpers/cards.cjs');
function legacy(){const storage=new MemoryStorage();for(const [k,v] of Object.entries(fixture.storage))storage.setItem(k,v);return {storage,store:storeAPI.createStore({storage})};}
function assertPreserved(actual,expected){
 for(const field of ['name','format','view','entries','selection','revision'])assert.deepEqual(actual[field],expected[field],field);
 assert.deepEqual(Object.keys(actual.cards),Object.keys(expected.cards));
 for(const [id,c] of Object.entries(expected.cards))for(const [field,value] of Object.entries(c)){
 if(field==='legalities')for(const [key,status] of Object.entries(value))assert.equal(actual.cards[id].legalities[key],status);
 else assert.deepEqual(actual.cards[id][field],value,field);
 }
}
for(const format of ['commander','pauper']){
 test(`5BC ${format}: load old draft and immutable recovery snapshots without changing bytes`,()=>{
 const {storage,store}=legacy(),d=fixture.decks[format];assertPreserved(store.load(d.id).deck,d);
 const versions=store.versions().filter(v=>v.deck.id===d.id);assert.equal(versions.length,2);
 for(const v of versions){const old=JSON.parse(fixture.storage[storeAPI.PREFIX+'snapshot.'+d.id+'.'+v.token]);assertPreserved(v.deck,old.deck);}
 assert.deepEqual(Object.fromEntries(storage.values),fixture.storage);
 for(const c of Object.values(store.load(d.id).deck.cards))assert.equal(c.legalities.standard,'unknown');
 assert.equal(rules.validate(store.load(d.id).deck).complete,false);
 });
 test(`5BC ${format}: old JSON backup restores identity, exact foil printing, quantities and roles`,()=>{
 const restored=storeAPI.decodeBackup(fixture.backups[format]),old=fixture.decks[format];
 assert.notEqual(restored.id,old.id);assertPreserved({...restored,revision:old.revision},old);assert.equal(restored.selection.finish,'foil');
 const roundtrip=storeAPI.decodeBackup(storeAPI.encodeBackup(restored));assertPreserved(roundtrip,restored);
 });
 test(`5BC ${format}: format switch/save preserves original snapshots and all old entries`,()=>{
 const {storage,store}=legacy(),old=fixture.decks[format],loaded=store.load(old.id),changed=model.edit(loaded.deck,{format:'modern'});store.save(changed,{expectedToken:loaded.token});
 const reopened=storeAPI.createStore({storage}).load(old.id).deck;assert.equal(reopened.format,'modern');assert.deepEqual(reopened.entries,old.entries);assert.deepEqual(reopened.selection,old.selection);
 for(const [k,v] of Object.entries(fixture.storage))if(k.includes('.snapshot.'))assert.equal(storage.getItem(k),v);
 const previous=store.restoreVersion(old.id,loaded.token);assert.notEqual(previous.id,old.id);assertPreserved(previous,{...old,revision:0});
 });
 test(`5BC ${format}: damaged pointer recovers a previous version without overwriting the original`,()=>{
 const {storage,store}=legacy(),old=fixture.decks[format];storage.setItem(store.pointerKey(old.id),'{broken');const recovered=store.load(old.id);assert.equal(recovered.recovered,true);assert.deepEqual(recovered.deck.entries,old.entries);assert.equal(storage.getItem(store.pointerKey(old.id)),'{broken');
 });
}
for(const profile of formats.profiles)test(`${profile.id}: local draft, backup and recovery preserve format and assignments`,()=>{
 const storage=new MemoryStorage(),store=storeAPI.createStore({storage});let d=model.add(model.createDeck({format:profile.id,name:'Profile '+profile.id}),card(1),{finish:'foil',quantity:3});
 d=model.add(d,card(2,{type_line:'Legendary Planeswalker — Test'}),{zone:'commander'});d=model.add(d,card(3,{type_line:'Instant'}),{zone:'signature',assignedTo:card(2).id});d=model.select(d,d.cards[d.entries[0].printingId],'foil');
 const saved=store.save(d);const reopened=storeAPI.createStore({storage}).load(d.id);assert.deepEqual(reopened.deck,d);
 const restored=storeAPI.decodeBackup(storeAPI.encodeBackup(d));assert.deepEqual({...restored,id:d.id,revision:d.revision,updatedAt:d.updatedAt},d);
 const newer=model.edit(d,{name:'Pending edit'}),checkpoint=store.checkpoint(newer,saved.token);assert.deepEqual(store.load(d.id).deck,newer);
 assert.deepEqual(store.restoreVersion(d.id,checkpoint.token).entries,d.entries);
 storage.failWrites=true;assert.throws(()=>store.save(newer,{expectedToken:saved.token}),e=>e.code==='quota');assert.deepEqual(store.load(d.id).deck.entries,d.entries);
});
test('signature references are validated and older entry keys remain unchanged',()=>{
 const d=model.add(model.createDeck(),card(1));assert.equal(d.entries[0].key,`${card(1).id}:nonfoil:main`);
 const bad=model.add(d,card(2),{zone:'signature'});bad.entries[1].assignedTo='invalid';assert.throws(()=>storeAPI.sanitizeDeck(bad),/Oathbreaker/);
 assert.throws(()=>model.add(d,card(2),{zone:'signature',assignedTo:'invalid'}),/Oathbreaker/);
});
test('legacy fixture is a fixed snapshot captured with 5BC, not regenerated by the current implementation',()=>{
 const text=fs.readFileSync(require.resolve('./fixtures/deck-v1-5bc.json'),'utf8');assert.equal(text.includes('hasPrintedPT'),false);assert.equal(text.includes('standardbrawl'),false);assert.equal(Object.keys(fixture.storage).filter(k=>k.includes('.snapshot.')).length,4);
});
