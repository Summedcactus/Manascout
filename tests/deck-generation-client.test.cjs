const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('../assets/js/deck-client.js');
const data=require('../assets/js/deck-data.js');
const store=require('../assets/js/deck-store.js');
const {raw,id,card}=require('./helpers/cards.cjs');
const response=(value,status=200)=>({ok:status===200,status,json:async()=>value});
test('generation pools use the paced client, verified Commander/paper search, exact identities, finishes and cache',async()=>{
 const calls=[],c=createClient({interval:0,fetchImpl:async url=>{calls.push(url);return response({data:[raw(1,{finishes:['foil'],prices:{eur:null,eur_foil:'2.35'},mana_cost:'{2}{G}',edhrec_rank:44})],has_more:false});}});const cards=await c.candidates('id<=g t:artifact');assert.equal(cards[0].id,id(1));assert.equal(cards[0].finish,'foil');assert.deepEqual(cards[0].availableFinishes,['foil']);assert.equal(cards[0].pricesEUR.nonfoil,null);assert.equal(cards[0].pricesEUR.foil,2.35);assert.equal(cards[0].manaCost,'{2}{G}');assert.equal(c.isVerified(cards[0]),true);await c.candidates('id<=g t:artifact');assert.equal(calls.length,1);assert.equal(new URL(calls[0]).searchParams.get('q'),'f:commander game:paper (id<=g t:artifact)');assert.equal(new URL(calls[0]).searchParams.get('unique'),'cards');
});
test('pool pagination is bounded and rejects foreign next-page URLs',async()=>{
 let calls=0;const c=createClient({interval:0,fetchImpl:async()=>response({data:[raw(++calls)],has_more:true,next_page:'https://api.scryfall.com/cards/search?page='+calls})});assert.equal((await c.candidates('t:artifact',{pages:2})).length,2);assert.equal(calls,2);const bad=createClient({interval:0,fetchImpl:async()=>response({data:[raw()],has_more:true,next_page:'https://example.org/cards/search'})});await assert.rejects(bad.candidates('t:artifact',{pages:2}),/Invalid candidate pool page/);await assert.rejects(c.candidates('x',{pages:20}),/Invalid generation/);
});
test('404 is an empty pool; malformed or missing responses are errors and never invent cards',async()=>{
 const missing=createClient({interval:0,fetchImpl:async()=>response({},404)});assert.deepEqual(await missing.candidates('nothing'),[]);for(const value of [{},{data:[{}]},{data:'not-an-array'}]){const c=createClient({interval:0,fetchImpl:async()=>response(value)});await assert.rejects(c.candidates('x'));}
});
test('uncooperative late fetch is ignored after cancellation',async()=>{
 const controller=new AbortController();const c=createClient({interval:0,fetchImpl:async()=>{controller.abort();return response({data:[raw()],has_more:false});}});await assert.rejects(c.candidates('x',{signal:controller.signal}),{name:'AbortError'});
});
test('EUR/GBP conversion requires a current dated response and is cached',async()=>{
 let calls=0;const now=Date.parse('2026-11-04T12:00:00Z');const c=createClient({interval:0,now:()=>now,fetchImpl:async url=>{calls++;assert.equal(new URL(url).hostname,'api.frankfurter.dev');return response({base:'EUR',date:'2026-11-03',rates:{GBP:.86}});}});assert.deepEqual(await c.euroRate(),{rate:.86,date:'2026-11-03'});await c.euroRate();assert.equal(calls,1);
 for(const value of [{base:'EUR',date:'2026-01-01',rates:{GBP:.8}},{base:'USD',date:'2026-11-04',rates:{GBP:.8}},{base:'EUR',date:'bad',rates:{GBP:.8}},{base:'EUR',date:'2026-11-04',rates:{GBP:0}},{base:'EUR',date:'2026-11-04',rates:{GBP:'0.8'}}])await assert.rejects(createClient({interval:0,now:()=>now,fetchImpl:async()=>response(value)}).euroRate(),/reference rate is unavailable/);
});
test('unavailable prices stay unknown; old records load with additive defaults and no schema migration',()=>{
 for(const value of [null,undefined,'','nonsense','-1','0','Infinity']){const c=data.normaliseCard(raw(1,{prices:{eur:value,eur_foil:value}}),{id:id(1)});assert.equal(c.pricesEUR.nonfoil,null);assert.equal(c.pricesEUR.foil,null);}const model=require('../assets/js/deck-model.js');const old=card();delete old.manaCost;delete old.pricesEUR;delete old.edhrecRank;const draft=store.sanitizeDeck(model.add(model.createDeck(),old));assert.equal(draft.schemaVersion,1);assert.equal(draft.cards[old.id].manaCost,'');assert.equal(draft.cards[old.id].pricesEUR.nonfoil,null);assert.equal(draft.entries[0].printingId,old.id);
});
test('generation requests do not bypass the existing 429/timeout handling or automatically retry',async()=>{
 let calls=0;const c=createClient({interval:0,fetchImpl:async()=>{calls++;return response({},429);}});await assert.rejects(c.candidates('x'),/Scryfall is busy/);assert.equal(calls,1);const slow=createClient({interval:0,timeout:2,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))});await assert.rejects(slow.candidates('x'),/timed out/);
});
