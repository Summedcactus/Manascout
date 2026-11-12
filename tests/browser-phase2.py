"""Native Phase 2 journeys; deterministic exact catalogue failures plus live guide coverage."""
import argparse,json,asyncio
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 p=argparse.ArgumentParser();p.add_argument('--output',default='/tmp/manascout-phase2');args=p.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True);checks=[]
 def check(name,ok):
  assert ok,name
  checks.append(name)
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  ctx=await browser.new_context(ignore_https_errors=True,accept_downloads=True,reduced_motion='reduce');page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  # Explicit synthetic catalogue fixtures keep the new UI checks deterministic.
  # The separate Phase 1 suite exercises live API/card and guide handoffs.
  cards=[dict(id=f'0000000{i}-1111-4111-8111-111111111111',oracle_id='00000009-1111-4111-8111-111111111111',name='Sol Ring',set='test',set_name=f'Test set {i}',collector_number=str(i),lang='en',artist='Test fixture',finishes=['foil','nonfoil'],games=['paper'],released_at='2020-01-01',rarity='rare',type_line='Artifact',prices={'usd_foil':'2.10'},image_uris={'normal':'https://cards.scryfall.io/normal/front/0/0/test.jpg'},legalities={},frame='2015') for i in range(1,5)]
  async def catalogue(route):
   u=route.request.url
   payload={'object':'list','data':cards,'has_more':False} if '/cards/search' in u else next((c for c in cards if c['id'] in u),cards[0])
   await route.fulfill(json=payload)
  await ctx.route('https://api.scryfall.com/**',catalogue)
  await ctx.route('https://api.frankfurter.dev/**',lambda r:r.abort())
  await page.goto('http://127.0.0.1:8765/?q=Sol%20Ring');await page.wait_for_selector('.detail-grid',timeout=60000);await page.wait_for_function("document.querySelector('#printings-status')?.textContent.includes('matching records')",timeout=60000)
  await page.locator('#card-details [data-compare-id]').click();check('homepage first selection reveals comparison',await page.locator('.cmp-grid article').count()==1)
  await page.locator('#ms-print-body [data-compare-id]').nth(1).click();check('catalogue second selection',await page.locator('.cmp-grid article').count()==2)
  await page.locator('#card-details [data-compare-id]').click();check('duplicate rejected retaining selections','already selected' in await page.locator('.cmp-status').inner_text())
  await page.locator('[data-ms-selected-finish]').select_option('nonfoil');await page.locator('#card-details [data-compare-id]').click();check('same edition different finishes',await page.locator('.cmp-grid article').count()==3)
  await page.locator('#ms-print-body [data-compare-id]').nth(2).click();check('four selected readable cards',await page.locator('.cmp-grid article').count()==4)
  await page.locator('#ms-print-body [data-compare-id]').nth(3).click();check('limit explained without clearing','Four versions' in await page.locator('.cmp-status').inner_text() and await page.locator('.cmp-grid article').count()==4)
  await page.set_viewport_size({'width':320,'height':900});check('four cards no mobile overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await page.screenshot(path=str(out/'four-comparison-320.png'),full_page=True)
  await page.locator('[data-remove]').last.click();await page.locator('[data-remove]').last.click()
  await page.evaluate("localStorage.setItem('manascout.deckstudio.v1.phase2-sentinel','deck data unchanged')")
  await page.locator('.cmp-current details summary').click();await page.locator('.cmp-name').fill('Native comparison');await page.get_by_role('button',name='Save in this browser',exact=True).click()
  await page.locator('.cmp-library summary').click();check('named comparison saved',await page.locator('[data-open]').count()==1)
  async with page.expect_download() as dl:await page.get_by_role('button',name='Export JSON',exact=True).click()
  path=await (await dl.value).path();raw=Path(path).read_text();data=json.loads(raw);check('JSON exact identities/finishes',len(data['items'])==2 and all(x['id'] and x['finish'] for x in data['items']))
  async with page.expect_download() as dl:await page.get_by_role('button',name='Export CSV',exact=True).click()
  check('CSV download qualification','not a delivered shop quote' in Path(await (await dl.value).path()).read_text())
  await page.reload();await page.wait_for_selector('.cmp-library summary');await page.locator('.cmp-library summary').click();await page.locator('[data-open]').click();await page.wait_for_function("document.querySelector('.cmp-status').textContent.startsWith('Comparison opened')",timeout=60000)
  check('reload reopens and refreshes exact records',await page.locator('.cmp-grid article').count()==2 and await page.locator('.cmp-grid').inner_text()!= '')
  await page.locator('.cmp-file').set_input_files({'name':'comparison.json','mimeType':'application/json','buffer':raw.encode()});check('import preview before mutation',await page.locator('.cmp-preview').is_visible() and await page.locator('[data-open]').count()==1)
  await page.get_by_role('button',name='Cancel',exact=True).click();check('import cancel retains saved/current',await page.locator('[data-open]').count()==1 and await page.locator('.cmp-grid article').count()==2)
  await page.locator('.cmp-file').set_input_files({'name':'comparison.json','mimeType':'application/json','buffer':raw.encode()});await page.get_by_role('button',name='Import and open',exact=True).click();await page.wait_for_function("document.querySelector('.cmp-status').textContent.startsWith('Comparison opened')",timeout=60000);check('import adds without overwrite',await page.locator('[data-open]').count()==2)
  await page.locator('[data-saved-name="0"]').fill('Renamed');await page.locator('[data-rename="0"]').click();check('rename',await page.locator('[data-saved-name="0"]').input_value()=='Renamed')
  await page.locator('[data-delete="1"]').click();check('delete one saved entry',await page.locator('[data-open]').count()==1)
  await page.locator('[data-remove]').first.focus();await page.keyboard.press('Enter');check('keyboard removal focus returns',await page.locator('.cmp-grid article').count()==1 and await page.locator('[data-remove]').evaluate('(e)=>e===document.activeElement'))
  for width in [320,390,1280]:
   await page.set_viewport_size({'width':width,'height':900});check(f'no page overflow at {width}',await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await page.screenshot(path=str(out/f'comparison-{width}.png'),full_page=True)
  check('reduced motion static comparison',await page.locator('.cmp-grid img').first.evaluate("e=>getComputedStyle(e).animationName==='none'"))
  # Exact API failure on reopen retains selected IDs. No named fallback permitted.
  await ctx.route('https://api.scryfall.com/cards/*',lambda r:r.abort());await page.locator('[data-open]').click();await page.wait_for_function("document.querySelector('.cmp-status').textContent.startsWith('Comparison opened')",timeout=60000)
  check('API failure cached exact records preserved',await page.locator('.cmp-grid article').count()==2 and 'No substitute selected' in await page.locator('.cmp-grid').inner_text())
  await page.locator('.cmp-grid img').first.evaluate("e=>e.dispatchEvent(new Event('error'))");check('image failure retains textual identity',await page.locator('.cmp-image-fallback').first.is_visible() and 'Catalogue UUID' in await page.locator('.cmp-grid').inner_text())
  await ctx.unroute('https://api.scryfall.com/cards/*')
  await page.goto('http://127.0.0.1:8765/card/sol-ring/');await page.wait_for_selector('.detail-grid',timeout=60000);await page.locator('#card-details [data-compare-id]').click();check('permanent guide comparison',await page.locator('.cmp-grid article').count()==1)
  check('existing deck handoff',await page.locator('#card-details a[href^="/deck/"]').count()>0)
  # Restricted storage is isolated; current comparison remains usable.
  restricted=await browser.new_context(ignore_https_errors=True);await restricted.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('restricted')}})");await restricted.route('https://api.scryfall.com/**',catalogue);await restricted.route('https://api.frankfurter.dev/**',lambda r:r.abort());p2=await restricted.new_page();await p2.goto('http://127.0.0.1:8765/card/sol-ring/');await p2.wait_for_selector('.detail-grid',timeout=60000);await p2.locator('#card-details [data-compare-id]').click();check('restricted storage in-memory operation',await p2.locator('.cmp-grid article').count()==1)
  check('deck namespace untouched',await page.evaluate("localStorage.getItem('manascout.deckstudio.v1.phase2-sentinel')==='deck data unchanged'"))
  check('no uncaught page errors',not errors)
  (out/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},indent=2));print(json.dumps({'passed':len(checks),'errors':errors}),flush=True);await browser.close()
asyncio.run(main())
