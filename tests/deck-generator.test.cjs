const {test}=require('node:test');
const assert=require('node:assert/strict');
const gen=require('../assets/js/deck-generator.js');
const model=require('../assets/js/deck-model.js');
const rules=require('../assets/js/deck-rules.js');
const store=require('../assets/js/deck-store.js');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const {fixture,fakeClient,card}=require('./helpers/generation.cjs');
const run=(f,o={},extra={})=>gen.generate(f.deck,o,{client:fakeClient(f),random:()=>.5,...extra});
test('only an exact assigned Commander/main selection enables generation; other formats and sideboard do not',()=>{
 let d=model.createDeck();assert.equal(gen.context(d),null);const c=card();d=model.select(d,c);assert.equal(gen.context(d),null);d=model.add(d,c,{zone:'sideboard'});assert.equal(gen.context(d),null);d=model.add(d,c);assert.ok(gen.context(d));assert.equal(gen.context(model.edit(d,{format:'standard'})),null);assert.equal(gen.context(model.select(d,c,'foil')),null);
});
test('single commander preserves ID, foil finish and selection; exactly 99 main plus one commander pass the existing rules',async()=>{
 const f=fixture(),client=fakeClient(f),before=JSON.stringify(f.deck);const r=await run(f,{}, {client});
 assert.equal(JSON.stringify(f.deck),before);assert.equal(model.count(r.deck),100);assert.equal(model.count(r.deck,'main'),99);assert.equal(model.count(r.deck,'commander'),1);assert.equal(r.deck.entries.find(e=>e.zone==='commander').printingId,f.commander.id);assert.equal(r.deck.entries.find(e=>e.zone==='commander').finish,'foil');assert.deepEqual(r.deck.selection,f.deck.selection);assert.equal(rules.validate(r.deck,client).status,'valid');assert.equal(r.deck.id,f.deck.id);assert.equal(r.deck.revision,f.deck.revision+1);assert.equal(r.strategy,'artifacts');assert.ok(r.roles.ramp>=7&&r.roles.draw>=6&&r.roles.interaction>=5&&r.roles.payoff>=3&&r.roles.synergy>=12);assert.match(r.note,/not certification/);
});
test('legal partner pair preserves both exact assignments and generates 98 main cards',async()=>{
 const f=fixture({pair:true}),r=await run(f);assert.equal(model.count(r.deck,'commander'),2);assert.equal(model.count(r.deck,'main'),98);assert.deepEqual(r.deck.entries.filter(e=>e.zone==='commander'),f.deck.entries.filter(e=>e.zone==='commander'));assert.equal(model.count(r.deck),100);
});
test('a main-deck seed gets a mechanically compatible commander and keeps the original foil printing',async()=>{
 const f=fixture({seed:true}),client=fakeClient(f);const r=await run(f,{}, {client});assert.equal(model.count(r.deck),100);const e=r.deck.entries.find(e=>e.printingId===f.original.id);assert.equal(e.zone,'main');assert.equal(e.finish,'foil');assert.equal(r.deck.entries.find(e=>e.zone==='commander').printingId,f.commander.id);assert.ok(client.calls.find(x=>x.kind==='pool'&&x.q.includes('is:commander')));assert.equal(rules.validate(r.deck,client).status,'valid');
});
test('a destructive reference to artifacts is not sufficient synergy to choose a commander',async()=>{
 const f=fixture({seed:true});f.records=f.records.filter(c=>c.id!==f.commander.id);const superficial=card(888,{name:'Fixture Destroyer',type_line:'Legendary Creature — Test',color_identity:['G'],oracle_text:'Destroy target artifact.'});f.records.push(superficial);await assert.rejects(run(f),/No confidently synergistic/);
});
test('banned, illegal, wrong-platform and off-identity candidates never enter the deck',async()=>{
 const f=fixture();for(const [n,extra]of [[800,{legalities:{commander:'banned'}}],[801,{legalities:{commander:'not_legal'}}],[802,{games:['arena']}],[803,{color_identity:['U']}],[804,{oversized:true}]])f.records.push(card(n,{type_line:'Artifact',oracle_text:'Draw two cards. Trample.',...extra}));const r=await run(f);for(const n of [800,801,802,803,804])assert.equal(r.deck.entries.some(e=>e.printingId.startsWith(n.toString(16).padStart(8,'0'))),false);assert.ok(Object.values(r.deck.cards).every(c=>c.colorIdentity.every(x=>x==='G')));
});
test('singleton groups include Oracle and name identity across different printings',async()=>{
 const f=fixture();const sameOracle={...f.spells[0],id:card(820).id};const sameName={...f.spells[1],id:card(821).id,oracleId:card(821).oracleId};f.records.push(sameOracle,sameName);const r=await run(f);const spells=r.deck.entries.filter(e=>!/^Basic Land/.test(r.deck.cards[e.printingId].frontType));assert.equal(new Set(spells.map(e=>r.deck.cards[e.printingId].oracleId)).size,spells.length);assert.equal(new Set(spells.map(e=>r.deck.cards[e.printingId].name)).size,spells.length);
});
test('incompatible preserved seed/commanders, unsupported combinations and commander quantities fail without weakening rules',async()=>{
 for(const kind of ['color','pair','quantity']){
  const f=fixture();if(kind==='color'){const c=card(823,{color_identity:['U']});f.records.push(c);f.deck=model.select(model.add(f.deck,c),c);}if(kind==='pair'){f.deck=model.add(f.deck,f.second,{zone:'commander'});}if(kind==='quantity')f.deck=model.add(f.deck,f.commander,{zone:'commander',finish:'foil'});await assert.rejects(run(f),/configuration needs correction/);
 }
});
test('missing seed data, removed finish, stale verification and missing final records fail safely',async()=>{
 for(const kind of ['missing','finish','stale','final']){
  const f=fixture(),client=fakeClient(f);if(kind==='missing')client.refresh=async()=>[];if(kind==='finish')f.records=f.records.map(c=>c.id===f.commander.id?{...c,availableFinishes:['nonfoil']}:c);if(kind==='stale')client.isVerified=()=>false;if(kind==='final'){const refresh=client.refresh;let calls=0;client.refresh=async(...args)=>{const cards=await refresh(...args);return ++calls>1?cards.slice(1):cards;};}const before=JSON.stringify(f.deck);await assert.rejects(run(f,{}, {client}));assert.equal(JSON.stringify(f.deck),before);
 }
});
test('failed and cancelled generation cannot mutate the source deck',async()=>{
 const f=fixture(),before=JSON.stringify(f.deck);await assert.rejects(run(f,{}, {client:fakeClient(f,{fail:true})}),/unavailable/);const controller=new AbortController();controller.abort();await assert.rejects(run(f,{}, {signal:controller.signal}),{name:'AbortError'});assert.equal(JSON.stringify(f.deck),before);
});
test('abort is checked after a late uncooperative API response',async()=>{
 const f=fixture(),controller=new AbortController();const client=fakeClient(f,{wait:async()=>{controller.abort();}});await assert.rejects(run(f,{}, {client,signal:controller.signal}),{name:'AbortError'});assert.equal(client.calls.filter(c=>c.kind==='pool').length,1);
});
test('an incoherent or insufficient pool fails rather than filling with unrelated random cards',async()=>{
 const f=fixture(),pool=f.records.filter(c=>/^Basic Land/.test(c.frontType)||c.id===f.commander.id);await assert.rejects(run(f,{}, {client:fakeClient(f,{pool})}),/cannot fill a coherent|Not enough/);
});
test('uninterpretable main-deck seed fails with a suggestion to choose a commander manually',async()=>{
 const f=fixture({seed:true});f.records=f.records.map(c=>c.id===f.original.id?{...c,frontType:'Creature — Test',rulesText:'',frontText:'',manaValue:'7'}:c);await assert.rejects(run(f),/No confident mechanical theme/);
});
test('curve and power preferences alter targets without certifying a bracket',async()=>{
 const f=fixture(),a=gen.targets([f.commander],gen.options({curve:'low',bracket:1}),'aggro'),b=gen.targets([{...f.commander,manaValue:'7'}],gen.options({curve:'high',bracket:5}),'control');assert.ok(a.land<b.land);assert.ok(a.ramp<b.ramp);assert.ok(a.interaction<b.interaction);const r=await run(f,{bracket:5,curve:'low',randomness:'wild'});assert.equal(model.count(r.deck),100);assert.match(r.note,/no combo verification/);
});
test('all randomness levels remain legal and role-constrained',async()=>{
 for(const randomness of ['reliable','mixed','wild']){const f=fixture(),client=fakeClient(f),r=await run(f,{randomness},{client});assert.equal(rules.validate(r.deck,client).status,'valid');assert.ok(r.roles.synergy>=12);}
});
test('bounded role pool requests use current Commander/paper queries and at most 12 search pages',async()=>{
 const f=fixture({seed:true}),client=fakeClient(f);await run(f,{}, {client});const requests=client.calls.filter(c=>c.kind==='pool');assert.ok(requests.reduce((n,r)=>n+r.options.pages,0)<=12);assert.ok(requests.slice(1).every(r=>r.q.includes('id<=g')));assert.equal(client.calls.filter(c=>c.kind==='refresh').length,2);
});
test('reported prices include exact seed finishes, lands and dated conversion; no invented zero-price cards',async()=>{
 const f=fixture(),r=await run(f,{budget:50});assert.ok(r.estimate.gbp>0&&r.estimate.gbp<=50);assert.equal(r.estimate.rateDate,'2026-11-04');assert.match(r.note,/shipping and availability excluded/);assert.equal(gen.estimate(r.deck,.85).unknown,0);
 const unknown=fixture({budgetPrice:null});await assert.rejects(run(unknown,{budget:50}),/no EUR price/);const expensive=fixture({budgetPrice:'100'});await assert.rejects(run(expensive,{budget:1}),/already use the budget/);
});
test('unpriced candidates are excluded under a budget, but are never recorded as free',async()=>{
 const f=fixture();const unknown=card(830,{type_line:'Artifact',oracle_text:'Draw two cards. {T}: Add {G}. Trample.'});f.records.push(unknown);const r=await run(f,{budget:50});assert.equal(r.deck.entries.some(e=>e.printingId===unknown.id),false);assert.equal(gen.estimate(model.add(model.createDeck(),unknown),.85).unknown,1);
});
test('unavailable exchange rate, insufficient budget or changed final prices preserve the source deck',async()=>{
 for(const kind of ['rate','budget','final-price']){const f=fixture(),client=fakeClient(f);if(kind==='rate')client.euroRate=async()=>{throw Error('Reference rate unavailable');};if(kind==='final-price'){const refresh=client.refresh;let calls=0;client.refresh=async(...args)=>{const cards=await refresh(...args);return ++calls>1?cards.map(c=>({...c,pricesEUR:{nonfoil:1000,foil:1000,etched:null}})):cards;};}const before=JSON.stringify(f.deck);await assert.rejects(run(f,{budget:kind==='budget'?1:50},{client}));assert.equal(JSON.stringify(f.deck),before);}
});
test('replacement confirmation covers manual contents/quantities but a seed alone or pair does not need it',()=>{
 const f=fixture();assert.equal(gen.needsConfirmation(f.deck),false);assert.equal(gen.needsConfirmation(fixture({pair:true}).deck),false);assert.equal(gen.needsConfirmation(fixture({seed:true}).deck),false);assert.equal(gen.needsConfirmation(model.add(f.deck,f.forest)),true);assert.equal(gen.needsConfirmation(model.add(f.deck,f.commander,{zone:'commander',finish:'foil'})),true);
});
test('generated deck round-trips through v1 local saves and JSON without losing finishes/assignments or old drafts',async()=>{
 const f=fixture(),r=await run(f);const storage=new MemoryStorage(),p=store.createStore({storage});const old=p.save(f.deck);p.checkpoint(f.deck,old.token);p.save(r.deck,{expectedToken:old.token});const saved=p.load(r.deck.id).deck;assert.deepEqual(saved.entries,r.deck.entries);assert.deepEqual(saved.selection,r.deck.selection);assert.equal(saved.schemaVersion,1);assert.equal(store.decodeBackup(store.encodeBackup(r.deck)).entries.length,r.deck.entries.length);assert.ok(p.versions().some(v=>v.kind==='recovery'&&v.deck.entries.length===f.deck.entries.length));const oldCard=structuredClone(f.deck);for(const c of Object.values(oldCard.cards)){delete c.pricesEUR;delete c.manaCost;delete c.edhrecRank;}assert.deepEqual(store.sanitizeDeck(oldCard).entries,oldCard.entries);
});
test('invalid settings fail before any network traffic',async()=>{
 const f=fixture(),client=fakeClient(f);for(const o of [{bracket:6},{budget:-1},{budget:NaN},{curve:'oops'},{strategy:'unknown'},{randomness:'unrelated'}])await assert.rejects(run(f,o,{client}));assert.equal(client.calls.length,0);
});
test('basic mana allocation includes every required colour and follows actual mana symbols',async()=>{
 const f=fixture({pair:true}),r=await run(f);assert.ok(r.deck.entries.some(e=>e.printingId===f.forest.id));assert.ok(r.deck.entries.some(e=>e.printingId===f.plains.id));const green=r.deck.entries.find(e=>e.printingId===f.forest.id).quantity,white=r.deck.entries.find(e=>e.printingId===f.plains.id).quantity;assert.ok(green>white);
});
test('Choose a Background pair keeps both assignments and generates 98 using existing pair verification',async()=>{
 const f=fixture({pair:true});f.records=f.records.map(c=>c.id===f.commander.id?{...c,frontText:'Whenever you cast an artifact spell, draw a card.\nChoose a Background',rulesText:'Whenever you cast an artifact spell, draw a card.\nChoose a Background'}:c.id===f.second.id?{...c,frontType:'Legendary Enchantment — Background',frontText:'Commander creatures you own have hexproof.',rulesText:'Commander creatures you own have hexproof.'}:c);let d=model.createDeck();for(const id of [f.commander.id,f.second.id])d=model.add(d,f.records.find(c=>c.id===id),{zone:'commander',finish:'foil'});f.deck=model.select(d,f.records.find(c=>c.id===f.commander.id),'foil');const client=fakeClient(f),r=await run(f,{}, {client});assert.equal(model.count(r.deck,'main'),98);assert.equal(rules.validate(r.deck,client).status,'valid');
});
test('colourless commanders use Wastes rather than illegal coloured basics',async()=>{
 const f=fixture({colors:[]}),r=await run(f);assert.ok(r.deck.entries.some(e=>e.printingId===f.wastes.id));assert.ok(Object.values(r.deck.cards).every(c=>c.colorIdentity.length===0));assert.equal(model.count(r.deck),100);
});
test('low-bracket filtering retains basic land ramp while excluding generic tutors and artifact fast mana',async()=>{
 const f=fixture();const additions=[card(850,{type_line:'Artifact',edhrec_rank:1,cmc:2,color_identity:['G'],oracle_text:'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.'}),card(851,{type_line:'Artifact',cmc:0,oracle_text:'Search your library for a card, put that card into your hand, then shuffle.'}),card(852,{type_line:'Artifact',cmc:0,oracle_text:'{T}: Add {C}{C}.'})];f.records.push(...additions);const r=await run(f,{bracket:1});assert.ok(r.deck.entries.some(e=>e.printingId===additions[0].id));for(const c of additions.slice(1))assert.equal(r.deck.entries.some(e=>e.printingId===c.id),false);
});
for(const strategy of ['spellslinger','graveyard','tokens'])test(`${strategy} uses distinct inferred mechanics and role pools rather than an artifact/creature quota`,async()=>{
 const f=fixture();const commanderText={spellslinger:'Whenever you cast an instant or sorcery spell, draw a card.',graveyard:'Whenever a card leaves your graveyard, draw a card.',tokens:'Whenever you create a token, draw a card.'}[strategy];
 const suffix={spellslinger:'',graveyard:' Mill two cards.',tokens:' Create a 1/1 creature token.'}[strategy];
 f.records=f.records.map(c=>{
  if(c.id===f.commander.id)return {...c,frontText:commanderText,rulesText:commanderText};
  if(!f.spells.some(x=>x.id===c.id))return c;
  const type=strategy==='spellslinger'?'Sorcery':'Creature — Test';
  let text=(c.frontText.startsWith('{T}: Add')?'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.':c.frontText)+suffix;
  // Converted non-artifact fixtures need matching mechanics: they previously retained
  // artifact-only triggers after their card types were changed to creatures/spells.
  text=text.replace('Artifacts you control have hexproof.','Target creature gains hexproof until end of turn.').replace(/Whenever you cast an artifact spell/g,strategy==='spellslinger'?'Whenever you cast an instant or sorcery spell':'Whenever another creature you control enters');
  // These synthetic pools now need actual theme payoffs/recursion for hard targets.
  if(strategy==='spellslinger' && f.spells.indexOf(c)<8)text+=' Whenever you cast an instant or sorcery spell this turn, draw a card.';
  if(strategy==='graveyard' && f.spells.indexOf(c)<4)text+=' Return target creature card from your graveyard to your hand.';
  return {...c,frontType:type,type,frontText:text,rulesText:text};
 });
 const commander=f.records.find(c=>c.id===f.commander.id);f.deck=model.select(model.add(model.createDeck(),commander,{zone:'commander'}),commander);
 const client=fakeClient(f),r=await run(f,{}, {client});assert.equal(r.strategy,strategy);assert.equal(model.count(r.deck),100);assert.equal(rules.validate(r.deck,client).status,'valid');if(strategy==='spellslinger')assert.ok(r.deck.entries.filter(e=>e.zone==='main'&&!/^Basic/.test(r.deck.cards[e.printingId].frontType)).every(e=>r.deck.cards[e.printingId].frontType==='Sorcery'));
});
test('every power grade changes efficiency/interaction preferences without changing legality rules',async()=>{
 const f=fixture(),profiles=[1,2,3,4,5].map(bracket=>gen.targets([f.commander],gen.options({bracket}),'artifacts'));assert.deepEqual(profiles.map(p=>p.interaction),[7,8,9,10,11]);assert.ok(profiles[4].land<profiles[0].land);for(const bracket of [1,3,5]){const client=fakeClient(f),r=await run(f,{bracket},{client});assert.equal(rules.validate(r.deck,client).status,'valid');assert.equal(model.count(r.deck),100);}
});
test('legality changed in the final Scryfall refresh rejects the candidate instead of bypassing validation',async()=>{
 const f=fixture(),client=fakeClient(f),refresh=client.refresh;let calls=0;client.refresh=async(...args)=>{const cards=await refresh(...args);return ++calls>1?cards.map((c,i)=>i===2?{...c,legalities:{...c.legalities,commander:'banned'}}:c):cards;};const before=JSON.stringify(f.deck);await assert.rejects(run(f,{}, {client}),/banned/);assert.equal(JSON.stringify(f.deck),before);
});
