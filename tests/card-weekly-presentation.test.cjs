const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mount } = require('./helpers/weekly-card.cjs');

const angle = (s, detail = { x: 1, y: -1, isTouch: false }) => s.stage.emit('ms:physical-angle', { detail });

test('Card of the Week shares pointer angles with its environment and returns to the same idle pose', async () => {
  const s = mount({ cached: true, animations: true });
  assert.equal(s.weekly.dataset.weeklyPresentation, 'idle');
  await angle(s);
  assert.equal(s.weekly.dataset.weeklyInteracting, 'true');
  assert.equal(s.weekly.style['--weekly-parallax-x'], '5px');
  assert.equal(s.jobs[0].frames[0].transform, s.basePose);
  assert.equal(s.jobs[0].frames[1].transform, 'translate3d(0px,-3px,41px)');
  await angle(s, null);
  assert.equal(s.weekly.dataset.weeklyPresentation, 'returning');
  assert.equal(s.jobs[1].frames[1].transform, s.basePose);
  s.jobs[1].finish();
  await Promise.resolve();
  assert.equal(s.weekly.dataset.weeklyPresentation, 'idle');
  assert.equal(s.weekly.style['--weekly-parallax-x'], undefined);
});

for (const reason of ['offscreen', 'hidden tab', 'search', 'reduced motion']) test(`${reason} pauses the environment and cancels the return`, async () => {
  const s = mount({ cached: true, animations: true });
  await angle(s, { x: 1, y: -1, isTouch: true });
  assert.equal(s.weekly.style['--weekly-parallax-x'], '1.8px');
  await angle(s, null);
  const job = s.jobs.at(-1);
  if (reason === 'offscreen') {
    s.stage.getBoundingClientRect = () => ({ left: 0, top: 1200, width: 300, height: 420 });
    s.visible(false);
  } else if (reason === 'hidden tab') {
    s.d.document.hidden = true;
    for (const listener of s.d.document.listeners.visibilitychange) listener();
  } else if (reason === 'search') s.state('card');
  else s.c.reducedMotion.change(true);
  assert.equal(s.weekly.dataset.weeklyEffectsPaused, 'true');
  assert.equal(s.weekly.dataset.weeklyInteracting, 'false');
  assert.equal(job.cancelled, true);
  job.finish();
  await Promise.resolve();
  assert.equal(s.weekly.dataset.weeklyPresentation, 'idle');
});
