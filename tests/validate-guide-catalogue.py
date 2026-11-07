"""All-guide catalogue audit and negative sitemap regressions; no live/browser claims."""
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse
import json
import re
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://manascout.co.uk'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}


def check_sitemap(xml, expected, as_of):
    root = ET.fromstring(xml)
    assert root.tag == '{' + NS['s'] + '}urlset', 'Wrong sitemap root/namespace'
    entries = root.findall('s:url', NS)
    assert len(entries) == len(expected), 'Unexpected URL count'
    found = {}
    for entry in entries:
        loc = entry.findall('s:loc', NS)
        lastmod = entry.findall('s:lastmod', NS)
        assert len(loc) == 1, 'Every URL needs exactly one loc'
        assert len(lastmod) == 1, 'Every URL needs exactly one lastmod'
        url, day = loc[0].text or '', lastmod[0].text or ''
        assert url not in found, 'Duplicate URL'
        assert re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', day), 'Date must be YYYY-MM-DD'
        assert date.fromisoformat(day) <= as_of, 'Future lastmod'
        assert not entry.findall('s:changefreq', NS) and not entry.findall('s:priority', NS), 'No speculative crawl hints'
        found[url] = day
    assert set(found) == set(expected), 'Missing or renamed canonical URL'
    return found


class SitemapRegressionTests(unittest.TestCase):
    def xml(self, body):
        return '<urlset xmlns="' + NS['s'] + '">' + body + '</urlset>'

    def entry(self, loc='https://example.test/', day='2026-11-01'):
        return '<url><loc>' + loc + '</loc><lastmod>' + day + '</lastmod></url>'

    def check(self, xml, expected=None):
        return check_sitemap(xml, expected or {'https://example.test/'}, date(2026, 11, 4))

    def test_valid_calendar_dates_and_past_dates(self):
        self.assertEqual(self.check(self.xml(self.entry(day='2024-02-29')))['https://example.test/'], '2024-02-29')

    def test_missing_lastmod(self):
        with self.assertRaises(AssertionError): self.check(self.xml('<url><loc>https://example.test/</loc></url>'))

    def test_duplicate_lastmod(self):
        with self.assertRaises(AssertionError): self.check(self.xml(self.entry().replace('</url>', '<lastmod>2026-11-02</lastmod></url>')))

    def test_duplicate_loc(self):
        with self.assertRaises(AssertionError): self.check(self.xml(self.entry().replace('</url>', '<loc>https://example.test/</loc></url>')))

    def test_missing_loc(self):
        with self.assertRaises(AssertionError): self.check(self.xml('<url><lastmod>2026-11-01</lastmod></url>'))

    def test_invalid_format_and_timestamps(self):
        for day in ['2026-1-01', '2026-11-4', '2026-11-01T12:00:00Z', 'tomorrow']:
            with self.subTest(day=day), self.assertRaises(AssertionError): self.check(self.xml(self.entry(day=day)))

    def test_invalid_calendar_day(self):
        with self.assertRaises(ValueError): self.check(self.xml(self.entry(day='2026-02-30')))

    def test_future_date(self):
        with self.assertRaises(AssertionError): self.check(self.xml(self.entry(day='2026-11-05')))

    def test_duplicate_urls_even_when_entry_count_is_correct(self):
        with self.assertRaises(AssertionError): self.check(self.xml(self.entry() * 2), {'https://example.test/', 'https://example.test/card/'})

    def test_renamed_or_missing_url(self):
        with self.assertRaises(AssertionError): self.check(self.xml(self.entry(loc='https://example.test/wrong/')))


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.tags, self.ids = [], []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append((tag, a))
        if a.get('id'): self.ids.append(a['id'])

    handle_startendtag = handle_starttag


def json_nodes(text):
    nodes = []
    for attrs, body in re.findall(r'<script\b([^>]*)>(.*?)</script>', text, re.S):
        if 'application/ld+json' not in attrs: continue
        data = json.loads(body)
        nodes.extend(data.get('@graph', [data]))
    return nodes


def audit():
    files = sorted((ROOT / 'card').glob('*/index.html'))
    assert len(files) == 50, 'Permanent guide count changed'
    slugs = [f.parent.name for f in files]
    app = (ROOT / 'assets/js/app.js').read_text()
    registered = re.findall(r'"([a-z0-9-]+)"', re.search(r'const GUIDE_SLUGS = new Set\(\[(.*?)\]\)', app, re.S)[1])
    assert len(registered) == 50 and sorted(registered) == slugs
    directory = (ROOT / 'card/index.html').read_text()
    listing = next(n for n in json_nodes(directory) if n.get('@type') == 'ItemList')
    assert listing['numberOfItems'] == 50 and len(listing['itemListElement']) == 50
    urls = [ORIGIN + '/card/' + s + '/' for s in slugs]
    assert sorted(i['url'] for i in listing['itemListElement']) == urls
    assert [i['position'] for i in listing['itemListElement']] == list(range(1, 51))
    archive = [a['href'] for tag, a in Page(directory).tags if tag == 'a' and 'hub-guide' in a.get('class', '').split()]
    assert len(archive) == len(set(archive)) == 50
    assert sorted(archive) == ['/card/' + s + '/' for s in slugs]
    assert 'Showing all 50 ManaScout card guides' in directory and '<strong>50</strong> card guides' in directory
    expected = set(urls + [ORIGIN + '/', ORIGIN + '/card/', ORIGIN + '/deck/', ORIGIN + '/contact/'])
    dates = check_sitemap((ROOT / 'sitemap.xml').read_text(), expected, datetime.now(timezone.utc).date())
    evidence = json.loads((ROOT / 'docs/card-guide-research-3b.json').read_text())['sitemap_lastmod']['entries']
    assert set(evidence) == expected
    assert all(dates[url] == evidence[url]['lastmod'] and evidence[url]['basis'] for url in dates)
    records, outliers = [], []
    for file, url in zip(files, urls):
        relative = file.relative_to(ROOT).as_posix()
        text = file.read_text()
        page = Page(text)
        assert len(page.ids) == len(set(page.ids)), ('Duplicate IDs', relative)
        canon = [a.get('href') for t, a in page.tags if t == 'link' and a.get('rel') == 'canonical']
        assert canon == [url], (relative, 'Canonical', canon)
        title = re.findall(r'<title>(.*?)</title>', text, re.S)
        assert len(title) == 1 and title[0].strip(), (relative, 'Missing title')
        for name in ['description', 'robots']:
            meta = [a.get('content', '').strip() for t, a in page.tags if t == 'meta' and a.get('name') == name]
            assert len(meta) == 1 and meta[0], (relative, 'Missing metadata', name)
        body = [a for t, a in page.tags if t == 'body']
        assert len(body) == 1 and body[0].get('data-card-name'), (relative, 'Missing card identity')
        for name in ['card-details', 'printings-status', 'printings-container']:
            assert page.ids.count(name) == 1, (relative, name)
        scripts = [a.get('src', '').split('?')[0] for t, a in page.tags if t == 'script']
        assert '/assets/js/app.js' in scripts and '/assets/js/card-page.js' in scripts
        for tag, attrs in page.tags:
            for field in ['aria-labelledby', 'aria-describedby', 'aria-controls']:
                assert all(x in page.ids for x in attrs.get(field, '').split()), (relative, field)
            for field in ['href', 'src']:
                value = attrs.get(field, '')
                parsed = urlsplit(value)
                if not value or parsed.scheme or parsed.netloc: continue
                target = ROOT / unquote(parsed.path).lstrip('/') if parsed.path.startswith('/') else file.parent / unquote(parsed.path) if parsed.path else file
                if target.is_dir(): target /= 'index.html'
                assert target.exists(), (relative, 'Broken local link', value)
                if parsed.fragment:
                    dest = page if target.resolve() == file.resolve() else Page(target.read_text())
                    assert unquote(parsed.fragment) in dest.ids, (relative, 'Missing fragment', value)
        nodes = json_nodes(text)
        types = [n.get('@type') for n in nodes]
        reasons = []
        if not {'WebPage', 'Article', 'BreadcrumbList'} <= set(types): reasons.append('Does not use the full WebPage / Article / BreadcrumbList graph')
        article = next((n for n in nodes if n.get('@type') == 'Article'), None)
        webpage = next((n for n in nodes if n.get('@type') == 'WebPage'), None)
        if article:
            if not article.get('citation'): reasons.append('Article has no citation list')
            if not article.get('dateModified'): reasons.append('Article has no dateModified')
            if webpage and (webpage.get('mainEntity', {}).get('@id') != article.get('@id') or article.get('mainEntityOfPage', {}).get('@id') != webpage.get('@id')): reasons.append('Article/WebPage linkage differs from the current pattern')
        if 'printing-guide' not in body[0].get('class', '').split(): reasons.append('Uses the earlier shared guide layout, without printing-guide scope')
        if '/assets/css/guide-editorial.css' not in [a.get('href', '').split('?')[0] for t, a in page.tags if t == 'link']: reasons.append('Does not load guide-editorial.css')
        if reasons: outliers.append({'path': relative, 'reasons': reasons})
        records.append({'path': relative, 'card_name': body[0]['data-card-name'], 'canonical': url, 'lastmod': dates[url], 'schema_types': types, 'local_links_assets_aria': 'pass', 'metadata': 'pass', 'unique_explorer_ids': 'pass'})
    return {'reviewed': '2026-11-07', 'guide_count': 50, 'registry_count': 50, 'itemlist_count': 50, 'sitemap_unique_urls': 54, 'sitemap_lastmod_counts': {d: list(dates.values()).count(d) for d in sorted(set(dates.values()))}, 'pages': records, 'structural_outliers_for_final_audit': outliers, 'preservation': 'Ten guides source-reviewed in this expansion; other guide editorial copy retained. Contact navigation and shared static fallback integrated without altering Deck Studio models or COTW.', 'limitations': ['Static validation does not prove visual/mobile rendering, physical foil appearance, live API responses, marketplace stock or indexing.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--report')
    args = parser.parse_args()
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(SitemapRegressionTests))
    if not result.wasSuccessful(): raise SystemExit(1)
    report = audit()
    if args.report: (ROOT / args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('PASS 50 guides: registry, directory, metadata, canonicals, unique explorer IDs, ARIA and local links/assets')
    print('PASS 54 unique sitemap URLs: one loc/lastmod per entry, valid non-future dates and URL-specific history evidence')
    print('LASTMOD', report['sitemap_lastmod_counts'])
    print('REPORT structural outliers for separate final audit:', len(report['structural_outliers_for_final_audit']))
    for item in report['structural_outliers_for_final_audit']: print('OUTLIER', item['path'], '; '.join(item['reasons']))
