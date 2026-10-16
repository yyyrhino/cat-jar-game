import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeekGame } from '../gameplay.js';
import { createJumpMotion, sampleJumpMotion } from '../jump-motion.js';

const defaultMotion = createJumpMotion();

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
    closeTo(f.game.inspect().duration, state.jumpMotion.launchDuration);
    f.finishPhase();
    assert.equal(f.game.inspect().phase, 'flying');
    assert.equal(f.game.inspect().jar, source);
    closeTo(f.game.inspect().duration, state.jumpMotion.flightDuration);
    f.finishPhase();
    assert.equal(f.game.inspect().phase, 'landing');
    assert.equal(f.game.inspect().jar, source);
    closeTo(f.game.inspect().duration, state.jumpMotion.landingDuration);
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
  assert.equal(f.game.inspect().affection, 10);
});

test('a left click costs 30 once per jump without changing flight timing or pet state', () => {
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
  assert.equal(next.hurt, false);
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

test('hurt expression begins on collision, lasts through landing and clears before the next appearance', () => {
  const f = fixture();
  f.earn(50);
  f.start(1);
  assert.equal(f.game.inspect().hurt, false);
  f.finishPhase(); f.finishPhase();
  f.game.advance(.1);
  const remaining = f.game.inspect().remaining;
  assert.equal(f.game.inspect().hurt, false);
  assert.equal(f.game.hitAirborne(), true);
  assert.equal(f.game.inspect().hurt, true);
  closeTo(f.game.inspect().remaining, remaining);
  f.game.advance(remaining);
  assert.equal(f.game.inspect().phase, 'landing');
  assert.equal(f.game.inspect().hurt, true);
  closeTo(f.game.inspect().duration, defaultMotion.landingDuration);
  f.finishPhase();
  assert.equal(f.game.inspect().phase, 'hidden');
  assert.equal(f.game.inspect().hurt, false);
  f.start(0, 'peek');
  assert.equal(f.game.inspect().hurt, false);
  f.finishPhase();
  assert.equal(f.game.inspect().hurt, false);
});

test('an uncaught jump costs ten at landing and never credits a stale hold', () => {
  const f = fixture();
  f.earn(40);
  f.start(1);
  f.game.advance(.85 + defaultMotion.totalDuration);
  assert.equal(f.game.inspect().phase, 'hidden');
  assert.equal(f.game.inspect().affection, 30);
  assert.equal(f.game.inspect().holding, false);
  assert.equal(f.game.inspect().penalized, false);
  assert.equal(f.game.inspect().hurt, false);
});

test('jump progress is continuous across launch, flight and landing', () => {
  const f = fixture();
  const motion = f.start(0).jumpMotion;
  f.finishPhase();
  f.game.advance(motion.launchDuration / 2);
  closeTo(f.game.inspect().jumpProgress, motion.launchDuration / (2 * motion.totalDuration));
  closeTo(f.game.inspect().progress, .5);
  f.finishPhase();
  closeTo(f.game.inspect().jumpElapsed, motion.launchDuration);
  closeTo(f.game.inspect().jumpProgress, motion.launchDuration / motion.totalDuration);
  closeTo(f.game.inspect().progress, 1);
  f.game.advance(motion.flightDuration / 2);
  closeTo(f.game.inspect().jumpProgress, .5);
  f.finishPhase();
  closeTo(f.game.inspect().jumpElapsed, motion.totalDuration - motion.landingDuration);
  closeTo(f.game.inspect().jumpProgress, 1 - motion.landingDuration / motion.totalDuration);
  closeTo(f.game.inspect().progress, 1);
  f.game.advance(motion.landingDuration / 2);
  closeTo(f.game.inspect().jumpProgress, 1 - motion.landingDuration / (2 * motion.totalDuration));
  closeTo(f.game.inspect().progress, .5);
});

test('one sampled height fixes the whole jump and phase boundaries preserve position and velocity', () => {
  let height = 1.46;
  let samples = 0;
  const f = fixture({ getJumpHeight: () => { samples++; return height; } });
  const motion = f.start(0).jumpMotion;
  assert.equal(samples, 1);
  closeTo(motion.height, height);
  height = 2.4;
  f.finishPhase();
  for (const nextPhase of ['flying', 'landing']) {
    f.game.advance(f.game.inspect().remaining - 1e-7);
    const before = f.game.inspect();
    const beforePose = sampleJumpMotion(before.jumpMotion, before.jumpElapsed);
    f.finishPhase();
    const after = f.game.inspect();
    const afterPose = sampleJumpMotion(after.jumpMotion, after.jumpElapsed);
    assert.equal(after.phase, nextPhase);
    assert.ok(Math.abs(beforePose.lift - afterPose.lift) < 1e-5);
    assert.ok(Math.abs(beforePose.velocity - afterPose.velocity) < 1e-5);
    closeTo(after.jumpMotion.height, 1.46);
    closeTo(afterPose.lift, motion.clearance);
  }
  // Snapshots are copies, so consumers cannot change the live trajectory.
  f.game.inspect().jumpMotion.height = 99;
  closeTo(f.game.inspect().jumpMotion.height, 1.46);
  f.finishPhase();
  assert.equal(f.game.inspect().jumpMotion, null);
  closeTo(f.game.inspect().jumpElapsed, 0);
  f.start(1);
  assert.equal(samples, 2);
  closeTo(f.game.inspect().jumpMotion.height, 2.4);
});

test('every supported height finishes exactly on the jump deadline without extra time', () => {
  for (const height of [1.32, 1.46, 2.4]) {
    const f = fixture({ getJumpHeight: () => height });
    const state = f.start(0);
    f.game.advance(state.duration + state.jumpMotion.totalDuration);
    assert.equal(f.game.inspect().phase, 'hidden');
    closeTo(f.game.inspect().elapsed, 0);
    assert.equal(f.game.inspect().jumpMotion, null);
  }
});

test('a long frame consumes every jump phase and resumes the next action with correct elapsed time', () => {
  const f = fixture();
  f.start(0);
  // After the landing: hidden duration .75, source 2, next action peek, dwell 2.25.
  f.draws.push(.1, .75, .9);
  f.game.advance(.85 + defaultMotion.totalDuration + .75 + .15 + .2);
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
    assert.equal(state.hurt, false);
    assert.equal(state.progress, 0);
    assert.equal(state.jumpProgress, 0);
    assert.equal(state.jumpElapsed, 0);
    assert.equal(state.jumpMotion, null);
    assert.deepEqual(state.history, []);
    f.start(0, 'peek');
    f.finishPhase();
    assert.equal(f.game.beginPet(), true);
    f.game.advance(.1);
    closeTo(f.game.inspect().affection, 2);
  });
}

test('after a missed jump, normal petting can still trigger the finale at exactly 200 points', () => {
  const f = fixture();
  f.earn(50);
  f.earn(50, 1);
  f.earn(50, 0);
  f.start(1);
  f.game.advance(.85 + defaultMotion.totalDuration);
  f.start(0, 'peek');
  f.finishPhase();
  f.game.beginPet();
  f.game.advance(3);
  assert.equal(f.game.inspect().phase, 'celebrating');
  assert.equal(f.game.inspect().affection, 200);
  assert.equal(f.game.hitAirborne(), false);
  f.game.advance(4.6 + 1.1);
  assert.equal(f.game.inspect().phase, 'hidden');
  assert.equal(f.game.inspect().affection, 0);
  assert.equal(f.game.inspect().jumpId, 1, 'Jump IDs remain monotonic until an explicit reset');
});
