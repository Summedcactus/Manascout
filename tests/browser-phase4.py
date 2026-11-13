"""Deterministic generator journeys using canonical commander Oracle snapshots and synthetic pools."""
import argparse,asyncio,json,subprocess,time
from pathlib import Path
from urllib.parse import urlsplit,parse_qs,urlencode
from playwright.async_api import async_playwright
async def main():
 ap=argparse.ArgumentParser();ap.add_argument('--indices',default='0,2,3,5,6,8,4');ap.add_argument('--widths',default='320,390,1280');ap.add_argument('--base-url',default='http://127.0.0.1:8765');ap.add_argument('--output',default='/tmp/manascout-phase4');ap.add_argument('--chromium',default='/usr/bin/chromium');ap.add_argument('--no-sandbox',action='store_true');ap.add_argument('--ignore-https-errors',action='store_true');args=ap.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True);checks=[];timings=[];errors=[]
 def check(name,ok,**details):
  checks.append({'check':name,'passed':bool(ok),**details});print(json.dumps(checks[-1]),flush=True);assert ok,(name,details)
 payload=json.loads(subprocess.check_output(['node','-e',r'''const{fixture,specs,ledger}=require('./tests/helpers/generator-quality.cjs'),{raw}=require('./tests/helpers/cards.cjs');console.log(JSON.stringify(JSON.parse(process.argv[1]).map(i=>{const f=fixture(i);return{index:i,style:f.style,commander:f.commander,records:f.records.map(c=>{const original=ledger.records.find(x=>x.id===c.id);return raw(1,{id:c.id,oracle_id:c.oracleId,name:c.name,type_line:c.type,oracle_text:c.rulesText,cmc:Number(c.manaValue),mana_cost:c.manaCost,color_identity:c.colorIdentity,colors:c.colors,finishes:c.availableFinishes,keywords:c.keywords,games:c.games,set:c.setCode.toLowerCase(),set_name:c.setName,collector_number:c.collectorNumber,lang:c.language.toLowerCase(),legalities:c.legalities,layout:c.layout,border_color:c.borderColor,oversized:c.oversized,prices:{eur:'0.10',eur_foil:'0.20'},...(original?.power?{power:original.power,toughness:original.toughness}:{})});})};})));''',json.dumps([int(i) for i in args.indices.split(',')])],text=True))
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'] if args.no_sandbox else [])
  for width in [int(w) for w in args.widths.split(',')]:
   for f in payload:
    ctx=await browser.new_context(ignore_https_errors=args.ignore_https_errors,viewport={'width':width,'height':900 if width>600 else 844},accept_downloads=True,reduced_motion='reduce')
    async def catalogue(route):
     u=urlsplit(route.request.url);q=parse_qs(u.query);records=f['records'];path=u.path
     if path=='/cards/collection':
      ids=[x['id'] for x in json.loads(route.request.post_data)['identifiers']];data=[c for c in records if c['id'] in ids];await route.fulfill(json={'data':data,'not_found':[]});return
     if path=='/cards/search':
      query=q.get('q',[''])[0]
      if 'oracleid:' in query:data=[c for c in records if c['oracle_id']==f['commander']['oracleId'] and c['id']==f['commander']['id']]
      else:data=records
      await route.fulfill(json={'data':data,'has_more':False,'total_cards':len(data)});return
     c=next((c for c in records if path=='/cards/'+c['id']),None)
     await route.fulfill(status=200 if c else 404,json=c or {'object':'error'})
    await ctx.route('https://api.scryfall.com/**',catalogue);await ctx.route('https://cards.scryfall.io/**',lambda r:r.abort());page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    query=urlencode({'card':f['commander']['name'],'printing':f['commander']['id'],'finish':f['commander']['finish']})
    await page.goto(args.base_url+'/deck/?'+query);await page.wait_for_function("!document.getElementById('preview-commander').disabled",timeout=30000)
    if not await page.locator('#card-preview').evaluate('e=>e.open'):await page.locator('[data-open-preview]').first.click()
    await page.locator('#preview-commander').click();await page.wait_for_function("!document.getElementById('generate-deck').disabled")
    await page.locator('#generation-options').evaluate('e=>e.open=true');await page.locator('#generation-strategy').select_option(f['style']);start=time.monotonic();await page.locator('#generate-deck').click()
    await page.wait_for_function("document.getElementById('deck-count').textContent.startsWith('100 / 100') && document.getElementById('generation-status').textContent.includes('starting deck')",timeout=60000);elapsed=time.monotonic()-start;timings.append({'name':f['commander']['name'],'width':width,'seconds':round(elapsed,3)})
    name=f['commander']['name'];check('100 cards generated',True,commander=name,width=width)
    check('supported composition summary', 'supported ramp' in await page.locator('#deck-message').inner_text(),commander=name,width=width)
    await page.locator('#save-deck').click();await page.wait_for_function("document.getElementById('save-status-message').textContent.includes('Saved')");await page.reload();await page.wait_for_function("document.getElementById('deck-count').textContent.startsWith('100 / 100')");check('save/reload and recalculated health support','Supported sources:' in await page.locator('#health-context').text_content(),commander=name,width=width)
    await page.locator('#deck-export').click()
    async with page.expect_download() as dl:await page.locator('#portable-json').click()
    deck=json.loads(Path(await (await dl.value).path()).read_text())['deck'];analysis=await page.evaluate('(d)=>window.ManaScoutDeckQuality.analyse(d,{styles:[d.generation.primaryStyle,d.generation.secondaryStyle,d.generation.tertiaryStyle],priorities:d.generation.priorities,curve:d.generation.curve})',deck)
    check('export and dependency support',not analysis['unsupported'] and sum(e['quantity'] for e in deck['entries'])==100,commander=name,width=width)
    check('supported infrastructure targets',all(analysis['infrastructure'][k]>=deck['generation']['targets'][k] for k in ['ramp','draw','interaction']),commander=name,width=width)
    if f['index']==0:check('Goblin thin-spell payoff regression',analysis['counts']['instant']<18 and not any(c['name'] in ['Guttersnipe','Fiery Inscription'] for c in deck['cards'].values()),width=width)
    if f['index']==6:check('landfall extra-entry support',analysis['counts']['landEntry']>=8,width=width)
    if f['index']==8:check('high MV acceleration',analysis['infrastructure']['ramp']>=12,width=width)
    check('no page overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),commander=name,width=width);await page.keyboard.press('Escape');check('export Escape focus returns',await page.locator('#deck-export').evaluate('e=>e===document.activeElement'),commander=name,width=width)
    if f['index']==0:await page.screenshot(path=str(out/f'goblin-{width}.png'),full_page=True)
    await ctx.close()
  check('no uncaught JavaScript errors',not errors);(out/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'timings':timings,'errors':errors},indent=2));print(json.dumps({'passed':len(checks),'timings':timings}),flush=True);await browser.close()
asyncio.run(main())
