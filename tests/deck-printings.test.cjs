/* Synthetic exact-printing fixtures, no claims about a live catalogue. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const model=require('../assets/js/deck-model.js'),data=require('../assets/js/deck-data.js'),rules=require('../assets/js/deck-rules.js'),printings=require('../assets/js/deck-printings.js'),store=require('../assets/js/deck-store.js');
const {card,raw,id}=require('./helpers/cards.cjs'),{MemoryStorage}=require('./helpers/memory-storage.cjs');
const client={isVerified:()=>true,proof:()=>true};
const variant=(original,n,patch={})=>({...original,id:id(n),setCode:'ALT',setName:'Synthetic alternate edition',collectorNumber:String(n),images:[{name:original.name,url:`https://cards.scryfall.io/${n}.jpg`}],...patch});
const seed=(c=card(1),quantity=1,zone='main')=>model.add(model.createDeck(),c,{quantity,zone,finish:'foil'});
test('atomic same-Oracle replacement preserves quantity, zone, selected finish, identity plan and selection',()=>{
 const c=card(1),alt=variant(c,2);let deck=model.select(seed(c,7),c,'foil');deck={...deck,generation:{version:1,primaryStyle:'artifacts',targets:{ramp:12},commanderOracles:[]}};const before=JSON.stringify(deck),key=deck.entries[0].key;
 const result=printings.replace(deck,key,alt,'nonfoil',client);assert.equal(JSON.stringify(deck),before);assert.equal(result.deck.entries.length,1);assert.equal(result.deck.entries[0].quantity,7);assert.equal(result.deck.entries[0].zone,'main');assert.equal(result.deck.entries[0].printingId,alt.id);assert.equal(result.deck.entries[0].finish,'nonfoil');assert.equal(result.deck.entries[0].key,result.key);assert.deepEqual(result.deck.selection,{printingId:alt.id,finish:'nonfoil'});assert.equal(result.deck.generation,deck.generation);assert.equal(result.deck.cards[c.id],undefined);
});
test('collision merges compatible printing/finish/zone entries without losing any copies',()=>{
 const c=card(1,{type_line:'Basic Land — Plains'}),alt=variant(c,2);const deck=model.add(seed(c,13),alt,{quantity:4,finish:'foil'}),result=printings.replace(deck,deck.entries[0].key,alt,'foil',client);
 assert.equal(result.deck.entries.length,1);assert.equal(result.deck.entries[0].quantity,17);assert.equal(result.validation.issues.some(i=>i.code==='copies'),false);
});
test('different finishes and zones never merge; split basic-land artworks remain possible',()=>{
 const c=card(1,{type_line:'Basic Land — Plains'}),alt=variant(c,2);let deck=model.add(seed(c,12),alt,{quantity:3,finish:'nonfoil'});deck=model.add(deck,alt,{quantity:2,finish:'foil',zone:'sideboard'});const result=printings.replace(deck,deck.entries[0].key,alt,'foil',client);assert.equal(result.deck.entries.length,3);assert.equal(model.count(result.deck),17);assert.equal(result.deck.entries.find(e=>e.zone==='main'&&e.finish==='foil').quantity,12);
});
test('an already duplicated singleton remains illegal after grouping; changing art does not bypass copy checks',()=>{
 const c=card(1),alt=variant(c,2),deck=model.add(seed(c),alt,{finish:'foil'}),result=printings.replace(deck,deck.entries[0].key,alt,'foil',client);assert.equal(result.deck.entries.length,1);assert.equal(result.deck.entries[0].quantity,2);assert.ok(result.validation.issues.some(i=>i.code==='copies'));
});
for(const [label,patch]of [['other Oracle',{oracleId:id(100)}],['changed rules',{rulesText:'Draw seven cards.'}],['changed identity',{colorIdentity:['R']}],['changed type',{frontType:'Creature — Test'}],['changed mana value',{manaValue:'99'}]])test(`rejects ${label} without changing input`,()=>{
 const c=card(1),deck=seed(c),before=JSON.stringify(deck);assert.throws(()=>printings.replace(deck,deck.entries[0].key,variant(c,2,patch),'foil',client),/same Oracle/);assert.equal(JSON.stringify(deck),before);
});
test('changing only finish preserves the printing UUID, copies and other-finish entry',()=>{
 const c=card(1,{finishes:['nonfoil','foil','etched']}),deck=model.add(seed(c,2),c,{quantity:3,finish:'nonfoil'}),result=printings.replace(deck,deck.entries[0].key,c,'etched',client);assert.equal(result.deck.entries.find(e=>e.finish==='etched').quantity,2);assert.equal(result.deck.entries.find(e=>e.finish==='nonfoil').quantity,3);assert.equal(result.deck.entries.length,2);assert.ok(result.deck.entries.every(e=>e.printingId===c.id));
});
test('impossible finish rejects rather than silently falling back',()=>{const c=card(1),deck=seed(c);assert.throws(()=>printings.replace(deck,deck.entries[0].key,variant(c,2),'etched',client),/finish is not listed/);});
for(const [label,patch,pattern]of [['Arena only',{games:['arena']},/supported paper/],['token',{layout:'token'},/supported paper/],['oversized',{oversized:true},/supported paper/],['gold border',{borderColor:'gold'},/supported paper/],['acorn',{securityStamp:'acorn'},/supported paper/],['banned',{legalities:{commander:'banned'}},/banned/],['missing legality',{legalities:{commander:'unknown'}},/unavailable/]])test(`target ${label} is rejected by existing construction checks`,()=>{
 const c=card(1),deck=seed(c);assert.throws(()=>printings.replace(deck,deck.entries[0].key,variant(c,2,patch),'foil',client),pattern);
});
test('unverified target data is rejected',()=>{const c=card(1),deck=seed(c);assert.throws(()=>printings.replace(deck,deck.entries[0].key,variant(c,2),'foil',{...client,isVerified:()=>false}),/not been verified/);});
test('commander swap remaps Oathbreaker signature owner and exact entry key without changing assignments or quantities',()=>{
 const leader=card(1,{type_line:'Legendary Planeswalker — Test'}),spell=card(3,{type_line:'Instant'}),alt=variant(leader,2);let deck=model.edit(seed(leader,1,'commander'),{format:'oathbreaker'});deck=model.add(deck,spell,{zone:'signature',assignedTo:leader.id,finish:'foil'});const result=printings.replace(deck,deck.entries[0].key,alt,'foil',client),signature=result.deck.entries.find(e=>e.zone==='signature');assert.equal(signature.assignedTo,alt.id);assert.equal(signature.key,model.entryKey(spell.id,'foil','signature',alt.id));assert.equal(signature.quantity,1);assert.equal(model.count(result.deck,'commander'),1);
});
test('signature printing change preserves its own commander assignment',()=>{
 const leader=card(1,{type_line:'Legendary Planeswalker — Test'}),spell=card(3,{type_line:'Instant'}),alt=variant(spell,4);let deck=model.edit(seed(leader,1,'commander'),{format:'oathbreaker'});deck=model.add(deck,spell,{zone:'signature',assignedTo:leader.id,finish:'foil'});const result=printings.replace(deck,deck.entries.find(e=>e.zone==='signature').key,alt,'nonfoil',client);assert.equal(result.deck.entries.find(e=>e.zone==='signature').assignedTo,leader.id);
});
test('multi-face data is retained through replacement and JSON backup/restore',()=>{
 const c=card(1,{layout:'transform',image_uris:undefined,type_line:'Legendary Creature — Test',card_faces:[{name:'Front',type_line:'Legendary Creature — Test',oracle_text:'Front rules.',image_uris:{normal:'https://cards.scryfall.io/front.jpg'}},{name:'Back',type_line:'Creature — Test',oracle_text:'Back rules.',image_uris:{normal:'https://cards.scryfall.io/back.jpg'}}]}),alt=variant(c,2,{images:c.images.map((face,i)=>({...face,url:`https://cards.scryfall.io/new-${i}.jpg`})),frame:'1997',frameEffects:['showcase'],fullArt:true});const deck=seed(c),result=printings.replace(deck,deck.entries[0].key,alt,'foil',client),recovered=store.decodeBackup(store.encodeBackup(result.deck));assert.deepEqual(recovered.cards[alt.id].images,alt.images);assert.equal(recovered.cards[alt.id].frame,'1997');assert.deepEqual(recovered.cards[alt.id].frameEffects,['showcase']);assert.equal(recovered.cards[alt.id].fullArt,true);
});
test('saved version-1 decks, autosave journal and recovery retain selected printing and quantity',()=>{
 const c=card(1),alt=variant(c,2),deck=seed(c,8),storage=new MemoryStorage(),s=store.createStore({storage}),first=s.save(deck);const next=printings.replace(deck,deck.entries[0].key,alt,'nonfoil',client).deck;s.checkpoint(next,first.token);const pending=s.load(deck.id);assert.equal(pending.deck.entries[0].printingId,alt.id);assert.equal(pending.deck.entries[0].quantity,8);const saved=s.save(next,{expectedToken:first.token});assert.deepEqual(s.load(deck.id).deck.entries,next.entries);assert.ok(s.versions().some(v=>v.deck.entries[0].printingId===c.id));assert.equal(saved.deck.schemaVersion,1);
});
test('missing targets, quantity overflow and invalid UUID fail atomically',()=>{
 const c=card(1),alt=variant(c,2),deck=model.add(seed(c,6000),alt,{quantity:5000,finish:'foil'});assert.throws(()=>model.replacePrinting(deck,'missing',alt,'foil'));assert.throws(()=>model.replacePrinting(deck,deck.entries[0].key,alt,'foil'),/10,000/);assert.throws(()=>model.replacePrinting(seed(c),seed(c).entries[0].key,{...alt,id:'bad'},'foil'));assert.equal(deck.entries.length,2);
});
test('finish and treatment filters use real catalogue fields and remain separate',()=>{
 const c=card(1),a=variant(c,2,{availableFinishes:['etched'],frameEffects:['showcase']}),b=variant(c,3,{availableFinishes:['nonfoil'],borderColor:'borderless',frame:'1997'});assert.deepEqual(printings.filter([c,a,b],{finish:'etched'}),[a]);assert.deepEqual(printings.filter([c,a,b],{treatment:'borderless'}),[b]);assert.deepEqual(printings.filter([c,a,b],{treatment:'showcase',finish:'foil'}),[]);assert.deepEqual(printings.filter([a,b],{set:'alt',finish:'nonfoil'}),[b]);
});
test('cancelled or failed preparation returns no candidate and never mutates the original deck',async()=>{
 const c=card(1),deck=seed(c),before=JSON.stringify(deck),controller=new AbortController();controller.abort();await assert.rejects(printings.prepare(deck,deck.entries[0].key,c.id,'foil',{client,signal:controller.signal}),{name:'AbortError'});await assert.rejects(printings.prepare(deck,deck.entries[0].key,c.id,'foil',{client:{...client,printing:async()=>{throw Error('offline');}}}),/offline/);assert.equal(JSON.stringify(deck),before);
});
test('premium treatment tags identify the edition without inventing a new finish',()=>{
 const c=card(1,{promo_types:['surgefoil'],finishes:['foil']}),alt=variant(c,2),deck=seed(c),result=printings.replace(deck,deck.entries[0].key,alt,'foil',client);assert.deepEqual(printings.treatments(c),[['surgefoil','Surge foil']]);assert.deepEqual(c.availableFinishes,['foil']);assert.deepEqual(printings.filter([c],{finish:'etched'}),[]);const roundtrip=store.decodeBackup(store.encodeBackup(result.deck));assert.deepEqual(roundtrip.cards[alt.id].promoTypes,['surgefoil']);
});
