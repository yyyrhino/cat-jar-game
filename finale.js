const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (from, to, value) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const mix = (from, to, progress) => from + (to - from) * progress;

/** A viewport light effect driven by the same clock as the cat's finale. */
export function createFinaleLight(container) {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const root = doc.createElement('div');
  root.className = 'finale-light';
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;

  const glows = [];
  const cores = [];
  for (let index = 0; index < 2; index += 1) {
    const glow = doc.createElement('div');
    glow.className = 'finale-glow';
    root.append(glow);
    glows.push(glow);
  }
  for (let index = 0; index < 2; index += 1) {
    const core = doc.createElement('div');
    core.className = 'finale-eye';
    root.append(core);
    cores.push(core);
  }
  const wash = doc.createElement('div');
  wash.className = 'finale-wash';
  root.append(wash);
  // The effect must also cover the HUD, regardless of the stage's stacking context.
  doc.body.append(root);

  let previousPhase = null;
  let disposed = false;
  const setPhase = (phase) => {
    if (phase === previousPhase) return;
    previousPhase = phase;
    root.dataset.phase = phase;
  };

  function setWash(opacity) {
    const value = clamp(opacity).toFixed(4);
    wash.style.opacity = value;
    root.dataset.wash = value;
  }

  function reset() {
    if (disposed) return;
    root.hidden = true;
    setPhase('hidden');
    setWash(0);
    for (const element of [...glows, ...cores]) element.style.opacity = '0';
  }

  function update({ phase, elapsed = 0, eyes = [], reducedMotion = false } = {}) {
    if (disposed) return;
    if (phase !== 'celebrating' && phase !== 'returning') {
      if (!root.hidden) reset();
      return;
    }

    const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
    root.hidden = false;
    setPhase(phase);
    root.dataset.motion = reducedMotion ? 'reduced' : 'full';

    if (phase === 'returning') {
      // The scene resets under a completely opaque veil, then gently reappears.
      setWash(1 - smooth(0.12, 1.1, time));
      for (const element of [...glows, ...cores]) element.style.opacity = '0';
      return;
    }

    const glowOpacity = smooth(1.2, 1.85, time);
    const coreOpacity = smooth(1.2, 1.62, time);
    const spread = reducedMotion ? 0 : smooth(2.0, 3.65, time);
    const viewportWidth = win.innerWidth;
    const viewportHeight = win.innerHeight;

    for (let index = 0; index < 2; index += 1) {
      const eye = eyes[index];
      const glow = glows[index];
      const core = cores[index];
      if (!eye || !Number.isFinite(eye.x) || !Number.isFinite(eye.y)) {
        glow.style.opacity = '0';
        core.style.opacity = '0';
        continue;
      }

      const width = Math.max(4, Number.isFinite(eye.width) ? eye.width : 28);
      const height = Math.max(4, Number.isFinite(eye.height) ? eye.height : 40);
      const radius = mix(Math.max(24, width * 0.95),
        Math.hypot(viewportWidth, viewportHeight) * 1.4, spread);

      glow.style.transform = `translate3d(${eye.x}px, ${eye.y}px, 0) scale(${radius / 128})`;
      glow.style.opacity = glowOpacity.toFixed(4);
      core.style.width = `${width}px`;
      core.style.height = `${height}px`;
      core.style.transform = `translate3d(${eye.x}px, ${eye.y}px, 0) translate(-50%, -50%)`;
      core.style.opacity = coreOpacity.toFixed(4);
    }

    // Spatial diffusion arrives first; the final veil only finishes the outer edges.
    setWash(reducedMotion ? smooth(2.0, 3.65, time) : smooth(3.05, 3.65, time));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.remove();
  }

  reset();
  return { update, reset, dispose };
}
