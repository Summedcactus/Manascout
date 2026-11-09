/* Authored-CSS cascade checks, not a browser/layout engine. Resolve matching rules,
   media queries, specificity, !important and inherited variables against real markup. */
const fs=require('node:fs');
const source=fs.readFileSync('assets/css/home.css','utf8').replace(/\/\*[^]*?\*\//g,'');
function rules(width,reduced){
 const out=[];
 const media=q=>(!q.includes('prefers-reduced-motion')||reduced===q.includes(': reduce'))&&[...q.matchAll(/(max|min)-width:\s*(\d+)px/g)].every(([,kind,n])=>kind==='max'?width<=Number(n):width>=Number(n));
 function parse(text){let i=0;while(i<text.length){const open=text.indexOf('{',i);if(open<0)break;const head=text.slice(i,open).trim();let end=open+1,depth=1;while(depth&&end<text.length){depth+=(text[end]==='{')-(text[end]==='}');end++;}const body=text.slice(open+1,end-1);if(head.startsWith('@media')){if(media(head))parse(body);}else if(!head.startsWith('@'))for(const selector of head.split(/,(?![^()]*\))/)){const declarations=body.split(';').map(d=>{const colon=d.indexOf(':');if(colon<0)return null;const value=d.slice(colon+1).trim(),important=/!important\s*$/.test(value);return [d.slice(0,colon).trim(),value.replace(/\s*!important\s*$/,''),important];}).filter(Boolean);out.push({selector:selector.trim(),declarations});}i=end;}}
 parse(source);return out;
}
function compound(node,s,pseudo,hover){
 const pe=s.match(/::(before|after)$/)?.[1]||'';if(pe!==pseudo)return false;s=s.replace(/::(?:before|after)$/,'');
 if(s.includes(':not('))return false;
 if(s.includes(':hover')){if(!hover)return false;s=s.replace(':hover','');}
 if(/:[\w-]+/.test(s))return false;
 for(const [,key,value]of s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(node.getAttribute(key)===null||(value!==undefined&&node.getAttribute(key)!==value))return false;
 s=s.replace(/\[[^\]]+\]/g,'');for(const [,id]of s.matchAll(/#([\w-]+)/g))if(node.getAttribute('id')!==id)return false;
 for(const [,cls]of s.matchAll(/\.([\w-]+)/g))if(!node.className.split(/\s+/).includes(cls))return false;
 const tag=s.match(/^[a-z][\w-]*/)?.[0];return !tag||node.tagName===tag;
}
function matches(node,selector,pseudo,hover){
 const parts=selector.replace(/\s*>\s*/g,' > ').trim().split(/\s+/);let i=parts.length-1;if(!compound(node,parts[i--],pseudo,hover))return false;
 while(i>=0){const child=parts[i]==='>';if(child)i--;const part=parts[i--];let parent=node.parentElement;if(child){if(!parent||!compound(parent,part,'',hover))return false;}else{while(parent&&!compound(parent,part,'',hover))parent=parent.parentElement;if(!parent)return false;}node=parent;}return true;
}
const specificity=s=>(s.match(/#[\w-]+/g)||[]).length*100+(s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)||[]).length*10+(s.match(/(?:^|[ >])[a-z][\w-]*|::[\w-]+/g)||[]).length;
function computed(node,{width=1280,reduced=false,pseudo='',hover=false}={}){
 const all=rules(width,reduced),memo=new Map();
 function resolve(el,pe=''){
  const key=pe?el:null;if(!pe&&memo.has(el))return memo.get(el);
  const inherited=pe?resolve(el):el.parentElement?resolve(el.parentElement):{},values={},ranks={};
  const set=(name,value,important,score,order)=>{const rank=[Number(important),score,order],old=ranks[name];if(!old||rank[0]>old[0]||rank[0]===old[0]&&(rank[1]>old[1]||rank[1]===old[1]&&rank[2]>=old[2])){ranks[name]=rank;values[name]=value;}};
  for(const [i,rule]of all.entries())if(matches(el,rule.selector,pe,hover))for(const [name,value,important]of rule.declarations){set(name,value,important,specificity(rule.selector),i);if(name==='animation')set('animation-play-state',value.includes('paused')?'paused':'running',important,specificity(rule.selector),i);}
  if(!pe)for(const [name,value]of Object.entries(el.style))if(typeof value==='string')set(name,value,false,1000,all.length);
  const vars={...Object.fromEntries(Object.entries(inherited).filter(([k])=>k.startsWith('--'))),...Object.fromEntries(Object.entries(values).filter(([k])=>k.startsWith('--')))};
  const expand=(s,depth=0)=>{if(depth>8)throw Error('Unresolved variable cycle');return s.replace(/var\((--[\w-]+)(?:,([^()]+))?\)/g,(_,name,fallback)=>expand(vars[name]??fallback??'UNDEFINED',depth+1));};
  const result={...vars,...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v==='inherit'?inherited[k]:expand(v)]))};if(!pe)memo.set(el,result);return result;
 }return resolve(node,pseudo);
}
module.exports={computed};
