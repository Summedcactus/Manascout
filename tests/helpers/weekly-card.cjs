const fs=require('node:fs'),vm=require('node:vm'),{dom}=require('./card-dom.cjs');
const source=fs.readFileSync('assets/js/scoutboard.js','utf8');
function mount({fine=true,reduced=false,set='mh3',number='383',name='Ulamog, the Defiler',initialQuery='',observer=true,cached=false,legacyMedia=false,animations=false,width=1280}={}){
 const d=dom(),html=fs.readFileSync('index.html','utf8'),start=html.indexOf('<article class="weekly-card-feature');d.document.body.innerHTML=html.slice(start,html.indexOf('</article>',start)+10);
 const weekly=d.document.getElementById('card-of-the-week'),shell=d.document.getElementById('weekly-card-shell'),stage=shell.closest('.weekly-card-stage'),image=d.document.getElementById('card-week-image');Object.assign(weekly.dataset,{weeklySet:set,weeklyNumber:number,weeklyCard:name});const listeners={},listenerOptions={};image.complete=cached;image.naturalWidth=cached?488:0;
 const add=stage.addEventListener.bind(stage);stage.addEventListener=(type,fn,options)=>{listenerOptions[type]=options;add(type,fn,options);};
 const media=matches=>{const m={matches,listeners:[],change(value){this.matches=value;this.listeners.forEach(fn=>fn());}};if(legacyMedia)m.addListener=fn=>m.listeners.push(fn);else m.addEventListener=(_t,fn)=>m.listeners.push(fn);return m;};
 const c={...d,Math,weekly,weeklyShell:shell,weeklyImage:image,initialQuery,finePointer:media(fine),reducedMotion:media(reduced),window:{innerWidth:1280,innerHeight:800,addEventListener(t,fn){(listeners[t]||=[]).push(fn);}}};
 const jobs=[];
 const basePose='matrix3d(0.9954,-0.0047,0.0957,0,0,0.9988,0.0489,0,-0.0958,-0.0486,0.9942,0,0,-3,41,1)';
 let active=null;
 if(animations){
  const {computed}=require('./weekly-cascade.cjs'),floating=shell.parentElement;
  const matrix=value=>{const m=/^translate3d\(([-\d.]+)px,([-\d.]+)px,([-\d.]+)px\)$/.exec(value);return m?`matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,${m[1]},${m[2]},${m[3]},1)`:value;};
  c.window.getComputedStyle=el=>{const style=computed(el,{width,reduced:c.reducedMotion.matches});return {...style,transform:el===floating?matrix(active?.current||basePose):style.transform,getPropertyValue:name=>style[name]||''};};
  floating.animate=(frames,options)=>{let resolve,reject,observed=false;const promise=new Promise((a,b)=>{resolve=a;reject=b;});const job={frames,options,current:frames[0].transform,cancelled:false,get finished(){observed=true;return promise;},cancel(){this.cancelled=true;if(active===this)active=null;if(observed)reject(Error('cancelled'));},finish(){this.current=frames.at(-1).transform;resolve();},sample(value){this.current=value;}};jobs.push(job);active=job;return job;};
 }
 if(!observer)c.IntersectionObserver=undefined;
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  /* One input system'),source.indexOf('  /* ========================================\n     END')),c);
 return {d,c,weekly,stage,shell,image,listeners,listenerOptions,jobs,basePose,state(state){listeners['manascout:statechange'].forEach(fn=>fn({detail:{state}}));},visible(value){d.observers[0]?.deliver(stage,value);}};
}
module.exports={mount};
