"""All production HTML: structure, references, metadata and dependency order. No browser/network claims."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import re
ROOT=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
    void=set('area base br col embed hr img input link meta param source track wbr'.split())
    def __init__(self,text):
        super().__init__(convert_charrefs=True);self.tags=[];self.stack=[];self.feed(text);assert not self.stack,self.stack
    def handle_starttag(self,tag,attrs):
        self.tags.append((tag,dict(attrs)))
        if tag not in self.void:self.stack.append(tag)
    def handle_endtag(self,tag):
        assert self.stack and self.stack.pop()==tag,('Invalid nesting',tag,self.stack)
    def handle_startendtag(self,tag,attrs):self.tags.append((tag,dict(attrs)))
pages={f:Page(f.read_text()) for f in ROOT.rglob('*.html') if '.git' not in f.parts and not f.read_text().startswith('google-site-verification:')}
for path,page in pages.items():
    ids=[a['id'] for _,a in page.tags if a.get('id')];assert len(ids)==len(set(ids)),path
    for tag,a in page.tags:
        for key in ['aria-labelledby','aria-describedby','aria-controls']+(['for'] if tag=='label' else []):
            assert all(ref in ids for ref in a.get(key,'').split()),(path,key,a)
        if tag=='a' and a.get('target')=='_blank':assert {'noopener','noreferrer'}<=set(a.get('rel','').split()),(path,a)
        for key in ['href','src']:
            value=a.get(key,'');u=urlsplit(value)
            if not value or u.scheme or u.netloc:continue
            target=(ROOT/unquote(u.path.lstrip('/')) if u.path.startswith('/') else path.parent/unquote(u.path)) if u.path else path
            if target.is_dir():target/='index.html'
            target=target.resolve();assert target.is_file(),(path,value)
            if u.fragment and target in pages:assert unquote(u.fragment) in [a.get('id') for _,a in pages[target].tags],(path,value,'fragment')
    source=path.read_text()
    assert len(re.findall(r'<title\b',source,re.I))==1,path
    if path.name != '404.html':assert len([a for t,a in page.tags if t=='link' and a.get('rel')=='canonical'])==1,path
    assert len([a for t,a in page.tags if t=='meta' and a.get('name')=='description'])==1,path
    for block in re.findall(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',source,re.S):json.loads(block)
    scripts=[urlsplit(a['src']).path.rsplit('/',1)[-1] for t,a in page.tags if t=='script' and a.get('src')]
    if 'card-page.js' in scripts:assert scripts.index('app.js')<scripts.index('card-page.js'),path
    if 'deck-studio.js' in scripts:
        deps=['deck-formats.js','deck-data.js','deck-model.js','deck-client.js','deck-rules.js','deck-view.js','deck-store.js','deck-identity.js','deck-health.js','deck-generator.js','deck-printings.js','deck-printing-selector.js','deck-studio.js']
        assert all(s in scripts for s in deps) and [scripts.index(s) for s in deps]==sorted(scripts.index(s) for s in deps),path
for name in ['deck-studio.js','deck-printing-selector.js']:
    refs=set(re.findall(r'\$\("([a-z0-9-]+)"\)',(ROOT/'assets/js'/name).read_text()))
    ids={a.get('id') for _,a in pages[ROOT/'deck/index.html'].tags};assert refs<=ids,(name,refs-ids)
for path in (ROOT/'assets/css').glob('*.css'):
    source=re.sub(r'/\*.*?\*/','',path.read_text(),flags=re.S)
    source=re.sub(r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'','',source)
    stack=[];pairs={'}':'{',')':'(',']':'['}
    for c in source:
        if c in '{([':stack.append(c)
        if c in '})]':assert stack and stack.pop()==pairs[c],path
    assert not stack,path
print(f'PASS {len(pages)} production HTML pages: nesting, unique IDs, ARIA/fragments/links, metadata, JSON-LD and script dependencies')
print('PASS Deck Studio literal DOM references and all CSS delimiter integrity')
print('LIMITATION: native rendering, accessibility interactions and external-link reachability require browser/live checks.')
