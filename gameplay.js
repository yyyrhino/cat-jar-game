// Time is measured in active, foreground seconds. Each peek has a sampled
// deadline, with one extra second granted by its first successful pet.
export function createPeekGame({ random = Math.random, onAffection, jumpChance = .5 } = {}) {
  const affectionPerSecond = 20;
  const sample = (min, max) => min + random() * (max - min);
  let phase, elapsed, duration, jar, affection, holding, contact, appearance, extended;
  let action, sourceJar, targetJar, jumpId, penalized;
  const history = [];
  function reset() {
    phase = 'hidden'; elapsed = 0; duration = sample(.5, 3);
    jar = -1; affection = 0; holding = false; contact = false; appearance = 0; extended = false;
    action = 'peek'; sourceJar = -1; targetJar = -1; jumpId = 0; penalized = false;
    history.length = 0;
    onAffection?.(0);
  }
  function endPet() { holding = false; contact = false; }
  function rememberPhase() {
    history.push({ phase, duration, jar, appearance, action, sourceJar, targetJar, jumpId });
    if (history.length > 32) history.shift();
  }
  function celebrate() {
    endPet(); phase = 'celebrating'; elapsed = 0; duration = 4.6;
    rememberPhase();
  }
  function transition() {
    elapsed = 0;
    if (phase === 'hidden') {
      const options = [0, 1, 2].filter((index) => index !== jar);
      jar = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
      appearance++;
      extended = false;
      sourceJar = jar; targetJar = jar; penalized = false;
      action = random() < jumpChance ? 'jump' : 'peek';
      if (action === 'jump') {
        jumpId++;
        phase = 'charging'; duration = .85;
      } else {
        phase = 'emerging'; duration = .15;
      }
    } else if (phase === 'emerging') {
      phase = 'waiting'; duration = sample(1.5, 2.5);
    } else if (phase === 'waiting') {
      endPet(); phase = 'retracting'; duration = .15;
    } else if (phase === 'charging') {
      phase = 'launching'; duration = .24;
    } else if (phase === 'launching') {
      phase = 'flying'; duration = 1.10;
    } else if (phase === 'flying') {
      jar = targetJar; phase = 'landing'; duration = .24;
    } else if (phase === 'celebrating') {
      endPet(); phase = 'returning'; duration = 1.1;
      jar = -1; affection = 0; appearance = 0; extended = false;
      action = 'peek'; sourceJar = -1; targetJar = -1; penalized = false;
      onAffection?.(0);
    } else {
      phase = 'hidden'; duration = sample(.5, 3);
    }
    rememberPhase();
  }
  function advance(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    while (seconds > 1e-9) {
      const petting = phase === 'waiting' && holding && contact;
      const timeToFull = petting ? (100 - affection) / affectionPerSecond : Infinity;
      const step = Math.min(seconds, duration - elapsed, timeToFull);
      // Match the phase-deadline tolerance so rounding cannot retract a full cat.
      const reachedFull = petting && timeToFull <= step + 1e-9;
      if (petting) {
        affection = reachedFull ? 100 : Math.min(100, affection + step * affectionPerSecond);
        onAffection?.(affection);
      }
      elapsed += step; seconds -= step;
      if (reachedFull) celebrate();
      else if (elapsed >= duration - 1e-9) transition();
    }
  }
  function beginPet() {
    if (phase !== 'waiting') return false;
    if (!extended) { duration += 1; extended = true; }
    holding = true; contact = true; return true;
  }
  function setContact(value) { contact = holding && Boolean(value); }
  function hitAirborne() {
    if (phase !== 'flying' || penalized) return false;
    penalized = true;
    affection = Math.max(0, affection - 30);
    onAffection?.(affection);
    return true;
  }
  function inspect() {
    const t = Math.min(1, elapsed / duration);
    const smooth = t * t * (3 - 2 * t);
    const progress = ['waiting', 'celebrating', 'flying'].includes(phase) ? 1
      : ['emerging', 'launching'].includes(phase) ? smooth
        : ['retracting', 'landing'].includes(phase) ? 1 - smooth : 0;
    const jumpProgress = phase === 'launching' ? .15 * t
      : phase === 'flying' ? .15 + .7 * t
        : phase === 'landing' ? .85 + .15 * t : 0;
    return { phase, elapsed, duration, remaining: duration - elapsed, jar, appearance, extended,
      affection, holding, petting: phase === 'waiting' && holding && contact, progress,
      action, sourceJar, targetJar, jumpId, penalized, jumpProgress,
      history: history.map((event) => ({ ...event })) };
  }
  reset();
  return { advance, beginPet, setContact, endPet, hitAirborne, reset, inspect };
}
