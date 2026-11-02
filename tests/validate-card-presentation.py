"""Focused, dependency-free structural checks; never a visual/browser claim."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'index.html').read_text()
home = (ROOT / 'assets/css/home.css').read_text()
app = (ROOT / 'assets/js/app.js').read_text()
css = app.split('    style.textContent = `', 1)[1].split('    `;', 1)[0]


def validate_css(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    position = 0
    while text[position:].strip():
        opening = text.index('{', position)
        header = text[position:opening].strip()
        assert header, 'Missing rule header'
        depth, end = 1, opening + 1
        while depth and end < len(text):
            depth += (text[end] == '{') - (text[end] == '}')
            end += 1
        assert not depth, ('Unbalanced rule', header)
        body = text[opening + 1:end - 1]
        if header.startswith(('@media', '@keyframes', '@supports')):
            validate_css(body)
        else:
            for declaration in body.split(';'):
                if declaration.strip():
                    assert re.match(r'^\s*(--[\w-]+|[a-z-]+)\s*:', declaration), declaration
        position = end


validate_css(home)
validate_css(css)
keyframes = re.findall(r'@keyframes\s+([\w-]+)', home)
assert len(keyframes) == len(set(keyframes)), 'Duplicate homepage keyframes'
assert 'morgul' not in ''.join(re.findall(r'<style[^>]*>(.*?)</style>', html, re.S)), 'Inline atmospheric override'
assert 'data-weekly-set="ltc"' in html and 'data-weekly-number="390"' in html
assert 'https://api.scryfall.com/cards/ltc/390?format=image&amp;version=normal' in html
assert 'printing=cce035f4-5ba4-4e9d-ab26-d5d0290de74d' in html
assert 'Sean Vo' in html
assert 'perspective(1100px)' in home and 'rotateX(var(--weekly-rx))' in home and 'rotateY(var(--weekly-ry))' in home
morgul = home.split('/* Week 006', 1)[1]
for selector in re.findall(r'([^{}]+)\{', morgul):
    if '.morgul-' in selector and '@media' not in selector and not selector.lstrip().startswith('/*'):
        assert 'data-weekly-' in selector or 'prefers-reduced-motion' in selector or '.weekly-theme-morgul *' in selector or '.weekly-theme-morgul .morgul-' in selector, selector
assert 'saturate(' not in morgul and 'brightness(' not in morgul and 'blur(' not in morgul
assert 'morgul-window' not in html and 'morgul-sky' not in html, 'Unverified artwork coordinates must not ship'
assert 'animation-play-state: paused' in home and 'animation-play-state: paused' in css
assert 'data-weekly-art-ready="false"' in html and 'data-ms-image-ready="false"' in css
assert 'prefers-reduced-motion:reduce' in css and '.ms-face-turner { transition: none !important; }' in css
assert 'backface-visibility: hidden' in css and 'rotateY(180deg)' in css
assert 'width: 44px; height: 44px;' in css and ':focus-visible' in css
assert 'ms-finish-control' not in app and 'ms-thumb-toggle' not in app and 'data-ms-finish-toggle' not in app
print('PASS homepage/shared-preview CSS structure, unique keyframes, exact featured printing, preserved 3D, conditional overlays, motion and touch/focus structure')
print('LIMITATION: no pixels, image alignment, native 3D compositing or Android performance are verified here. Sky/window masks are intentionally absent.')
