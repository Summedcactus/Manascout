const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {dom}=require('./helpers/card-dom.cjs');
const source=fs.readFileSync('assets/js/app.js','utf8');
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const image=(side,printing=id)=>`https://cards.scryfall.io/normal/${side}/1/1/${printing}.jpg?fixture=1`;
const raw=(extra={})=>({id,name:'Synthetic front // Synthetic back',set_name:'Test Set',collector_number:'1',layout:'transform',finishes:['nonfoil','foil'],card_faces:[{name:'Synthetic front',image_uris:{normal:image('front')}},{name:'Synthetic back',image_uris:{normal:image('back')}}],...extra});
function mount(card=raw()){
 const d=dom(),details=new d.Element('div');d.document.body.append(details);const listeners={},urlChanges=[];
 const c={...d,console,URL,URLSearchParams,AbortController,previews:new Map(),ui:{details,printings:null},currentCard:card,currentPick:false,archive:null,
 esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),pretty:s=>s||'',has:(c,f)=>c.finishes?.includes(f),img:c=>c.image_uris?.normal||c.card_faces?.[0]?.image_uris?.normal||'',stat:(k,v)=>`<div>${k}: ${v}</div>`,
 window:{matchMedia:()=>({matches:false})},showAction:text=>c.action=text,replaceUrl:card=>urlChanges.push([card.id,c.selectedFinish(card)])};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function finishes('),source.indexOf('  /* ========================================\n     CARD DETAILS')),c);
 c.renderCard=card=>{c.disposePreview();c.currentCard=card;details.innerHTML=c.previewImage(card)+c.finishSelector(card);c.activatePreview(card);};
 const events=source.slice(source.indexOf('  function updateSelectedFinish('),source.indexOf('      const copy =',source.indexOf('  function updateSelectedFinish(')));
 vm.runInContext(events+'\n    });',c);c.renderCard(card);
 return {c,d,details,urlChanges,async ready(){for(const img of details.querySelectorAll('.ms-card-face img'))await d.loaded(img);await new Promise(r=>setImmediate(r));},cleanup(){c.disposePreview();},listeners};
}
for(const layout of ['transform','modal_dfc','reversible_card','double_faced_token'])test(`${layout}: exactly two matching Scryfall face images expose a compact flip`,t=>{
 const s=mount(raw({layout}));t.after(s.cleanup);assert.equal(s.c.reversibleFaces(s.c.currentCard).length,2);const b=s.details.querySelector('[data-ms-flip]');assert.ok(b);assert.equal(b.disabled,true);assert.equal(b.getAttribute('aria-pressed'),'false');assert.match(b.getAttribute('aria-label'),/back: Synthetic back/);
});
for(const layout of ['normal','split','adventure','flip','meld','art_series','planar'])test(`${layout}: never gets a floating flip even if malformed face images are present`,t=>{
 const s=mount(raw({layout}));t.after(s.cleanup);assert.equal(s.c.reversibleFaces(s.c.currentCard).length,0);assert.equal(s.details.querySelector('[data-ms-flip]'),null);
});
test('missing, extra, same-side, foreign-printing and untrusted face pairs never flip',t=>{
 const cases=[{card_faces:[]},{card_faces:raw().card_faces.slice(0,1)},{card_faces:[...raw().card_faces,raw().card_faces[0]]},{card_faces:[raw().card_faces[0],{image_uris:{normal:image('front')}}]},{card_faces:[raw().card_faces[0],{image_uris:{normal:image('back',other)}}]},{card_faces:[raw().card_faces[0],{image_uris:{normal:'https://evil.example/back.jpg'}}]}];
 for(const extra of cases){const s=mount(raw(extra));t.after(s.cleanup);assert.equal(s.details.querySelector('[data-ms-flip]'),null);}
});
test('preloaded flip and reverse preserve printing, finish, DOM, URL and keyboard focus',async t=>{
 const card=raw(),s=mount(card);t.after(s.cleanup);await s.ready();const b=s.details.querySelector('[data-ms-flip]'),host=s.details.querySelector('.ms-card-image'),images=s.details.querySelectorAll('img');b.focus();assert.equal(b.disabled,false);
 const finish=s.c.selectedFinish(card);await b.emit('click');assert.equal(host.querySelector('.ms-face-turner').dataset.msFace,'back');assert.equal(b.getAttribute('aria-pressed'),'true');assert.match(b.getAttribute('aria-label'),/front/);assert.equal(s.c.currentCard,card);assert.equal(s.c.selectedFinish(card),finish);assert.equal(s.d.document.activeElement,b);
 await b.emit('click');assert.equal(host.querySelector('.ms-face-turner').dataset.msFace,'front');assert.equal(b.getAttribute('aria-pressed'),'false');assert.deepEqual(s.details.querySelectorAll('img'),images);assert.equal(s.urlChanges.length,0);
});
test('both faces must load and decode before a flip can change the surface',async t=>{
 const s=mount();t.after(s.cleanup);const b=s.details.querySelector('[data-ms-flip]'),images=s.details.querySelectorAll('img');await s.d.loaded(images[0]);await new Promise(r=>setImmediate(r));assert.equal(b.disabled,true);await b.emit('click');assert.equal(s.details.querySelector('.ms-face-turner').dataset.msFace,'front');await s.d.loaded(images[1]);await new Promise(r=>setImmediate(r));assert.equal(b.disabled,false);
});
test('failed, missing or undecodable backs preserve the front with no active flip',async t=>{
 for(const mode of ['error','timeout','decode']){const s=mount();t.after(s.cleanup);const images=s.details.querySelectorAll('img');await s.d.loaded(images[0]);if(mode==='error')await images[1].emit('error');if(mode==='timeout')s.d.timeouts();if(mode==='decode'){images[1].failDecode=true;await s.d.loaded(images[1]);}await new Promise(r=>setImmediate(r));assert.equal(s.details.querySelector('[data-ms-flip]').disabled,true);assert.equal(s.details.querySelector('.ms-face-turner').dataset.msFace,'front');assert.match(s.details.querySelector('.ms-face-status').textContent,/Both face images/);}
});
test('late old-printing loads and stale flip buttons cannot change the next selection',async t=>{
 const s=mount();t.after(s.cleanup);const oldButton=s.details.querySelector('[data-ms-flip]'),oldImages=s.details.querySelectorAll('img');const next=raw({id:other,card_faces:[{image_uris:{normal:image('front',other)}},{image_uris:{normal:image('back',other)}}]});s.c.renderCard(next);for(const img of oldImages)await s.d.loaded(img);await s.ready();s.c.flipPreview(oldButton);assert.equal(s.details.querySelector('.ms-face-turner').dataset.msFace,'front');assert.equal(s.c.currentCard.id,other);assert.equal(oldButton.isConnected,false);
});
for(const finishes of [['nonfoil'],['foil'],['etched'],['foil','etched'],['nonfoil','foil'],['nonfoil','etched'],[]])test(`${finishes.join('/')||'missing'}: foil control and shimmer use supplied finishes only`,t=>{
 const s=mount(raw({finishes,layout:'normal',image_uris:{normal:image('front')}}));t.after(s.cleanup);const on=finishes.some(f=>['foil','etched'].includes(f));assert.equal(!!s.details.querySelector('[data-ms-nonfoil]'),on&&finishes.includes('nonfoil'));assert.equal(!!s.details.querySelector('.ms-foil-glint'),on);assert.equal(s.c.foilControl(s.c.currentCard,true),'');assert.doesNotMatch(s.c.previewImage(s.c.currentCard,true),/data-ms-flip|data-ms-nonfoil|ms-foil-glint/);
});
test('red-X chooses real nonfoil, preserves printing ID, and finish select restores foil',async t=>{
 const s=mount();t.after(s.cleanup);await s.ready();await s.details.querySelector('[data-ms-nonfoil]').emit('click');assert.equal(s.c.currentCard.id,id);assert.equal(s.c.selectedFinish(s.c.currentCard),'nonfoil');assert.equal(s.details.querySelector('[data-ms-nonfoil]'),null);assert.equal(s.details.querySelector('.ms-foil-glint'),null);assert.equal(s.d.document.activeElement,s.details.querySelector('[data-ms-selected-finish]'));
 const select=s.details.querySelector('[data-ms-selected-finish]');select.value='foil';await select.emit('change');assert.equal(s.c.selectedFinish(s.c.currentCard),'foil');assert.ok(s.details.querySelector('[data-ms-nonfoil]'));assert.deepEqual(s.urlChanges,[[id,'nonfoil'],[id,'foil']]);
});
test('unsupported finish requests cannot fabricate a foil or change a nonfoil-only printing',t=>{
 const s=mount(raw({finishes:['nonfoil']}));t.after(s.cleanup);s.c.updateSelectedFinish('foil');assert.equal(s.c.selectedFinish(s.c.currentCard),'nonfoil');assert.equal(s.urlChanges.length,0);assert.equal(s.details.querySelector('[data-ms-selected-finish]'),null);
});
test('decorative sheen waits for art and pauses offscreen/in a hidden document',async t=>{
 const s=mount();t.after(s.cleanup);const host=s.details.querySelector('.ms-preview');assert.equal(host.dataset.msImageReady,'false');assert.equal(host.dataset.msEffectsPaused,'true');await s.ready();assert.equal(host.dataset.msImageReady,'true');const observer=s.d.observers[0];observer.deliver(host,true);assert.equal(host.dataset.msEffectsPaused,'false');observer.deliver(host,false);assert.equal(host.dataset.msEffectsPaused,'true');s.d.document.hidden=true;for(const fn of s.d.document.listeners.visibilitychange)fn();assert.equal(s.d.document.body.dataset.msEffectsPaused,'true');
});
test('printing table rows have no repeated foil buttons and only selected foil thumbnails shimmer',()=>{
 const row=source.slice(source.indexOf('  function row('),source.indexOf('  /* ========================================\n     PRINTING ARCHIVE'));
 assert.doesNotMatch(row,/foilControl|data-ms-nonfoil|data-ms-flip/);assert.match(row,/chosen && shimmer\(card\)/);
 const deck=fs.readFileSync('deck/index.html','utf8');assert.doesNotMatch(deck,/data-ms-flip|data-ms-nonfoil/);
});
