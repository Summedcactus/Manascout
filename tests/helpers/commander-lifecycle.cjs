/* Real client/controller dependencies against deterministic synthetic HTTP records. */
const {fixture}=require('./generation.cjs');
const {raw}=require('./cards.cjs');
const {createClient}=require('../../assets/js/deck-client.js');
function harness({colors=['G'],pair=false,background=false,hook=async()=>{},timeout=1000,now,identityIndex=null,createClientImpl=createClient}={}){
 const f=identityIndex===null?fixture({colors,pair}):require('./deck-identity.cjs').identityFixture(identityIndex);
 if(background){
  f.commander={...f.commander,frontText:f.commander.frontText+'\nChoose a Background',rulesText:f.commander.rulesText+'\nChoose a Background'};
  f.second={...f.second,frontType:'Legendary Enchantment — Background',type:'Legendary Enchantment — Background',frontText:'Commander creatures you own have vigilance.',rulesText:'Commander creatures you own have vigilance.'};
  f.records=f.records.map(c=>c.id===f.commander.id?f.commander:c.id===f.second.id?f.second:c);
 }
 const raws=f.records.map((c,i)=>raw(i+1,{id:c.id,oracle_id:c.oracleId,name:c.name,type_line:c.frontType,oracle_text:c.frontText,cmc:Number(c.manaValue),color_identity:c.colorIdentity,mana_cost:c.manaCost,finishes:c.availableFinishes,prices:{eur:'0.10',eur_foil:'0.20'}}));
 const calls=[];let poolCount=0,collections=0;
 const client=createClientImpl({interval:0,timeout,...(now?{now}:{}),fetchImpl:async(url,options)=>{
  const u=new URL(url),q=u.searchParams.get('q')||'';
  const call={url,options,q,poolCount,collections};calls.push(call);
  const custom=await hook(call,{raws,f});if(custom)return custom;
  let data;
  if(u.pathname==='/cards/random')return response(raws[0]);
  if(u.pathname==='/cards/autocomplete')return response({data:[f.commander.name]});
  if(u.pathname==='/cards/collection'){collections++;data=raws.filter(c=>JSON.parse(options.body).identifiers.some(x=>x.id===c.id));}
  else if(u.pathname==='/cards/search'){
   if(q.includes('oracleid:'))data=raws.filter(c=>q.includes(c.oracle_id)&&/Legendary Creature/.test(c.type_line));
   else if(q.startsWith('f:commander game:paper')){poolCount++;data=raws;}
   else data=raws.filter(c=>/Legendary Creature/.test(c.type_line));
  }else return response(raws.find(c=>u.pathname==='/cards/'+c.id)||{},raws.some(c=>u.pathname==='/cards/'+c.id)?200:404);
  return response({data,has_more:false},data.length?200:404);
 }});
 return {f,raws,client,calls};
}
function response(value,status=200){return {ok:status===200,status,json:async()=>value};}
const drain=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(fn){for(let i=0;i<1000&&!fn();i++)await drain();if(!fn())throw Error('Expected controller state did not settle');}
module.exports={harness,response,until,drain};
