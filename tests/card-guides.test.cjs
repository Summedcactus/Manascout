/* Editorial facts cross-checked against the cited catalogues on 4 November 2026.
 * HTTP/render fixtures below are synthetic; they do not claim a live Scryfall audit. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const guides=[
 {name:'Captain Jean-Luc Picard',slug:'captain-jean-luc-picard',key:'picard',first:'7',records:[['7','Anna Pavleeva','Nonfoil, traditional foil'],['363','Erikas Perl','Nonfoil, traditional foil'],['497','Erikas Perl','Surge foil only'],['1701D','Irvin Rodriguez','Foil only']]},
 {name:'Mr. Spock, Science Officer',slug:'mr-spock-science-officer',key:'spock',first:'74',records:[['74','Colin Boyer','Nonfoil, traditional foil'],['353','Mark Spears','Nonfoil, traditional foil'],['411','Grant Griffin','Nonfoil, traditional foil'],['535','Grant Griffin','Surge foil only'],['1702','Gal Or','Foil only']]}
];
const read=p=>fs.readFileSync(p,'utf8');const plain=s=>s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const app=read('assets/js/app.js'),directory=read('card/index.html');
const graph=html=>JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
const registry=new Set([...app.match(/const GUIDE_SLUGS = new Set\(\[([^]*?)\]\)/)[1].matchAll(/"([a-z0-9-]+)"/g)].map(x=>x[1]));
const catalogue=()=>fs.readdirSync('card',{withFileTypes:true}).filter(f=>f.isDirectory()&&fs.existsSync(`card/${f.name}/index.html`)&&/data-card-name=/.test(read(`card/${f.name}/index.html`))).map(f=>f.name);
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const slug=s=>s.toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
for(const g of guides){
 const html=read(`card/${g.slug}/index.html`),url=`https://manascout.co.uk/card/${g.slug}/`;
 test(`${g.name}: unique printing-intent metadata and Article/WebPage/Breadcrumb identity agree`,()=>{
  assert.ok(html.includes(`data-card-name="${g.name}"`));const title=plain(html.match(/<title>([^]*?)<\/title>/)[1]);assert.match(title,/Printings.*Foils.*ManaScout/);const description=html.match(/<meta name="description" content="([^"]+)"/)[1];assert.ok(description.includes(`TRK #${g.first}`));assert.ok(html.includes(`<link rel="canonical" href="${url}">`));const ld=graph(html)['@graph'];assert.equal(ld.find(x=>x['@type']==='WebPage').url,url);const article=ld.find(x=>x['@type']==='Article');assert.equal(article.description,description);assert.equal(article.dateModified,'2026-11-04');assert.equal(article.about.name,g.name);assert.ok(article.citation.includes('https://magic.wizards.com/en/news/feature/collecting-star-trek'));assert.equal(ld.find(x=>x['@type']==='BreadcrumbList').itemListElement.at(-1).item,url);assert.doesNotMatch(JSON.stringify(ld),/"(?:Offer|Product|AggregateRating|price|ratingValue)"/);assert.match(html,/scheduled for global tabletop release on 13 November 2026/);assert.match(html,/not yet Commander-legal/);
 });
 test(`${g.name}: shortlist has every verified number/artist/finish and makes no invented edition rows`,()=>{
  const rows=[...html.match(/<tbody>([^]*?)<\/tbody>/)[1].matchAll(/<tr>([^]*?)<\/tr>/g)].map(x=>x[1]);assert.equal(rows.length,g.records.length);
  for(const [i,[number,artist,finish]]of g.records.entries()){assert.ok(rows[i].includes(`https://scryfall.com/card/trk/${number}`));assert.ok(plain(rows[i]).includes(`TRK #${number}`));assert.ok(plain(rows[i]).includes(artist));assert.ok(plain(rows[i]).includes(finish));}
  for(const section of ['quick','rules','history','shortlist','art','foil','choice','pick','printings','related','sources'])assert.ok(html.includes(`id="${g.key}-${section}-heading"`));assert.doesNotMatch(html,/serialized (?:Picard|Spock)|etched foil only|textured foil only/i);
 });
 test(`${g.name}: existing guide links and exact-printing Deck Studio handoff work from home/search/guide contexts`,()=>{
  const guideLink=app.slice(app.indexOf('  function guideLink('),app.indexOf('  function marketplace('));
  for(const pathname of ['/','/?q='+encodeURIComponent(g.name),`/card/${g.slug}/`]){const card={id:'11111111-1111-4111-8111-111111111111',name:g.name};const c={GUIDE_SLUGS:registry,window:{location:{pathname}},URLSearchParams,slug,esc,selectedFinish:()=> 'foil'};vm.createContext(c);vm.runInContext(guideLink,c);const link=c.guideLink(card);if(pathname.startsWith('/card/'))assert.equal(link,'');else assert.ok(link.includes(`/card/${g.slug}/`));const href=c.deckLink(card).match(/href="([^"]+)"/)[1].replace(/&amp;/g,'&');const url=new URL(href,'https://manascout.co.uk');assert.equal(url.pathname,'/deck/');assert.equal(url.searchParams.get('printing'),card.id);assert.equal(url.searchParams.get('card'),g.name);assert.equal(url.searchParams.get('finish'),'foil');assert.equal(url.searchParams.get('guide'),`/card/${g.slug}/`);}
 });
 test(`${g.name}: shared loader uses exact name, existing containers and safe catalogue fallback links`,async()=>{
  assert.ok(html.includes('/assets/js/app.js?v=expansion1'));assert.ok(html.includes('/assets/js/card-page.js'));assert.equal((html.match(/id="card-details"/g)||[]).length,1);assert.equal((html.match(/id="printings-container"/g)||[]).length,1);assert.doesNotMatch(html,/data-ms-flip|data-ms-nonfoil|ms-foil-glint|<img[^>]+src=/);assert.match(html,/<noscript>[^]*?live printing explorer needs JavaScript/);const calls=[],ctx={API:'https://api.scryfall.com',encodeURIComponent,readJson:async u=>{calls.push(u);return{name:g.name};}};vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('  async function namedCard('),app.indexOf('  async function cardId(')),ctx);assert.equal((await ctx.namedCard(g.name)).name,g.name);assert.equal(new URL(calls[0]).searchParams.get('exact'),g.name);assert.equal(calls.length,1);
 });
}
test('directory metadata, visible counts, ItemList, registry and actual permanent guide count stay consistent',()=>{
 const actual=catalogue();assert.equal(actual.length,50);assert.equal(registry.size,actual.length);assert.deepEqual([...registry].sort(),actual.sort());const list=graph(directory)['@graph'].find(x=>x['@type']==='ItemList');assert.equal(list.numberOfItems,actual.length);assert.equal(list.itemListElement.length,actual.length);assert.deepEqual(list.itemListElement.map(x=>x.position),Array.from({length:actual.length},(_,i)=>i+1));assert.equal(new Set(list.itemListElement.map(x=>x.url)).size,50);assert.equal((directory.match(/class="hub-guide"/g)||[]).length,50);assert.match(directory,/Showing all 50 ManaScout card guides/);assert.match(directory,/<strong>50<\/strong> card guides/);assert.doesNotMatch(directory,/\b38 (?:Magic|ManaScout|card|guides)/);assert.match(read('deck/index.html'),/Explore 50 card guides/);
 const group=directory.slice(directory.indexOf('id="showcase-releases"'),directory.indexOf('id="hub-empty"'));for(const g of guides){assert.ok(group.includes(`/card/${g.slug}/`));assert.ok(list.itemListElement.some(x=>x.url.endsWith(`/card/${g.slug}/`)&&x.name===g.name));}
});
test('sitemap preserves existing entries and contains both new canonical URLs exactly once',()=>{
 const urls=[...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);assert.equal(new Set(urls).size,urls.length);for(const g of guides)assert.equal(urls.filter(x=>x===`https://manascout.co.uk/card/${g.slug}/`).length,1);for(const x of ['https://manascout.co.uk/','https://manascout.co.uk/card/','https://manascout.co.uk/deck/'])assert.ok(urls.includes(x));for(const slug of catalogue())assert.ok(urls.includes(`https://manascout.co.uk/card/${slug}/`));
});
test('both guides have contextual reciprocal, crossover, directory and optional Deck Studio links',()=>{
 for(const g of guides){const html=read(`card/${g.slug}/index.html`),other=guides.find(x=>x!==g);for(const path of [`/card/${other.slug}/`,'/card/the-one-ring/','/card/smaug-wicked-worm/','/card/','/deck/'])assert.ok(html.includes(`href="${path}"`));}
 assert.notEqual(graph(read(`card/${guides[0].slug}/index.html`))['@graph'][0].description,graph(read(`card/${guides[1].slug}/index.html`))['@graph'][0].description);
});
test('new responsive CSS is narrowly scoped and keeps long names and wide tables within the page',()=>{
 const css=read('assets/css/guide-editorial.css').replace(/\/\*[^]*?\*\//g,'');assert.match(css,/\.printing-guide \.hero h1[^}]*overflow-wrap: anywhere/);assert.match(css,/\.printing-guide \.table-wrap \{ max-width: 100%;/);assert.match(read('assets/css/style.css'),/\.table-wrap \{\s*overflow-x: auto/);assert.match(css,/\.guide-jump-links[^}]*flex-wrap: wrap/);assert.match(css,/:focus-visible/);assert.match(css,/@media \(max-width: 600px\)/);
 function check(text){let i=0;while(text.slice(i).trim()){const open=text.indexOf('{',i),head=text.slice(i,open).trim();assert.ok(open>=i);let n=1,j=open+1;for(;j<text.length&&n;j++)n+=(text[j]==='{')-(text[j]==='}');assert.equal(n,0);const body=text.slice(open+1,j-1);if(head.startsWith('@media'))check(body);else{assert.ok(head.startsWith('.printing-guide'));for(const d of body.split(';').filter(x=>x.trim()))assert.match(d,/^\s*[a-z-]+\s*:/);}i=j;}}check(css);
});
test('both guide search headers retain toggle, submit, Escape and focus behaviour',async()=>{
 const {dom}=require('./helpers/card-dom.cjs');
 for(const g of guides){const d=dom();const make=(tag,id)=>{const x=new d.Element(tag);x.setAttribute('id',id);d.document.body.append(x);return x;};const toggle=make('button','guide-search-toggle'),panel=make('div','guide-search-panel'),form=make('form','guide-search-form'),input=make('input','guide-card-search');panel.hidden=true;const window={setTimeout:fn=>fn(),location:{href:''}};const c={document:d.document,window,encodeURIComponent};vm.createContext(c);const code=[...read(`card/${g.slug}/index.html`).matchAll(/<script>([^]*?)<\/script>/g)].at(-1)[1];vm.runInContext(code,c);await toggle.emit('click');assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(d.document.activeElement,input);input.value=g.name;await form.emit('submit');assert.equal(window.location.href,'/?q='+encodeURIComponent(g.name));for(const fn of d.document.listeners.keydown)fn({key:'Escape'});assert.equal(panel.hidden,true);assert.equal(d.document.activeElement,toggle);}
});
