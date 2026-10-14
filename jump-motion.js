// One constant-gravity arc includes the hidden part inside the jar. Phase
// boundaries mark lip clearance; they never restart or ease the motion.
export function createJumpMotion(height = 2.4) {
  height = Number.isFinite(height) ? Math.max(1.32, Math.min(2.4, height)) : 2.4;
  const startLift = -.90;
  const clearance = 1.20;
  const totalDuration = .92;
  const rise = height - startLift;
  const gravity = 8 * rise / totalDuration ** 2;
  const initialVelocity = 4 * rise / totalDuration;
  const launchDuration = totalDuration / 2
    * (1 - Math.sqrt(1 - (clearance - startLift) / rise));
  const landingDuration = launchDuration;
  const flightDuration = totalDuration - launchDuration - landingDuration;
  return Object.freeze({ height, startLift, clearance, totalDuration,
    launchDuration, flightDuration, landingDuration, gravity, initialVelocity });
}

export function sampleJumpMotion(motion, elapsed) {
  const time = Number.isFinite(elapsed) ? Math.max(0, Math.min(motion.totalDuration, elapsed)) : 0;
  return {
    lift: motion.startLift + motion.initialVelocity * time - .5 * motion.gravity * time ** 2,
    velocity: motion.initialVelocity - motion.gravity * time,
  };
}
