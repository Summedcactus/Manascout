const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {dom}=require('./helpers/card-dom.cjs');
const source=fs.readFileSync('assets/js/app.js','utf8');
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const image=(side,printing=id)=>`https://cards.scryfall.io/normal/${side}/1/1/${printing}.jpg?fixture=1`;
const raw=(extra={})=>({id,name:'Synthetic front // Synthetic back',set_name:'Test Set',collector_number:'1',layout:'transform',finishes:['nonfoil','foil'],card_faces:[{name:'Synthetic front',image_uris:{normal:image('front')}},{name:'Synthetic back',image_uris:{normal:image('back')}}],...extra});
function mount(card=raw()){
 const d=dom(),details=new d.Element('div');d.document.body.append(details);const listeners={},urlChanges=[];
 const c={...d,presentation:require("../assets/js/printing-presentation.js"),showingExactResults:false,guideName:"",console,URL,URLSearchParams,AbortController,previews:new Map(),ui:{details,printings:null},currentCard:card,currentPick:false,archive:null,
 esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),pretty:s=>s||'',has:(c,f)=>c.finishes?.includes(f),img:c=>c.image_uris?.normal||c.card_faces?.[0]?.image_uris?.normal||'',stat:(k,v)=>`<div>${k}: ${v}</div>`,
 window:{matchMedia:()=>({matches:false})},showAction:text=>c.action=text,replaceUrl:card=>urlChanges.push([card.id,c.selectedFinish(card)])};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  const finishes ='),source.indexOf('  /* ========================================\n     CARD DETAILS')),c);
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
test('finish selection preserves the exact printing and applies only the chosen finish', async t => {
  const s = mount(); t.after(s.cleanup);
  const surfaces = () => s.details.querySelectorAll('[data-ms-physical]').map(card => card.dataset.surface);
  assert.deepEqual(surfaces(), ['nonfoil', 'nonfoil']);
  const select = s.details.querySelector('[data-ms-selected-finish]');
  select.value = 'foil';
  await select.emit('change');
  assert.deepEqual(surfaces(), ['foil', 'foil']);
  assert.equal(s.c.currentCard.id, id);
  assert.equal(s.d.document.activeElement, s.details.querySelector('[data-ms-selected-finish]'));
  assert.deepEqual(s.urlChanges, [[id, 'foil']]);
});

test('unsupported finish requests do not change the printing or URL', t => {
  const s = mount(raw({finishes: ['nonfoil']})); t.after(s.cleanup);
  s.c.updateSelectedFinish('foil');
  assert.equal(s.c.selectedFinish(s.c.currentCard), 'nonfoil');
  assert.deepEqual(s.urlChanges, []);
});
