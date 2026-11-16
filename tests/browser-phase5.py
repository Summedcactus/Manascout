"""Native priority cohort and bounded event hooks. Synthetic catalogue/images, no provider.
Run a local server on 8765; opt into environment-specific Chromium flags explicitly.
"""
import argparse,asyncio,base64,json,subprocess
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.async_api import async_playwright
SPY="""window.__events=[];Object.defineProperty(window,'ManaScoutAnalytics',{configurable:true,set(api){Object.defineProperty(window,'ManaScoutAnalytics',{configurable:true,value:Object.freeze({...api,track(event,properties){window.__events.push({event,properties});return api.track(event,properties)}})})}});Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('test clipboard unavailable')}}});"""
async def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',default='/tmp/manascout-phase5');ap.add_argument('--base-url',default='http://127.0.0.1:8765');ap.add_argument('--chromium',default='/usr/bin/chromium');ap.add_argument('--no-sandbox',action='store_true');ap.add_argument('--ignore-https-errors',action='store_true');args=ap.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
 def check(name,ok):
  checks.append({'check':name,'passed':bool(ok)});print(json.dumps(checks[-1]),flush=True);assert ok,name
 baseline=json.loads(Path('docs/us-search-baseline.json').read_text());slugs=list(baseline['guides'])
 names=['Mr. Spock, Science Officer','Sol Ring','Arcane Signet','Rhystic Study','Deflecting Swat']
 cards=json.loads(subprocess.check_output(['node','-e',"const{raw}=require('./tests/helpers/cards.cjs');console.log(JSON.stringify(JSON.parse(process.argv[1]).map((name,i)=>raw(i+1,{name,artist:'Synthetic browser fixture',rarity:'rare',prices:{eur:'1.00',eur_foil:'2.00'}}))));",json.dumps(names)],text=True))
 png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'] if args.no_sandbox else [])
  async def context(card,width=1280,spy=True,restricted=False):
   ctx=await browser.new_context(ignore_https_errors=args.ignore_https_errors,viewport={'width':width,'height':900},reduced_motion='reduce',accept_downloads=True)
   if spy:await ctx.add_init_script(SPY)
   if restricted:await ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw Error('test restricted storage')}})")
   variant={**card,'id':'99999999-1111-4111-8111-111111111111','collector_number':'2'}
   async def catalogue(route):
    u=urlsplit(route.request.url);q=parse_qs(u.query)
    if 'Missing' in u.query:await route.fulfill(status=404,json={'object':'error'});return
    if u.path=='/cards/autocomplete':payload={'data':[card['name']]}
    elif u.path=='/cards/search':payload={'object':'list','data':[card,variant] if 'oracleid:' in q.get('q',[''])[0] else [card],'has_more':False,'total_cards':2 if 'oracleid:' in q.get('q',[''])[0] else 1}
    elif u.path=='/cards/collection':payload={'data':[card,variant],'not_found':[]}
    else:payload=variant if variant['id'] in u.path else card
    await route.fulfill(json=payload)
   await ctx.route('https://api.scryfall.com/**',catalogue)
   await ctx.route('https://cards.scryfall.io/**',lambda r:r.fulfill(body=png,content_type='image/png'))
   await ctx.route('https://api.frankfurter.dev/**',lambda r:r.abort())
   page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   return ctx,page
  for slug,card in zip(slugs,cards):
   for width in [320,390,1280]:
    ctx,page=await context(card,width);await page.goto(args.base_url+'/card/'+slug+'/');await page.wait_for_selector('.detail-grid');await page.wait_for_function("document.querySelector('#printings-status')?.textContent.includes('matching records')")
    prefix=f'{slug} {width}'
    check(prefix+' H1 visible',await page.locator('h1').is_visible())
    check(prefix+' concise answer early',await page.locator('.hero-copy strong').first.evaluate('e=>e.getBoundingClientRect().top<innerHeight && e.getBoundingClientRect().bottom>0'))
    check(prefix+' no horizontal overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    check(prefix+' image loads',await page.locator('.guide-static-art img').evaluate('e=>e.complete&&e.naturalWidth>0'))
    check(prefix+' initial load not counted as search',await page.evaluate('window.__events.length===0'))
    cta=page.locator('.guide-primary-cta');await cta.focus();check(prefix+' keyboard action focus',await cta.evaluate('e=>e===document.activeElement'));await page.keyboard.press('Enter')
    check(prefix+' explorer receives fragment focus',await page.evaluate("document.activeElement.id.endsWith('-printings-heading')"))
    selected_id=await page.locator('#card-details [data-compare-id]').get_attribute('data-compare-id');await page.locator('#card-details [data-compare-id]').click();await page.locator(f'#ms-print-body [data-compare-id]:not([data-compare-id="{selected_id}"])').first.click()
    check(prefix+' two exact selections',await page.locator('.cmp-grid article').count()==2)
    check(prefix+' single start event',await page.evaluate("JSON.stringify(__events)===JSON.stringify([{event:'guide_compare_start',properties:{guide:location.pathname.split('/')[2],selection_count:1}}])"))
    await page.locator('.cmp-current details summary').click();await page.locator('.cmp-name').fill('Private comparison name');await page.get_by_role('button',name='Save in this browser',exact=True).click()
    check(prefix+' save event bounded',await page.evaluate("JSON.stringify(__events.at(-1))===JSON.stringify({event:'comparison_save',properties:{selection_count:2,storage:'browser'}})"))
    await page.locator('[data-cmp="share"]').click()
    check(prefix+' manual share event bounded',await page.evaluate("JSON.stringify(__events.at(-1))===JSON.stringify({event:'comparison_share',properties:{selection_count:2,method:'manual'}})"))
    await ctx.route('**/phase5-missing.jpg',lambda r:r.abort());await page.locator('.guide-static-art img').evaluate("e=>e.src='/phase5-missing.jpg'");await page.locator('.guide-image-error').wait_for(state='visible')
    check(prefix+' image fallback retains source identity',await page.locator('.guide-image-error').is_visible() and bool(await page.locator('[data-guide-reference-label]').inner_text()))
    await page.screenshot(path=str(out/f'{slug}-{width}.png'),full_page=True)
    await ctx.close()
  # Successful shared search only; failed lookup is not a success.
  ctx,page=await context(cards[1]);await page.goto(args.base_url+'/?q=Sol%20Ring');await page.wait_for_selector('.detail-grid');check('direct home lookup not an explicit search',await page.evaluate('__events.length===0'))
  await page.locator('#search-input').fill('Sol Ring');await page.locator('#search-input').press('Enter');await page.wait_for_function("__events.some(e=>e.event==='search_success')")
  check('explicit successful search bounded',await page.evaluate("JSON.stringify(__events)===JSON.stringify([{event:'search_success',properties:{surface:'home',exact_printing:false}}])"))
  await page.locator('#search-input').fill('Missing');await page.locator('#search-input').press('Enter');await page.wait_for_function("document.querySelector('#card-details').textContent.includes('No card matched')")
  check('failed lookup does not emit success',await page.evaluate('__events.length===1'));await ctx.close()
  # Native import acceptance/export hooks, previews and private contents excluded.
  ctx,page=await context(cards[1]);await page.goto(args.base_url+'/deck/');await page.locator('#deck-import').click();await page.locator('#portable-text').fill('1 Sol Ring');await page.locator('#portable-preview').click();await page.wait_for_function("!document.getElementById('portable-accept').disabled")
  check('import preview emits no completion',await page.evaluate('__events.length===0'));await page.keyboard.press('Escape');check('import cancel emits no completion',await page.evaluate('__events.length===0'))
  for kind,raw in [('text','1 Sol Ring'),('csv','quantity,name\n1,Sol Ring')]:
   await page.locator('#deck-import').click();await page.locator('#portable-kind').select_option(kind);await page.locator('#portable-text').fill(raw);await page.locator('#portable-preview').click();await page.wait_for_function("!document.getElementById('portable-accept').disabled");await page.locator('#portable-accept').click();await page.wait_for_function("!document.getElementById('deck-portable').open")
   check(kind+' accepted import event only bounded enums',await page.evaluate("JSON.stringify(__events.at(-1))===JSON.stringify({event:'deck_import_complete',properties:{import_format:'"+kind+"',deck_format:'commander'}})"))
  await page.locator('#deck-export').click()
  backup=None
  for ext in ['txt','csv','json']:
   before=await page.evaluate('__events.length')
   async with page.expect_download() as dl:await page.locator('#portable-'+ext).click()
   download=await dl.value
   if ext=='json':backup=Path(await download.path()).read_bytes()
   check(ext+' export emits once and only bounded enums',await page.evaluate("__events.length==="+str(before+1)+" && JSON.stringify(__events.at(-1))===JSON.stringify({event:'deck_export',properties:{export_format:'"+ext+"',deck_format:'commander',method:'download'}})"))
  await page.locator('#portable-copy').click();check('deck copy manual fallback event',await page.evaluate("JSON.stringify(__events.at(-1))===JSON.stringify({event:'deck_export',properties:{export_format:'txt',deck_format:'commander',method:'manual'}})"));await page.keyboard.press('Escape')
  await page.locator('#backup-file').set_input_files({'name':'private-filename.json','mimeType':'application/json','buffer':backup});await page.wait_for_function("__events.at(-1)?.event==='deck_import_complete' && __events.at(-1)?.properties.import_format==='json'")
  check('JSON restore emits one completion',await page.evaluate("__events.filter(e=>e.event==='deck_import_complete'&&e.properties.import_format==='json').length===1"))
  check('events exclude names identifiers and deck contents',await page.evaluate("!JSON.stringify(__events).match(/Sol Ring|private|11111111|oracle|http|quantity|name|price/i)"))
  check('merchant helper remains inactive',await page.evaluate("ManaScoutAnalytics.trackMerchantExit({merchant:'not_approved',guide:'sol-ring',finish:'foil'})===false && !__events.some(e=>e.event==='merchant_exit')"));await ctx.close()
  ctx,page=await context(cards[1],320,restricted=True);await page.goto(args.base_url+'/card/sol-ring/');await page.wait_for_selector('.detail-grid');await page.locator('#card-details [data-compare-id]').click();await page.locator('.cmp-current details summary').click();await page.get_by_role('button',name='Save in this browser',exact=True).click();check('restricted save emits memory status without breaking selection',await page.evaluate("__events.at(-1).properties.storage==='memory'") and await page.locator('.cmp-grid article').count()==1);await ctx.close()
  check('no uncaught JS errors',not errors)
  (out/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'catalogue':'synthetic','images':'synthetic 1px load plus actual aborted image request','widths':[320,390,1280]},indent=2));print(json.dumps({'passed':len(checks),'errors':errors}),flush=True);await browser.close()
asyncio.run(main())
