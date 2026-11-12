from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlencode,urlsplit,parse_qs
import json,time,argparse,shutil
parser=argparse.ArgumentParser(description='Optional native Phase 1 smoke checks; requires Playwright, Chromium and live Scryfall access.')
parser.add_argument('--base-url',default='http://127.0.0.1:8765')
parser.add_argument('--output',default='/tmp/manascout-phase1-browser')
parser.add_argument('--chromium',default=shutil.which('chromium'))
parser.add_argument('--no-sandbox',action='store_true')
parser.add_argument('--ignore-https-errors',action='store_true',help='For a known test proxy only; does not change the production site.')
args=parser.parse_args()
BASE=args.base_url.rstrip('/')
OUT=Path(args.output);OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,condition,**extra):
 row=dict(check=name,passed=bool(condition),**extra);checks.append(row);print(json.dumps(row),flush=True)
 if not condition:raise AssertionError(name)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=args.chromium,args=['--no-sandbox'] if args.no_sandbox else [])
 ctx=b.new_context(viewport={'width':390,'height':844},ignore_https_errors=args.ignore_https_errors)
 page=ctx.new_page();page.set_default_timeout(20000);errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def go(path):page.goto(BASE+path,wait_until='domcontentloaded',timeout=30000)
 def loaded():page.wait_for_function('document.querySelector("#card-details .detail-grid") !== null && document.querySelector("#printings-status")?.textContent.includes("matching records")')
 try:
  go('/');page.locator('#search-input').fill('Sol R')
  page.locator('.autocomplete-item').first.wait_for();check('homepage autocomplete',page.locator('.autocomplete-item').count()>0)
  page.locator('#search-input').press('ArrowDown');page.locator('#search-input').press('Enter');loaded()
  guide=page.locator('#card-details .manascout-guide-link a[href^="/card/"]');guide.wait_for()
  before=parse_qs(urlsplit(page.url).query);href=guide.get_attribute('href');expected=parse_qs(urlsplit(href).query)
  check('search guide link keeps exact printing and finish',before.get('printing')==expected.get('printing') and before.get('finish')==expected.get('finish'))
  guide.click();page.wait_for_url('**/card/sol-ring/**');loaded()
  check('guide loads selected printing and finish',parse_qs(urlsplit(page.url).query)==expected)
  check('one shared guide navigation',page.locator('.guide-jump-links').count()==1 and page.locator('#ms-guide-toolbar').count()==1)
  page.go_back(wait_until='domcontentloaded');loaded();check('browser back restores exact search selection',parse_qs(urlsplit(page.url).query).get('printing')==expected['printing'])
  page.go_forward(wait_until='domcontentloaded');loaded();check('browser forward restores exact guide selection',parse_qs(urlsplit(page.url).query).get('printing')==expected['printing'])
  page.reload(wait_until='domcontentloaded');loaded();check('direct-link reload retains finish',parse_qs(urlsplit(page.url).query).get('finish')==expected['finish'])
  page.locator('#guide-search-toggle').click();page.wait_for_function('document.activeElement?.id === "guide-card-search"');check('guide search focuses input',page.locator('#guide-card-search').evaluate('(e)=>e===document.activeElement'))
  page.locator('#guide-card-search').press('Escape');check('Escape closes search and returns focus',page.locator('#guide-search-panel').is_hidden() and page.locator('#guide-search-toggle').evaluate('(e)=>e===document.activeElement'))
  page.locator('#guide-search-toggle').click();page.locator('#guide-card-search').fill('Lightning Bolt');page.locator('#guide-card-search').press('Enter');page.wait_for_url('**/card/lightning-bolt/**');loaded()
  check('guide search uses authoritative known route',urlsplit(page.url).path=='/card/lightning-bolt/')
  go('/?q=Sheoldred%2C+the+Apocalypse');loaded();page.wait_for_function('document.querySelector("#printings-status").textContent.includes("matching records")')
  check('card without guide remains usable',urlsplit(page.url).path=='/' and page.locator('#card-details .manascout-guide-link a[href^="/card/"]').count()==0)
  advanced=page.locator('.ms-archive-options');check('advanced filters initially collapsed',not advanced.evaluate('(e)=>e.open'))
  advanced.locator('summary').press('Enter');check('advanced filters keyboard accessible',advanced.evaluate('(e)=>e.open') and page.locator('#ms-print-lang').is_visible())
  check('language/edition and reference labels', 'set/number pairs' in page.locator('#printings-status').inner_text() and 'Nonfoil reference' in page.locator('#printings-container').text_content())
  # Explicit multilingual deep link: use an actual current Scryfall record.
  response=page.evaluate('''async url=>{const r=await fetch(url);return {ok:r.ok,status:r.status,data:await r.json()}}''','https://api.scryfall.com/cards/search?'+urlencode({'q':'!"Sol Ring" lang:de game:paper','unique':'prints'}))
  check('live foreign-language catalogue lookup',response['ok'],status=response['status'])
  foreign=response['data']['data'][0];finish=foreign['finishes'][0]
  go('/card/sol-ring/?'+urlencode({'printing':foreign['id'],'finish':finish}));loaded()
  check('explicit foreign printing remains selected',parse_qs(urlsplit(page.url).query).get('printing')==[foreign['id']] and 'German' in page.locator('#card-details').inner_text())
  check('explicit finish remains selected',parse_qs(urlsplit(page.url).query).get('finish')==[finish])
  check('overview reflects selected language and edition','German' in page.locator('[data-guide-reference-label]').inner_text() and foreign['id'] in page.locator('[data-guide-reference] img').get_attribute('src'))
  build=page.locator('#card-details a[data-build-deck]');handoff=parse_qs(urlsplit(build.get_attribute('href')).query)
  check('deck handoff retains exact edition and finish',handoff['printing']==[foreign['id']] and handoff['finish']==[finish])
  build.click();page.wait_for_url('**/deck/**');page.locator('#preview-add:not([disabled])').wait_for()
  check('deck handoff is preview, not automatic add','0 / 100' in page.locator('#studio-deck').inner_text())
  page.locator('#preview-add').click();page.wait_for_timeout(1100)
  if page.locator('#card-preview').evaluate('(e)=>e.open'):page.locator('#close-preview').click()
  page.reload(wait_until='domcontentloaded');page.wait_for_timeout(1500)
  check('deck draft survives save and reload','1 / 100' in page.locator('#studio-deck').inner_text())
  page.locator('[data-panel=stats]').click()
  with page.expect_download() as d:page.locator('#download-backup').click()
  d.value.save_as(str(OUT/'deck-backup.json'));backup=json.loads((OUT/'deck-backup.json').read_text())
  check('JSON backup preserves exact printing/finish',any(e['printingId']==foreign['id'] and e['finish']==finish for e in backup['deck']['entries']))
  # Fail live card requests and inspect several guide structures at mobile and desktop widths.
  offline=b.new_context(viewport={'width':390,'height':844},ignore_https_errors=args.ignore_https_errors,reduced_motion='reduce')
  offline.route('https://api.scryfall.com/**',lambda route:route.abort())
  op=offline.new_page();op.on('pageerror',lambda e:errors.append(str(e)))
  for width in [320,390,1280]:
   op.set_viewport_size({'width':width,'height':900 if width>600 else 844})
   for slug in ['ancient-tomb','mr-spock-science-officer','sol-ring','the-theorist-jace-beleren','counterspell']:
    op.goto(BASE+'/card/'+slug+'/',wait_until='domcontentloaded');op.locator('.ms-guide-error').wait_for()
    check('failed API retains written guide and reference',op.locator('[data-guide-static]').count()==1 and op.locator('main h1').count()==1 and op.locator('main .printings-table tbody tr').count()>0,width=width,slug=slug)
    check('page stays within viewport',not op.evaluate('document.documentElement.scrollWidth>innerWidth'),width=width,slug=slug)
    boxes=op.locator('.site-header a:visible, .site-header button:visible').evaluate_all('(els)=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right}})')
    check('header controls fit viewport',all(x['x']>=0 and x['right']<=width for x in boxes),width=width,slug=slug)
    if width in [390,1280] and slug in ['ancient-tomb','mr-spock-science-officer']:
     op.wait_for_function('document.querySelector(".guide-static-art img").complete',timeout=12000)
     op.screenshot(path=str(OUT/(slug+'-'+str(width)+'.png')),animations='disabled')
  op.locator('.guide-skip').focus();op.locator('.guide-skip').press('Enter');check('skip link focuses guide main',op.evaluate('document.activeElement?.id==="guide-main"'))
  check('reduced motion preference honoured',op.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'))
  # JavaScript-disabled rendering must also retain the written content and reference.
  plain=b.new_context(java_script_enabled=False,viewport={'width':390,'height':844},ignore_https_errors=args.ignore_https_errors)
  pp=plain.new_page();pp.goto(BASE+'/card/ancient-tomb/',wait_until='domcontentloaded')
  check('guide useful without JavaScript',pp.locator('[data-guide-static]').count()==1 and pp.locator('.printings-table tbody tr').count()>0)
  check('no uncaught browser errors',not errors,errors=errors)
 except Exception as e:
  checks.append({'check':'browser suite completion','passed':False,'error':str(e),'errors':errors});print(json.dumps(checks[-1]),flush=True)
 finally:
  (OUT/'report.json').write_text(json.dumps(checks,indent=2));b.close()
if not all(c['passed'] for c in checks):raise SystemExit(1)
