/* Verified Oracle excerpts for analysis; synthetic printing IDs and synthetic candidate
 * cards below exercise algorithms. They are NOT real printings, prices or card claims.
 * Sources checked 2026-11-05. Live legality still comes from the production client. */
const {card,fakeClient}=require('./generation.cjs');
const model=require('../../assets/js/deck-model.js');
const commanders=[
 {name:'Edgar Markov',type:'Legendary Creature — Vampire Knight',colors:['W','B','R'],mv:6,text:'Eminence — Whenever you cast another Vampire spell, if Edgar is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar attacks, put a +1/+1 counter on each Vampire you control.',source:'https://www.mtg.wtf/card/c17/36/Edgar-Markov'},
 {name:'Krenko, Mob Boss',type:'Legendary Creature — Goblin Warrior',colors:['R'],mv:4,text:'{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',source:'https://www.mtg.wtf/card/m13/138/Krenko-Mob-Boss'},
 {name:'Urza, Lord High Artificer',type:'Legendary Creature — Human Artificer',colors:['U'],mv:4,text:'When Urza enters, create a 0/0 colorless Construct artifact creature token with "This token gets +1/+1 for each artifact you control."\nTap an untapped artifact you control: Add {U}.\n{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost.',source:'https://mtg.wtf/card/cmm/130/Urza-Lord-High-Artificer'},
 {name:'Talrand, Sky Summoner',type:'Legendary Creature — Merfolk Wizard',colors:['U'],mv:4,text:'Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.',source:'https://www.mtg.wtf/card/m13/72/Talrand-Sky-Summoner'},
 {name:'Meren of Clan Nel Toth',type:'Legendary Creature — Human Shaman',colors:['B','G'],mv:4,text:"Whenever another creature you control dies, you get an experience counter.\nAt the beginning of your end step, choose target creature card in your graveyard. If that card’s mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.",source:'https://www.mtg.wtf/card/cmm/584/Meren-of-Clan-Nel-Toth'},
 {name:'Tatyova, Benthic Druid',type:'Legendary Creature — Merfolk Druid',colors:['G','U'],mv:5,text:'Landfall — Whenever a land you control enters, you gain 1 life and draw a card.',source:'https://www.mtg.wtf/card/fdn/247/Tatyova-Benthic-Druid'}
];
const recordsForAnalysis=spec=>({name:spec.name,frontType:spec.type,frontText:spec.text,rulesText:spec.text,colorIdentity:spec.colors,manaValue:String(spec.mv)});
function identityFixture(index=0){
 const spec=commanders[index];let serial=2000;
 const make=(type,text,extra={})=>card(serial++,{name:'Synthetic identity card '+serial,type_line:type,oracle_text:text,cmc:3,color_identity:spec.colors,mana_cost:spec.colors.map(c=>'{'+c+'}').join(''),edhrec_rank:100,...extra});
 const commander=make(spec.type,spec.text,{name:spec.name,cmc:spec.mv}),records=[commander];
 const basics={W:'Plains',U:'Island',B:'Swamp',R:'Mountain',G:'Forest'};
 for(const color of spec.colors)records.push(make('Basic Land — '+basics[color],'{T}: Add {'+color+'}.',{name:basics[color],color_identity:[color],cmc:0}));
 for(let i=0;i<4;i++)records.push(make('Land','{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',{cmc:0}));
 const tribe=index===0?'Vampire':index===1?'Goblin':'Test';
 // Deliberately separable infrastructure, allowing meaningful Light/Heavy differences.
 const groups=[
  [30,'Artifact','',],
  [20,'Artifact','{T}: Add {C}.'],[20,'Sorcery','Draw two cards.'],
  [20,'Instant','Destroy target creature.'],[7,'Sorcery','Destroy all creatures.'],
  [12,'Instant','Target creature gains hexproof and indestructible until end of turn.'],
  [10,'Sorcery','Return target creature card from your graveyard to your hand.'],
  [10,'Sorcery','Search your library for a creature card, reveal it, put it into your hand, then shuffle.'],
  [12,'Artifact','{T}: Untap target artifact.'],
  [45,'Creature — '+tribe,'Flying.'],
  [8,'Creature — '+tribe,'{T}: Add {C}.'],
  [8,'Creature — '+tribe,'When this creature enters, destroy target creature.'],
  [12,'Creature — '+tribe,'When this creature enters, draw two cards.'],
  [18,'Creature — '+tribe,'Create a 1/1 creature token.'],
  [12,'Creature — '+tribe,'Other creatures you control get +1/+1.'],
  [14,'Creature — '+tribe,'Sacrifice another creature: Draw a card.'],
  [14,'Creature — '+tribe,'Whenever another creature you control dies, each opponent loses 1 life.'],
  [18,'Artifact','Whenever you cast an artifact spell, create a 1/1 artifact creature token.'],
  [12,'Artifact','Artifacts you control have hexproof.'],
  [18,'Creature — Test','Whenever you cast an instant or sorcery spell, draw a card.'],
  [15,'Sorcery','Mill three cards. Return target creature card from your graveyard to your hand.'],
  [15,'Sorcery','Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.'],
  [14,'Creature — Test','Landfall — Whenever a land you control enters, create a 1/1 creature token.']
 ];
 for(const [n,type,text]of groups)for(let i=0;i<n;i++)records.push(make(type,text,{cmc:type.includes(tribe)?4:2,edhrec_rank:type.includes(tribe)?20000:100}));
 let deck=model.add(model.createDeck({name:'Identity fixture '+index}),commander,{zone:'commander',finish:'foil'});deck=model.select(deck,commander,'foil');
 return {spec,commander,records,deck};
}
module.exports={commanders,recordsForAnalysis,identityFixture,fakeClient};
