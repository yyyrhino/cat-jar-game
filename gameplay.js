// Time is measured in active, foreground seconds. Each peek has a sampled
// deadline, with one extra second granted by its first successful pet.
export function createPeekGame({ random = Math.random, onAffection } = {}) {
  const sample = (min, max) => min + random() * (max - min);
  let phase, elapsed, duration, jar, affection, holding, contact, appearance, extended;
  const history = [];
  function reset() {
    phase = 'hidden'; elapsed = 0; duration = sample(.5, 3);
    jar = -1; affection = 0; holding = false; contact = false; appearance = 0; extended = false;
    history.length = 0;
    onAffection?.(0);
  }
  function endPet() { holding = false; contact = false; }
  function transition() {
    elapsed = 0;
    if (phase === 'hidden') {
      const options = [0, 1, 2].filter((index) => index !== jar);
      jar = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
      appearance++;
      extended = false;
      phase = 'emerging'; duration = .15;
    } else if (phase === 'emerging') {
      phase = 'waiting'; duration = sample(1.5, 2.5);
    } else if (phase === 'waiting') {
      endPet(); phase = 'retracting'; duration = .15;
    } else {
      phase = 'hidden'; duration = sample(.5, 3);
    }
    history.push({ phase, duration, jar, appearance });
    if (history.length > 32) history.shift();
  }
  function advance(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    while (seconds > 1e-9) {
      const step = Math.min(seconds, duration - elapsed);
      if (phase === 'waiting' && holding && contact && affection < 100) {
        affection = Math.min(100, affection + step);
        onAffection?.(affection);
      }
      elapsed += step; seconds -= step;
      if (elapsed >= duration - 1e-9) transition();
    }
  }
  function beginPet() {
    if (phase !== 'waiting') return false;
    if (!extended) { duration += 1; extended = true; }
    holding = true; contact = true; return true;
  }
  function setContact(value) { contact = holding && Boolean(value); }
  function inspect() {
    const t = Math.min(1, elapsed / duration);
    const smooth = t * t * (3 - 2 * t);
    const progress = phase === 'waiting' ? 1 : phase === 'emerging' ? smooth : phase === 'retracting' ? 1 - smooth : 0;
    return { phase, elapsed, duration, remaining: duration - elapsed, jar, appearance, extended,
      affection, holding, petting: phase === 'waiting' && holding && contact, progress,
      history: history.map((event) => ({ ...event })) };
  }
  reset();
  return { advance, beginPet, setContact, endPet, reset, inspect };
}
