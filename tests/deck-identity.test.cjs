const {test}=require('node:test');
const assert=require('node:assert/strict');
const identity=require('../assets/js/deck-identity.js');
const generator=require('../assets/js/deck-generator.js');
const model=require('../assets/js/deck-model.js');
const rules=require('../assets/js/deck-rules.js');
const store=require('../assets/js/deck-store.js');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const {commanders,recordsForAnalysis,identityFixture,fakeClient}=require('./helpers/deck-identity.cjs');
const {card}=require('./helpers/cards.cjs');
const styles=spec=>identity.analyse([recordsForAnalysis(spec)]).styles.map(x=>x.key);
const run=(f,options={},client=fakeClient(f))=>generator.generate(f.deck,options,{client,random:()=>.5});
for(const [index,primary]of ['tribal:vampire','tribal:goblin','artifacts','spellslinger','graveyard','lands'].entries()){
 test(commanders[index].name+' has relevant Oracle-driven inference, independent of card name',()=>{
  const spec=commanders[index],c=recordsForAnalysis(spec),a=identity.analyse([c]);assert.equal(a.styles[0].key,primary);assert.ok(a.styles.length>=1&&a.styles.length<=7);assert.ok(a.styles.every(x=>x.confidence>0&&x.evidence.length));assert.deepEqual(identity.analyse([{...c,name:'Completely different fixture name'}]).styles.map(x=>x.key),a.styles.map(x=>x.key));
 });
 test(commanders[index].name+' generates 100 legal cards and meets every default identity target',async()=>{
  const f=identityFixture(index),client=fakeClient(f),r=await run(f,{},client);assert.equal(r.strategy,primary);assert.equal(model.count(r.deck),100);assert.equal(rules.validate(r.deck,client).complete,true);for(const [role,n]of Object.entries(r.identity.targets))assert.ok(r.identity.counts[role]>=n,role);assert.equal(r.deck.entries.find(e=>e.zone==='commander').printingId,f.commander.id);assert.equal(r.deck.entries.find(e=>e.zone==='commander').finish,'foil');
  const nonbasics=r.deck.entries.filter(e=>!/^Basic Land/.test(r.deck.cards[e.printingId].frontType));assert.equal(new Set(nonbasics.map(e=>r.deck.cards[e.printingId].oracleId)).size,nonbasics.length);assert.ok(Object.values(r.deck.cards).every(c=>c.colorIdentity.every(k=>f.spec.colors.includes(k))));
 });
}
test('Edgar never offers irrelevant poison, vehicle, spellslinger or landfall styles',()=>{
 const result=styles(commanders[0]);for(const key of ['tribal:vampire','tokens','aristocrats','sacrifice'])assert.ok(result.includes(key));for(const key of ['poison','vehicles','spellslinger','landfall'])assert.ok(!result.includes(key));
});
test('creating a named token does not by itself imply a tribal casting engine',()=>{
 assert.ok(!styles(commanders[3]).includes('tribal:drake'));assert.ok(!styles(commanders[2]).includes('tribal:construct'));
});
test('subtype alone and removal referencing a permanent type do not imply tribal/artifact support',()=>{
 const c={frontType:'Legendary Creature — Vampire',frontText:'Destroy target artifact.',colorIdentity:['B']};const a=identity.analyse([c]);assert.ok(!a.styles.some(s=>s.key==='tribal:vampire'||s.key==='artifacts'));assert.ok(a.styles.length);
});
test('ambiguous commanders have a conservative usable fallback',()=>{
 assert.deepEqual(identity.analyse([{frontType:'Legendary Creature — Test',frontText:'',colorIdentity:[]}]).styles.map(x=>x.key),['aggro']);
});
test('strict tribal counting uses creature subtype/changeling, not incidental Oracle mentions',()=>{
 const make=(ty,t)=>identity.features({frontType:ty,frontText:t},'vampire').has('tribal');assert.equal(make('Creature — Vampire',''),true);assert.equal(make('Creature — Shapeshifter','Changeling'),true);assert.equal(make('Enchantment','Vampires you control get +1/+1.'),false);assert.equal(make('Creature — Human','Destroy target Vampire.'),false);
});
test('strict Edgar maintains a meaningful Vampire density, higher than Loose with identical pools',async()=>{
 const f=identityFixture(),loose=await run(f,{priorities:{adherence:'loose'}}),strict=await run(f,{priorities:{adherence:'strict'}});assert.ok(strict.identity.counts['tribal:vampire']>=36);assert.ok(strict.identity.counts['tribal:vampire']>loose.identity.counts['tribal:vampire']+8);assert.equal(strict.deck.selection.printingId,f.commander.id);
});
for(const [priority,role]of [['removal','interaction'],['ramp','ramp'],['draw','draw']])test(`Heavy ${priority} materially exceeds Light ${priority} with the same commander`,async()=>{
 const f=identityFixture(),light=await run(f,{priorities:{[priority]:'light'}}),heavy=await run(f,{priorities:{[priority]:'heavy'}});assert.ok(heavy.identity.counts[role]>=light.identity.counts[role]+8,JSON.stringify({light:light.identity.counts[role],heavy:heavy.identity.counts[role]}));
});
for(const [priority,role,low,high]of [['wipes','wipe','low','high'],['protection','protection','low','high'],['tutors','tutor','none','heavy']])test(`${priority} priority changes actual cards, not just metadata`,async()=>{
 const f=identityFixture(),a=await run(f,{bracket:3,priorities:{[priority]:low}}),b=await run(f,{bracket:3,priorities:{[priority]:high}});assert.ok(b.identity.counts[role]>=a.identity.counts[role]+4,JSON.stringify([a.identity.counts[role],b.identity.counts[role]]));if(priority==='tutors')assert.equal(a.identity.counts.tutor,0);
});
test('primary, secondary, tertiary styles have decreasing hard density targets',()=>{
 const a=identity.analyse([recordsForAnalysis(commanders[0])]),p=identity.priorities();const s=identity.selection(a,{primaryStyle:'tribal:vampire',secondaryStyle:'tokens',tertiaryStyle:'aristocrats'}),plan=identity.plan([recordsForAnalysis(commanders[0])],s,p);assert.equal(plan.minima['tribal:vampire'],28);assert.equal(plan.minima.tokenMaker,7);assert.equal(plan.minima.outlet,2);
});
test('swapping primary tribal/aristocrats identities changes generated composition',async()=>{
 const f=identityFixture(),a=await run(f,{primaryStyle:'tribal:vampire',secondaryStyle:'aristocrats'}),b=await run(f,{primaryStyle:'aristocrats',secondaryStyle:'tribal:vampire'});assert.ok(a.identity.counts['tribal:vampire']>b.identity.counts['tribal:vampire']);assert.ok(b.identity.counts.outlet>a.identity.counts.outlet);assert.ok(b.identity.counts.deathPayoff>a.identity.counts.deathPayoff);
});
test('irrelevant or duplicate chosen styles reject before pool selection',async()=>{
 for(const o of [{primaryStyle:'poison'},{primaryStyle:'tribal:vampire',secondaryStyle:'tribal:vampire'},{secondaryStyle:'vehicles'}]){const f=identityFixture(),client=fakeClient(f);await assert.rejects(run(f,o,client),/commander-relevant/);assert.equal(client.calls.filter(c=>c.kind==='pool').length,0);}
});
test('bad priorities reject before any network work',async()=>{
 const f=identityFixture(),client=fakeClient(f);await assert.rejects(run(f,{priorities:{ramp:'maximum'}},client),/priorities/);assert.equal(client.calls.length,0);
});
test('hard targets cannot silently return an off-theme deck when the pool lacks Vampires',async()=>{
 const f=identityFixture(),before=JSON.stringify(f.deck),pool=f.records.filter(c=>c.id===f.commander.id||!c.frontType.includes('Vampire'));await assert.rejects(run(f,{priorities:{adherence:'strict'}},fakeClient(f,{pool})),/composition targets|coherent/);assert.equal(JSON.stringify(f.deck),before);
});
test('refreshed Oracle text must still meet hard identity targets',async()=>{
 const f=identityFixture(),client=fakeClient(f),refresh=client.refresh;let calls=0;client.refresh=async(...args)=>{const cards=await refresh(...args);return ++calls===2?cards.map(c=>c.id===f.commander.id||/Land/.test(c.frontType)?c:{...c,frontType:'Artifact',frontText:'',rulesText:''}):cards;};await assert.rejects(run(f,{},client),/identity targets/);
});
test('bad colour identities, banned and unverified cards remain excluded by existing construction checks',async()=>{
 const f=identityFixture();for(const [i,extra]of [[0,{color_identity:['U']}],[1,{legalities:{commander:'banned'}}]])f.records.push(card(9990+i,{name:'Invalid fixture '+i,type_line:'Creature — Vampire',oracle_text:'Draw two cards.',...extra}));const client=fakeClient(f),r=await run(f,{},client);assert.ok(!r.deck.entries.some(e=>e.printingId===card(9990).id||e.printingId===card(9991).id));
});
test('identity metadata, exact finishes and selected printing survive version-1 saves/backups/recovery',async()=>{
 const f=identityFixture(),r=await run(f,{priorities:{adherence:'strict',removal:'heavy'}}),storage=new MemoryStorage(),s=store.createStore({storage});const result=s.save(r.deck);const restored=s.loadActive().deck,backup=store.decodeBackup(store.encodeBackup(restored));assert.deepEqual(restored.generation,r.deck.generation);assert.deepEqual(backup.generation,restored.generation);assert.deepEqual(restored.selection,r.deck.selection);assert.deepEqual(restored.entries,r.deck.entries);s.checkpoint(restored,result.token);assert.ok(s.versions().some(v=>v.deck.generation?.primaryStyle==='tribal:vampire'));
});
test('old version-1 drafts without generation metadata remain readable; hostile metadata is bounded',()=>{
 const d=model.createDeck(),old=store.decodeBackup(store.encodeBackup(d));assert.equal(old.generation,undefined);const restored=store.sanitizeDeck({...d,generation:{version:1,primaryStyle:'<script>',targets:{ramp:Infinity},counts:{land:36},priorities:{ramp:'heavy',unexpected:'secret'}}});assert.equal(restored.generation.primaryStyle,'');assert.deepEqual(restored.generation.targets,{});assert.deepEqual(restored.generation.priorities,{ramp:'heavy'});assert.equal(restored.schemaVersion,1);
});
test('three styles and combo searches remain bounded at twelve candidate pages',async()=>{
 const f=identityFixture(),client=fakeClient(f);await run(f,{primaryStyle:'tribal:vampire',secondaryStyle:'tokens',tertiaryStyle:'aristocrats',priorities:{combo:'some'}},client);assert.ok(client.calls.filter(c=>c.kind==='pool').reduce((n,c)=>n+c.options.pages,0)<=12);
});
test('English plural creature references are normalised without inventing tribes from pronouns',()=>{
 const c={frontType:'Legendary Creature — Elf Druid',frontText:'Elves you control get +1/+1.',colorIdentity:['G']};assert.equal(identity.analyse([c]).styles[0].key,'tribal:elf');assert.ok(!identity.analyse([{...c,frontText:'This spell costs less to cast.'}]).styles.some(x=>x.key.startsWith('tribal:')));
});
function addComboFixtures(f){
 const specs=[['Kiki-Jiki, Mirror Breaker','Legendary Creature — Goblin Shaman','Haste. {T}: Create a token that’s a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.',5],['Zealous Conscripts','Creature — Human Warrior','Haste. When Zealous Conscripts enters, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.',5],['Dualcaster Mage','Creature — Human Wizard','Flash. When Dualcaster Mage enters, copy target instant or sorcery spell. You may choose new targets for the copy.',3],['Twinflame','Sorcery','Choose any number of target creatures you control. For each of them, create a token that’s a copy of that creature, except it has haste. Exile those tokens at the beginning of the next end step.',2]];
 for(const [i,[name,type_line,oracle_text,cmc]]of specs.entries())f.records.push(card(9700+i,{name,type_line,oracle_text,cmc,color_identity:['R']}));
}
test('Combo None deliberately assembles no catalogued package; Some/Heavy select limited compatible packages',async()=>{
 const f=identityFixture(1);addComboFixtures(f);const results={};for(const combo of ['none','some','heavy'])results[combo]=await run(f,{secondaryStyle:'tokens',priorities:{combo}});
 assert.equal(results.none.identity.packages.length,0);for(const p of identity.packages)assert.ok(!p.cards.every(name=>Object.values(results.none.deck.cards).some(c=>c.name===name)));
 assert.equal(results.some.identity.packages.length,1);assert.equal(results.heavy.identity.packages.length,2);for(const r of Object.values(results)){assert.equal(model.count(r.deck),100);for(const p of r.identity.packages)assert.ok(p.requires.length>20);}
});
test('Combo Heavy materially increases engine density for a compatible artifact commander',async()=>{
 const f=identityFixture(2),none=await run(f,{priorities:{combo:'none'}}),heavy=await run(f,{priorities:{combo:'heavy'}});assert.ok(heavy.identity.counts.comboEngine>=12);assert.ok(heavy.identity.counts.comboEngine>=(none.identity.counts.comboEngine||0)+5);
});
test('incomplete, incompatible or changed combo catalogue records do not produce false packages',async()=>{
 const f=identityFixture(1);addComboFixtures(f);f.records=f.records.filter(c=>!['Zealous Conscripts','Twinflame'].includes(c.name));const r=await run(f,{secondaryStyle:'tokens',priorities:{combo:'heavy'}});assert.equal(r.identity.packages.length,0);assert.match(r.note,/No deliberate combo package/);
});
test('lands identity has a larger mana base and verified fetch/sacrifice utility support',async()=>{
 const f=identityFixture(5),r=await run(f);assert.equal(r.identity.counts.land,40);assert.ok(r.identity.counts.landUtility>=3);assert.ok(r.identity.counts.landRamp>=10&&r.identity.counts.landPayoff>=8);
});
test('a fresh commander mechanic change invalidates a stale generation identity',async()=>{
 const f=identityFixture(),client=fakeClient(f),refresh=client.refresh;let calls=0;client.refresh=async(...args)=>{const c=await refresh(...args);return ++calls===2?c.map(c=>c.id===f.commander.id?{...c,frontText:'Flying.',rulesText:'Flying.'}:c):c;};await assert.rejects(run(f,{},client),/commander text/);
});
for(const [key,required]of Object.entries({tokens:['tokenMaker','creatureToken','tokenPayoff'],aristocrats:['outlet','fodder','deathPayoff','recursion'],spellslinger:['spell','spellPayoff','velocity'],lands:['landRamp','landPayoff','landUtility'],voltron:['attachment','protection','evasion'],graveyard:['graveEnabler','recursion','gravePayoff'],counters:['counterMaker','counterPayoff'],artifacts:['artifact','artifactPayoff','manaEngine']}))test(`${key} defines hard component targets rather than a ranking label`,()=>{
 const plan=identity.plan([], [key,'',''],identity.priorities());for(const component of required)assert.ok(plan.minima[component]>0,component);
});
test('treasure ramp cannot masquerade as a creature-token generator or a sacrifice outlet',()=>{
 const features=identity.features({frontType:'Artifact',frontText:'When this artifact enters, create a Treasure token.'});assert.ok(features.has('tokenMaker'));assert.ok(!features.has('creatureToken'));assert.ok(!features.has('outlet'));
});
test('rebalancing replaces an underperforming slot without losing already-met targets',()=>{
 const plan={minima:{ramp:5,draw:5},weights:{ramp:5,draw:5}},counts={ramp:4,draw:5},before=JSON.stringify(counts),incoming=[{key:'ramp-only',roles:new Set(['ramp'])},{key:'dual-role',roles:new Set(['ramp','draw'])}],outgoing=[{key:'draw-slot',roles:new Set(['draw'])}];const swap=identity.bestSwap(plan,counts,incoming,outgoing);assert.deepEqual(swap,{incoming:'dual-role',outgoing:'draw-slot'});assert.equal(JSON.stringify(counts),before);assert.equal(identity.bestSwap(plan,counts,incoming,outgoing,()=>false),null);assert.equal(identity.bestSwap(plan,{ramp:5,draw:5},incoming,outgoing),null);
});
