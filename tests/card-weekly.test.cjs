const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {dom}=require('./helpers/card-dom.cjs');
const source=fs.readFileSync('assets/js/scoutboard.js','utf8');
function mount({fine=true,reduced=false,set='ltc',number='390',name='Cabal Coffers',initialQuery=''}={}){
 const d=dom(),weekly=new d.Element('article'),shell=new d.Element('div'),image=new d.Element('img');d.document.body.append(weekly);weekly.append(shell);shell.append(image);weekly.dataset={weeklySet:set,weeklyNumber:number,weeklyCard:name};const listeners={};
 const media=matches=>({matches,listeners:[],addEventListener(_t,fn){this.listeners.push(fn);},change(value){this.matches=value;this.listeners.forEach(fn=>fn());}});
 const c={...d,Math,weekly,weeklyShell:shell,weeklyImage:image,initialQuery,finePointer:media(fine),reducedMotion:media(reduced),window:{addEventListener(t,fn){(listeners[t]||=[]).push(fn);}}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  /* Event-driven tilt'),source.indexOf('  /* ========================================\n     END')),c);
 return {d,c,weekly,shell,image,state(state){listeners['manascout:statechange'].forEach(fn=>fn({detail:{state}}));},visible(value){d.observers[0]?.deliver(weekly,value);}};
}
test('weekly tilt/perspective variables remain active and drive restrained reflection intensity',async()=>{
 const s=mount();assert.equal(s.weekly.dataset.weeklyEffectsPaused,'true');s.visible(true);await s.shell.emit('pointermove',{clientX:90,clientY:105});assert.equal(s.weekly.style['--weekly-x'],'30%');assert.equal(s.weekly.style['--weekly-ry'],'-1deg');assert.equal(s.weekly.style['--weekly-rx'],'1.125deg');assert.equal(s.weekly.style['--morgul-reflection'],'0.320');
 await s.shell.emit('pointermove',{clientX:300,clientY:420});assert.ok(Number(s.weekly.style['--morgul-reflection'])>=.2);assert.ok(Number(s.weekly.style['--morgul-reflection'])<.32);await s.shell.emit('pointerleave');assert.equal(s.weekly.style['--weekly-ry'],'0deg');assert.equal(s.weekly.style['--morgul-reflection'],'.26');
});
test('offscreen, search states and background tabs pause the weekly atmosphere and reset tilt',async()=>{
 const s=mount();s.visible(true);assert.equal(s.weekly.dataset.weeklyEffectsPaused,'false');await s.shell.emit('pointermove',{clientX:10,clientY:20});s.visible(false);assert.equal(s.weekly.dataset.weeklyEffectsPaused,'true');assert.equal(s.weekly.style['--weekly-rx'],'0deg');s.visible(true);s.state('loading');assert.equal(s.weekly.dataset.weeklyEffectsPaused,'true');s.state('card');assert.equal(s.weekly.dataset.weeklyEffectsPaused,'true');s.state('home');assert.equal(s.weekly.dataset.weeklyEffectsPaused,'false');s.d.document.hidden=true;for(const fn of s.d.document.listeners.visibilitychange)fn();assert.equal(s.weekly.dataset.weeklyEffectsPaused,'true');
});
test('reduced-motion changes and coarse pointers stop tilt while leaving the card intact',async()=>{
 const s=mount();s.visible(true);s.c.reducedMotion.change(true);assert.equal(s.weekly.dataset.weeklyEffectsPaused,'true');await s.shell.emit('pointermove',{clientX:200,clientY:300});assert.equal(s.weekly.style['--weekly-ry'],'0deg');s.c.reducedMotion.change(false);assert.equal(s.weekly.dataset.weeklyEffectsPaused,'false');s.c.finePointer.change(false);await s.shell.emit('pointermove',{clientX:200,clientY:300});assert.equal(s.weekly.style['--weekly-ry'],'0deg');assert.equal(s.image.isConnected,true);
});
test('image load/error visibility and initial search state never show foil over missing art',async()=>{
 const s=mount({initialQuery:'Fixture'});s.visible(true);assert.equal(s.weekly.dataset.weeklyEffectsPaused,'true');await s.d.loaded(s.image);assert.equal(s.weekly.dataset.weeklyArtReady,'true');await s.image.emit('error');assert.equal(s.weekly.dataset.weeklyArtReady,'false');
});
test('future weekly printings retain tilt but never get Minas Morgul reflection updates',async()=>{
 for(const extra of [{set:'other'},{number:'390z'},{name:'Other Card'}]){const s=mount(extra);s.visible(true);await s.shell.emit('pointermove',{clientX:120,clientY:180});assert.equal(s.weekly.style['--weekly-x'],'40%');assert.equal(s.weekly.style['--morgul-reflection'],undefined);}
});
test('weekly exact printing lookup retains LTC 390, Sean Vo and surge-foil identity',async()=>{
 const d=dom(),weekly=new d.Element('article');weekly.dataset={weeklySet:'ltc',weeklyNumber:'390'};const weeklyImage=new d.Element('img');weeklyImage.src='static-original';const weeklyPrinting=new d.Element('p'),weeklyLink=new d.Element('a'),calls=[];
 const good={id:'cce035f4-5ba4-4e9d-ab26-d5d0290de74d',name:'Cabal Coffers',set:'ltc',collector_number:'390',artist:'Sean Vo',finishes:['foil'],promo_types:['surgefoil'],set_name:'The Lord of the Rings: Tales of Middle-earth Commander',image_uris:{normal:'https://cards.scryfall.io/normal/front/c/c/cce035f4-5ba4-4e9d-ab26-d5d0290de74d.jpg'}};
 const c={console:{warn(){}},URLSearchParams,API:'https://api.scryfall.com',weekly,weeklyImage,weeklyPrinting,weeklyLink,norm:s=>String(s).toLowerCase(),cardImage:c=>c.image_uris.normal,guideSlug:s=>s,getJson:async url=>{calls.push(url);return c.response;},response:good};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function linkToCard('),source.indexOf('  /* ========================================\n     SCRYFALL NETWORK')),c);vm.runInContext(source.slice(source.indexOf('  async function loadWeekly()'),source.indexOf('  void loadWeekly();')),c);
 await c.loadWeekly();assert.equal(calls[0],'https://api.scryfall.com/cards/ltc/390');assert.equal(weeklyImage.src,good.image_uris.normal);assert.match(weeklyLink.href,/printing=cce035f4/);assert.match(weeklyLink.href,/finish=foil/);
 for(const extra of [{collector_number:'390z'},{artist:'Other Artist'},{name:'Other Card'},{finishes:['nonfoil']},{promo_types:[]}]){weeklyImage.src='static-original';c.response={...good,...extra};await c.loadWeekly();assert.equal(weeklyImage.src,'static-original');}
 c.getJson=async()=>{throw Error('unavailable');};await c.loadWeekly();assert.equal(weeklyImage.src,'static-original');
});
