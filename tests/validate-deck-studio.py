"""Focused structural checks. No browser, sockets, network or external packages."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    void = set('area base br col embed hr img input link meta param source track wbr'.split())

    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.stack, self.tags, self.ids = [], [], []
        self.feed(source)
        assert not self.stack, self.stack

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append((tag, a))
        if a.get('id'):
            self.ids.append(a['id'])
        if tag not in self.void:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        assert self.stack and self.stack.pop() == tag, ('Invalid nesting', tag, self.stack)

    def handle_startendtag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


for relative in ['deck/index.html', 'index.html']:
    source = (ROOT / relative).read_text()
    page = Page(source)
    assert len(page.ids) == len(set(page.ids)), 'Duplicate IDs'
    assert sum(tag == 'main' for tag, _ in page.tags) == 1
    for tag, attrs in page.tags:
        for aria in ['aria-labelledby', 'aria-describedby', 'aria-controls']:
            assert all(ref in page.ids for ref in attrs.get(aria, '').split()), (relative, aria, attrs)
        if tag == 'label' and 'for' in attrs:
            assert attrs['for'] in page.ids
        if tag == 'img':
            assert 'alt' in attrs
        for attr in ['src', 'href']:
            value = attrs.get(attr, '')
            url = urlsplit(value)
            if not value or url.scheme or url.netloc:
                continue
            if url.path:
                target = ROOT / url.path.lstrip('/') if url.path.startswith('/') else ROOT / relative / '..' / url.path
                if target.is_dir():
                    target /= 'index.html'
                assert target.exists(), (relative, value)
            elif url.fragment:
                assert url.fragment in page.ids, (relative, value)
    assert any(tag == 'link' and attrs.get('rel') == 'canonical' for tag, attrs in page.tags)
    for block in re.findall(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', source, re.S):
        assert json.loads(block)['@context'] == 'https://schema.org'
    if relative.startswith('deck/'):
        assert any(tag == 'link' and attrs.get('href') == 'https://manascout.co.uk/deck/' and attrs.get('rel') == 'canonical' for tag, attrs in page.tags)
        for field in ['description', 'viewport']:
            assert any(tag == 'meta' and attrs.get('name') == field and attrs.get('content') for tag, attrs in page.tags)
        for required in ['card-preview', 'preview-name', 'preview-id', 'studio-deck', 'studio-discover', 'studio-stats']:
            assert required in page.ids
        for required in ['studio-search', 'deck-format']:
            assert any(attrs.get('id') == required and 'disabled' not in attrs for _, attrs in page.tags)
        assert any(tag == 'dialog' and attrs.get('aria-labelledby') == 'preview-name' for tag, attrs in page.tags)
    print('PASS', relative, 'nesting, unique IDs, labels/ARIA references, local links/assets and JSON-LD')

tree = ET.parse(ROOT / 'sitemap.xml')
urls = [node.text for node in tree.findall('.//{*}loc')]
assert urls.count('https://manascout.co.uk/deck/') == 1
assert len(urls) == len(set(urls))
print('PASS sitemap XML and unique /deck/ entry')

# Check CSS structure and scope without claiming browser layout validation.
css = (ROOT / 'assets/css/deck-studio.css').read_text()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def split_selectors(header):
    depth = 0
    start = 0
    for i, char in enumerate(header):
        if char in '([':
            depth += 1
        elif char in ')]':
            depth -= 1
        elif char == ',' and depth == 0:
            yield header[start:i].strip()
            start = i + 1
    assert depth == 0
    yield header[start:].strip()


def rules(text, keyframes=False):
    position = 0
    while text[position:].strip():
        opening = text.index('{', position)
        header = text[position:opening].strip()
        depth = 1
        end = opening + 1
        while depth and end < len(text):
            depth += (text[end] == '{') - (text[end] == '}')
            end += 1
        assert depth == 0, header
        body = text[opening + 1:end - 1]
        if header.startswith('@media'):
            rules(body)
        elif header.startswith('@keyframes'):
            assert header.split()[1].startswith('ds-')
            rules(body, keyframes=True)
        else:
            assert keyframes or all(s.startswith('.deck-studio') for s in split_selectors(header)), header
            for declaration in body.split(';'):
                if declaration.strip():
                    assert re.match(r'^\s*(--[\w-]+|[a-z-]+)\s*:', declaration), declaration
        position = end


rules(css)
for colour in ['#0D1117', '#151B22', '#9B283A', '#8EA99A', '#EBEDE5']:
    assert colour in css
assert '(max-width: 820px)' in css and '(max-width: 360px)' in css and '(prefers-reduced-motion: reduce)' in css
assert 'minmax(0,' in css and 'safe-area-inset-bottom' in css
print('PASS scoped CSS rules/declarations, approved palette, responsive breakpoints and reduced-motion structure')
print('LIMITATION: static CSS checks do not verify rendering, overflow, touch behaviour or visual quality.')
