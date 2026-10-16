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

function earnAffection(game, target) {
  for (let peeks = 0; game.inspect().affection < target - 1e-8; peeks++) {
    assert.ok(peeks < 20, 'Affection must accumulate within the normal peek cycle');
    reachWaiting(game);
    assert.equal(game.beginPet(), true);
    const state = game.inspect();
    game.advance(Math.min(state.remaining, (target - state.affection) / 20));
  }
}

function reachCelebrating(game) {
  earnAffection(game, 199);
  game.advance(.05);
  assert.equal(game.inspect().phase, 'celebrating');
  return game.inspect();
}

test('hidden interval stays at 0.5–3 seconds and base dwell is 1.5–2.5 seconds', () => {
  for (const sample of [0, .5, 1]) {
    const game = createPeekGame({ jumpChance: 0, random: () => sample });
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
  const game = createPeekGame({ jumpChance: 0, random: () => 0 });
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
  closeTo(game.inspect().affection, 21);
});

test('repeated taps, a continuous hold, and leaving then re-entering cannot stack bonuses', () => {
  const game = createPeekGame({ jumpChance: 0, random: () => .5 });
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
  const game = createPeekGame({ jumpChance: 0, random: () => 0 });
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
  const game = createPeekGame({ jumpChance: 0, random: () => 0 });
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
  const game = createPeekGame({ jumpChance: 0, random: () => 0, onAffection: (value) => updates.push(value) });
  reachWaiting(game);
  game.advance(1.4);
  game.beginPet();
  game.advance(.3);
  closeTo(game.inspect().affection, 6);
  game.advance(4);
  closeTo(game.inspect().affection, 22);
  closeTo(updates.at(-1), 22);
  assert.equal(game.inspect().holding, false);
});

test('release and loss of contact stop credit; hidden and retracting cats cannot be petted', () => {
  const game = createPeekGame({ jumpChance: 0, random: () => 0 });
  assert.equal(game.beginPet(), false);
  game.advance(.5);
  assert.equal(game.inspect().phase, 'emerging');
  assert.equal(game.beginPet(), false);
  reachWaiting(game);
  game.beginPet();
  game.advance(.25);
  game.setContact(false);
  game.advance(.2);
  closeTo(game.inspect().affection, 5);
  game.setContact(true);
  game.advance(.1);
  closeTo(game.inspect().affection, 7);
  game.endPet();
  game.setContact(true);
  game.advance(game.inspect().remaining);
  closeTo(game.inspect().affection, 7);
  assert.equal(game.inspect().phase, 'retracting');
  assert.equal(game.beginPet(), false);
});

test('valid petting earns twenty points per second including fractional intervals', () => {
  const game = createPeekGame({ jumpChance: 0, random: () => 0 });
  reachWaiting(game);
  game.beginPet();
  game.advance(.2);
  closeTo(game.inspect().affection, 4);
  game.advance(.8);
  closeTo(game.inspect().affection, 20);
});

test('full affection interrupts the peek at the precise threshold and carries surplus time into the finale', () => {
  const game = createPeekGame({ jumpChance: 0, random: () => 0 });
  earnAffection(game, 199);
  const winningJar = game.inspect().jar;
  game.advance(.05 - .02);
  assert.equal(game.inspect().phase, 'waiting');
  closeTo(game.inspect().affection, 199.6);
  game.advance(.22);
  const state = game.inspect();
  assert.equal(state.phase, 'celebrating');
  assert.equal(state.jar, winningJar);
  assert.equal(state.affection, 200);
  assert.equal(state.progress, 1);
  assert.equal(state.holding, false);
  assert.equal(state.petting, false);
  closeTo(state.duration, 4.6);
  closeTo(state.elapsed, .2);
  assert.equal(state.history.at(-1).phase, 'celebrating');
});

test('the finale fires once, blocks petting, and keeps the completed affection until its return phase', () => {
  const updates = [];
  const game = createPeekGame({ jumpChance: 0, random: () => 0, onAffection: (value) => updates.push(value) });
  reachCelebrating(game);
  const updateCount = updates.length;
  assert.equal(game.beginPet(), false);
  game.setContact(true);
  game.advance(2);
  assert.equal(game.beginPet(), false);
  const state = game.inspect();
  assert.equal(state.affection, 200);
  assert.equal(state.holding, false);
  assert.equal(state.petting, false);
  assert.equal(updates.length, updateCount);
  assert.equal(updates.filter((value) => value === 200).length, 1);
  assert.equal(state.history.filter((event) => event.phase === 'celebrating').length, 1);
});

test('completion takes priority when full affection coincides with the extended peek deadline', () => {
  const game = createPeekGame({ jumpChance: 0, random: () => 0 });
  earnAffection(game, 197.5);
  reachWaiting(game);
  game.beginPet();
  game.setContact(false);
  const timeToFull = (200 - game.inspect().affection) / 20;
  game.advance(game.inspect().remaining - timeToFull);
  game.setContact(true);
  game.advance(game.inspect().remaining);
  assert.equal(game.inspect().phase, 'celebrating');
  assert.equal(game.inspect().affection, 200);
  closeTo(game.inspect().elapsed, 0);

  const fullHolds = createPeekGame({ jumpChance: 0, random: () => 0 });
  for (let appearance = 1; appearance <= 4; appearance++) {
    reachWaiting(fullHolds);
    fullHolds.beginPet();
    fullHolds.advance(fullHolds.inspect().remaining);
    assert.equal(fullHolds.inspect().affection, appearance * 50);
    assert.equal(fullHolds.inspect().phase, appearance === 4 ? 'celebrating' : 'retracting');
  }
  closeTo(fullHolds.inspect().elapsed, 0);
});

test('automatic return clears round state and restarts a playable peek cycle', () => {
  const updates = [];
  const game = createPeekGame({ jumpChance: 0, random: () => 0, onAffection: (value) => updates.push(value) });
  reachCelebrating(game);
  game.advance(4.6);
  const returning = game.inspect();
  assert.equal(returning.phase, 'returning');
  closeTo(returning.duration, 1.1);
  assert.equal(returning.affection, 0);
  assert.equal(updates.at(-1), 0);
  assert.equal(returning.jar, -1);
  assert.equal(returning.appearance, 0);
  assert.equal(returning.extended, false);
  assert.equal(returning.holding, false);
  assert.equal(returning.petting, false);
  assert.equal(returning.progress, 0);
  assert.equal(game.beginPet(), false);
  game.setContact(true);
  game.advance(1.1);
  assert.equal(game.inspect().phase, 'hidden');
  closeTo(game.inspect().duration, .5);
  const next = reachWaiting(game);
  assert.equal(next.appearance, 1);
  assert.equal(next.extended, false);
  assert.equal(game.beginPet(), true);
  game.advance(.25);
  closeTo(game.inspect().affection, 5);
  reachCelebrating(game);
  assert.equal(updates.filter((value) => value === 200).length, 2, 'A second completed round has its own finale');
});

test('one long frame can cross completion, the finale, return, and the next peek without stale petting', () => {
  const game = createPeekGame({ jumpChance: 0, random: () => 0 });
  earnAffection(game, 199);
  game.advance(.05 + 4.6 + 1.1 + .5 + .15 + .25);
  const state = game.inspect();
  assert.equal(state.phase, 'waiting');
  closeTo(state.elapsed, .25);
  assert.equal(state.affection, 0);
  assert.equal(state.holding, false);
  assert.equal(state.petting, false);
  assert.equal(state.extended, false);
  assert.equal(state.appearance, 1);
  assert.deepEqual(state.history.slice(-5).map((event) => event.phase),
    ['celebrating', 'returning', 'hidden', 'emerging', 'waiting']);
});

for (const phase of ['celebrating', 'returning']) {
  test(`manual reset during ${phase} immediately starts a clean round`, () => {
    const game = createPeekGame({ jumpChance: 0, random: () => 0 });
    reachCelebrating(game);
    if (phase === 'returning') game.advance(4.6);
    game.advance(.2);
    assert.equal(game.inspect().phase, phase);
    game.reset();
    const state = game.inspect();
    assert.equal(state.phase, 'hidden');
    closeTo(state.elapsed, 0);
    closeTo(state.duration, .5);
    assert.equal(state.jar, -1);
    assert.equal(state.affection, 0);
    assert.equal(state.appearance, 0);
    assert.equal(state.extended, false);
    assert.equal(state.holding, false);
    assert.equal(state.petting, false);
    assert.deepEqual(state.history, []);
    reachWaiting(game);
    assert.equal(game.beginPet(), true);
    game.advance(.1);
    closeTo(game.inspect().affection, 2);
  });
}
