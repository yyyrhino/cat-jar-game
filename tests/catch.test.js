import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeekGame, MAX_AFFECTION } from '../gameplay.js';

function fixture() {
  const draws = [], feedback = [];
  const game = createPeekGame({ random: () => draws.shift() ?? .5, onFeedback: event => feedback.push(event) });
  const finish = () => game.advance(game.inspect().remaining);
  const start = (action = 'jump') => {
    assert.equal(game.inspect().phase, 'hidden');
    draws.push(.1, action === 'jump' ? .1 : .9);
    finish();
  };
  const earn = target => {
    while (game.inspect().affection < target - 1e-8) {
      start('peek'); finish(); game.beginPet();
      game.advance(Math.min(game.inspect().remaining, (target - game.inspect().affection) / 20));
      game.endPet();
      if (game.inspect().phase === 'waiting') finish();
      finish();
    }
  };
  const descend = () => {
    start(); finish(); finish();
    game.advance(game.inspect().duration / 2 + .02);
    assert.equal(game.inspect().phase, 'flying');
  };
  return { game, feedback, finish, start, earn, descend };
}

test('only a descending flying cat can be caught', () => {
  const f = fixture();
  assert.equal(f.game.catchAirborne(), false);
  f.start(); assert.equal(f.game.catchAirborne(), false);
  f.finish(); assert.equal(f.game.catchAirborne(), false);
  f.finish(); assert.equal(f.game.catchAirborne(), false, 'Rising is not catchable');
  f.game.advance(f.game.inspect().duration / 2 + .02);
  assert.equal(f.game.catchAirborne(), true);
  assert.equal(f.game.catchAirborne(), false, 'One catch only');
  assert.equal(f.game.inspect().hurt, false);
});

for (const timely of [false, true]) {
  test(`${timely ? 'timely' : 'held'} catch freezes time and pays ${timely ? 60 : 40} once after placement`, () => {
    const f = fixture(); f.earn(20); f.descend();
    const time = f.game.inspect().jumpElapsed;
    assert(f.game.catchAirborne({ timely }));
    f.game.advance(60);
    const held = f.game.inspect();
    assert.equal(held.phase, 'caught');
    assert.equal(held.jumpElapsed, time);
    assert.equal(held.affection, 20);
    assert.equal(held.timelyCatch, timely);
    assert.equal(f.game.beginPet(), false);
    assert.equal(f.game.hitAirborne(), false);
    assert(f.game.placeCaught()); assert.equal(f.game.placeCaught(), false);
    f.game.advance(.59); assert.equal(f.game.inspect().affection, 20);
    f.game.advance(.01); assert.equal(f.game.inspect().phase, 'hidden');
    assert.equal(f.game.inspect().affection, timely ? 80 : 60);
    f.game.advance(.2);
    assert.deepEqual(f.feedback, [{ type: 'catch-release', reward: timely ? 60 : 40,
      amount: timely ? 60 : 40, timely }]);
  });
}

test('an uncaught landing deducts ten once, including when one frame crosses the whole jump', () => {
  const f = fixture(); f.earn(25); f.start();
  const motion = f.game.inspect().jumpMotion;
  f.game.advance(.85 + motion.totalDuration + .2);
  assert.equal(f.game.inspect().phase, 'hidden');
  assert.equal(f.game.inspect().affection, 15);
  f.game.advance(.1);
  assert.deepEqual(f.feedback, [{ type: 'missed-catch', penalty: 10, amount: 10 }]);
});

test('a slap and a missed catch are separate penalties, bounded at zero', () => {
  for (const score of [5, 35, 50]) {
    const f = fixture(); f.earn(score); f.descend();
    assert(f.game.hitAirborne()); assert.equal(f.game.hitAirborne(), false);
    f.finish(); f.finish();
    assert.equal(f.game.inspect().affection, Math.max(0, score - 40));
    assert.equal(f.feedback.length, 1);
    assert.equal(f.feedback[0].type, 'missed-catch');
  }
});

test('a slapped cat can still be rescued without undoing its penalty or charging a miss', () => {
  const f = fixture(); f.earn(50); f.descend();
  assert(f.game.hitAirborne()); assert.equal(f.game.inspect().affection, 20);
  assert(f.game.catchAirborne()); assert.equal(f.game.inspect().hurt, false);
  f.game.placeCaught(); f.finish();
  assert.equal(f.game.inspect().affection, 60);
  assert.deepEqual(f.feedback, [{type:'catch-release',reward:40,amount:40,timely:false}]);
});

test('placement reward caps at 200 and starts the finale exactly at completion', () => {
  const f = fixture(); f.earn(170); f.descend();
  f.game.catchAirborne({ timely: true }); f.game.placeCaught();
  f.game.advance(.6 + .2);
  assert.equal(MAX_AFFECTION, 200);
  assert.equal(f.game.inspect().maxAffection, 200);
  assert.equal(f.game.inspect().affection, 200);
  assert.equal(f.game.inspect().phase, 'celebrating');
  assert(Math.abs(f.game.inspect().elapsed - .2) < 1e-8);
  assert.deepEqual(f.feedback, [{type:'catch-release',reward:60,amount:30,timely:true}]);
  assert.equal(f.game.placeCaught(), false);
  f.game.advance(4.4 + 1.1);
  assert.equal(f.game.inspect().phase, 'hidden');
  assert.equal(f.game.inspect().affection, 0);
});

for (const phase of ['caught', 'placing']) {
  test(`reset during ${phase} cancels the reward and clears catch state`, () => {
    const f = fixture(); f.descend(); f.game.catchAirborne({timely:true});
    if (phase === 'placing') { f.game.placeCaught(); f.game.advance(.2); }
    f.game.reset();
    assert.equal(f.game.inspect().phase, 'hidden');
    assert.equal(f.game.inspect().catchReward, 0);
    assert.equal(f.game.inspect().timelyCatch, false);
    assert.equal(f.game.placeCaught(), false);
    assert.equal(f.game.inspect().affection, 0);
    assert.deepEqual(f.feedback, []);
  });
}
