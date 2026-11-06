/* Synthetic catalogue fixtures. Never real printing, finish, price or legality claims. */
const {card,id}=require('./cards.cjs');
const model=require('../../assets/js/deck-model.js');
function fixture({count=2,quantity=1,format='pauper',land=true}={}){
 const originals=Array.from({length:count},(_,i)=>card(i+1,{name:'Synthetic Card '+(i+1),type_line:land?'Basic Land — Plains':'Artifact',color_identity:[],cmc:0,released_at:'2025-01-01',frame:'2015'}));
 let deck=model.createDeck({format});for(const c of originals)deck=model.add(deck,c,{quantity,finish:'nonfoil'});
 const records=new Map(originals.map(c=>[c.id,c])),catalogues=new Map(originals.map(c=>[c.oracleId,[c]])),accepted=new WeakSet(originals),calls=[];
 const alternate=(original,n,patch={})=>{const alt={...original,id:id(n),setCode:'ALT',setName:'Synthetic Alternate',collectorNumber:String(n),released:'2020-01-01',...patch};records.set(alt.id,alt);catalogues.get(original.oracleId).push(alt);return alt;};
 const client={calls,isVerified:c=>accepted.has(c),proof:()=>true,commanderEligibility:async(c,{signal}={})=>{if(signal?.aborted)throw Object.assign(Error('cancel'),{name:'AbortError'});calls.push({kind:'eligibility',id:c.id});return true;},
  printings:async(oracle,{signal,page,order}={})=>{if(signal?.aborted)throw Object.assign(Error('cancel'),{name:'AbortError'});calls.push({kind:'catalogue',oracle,page,order});return {cards:catalogues.get(oracle),nextPage:''};},
  printing:async({id,requestedFinish},{signal}={})=>{if(signal?.aborted)throw Object.assign(Error('cancel'),{name:'AbortError'});calls.push({kind:'exact',id,finish:requestedFinish});const c=records.get(id);if(!c)throw Error('missing printing');accepted.add(c);return c;},
  ensure:async(cards,{signal}={})=>{if(signal?.aborted)throw Object.assign(Error('cancel'),{name:'AbortError'});return cards.map(c=>{const next=records.get(c.id)||c;accepted.add(next);return next;});},refresh:async(cards)=>cards};
 return {deck,originals,records,catalogues,accepted,calls,alternate,client};
}
module.exports={fixture};
