/* Actual client + generator + rules + storage with synthetic HTTP, never live facts. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/generation.cjs');
const {raw}=require('./helpers/cards.cjs');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const gen=require('../assets/js/deck-generator.js');
const model=require('../assets/js/deck-model.js');
const rules=require('../assets/js/deck-rules.js');
const {createClient}=require('../assets/js/deck-client.js');
const store=require('../assets/js/deck-store.js');
for(const mode of ['commander','seed','partners'])test(`production-module generation journey: ${mode}, current proofs, exact prints, 100 cards and saved restore`,async()=>{
 const f=fixture({seed:mode==='seed',pair:mode==='partners'});
 const raws=f.records.map((c,i)=>raw(i+1,{id:c.id,oracle_id:c.oracleId,name:c.name,type_line:c.frontType,oracle_text:c.frontText,cmc:Number(c.manaValue),color_identity:c.colorIdentity,mana_cost:c.manaCost,finishes:c.availableFinishes,prices:{eur:'0.10',eur_foil:'0.20'}}));
 const calls=[];
 const client=createClient({interval:0,fetchImpl:async(url,opts)=>{
  calls.push(url);const u=new URL(url);let data;
  if(u.pathname==='/cards/collection'){const ids=JSON.parse(opts.body).identifiers.map(x=>x.id);data=raws.filter(c=>ids.includes(c.id));}
  else if(u.pathname==='/cards/search'){const q=u.searchParams.get('q');if(q.includes('oracleid:'))data=raws.filter(c=>q.includes(c.oracle_id)&&/Legendary Creature/.test(c.type_line));else if(q.includes('is:commander'))data=raws.filter(c=>/Legendary Creature/.test(c.type_line));else data=raws;}
  else throw Error('Unexpected URL');
  return {ok:data.length>0,status:data.length?200:404,json:async()=>({data,has_more:false})};
 }});
 const result=await gen.generate(f.deck,{}, {client,random:()=>.5});assert.equal(rules.validate(result.deck,client).status,'valid');assert.equal(model.count(result.deck),100);assert.equal(model.count(result.deck,'main'),mode==='partners'?98:99);assert.deepEqual(result.deck.selection,f.deck.selection);
 const storage=new MemoryStorage(),p=store.createStore({storage});p.save(result.deck);const loaded=p.loadActive().deck;assert.deepEqual(loaded.entries,result.deck.entries);assert.deepEqual(loaded.selection,result.deck.selection);assert.notEqual(rules.validate(loaded,client).status,'valid');let restored=model.replaceRecords(loaded,await client.refresh(Object.values(loaded.cards)));for(const e of restored.entries.filter(e=>e.zone==='commander'))await client.commanderEligibility(restored.cards[e.printingId]);assert.equal(rules.validate(restored,client).status,'valid');assert.ok(calls.length<25);
 const beforeRepeat=calls.length;const repeated=await gen.generate(restored,{}, {client,random:()=>.5});assert.equal(rules.validate(repeated.deck,client).status,'valid');assert.equal(model.count(repeated.deck),100);assert.ok(calls.length-beforeRepeat<6,'A repeat generation should reuse cached role pools, then freshly recheck chosen records.');
});
