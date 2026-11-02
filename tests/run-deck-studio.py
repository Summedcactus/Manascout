"""Run the focused dependency-free Deck Studio and card-presentation suites and report actual case counts."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
totals = {'tests': 0, 'pass': 0, 'fail': 0}
files = sorted([*(ROOT / 'tests').glob('deck-*.test.cjs'), *(ROOT / 'tests').glob('card-*.test.cjs')])
for file in files:
    result = subprocess.run(['node', str(file)], cwd=ROOT, text=True, capture_output=True)
    counts = {}
    for key in totals:
        match = re.search(r'(?:^|\n)(?:#|ℹ)\s+' + key + r'\s+(\d+)', result.stdout)
        if match:
            counts[key] = int(match.group(1))
    if result.returncode or len(counts) != 3:
        print(result.stdout[-16000:], result.stderr[-4000:])
        raise SystemExit(result.returncode or 1)
    for key in totals:
        totals[key] += counts[key]
    print(f"PASS {file.name}: {counts['pass']} passed, {counts['fail']} failed", flush=True)

for file in sorted((ROOT / 'assets/js').glob('deck-*.js')) + [ROOT / 'assets/js/app.js', ROOT / 'assets/js/card-page.js', ROOT / 'assets/js/scoutboard.js']:
    subprocess.run(['node', '--check', str(file)], cwd=ROOT, check=True)
print('PASS Deck Studio, shared explorer, card-page and homepage JavaScript syntax', flush=True)
subprocess.run([sys.executable, str(ROOT / 'tests/validate-deck-studio.py')], cwd=ROOT, check=True)
subprocess.run([sys.executable, str(ROOT / 'tests/validate-card-presentation.py')], cwd=ROOT, check=True)
print(f"TOTAL: {totals['tests']} JavaScript cases; {totals['pass']} passed, {totals['fail']} failed.")
print('Browser rendering, native focus/keyboard behaviour and live API requests are not exercised by this runner.')
