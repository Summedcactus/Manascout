const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('assets/js/app.js','utf8');
const guides=fs.readdirSync('card',{withFileTypes:true}).filter(e=>e.isDirectory());
const references=JSON.parse(fs.readFileSync('docs/phase1-reference-verification.json','utf8'));
const registry=new Set([...app.match(/const GUIDE_SLUGS = new Set\(\[([^]*?)\]\)/)[1].matchAll(/"([a-z0-9-]+)"/g)].map(m=>m[1]));
test('every permanent guide exposes one compact navigation, static reference and early comparison',()=>{
 assert.equal(guides.length,59);
 for(const g of guides){
  const s=fs.readFileSync(`card/${g.name}/index.html`,'utf8');
  assert.equal((s.match(/class="guide-jump-links"/g)||[]).length,1,g.name);
  assert.equal((s.match(/data-guide-static/g)||[]).length,1,g.name);
  assert.equal((s.match(/<img\b/g)||[]).length,1,g.name);
  assert.match(s,/class="printing-guide"/);assert.match(s,/guide-editorial.css/);
  const nav=s.match(/<nav class="guide-jump-links"[^]*?<\/nav>/)[0];
  assert.match(nav,/Sources/);assert.match(nav,/Printing shortlist/);assert.match(nav,/Live explorer/);
  const history=s.search(/<section[^>]+aria-labelledby="[^"]*-history-heading"/);
  assert.ok(s.indexOf('<table class="printings-table"')<history,g.name);
  assert.match(s,/guide-skip/);assert.match(s,/guide-image-error/);assert.match(s,/data-static-status/);
 }
});
test('new reference images retain the verified source identity and never use inferred image URLs',()=>{
 assert.equal(Object.keys(references.records).length,38);
 for(const [slug,r]of Object.entries(references.records)){
  assert.equal(r.verified,true,slug);assert.ok(r.image.startsWith('https://cards.scryfall.io/'));
  assert.ok(r.image.includes(r.id));
  const s=fs.readFileSync(`card/${slug}/index.html`,'utf8');
  assert.ok(s.includes(r.image.replace(/&/g,'&amp;')),slug);
  assert.ok(s.includes(r.source.replace(/&/g,'&amp;')),slug);
  assert.match(s,/<img[^>]+width="488" height="680"[^>]+fetchpriority="high"/);
 }
});
function links(finish='foil'){
 const c={GUIDE_SLUGS:registry,window:{location:{pathname:'/'}},URLSearchParams,
  slug:s=>s.toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-'),
  esc:s=>String(s).replace(/&/g,'&amp;'),selectedFinish:()=>finish};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('  function guideLink('),app.indexOf('  function marketplace(')),c);return c;
}
test('guide links carry the selected exact printing and finish without inventing unknown routes',()=>{
 for(const finish of ['foil','nonfoil','etched']){
  const c=links(finish),id='11111111-1111-4111-8111-111111111111';
  const href=c.guideLink({name:'Sol Ring',id}).match(/href="([^"]+)"/)[1].replace(/&amp;/g,'&');
  const url=new URL(href,'https://manascout.co.uk');assert.equal(url.pathname,'/card/sol-ring/');
  assert.equal(url.searchParams.get('printing'),id);assert.equal(url.searchParams.get('finish'),finish);
  assert.equal(c.guideLink({name:'No Editorial Guide',id}),'');
 }
});
test('copying a guide printing retains its finish while the permanent guide stays clean',()=>{
 const page=fs.readFileSync('assets/js/card-page.js','utf8'),id='11111111-1111-4111-8111-111111111111';
 for(const finish of ['foil','etched','nonfoil','invalid']){
  const c={URL,guideUrl:()=> 'https://manascout.co.uk/card/sol-ring/',parameters:()=>new URLSearchParams({finish})};vm.createContext(c);
  vm.runInContext(page.slice(page.indexOf('  function printingUrl('),page.indexOf('  function scrollToTarget(')),c);
  const url=new URL(c.printingUrl(id));assert.equal(url.searchParams.get('printing'),id);
  assert.equal(url.searchParams.get('finish'),finish==='invalid'?null:finish);
 }
});
for(const failure of ['request','identity','finish'])test(`exact-printing ${failure} failure cannot silently substitute another edition`,async()=>{
 let namedCalls=0,error='',kept='';
 const c={AbortController,generation:0,controller:null,ui:{},console:{error(){}},
  cancelActive(){},startUrl(name,id){kept=id;},clearSuggestions(){},announce(){},
  sameName:(a,b)=>a===b,cardId:async()=>{
   if(failure==='request')throw Error('Request failed');
   return {name:failure==='identity'?'Another card':'Sol Ring',id:'exact-id'};
  },namedCard:async()=>{namedCalls++;return {name:'Sol Ring',id:'substituted'};},
  chooseFinish:()=>false,errorState:message=>{error=message;}};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('  async function loadCard('),app.indexOf('  /* ========================================\n     AUTOCOMPLETE')),c);
 assert.equal(await c.loadCard('Sol Ring',{printingId:'exact-id',finish:failure==='finish'?'etched':''}),null);
 assert.equal(namedCalls,0);assert.equal(kept,'exact-id');assert.match(error,/exact link has been kept/);
});
test('guide overview follows the live selected identity, language and finish',()=>{
 const {dom}=require('./helpers/card-dom.cjs'),d=dom();
 d.document.querySelector=s=>d.document.body.querySelector(s);
 d.document.body.innerHTML='<figure data-guide-reference><a data-guide-reference-link href="https://scryfall.com/card/pcy/45"><img src="https://cards.scryfall.io/original.jpg"></a><figcaption data-guide-reference-label>Original reference</figcaption><p class="guide-image-error">Unavailable</p></figure>';
 const c={document:d.document,guideName:'Sol Ring',sameName:(a,b)=>a===b,safe:s=>s||'',img:c=>c.image_uris.normal,selectedFinish:()=> 'foil',finishLabel:()=> 'Foil',LANGS:{de:'German'}};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('  function updateGuideReference('),app.indexOf('  function renderCard(')),c);
 c.updateGuideReference({name:'Sol Ring',set:'cmd',collector_number:'269',artist:'Synthetic artist',lang:'de',image_uris:{normal:'https://cards.scryfall.io/selected.jpg'},scryfall_uri:'https://scryfall.com/card/cmd/269/de'});
 assert.match(d.document.body.textContent,/Selected printing · CMD #269 · Synthetic artist · German · Foil/);
 assert.equal(d.document.body.querySelector('img').src,'https://cards.scryfall.io/selected.jpg');
 assert.equal(d.document.body.querySelector('a').href,'https://scryfall.com/card/cmd/269/de');
 c.updateGuideReference({name:'Sol Ring',set:'cmd',collector_number:'270',lang:'de',image_uris:{normal:''},scryfall_uri:'https://scryfall.com/card/cmd/270/de'});
 assert.equal(d.document.body.querySelector('img').hidden,true);
 assert.equal(d.document.body.querySelector('.guide-image-error').hidden,false);
 assert.match(d.document.body.textContent,/CMD #270/);
});
