const fs=require('node:fs'),vm=require('node:vm'),{dom}=require('./card-dom.cjs');
const source=fs.readFileSync('assets/js/scoutboard.js','utf8');
function mount({fine=true,reduced=false,set='mh3',number='383',name='Ulamog, the Defiler',initialQuery='',observer=true,cached=false,legacyMedia=false}={}){
 const d=dom(),html=fs.readFileSync('index.html','utf8'),start=html.indexOf('<article class="weekly-card-feature');d.document.body.innerHTML=html.slice(start,html.indexOf('</article>',start)+10);
 const weekly=d.document.getElementById('card-of-the-week'),shell=d.document.getElementById('weekly-card-shell'),stage=shell.closest('.weekly-card-stage'),image=d.document.getElementById('card-week-image');Object.assign(weekly.dataset,{weeklySet:set,weeklyNumber:number,weeklyCard:name});const listeners={},listenerOptions={};image.complete=cached;image.naturalWidth=cached?488:0;
 const add=stage.addEventListener.bind(stage);stage.addEventListener=(type,fn,options)=>{listenerOptions[type]=options;add(type,fn,options);};
 const media=matches=>{const m={matches,listeners:[],change(value){this.matches=value;this.listeners.forEach(fn=>fn());}};if(legacyMedia)m.addListener=fn=>m.listeners.push(fn);else m.addEventListener=(_t,fn)=>m.listeners.push(fn);return m;};
 const c={...d,Math,weekly,weeklyShell:shell,weeklyImage:image,initialQuery,finePointer:media(fine),reducedMotion:media(reduced),window:{innerWidth:1280,innerHeight:800,addEventListener(t,fn){(listeners[t]||=[]).push(fn);}}};
 if(!observer)c.IntersectionObserver=undefined;
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  /* One input system'),source.indexOf('  /* ========================================\n     END')),c);
 return {d,c,weekly,stage,shell,image,listeners,listenerOptions,state(state){listeners['manascout:statechange'].forEach(fn=>fn({detail:{state}}));},visible(value){d.observers[0]?.deliver(stage,value);}};
}
module.exports={mount};
