"""Native Phase 6: saved live catalogue snapshots plus explicit synthetic CTR fixtures.
Images for the new guides/COTW may use downloaded, unmodified catalogue JPGs from
--image-dir. Otherwise image loads use a labelled synthetic test pixel.
"""
import argparse,asyncio,base64,json,subprocess
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.async_api import async_playwright
async def main():
 ap=argparse.ArgumentParser();ap.add_argument('--base-url',default='http://127.0.0.1:8765');ap.add_argument('--output',default='/tmp/manascout-phase6');ap.add_argument('--chromium',default='/usr/bin/chromium');ap.add_argument('--image-dir');ap.add_argument('--sources-only',action='store_true');ap.add_argument('--no-sandbox',action='store_true');ap.add_argument('--ignore-https-errors',action='store_true');args=ap.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[];b=json.loads(Path('docs/phase6-search-growth.json').read_text())
 def check(name,ok):
  checks.append({'check':name,'passed':bool(ok)});print(json.dumps(checks[-1]),flush=True);assert ok,name
 pixel=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
 cosmic=json.loads(Path('tests/fixtures/cosmic-spider-man.json').read_text())
 representative=['jeweled-lotus','cyclonic-rift','gaeas-cradle','black-lotus','the-one-ring','fierce-guardianship']
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'] if args.no_sandbox else [])
  async def context(cards,width=1280,motion='reduce',touch=False):
   cards=[{**c,'scryfall_uri':c.get('source','https://scryfall.com/card/'+c['set']+'/'+c['collector_number'])} for c in cards]
   ctx=await browser.new_context(ignore_https_errors=args.ignore_https_errors,viewport={'width':width,'height':900},reduced_motion=motion,has_touch=touch,is_mobile=touch)
   async def catalogue(route):
    u=urlsplit(route.request.url);q=parse_qs(u.query);path=u.path
    if path=='/cards/spm/271':data=cosmic
    elif path=='/cards/autocomplete':data={'data':[cards[0]['name']]}
    elif path=='/cards/search':data={'object':'list','data':cards,'has_more':False,'total_cards':len(cards)}
    else:
     data=next((c for c in cards if c['id'] in path or '/'+c['set']+'/'+c['collector_number']==path.removeprefix('/cards')),cards[0])
     if path=='/cards/named':data=cards[0]
    await route.fulfill(json=data)
   await ctx.route('https://api.scryfall.com/**',catalogue);await ctx.route('https://api.frankfurter.dev/**',lambda r:r.abort())
   async def artwork(route):
    file=None
    if args.image_dir:
     for slug,g in b['new_guides'].items():
      if g['first_id'] in route.request.url:file=Path(args.image_dir)/(slug+'.jpg')
     if cosmic['id'] in route.request.url:file=Path(args.image_dir)/'cosmic-spider-man.jpg'
    await route.fulfill(body=file.read_bytes() if file and file.exists() else pixel,content_type='image/jpeg' if file and file.exists() else 'image/png')
   await ctx.route('https://cards.scryfall.io/**',artwork)
   page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));return ctx,page
  if args.sources_only:
   for slug,g in b['new_guides'].items():
    cards=g['records'];ctx,page=await context(cards)
    await page.goto(args.base_url+'/card/'+slug+'/');await page.wait_for_selector('.detail-grid',state='attached')
    check(slug+' visible/image source match',await page.locator('.guide-reference-source').get_attribute('href')==await page.locator('[data-guide-reference-link]').get_attribute('href'))
    target=next(c for c in cards if c['id']!=g['first_id'])
    await page.goto(args.base_url+'/card/'+slug+'/?printing='+target['id']+'&finish='+target['finishes'][0]);await page.wait_for_selector('.detail-grid',state='attached')
    check(slug+' persistent source follows exact record',await page.locator('.guide-reference-source').get_attribute('href')==target['source'])
    await ctx.route('**/missing-source.jpg',lambda r:r.abort());await page.locator('.guide-static-art img').evaluate("e=>e.src='/missing-source.jpg'");await page.locator('.guide-image-error').wait_for(state='visible')
    check(slug+' selected source survives image error',await page.locator('.guide-reference-source').is_visible() and await page.locator('.guide-reference-source').get_attribute('href')==target['source']);await ctx.close()
   check('no uncaught source-check errors',not errors)
   (out/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},indent=2));print(json.dumps({'passed':len(checks),'errors':errors}),flush=True);await browser.close();return
  for slug in [*b['new_guides'],*representative]:
   if slug in b['new_guides']:
    g=b['new_guides'][slug];first=next(c for c in g['records'] if c['id']==g['first_id']);cards=[first,*[c for c in g['records'] if c['id']!=first['id']]]
   else:
    name=b['upgrades'][slug]['name'];cards=json.loads(subprocess.check_output(['node','-e',"const{raw}=require('./tests/helpers/cards.cjs');const name=process.argv[1],a=raw(1,{name,artist:'Synthetic CTR fixture',rarity:'rare'});console.log(JSON.stringify([a,raw(2,{name,oracle_id:a.oracle_id,artist:'Synthetic CTR fixture',rarity:'rare'})]));",name],text=True))
   for width in [320,390,1280]:
    ctx,page=await context(cards,width);await page.goto(args.base_url+'/card/'+slug+'/');await page.wait_for_selector('.detail-grid',state='attached');await page.wait_for_function("document.querySelector('#printings-status').textContent.includes('English printing')")
    prefix=slug+' '+str(width)
    check(prefix+' H1 and answer early',await page.locator('h1').is_visible() and await page.locator('.hero-copy strong').first.evaluate('e=>e.getBoundingClientRect().top<innerHeight'))
    check(prefix+' no page overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    await page.locator('.guide-static-art img').wait_for();check(prefix+' image load and source identity',await page.locator('.guide-static-art img').evaluate('e=>e.complete&&e.naturalWidth>0') and bool(await page.locator('[data-guide-reference-label]').inner_text()))
    await page.screenshot(path=str(out/(slug+'-'+str(width)+'-hero.png')))
    await page.locator('.guide-primary-cta').focus();await page.keyboard.press('Enter');check(prefix+' keyboard explorer focus',await page.evaluate("document.activeElement.id.endsWith('-printings-heading')"))
    selected=await page.locator('#card-details [data-compare-id]').get_attribute('data-compare-id');await page.locator('#card-details [data-compare-id]').click();await page.locator(f'#ms-print-body [data-compare-id]:not([data-compare-id="{selected}"])').first.click();check(prefix+' two same-identity exact comparisons',await page.locator('.cmp-grid article').count()==2)
    target=cards[-1];await page.goto(args.base_url+'/card/'+slug+'/?printing='+target['id']+'&finish='+target['finishes'][0]);await page.wait_for_selector('.detail-grid',state='attached');check(prefix+' exact URL selection retained',await page.locator('#card-details [data-compare-id]').get_attribute('data-compare-id')==target['id'])
    await ctx.route('**/missing-phase6.jpg',lambda r:r.abort());await page.locator('.guide-static-art img').evaluate("e=>e.src='/missing-phase6.jpg'");await page.locator('.guide-image-error').wait_for(state='visible');check(prefix+' image fallback keeps source',await page.locator('[data-guide-reference-label]').is_visible() and bool(await page.locator('[data-guide-reference-link]').get_attribute('href')))
    await ctx.close()
  # Current cosmic foil presentation and native mouse/touch.
  for width in [320,390,1280]:
   ctx,page=await context([cosmic],width,motion='no-preference',touch=width<600);await page.goto(args.base_url+'/');feature=page.locator('#card-of-the-week');await feature.scroll_into_view_if_needed();await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyPrintingId==='61b28030-6d05-429e-a4eb-fceead3f7b18'")
   await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyArtReady==='true'")
   check(str(width)+' Cosmic Spider-Man exact foil image',await feature.get_attribute('data-weekly-finish')=='foil' and await page.locator('#card-week-image').evaluate('e=>e.complete&&e.naturalWidth>0'))
   check(str(width)+' foil clipped to face and no artwork filter',await feature.locator('.weekly-card-face .weekly-foil-sheen').count()==1 and await page.locator('#card-week-image').evaluate("e=>getComputedStyle(e).filter==='none'"))
   shell=page.locator('#weekly-card-shell');floating=page.locator('.weekly-theme-cosmic .weekly-card-float');check(str(width)+' raised moving presentation',await floating.evaluate("e=>getComputedStyle(e).transform!=='none'&&getComputedStyle(e).animationName==='msCosmicDrift'"))
   await shell.evaluate("e=>e.scrollIntoView({block:'center',inline:'center',behavior:'instant'})");rect=await shell.bounding_box();x=rect['x']+rect['width']*.8;y=rect['y']+rect['height']*.2
   if width<600:
    session=await ctx.new_cdp_session(page);await session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyInteracting==='true'")
    check(str(width)+' restrained native touch tilt',await feature.evaluate("e=>Math.abs(parseFloat(e.style.getPropertyValue('--weekly-rx')))<=6 && Math.abs(parseFloat(e.style.getPropertyValue('--weekly-ry')))<=7"));await session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   else:
    await page.mouse.move(x,y);await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyInteracting==='true'");check('desktop mouse tilt',await feature.evaluate("e=>parseFloat(e.style.getPropertyValue('--weekly-ry'))!==0"));await page.mouse.move(1,1)
   await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyInteracting==='false'")
   check(str(width)+' pointer release resumes presentation',await feature.evaluate("e=>e.dataset.weeklyInteracting==='false'"))
   check(str(width)+' COTW no horizontal overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
   await page.screenshot(path=str(out/('cosmic-'+str(width)+'.png')))
   await page.emulate_media(reduced_motion='reduce');check(str(width)+' reduced motion stops loops keeps depth',await floating.evaluate("e=>getComputedStyle(e).animationName==='none'&&getComputedStyle(e).transform!=='none'"));check(str(width)+' reduced cosmic background static',await page.locator('.weekly-theme-cosmic .weekly-scene').evaluate("e=>getComputedStyle(e,'::after').animationName==='none'"))
   href=await page.locator('#card-week-link').get_attribute('href');check(str(width)+' inspect exact foil link',cosmic['id'] in href and 'finish=foil' in href);await ctx.close()
  ctx,page=await context([cosmic]);await page.goto(args.base_url+'/card/');check('hub 63 entries and latest-first discovery',await page.locator('.hub-guide').count()==63 and 'Latest collector guides' in await page.locator('.hub-group').first.inner_text());search=page.locator('input[type="search"]');await search.fill('Bloodline');check('hub new guide filtering works',await page.locator('.hub-guide:visible').count()==1 and await page.locator('.hub-guide:visible').get_attribute('href')=='/card/bloodline-recollector/');await ctx.close()
  check('no uncaught JavaScript errors',not errors);(out/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'widths':[320,390,1280],'catalogue':'saved live new-guide records; synthetic existing-guide fixtures','images':'optional unmodified downloaded catalogue images, otherwise synthetic pixel'},indent=2));print(json.dumps({'passed':len(checks),'errors':errors}),flush=True);await browser.close()
asyncio.run(main())
