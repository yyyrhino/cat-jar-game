import test from 'node:test';
import assert from 'node:assert/strict';
import { createJumpMotion, sampleJumpMotion } from '../jump-motion.js';

const closeTo = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance,
  `Expected ${actual} to be close to ${expected}`);

test('the ball starts and ends hidden above the jar floor, then clears the lip fully', () => {
  const catBase = .90, ballBottom = .38, ballTopBound = 2.23, rim = 2.365, floor = .17;
  for (const height of [1.32, 1.46, 2.4]) {
    const motion = createJumpMotion(height);
    const start = sampleJumpMotion(motion, 0);
    const end = sampleJumpMotion(motion, motion.totalDuration);
    closeTo(start.lift, motion.startLift);
    closeTo(end.lift, start.lift);
    assert.ok(start.lift + catBase + ballBottom > floor);
    assert.ok(start.lift + catBase + ballTopBound < rim);
    for (const time of [motion.launchDuration, motion.launchDuration + motion.flightDuration]) {
      const sample = sampleJumpMotion(motion, time);
      closeTo(sample.lift, motion.clearance);
      assert.ok(sample.lift + catBase + ballBottom > rim);
    }
  }
});

test('the apex has zero velocity and equal time/height on ascent and descent', () => {
  for (const height of [1.32, 1.46, 2.4]) {
    const motion = createJumpMotion(height);
    const apex = sampleJumpMotion(motion, motion.totalDuration / 2);
    closeTo(apex.lift, height);
    closeTo(apex.velocity, 0);
    closeTo(motion.launchDuration, motion.landingDuration);
    closeTo(motion.launchDuration + motion.flightDuration + motion.landingDuration, .92);
    assert.ok(motion.launchDuration > 0 && motion.flightDuration > 0);
    for (let i = 1; i < 10; i++) {
      const t = motion.totalDuration * i / 20;
      const rising = sampleJumpMotion(motion, t);
      const falling = sampleJumpMotion(motion, motion.totalDuration - t);
      closeTo(rising.lift, falling.lift);
      closeTo(rising.velocity, -falling.velocity);
      assert.ok(rising.velocity > 0 && falling.velocity < 0);
    }
  }
});

test('gravity stays constant across both phase boundaries and the apex', () => {
  const motion = createJumpMotion();
  const dt = .001;
  const times = [.02, motion.launchDuration, motion.totalDuration / 2,
    motion.launchDuration + motion.flightDuration, motion.totalDuration - .02];
  for (const time of times) {
    const before = sampleJumpMotion(motion, time - dt);
    const sample = sampleJumpMotion(motion, time);
    const after = sampleJumpMotion(motion, time + dt);
    closeTo((after.velocity - before.velocity) / (2 * dt), -motion.gravity);
    closeTo((after.lift - before.lift) / (2 * dt), sample.velocity);
    closeTo((after.lift - 2 * sample.lift + before.lift) / dt ** 2, -motion.gravity, 1e-7);
  }
});

test('motion clamps unsupported heights and sampling never extrapolates beyond the jump', () => {
  for (const [input, expected] of [[-5, 1.32], [0, 1.32], [1.32, 1.32], [1.8, 1.8],
    [10, 2.4], [NaN, 2.4], [Infinity, 2.4], [undefined, 2.4]]) {
    const motion = createJumpMotion(input);
    closeTo(motion.height, expected);
    assert.ok(Object.isFrozen(motion));
    assert.deepEqual(sampleJumpMotion(motion, -1), sampleJumpMotion(motion, 0));
    assert.deepEqual(sampleJumpMotion(motion, 5), sampleJumpMotion(motion, motion.totalDuration));
    assert.deepEqual(sampleJumpMotion(motion, NaN), sampleJumpMotion(motion, 0));
  }
});
