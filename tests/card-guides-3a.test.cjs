/* Reviewed catalogue fixtures, 4 November 2026. These test editorial integrity and
 * the real shared integration helpers, not live API availability or physical foils. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const ledger=JSON.parse(read('docs/card-guide-research-3a.json'));
const revisions=JSON.parse(read('docs/card-guide-research-seo-ctr.json')).upgrades;
const plain=s=>s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const graph=html=>JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1])['@graph'];
const expected={
 'mox-diamond':['Mox Diamond','STH','138','Dan Frazier',2],
 'gaeas-cradle':["Gaea's Cradle",'USG','321','Mark Zug',3],
 'grim-monolith':['Grim Monolith','ULG','126','Chippy',3],
 'cavern-of-souls':['Cavern of Souls','AVR','226','Cliff Childs',13],
 'rhystic-study':['Rhystic Study','PCY','45','Terese Nielsen',9],
 'black-lotus':['Black Lotus','LEA','232','Christopher Rush',7],
 'mana-crypt':['Mana Crypt','PHPR','5','Mark Tedin',14],
 'jace-the-mind-sculptor':['Jace, the Mind Sculptor','WWK','31','Jason Chan',10],
 'lightning-bolt':['Lightning Bolt','LEA','161','Christopher Rush',8],
 'ancient-tomb':['Ancient Tomb','TMP','315','Colin MacNeil',8]
};
const slugs=Object.keys(expected),app=read('assets/js/app.js');
for(const slug of slugs){
 const html=read(`card/${slug}/index.html`),g=ledger.cards.find(x=>x.slug===slug),revision=revisions[slug]||g,[name,code,num,artist,count]=expected[slug],url=`https://manascout.co.uk/card/${slug}/`;
 test(`${name}: researched original, precise card identity, metadata and linked Article graph`,()=>{
  assert.equal(g.name,name);assert.deepEqual(g.first.slice(1,3),[code,num]);assert.equal(g.first[5],artist);
  assert.ok(plain(html).includes(`${code} #${num}`));assert.ok(plain(html).includes(artist));
  assert.ok(html.includes(`class="printing-guide" data-card-name="${name.replace(/'/g,'&#x27;')}"`));
  const meta=html.match(/<meta name="description" content="([^"]+)"/)[1];assert.ok(meta.length>100);assert.equal(plain(html.match(/<title>([^]*?)<\/title>/)[1]),revision.title);assert.match(g.title,/Printings|First Printing/);
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));assert.ok(html.includes(`<meta property="og:url" content="${url}">`));
  const ld=graph(html),page=ld.find(x=>x['@type']==='WebPage'),article=ld.find(x=>x['@type']==='Article'),crumb=ld.find(x=>x['@type']==='BreadcrumbList');
  assert.equal(page.url,url);assert.equal(page.mainEntity['@id'],article['@id']);assert.equal(article.mainEntityOfPage['@id'],page['@id']);assert.equal(article.about.name,name);assert.equal(article.description,revision.description);assert.equal(article.dateModified,revisions[slug]?.reviewed||'2026-11-04');assert.ok(article.citation.length>=count);assert.ok(article.citation.every(x=>/^https:\/\//.test(x)));assert.equal(crumb.itemListElement.at(-1).item,url);
  assert.doesNotMatch(JSON.stringify(ld),/"(?:Offer|Product|AggregateRating|price|ratingValue)"/);
 });
 test(`${name}: independently scoped shortlist, artists and finish records agree with research ledger`,()=>{
  const rows=[...html.match(/<tbody>([^]*?)<\/tbody>/)[1].matchAll(/<tr>([^]*?)<\/tr>/g)].map(x=>x[1]);assert.equal(rows.length,count);assert.equal(g.records.length,count);
  for(const [i,r] of g.records.entries()){
   assert.ok(rows[i].includes(`https://scryfall.com/card/${r.code.toLowerCase()}/${r.number}`));assert.ok(plain(rows[i]).includes(r.artist));assert.ok(plain(rows[i]).includes(r.finish));assert.ok(plain(rows[i]).includes(r.art));assert.ok(graph(html).find(x=>x['@type']==='Article').citation.includes(r.source));
  }
  for(const key of ['quick','rules','history','shortlist','art','foil','choice','pick','printings','related','sources'])assert.ok(html.includes(`id="${slug}-${key}-heading"`));
  assert.match(html,/<div class="table-wrap" role="region"[^>]+tabindex="0">/);assert.match(html,/<caption>/);assert.match(html,/<th scope="row">/);assert.match(html,/guide-editorial\.css\?v=1/);assert.match(html,/class="guide-jump-links"/);assert.match(html,/class="guide-sources"/);
 });
 test(`${name}: shared explorer, precise name lookup and optional guide/deck links remain functional`,async()=>{
  for(const id of ['card-details','printings-status','printings-container'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
  assert.ok(html.includes('/assets/js/card-page.js'));assert.ok(html.includes('/assets/js/app.js?v='+ (revisions[slug]?'seo-ctr1':'eldrazi-guides1')));assert.match(html,/<noscript>/);assert.doesNotMatch(html,/data-ms-flip|data-ms-nonfoil/);assert.equal((html.match(/<img\b/g)||[]).length,slug==='rhystic-study'?1:0);
  for(const link of g.related)assert.ok(html.includes(`href="/card/${link}/"`));
  const calls=[],ctx={API:'https://api.scryfall.com',encodeURIComponent,readJson:async u=>{calls.push(u);return{name};}};vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('  async function namedCard('),app.indexOf('  async function cardId(')),ctx);assert.equal((await ctx.namedCard(name)).name,name);assert.equal(new URL(calls[0]).searchParams.get('exact'),name);assert.equal(calls.length,1);
 });
}
const card=slug=>ledger.cards.find(x=>x.slug===slug),row=(slug,code,num)=>card(slug).records.find(x=>x.code===code&&x.number===num);
test('Rhystic Study entire page distinguishes original common from specific later rarities',()=>{
 const s=plain(read('card/rhystic-study/index.html'));assert.match(s,/From Prophecy common to Commander icon/);assert.doesNotMatch(s,/From Prophecy rare|Prophecy rare to Commander|original-set rare/);assert.equal(card('rhystic-study').first[4],'common');assert.equal(card('rhystic-study').first[3],'5 June 2000');assert.match(row('rhystic-study','PCY','45').art,/common/);assert.match(row('rhystic-study','CM1','15').art,/common/);assert.match(row('rhystic-study','J18','7').art,/rare/);assert.match(row('rhystic-study','WOT','25').art,/mythic rare/);assert.equal(row('rhystic-study','J22','114').finish,'Nonfoil only');assert.match(s,/payment is not an extra cost/);assert.match(s,/confetti is a treatment change/);assert.equal(row('rhystic-study','FCA','31').artist,'Square Enix');assert.equal(row('rhystic-study','FCA','31').finish,'Nonfoil, traditional foil');
});
test('Mana Crypt neon suffixes are individually attributed physical foil treatments; ordinary 17 stays separate',()=>{
 const g=card('mana-crypt'),neon=g.records.filter(r=>r.code==='SPG'&&r.number!=='17');assert.equal(neon.length,6);
 for(const [suffix,colour] of [['a','three-colour'],['b','yellow'],['c','blue'],['d','purple'],['e','red'],['f','green']]){const r=row('mana-crypt','SPG','17'+suffix);assert.equal(r.artist,'Dominik Mayer');assert.match(r.art,new RegExp(colour));assert.match(r.art,/Cosmium neon ink/);assert.equal(r.finish,'Cosmium neon-ink foil only');}
 assert.equal(row('mana-crypt','SPG','17').finish,'Nonfoil, traditional foil');assert.match(row('mana-crypt','SPG','17').art,/no neon ink/);
 const s=plain(read('card/mana-crypt/index.html'));assert.match(s,/letter suffixes are catalogue variant identifiers/);assert.match(s,/distinct, foil-only physical treatment/);assert.match(s,/Legality checked 4 November 2026/);assert.match(s,/still bans Mana Crypt in Commander and Legacy and restricts it in Vintage/);assert.match(s,/23 September 2024/);
});
test('Mana Crypt retains detailed verified book, Judge, Masters, Mystery Booster and Invention history',()=>{
 const s=plain(read('card/mana-crypt/index.html'));for(const term of ['Final Sacrifice','book coupons and mail-in offers','Mark Tedin','Matt Stewart','Volkan Baǵa','Ron Spencer','Eternal Masters','Mystery Booster','PLST #EMA-225','Kaladesh Inventions #16','Double Masters','HarperPrism','three damage'])assert.ok(s.includes(term),term);assert.ok(s.split(/\s+/).length>2000);assert.equal(row('mana-crypt','G11','5').finish,'Traditional foil only');assert.equal(row('mana-crypt','MPS','16').finish,'Traditional foil only');
});
test('new reserved-card histories distinguish digital records and non-tournament collector reproductions',()=>{
 for(const slug of slugs.slice(0,3)){const s=plain(read(`card/${slug}/index.html`));assert.match(s,/Reserved List/);assert.match(s,/digital/);}
 assert.equal(row('mox-diamond','STH','138').finish,'Nonfoil only');assert.equal(row('mox-diamond','V10','10').artist,'Volkan Baǵa');assert.equal(row('mox-diamond','V10','10').finish,'Foil only');
 for(const slug of ['gaeas-cradle','grim-monolith']){const s=plain(read(`card/${slug}/index.html`));assert.match(s,/gold.border/);assert.match(s,/not.*tournament/);}
 assert.equal(row('grim-monolith','ULG','126').artist,'Chippy');assert.equal(row('grim-monolith','ULG','126').finish,'Nonfoil, traditional foil');
});
test('Cavern editions separate artist changes, etched, surge, neon and same-release variants',()=>{
 assert.equal(row('cavern-of-souls','AVR','226').artist,'Cliff Childs');assert.equal(row('cavern-of-souls','2X2','402').artist,'Drew Tucker');assert.equal(row('cavern-of-souls','2X2','569').artist,'Richard Wright');assert.equal(row('cavern-of-souls','2X2','569').finish,'Etched foil only');assert.equal(row('cavern-of-souls','LTC','392').finish,'Surge foil only');assert.equal(row('cavern-of-souls','LCI','410a').finish,'Cosmium neon-ink foil only');assert.equal(row('cavern-of-souls','ZNE','22').artist,'Sam Burley');
});
test('Black Lotus separates early editions and collector products with no invented foil',()=>{
 const g=card('black-lotus');assert.ok(g.records.every(r=>r.artist==='Christopher Rush'&&r.finish==='Nonfoil only'));const s=plain(read('card/black-lotus/index.html'));for(const text of ['5 August 1993','4 October 1993','1 December 1993','10 December 1993','square corners','non-tournament-legal','restricted in Vintage','do not print modern collector numbers'])assert.ok(s.includes(text),text);assert.equal(row('black-lotus','30A','525').art,'Retro frame; commemorative back');
});
test('Jace, Bolt and Ancient Tomb protect artist/finish distinctions and corrected mechanics',()=>{
 assert.equal(row('jace-the-mind-sculptor','WWK','31').artist,'Jason Chan');assert.equal(row('jace-the-mind-sculptor','2XM','334').artist,'Jason Chan');assert.equal(row('jace-the-mind-sculptor','BLC','93').artist,'TAPIOCA');assert.equal(row('jace-the-mind-sculptor','BLC','93').finish,'Raised foil only');assert.equal(row('jace-the-mind-sculptor','SLD','8001').finish,'Nonfoil, traditional foil');
 for(const [num,artist]of [['83','Noah Bradley'],['84','Brigitte Roka'],['85','Robbie Trevino'],['86','Alexis Ziritt']]){assert.equal(row('lightning-bolt','SLD',num).artist,artist);assert.equal(row('lightning-bolt','SLD',num).finish,'Traditional foil only');}
 assert.equal(row('lightning-bolt','STA','105').finish,'Nonfoil, traditional foil, etched foil');assert.match(plain(read('card/ancient-tomb/index.html')),/deals two damage.*not an additional cost/);assert.equal(card('ancient-tomb').first[4],'uncommon');assert.equal(row('ancient-tomb','LTC','387').finish,'Surge foil only');
});
test('59-guide catalogue, directory ItemList, registry, canonical URLs and sitemap agree exactly',()=>{
 const dirs=fs.readdirSync('card',{withFileTypes:true}).filter(x=>x.isDirectory()&&fs.existsSync(`card/${x.name}/index.html`)&&/data-card-name=/.test(read(`card/${x.name}/index.html`))).map(x=>x.name).sort();assert.equal(dirs.length,59);
 const registry=[...app.match(/const GUIDE_SLUGS = new Set\(\[([^]*?)\]\)/)[1].matchAll(/"([a-z0-9-]+)"/g)].map(x=>x[1]);assert.equal(registry.length,59);assert.deepEqual(registry.sort(),dirs);
 const dir=read('card/index.html'),list=graph(dir).find(x=>x['@type']==='ItemList');assert.equal(list.numberOfItems,59);assert.equal(list.itemListElement.length,59);assert.deepEqual(list.itemListElement.map(x=>x.position),Array.from({length:59},(_,i)=>i+1));assert.deepEqual(list.itemListElement.map(x=>new URL(x.url).pathname.split('/')[2]).sort(),dirs);
 const urls=[...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);assert.equal(new Set(urls).size,63);assert.equal(urls.length,63);
 const canonical=[];for(const slug of dirs){const html=read(`card/${slug}/index.html`),url=`https://manascout.co.uk/card/${slug}/`;assert.equal(html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)[1],url);canonical.push(url);assert.equal(urls.filter(x=>x===url).length,1);}assert.equal(new Set(canonical).size,59);
 for(const slug of slugs.slice(0,4)){const group=dir.slice(dir.indexOf('id="tutors-power"'),dir.indexOf('id="showcase-releases"'));assert.ok(group.includes(`href="/card/${slug}/"`));}
 assert.doesNotMatch(dir,/\b40 (?:Magic|ManaScout|guides)|<strong>40<\/strong>/);assert.match(read('deck/index.html'),/Explore 59 card guides/);
});
test('new registry entries use actual shared guide link and exact-printing/finish handoff helpers',()=>{
 const GUIDE_SLUGS=new Set([...app.match(/const GUIDE_SLUGS = new Set\(\[([^]*?)\]\)/)[1].matchAll(/"([a-z0-9-]+)"/g)].map(x=>x[1]));
 const slug=s=>s.toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
 const code=app.slice(app.indexOf('  function guideLink('),app.indexOf('  function marketplace('));
 for(const key of slugs.slice(0,4)){const name=expected[key][0];for(const pathname of ['/','/?q='+encodeURIComponent(name),`/card/${key}/`]){const c={GUIDE_SLUGS,window:{location:{pathname}},URLSearchParams,slug,esc,selectedFinish:()=> 'foil'};vm.createContext(c);vm.runInContext(code,c);const card={name,id:'11111111-1111-4111-8111-111111111111'};if(pathname.startsWith('/card/'))assert.equal(c.guideLink(card),'');else assert.ok(c.guideLink(card).includes(`/card/${key}/`));const href=c.deckLink(card).match(/href="([^"]+)"/)[1].replace(/&amp;/g,'&'),url=new URL(href,'https://manascout.co.uk');assert.equal(url.searchParams.get('printing'),card.id);assert.equal(url.searchParams.get('finish'),'foil');assert.equal(url.searchParams.get('card'),name);assert.equal(url.searchParams.get('guide'),`/card/${key}/`);}}
});
test('all ten headers retain working search toggle, submit, Escape and focus restoration',async()=>{
 const {dom}=require('./helpers/card-dom.cjs');for(const slug of slugs){const d=dom();const make=(tag,id)=>{const x=new d.Element(tag);x.setAttribute('id',id);d.document.body.append(x);return x;};const toggle=make('button','guide-search-toggle'),panel=make('div','guide-search-panel'),form=make('form','guide-search-form'),input=make('input','guide-card-search');panel.hidden=true;const window={setTimeout:fn=>fn(),location:{href:''}},c={document:d.document,window,encodeURIComponent};vm.createContext(c);const code=[...read(`card/${slug}/index.html`).matchAll(/<script>([^]*?)<\/script>/g)].at(-1)[1];vm.runInContext(code,c);await toggle.emit('click');assert.equal(panel.hidden,false);assert.equal(d.document.activeElement,input);input.value=expected[slug][0];await form.emit('submit');assert.equal(window.location.href,'/?q='+encodeURIComponent(input.value));for(const fn of d.document.listeners.keydown)fn({key:'Escape'});assert.equal(panel.hidden,true);assert.equal(d.document.activeElement,toggle);}
});
test('all 59 permanent guides retain existing local navigation and asset targets',()=>{
 const path=require('node:path');const dirs=fs.readdirSync('card',{withFileTypes:true}).filter(x=>x.isDirectory()&&fs.existsSync(`card/${x.name}/index.html`));assert.equal(dirs.length,59);
 for(const d of dirs){const file=`card/${d.name}/index.html`,html=read(file);for(const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){const href=m[1].replace(/&amp;/g,'&');if(/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href))continue;const url=new URL(href,'https://local.invalid/'+file);let target=decodeURIComponent(url.pathname).replace(/^\//,'');if(!target||target.endsWith('/'))target+='index.html';assert.ok(fs.existsSync(target),`${file}: ${href}`);if(url.hash&&path.resolve(target)===path.resolve(file)){const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));assert.ok(ids.has(decodeURIComponent(url.hash.slice(1))),`${file}: ${href}`);}}}
});
