/* Synthetic role pools, not claims about real cards, prices or Commander power. */
const {card,raw,id}=require('./cards.cjs');
const model=require('../../assets/js/deck-model.js');
function fixture({pair=false,seed=false,budgetPrice='0.10',colors=['G']}={}){
 const priced={prices:{eur:budgetPrice,eur_foil:budgetPrice===null?null:String(Number(budgetPrice)*2)},mana_cost:colors.length?'{'+colors[0]+'}':'{C}'};
 const commander=card(900,{...priced,name:'Fixture Artificer',cmc:3,type_line:'Legendary Creature — Artificer',color_identity:colors,oracle_text:'Whenever you cast an artifact spell, draw a card.'+(pair?'\nPartner':'')});
 const second=card(901,{...priced,name:'Fixture Partner',type_line:'Legendary Creature — Test',color_identity:['W'],oracle_text:'Partner'});
 const original=card(902,{...priced,type_line:'Artifact',color_identity:['G'],oracle_text:'Whenever you cast an artifact spell, create a Treasure token.'});
 const forest=card(910,{...priced,name:'Forest',type_line:'Basic Land — Forest',color_identity:['G'],oracle_text:'{T}: Add {G}.'});
 const plains=card(911,{...priced,name:'Plains',type_line:'Basic Land — Plains',color_identity:['W'],oracle_text:'{T}: Add {W}.'});
 const wastes=card(912,{...priced,name:'Wastes',type_line:'Basic Land',oracle_text:'{T}: Add {C}.'});
 const groups=[
  [12,'{T}: Add {G}.',2],
  [12,'When this artifact enters, draw two cards.',3],
  [12,'{T}: Destroy target creature.',3],
  [4,'{5}: Destroy all creatures.',5],
  [6,'Artifacts you control have hexproof.',3],
  [6,'Return target artifact card from your graveyard to your hand.',3],
  [18,'Whenever you cast an artifact spell, create a 1/1 artifact creature token.',2],
  [12,'Trample. Other creatures you control get +1/+1.',5]
 ];
 let serial=100;const spells=[];
 for(const [n,oracle_text,cmc]of groups)for(let i=0;i<n;i++)spells.push(card(serial++,{...priced,type_line:oracle_text.startsWith('Trample')?'Artifact Creature — Construct':'Artifact',color_identity:colors,oracle_text:colors.length?oracle_text:oracle_text.replaceAll('{G}','{C}'),cmc,edhrec_rank:serial*100}));
 const records=[commander,second,original,forest,plains,wastes,...spells];
 let deck=model.createDeck({name:'Generation fixture'});
 if(seed)deck=model.add(deck,original,{finish:'foil'});else deck=model.add(deck,commander,{zone:'commander',finish:'foil'});
 if(pair)deck=model.add(deck,second,{zone:'commander',finish:'foil'});
 deck=model.select(deck,seed?original:commander,'foil');
 return {deck,commander,second,original,forest,plains,wastes,spells,records};
}
function fakeClient(f,{pool=f.records,fail=false,wait=null,priceRate=.85}={}){
 const calls=[],proofs=new Map();
 return {calls,isVerified:()=>true,proof:c=>proofs.get(c.oracleId)??null,
 commanderEligibility:async(c,{signal}={})=>{calls.push({kind:'proof',id:c.id});if(signal?.aborted)throw Object.assign(Error('cancel'),{name:'AbortError'});const eligible=f.records.some(x=>x.id===c.id&&/Legendary Creature/.test(x.frontType));proofs.set(c.oracleId,eligible);return eligible;},
 refresh:async(cards,{signal}={})=>{calls.push({kind:'refresh',ids:cards.map(c=>c.id)});if(signal?.aborted)throw Object.assign(Error('cancel'),{name:'AbortError'});return cards.map(c=>f.records.find(x=>x.id===c.id)||pool.find(x=>x.id===c.id)).filter(Boolean);},
 candidates:async(q,options={})=>{calls.push({kind:'pool',q,options});if(wait)await wait();if(fail)throw Error('Candidate service unavailable');return q.includes("is:commander") ? pool.filter(c => /Legendary Creature/.test(c.frontType)) : pool;},
 euroRate:async()=>({rate:priceRate,date:'2026-11-04'})};
}
module.exports={fixture,fakeClient,card,raw,id};
