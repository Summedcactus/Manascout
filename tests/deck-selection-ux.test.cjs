const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {mount}=require('./helpers/studio-dom.cjs');
const {card}=require('./helpers/cards.cjs');
const model=require('../assets/js/deck-model.js');
const storageAPI=require('../assets/js/deck-store.js');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const drain=()=>new Promise(resolve=>setTimeout(resolve,20));
function client(cards,{eligible=false,failEligibility=false}={}){
 const proof=new Map(),calls=[];
 return {calls,search:async(query,options)=>{calls.push({query,options});return {cards,nextPage:'',total:cards.length};},autocomplete:async()=>[],random:async()=>cards[0],printing:async s=>cards.find(c=>c.id===s.id),isVerified:()=>true,proof:c=>proof.has(c.oracleId)?proof.get(c.oracleId):null,
 commanderEligibility:async c=>{if(failEligibility)throw Error('Eligibility service unavailable');proof.set(c.oracleId,eligible);return eligible;},clearProofs:()=>proof.clear(),refresh:async old=>old.map(c=>cards.find(v=>v.id===c.id)).filter(Boolean)};
}
test('Search is explicitly named, wired to submission, and shares a row of actions with Discover',async t=>{
 const api=client([card()]),s=mount({client:api,narrow:true});t.after(s.cleanup);const search=s.el('studio-search-submit'),discover=s.el('studio-discover-random');assert.equal(search.textContent,'Search');assert.equal(search.getAttribute('type'),'submit');assert.equal(search.parentElement,discover.parentElement);assert.equal(s.el('studio-search').getAttribute('placeholder'),'Search for a card…');assert.equal(s.el('discover-heading').textContent,'Find cards');assert.doesNotMatch(search.textContent,/→/);
 s.el('studio-search').value='Fixture';let prevented=false;await search.emit('click',{preventDefault(){prevented=true;}});await drain();assert.equal(prevented,true);assert.equal(api.calls.length,1);assert.equal(api.calls[0].query,'Fixture');assert.ok(s.el('search-results').querySelector('[data-action="inspect-search"]'));
 await s.el('studio-search-form').emit('submit');await drain();assert.equal(api.calls.length,2);
});
test('blank Search gives an instruction and focuses the input while Discover still works without text',async t=>{
 const api=client([card()]),s=mount({client:api});t.after(s.cleanup);await s.el('studio-search-submit').emit('click');assert.equal(api.calls.length,0);assert.match(s.el('search-status').textContent,/Enter a card name/);assert.equal(s.document.activeElement,s.el('studio-search'));await s.el('studio-discover-random').emit('click');await drain();assert.equal(s.el('preview-id').textContent,card().id);
});
for(const route of ['search','discover'])for(const eligible of [true,false])test(`${route}: the same selected-card workflow exposes commander and main-deck roles (${eligible?'eligible':'ineligible'})`,async t=>{
 const c=card(1,{type_line:eligible?'Legendary Creature — Test':'Artifact'}),api=client([c],{eligible}),s=mount({client:api,narrow:true});t.after(s.cleanup);
 if(route==='search'){s.el('studio-search').value='Fixture';await s.el('studio-search-submit').emit('click');await drain();await s.el('search-results').querySelector('[data-action="inspect-search"]').emit('click');}else await s.el('studio-discover-random').emit('click');await drain();
 const commander=s.el('preview-commander'),add=s.el('preview-add');assert.equal(s.el('card-preview').open,true);assert.equal(s.el('preview-id').textContent,c.id);assert.equal(commander.parentElement,add.parentElement);assert.equal(commander.textContent,'Set as Commander');assert.equal(commander.disabled,!eligible);assert.equal(commander.hidden,!eligible);assert.equal(add.textContent,'Add to the 99');assert.equal(add.disabled,false);assert.equal(s.el('stat-count').textContent,'0 / 100');if(!eligible)assert.match(s.el('preview-legality').textContent,/Not eligible as a commander/);
 await add.emit('click');assert.equal(s.el('stat-count').textContent,'1 / 100');if(eligible){await commander.emit('click');assert.equal(s.el('stat-commanders').textContent,'1');assert.equal(s.el('stat-count').textContent,'1 / 100');}
});
test('unknown or failed commander checks keep the commander action hidden, while legal main-deck cards remain addable',async t=>{
 const c=card(),s=mount({search:`?printing=${c.id}`,client:client([c],{failEligibility:true})});t.after(s.cleanup);await drain();assert.equal(s.el('preview-commander').disabled,true);assert.equal(s.el('preview-commander').textContent,'Set as Commander');assert.equal(s.el('preview-commander').hidden,true);assert.match(s.el('preview-legality').textContent,/Last eligibility check failed/);assert.equal(s.el('preview-add').disabled,false);await s.el('preview-add').emit('click');assert.equal(s.el('stat-count').textContent,'1 / 100');
});
test('known banned or wrong-platform Commander selections cannot use either role button',async t=>{
 for(const extra of [{legalities:{commander:'banned'}},{games:['arena']}]){const c=card(1,extra),s=mount({search:`?printing=${c.id}`,client:client([c],{eligible:true})});t.after(s.cleanup);await drain();assert.equal(s.el('preview-commander').disabled,true);assert.equal(s.el('preview-add').disabled,true);await s.el('preview-add').emit('click');assert.equal(s.el('stat-count').textContent,'0 / 100');}
});
test('other formats keep their ordinary deck action, and partnered Commander decks identify the 98 correctly',async t=>{
 const c=card(3),s=mount({search:`?printing=${c.id}`,client:client([c])});t.after(s.cleanup);await drain();s.el('deck-format').value='standard';await s.el('deck-format').emit('change');assert.equal(s.el('preview-commander').hidden,true);assert.equal(s.el('preview-add').textContent,'Add to deck +');
 const a=card(1,{type_line:'Legendary Creature — Test',oracle_text:'Partner'}),b=card(2,{type_line:'Legendary Creature — Test',oracle_text:'Partner'}),storage=new MemoryStorage();let d=model.add(model.add(model.createDeck(),a,{zone:'commander'}),b,{zone:'commander'});storageAPI.createStore({storage}).save(d);const paired=mount({storage,search:`?printing=${c.id}`,client:client([a,b,c],{eligible:true})});t.after(paired.cleanup);await drain();assert.equal(paired.el('preview-add').textContent,'Add to the 98');
});
test('responsive structure stacks input over two equal buttons on mobile and preserves accessible controls',()=>{
 const css=fs.readFileSync('assets/css/deck-studio.css','utf8');assert.match(css,/\.ds-search-row \{ display: flex; flex-wrap: wrap/);assert.match(css,/\.ds-search-actions \{[^}]*grid-template-columns: minmax\(0,1fr\) minmax\(0,1fr\)/);assert.match(css,/@media \(max-width: 820px\) \{\s*\.deck-studio \.ds-search-row \.ds-search-field \{ flex-basis: 100%; \}/);assert.match(css,/\.ds-search-actions \{ flex-basis: 100%; \}/);
});
