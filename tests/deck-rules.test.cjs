const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../assets/js/deck-model.js');
const rules = require('../assets/js/deck-rules.js');
const { card, id } = require('./helpers/cards.cjs');
const { mount } = require('./helpers/studio-dom.cjs');
const { createClient } = require('../assets/js/deck-client.js');
const { raw } = require('./helpers/cards.cjs');
const context = { isVerified:()=>true,proof:()=>true };
const commander = (n=1,extra={}) => card(n,{type_line:'Legendary Creature — Test',cmc:3,color_identity:['G'],...extra});
const forest = card(99,{name:'Fixture Forest',type_line:'Basic Land — Forest',color_identity:['G']});
function fullCommander(c=commander()) { return model.add(model.add(model.createDeck(),c,{zone:'commander'}),forest,{quantity:99}); }
function pauper() { return model.add(model.createDeck({format:'pauper'}),forest,{quantity:60}); }
const issues = (d,ctx=context) => rules.validate(d,ctx).issues;
const has = (d,code,ctx=context) => issues(d,ctx).some(i=>i.code===code);
const drain=()=>new Promise(r=>setTimeout(r,15));

test('only a complete, current, fully checked Commander deck passes',()=>{
  const d=fullCommander();assert.equal(rules.validate(d,context).complete,true);
  assert.equal(rules.validate(d).complete,false);assert.equal(rules.validate(d).status,'unverified');
  assert.equal(has(d,'eligibility-pending',{...context,proof:()=>null}),true);
  assert.equal(has(d,'commander-ineligible',{...context,proof:()=>false}),true);
});
test('missing commander, 99/101 cards, duplicated assignment and Commander sideboard are identified',()=>{
  assert.equal(has(model.add(model.createDeck(),forest,{quantity:100}),'commander-missing'),true);
  let d=fullCommander();d=model.setQuantity(d,d.entries.find(e=>e.zone==='main').key,98);assert.equal(has(d,'size'),true);
  d=model.setQuantity(d,d.entries.find(e=>e.zone==='main').key,100);assert.equal(rules.validate(d,context).status,'illegal');
  d=model.add(fullCommander(),commander(2),{zone:'commander',quantity:2});assert.equal(has(d,'commander-count'),true);assert.equal(has(d,'commander-quantity'),true);
  assert.equal(has(model.add(fullCommander(),card(3),{zone:'sideboard'}),'sideboard'),true);
});
test('colour identity uses all colours, including hybrid/back-face identities and basic land types',()=>{
  assert.equal(has(model.add(fullCommander(),card(2,{color_identity:['G','U']})),'identity'),true);
  assert.equal(has(model.add(fullCommander(),card(2,{type_line:'Land — Island',color_identity:[]})),'identity'),true);
  assert.equal(has(fullCommander(commander(1,{color_identity:[]})),'identity'),true);
  const two=model.add(model.add(model.createDeck(),commander(1,{oracle_text:'Partner',color_identity:['G']}),{zone:'commander'}),commander(2,{oracle_text:'Partner',color_identity:['U']}),{zone:'commander'});
  assert.equal(has(model.add(two,card(3,{color_identity:['G','U']})),'identity'),false);
});
test('singleton combines languages, finishes, printings, command zone and Oracle aliases',()=>{
  const a=card(2,{name:'Same English Name',oracle_id:id(100)}),b=card(3,{name:'Same English Name',lang:'ja',oracle_id:id(101)});
  assert.equal(has(model.add(model.add(fullCommander(),a),b,{finish:'foil'}),'copies'),true);
  const alias=card(4,{name:'Interchangeable Fixture',oracle_id:a.oracleId});
  assert.equal(has(model.add(model.add(fullCommander(),a),alias),'copies'),true);
  assert.equal(has(model.add(fullCommander(),commander()),'copies'),true);
});
test('basic/snow lands, unlimited Oracle exceptions and explicit seven/nine-copy caps work',()=>{
  assert.equal(rules.copyLimit(forest,'commander'),Infinity);
  assert.equal(rules.copyLimit(card(2,{type_line:'Basic Snow Land — Island'}),'pauper'),Infinity);
  const any=card(3,{name:'Many Fixtures',oracle_text:'A deck can have any number of cards named Many Fixtures.'});
  assert.equal(rules.copyLimit(any,'commander'),Infinity);
  for(const [word,max] of [['seven',7],['nine',9]]) {
    const cap=card(4,{name:'Capped Fixture',oracle_text:`A deck can have up to ${word} cards named Capped Fixture.`});
    assert.equal(rules.copyLimit(cap,'commander'),max);assert.equal(has(model.add(model.createDeck(),cap,{quantity:max+1}),'copies'),true);
  }
  assert.equal(rules.copyLimit(card(5,{oracle_text:'A deck can have any number of cards named Another Card.'}),'commander'),1);
});
test('plain Partner, recognised named variants and legacy Friends forever match only their families',()=>{
  const partner=commander(1,{oracle_text:'Partner (Reminder.)'});
  assert.equal(rules.pair(partner,commander(2,{oracle_text:'Partner'})).valid,true);
  for(const variant of ['Character select','Father & son','Friends forever','Survivors']) assert.equal(rules.pair(commander(1,{oracle_text:`Partner—${variant} (Reminder.)`}),commander(2,{oracle_text:`Partner—${variant}`})).valid,true);
  assert.equal(rules.pair(partner,commander(2,{oracle_text:'Partner—Friends forever'})).valid,false);
  assert.equal(rules.pair(commander(1,{oracle_text:'Friends forever'}),commander(2,{oracle_text:'Partner—Friends forever'})).valid,true);
});
test('Partner with requires reciprocal English names, not generic Partner or just one named ability',()=>{
  const a=commander(1,{name:'Fixture Alpha',oracle_text:'Partner with Fixture Beta (Reminder.)'}),b=commander(2,{name:'Fixture Beta',oracle_text:'Partner with Fixture Alpha'});
  assert.equal(rules.pair(a,b).valid,true);
  assert.equal(rules.pair(a,commander(3,{name:'Fixture Beta',oracle_text:'Partner'})).valid,false);
  assert.equal(rules.pair(a,commander(3,{name:'Fixture Gamma',oracle_text:'Partner with Fixture Alpha'})).valid,false);
});
test('Choose a Background allows one legendary Background, never Background alone or arbitrary partner',()=>{
  const a=commander(1,{oracle_text:'Choose a Background'}),b=card(2,{type_line:'Legendary Enchantment — Background'});
  assert.equal(rules.pair(a,b).valid,true);assert.equal(rules.pair(commander(3,{oracle_text:'Partner'}),b).valid,false);
  assert.equal(has(model.add(model.createDeck(),b,{zone:'commander'}),'background'),true);
  let d=model.add(model.add(model.createDeck(),a,{zone:'commander'}),b,{zone:'commander'});d=model.add(d,forest,{quantity:98});
  assert.equal(rules.validate(d,{...context,proof:c=>c.id===b.id?false:true}).complete,true);
  assert.equal(rules.pair(a,card(4,{type_line:'Enchantment — Background'})).valid,false);
});
test("Doctor's companion needs exactly a legendary Time Lord Doctor without additional creature types",()=>{
  const a=commander(1,{oracle_text:"Doctor's companion"});
  assert.equal(rules.pair(a,commander(2,{type_line:'Legendary Creature — Time Lord Doctor'})).valid,true);
  assert.equal(rules.pair(a,commander(3,{type_line:'Legendary Creature — Human Time Lord Doctor'})).valid,false);
  assert.equal(rules.pair(a,commander(4,{type_line:'Legendary Creature — Shapeshifter',keywords:['Changeling']})).valid,false);
  assert.equal(rules.pair(a,commander(5,{type_line:'Legendary Creature — Time Lord Doctor',keywords:['Changeling']})).valid,false);
});
test('unsupported named partner variants, pregame colour choices and third commanders never pass',()=>{
  const a=commander(1,{oracle_text:'Partner—Unknown future group'}),b=commander(2,{oracle_text:'Partner—Unknown future group'});
  assert.equal(rules.pair(a,b).unsupported,true);
  const pair=model.add(model.add(model.createDeck(),a,{zone:'commander'}),b,{zone:'commander'});assert.equal(rules.validate(pair,context).status,'unsupported');
  assert.equal(has(fullCommander(commander(1,{oracle_text:'If this is your commander, choose a color before the game begins.'})),'commander-choice'),true);
  assert.equal(has(model.add(pair,commander(3),{zone:'commander'}),'commander-count'),true);
});
test('Pauper is current legality, not printed rarity; 60+ main, optional 15 side, no commanders',()=>{
  const d=pauper();assert.equal(rules.validate(d,context).complete,true);
  const rare=card(2,{rarity:'rare',legalities:{commander:'legal',pauper:'legal'}});assert.equal(has(model.add(d,rare),'legality'),false);
  const common=card(3,{rarity:'common',legalities:{commander:'legal',pauper:'banned'}});assert.equal(has(model.add(d,common),'legality'),true);
  assert.equal(has(model.add(d,forest,{zone:'sideboard',quantity:16}),'sideboard'),true);
  assert.equal(has(model.add(model.createDeck({format:'pauper'}),forest,{zone:'sideboard',quantity:15}),'size'),true);
  assert.equal(has(model.add(d,commander(),{zone:'commander'}),'pauper-commanders'),true);
  assert.equal(rules.validate(model.add(d,forest,{quantity:20}),context).complete,true);
});
test('Pauper four-copy cap spans main/sideboard and different printings, with real text exceptions',()=>{
  const c=card(2);let d=model.add(pauper(),c,{quantity:3});d=model.add(d,card(3,{name:c.name,oracle_id:c.oracleId}),{zone:'sideboard',quantity:2});assert.equal(has(d,'copies'),true);
  const any=card(4,{name:'Many Fixtures',oracle_text:'A deck can have any number of cards named Many Fixtures.'});assert.equal(has(model.add(pauper(),any,{quantity:30}),'copies'),false);
});
test('banned, missing, unsupported physical printings and unavailable finishes prevent a passing result',()=>{
  for(const extra of [{legalities:{commander:'banned'}},{games:['mtgo']},{border_color:'gold'},{security_stamp:'acorn'},{layout:'token'},{oversized:true}]) assert.equal(rules.validate(fullCommander(commander(1,extra)),context).complete,false);
  const missing=fullCommander(commander(1,{oracle_id:undefined,color_identity:undefined}));assert.equal(has(missing,'missing-data'),true);
  let d=fullCommander();d={...d,entries:d.entries.map(e=>({...e,finish:'etched'}))};assert.equal(has(d,'finish'),true);
  assert.equal(rules.validate(fullCommander(),{...context,isVerified:()=>false}).status,'unverified');
});
test('statistics are quantity weighted, exclude lands from curve and sideboard from dashboard',()=>{
  let d=model.add(model.add(model.createDeck(),commander(),{zone:'commander'}),forest,{quantity:95});d=model.add(d,card(2));d=model.add(d,card(3,{cmc:2}),{quantity:3});d=model.add(d,card(4,{cmc:99}),{zone:'sideboard',quantity:15});
  const s=rules.statistics(d);assert.equal(s.count,100);assert.equal(s.lands,95);assert.equal(s.creatures,1);assert.equal(s.average,1.8);assert.deepEqual(s.curve,[1,0,3,1,0,0,0,0]);assert.equal(s.distribution.G,96);assert.equal(s.distribution.C,4);
  assert.equal(rules.statistics(model.createDeck()).average,null);
});
test('front-face/combined split types, multicolour groups, 7+ bin and unknown mana stay explicit',()=>{
  let d=model.add(model.createDeck({format:'pauper'}),card(1,{cmc:8,type_line:'Artifact Creature — Test',color_identity:['U','R']}),{quantity:2});d=model.add(d,card(2,{cmc:3,type_line:'Instant // Sorcery',layout:'split',card_faces:[{type_line:'Instant'},{type_line:'Sorcery'}]}));d=model.add(d,card(3,{cmc:undefined}));
  const s=rules.statistics(d);assert.equal(s.curve[7],2);assert.equal(s.types.Artifact,3);assert.equal(s.types.Creature,2);assert.equal(s.types.Instant,1);assert.equal(s.types.Sorcery,1);assert.equal(s.unknownMana,1);assert.equal(s.distribution.U,2);assert.equal(s.distribution.R,2);
});
test('UI identifies an ineligible starting card and allows it in the 99 with live statistics',async t=>{
  const c=card();let eligible=null;const client={printing:async()=>c,isVerified:()=>true,proof:()=>eligible,commanderEligibility:async()=>{eligible=false;return false;},clearProofs(){},refresh:async cs=>cs};
  const s=mount({client,search:`?printing=${c.id}`});t.after(s.cleanup);await drain();
  assert.match(s.el('preview-legality').textContent,/Not eligible/);assert.equal(s.el('preview-commander').disabled,true);assert.equal(s.el('preview-add').textContent,'Add to the 99 +');
  await s.el('preview-add').emit('click');assert.equal(s.el('stat-count').textContent,'1 / 100');assert.equal(s.el('stat-average').textContent,'0.00');assert.equal(s.el('deck-validity').textContent,'Incomplete deck');
});
test('UI commander assignment moves an existing main copy and counts it only once',async t=>{
  const c=commander();let eligible=null;const client={printing:async()=>c,isVerified:()=>true,proof:()=>eligible,commanderEligibility:async()=>{eligible=true;return true;},clearProofs(){},refresh:async cs=>cs};
  const s=mount({client,search:`?printing=${c.id}`});t.after(s.cleanup);await drain();await s.el('preview-add').emit('click');await s.el('preview-commander').emit('click');
  assert.equal(s.el('stat-commanders').textContent,'1');assert.equal(s.el('stat-count').textContent,'1 / 100');assert.match(s.el('deck-entries').textContent,/Command zone/);
  assert.equal(s.el('deck-entries').querySelector('[data-action="increase"]').disabled,true);
});
test('commander query proofs cache, expire and treat 404 as ineligible without inferring from type',async()=>{
  let now=0,calls=0;const c=commander();const client=createClient({interval:0,now:()=>now,fetchImpl:async url=>{calls++;assert.match(url,/is%3Acommander/);return {ok:true,status:200,json:async()=>({data:[{oracle_id:c.oracleId}]})};}});
  assert.equal(await client.commanderEligibility(c),true);assert.equal(await client.commanderEligibility(c),true);assert.equal(calls,1);assert.equal(client.proof(c),true);
  now=900001;assert.equal(client.proof(c),null);
  const no=createClient({interval:0,fetchImpl:async()=>({ok:false,status:404})});assert.equal(await no.commanderEligibility(c),false);assert.equal(no.proof(c),false);
});
test('freshness expires by time; missing collection responses invalidate prior verification',async()=>{
  let now=0;const client=createClient({interval:0,now:()=>now,fetchImpl:async url=>({ok:true,status:200,json:async()=>url.endsWith('/collection')?{data:[]}:raw()})});
  const c=await client.printing({id:id(1)});assert.equal(client.isVerified(c),true);now=900001;assert.equal(client.isVerified(c),false);
  const fresh=await client.printing({id:id(1)});assert.equal(client.isVerified(fresh),true);assert.deepEqual(await client.refresh([fresh]),[]);assert.equal(client.isVerified(fresh),false);
});
test('unknown identity/physical metadata never quietly becomes colourless or complete',()=>{
  assert.equal(has(fullCommander(commander(1,{color_identity:['?']})),'missing-data'),true);
  assert.equal(has(fullCommander(commander(1,{border_color:undefined,oversized:undefined})),'printing-data'),true);
});
test('missing finish data disables Add and is never labelled as a foil',async t=>{
  const c=card(1,{finishes:undefined});const client={printing:async()=>c,isVerified:()=>true,proof:()=>false,commanderEligibility:async()=>false};
  const s=mount({client,search:`?printing=${c.id}`});t.after(s.cleanup);await drain();
  assert.equal(s.el('preview-finish').textContent,'Not supplied');assert.equal(s.el('preview-add').disabled,true);
});
