"""Focused guide/directory validation; syntax and structure only, never a browser claim.
Pass additional card/.../index.html paths to reuse this for a later guide batch.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ['card/captain-jean-luc-picard/index.html', 'card/mr-spock-science-officer/index.html'] + [
    'card/mox-diamond/index.html',
    'card/gaeas-cradle/index.html',
    'card/grim-monolith/index.html',
    'card/cavern-of-souls/index.html',
    'card/rhystic-study/index.html',
    'card/black-lotus/index.html',
    'card/mana-crypt/index.html',
    'card/jace-the-mind-sculptor/index.html',
    'card/lightning-bolt/index.html',
    'card/ancient-tomb/index.html',
]


class Page(HTMLParser):
    void = set('area base br col embed hr img input link meta param source track wbr'.split())

    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.stack, self.tags, self.ids = [], [], []
        self.feed(text)
        assert not self.stack, self.stack

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag not in self.void:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        assert self.stack and self.stack.pop() == tag, ('Invalid nesting', tag, self.stack)

    def handle_startendtag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


def validate(relative):
    file = ROOT / relative
    text = file.read_text()
    page = Page(text)
    assert len(page.ids) == len(set(page.ids)), ('Duplicate IDs', relative)
    assert sum(tag == 'h1' for tag, _ in page.tags) == 1
    assert sum(tag == 'main' for tag, _ in page.tags) == 1
    for tag, attrs in page.tags:
        for field in ['aria-labelledby', 'aria-describedby', 'aria-controls']:
            assert all(ref in page.ids for ref in attrs.get(field, '').split()), (relative, attrs)
        if tag == 'label' and 'for' in attrs:
            assert attrs['for'] in page.ids
        if tag == 'img':
            assert 'alt' in attrs
        for field in ['href', 'src']:
            value = attrs.get(field, '')
            u = urlsplit(value)
            if not value or u.scheme or u.netloc:
                continue
            dest = (ROOT / u.path.lstrip('/')) if u.path.startswith('/') else file.parent / u.path if u.path else file
            if dest.is_dir():
                dest /= 'index.html'
            assert dest.exists(), (relative, value)
            if dest == file and u.fragment:
                assert u.fragment in page.ids, (relative, value)
    for attrs, code in re.findall(r'<script\b([^>]*)>(.*?)</script>', text, re.S):
        if 'application/ld+json' in attrs:
            assert json.loads(code)['@context'] == 'https://schema.org'
        elif 'src=' not in attrs and code.strip():
            subprocess.run(['node', '--check'], input=code, text=True, check=True, capture_output=True)
    if relative != 'card/index.html':
        for required in ['card-details', 'printings-status', 'printings-container', 'guide-search-toggle', 'guide-search-form']:
            assert page.ids.count(required) == 1
        assert any(tag == 'body' and attrs.get('data-card-name') for tag, attrs in page.tags)
        assert any(tag == 'table' and attrs.get('class') == 'printings-table' for tag, attrs in page.tags)
        assert any(attrs.get('role') == 'region' and attrs.get('tabindex') == '0' for _, attrs in page.tags)
    print('PASS', relative, 'HTML/ARIA/fragments/local links/JSON-LD/inline JavaScript')


if __name__ == '__main__':
    for relative in (sys.argv[1:] or DEFAULT) + ['card/index.html']:
        validate(relative)
