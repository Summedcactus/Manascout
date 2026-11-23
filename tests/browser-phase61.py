"""Local fixtures under a mocked canonical origin. All Plausible calls intercepted;
never sends test traffic to production. Current card uses saved verified record.
"""
import argparse,asyncio,json,mimetypes,subprocess,base64
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',default='/tmp/manascout-phase61');ap.add_argument('--no-sandbox',action='store_true');ap.add_argument('--chromium',default='/usr/bin/chromium');args=ap.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
 def check(name,ok):checks.append({'check':name,'passed':bool(ok)});print(json.dumps(checks[-1]),flush=True);assert ok,name
 # This record is the same checked catalogue snapshot used by Phase 6 tests.
 cotw=json.loads((ROOT/'tests/fixtures/cosmic-spider-man.json').read_text())
 old=json.loads(subprocess.check_output(['node','-e',"const{raw}=require('./tests/helpers/cards.cjs');console.log(JSON.stringify(raw(777,{name:'Synthetic existing card'})));"],cwd=ROOT,text=True))
 seed=json.loads(subprocess.check_output(['node','-e',"const{MemoryStorage}=require('./tests/helpers/memory-storage.cjs'),{card}=require('./tests/helpers/cards.cjs'),m=require('./assets/js/deck-model.js'),p=require('./assets/js/deck-store.js');const storage=new MemoryStorage();const deck=m.add(m.createDeck({name:'Private existing draft',format:'modern'}),card(777,{name:'Synthetic existing card'}),{quantity:3,finish:'nonfoil'});p.createStore({storage}).save(deck);console.log(JSON.stringify({id:deck.id,values:Object.fromEntries(storage.values)}));"],cwd=ROOT,text=True))
 pixel=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
 async with async_playwright()as pw:
  browser=await pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox']if args.no_sandbox else [])
  async def context(width=1280,enabled=True,failed=False,existing=False,cards=None):
   ctx=await browser.new_context(viewport={'width':width,'height':900},has_touch=width<800,is_mobile=width<800,reduced_motion='no-preference',accept_downloads=True);requests=[];records=cards or[cotw,old]
   if existing:await ctx.add_init_script('for(const [k,v]of Object.entries('+json.dumps(seed['values'])+'))localStorage.setItem(k,v);')
   async def route(r):
    u=urlsplit(r.request.url);q=parse_qs(u.query);path=u.path
    if u.hostname=='plausible.io':
     requests.append(json.loads(r.request.post_data));await r.abort()if failed else await r.fulfill(status=202,body='{}',headers={'Access-Control-Allow-Origin':'https://manascout.co.uk'});return
    if u.hostname=='manascout.co.uk':
     if path=='/assets/js/analytics-config.js'and enabled:await r.fulfill(body="window.ManaScoutAnalyticsConfig=Object.freeze({enabled:true,provider:'plausible',domain:'manascout.co.uk',debug:false});",content_type='application/javascript');return
     file=(ROOT/path.lstrip('/')).resolve();file=file/'index.html'if path.endswith('/')else file
     if not file.is_relative_to(ROOT)or not file.is_file():await r.fulfill(status=404,body='Not found');return
     await r.fulfill(path=str(file));return
    if u.hostname=='cards.scryfall.io':
     photo=Path('/workspace/work/phase6/cosmic-spider-man.jpg');real=cotw['id']in path and photo.exists();await r.fulfill(body=photo.read_bytes()if real else pixel,content_type='image/jpeg'if real else'image/png');return
    if u.hostname=='api.scryfall.com':
     if path=='/cards/spm/271':payload=cotw
     elif path=='/cards/collection':
      ids=[c['id']for c in json.loads(r.request.post_data)['identifiers']];payload={'data':[c for c in records if c['id']in ids],'not_found':[]}
     elif path=='/cards/search':
      query=q.get('q',[''])[0];oid=query.split('oracleid:',1)[1].split()[0]if'oracleid:'in query else''
      data=[c for c in records if c.get('oracle_id')==oid]if oid else records
      payload={'object':'list','data':data,'has_more':False,'total_cards':len(data)}
     elif path=='/cards/autocomplete':payload={'data':[c['name']for c in records]}
     else:payload=next((c for c in records if c['id']in path),records[0])
     await r.fulfill(json=payload);return
    await r.abort()
   await ctx.route('**/*',route);p=await ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.on('dialog',lambda d:d.accept()if d.type=='beforeunload'else d.dismiss());return ctx,p,requests
  for width in [320,390,768,1280]:
   ctx,p,requests=await context(width,existing=True);await p.goto('https://manascout.co.uk/');f=p.locator('#card-of-the-week');await f.scroll_into_view_if_needed();await p.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyPrintingId==='61b28030-6d05-429e-a4eb-fceead3f7b18'")
   check(str(width)+' heading and subtitle',await p.locator('#weekly-heading').inner_text()=='Cosmic Spider-Man in zero gravity'and'An extended-art foil from Marvel’s Spider-Man and a five-colour commander for Spider decks.'in await p.locator('#scoutboard-panel-weekly').inner_text())
   check(str(width)+' foil scoped to face',await f.locator('.weekly-card-face .weekly-foil-sheen').count()==1)
   build=f.get_by_role('link',name='Build a deck with Cosmic Spider-Man',exact=True);inspect=f.get_by_role('link',name='Inspect exact printing',exact=True);href=await build.get_attribute('href');params=parse_qs(urlsplit(href).query)
   check(str(width)+' exact bounded handoff',all(params.get(k)==[v]for k,v in{'card':cotw['name'],'printing':cotw['id'],'set':'spm','number':'271','finish':'foil','source':'cotw','intent':'commander'}.items()))
   check(str(width)+' distinct comfortable actions',await build.evaluate('e=>e.getBoundingClientRect().height>=44')and await inspect.evaluate('e=>e.getBoundingClientRect().height>=44'))
   check(str(width)+' no homepage overflow',await p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
   await build.focus();check(str(width)+' native focus on primary',await build.evaluate('e=>document.activeElement===e'));await p.screenshot(path=str(out/('cotw-'+str(width)+'.png')))
   if width in[320,768]:await p.keyboard.press('Enter')
   else:await build.click()
   await p.wait_for_url('**/deck/**');await p.wait_for_function("document.querySelector('#preview-id').textContent!=='' || document.querySelector('#selection-error-message').textContent!==''");await p.locator('#preview-new-commander').wait_for(state='visible');await p.wait_for_function("!document.querySelector('#preview-new-commander').disabled")
   check(str(width)+' exact foil preview',await p.locator('#preview-id').text_content()==cotw['id']and'SPM #271'in await p.locator('#preview-printing').text_content()and await p.locator('#preview-finish').text_content()=='Foil')
   check(str(width)+' clear build-around arrival','Build around Cosmic Spider-Man'in await p.locator('#preview-start-context').inner_text())
   check(str(width)+' unrelated deck untouched on arrival',await p.locator('#deck-format').input_value()=='modern'and(await p.locator('#deck-count').inner_text()).startswith('3 /'))
   await p.locator('#close-preview').click()
   check(str(width)+' selected artwork remains in a populated workspace',await p.locator('#inspiration-image').is_visible())
   await p.locator('#inspiration button').click()
   await p.locator('#preview-new-commander').click();await p.wait_for_function("document.querySelector('#deck-count').textContent.startsWith('1 / 100')")
   check(str(width)+' deliberate new Commander draft',await p.locator('#deck-format').input_value()=='commander'and await p.locator('[data-zone="commander"] .ds-deck-entry').count()==1)
   await p.locator('#save-deck').click();await p.wait_for_function("document.querySelector('#save-status-message').textContent.includes('Saved')")
   check(str(width)+' previous saved entries retained',await p.evaluate("id=>window.ManaScoutDeckStore.createStore({storage:localStorage}).load(id).deck.entries[0].quantity===3",seed['id']))
   await p.wait_for_function("document.querySelector('#deck-format').value==='commander'");await p.wait_for_timeout(30)
   starts=[e for e in requests if e['name']=='COTW Deck Start'];opens=[e for e in requests if e['name']=='Deck Studio Open']
   check(str(width)+' exactly one click and open event',len(starts)==1 and starts[0]['props']=={'week':9,'exact_printing':True,'commander_seeded':True}and len(opens)==1 and opens[0]['props']=={'source':'cotw'})
   check(str(width)+' sensitive state excluded',not any(secret in json.dumps(requests)for secret in[cotw['id'],'Private existing draft','Cosmic Spider-Man','?printing=','#compare']))
   check(str(width)+' studio no horizontal overflow',await p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await ctx.close()
  sol=json.loads(subprocess.check_output(['node','-e',"const{raw}=require('./tests/helpers/cards.cjs');console.log(JSON.stringify(raw(1,{name:'Sol Ring'})));"],cwd=ROOT,text=True))
  ctx,p,requests=await context(cards=[sol]);await p.goto('https://manascout.co.uk/card/sol-ring/');await p.wait_for_selector('.detail-grid',state='attached');await p.locator('#card-details [data-build-deck]').click();await p.wait_for_url('**/deck/**');await p.wait_for_function("document.querySelector('#preview-id').textContent!==''");await p.wait_for_timeout(30)
  check('guide action carries bounded slug once',len([e for e in requests if e['name']=='Guide Deck Start'])==1 and next(e for e in requests if e['name']=='Guide Deck Start')['props']=={'guide':'sol-ring','commander_seeded':False})
  check('guide source arrives once in studio',len([e for e in requests if e['name']=='Deck Studio Open'])==1 and next(e for e in requests if e['name']=='Deck Studio Open')['props']=={'source':'guide'})
  check('guide preview does not create deck entries',await p.locator('.ds-deck-entry').count()==0);await ctx.close()
  ctx,p,requests=await context(390);await p.goto('https://manascout.co.uk/');inspect=p.get_by_role('link',name='Inspect exact printing',exact=True);await inspect.focus();await p.keyboard.press('Enter');await p.wait_for_selector('.detail-grid',state='attached')
  check('inspect keyboard exactly once',len([e for e in requests if e['name']=='COTW Inspect'])==1)
  check('inspect exact SPM foil selected',await p.locator('#card-details [data-compare-id]').get_attribute('data-compare-id')==cotw['id']and await p.evaluate("id=>ManaScout.comparison.finish(ManaScout.comparison.card(id))==='foil'",cotw['id']))
  check('inspection pageview canonicalises search/UUID state',all(e['url']=='https://manascout.co.uk/'for e in requests));await ctx.close()
  for enabled,failed,label in[(False,False,'disabled'),(True,True,'network failure')]:
   ctx,p,requests=await context(768,enabled=enabled,failed=failed);await p.goto('https://manascout.co.uk/');await p.get_by_role('link',name='Build a deck with Cosmic Spider-Man',exact=True).click();await p.wait_for_url('**/deck/**');await p.wait_for_selector('#preview-id',state='attached');await p.wait_for_function("document.querySelector('#preview-id').textContent==='61b28030-6d05-429e-a4eb-fceead3f7b18'")
   check(label+' analytics never blocks navigation',await p.locator('#preview-id').text_content()==cotw['id'])
   if not enabled:check('disabled has zero analytics requests',len(requests)==0)
   await ctx.close()
  # Native touch and reduced-motion preserve foil physical geometry.
  ctx,p,requests=await context(390);await p.goto('https://manascout.co.uk/');shell=p.locator('#weekly-card-shell');await shell.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");rect=await shell.bounding_box();session=await ctx.new_cdp_session(p);await session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':rect['x']+rect['width']*.7,'y':rect['y']+rect['height']*.3}]});await p.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyInteracting==='true'");check('touch retains restrained tilt',await p.locator('#card-of-the-week').evaluate("e=>Math.abs(parseFloat(e.style.getPropertyValue('--weekly-rx')))<=6&&Math.abs(parseFloat(e.style.getPropertyValue('--weekly-ry')))<=7"));await session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});await p.emulate_media(reduced_motion='reduce');check('reduced motion stops loops retains depth',await p.locator('.weekly-physical .weekly-card-float').evaluate("e=>getComputedStyle(e).animationName==='none'&&getComputedStyle(e).transform!=='none'"));await ctx.close()
  check('no uncaught JavaScript errors',not errors);(out/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'widths':[320,390,768,1280],'provider':'all requests intercepted, canonical host mocked, no production traffic'},indent=2));print(json.dumps({'passed':len(checks),'errors':errors}),flush=True);await browser.close()
asyncio.run(main())
