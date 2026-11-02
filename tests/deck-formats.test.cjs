/* Synthetic rule scenarios. No hardcoded real-card bans or live API claims. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const formats=require('../assets/js/deck-formats.js');
const model=require('../assets/js/deck-model.js');
const rules=require('../assets/js/deck-rules.js');
const {createClient}=require('../assets/js/deck-client.js');
const {card,raw,id}=require('./helpers/cards.cjs');
const checked={isVerified:()=>true,proof:()=>true};
const has=(deck,code)=>rules.validate(deck,checked).issues.some(issue=>issue.code===code);
const basics=(profile,n=900)=>card(n,{name:'Synthetic Forest',type_line:'Basic Land — Forest',color_identity:['G'],games:[profile.platform]});
const leader=(profile,n=901,extra={})=>card(n,{name:'Synthetic Leader '+n,type_line:profile.signature?'Legendary Planeswalker — Fixture':'Legendary Creature — Fixture',color_identity:['G'],games:[profile.platform],...extra});
function complete(profile) {
 let deck=model.createDeck({format:profile.id}),used=0;
 if(profile.leaders){const c=leader(profile);deck=model.add(deck,c,{zone:'commander'});used++;
 if(profile.signature){deck=model.add(deck,card(902,{type_line:'Instant',color_identity:['G']}),{zone:'signature',assignedTo:c.id});used++;}}
 return model.add(deck,basics(profile),{quantity:profile.min-used});
}
for(const profile of formats.profiles) {
 test(`${profile.id}: correct size, platform, special zones, copies and sideboard pass`,()=>{
  let deck=complete(profile);const result=rules.validate(deck,checked);assert.equal(result.complete,true,JSON.stringify(result.issues));assert.equal(result.total,profile.min);
  assert.equal(rules.statistics(deck).count,profile.min);
  if(profile.sideboard){deck=model.add(deck,basics(profile),{zone:'sideboard',quantity:15});assert.equal(rules.validate(deck,checked).complete,true);assert.equal(has(model.add(deck,basics(profile),{zone:'sideboard'}),'sideboard'),true);}
  else assert.equal(has(model.add(deck,basics(profile),{zone:'sideboard'}),'sideboard'),true);
  const main=deck.entries.find(e=>e.zone==='main');assert.equal(has(model.setQuantity(deck,main.key,main.quantity-1),'size'),true);
  assert.equal(has(model.setQuantity(deck,main.key,(profile.max||profile.min)+1),'size'),!!profile.max);
 });
 test(`${profile.id}: current legality, copy cap and exact-printing availability cannot be bypassed`,()=>{
  const deck=complete(profile),extra={games:[profile.platform]};
  const c=card(903,extra);assert.equal(has(model.add(deck,c,{quantity:profile.copies+1}),'copies'),true);
  for(const status of ['banned','not_legal']) assert.equal(has(model.add(deck,card(904,{...extra,legalities:{[profile.legalityKey]:status}})),'legality'),true);
  const unknown=model.add(deck,card(905,{...extra,legalities:{}}));assert.equal(has(unknown,'legality-unknown'),true);assert.equal(rules.validate(unknown,checked).complete,false);
  assert.equal(has(model.add(deck,card(906,{games:[profile.platform==='paper'?'arena':'paper']})),'printing'),true);
  assert.equal(rules.validate(deck,{...checked,isVerified:()=>false}).complete,false);
 });
}
test('restricted cards are one total in Vintage and Timeless, including Oracle copy exceptions',()=>{
 for(const format of ['vintage','timeless']){const p=formats.get(format),deck=complete(p);
 const c=card(2,{name:'Restricted fixture',games:[p.platform],oracle_text:'A deck can have any number of cards named Restricted fixture.',legalities:{[p.legalityKey]:'restricted'}});
 assert.equal(rules.validate(model.add(deck,c),checked).complete,true);
 const other=card(3,{name:c.name,oracle_id:c.oracleId,games:[p.platform],legalities:{[p.legalityKey]:'restricted'}});
 assert.equal(has(model.add(model.add(deck,c),other,{zone:'sideboard',finish:'foil'}),'restricted'),true);
 assert.equal(has(model.add(deck,c,{quantity:2}),'restricted'),true);
 }
 assert.equal(has(model.add(complete(formats.get('standard')),card(4,{legalities:{standard:'restricted'}})),'legality'),true);
});
test('Oracle unlimited and fixed caps apply to every profile, with singleton special zones included',()=>{
 for(const p of formats.profiles){
 const any=card(2,{name:'Many fixtures',games:[p.platform],oracle_text:'A deck can have any number of cards named Many fixtures.'});
 assert.equal(has(model.add(complete(p),any,{quantity:20}),'copies'),false);
 const cap=card(3,{name:'Capped fixtures',games:[p.platform],oracle_text:'A deck can have up to nine cards named Capped fixtures.'});
 assert.equal(has(model.add(complete(p),cap,{quantity:9}),'copies'),false);assert.equal(has(model.add(complete(p),cap,{quantity:10}),'copies'),true);
 }
});
test('all formats retain unknown legality as unknown; no fallback to Commander, rarity or other pools',()=>{
 const normalized=card(1,{rarity:'common',legalities:{commander:'legal',standard:'not_legal',vintage:'restricted',made_up:'legal'}});
 assert.equal(normalized.legalities.standard,'not_legal');assert.equal(normalized.legalities.vintage,'restricted');assert.equal(normalized.legalities.pauper,'unknown');assert.equal('made_up' in normalized.legalities,false);
 assert.equal(model.createDeck().format,'commander');assert.throws(()=>model.createDeck({format:'draft'}));assert.throws(()=>model.edit(model.createDeck(),{format:'sealed'}));
});
test('Brawl permits verified leader types, requires a legendary front and one commander only',()=>{
 for(const format of ['brawl','standardbrawl']){const p=formats.get(format);
 for(const type of ['Legendary Creature — Test','Legendary Planeswalker — Test','Legendary Artifact — Vehicle','Legendary Artifact — Spacecraft']){
 const c=leader(p,2,{type_line:type,power:'3',toughness:'3'});assert.equal(rules.leaderEligibility(c,p),true);
 }
 for(const type of ['Creature — Test','Legendary Artifact','Artifact — Vehicle'])assert.equal(rules.leaderEligibility(leader(p,2,{type_line:type}),p),false);
 assert.equal(rules.leaderEligibility(leader(p,2,{type_line:'Legendary Artifact — Spacecraft'}),p),false);
 assert.equal(rules.leaderEligibility({...leader(p),frontType:'Legendary Artifact — Spacecraft',hasPrintedPT:null},p),null);
 assert.equal(has(model.add(complete(p),leader(p,3,{oracle_text:'Partner'}),{zone:'commander'}),'commander-count'),true);
 assert.equal(rules.validate(complete(p),{...checked,proof:()=>false}).complete,true);
 }
});
test('Brawl colourless basic-land exception is one basic land type and never applies to nonbasics',()=>{
 const p=formats.get('brawl'),c=leader(p,1,{color_identity:[]});let d=model.add(model.createDeck({format:p.id}),c,{zone:'commander'});d=model.add(d,basics(p),{quantity:99});assert.equal(rules.validate(d,checked).complete,true);
 assert.equal(has(model.add(d,card(2,{games:['arena'],type_line:'Basic Land — Island',color_identity:['U']})),'brawl-basics'),true);
 assert.equal(has(model.add(d,card(3,{games:['arena'],type_line:'Land — Forest',color_identity:[]})),'identity'),true);
 assert.equal(has(model.add(d,card(4,{games:['arena'],type_line:'Artifact',color_identity:['G']})),'identity'),true);
 assert.equal(has(model.add(d,card(5,{games:['arena'],type_line:'Basic Land',color_identity:[]})),'identity'),false);
 const normal=complete(p);assert.equal(has(model.add(normal,card(6,{games:['arena'],type_line:'Land — Island',color_identity:[]})),'identity'),true);
});
test('Oathbreaker requires a front-face planeswalker and a signature spell for each leader',()=>{
 const p=formats.get('oathbreaker'),d=complete(p);assert.equal(rules.validate(d,checked).complete,true);
 assert.equal(rules.leaderEligibility(leader(p,1,{type_line:'Legendary Creature — Test'}),p),false);
 const sig=d.entries.find(e=>e.zone==='signature');assert.equal(has(model.setQuantity(d,sig.key,0),'signature-count'),true);
 assert.equal(has(model.setQuantity(d,sig.key,2),'signature-quantity'),true);
 assert.equal(has({...d,entries:d.entries.map(e=>e.zone==='signature'?{...e,assignedTo:id(90)}:e)},'signature-owner'),true);
 assert.equal(has({...d,cards:{...d.cards,[sig.printingId]:{...d.cards[sig.printingId],frontType:'Creature — Test',type:'Creature // Instant',layout:'adventure'}}},'signature-type'),true);
 assert.equal(has({...d,cards:{...d.cards,[sig.printingId]:{...d.cards[sig.printingId],frontType:'Instant',type:'Instant // Sorcery',layout:'split'}}},'signature-type'),false);
});
test('Oathbreaker partners have separate signature owners and per-owner colour identity',()=>{
 const p=formats.get('oathbreaker'),a=leader(p,1,{oracle_text:'Partner',color_identity:['G']}),b=leader(p,2,{oracle_text:'Partner',color_identity:['U']});
 let d=model.add(model.add(model.createDeck({format:p.id}),a,{zone:'commander'}),b,{zone:'commander'});
 d=model.add(d,card(3,{type_line:'Instant',color_identity:['G']}),{zone:'signature',assignedTo:a.id});d=model.add(d,card(4,{type_line:'Sorcery',color_identity:['U']}),{zone:'signature',assignedTo:b.id});d=model.add(d,basics(p),{quantity:56});assert.equal(rules.validate(d,checked).complete,true);
 assert.equal(has({...d,entries:d.entries.map(e=>e.zone==='signature'?{...e,assignedTo:a.id}:e)},'signature-owner'),true);
 assert.equal(has({...d,entries:d.entries.map(e=>e.zone==='signature'?{...e,assignedTo:e.assignedTo===a.id?b.id:a.id}:e)},'signature-identity'),true);
 const nonpartner={...d,cards:{...d.cards,[b.id]:{...b,frontText:''}}};assert.equal(has(nonpartner,'commander-pair'),true);
});
test('Gladiator has 100+ singleton construction, no special zones, and no rebalanced A- versions',()=>{
 const p=formats.get('gladiator'),d=complete(p);assert.equal(has(model.add(d,card(1,{games:['arena'],name:'A-Synthetic card'})),'rebalanced'),true);
 assert.equal(has(model.add(d,leader(p),{zone:'commander'}),'command-zone'),true);
 assert.equal(has(model.add(d,card(2,{games:['arena']}),{zone:'signature'}),'signature-zone'),true);
});
test('format switches preserve every card, finish, quantity, selection and incompatible assignment',()=>{
 const p=formats.get('oathbreaker');let d=complete(p);d=model.select(d,Object.values(d.cards)[0],'foil');
 for(const profile of formats.profiles){const switched=model.edit(d,{format:profile.id});assert.deepEqual(switched.entries,d.entries);assert.equal(switched.cards,d.cards);assert.deepEqual(switched.selection,d.selection);if(!profile.signature)assert.equal(has(switched,'signature-zone'),true);}
});
test('search profiles scope actual printing availability and cache each platform separately',async()=>{
 const calls=[];const client=createClient({interval:0,fetchImpl:async url=>{calls.push(url);const game=new URL(url).searchParams.get('q').endsWith('game:arena')?'arena':'paper';return {ok:true,json:async()=>({data:[raw(1,{games:[game]})]})};}});
 const p=await client.search('Fixture',{format:'standard'});const a=await client.search('Fixture',{format:'standard_arena'});
 assert.deepEqual(p.cards[0].games,['paper']);assert.deepEqual(a.cards[0].games,['arena']);assert.equal(calls.length,2);assert.equal(await client.search('Fixture',{format:'standard_arena'}),a);
 assert.equal(new URL(calls[0]).searchParams.get('q'),'(Fixture) game:paper');assert.equal(new URL(calls[1]).searchParams.get('q'),'(Fixture) game:arena');
 await assert.rejects(client.search('Fixture',{format:'draft'}),/Unsupported/);
});
test('outside-game special cards cannot pass as ordinary Constructed deck entries',()=>{
 const d=complete(formats.get('legacy'));
 for(const type of ['Artifact — Attraction','Artifact — Contraption','Dungeon','Conspiracy','Stickers']){const result=rules.validate(model.add(d,card(10,{type_line:type})),checked);assert.equal(result.complete,false);assert.equal(result.issues.some(i=>i.code==='special-deck'),true);}
});
test('meld front parts are playable but meld results and unverified legacy component data cannot pass',()=>{
 const d=complete(formats.get('legacy')),parts=[{id:id(10),component:'meld_part'},{id:id(11),component:'meld_result'}];
 assert.equal(rules.validate(model.add(d,card(10,{layout:'meld',all_parts:parts})),checked).complete,true);
 assert.equal(has(model.add(d,card(11,{layout:'meld',all_parts:parts})),'meld'),true);
 assert.equal(has(model.add(d,card(10,{layout:'meld'})),'meld'),true);
});
