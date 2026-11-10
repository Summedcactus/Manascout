/* Dated catalogue facts are independent fixtures. These checks do not claim live API or browser verification. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8'),ledger=JSON.parse(read('docs/card-guide-research-seo-ctr.json')),host='https://manascout.co.uk',day='2026-11-10';
const plain=s=>s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/\s+/g,' ').trim();
const graph=s=>JSON.parse(s.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1])['@graph'];
const slugs=[...Object.keys(ledger.new_guides),...Object.keys(ledger.upgrades)];
const originals={brainstorm:['ICE','61','1995-06-03','common','Christopher Rush','Nonfoil only'],thoughtseize:['LRW','145','2007-10-12','rare','Aleksi Briclot','Nonfoil, traditional foil'],'mystical-tutor':['MIR','80','1996-10-08','uncommon','David O’Connor','Nonfoil only'],'dark-ritual':['LEA','98','1993-08-05','common','Sandra Everingham','Nonfoil only']};
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='.git'?[]:e.isDirectory()?files(dir+'/'+e.name):[dir+'/'+e.name]);}
const production=files('.').filter(p=>!p.startsWith('./tests/')&&!p.startsWith('./docs/'));
test('ads.txt is exactly the authorised UTF-8 publisher record with one LF and no BOM',()=>{
 const bytes=fs.readFileSync('ads.txt');assert.deepEqual(bytes,Buffer.from('google.com, pub-2249291081711812, DIRECT, f08c47fec0942fa0\n','utf8'));assert.equal(bytes.toString('utf8').split('\n').length,2);assert.equal(ledger.adsense.ads_txt,bytes.toString().trim());
});
test('entire production tree has one consistent AdSense identity and all current meta tags remain',()=>{
 const ids=new Set();for(const path of production)for(const match of read(path).matchAll(/(?:ca-)?pub-\d+/g))ids.add(match[0].replace(/^ca-/,''));assert.deepEqual([...ids],['pub-2249291081711812']);
 const pages=production.filter(p=>p.endsWith('.html')&&read(p).includes('name="google-adsense-account"'));assert.equal(pages.length,53);for(const path of pages){const metas=[...read(path).matchAll(/<meta\b[^>]*name="google-adsense-account"[^>]*content="([^"]+)"/g)];assert.equal(metas.length,1,path);assert.equal(metas[0][1],'ca-pub-2249291081711812',path);}assert.equal(ledger.adsense.baseline_meta_pages,49);assert.deepEqual(ledger.adsense.conflicts,[]);
});
test('root ads.txt is the sole authorised inventory file and robots allows its route',()=>{
 assert.deepEqual(files('.').filter(p=>/(?:^|\/)(?:app-)?ads\.txt$/.test(p)),['./ads.txt']);const robots=read('robots.txt');assert.match(robots,/User-agent: \*\s+Allow: \//);assert.doesNotMatch(robots,/Disallow:\s*(?:\/\s*$|\/ads\.txt)/m);assert.match(robots,/Sitemap: https:\/\/manascout.co.uk\/sitemap.xml/);
});
test('no ad units or advertising scripts were added to the eight guides',()=>{for(const slug of slugs){const html=read(`card/${slug}/index.html`);assert.match(html,/name="google-adsense-account" content="ca-pub-2249291081711812"/);assert.doesNotMatch(html,/adsbygoogle|pagead2|googlesyndication|<ins\b/i);}});
for(const slug of slugs){
 const html=read(`card/${slug}/index.html`),c=ledger.new_guides[slug]||ledger.upgrades[slug],url=host+'/card/'+slug+'/',ld=graph(html);
 test(`${c.name}: search-intent title, social snippets, canonical and linked graph agree`,()=>{
  const title=plain(html.match(/<title>([^]*?)<\/title>/)[1]);assert.equal(title,c.title);assert.match(title,/Printings|First Printing/);assert.ok(title.length<85);const description=html.match(/name="description" content="([^"]+)"/)[1];assert.equal(plain(description),c.description);assert.ok(c.description.length>=110&&c.description.length<=180);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);assert.ok(html.includes(`rel="canonical" href="${url}"`));assert.ok(html.includes(`property="og:url" content="${url}"`));assert.ok(html.includes(`property="og:title" content="${c.title.replace(/&/g,'&amp;')}"`));assert.doesNotMatch(html,/noindex/i);
  const page=ld.find(n=>n['@type']==='WebPage'),article=ld.find(n=>n['@type']==='Article');assert.equal(page.url,url);assert.equal(article.description,c.description);assert.equal(article.dateModified,day);assert.equal(page.mainEntity['@id'],article['@id']);assert.equal(article.mainEntityOfPage['@id'],page['@id']);assert.equal(ld.find(n=>n['@type']==='BreadcrumbList').itemListElement.at(-1).item,url);assert.doesNotMatch(JSON.stringify(ld),/"(?:Offer|AggregateRating|price|ratingValue)"/);
 });
 test(`${c.name}: first-printing answer precedes deeper history and the live explorer`,()=>{
  const intro=html.match(/<h1\b[^>]*>[^]*?<\/h1>\s*<p[^>]*>([^]*?)<\/p>/)[1];assert.match(plain(intro),/first|original|debut/i);assert.match(plain(intro),/1993|1995|1996|2000|2007|2019|2023/);assert.match(plain(intro),/artwork|illustrat|art /i);assert.ok(plain(intro).split(/\s+/).length<120);assert.ok(html.indexOf('QUICK ANSWER')<html.indexOf('class="results"'));assert.ok(html.indexOf('QUICK ANSWER')<html.indexOf('id="printings-container"'));assert.equal((html.match(/<h1\b/g)||[]).length,1);
 });
 test(`${c.name}: one exact static image, useful alt, failure path and shared explorer remain`,()=>{
  const imgs=[...html.matchAll(/<img\b[^>]*>/g)];assert.equal(imgs.length,1);assert.ok(imgs[0][0].includes(`src="${c.image}"`));assert.match(imgs[0][0],/alt="[^"—]+ — [A-Z0-9]+ #[^",]+, illustrated by [^"]+"/);assert.match(imgs[0][0],/width="488" height="680"/);assert.match(html,/guide-image-error/);assert.ok(html.includes(`property="og:image" content="${c.image}"`));assert.ok(html.includes(`name="twitter:image" content="${c.image}"`));
  for(const id of ['card-details','printings-status','printings-container'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);assert.ok(html.indexOf('/assets/js/app.js?v=seo-ctr1')<html.indexOf('/assets/js/card-page.js'));assert.match(html,/(?:animation|shimmer) is illustrative/);assert.match(html,/<noscript\b/);assert.match(html,/scryfall.com\/card\//);assert.match(html,/Cardmarket/);
 });
 test(`${c.name}: exact catalogue sources and contextual internal destinations exist`,()=>{
  const article=ld.find(n=>n['@type']==='Article');for(const source of c.sources){assert.ok(article.citation.includes(source),source);assert.ok(html.includes(`href="${source}"`),source);}assert.ok(html.includes('datetime="'+day+'"'));
  const links=[...html.matchAll(/href="(\/card\/[^"#]+\/)"/g)].map(x=>x[1]);assert.ok(new Set(links).size>=3);for(const link of links)assert.ok(fs.existsSync('.'+link+'index.html'),link);assert.doesNotMatch(html,new RegExp('tcg'+'[ ]?player','i'));
 });
}
for(const [slug,expected]of Object.entries(originals))test(`${ledger.new_guides[slug].name}: verified debut and substantial edition history match independent facts`,()=>{
 const c=ledger.new_guides[slug],r=c.records[0],html=read(`card/${slug}/index.html`);assert.deepEqual([r.code,r.number,r.date,r.rarity,r.artist,r.finish],expected);const rows=[...html.matchAll(/<tr><th scope="row">([^]*?)<\/tr>/g)];assert.equal(rows.length,c.records.length);assert.ok(rows.length>=6);for(const [i,record]of c.records.entries())for(const value of [record.code+' #'+record.number,record.artist,record.finish,record.rarity])assert.ok(plain(rows[i][1]).includes(value),value);assert.ok(plain(html.slice(html.indexOf('<main'),html.indexOf('</main>'))).split(/\s+/).length>=1000);assert.doesNotMatch(html,/£\d|\$\d/);
});
test('Brainstorm distinguishes original nonfoil, Masques foil, two Archive arts and Mark Poole',()=>{
 const rows=ledger.new_guides.brainstorm.records;assert.equal(rows.find(x=>x.code==='MMQ').artist,'DiTerlizzi');assert.equal(rows.find(x=>x.code==='SLD').artist,'Mark Poole');assert.equal(rows.find(x=>x.code==='STA'&&x.number==='13').artist,'Justin Hernandez & Alexis Hernandez');assert.equal(rows.find(x=>x.code==='STA'&&x.number==='76').artist,'Ayako Ishiguro');assert.match(read('card/brainstorm/index.html'),/Japanese-language/);
});
test('Thoughtseize separates traditional, etched and textured menus by exact printing',()=>{
 const r=ledger.new_guides.thoughtseize.records;assert.equal(r.find(x=>x.code==='SLD').finish,'Nonfoil, etched');assert.equal(r.find(x=>x.code==='OTP'&&x.number==='70').finish,'Textured foil only');assert.equal(r.find(x=>x.code==='OTP'&&x.number==='20').finish,'Nonfoil, traditional foil');assert.ok(!r.some(x=>x.code==='AKR'));assert.match(read('card/thoughtseize/index.html'),/first distribution day of every Invocation wave/);
});
test('Mystical Tutor preserves physical original, alternate artists and format-specific legality',()=>{
 const r=ledger.new_guides['mystical-tutor'].records;assert.equal(r.find(x=>x.code==='V09').finish,'Traditional foil only');assert.equal(r.find(x=>x.code==='DMR'&&x.number==='289').artist,'Lindsey Look');assert.equal(r.find(x=>x.code==='DMR'&&x.number==='421').artist,'Richard Kane Ferguson');assert.equal(r.find(x=>x.code==='TLE').finish,'Nonfoil only');const s=plain(read('card/mystical-tutor/index.html'));assert.match(s,/Legacy.*banned|banned in Legacy/);assert.match(s,/Vintage.*restricted|restricted in Vintage/);
});
test('Dark Ritual collector indexes, true foil editions and Archive artwork remain distinct',()=>{
 const r=ledger.new_guides['dark-ritual'].records;assert.equal(r.find(x=>x.code==='MP2').number,'21');assert.equal(r.find(x=>x.code==='MP2').artist,'Richard Wright');assert.equal(r.find(x=>x.code==='USG').finish,'Nonfoil only');assert.equal(r.find(x=>x.code==='MMQ').artist,'Rebecca Guay');assert.equal(r.find(x=>x.code==='STA'&&x.number==='26').artist,'Robbie Trevino');assert.equal(r.find(x=>x.code==='STA'&&x.number==='89').artist,'Rien.');assert.match(read('card/dark-ritual/index.html'),/not a collector-number line printed on the Alpha card/);
});
test('upgraded guides retain their curated tables and clarify their most-confused editions',()=>{
 const originalTables={'sol-ring':9,'rhystic-study':9,'the-one-ring':10,'arcane-signet':7};for(const [slug,count]of Object.entries(originalTables)){const s=read(`card/${slug}/index.html`);assert.equal([...s.match(/<tbody>([^]*?)<\/tbody>/)[1].matchAll(/<tr>/g)].length,count);assert.ok(s.includes('id="'+slug+'-identify-heading"'));assert.ok(s.includes('id="'+slug+'-comparison-heading"'));}
 const sol=plain(read('card/sol-ring/index.html')),rhystic=plain(read('card/rhystic-study/index.html')),ring=plain(read('card/the-one-ring/index.html')),signet=plain(read('card/arcane-signet/index.html'));assert.match(sol,/Mark Tedin/);assert.match(sol,/Mark Poole/);assert.match(rhystic,/PCY #45[^]*?common/);assert.doesNotMatch(rhystic,/From Prophecy rare/);assert.match(ring,/001\/001/);assert.match(ring,/#748z/);assert.match(signet,/4 October 2019/);assert.match(signet,/not an ordinary Draft Booster inclusion/);
});
test('contextual cross-links connect new guides with related printing histories',()=>{
 const links={'sol-ring':['arcane-signet','dark-ritual'],'rhystic-study':['mystic-remora','brainstorm','mystical-tutor'],brainstorm:['counterspell','force-of-will'],thoughtseize:['demonic-tutor','vampiric-tutor'],'mystical-tutor':['enlightened-tutor','worldly-tutor'],'dark-ritual':['necropotence','demonic-tutor']};for(const [slug,targets]of Object.entries(links))for(const target of targets)assert.ok(read(`card/${slug}/index.html`).includes(`href="/card/${target}/"`),slug+' → '+target);
});
test('59 guide routes appear once in registry, directory and the 63-URL sitemap',()=>{
 const app=read('assets/js/app.js'),registered=[...app.match(/const GUIDE_SLUGS = new Set\(\[([^]*?)\]\)/)[1].matchAll(/"([a-z0-9-]+)"/g)].map(x=>x[1]),list=graph(read('card/index.html')).find(n=>n['@type']==='ItemList'),urls=[...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);assert.equal(registered.length,59);assert.equal(new Set(registered).size,59);assert.equal(list.numberOfItems,59);assert.equal(urls.length,63);assert.equal(new Set(urls).size,63);for(const slug of slugs){const url=host+'/card/'+slug+'/';assert.equal(registered.filter(s=>s===slug).length,1);assert.equal(list.itemListElement.filter(x=>x.url===url).length,1);assert.equal(urls.filter(x=>x===url).length,1);}assert.ok(urls.includes(host+'/contact/'));assert.ok(!urls.some(u=>u.includes('?')));assert.ok(!urls.includes(host+'/privacy/'));assert.ok(!urls.includes(host+'/terms/'));
});
test('new sitemap dates are limited to the editorial batch and the directory',()=>{
 const expected=new Set([host+'/card/',...slugs.map(s=>host+'/card/'+s+'/')]),entries=[...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];assert.deepEqual(new Set(entries.filter(x=>x[2]===day).map(x=>x[1])),expected);assert.equal(entries.find(x=>x[1]===host+'/')[2],'2026-11-09');assert.equal(entries.find(x=>x[1]===host+'/deck/')[2],'2026-11-07');assert.equal(entries.find(x=>x[1]===host+'/contact/')[2],'2026-11-07');
});
test('registry cache refresh is loaded by the homepage and all eight explorer guides',()=>{for(const path of ['index.html',...slugs.map(s=>'card/'+s+'/index.html')])assert.match(read(path),/\/assets\/js\/app.js\?v=seo-ctr1/);});
test('new guide names resolve through the existing shared exact-name search and guide/deck handoff',async()=>{
 const app=read('assets/js/app.js'),registry=new Set([...app.match(/const GUIDE_SLUGS = new Set\(\[([^]*?)\]\)/)[1].matchAll(/"([a-z0-9-]+)"/g)].map(x=>x[1]));for(const [slug,card]of Object.entries(ledger.new_guides)){
  const calls=[],c={API:'https://api.scryfall.com',encodeURIComponent,readJson:async u=>{calls.push(u);return{name:card.name};}};vm.createContext(c);vm.runInContext(app.slice(app.indexOf('  async function namedCard('),app.indexOf('  async function cardId(')),c);assert.equal((await c.namedCard(card.name)).name,card.name);assert.equal(new URL(calls[0]).searchParams.get('exact'),card.name);
  Object.assign(c,{GUIDE_SLUGS:registry,window:{location:{pathname:'/'}},URLSearchParams,slug:s=>s.toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-'),esc:s=>s,selectedFinish:()=> 'foil'});vm.runInContext(app.slice(app.indexOf('  function guideLink('),app.indexOf('  function marketplace(')),c);const record={name:card.name,id:'11111111-1111-4111-8111-111111111111'};assert.ok(c.guideLink(record).includes('/card/'+slug+'/'));const url=new URL(c.deckLink(record).match(/href="([^"]+)"/)[1].replace(/&amp;/g,'&'),host);assert.equal(url.searchParams.get('printing'),record.id);assert.equal(url.searchParams.get('finish'),'foil');
 }
});
