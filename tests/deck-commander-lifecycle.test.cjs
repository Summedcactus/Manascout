const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness,response,until}=require('./helpers/commander-lifecycle.cjs');
const {mount}=require('./helpers/studio-dom.cjs');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const rules=require('../assets/js/deck-rules.js'),model=require('../assets/js/deck-model.js'),generator=require('../assets/js/deck-generator.js');
async function selected(t,h,path='search'){
 const s=mount({client:h.client,storage:new MemoryStorage()});t.after(s.cleanup);let card;
 if(path==='search'){
  const search=h.client.search;h.client.search=async(...args)=>{const r=await search(...args);card=r.cards[0];return r;};
  s.el('studio-search').value=h.f.commander.name;await s.el('studio-search-submit').emit('click');await until(()=>s.el('search-results').querySelector('[data-action="inspect-search"]'));await s.el('search-results').querySelector('[data-action="inspect-search"]').emit('click');
 }else{
  const random=h.client.random;h.client.random=async(...args)=>{card=await random(...args);return card;};s.el('studio-discovery-mode').value='commander';await s.el('studio-discover-random').emit('click');
 }
 await until(()=>!s.el('preview-commander').hidden&&!s.el('preview-commander').disabled);await s.el('preview-commander').emit('click');assert.equal(s.el('stat-commanders').textContent,'1');return {s,card};
}
for(const path of ['search','discover'])test(`real-client ${path} → assignment → generation retains authoritative verification through every pool`,async t=>{
 const h=harness(),{s,card}=await selected(t,h,path),candidates=h.client.candidates,states=[];
 h.client.candidates=async(...args)=>{const r=await candidates(...args);states.push({verified:h.client.isVerified(card),proof:h.client.proof(card)});return r;};
 await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100',s.el('generation-status').textContent);assert.equal(s.el('deck-validity').textContent,'Construction checks passed');assert.ok(states.length>=9);assert.ok(states.every(x=>x.verified&&x.proof===true),JSON.stringify(states));assert.equal(h.client.isVerified(card),true);assert.equal(s.el('cancel-generation').hidden,true);assert.equal(s.el('generate-deck').disabled,false);assert.equal(h.calls.filter(c=>c.q.includes('oracleid:'+card.oracleId)).length,1);
});
test('failed refresh keeps already-verified data and proof instead of invalidating the assigned commander',async()=>{
 let fail=false;const h=harness({hook:async c=>{if(fail&&c.url.endsWith('/collection'))return response({},503);}});const card=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(card);fail=true;await assert.rejects(h.client.refresh([card]));assert.equal(h.client.isVerified(card),true);assert.equal(h.client.proof(card),true);
});
test('partial later response cannot replace authoritative commander legality, identity or text',async()=>{
 let partial=false;const h=harness({hook:async(c,{raws})=>{if(partial&&c.url.endsWith('/collection'))return response({data:[{object:'card',id:raws[0].id,name:raws[0].name}]});}});const card=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(card);partial=true;const refreshed=await h.client.refresh([card]);assert.deepEqual(refreshed[0],card);assert.equal(h.client.isVerified(card),true);assert.equal(h.client.proof(card),true);
});
test('equivalent printing/finish responses keep trusted aliases valid; restored JSON objects remain unverified',async()=>{
 const h=harness(),card=await h.client.printing({id:h.f.commander.id,requestedFinish:'foil'});await h.client.commanderEligibility(card);const found=await h.client.search('artificer');const updated=await h.client.refresh([card]);assert.equal(h.client.isVerified(card),true);assert.equal(h.client.isVerified(found.cards[0]),true);assert.equal(h.client.proof(updated[0]),true);assert.equal(h.client.isVerified(JSON.parse(JSON.stringify(card))),false);assert.ok(Object.isFrozen(card)&&Object.isFrozen(card.legalities));
});
test('cached candidate hints cannot resurrect obsolete legalities after an authoritative ban response',async()=>{
 const h=harness(),first=(await h.client.candidates('t:artifact'))[0];await h.client.commanderEligibility(first);h.raws[0]={...h.raws[0],legalities:{...h.raws[0].legalities,commander:'banned'}};const [banned]=await h.client.refresh([first]);assert.equal(h.client.isVerified(first),false);assert.equal(h.client.isVerified(banned),true);const again=(await h.client.candidates('t:artifact'))[0];assert.equal(again.legalities.commander,'banned');assert.equal(h.client.isVerified(first),false);assert.equal(h.client.commanderState(banned).state,'verified-ineligible');assert.equal(h.client.proof(first),null);
});
test('a partial contradictory response fails closed, instead of restoring a known banned card as legal',async()=>{
 let partial=false;const h=harness({hook:async(c,{raws})=>partial&&c.url.endsWith('/collection')?response({data:[{object:'card',id:raws[0].id,name:raws[0].name,legalities:{commander:'banned'}}]}):null});const card=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(card);partial=true;await assert.rejects(h.client.refresh([card]),/contradicts/);assert.equal(h.client.isVerified(card),false);assert.equal(h.client.proof(card),null);
});
test('partial data without a previously verified record is never promoted to trusted commander data',async()=>{
 const h=harness({hook:async(c,{raws})=>c.url.endsWith('/'+raws[0].id)?response({object:'card',id:raws[0].id,name:raws[0].name}):null});await assert.rejects(h.client.printing({id:h.f.commander.id}),/incomplete/);
});
test('temporary forced eligibility refresh failure retains a fresh proof and exposes a distinct refresh warning',async()=>{
 let fail=false;const h=harness({hook:async c=>fail&&c.q.includes('oracleid:')?response({},429):null});const card=await h.client.printing({id:h.f.commander.id});assert.equal(await h.client.commanderEligibility(card),true);fail=true;await assert.rejects(h.client.commanderEligibility(card,{refresh:true}),/busy/);assert.equal(h.client.commanderState(card).state,'verified-legal');assert.match(h.client.commanderState(card).refreshError,/busy/);assert.equal(h.client.proof(card),true);assert.ok(h.client.diagnostics().some(x=>x.area==='commander-eligibility'&&x.status===429));
});
test('a confirmed negative commander lookup still rejects assignment',async()=>{
 const h=harness(),card=await h.client.printing({id:h.f.forest.id});assert.equal(await h.client.commanderEligibility(card),false);assert.equal(h.client.commanderState(card).state,'verified-ineligible');const d=model.add(model.createDeck(),card,{zone:'commander'});assert.ok(rules.validate(d,h.client).issues.some(i=>i.code==='commander-ineligible'));
});
test('concurrent eligibility checks share one bounded request; cancellation of one waiter does not poison another',async()=>{
 let release;const gate=new Promise(r=>release=r);const h=harness({hook:async c=>{if(c.q.includes('oracleid:'))await gate;}});const card=await h.client.printing({id:h.f.commander.id}),controller=new AbortController();const first=h.client.commanderEligibility(card,{signal:controller.signal}),second=h.client.commanderEligibility(card);await until(()=>h.calls.some(c=>c.q.includes('oracleid:')));assert.equal(h.client.commanderState(card).state,'pending');controller.abort();await assert.rejects(first,{name:'AbortError'});release();assert.equal(await second,true);assert.equal(h.calls.filter(c=>c.q.includes('oracleid:')).length,1);assert.equal(h.client.commanderState(card).state,'verified-legal');
});
test('new authoritative commander mechanics invalidate an earlier eligibility proof',async()=>{
 let release;const gate=new Promise(r=>release=r);const h=harness({hook:async c=>{if(c.q.includes('oracleid:'))await gate;}});const card=await h.client.printing({id:h.f.commander.id});const old=h.client.commanderEligibility(card);await until(()=>h.calls.some(c=>c.q.includes('oracleid:')));
 h.raws[0]={...h.raws[0],oracle_text:'Flying.'};
 // After the earlier lookup finishes, changed authoritative text requires a new proof.
 release();await old;const current=await h.client.printing({id:card.id});assert.equal(h.client.proof(current),null);assert.equal(h.client.isVerified(card),false);assert.equal(await h.client.commanderEligibility(current),true);
});
for(const phase of ['fetch','json'])test(`uncooperative ${phase} timeout settles, releases the queue and allows retry`,async()=>{
 let fail=true;const h=harness({timeout:15,hook:async(c,{raws})=>{if(!c.url.endsWith('/'+raws[0].id)||!fail)return null;if(phase==='fetch')return new Promise(()=>{});return {ok:true,status:200,json:()=>new Promise(()=>{})};}});await assert.rejects(h.client.printing({id:h.f.commander.id}),/timed out/);fail=false;const card=await h.client.printing({id:h.f.commander.id});assert.equal(h.client.isVerified(card),true);
});
test('normal verification expiry remains enforced after a temporary refresh failure',async()=>{
 let clock=1000,fail=false;const h=harness({now:()=>clock,hook:async c=>fail&&c.url.endsWith('/collection')?response({},503):null});const card=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(card);clock+=900001;fail=true;await assert.rejects(h.client.refresh([card]));assert.equal(h.client.isVerified(card),false);assert.equal(h.client.proof(card),null);assert.equal(h.client.commanderState(card).state,'temporarily-unverifiable');
});
for(const index of [0,2,5])test(`known commander reference ${index}: current state, colour identity and deck identity survive generation`,async()=>{
 const h=harness({identityIndex:index}),c=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(c);let d=model.select(model.add(model.createDeck(),c,{zone:'commander',finish:'foil'}),c,'foil');const progress=[];const r=await generator.generate(d,{}, {client:h.client,random:()=>.5,progress:x=>progress.push(x)});assert.equal(model.count(r.deck),100);assert.equal(rules.validate(r.deck,h.client).complete,true);assert.equal(h.client.isVerified(c),true);assert.ok(Object.values(r.deck.cards).every(c=>c.colorIdentity.every(k=>h.f.commander.colorIdentity.includes(k))));for(const [role,n]of Object.entries(r.identity.targets))assert.ok(r.identity.counts[role]>=n,role);assert.match(progress.at(-1),/^Generation complete/);assert.ok(progress.findIndex(x=>x.startsWith('Refreshing selected'))>progress.findIndex(x=>x.includes('Role pools 9/9 complete')));
});
for(const config of ['partners','background'])test(`real-client ${config} generation preserves both commanders and builds 98 main cards`,async()=>{
 const h=harness({pair:config==='partners',background:config==='background'});const first=await h.client.printing({id:h.f.commander.id}),second=await h.client.printing({id:h.f.second.id});await h.client.commanderEligibility(first);if(config!=='background')await h.client.commanderEligibility(second);let deck=model.add(model.add(model.createDeck(),first,{zone:'commander'}),second,{zone:'commander'});deck=model.select(deck,first);const r=await generator.generate(deck,{}, {client:h.client,random:()=>.5});assert.equal(model.count(r.deck,'main'),98);assert.equal(model.count(r.deck,'commander'),2);assert.equal(rules.validate(r.deck,h.client).complete,true);assert.equal(h.client.isVerified(first),true);assert.equal(h.client.isVerified(second),true);
});
for(const mode of ['failure','timeout'])test(`finalisation ${mode} preserves verified commander, releases loading state and supports a successful retry`,async t=>{
 let fail=false;const h=harness({timeout:30,hook:async c=>{if(fail&&c.url.endsWith('/collection'))return mode==='timeout'?new Promise(()=>{}):response({},503);}}),{s,card}=await selected(t,h);fail=true;await s.el('generate-deck').emit('click');assert.match(s.el('generation-status').textContent,/Final printing refresh/);assert.equal(s.el('stat-count').textContent,'1 / 100');assert.equal(h.client.isVerified(card),true);assert.equal(h.client.proof(card),true);assert.equal(s.el('generate-deck').disabled,false);assert.equal(s.el('cancel-generation').hidden,true);fail=false;await s.el('generate-deck').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100',s.el('generation-status').textContent);
});
test('completed download progress is reported only after each request, and final refresh is a distinct pending stage',async()=>{
 let release;const gate=new Promise(r=>release=r);let held=false;const h=harness({hook:async c=>{if(c.url.endsWith('/collection')){held=true;await gate;}}}),card=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(card);const deck=model.select(model.add(model.createDeck(),card,{zone:'commander'}),card),progress=[];const promise=generator.generate(deck,{}, {client:h.client,random:()=>.5,progress:text=>progress.push(text)});await until(()=>held);assert.match(progress.at(-1),/Refreshing selected printings/);assert.ok(progress.includes('Role pools 9/9 complete.'));assert.ok(!progress.some(x=>x.startsWith('Generation complete')));assert.equal(h.client.isVerified(card),true);release();await promise;assert.match(progress.at(-1),/^Generation complete/);
});
test('manual recheck failure preserves a fresh assigned commander instead of clearing its proof',async t=>{
 let fail=false;const h=harness({hook:async c=>fail&&c.url.endsWith('/collection')?response({},503):null}),{s,card}=await selected(t,h);fail=true;await s.el('refresh-card-data').emit('click');assert.match(s.el('data-check-status').textContent,/Previously verified records are preserved/);assert.equal(h.client.isVerified(card),true);assert.equal(h.client.proof(card),true);assert.equal(s.el('generate-deck').disabled,false);
});
test('clearing proofs during an in-flight lookup invalidates its late result',async()=>{
 let release;const gate=new Promise(r=>release=r);const h=harness({hook:async c=>{if(c.q.includes('oracleid:'))await gate;}});const card=await h.client.printing({id:h.f.commander.id}),pending=h.client.commanderEligibility(card);const rejected=assert.rejects(pending,/facts changed/);await until(()=>h.calls.some(c=>c.q.includes('oracleid:')));h.client.clearProofs();release();await rejected;assert.equal(h.client.proof(card),null);assert.equal(await h.client.commanderEligibility(card),true);
});
test('replacing the commander keeps identity-specific proofs separate and preserves the old printing in the main deck',async t=>{
 const h=harness(),{s,card}=await selected(t,h);s.el('studio-search').value='Fixture';await s.el('studio-search-submit').emit('click');await until(()=>s.el('search-results').querySelector(`[data-key="${h.f.second.id}"][data-action="inspect-search"]`));await s.el('search-results').querySelector(`[data-key="${h.f.second.id}"][data-action="inspect-search"]`).emit('click');await until(()=>!s.el('preview-commander').disabled);const pending=s.el('preview-commander').emit('click');await until(()=>s.el('draft-confirm').open);await s.el('draft-confirm-accept').emit('click');await pending;assert.equal(s.el('preview-id').textContent,h.f.second.id);assert.equal(s.el('stat-commanders').textContent,'1');assert.match(s.el('generation-identity-note').textContent,/Aggro/);assert.doesNotMatch(s.el('generation-identity-note').textContent,/Artifacts/);assert.equal(h.client.proof(card),true);assert.equal(h.client.commanderState(h.client.current(card)).state,'verified-legal');
});
test('eligible reversible commander keeps face data, exact printing, finish and identity through generation',async()=>{
 const h=harness();const original=h.raws[0];h.raws[0]={...original,layout:'modal_dfc',type_line:original.type_line+' // Land',card_faces:[{name:original.name,type_line:original.type_line,oracle_text:original.oracle_text,image_uris:original.image_uris},{name:'Synthetic reverse',type_line:'Land',oracle_text:'{T}: Add {G}.',image_uris:{normal:'https://cards.scryfall.io/synthetic-back.jpg'}}]};delete h.raws[0].oracle_text;delete h.raws[0].image_uris;
 const card=await h.client.printing({id:original.id,requestedFinish:'foil'});assert.equal(card.images.length,2);await h.client.commanderEligibility(card);const d=model.select(model.add(model.createDeck(),card,{zone:'commander',finish:'foil'}),card,'foil'),r=await generator.generate(d,{}, {client:h.client,random:()=>.5});assert.equal(r.deck.cards[card.id].images.length,2);assert.equal(r.deck.selection.printingId,card.id);assert.equal(r.deck.selection.finish,'foil');assert.equal(rules.validate(r.deck,h.client).complete,true);
});
test('background recheck prevents concurrent generation and cannot overwrite newer deck edits',async t=>{
 let hold=false,release;const gate=new Promise(r=>release=r);const h=harness({hook:async c=>{if(hold&&c.url.endsWith('/collection'))await gate;}}),{s,card}=await selected(t,h);hold=true;const pending=s.el('refresh-card-data').emit('click');await until(()=>s.el('refresh-card-data').disabled);assert.equal(s.el('generate-deck').disabled,true);s.el('deck-name').value='Newer edit';await s.el('deck-name').emit('input');release();await pending;assert.equal(s.el('deck-name').value,'Newer edit');assert.match(s.el('data-check-status').textContent,/newer edits are preserved/);assert.equal(h.client.isVerified(card),true);assert.equal(s.el('generate-deck').disabled,false);
});
test('partial refresh is reported as retained data, not as a successful new printing check',async t=>{
 let partial=false;const h=harness({hook:async(c,{raws})=>partial&&c.url.endsWith('/collection')?response({data:[{object:'card',id:raws[0].id,name:raws[0].name}]}):null}),{s,card}=await selected(t,h);partial=true;await s.el('refresh-card-data').emit('click');assert.match(s.el('data-check-status').textContent,/0 printing records rechecked/);assert.match(s.el('data-check-status').textContent,/1 previously verified record/);assert.equal(h.client.isVerified(card),true);
});
test('a later record missing previously known format legalities is retained as partial data, not promoted over complete facts',async()=>{
 const h=harness(),card=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(card);h.raws[0]={...h.raws[0],legalities:{commander:'legal'}};const [retained]=await h.client.refresh([card]);assert.equal(retained,card);assert.equal(retained.legalities.standard,'legal');assert.equal(h.client.isVerified(card),true);assert.match(h.client.commanderState(card).cardRefreshError,/incomplete/);
});
test('partial Search results reuse the same complete verified representation as Discover and assignment',async()=>{
 let partial=false;const h=harness({hook:async(c,{raws})=>partial&&c.url.includes('/cards/search')&&!c.q.includes('oracleid:')?response({data:[{object:'card',id:raws[0].id,name:raws[0].name}],has_more:false}):null});const card=await h.client.random({commanderOnly:true});partial=true;const result=await h.client.search('fixture');assert.equal(result.cards[0],card);assert.equal(h.client.proof(result.cards[0]),true);assert.equal(h.client.isVerified(card),true);
});
test('malformed printing identities never enter the trusted cache or replace an assigned commander',async()=>{
 let malformed=false;const h=harness({hook:async(c,{raws})=>malformed&&c.url.includes('/cards/search')&&!c.q.includes('oracleid:')?response({data:[{...raws[0],id:undefined}],has_more:false}):null}),card=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(card);malformed=true;await assert.rejects(h.client.search('fixture'),/invalid printing identity/);assert.equal(h.client.isVerified(card),true);assert.equal(h.client.proof(card),true);
});
test('empty, partial or unrelated eligibility responses stay unavailable rather than overwriting a positive proof as ineligible',async()=>{
 for(const payload of [{data:[]},{data:[{name:'Partial response'}]},{data:[{oracle_id:'99999999-1111-4111-8111-111111111111'}]}]){
  let incomplete=false;const h=harness({hook:async c=>incomplete&&c.q.includes('oracleid:')?response(payload):null}),card=await h.client.printing({id:h.f.commander.id});assert.equal(await h.client.commanderEligibility(card),true);incomplete=true;await assert.rejects(h.client.commanderEligibility(card,{refresh:true}),/did not confirm/);assert.equal(h.client.proof(card),true);assert.equal(h.client.commanderState(card).state,'verified-legal');
 }
});
test('equivalent source newline presentation preserves authoritative commander proof',async()=>{
 const h=harness(),card=await h.client.printing({id:h.f.commander.id});await h.client.commanderEligibility(card);h.raws[0]={...h.raws[0],oracle_text:h.raws[0].oracle_text.replace(/\n/g,'\r\n')+'  '};const again=await h.client.printing({id:card.id});assert.equal(h.client.isVerified(card),true);assert.equal(h.client.proof(again),true);assert.equal(h.client.commanderState(again).state,'verified-legal');
});
