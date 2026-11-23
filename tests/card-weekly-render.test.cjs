const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Card of the Week uses the same physical geometry as other collector surfaces', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const scene = html.slice(html.indexOf('id="card-of-the-week"'), html.indexOf('<!-- WEEKLY ARCHIVE -->'));
  assert.match(scene, /weekly-card-stage ms-physical[^>]*data-ms-physical-scene[^>]*data-surface="foil"/);
  assert.match(scene, /weekly-card-shell ms-physical-shell[\s\S]*weekly-card-face ms-physical-face[\s\S]*card-week-image[\s\S]*ms-physical-reflection/);
  assert.doesNotMatch(scene, /weekly-foil-sheen|weekly-edge-light/);
  const style = fs.readFileSync('assets/css/home.css', 'utf8');
  assert.match(style, /weekly-card-float\s*{[^}]*animation: msWeeklyFloat/);
  assert.match(style, /weekly-theme-cosmic \.weekly-card-float\s*{[^}]*animation: msCosmicDrift/);
  assert.match(style, /prefers-reduced-motion: reduce/);
});
