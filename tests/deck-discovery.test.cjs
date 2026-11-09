/* Mocked Scryfall responses and controller events; no live API/visual claim. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createClient}=require('../assets/js/deck-client.js');
const formats=require('../assets/js/deck-formats.js');
const model=require('../assets/js/deck-model.js');
const storageAPI=require('../assets/js/deck-store.js');
const {card,raw,id}=require('./helpers/cards.cjs');
const {mount}=require('./helpers/studio-dom.cjs');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const response=(body,status=200)=>({ok:status===200,status,json:async()=>body});
const drain=()=>new Promise(resolve=>setTimeout(resolve,15));
for(const p of formats.profiles)test(`${p.id}: uncached random requests use their own legality/platform and preserve exact records`,async()=>{
 const calls=[];const client=createClient({interval:0,fetchImpl:async(url,options)=>{calls.push({url,options});return response(raw(calls.length,{games:[p.platform]}));}});
 const first=await client.random({format:p.id}),second=await client.random({format:p.id,excludeOracleId:first.oracleId});
 assert.equal(calls.length,2);assert.equal(first.id,id(1));assert.equal(second.id,id(2));assert.equal(client.isVerified(first),true);assert.equal(client.isVerified(second),true);assert.deepEqual(first.games,[p.platform]);assert.equal(first.legalities[p.legalityKey],'legal');
 for(const call of calls){const u=new URL(call.url);assert.equal(u.pathname,'/cards/random');const q=u.searchParams.get('q');assert.ok(q.includes(`f:${p.legalityKey}`));assert.ok(q.includes(`game:${p.platform}`));assert.equal(call.options.cache,'no-store');if(p.originalVersions)assert.ok(q.includes('-is:rebalanced'));}
 assert.ok(new URL(calls[1].url).searchParams.get('q').includes(`-oracleid:${first.oracleId}`));
});
test('unknown formats and invalid exclusions reject before any request',async()=>{
 let calls=0;const client=createClient({interval:0,fetchImpl:async()=>{calls++;return response(raw());}});await assert.rejects(client.random({format:'draft'}),/supported format/);await assert.rejects(client.random({excludeOracleId:'invalid'}),/identity/);assert.equal(calls,0);
});
test('legality, platform, special printing and missing metadata checks prevent false success',async()=>{
 const cases=[{legalities:{commander:'banned'}},{legalities:{}},{games:['arena']},{id:'invalid'},{id:''},{object:'error'},{oracle_id:undefined},{type_line:undefined},{cmc:undefined},{color_identity:undefined},{border_color:'unknown'},{image_uris:undefined},{finishes:[]},{oversized:true},{border_color:'gold'},{security_stamp:'acorn'},{type_line:'Artifact — Attraction'},{layout:'meld',all_parts:[]}];
 for(const extra of cases){let calls=0;const client=createClient({interval:0,fetchImpl:async()=>{calls++;return response(raw(1,extra));}});await assert.rejects(client.random());assert.equal(calls,1);}
 const c=createClient({interval:0,fetchImpl:async()=>response(raw(1,{games:['arena'],name:'A-Synthetic'}))});await assert.rejects(c.random({format:'gladiator'}),/unrebalanced/);
});
test('restricted Vintage/Timeless cards are eligible, but restricted status never substitutes for other format legality',async()=>{
 for(const format of ['vintage','timeless']){const p=formats.get(format),c=createClient({interval:0,fetchImpl:async()=>response(raw(1,{games:[p.platform],legalities:{[p.legalityKey]:'restricted'}}))});const result=await c.random({format});assert.equal(result.legalities[format],'restricted');}
 const c=createClient({interval:0,fetchImpl:async()=>response(raw(1,{legalities:{standard:'restricted'}}))});await assert.rejects(c.random({format:'standard'}),/could not be verified/);
});
test('repeated Oracle identities reject without retry; unsupported responses do not invalidate an existing verified record',async()=>{
 let calls=0;const c=createClient({interval:0,fetchImpl:async()=>response(raw(1,++calls===1?{}:{legalities:{commander:'banned'}}))});const first=await c.random();await assert.rejects(c.random(),/could not be verified/);assert.equal(c.isVerified(first),true);
 const repeat=createClient({interval:0,fetchImpl:async()=>response(raw())});await assert.rejects(repeat.random({excludeOracleId:card().oracleId}),/repeated/);
});
test('random uses the shared queue, cancellation, timeout and 429 handling without automatic retries',async()=>{
 let calls=0,release;const c=createClient({interval:0,fetchImpl:async url=>{calls++;if(url.includes('/random'))return new Promise(resolve=>release=resolve);return response(raw(2));}});
 const random=c.random(),controller=new AbortController(),queued=c.printing({id:id(2)},{signal:controller.signal}).catch(e=>e);await drain();assert.equal(calls,1);controller.abort();release(response(raw()));await random;assert.equal((await queued).name,'AbortError');assert.equal(calls,1);
 const timed=createClient({interval:0,timeout:2,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))});await assert.rejects(timed.random(),/timed out/);
 let busyCalls=0;const busy=createClient({interval:0,fetchImpl:async()=>{busyCalls++;return response(null,429);}});await assert.rejects(busy.random(),/busy/);assert.equal(busyCalls,1);
});
test('a response arriving after cancellation is ignored before verification',async()=>{
 let release;const c=createClient({interval:0,fetchImpl:()=>new Promise(resolve=>release=resolve)}),controller=new AbortController(),request=c.random({signal:controller.signal});await drain();controller.abort();release(response(raw()));await assert.rejects(request,e=>e.name==='AbortError');
});
function mock(cards=[card()],extra={}){let index=0;return {search:async()=>({cards,nextPage:'',total:cards.length}),autocomplete:async()=>cards.map(c=>c.name),printing:async s=>cards.find(c=>c.id===s.id),random:async()=>cards[index++%cards.length],isVerified:()=>true,proof:()=>false,commanderEligibility:async()=>false,refresh:async old=>old.map(c=>cards.find(v=>v.id===c.id)).filter(Boolean),clearProofs(){},...extra};}
async function choose(s,value){s.el('deck-format').value=value;await s.el('deck-format').emit('change');}
async function search(s){s.el('studio-search').value='Fixture';await s.el('studio-search-form').emit('submit');await drain();}
const button=s=>s.el('studio-discover-random');
test('Discover is a non-submit button beside the field; Search keeps its independent submit control',t=>{
 const s=mount({client:mock()});t.after(s.cleanup);assert.equal(button(s).getAttribute('type'),'button');const row=s.el('studio-search').closest('.ds-search-row');assert.equal(row,button(s).closest('.ds-search-row'));assert.ok(row.querySelector('[type="submit"]'));assert.equal(button(s).getAttribute('aria-describedby'),'discovery-status');
});
test('blank-input discovery opens the existing mobile preview and never adds deck entries',async t=>{
 const c=card(1),storage=new MemoryStorage(),s=mount({storage,narrow:true,client:mock([c])});t.after(s.cleanup);assert.equal(s.el('studio-search').value,'');await button(s).emit('click');assert.equal(s.el('preview-name').textContent,c.name);assert.equal(s.el('preview-id').textContent,c.id);assert.equal(s.el('preview-printing').textContent,`${c.setName} · ${c.setCode} #${c.collectorNumber}`);assert.equal(s.el('card-preview').open,true);assert.equal(s.el('stat-count').textContent,'0 / 100');await s.runTimers(800);let saved=storageAPI.createStore({storage}).loadActive().deck;assert.deepEqual(saved.entries,[]);assert.equal(saved.selection.printingId,c.id);await s.el('preview-add').emit('click');assert.equal(s.el('stat-count').textContent,'1 / 100');await s.el('save-deck').emit('click');saved=storageAPI.createStore({storage}).loadActive().deck;assert.equal(saved.entries[0].printingId,c.id);
});
test('repeat discovery excludes the previous Oracle identity and keeps the existing search DOM and scroll position',async t=>{
 const a=card(1),b=card(2),calls=[],client=mock([a,b],{random:async options=>{calls.push(options);return calls.length===1?a:b;}}),s=mount({client});t.after(s.cleanup);await search(s);const result=s.el('search-results').querySelector('button');s.el('search-results').scrollTop=123;await button(s).emit('click');await s.el('close-preview').emit('click');await button(s).emit('click');assert.equal(calls[0].excludeOracleId,'');assert.equal(calls[1].excludeOracleId,a.oracleId);assert.equal(s.el('preview-id').textContent,b.id);assert.equal(s.el('studio-search').value,'Fixture');assert.equal(s.el('search-results').querySelector('button'),result);assert.equal(s.el('search-results').scrollTop,123);assert.equal(s.el('stat-count').textContent,'0 / 100');
});
test('duplicate clicks are suppressed and the button restores after success',async t=>{
 let calls=0,release;const s=mount({client:mock([card()],{random:()=>{calls++;return new Promise(resolve=>release=resolve);}})});t.after(s.cleanup);const pending=button(s).emit('click');assert.equal(button(s).disabled,true);assert.equal(s.el('discover-random-label').textContent,'Discovering…');await button(s).emit('click');assert.equal(calls,1);release(card());await pending;assert.equal(button(s).disabled,false);assert.equal(s.el('discover-random-label').textContent,'Discover');
});
test('format switches abort discovery and late results cannot overwrite the current selection or newer request',async t=>{
 const calls=[];const a=card(1),b=card(2),s=mount({client:mock([a,b],{random:options=>new Promise(resolve=>calls.push({options,resolve}))})});t.after(s.cleanup);const old=button(s).emit('click');await choose(s,'standard');assert.equal(calls[0].options.signal.aborted,true);assert.equal(button(s).disabled,false);const latest=button(s).emit('click');assert.equal(calls[1].options.format,'standard');calls[0].resolve(a);await old;assert.equal(button(s).disabled,true);assert.equal(s.el('preview-id').textContent,'');calls[1].resolve(b);await latest;assert.equal(s.el('preview-id').textContent,b.id);assert.equal(button(s).disabled,false);
});
test('manual card selection cancels a pending discovery and preserves its exact printing',async t=>{
 let release,signal;const a=card(1),b=card(2),s=mount({client:mock([a,b],{random:options=>{signal=options.signal;return new Promise(resolve=>release=resolve);}})});t.after(s.cleanup);await search(s);const pending=button(s).emit('click');await s.el('search-results').querySelector('[data-action="inspect-search"]').emit('click');assert.equal(signal.aborted,true);release(b);await pending;assert.equal(s.el('preview-id').textContent,a.id);assert.equal(s.el('stat-count').textContent,'0 / 100');
});
test('Escape, page exit and draft switches cancel without adding cards',async t=>{
 for(const operation of ['escape','pagehide','new-deck']){let release,signal;const s=mount({client:mock([card()],{random:options=>{signal=options.signal;return new Promise(resolve=>release=resolve);}})});t.after(s.cleanup);const pending=button(s).emit('click');if(operation==='escape')s.docListeners.keydown.forEach(fn=>fn({key:'Escape',preventDefault(){}}));else if(operation==='pagehide')s.listeners.pagehide.forEach(fn=>fn());else await s.el('new-deck').emit('click');assert.equal(signal.aborted,true);release(card());await pending;assert.equal(s.el('preview-id').textContent,'');assert.equal(s.el('stat-count').textContent,'0 / 100');assert.equal(button(s).disabled,false);}
});
test('network and unverified responses leave the existing deck and selected card usable',async t=>{
 for(const random of [async()=>{throw Error('Connection unavailable');},async()=>card(2,{games:['arena']}),async()=>card(2,{legalities:{commander:'banned'}})]){const a=card(1),s=mount({client:mock([a],{random}),search:`?printing=${a.id}`});t.after(s.cleanup);await drain();await s.el('close-preview').emit('click');await button(s).emit('click');assert.equal(s.el('preview-id').textContent,a.id);assert.match(s.el('discovery-status').textContent,/Discovery unavailable/);assert.equal(button(s).disabled,false);await s.el('preview-add').emit('click');assert.equal(s.el('stat-count').textContent,'1 / 100');}
});
test('saved manual entries, foil choices, name, view, format and quantities survive discovery and reopening',async t=>{
 const a=card(1),b=card(2),storage=new MemoryStorage(),store=storageAPI.createStore({storage});let deck=model.add(model.createDeck({name:'Keep my deck',format:'standard'}),a,{finish:'foil',quantity:3});deck=model.edit(deck,{view:'list'});store.save(deck);const s=mount({storage,client:mock([a,b],{random:async()=>b})});t.after(s.cleanup);await drain();await button(s).emit('click');await s.el('save-deck').emit('click');let saved=store.loadActive().deck;assert.deepEqual(saved.entries,deck.entries);assert.equal(saved.name,deck.name);assert.equal(saved.view,'list');assert.equal(saved.format,'standard');assert.equal(saved.selection.printingId,b.id);const reopened=mount({storage,client:mock([a,b])});t.after(reopened.cleanup);await drain();assert.equal(reopened.el('preview-id').textContent,b.id);assert.equal(reopened.el('stat-count').textContent,'3 / 60+');assert.equal(reopened.el('deck-name').value,'Keep my deck');
});
test('weekly atmosphere stays card-anchored without moving fog or creature shapes',()=>{
 const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('assets/css/home.css','utf8');assert.ok(html.indexOf('class="weekly-card-stage"')<html.indexOf('class="weekly-card-halo"'));assert.ok(html.indexOf('class="weekly-card-halo"')<html.indexOf('id="weekly-card-shell"'));assert.doesNotMatch(html,/class="morgul-(mist|darkness|sparks)/);assert.doesNotMatch(css,/@keyframes msMorgul(Bat|Mist|Shadow)|clip-path: polygon/);assert.match(css,/inset: -11% -16%; width: auto; height: auto/);assert.match(css,/msVoidAtmosphere 16s/);assert.match(css,/msWeeklyFloat 13s/);assert.match(css,/msWeeklyReflection 11s/);assert.match(css,/msWeeklyReflection 17s/);
});
test('the controller passes every current format/profile to discovery and previews its matching platform',async t=>{
 const calls=[];const s=mount({client:mock([],{random:async options=>{calls.push(options);return card(calls.length,{games:[formats.get(options.format).platform]});}})});t.after(s.cleanup);
 for(const profile of formats.profiles){await choose(s,profile.id);await button(s).emit('click');assert.equal(calls.at(-1).format,profile.id);assert.equal(s.el('preview-id').textContent,id(calls.length));assert.match(s.el('discovery-status').textContent,new RegExp(profile.platform));assert.equal(s.el('stat-count').textContent,`0 / ${profile.min}${profile.min===profile.max?'':'+'}`);await s.el('close-preview').emit('click');}
});
test('an in-flight exact-printing handoff prevents discovery races and restores its button afterward',async t=>{
 let release,calls=0;const a=card(1),b=card(2),s=mount({search:`?printing=${a.id}`,client:mock([a,b],{printing:()=>new Promise(resolve=>release=resolve),random:async()=>{calls++;return b;}})});t.after(s.cleanup);assert.equal(button(s).disabled,true);await button(s).emit('click');assert.equal(calls,0);release(a);await drain();assert.equal(button(s).disabled,false);assert.equal(s.el('preview-id').textContent,a.id);await s.el('close-preview').emit('click');await button(s).emit('click');assert.equal(s.el('preview-id').textContent,b.id);assert.equal(calls,1);
});
