/* Role/health behaviour using production modules and explicitly synthetic candidate pools. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const identity=require('../assets/js/deck-identity.js'),health=require('../assets/js/deck-health.js'),generator=require('../assets/js/deck-generator.js'),model=require('../assets/js/deck-model.js'),rules=require('../assets/js/deck-rules.js'),store=require('../assets/js/deck-store.js');
const {identityFixture,fakeClient,commanders}=require('./helpers/deck-identity.cjs'),{card}=require('./helpers/cards.cjs');
const inspect=(type,text,styles=[],extra={})=>identity.inspect({id:card(9900).id,frontType:type,frontText:text,manaValue:'2',...extra},{styles});
const has=(record,role)=>record.roles.includes(role);
async function generated(index=0,options={}){const f=identityFixture(index),client=fakeClient(f),result=await generator.generate(f.deck,options,{client,random:()=>.5});return {f,client,result,deck:result.deck,analysis:health.analyse(result.deck)};}
function swapIn(deck,record){const entry=deck.entries.find(e=>e.zone==='main'&&!/Land/.test(deck.cards[e.printingId].frontType));return model.add(model.setQuantity(deck,entry.key,entry.quantity-1),record);}
test('Vampire draw creature carries independent creature, tribe and draw roles',()=>{
 const c=inspect('Creature — Vampire','When this creature enters, draw a card.',['tribal:vampire']);for(const key of ['creature','tribal:vampire','draw'])assert.ok(has(c,key));assert.ok(c.evidence.draw&&c.evidence.creature);assert.ok(!has(c,'countermagic'));
});
for(const [type,text,roles]of [
 ['Artifact','{T}: Add {C}.',['artifact','ramp','manaRock']],
 ['Instant','Counter target spell.',['instant','interaction','countermagic','protection']],
 ['Sorcery','Destroy all creatures.',['sorcery','wipe']],
 ['Instant','Draw a card.',['instant','draw','cantrip','velocity']],
 ['Land','{T}: Add {G}.',['land']],
 ['Land','{T}: Mill three cards.',['land','utility']],
 ['Creature — Test','Sacrifice another creature: Draw a card.',['creature','outlet','draw']],
 ['Enchantment','Whenever another creature you control dies, each opponent loses 1 life.',['enchantment','deathPayoff','drain']],
 ['Artifact — Equipment','Equipped creature has flying.',['equipment','attachment','evasion']],
 ['Enchantment — Aura','Enchant creature. Enchanted creature gets +2/+2.',['aura','attachment']],
 ['Enchantment','You may play an additional land on each of your turns.',['additionalLand','ramp','landRamp']],
 ['Sorcery','Return target creature card from your graveyard to the battlefield.',['recursion','reanimation','gravePayoff']],
 ['Enchantment','Spells your opponents cast cost {1} more to cast.',['stax']],
 ['Instant','Proliferate.',['proliferate','counterMaker','counterPayoff']]
])test(`${type} has evidenced roles: ${roles.join(', ')}`,()=>{const c=inspect(type,text);for(const role of roles)assert.ok(has(c,role),role);});
test('ordinary mana-producing lands do not become ramp; land utility can remain multi-role',()=>{
 const basic=inspect('Basic Land — Forest','{T}: Add {G}.');assert.ok(!has(basic,'ramp'));const selfMill=inspect('Land','{T}: Mill three cards.');assert.ok(has(selfMill,'land')&&has(selfMill,'selfMill'));const recursive=inspect('Land','{T}: Return target creature card from your graveyard to your hand.');assert.ok(has(recursive,'land')&&has(recursive,'recursion'));
});
test('opponent-only draw, graveyard hate, token creation and hostile auras do not invent beneficial payoffs',()=>{
 assert.ok(!has(inspect('Sorcery','Target opponent draws two cards.'),'draw'));
 assert.ok(!has(inspect('Sorcery',"Exile target card from an opponent’s graveyard."),'gravePayoff'));
 assert.ok(!has(inspect('Artifact','Whenever you cast an artifact spell, create a 1/1 artifact creature token.'),'tokenPayoff'));
 assert.ok(!has(inspect('Enchantment — Aura',"Enchant creature. Enchanted creature can’t attack or block."),'attachment'));
 assert.ok(!has(inspect('Instant','Destroy target artifact.'),'artifactPayoff'));
});
test('tribal payoffs need friendly type-specific evidence, not a destructive reference',()=>{
 assert.ok(has(inspect('Creature — Vampire','Other Vampires you control get +1/+1.',['tribal:vampire']),'tribalPayoff:vampire'));
 assert.ok(!has(inspect('Sorcery','Destroy target Vampire.',['tribal:vampire']),'tribalPayoff:vampire'));
});
for(const [index,keys]of [[0,['tribal:vampire']],[1,['tribal:goblin']],[2,['artifact','artifactPayoff','manaRock']],[3,['instant','sorcery','spellPayoff','velocity']],[4,['graveEnabler','recursion','gravePayoff']],[5,['land','landRamp','landPayoff']]])test(`${commanders[index].name}: generated filters match classified main-deck cards and Stage 1 targets`,async()=>{
 const {deck,client,result,analysis}=await generated(index),report=health.evaluate(analysis,rules.validate(deck,client));assert.equal(report.label,'Healthy');assert.equal(model.count(deck),100);
 for(const key of keys)assert.ok(analysis.categories.some(c=>c.id===key&&c.count>0),key);
 for(const category of analysis.categories){const keys=health.filterKeys(analysis,category.id);const expected=deck.entries.filter(e=>e.zone==='main'&&(category.id==='all'||analysis.cardRoles[e.printingId].roles.includes(category.id)));assert.deepEqual([...keys],expected.map(e=>e.key));assert.equal(category.count,expected.reduce((n,e)=>n+e.quantity,0));}
 for(const metric of analysis.metrics){assert.equal(metric.target,result.identity.targets[metric.key]);assert.equal(metric.count,result.identity.counts[metric.key]||0);assert.ok(metric.count>=metric.target);}
 assert.ok(analysis.categories.every(c=>c.id==='all'||c.count>0));
});
test('Edgar exposes chosen token/aristocrats categories but no spellslinger, landfall or artifact-payoff category',async()=>{
 const {analysis}=await generated(0,{secondaryStyle:'tokens',tertiaryStyle:'aristocrats'});for(const key of ['tribal:vampire','tokenMaker','tokenPayoff','outlet','deathPayoff'])assert.ok(analysis.categories.some(c=>c.id===key));for(const key of ['spellPayoff','landPayoff','artifactPayoff','poison','vehicle'])assert.ok(!analysis.categories.some(c=>c.id===key));
});
test('zero-count categories appear when evidenced cards are added, without changing saved strategy targets',async()=>{
 for(const [index,key,type,text]of [[0,'tribalPayoff:vampire','Creature — Vampire','Other Vampires you control get +1/+1.'],[3,'cantrip','Instant','Draw a card.'],[5,'additionalLand','Enchantment','You may play an additional land on each of your turns.']]){
  const {deck}=await generated(index),before=JSON.stringify(deck.generation),c=card(9800+index,{type_line:type,oracle_text:text,cmc:1,color_identity:commanders[index].colors}),edited=swapIn(deck,c),analysis=health.analyse(edited);assert.ok(analysis.categories.some(c=>c.id===key&&c.count>0));assert.equal(JSON.stringify(edited.generation),before);
 }
});
test('counts include quantities and multiple finishes while legality continues to reject illegal duplicates',async()=>{
 const {deck,client}=await generated(),entry=deck.entries.find(e=>e.zone==='main'&&/Vampire/.test(deck.cards[e.printingId].frontType)),before=health.analyse(deck).counts['tribal:vampire'];let edited=model.setQuantity(deck,entry.key,3);edited=model.add(edited,deck.cards[entry.printingId],{finish:'foil'});const report=health.evaluate(health.analyse(edited),rules.validate(edited,client));assert.equal(report.counts['tribal:vampire'],before+3);assert.notEqual(report.label,'Healthy');assert.ok(report.validation.issues.some(i=>i.code==='copies'));
});
test('manual removals update health instead of trusting saved generation counts',async()=>{
 const {deck,client}=await generated(0,{priorities:{adherence:'strict'}});let edited=deck;for(const entry of deck.entries.filter(e=>e.zone==='main'&&/Vampire/.test(deck.cards[e.printingId].frontType)).slice(0,20))edited=model.setQuantity(edited,entry.key,0);const report=health.evaluate(health.analyse(edited),rules.validate(edited,client)),tribe=report.metrics.find(m=>m.key==='tribal:vampire');assert.equal(tribe.target,36);assert.ok(tribe.count<tribe.target);assert.equal(report.state,'major-gaps');assert.ok(report.warnings.some(w=>/Strict Vampire Tribal density/.test(w)));assert.notEqual(tribe.count,edited.generation.counts['tribal:vampire']);
});
for(const [priority,a,b,role]of [['removal','light','heavy','interaction'],['ramp','light','heavy','ramp'],['protection','low','high','protection'],['adherence','loose','strict','tribal:vampire']])test(`${priority} changes Deck Health expectations using Stage 1`,async()=>{
 const x=await generated(0,{priorities:{[priority]:a}}),y=await generated(0,{priorities:{[priority]:b}}),ma=x.analysis.metrics.find(m=>m.key===role),mb=y.analysis.metrics.find(m=>m.key===role);assert.ok(mb.target>ma.target);assert.equal(mb.target,y.result.identity.targets[role]);
});
test('Tutors None and Combo None do not create missing-tutor or missing-combo-package warnings',async()=>{
 const {analysis}=await generated();assert.equal(analysis.metrics.find(m=>m.key==='tutor').target,0);assert.ok(!analysis.metrics.some(m=>m.key==='comboPiece'));assert.ok(!analysis.warnings.some(w=>/tutor|combo/i.test(w)));
});
test('qualitative health states have no fake precision and distinguish low from intentional counts',()=>{
 assert.equal(health.metricState(9,10,false).healthLabel,'Slightly low');assert.equal(health.metricState(3,10,false).healthLabel,'Too low');assert.equal(health.metricState(17,17,true).healthLabel,'High / intentional');assert.equal(health.metricState(0,0,false).healthLabel,'No minimum selected');
});
test('stale current legality prevents a Healthy verdict even if every composition target is met',async()=>{
 const {analysis,deck}=await generated(),r=health.evaluate(analysis,rules.validate(deck));assert.equal(r.state,'needs-verification');assert.equal(r.structuralState,'healthy');assert.ok(r.validation.issues.some(i=>i.code==='stale'));
});
test('changing commander, format or losing target metadata cannot leave a false Healthy verdict',async()=>{
 const {deck,client}=await generated();const e=deck.entries.find(e=>e.zone==='commander');const noLeader=model.setQuantity(deck,e.key,0);assert.equal(health.evaluate(health.analyse(noLeader),rules.validate(noLeader,client)).state,'major-gaps');const changed=model.edit(deck,{format:'standard'});assert.equal(health.analyse(changed).configured,false);assert.ok(!health.analyse(changed).categories.some(c=>c.id==='tribal:vampire'));const bad=model.edit(deck,{generation:{...deck.generation,targets:{land:38}}});assert.equal(health.analyse(bad).structuralState,'not-assessed');
});
test('roles and identity reconstruct after version-1 JSON backup/restore; derived roles never grant verification',async()=>{
 const {deck}=await generated(),roundtrip=store.decodeBackup(store.encodeBackup(deck));assert.equal(roundtrip.schemaVersion,1);assert.deepEqual(roundtrip.generation,deck.generation);const before=health.analyse(deck),after=health.analyse(roundtrip);assert.deepEqual(after.counts,before.counts);assert.deepEqual(after.categories,before.categories);assert.deepEqual(after.cardRoles,before.cardRoles);assert.deepEqual(roundtrip.entries,deck.entries);assert.equal(health.evaluate(after,rules.validate(roundtrip)).state,'needs-verification');
});
test('older generated drafts without curve/bracket/commander metadata remain readable and assess stored targets',async()=>{
 const {deck}=await generated(0,{curve:'low'});const generation={...deck.generation};delete generation.curve;delete generation.bracket;delete generation.commanderOracles;const old=store.sanitizeDeck({...deck,generation}),a=health.analyse(old);assert.equal(a.configured,true);assert.equal(a.metrics.find(m=>m.key==='tribal:vampire').target,generation.targets['tribal:vampire']);assert.equal(a.structuralState,'healthy');
});
test('filter selection never mutates deck records, generation settings, selection or exact printing keys',async()=>{
 const {deck,analysis}=await generated(),before=JSON.stringify(deck);for(const c of analysis.categories)health.filterKeys(analysis,c.id);assert.equal(JSON.stringify(deck),before);assert.deepEqual([...health.filterKeys(analysis,'unknown')],[...health.filterKeys(analysis,'all')]);
});
test('generic untap effects are engines, not falsely declared combo pieces',()=>{
 const c=inspect('Artifact','{T}: Untap target artifact.',['artifacts']);assert.ok(has(c,'comboEngine'));assert.ok(!has(c,'comboPiece'));
});
test('style coverage counts each supporting main-deck card once per selected identity, allowing overlap across identities',async()=>{
 const {analysis}=await generated(0,{secondaryStyle:'tokens',tertiaryStyle:'aristocrats'});assert.equal(analysis.styleCoverage.length,3);for(const coverage of analysis.styleCoverage){const entries=analysis.entries.filter(e=>e.zone==='main'&&e.styles.includes(coverage.key));assert.equal(coverage.count,entries.reduce((n,e)=>n+e.quantity,0));assert.deepEqual(coverage.entryKeys,entries.map(e=>e.key));}assert.deepEqual(analysis.styleCoverage.map(s=>s.rank),['Primary','Secondary','Tertiary']);assert.ok(analysis.entries.some(e=>e.zone==='main'&&e.styles.length>1));
});
test('all broad card types are available only when present, including split front/combined types',()=>{
 let deck=model.createDeck({format:'modern'});for(const [n,type]of ['Land','Creature — Test','Artifact','Enchantment','Instant','Sorcery','Planeswalker — Test'].entries())deck=model.add(deck,card(9700+n,{type_line:type}));const a=health.analyse(deck);for(const key of ['land','creature','artifact','enchantment','instant','sorcery','planeswalker'])assert.equal(a.categories.find(c=>c.id===key).count,1);
 const split=inspect('Instant','Draw a card.',[],{layout:'split',type:'Instant // Sorcery'});assert.ok(has(split,'instant')&&has(split,'sorcery'));
});
test('catalogued combo roles require both matching cards and remain potential, not certified wins',async()=>{
 const {deck}=await generated(2),scepter=card(9600,{name:'Isochron Scepter',type_line:'Artifact',oracle_text:'Imprint — Exile an instant card from your hand.',color_identity:[]}),reversal=card(9601,{name:'Dramatic Reversal',type_line:'Instant',oracle_text:'Untap all nonland permanents you control.',color_identity:['U']});const one=health.analyse(model.add(deck,scepter));assert.ok(!one.cardRoles[scepter.id].roles.includes('comboPiece'));const both=health.analyse(model.add(model.add(deck,scepter),reversal));assert.equal(both.categories.find(c=>c.id==='comboPiece').count,2);assert.match(both.cardRoles[scepter.id].evidence.comboPiece.source,/prerequisites required/);
});
test('additional universal role filters are real subsets but stay out of default strategy-chip policy',async()=>{
 const {deck}=await generated(),tax=card(9602,{type_line:'Enchantment',oracle_text:'Spells your opponents cast cost {1} more to cast.'}),analysis=health.analyse(model.add(deck,tax));const category=analysis.categories.find(c=>c.id==='stax');assert.equal(category.group,'additional');assert.equal(category.count,1);assert.deepEqual([...health.filterKeys(analysis,'stax')],[model.entryKey(tax.id,tax.finish,'main')]);assert.ok(!analysis.categories.some(c=>c.id==='landPayoff'));
});
test('printing-compatible entry keys update without copying or mutating a second deck representation',async()=>{
 const {deck}=await generated(),entry=deck.entries.find(e=>e.zone==='main'&&/Vampire/.test(deck.cards[e.printingId].frontType)),original=deck.cards[entry.printingId],replacement={...original,id:card(9603).id};const next=model.add(model.setQuantity(deck,entry.key,0),replacement,{finish:'foil'}),a=health.analyse(next);assert.ok(health.filterKeys(a,'tribal:vampire').has(model.entryKey(replacement.id,'foil','main')));assert.ok(!health.filterKeys(a,'tribal:vampire').has(entry.key));assert.equal(next.cards[replacement.id],replacement);
});
for(const [index,options,role,pattern]of [[0,{priorities:{removal:'heavy'}},'interaction',/Heavy Removal was selected/],[1,{primaryStyle:'tokens'},'tokenPayoff',/Token production needs more payoffs/],[0,{primaryStyle:'aristocrats'},'outlet',/Sacrifice payoffs need reliable outlets/]])test(`${role} warnings explain the selected strategy/priority after manual removals`,async()=>{
 const {deck,client}=await generated(index,options);let edited=deck;const a=health.analyse(deck);for(const e of deck.entries.filter(e=>e.zone==='main'&&a.cardRoles[e.printingId].components.includes(role)))edited=model.setQuantity(edited,e.key,0);const report=health.evaluate(health.analyse(edited),rules.validate(edited,client));assert.ok(report.warnings.some(message=>pattern.test(message)),JSON.stringify(report.warnings));assert.notEqual(report.label,'Healthy');
});
test('incomplete or zeroed positive targets cannot manufacture a Healthy deck report',async()=>{
 const {deck,client}=await generated();const generation={...deck.generation,targets:{...deck.generation.targets,land:0,ramp:0}};const edited=model.edit(deck,{generation});assert.equal(health.evaluate(health.analyse(edited),rules.validate(edited,client)).structuralState,'not-assessed');
});
