import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeekGame } from '../gameplay.js';

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `Expected ${actual} to be close to ${expected}`);

function reachWaiting(game) {
  for (let steps = 0; game.inspect().phase !== 'waiting'; steps++) {
    assert.ok(steps < 5, 'The next peek must reach its waiting phase');
    game.advance(game.inspect().remaining);
  }
  return game.inspect();
}

test('hidden interval stays at 0.5–3 seconds and base dwell is 1.5–2.5 seconds', () => {
  for (const sample of [0, .5, 1]) {
    const game = createPeekGame({ random: () => sample });
    closeTo(game.inspect().duration, .5 + sample * 2.5);
    const state = reachWaiting(game);
    closeTo(state.duration, 1.5 + sample);
    assert.equal(state.extended, false);
    game.advance(state.duration);
    assert.equal(game.inspect().phase, 'retracting');
    closeTo(game.inspect().duration, .15);
  }
});

test('a pet just before the original deadline grants a full extra second', () => {
  const game = createPeekGame({ random: () => 0 });
  const base = reachWaiting(game).duration;
  game.advance(base - .05);
  assert.equal(game.beginPet(), true);
  assert.equal(game.inspect().extended, true);
  closeTo(game.inspect().duration, base + 1);
  closeTo(game.inspect().remaining, 1.05);
  game.advance(.1);
  assert.equal(game.inspect().phase, 'waiting', 'Petting must postpone the old deadline');
  game.advance(.94);
  assert.equal(game.inspect().phase, 'waiting');
  game.advance(.01);
  assert.equal(game.inspect().phase, 'retracting');
  assert.equal(game.inspect().petting, false);
  closeTo(game.inspect().affection, 1.05);
});

test('repeated taps, a continuous hold, and leaving then re-entering cannot stack bonuses', () => {
  const game = createPeekGame({ random: () => .5 });
  const base = reachWaiting(game).duration;
  game.beginPet();
  game.advance(.2);
  game.beginPet();
  game.setContact(false);
  game.setContact(true);
  game.endPet();
  game.beginPet();
  closeTo(game.inspect().duration, base + 1);
  closeTo(game.inspect().remaining, base + .8);
  game.advance(game.inspect().remaining);
  assert.equal(game.inspect().phase, 'retracting');
});

test('each new appearance gets a fresh bonus and never immediately repeats its jar', () => {
  const game = createPeekGame({ random: () => 0 });
  const first = reachWaiting(game);
  game.beginPet();
  game.advance(game.inspect().remaining + .15);
  assert.equal(game.inspect().phase, 'hidden');
  const next = reachWaiting(game);
  assert.notEqual(next.jar, first.jar);
  assert.equal(next.appearance, first.appearance + 1);
  assert.equal(next.extended, false);
  closeTo(next.duration, 1.5);
  game.beginPet();
  closeTo(game.inspect().duration, 2.5);
});

test('reset clears affection, contact, and bonus availability', () => {
  const game = createPeekGame({ random: () => 0 });
  reachWaiting(game);
  game.beginPet();
  game.advance(.25);
  game.reset();
  const reset = game.inspect();
  assert.equal(reset.phase, 'hidden');
  assert.equal(reset.affection, 0);
  assert.equal(reset.holding, false);
  assert.equal(reset.extended, false);
  assert.equal(reset.appearance, 0);
  reachWaiting(game);
  game.beginPet();
  assert.equal(game.inspect().extended, true);
  closeTo(game.inspect().duration, 2.5);
});

test('fractional affection includes bonus time but stops at the extended deadline', () => {
  const updates = [];
  const game = createPeekGame({ random: () => 0, onAffection: (value) => updates.push(value) });
  reachWaiting(game);
  game.advance(1.4);
  game.beginPet();
  game.advance(.3);
  closeTo(game.inspect().affection, .3);
  game.advance(4);
  closeTo(game.inspect().affection, 1.1);
  closeTo(updates.at(-1), 1.1);
  assert.equal(game.inspect().holding, false);
});

test('release and loss of contact stop credit; hidden and retracting cats cannot be petted', () => {
  const game = createPeekGame({ random: () => 0 });
  assert.equal(game.beginPet(), false);
  game.advance(.5);
  assert.equal(game.inspect().phase, 'emerging');
  assert.equal(game.beginPet(), false);
  reachWaiting(game);
  game.beginPet();
  game.advance(.25);
  game.setContact(false);
  game.advance(.2);
  closeTo(game.inspect().affection, .25);
  game.setContact(true);
  game.advance(.1);
  closeTo(game.inspect().affection, .35);
  game.endPet();
  game.setContact(true);
  game.advance(game.inspect().remaining);
  closeTo(game.inspect().affection, .35);
  assert.equal(game.inspect().phase, 'retracting');
  assert.equal(game.beginPet(), false);
});
