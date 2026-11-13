/* Real commander Oracle identities from the dated source ledger; candidate pools are
 * explicitly synthetic, mechanically varied and never published as real card facts. */
const ledger=require('../fixtures/phase4-oracle.json'),data=require('../../assets/js/deck-data.js'),model=require('../../assets/js/deck-model.js');
const {raw,id}=require('./cards.cjs'),{fakeClient}=require('./generation.cjs');
const specs=[['Krenko, Mob Boss','tribal:goblin'],['Rhys the Redeemed','tokens'],['Teysa Karlov','aristocrats'],['Talrand, Sky Summoner','spellslinger'],['Urza, Lord High Artificer','artifacts'],['Meren of Clan Nel Toth','graveyard'],['Tatyova, Benthic Druid','landfall'],['Sram, Senior Edificer','voltron'],['Atraxa, Grand Unifier','value'],['Alela, Artful Provocateur','artifacts'],['Niv-Mizzet, Parun','spellslinger']];
function fixture(index=0,{thinSpells=index===0}={}){
 const [name,style]=specs[index],source=ledger.records.find(c=>c.name===name);if(!source)throw Error('Missing verified commander '+name);
 const commander=data.normaliseCard({...source,prices:{eur:'0.10',eur_foil:'0.20'}},{id:source.id});
 const colors=commander.colorIdentity;let serial=5000;let records=[commander];
 const make=(ty,t,mana=2)=>{const n=serial++;return data.normaliseCard(raw(n,{name:'Synthetic package card '+n,type_line:ty,oracle_text:t,cmc:mana,color_identity:colors,mana_cost:colors.length?'{'+colors[0]+'}':'{C}',prices:{eur:'0.10',eur_foil:'0.20'}}),{id:id(n)});};
 const basics={W:'Plains',U:'Island',B:'Swamp',R:'Mountain',G:'Forest'};for(const color of colors){const c=make('Basic Land — '+basics[color],'{T}: Add {'+color+'}.',0);records.push({...c,name:basics[color],colorIdentity:[color]});}
 const tribe=style==='tribal:goblin'?'Goblin':'Test';
 const groups=[
 [20,'Creature — Test','When this creature enters, draw two cards.',2],
 [15,'Creature — Test','{T}: Add {C}.',2],
 [15,'Creature — Test','When this creature enters, destroy target creature.',3],
 [10,'Creature — Test','Target creature gains hexproof until end of turn.',2],
 [40,'Creature — '+tribe,'When this creature enters, draw two cards.',2],
 [20,'Creature — '+tribe,'{T}: Add {C}.',2],
 [20,'Creature — '+tribe,'When this creature enters, destroy target creature.',3],
 [12,'Creature — '+tribe,'Target creature gains hexproof until end of turn.',2],
 [15,'Creature — '+tribe,'{T}: Create a 1/1 creature token.',2],
 [12,'Creature — '+tribe,'Other creatures you control get +1/+1.',3],
 [15,'Creature — '+tribe,'Sacrifice another creature: Draw a card.',2],
 [14,'Enchantment','Whenever another creature you control dies, each opponent loses 1 life.',2],
 [20,'Artifact','{T}: Add {C}.',2],
 [30,'Artifact','When this artifact enters, draw two cards.',2],
 [10,'Artifact','{T}: Destroy target creature.',3],
 [12,'Artifact','Artifacts you control have hexproof.',3],
 [12,'Artifact','Whenever you cast an artifact spell, create a 1/1 artifact creature token.',3],
 [20,'Sorcery','Draw two cards.',2],
 [20,'Instant','Destroy target creature.',2],
 [6,'Sorcery','Destroy all creatures.',5],
 [14,'Instant','Target creature gains hexproof and indestructible until end of turn.',2],
 [20,'Sorcery','Mill three cards. Return target creature card from your graveyard to your hand.',2],
 [18,'Sorcery','Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',2],
 [14,'Enchantment','Landfall — Whenever a land you control enters, create a 1/1 creature token.',3],
 [14,'Creature — Wizard','Whenever you cast an instant or sorcery spell, draw a card.',2],
 [18,'Artifact — Equipment','Equipped creature gets +2/+2 and has trample. Equip {1}',2],
 [10,'Creature — Warrior','Whenever you cast an Equipment spell, draw a card.',2],
 [8,'Land','{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',0]
 ];for(const [n,ty,t,m]of groups)for(let j=0;j<n;j++)records.push(make(ty,t,m));
 for(const name of ['Guttersnipe','Fiery Inscription','Blood Artist','Skullclamp','Impact Tremors','Craterhoof Behemoth']){const c=ledger.records.find(c=>c.name===name);records.push(data.normaliseCard({...c,prices:{eur:'0.10',eur_foil:'0.20'}},{id:c.id}));}
 if(thinSpells){const spells=records.filter(c=>/Instant|Sorcery/.test(c.frontType));const allowed=new Set([...spells.filter(c=>/Destroy all/.test(c.rulesText)).slice(0,2),...spells.filter(c=>!/Destroy all/.test(c.rulesText)).slice(0,3)].map(c=>c.id));records=records.filter(c=>!/Instant|Sorcery/.test(c.frontType)||allowed.has(c.id));}
 // Prices above belong only to deterministic synthetic pool tests; real identities/text/colours are retained.
 let deck=model.add(model.createDeck({name:'Quality fixture '+name}),commander,{zone:'commander'});deck=model.select(deck,commander);
 return {style,spec:source,commander,records,deck};
}
module.exports={fixture,specs,fakeClient,ledger};
