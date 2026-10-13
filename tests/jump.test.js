import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeekGame } from '../gameplay.js';

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `Expected ${actual} to be close to ${expected}`);

function fixture(options = {}) {
  const draws = [];
  const updates = [];
  const game = createPeekGame({ random: () => draws.shift() ?? .75,
    onAffection: (value) => updates.push(value), ...options });
  function start(source, action = 'jump') {
    assert.equal(game.inspect().phase, 'hidden');
    const jars = [0, 1, 2].filter((jar) => jar !== game.inspect().jar);
    assert.ok(jars.includes(source), 'The next source excludes the last occupied jar');
    draws.push((jars.indexOf(source) + .5) / jars.length, action === 'jump' ? .1 : .9);
    game.advance(game.inspect().remaining);
    return game.inspect();
  }
  function finishPhase() { game.advance(game.inspect().remaining); return game.inspect(); }
  function earn(points, source = 0) {
    start(source, 'peek');
    finishPhase();
    assert.equal(game.beginPet(), true);
    game.advance(points / 20);
    game.endPet();
    finishPhase();
    finishPhase();
  }
  return { game, draws, updates, start, finishPhase, earn };
}

test('default selection uses 50% jumps and leaves ordinary peeks unchanged', () => {
  for (const [sample, action, phase] of [[.349, 'jump', 'charging'], [.499, 'jump', 'charging'], [.5, 'peek', 'emerging'], [.9, 'peek', 'emerging']]) {
    const f = fixture();
    f.draws.push(.2, sample);
    f.finishPhase();
    assert.equal(f.game.inspect().action, action);
    assert.equal(f.game.inspect().phase, phase);
  }
});

test('jumps from all three jars always land back in their source jar', () => {
  for (const source of [0, 1, 2]) {
    const f = fixture();
    const state = f.start(source);
    assert.equal(state.phase, 'charging');
    assert.equal(state.sourceJar, source);
    assert.equal(state.targetJar, source);
    assert.equal(state.jar, source);
    assert.equal(state.action, 'jump');
    assert.equal(state.jumpId, 1);
    closeTo(state.duration, .85);
    closeTo(state.progress, 0);
    f.finishPhase();
    assert.equal(f.game.inspect().phase, 'launching');
    closeTo(f.game.inspect().duration, .24);
    f.finishPhase();
    assert.equal(f.game.inspect().phase, 'flying');
    assert.equal(f.game.inspect().jar, source);
    closeTo(f.game.inspect().duration, 1.1);
    f.finishPhase();
    assert.equal(f.game.inspect().phase, 'landing');
    assert.equal(f.game.inspect().jar, source);
    closeTo(f.game.inspect().duration, .24);
    f.finishPhase();
    assert.equal(f.game.inspect().phase, 'hidden');
    assert.equal(f.game.inspect().jar, source);
    // Subsequent appearances can still choose another jar after this in-place jump.
    f.finishPhase();
    assert.notEqual(f.game.inspect().jar, source);
  }
});

test('jump phases cannot be petted and only the fully airborne phase accepts a collision', () => {
  const f = fixture();
  f.earn(50);
  f.start(1);
  for (const phase of ['charging', 'launching', 'flying', 'landing']) {
    assert.equal(f.game.inspect().phase, phase);
    assert.equal(f.game.beginPet(), false);
    f.game.setContact(true);
    assert.equal(f.game.inspect().holding, false);
    assert.equal(f.game.inspect().petting, false);
    const before = f.game.inspect();
    assert.equal(f.game.hitAirborne(), phase === 'flying');
    closeTo(f.game.inspect().elapsed, before.elapsed);
    closeTo(f.game.inspect().duration, before.duration);
    assert.equal(f.game.inspect().affection, phase === 'flying' || phase === 'landing' ? 20 : 50);
    f.finishPhase();
  }
  assert.equal(f.game.hitAirborne(), false);
  assert.equal(f.game.inspect().affection, 20);
});

test('hover collision costs 30 once per jump without changing flight timing or pet state', () => {
  const f = fixture();
  f.earn(50);
  f.start(1);
  f.finishPhase(); f.finishPhase();
  f.game.advance(.2);
  const before = f.game.inspect();
  const callbacks = f.updates.length;
  assert.equal(f.game.hitAirborne(), true);
  assert.equal(f.game.inspect().affection, 20);
  assert.equal(f.game.inspect().penalized, true);
  assert.equal(f.game.inspect().holding, false);
  closeTo(f.game.inspect().remaining, before.remaining);
  for (let collision = 0; collision < 10; collision++) assert.equal(f.game.hitAirborne(), false);
  assert.equal(f.updates.length, callbacks + 1);
  assert.equal(f.updates.at(-1), 20);
  f.game.advance(.1);
  assert.equal(f.game.hitAirborne(), false, 'Moving away and re-entering within a jump cannot cost another 30');
  assert.equal(f.game.inspect().affection, 20);
  f.finishPhase(); f.finishPhase();
  const next = f.start(0);
  assert.equal(next.jumpId, before.jumpId + 1);
  assert.equal(next.penalized, false);
  f.finishPhase(); f.finishPhase();
  assert.equal(f.game.hitAirborne(), true);
  assert.equal(f.game.inspect().affection, 0, 'Low affection clamps to zero');
});

test('a collision at zero affection still consumes the one-collision allowance', () => {
  const f = fixture();
  f.start(2);
  f.finishPhase(); f.finishPhase();
  assert.equal(f.game.hitAirborne(), true);
  assert.equal(f.game.inspect().affection, 0);
  assert.equal(f.game.inspect().penalized, true);
  assert.equal(f.game.hitAirborne(), false);
  assert.equal(f.game.inspect().phase, 'flying');
});

test('no collision preserves affection throughout the jump and never credits a stale hold', () => {
  const f = fixture();
  f.earn(40);
  f.start(1);
  f.game.advance(.85 + .24 + 1.1 + .24);
  assert.equal(f.game.inspect().phase, 'hidden');
  assert.equal(f.game.inspect().affection, 40);
  assert.equal(f.game.inspect().holding, false);
  assert.equal(f.game.inspect().penalized, false);
});

test('jump progress is continuous across launch, flight and landing', () => {
  const f = fixture();
  f.start(0);
  f.finishPhase();
  f.game.advance(.12);
  closeTo(f.game.inspect().jumpProgress, .075);
  closeTo(f.game.inspect().progress, .5);
  f.finishPhase();
  closeTo(f.game.inspect().jumpProgress, .15);
  closeTo(f.game.inspect().progress, 1);
  f.game.advance(.55);
  closeTo(f.game.inspect().jumpProgress, .5);
  f.finishPhase();
  closeTo(f.game.inspect().jumpProgress, .85);
  closeTo(f.game.inspect().progress, 1);
  f.game.advance(.12);
  closeTo(f.game.inspect().jumpProgress, .925);
  closeTo(f.game.inspect().progress, .5);
});

test('a long frame consumes every jump phase and resumes the next action with correct elapsed time', () => {
  const f = fixture();
  f.start(0);
  // After the landing: hidden duration .75, source 2, next action peek, dwell 2.25.
  f.draws.push(.1, .75, .9);
  f.game.advance(.85 + .24 + 1.1 + .24 + .75 + .15 + .2);
  const state = f.game.inspect();
  assert.equal(state.phase, 'waiting');
  assert.equal(state.action, 'peek');
  assert.equal(state.jar, 2);
  assert.equal(state.jumpId, 1);
  closeTo(state.elapsed, .2);
  assert.equal(state.affection, 0);
  assert.equal(state.holding, false);
  assert.deepEqual(state.history.map((event) => event.phase),
    ['charging', 'launching', 'flying', 'landing', 'hidden', 'emerging', 'waiting']);
});

for (const phase of ['charging', 'launching', 'flying', 'landing']) {
  test(`reset during ${phase} clears jump state and restarts a playable cycle`, () => {
    const f = fixture();
    f.earn(40);
    f.start(1);
    while (f.game.inspect().phase !== phase) f.finishPhase();
    if (phase === 'flying') f.game.hitAirborne();
    f.game.advance(.05);
    f.game.reset();
    const state = f.game.inspect();
    assert.equal(state.phase, 'hidden');
    assert.equal(state.action, 'peek');
    assert.equal(state.sourceJar, -1);
    assert.equal(state.targetJar, -1);
    assert.equal(state.jar, -1);
    assert.equal(state.affection, 0);
    assert.equal(state.jumpId, 0);
    assert.equal(state.penalized, false);
    assert.equal(state.progress, 0);
    assert.equal(state.jumpProgress, 0);
    assert.deepEqual(state.history, []);
    f.start(0, 'peek');
    f.finishPhase();
    assert.equal(f.game.beginPet(), true);
    f.game.advance(.1);
    closeTo(f.game.inspect().affection, 2);
  });
}

test('after a jump, normal petting can still trigger the finale at exactly 100 points', () => {
  const f = fixture();
  f.earn(50);
  f.start(1);
  f.game.advance(.85 + .24 + 1.1 + .24);
  f.start(0, 'peek');
  f.finishPhase();
  f.game.beginPet();
  f.game.advance(2.5);
  assert.equal(f.game.inspect().phase, 'celebrating');
  assert.equal(f.game.inspect().affection, 100);
  assert.equal(f.game.hitAirborne(), false);
  f.game.advance(4.6 + 1.1);
  assert.equal(f.game.inspect().phase, 'hidden');
  assert.equal(f.game.inspect().affection, 0);
  assert.equal(f.game.inspect().jumpId, 1, 'Jump IDs remain monotonic until an explicit reset');
});
