// Original four-finger glove. The middle fingertip is the cursor/contact anchor.
export function createHandCursor(container) {
  const cursor = document.createElement('div');
  cursor.className = 'hand-cursor';
  cursor.dataset.state = 'hidden';
  cursor.hidden = true;
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = `
    <div class="hand-anchor">
      <svg class="hand-pose" viewBox="-12 -3 140 136" focusable="false" aria-hidden="true">
        <g transform="rotate(32 60 64)" fill="#c0f0fb" stroke="#5c33fd" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M 40 27
            C 31 41 26 54 23 69
            C 21 78 15 91 13 100
            C 10 110 19 116 26 110
            C 31 106 35 96 40 85
            C 38 94 34 104 33 110
            C 31 120 43 125 49 115
            C 53 109 56 99 59 90
            C 57 99 53 107 57 112
            C 61 118 69 115 73 108
            C 79 98 82 83 84 69
            C 89 72 96 78 102 79
            C 112 80 116 69 108 63
            C 103 59 96 56 90 50
            C 84 43 80 34 76 27 Z" />
          <path d="M 39 25 C 48 21 68 21 78 26
            C 84 29 84 37 77 40
            C 67 44 47 41 38 37
            C 32 34 33 28 39 25 Z" />
          <path d="M 42 59 L 39 67 M 55 61 L 52 70 M 68 62 L 65 70" fill="none" stroke-width="4.1" />
        </g>
      </svg>
    </div>`;
  container.append(cursor);

  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let position = null;
  let blend = null;
  let active = false;
  let wasPetting = false;
  let tapUntil = 0;
  let tapOrigin = null;
  let disposed = false;

  function hide() {
    cursor.hidden = true;
    cursor.dataset.state = 'hidden';
    cursor.dataset.petting = 'false';
    cursor.classList.remove('is-petting');
    active = false;
    wasPetting = false;
    tapUntil = 0;
    tapOrigin = null;
    position = null;
    blend = null;
  }

  function update({ x, y, visible, petting = false, canPet = true, headX, headY, pointerType = 'mouse' }) {
    if (disposed) return;
    if (!visible || !Number.isFinite(x) || !Number.isFinite(y)) {
      hide();
      return;
    }
    const now = performance.now();
    // A quick click still reads as a short stroke. This visual tail never earns
    // affection, and is cancelled when the cat retreats or the pointer moves.
    if (petting && !wasPetting) {
      tapUntil = now + 280;
      tapOrigin = { x, y };
    }
    wasPetting = petting;
    if (!canPet || (tapOrigin && Math.hypot(x - tapOrigin.x, y - tapOrigin.y) > 16)) tapUntil = 0;
    const nextActive = Boolean(petting || now < tapUntil);
    const target = nextActive && Number.isFinite(headX) && Number.isFinite(headY)
      ? { x: headX, y: headY }
      : { x, y };

    if (nextActive !== active) {
      blend = position ? { ...position, started: now } : null;
      active = nextActive;
      cursor.classList.toggle('is-petting', active);
    }
    if (blend && !motionPreference.matches) {
      const t = Math.min(1, (now - blend.started) / 120);
      const eased = 1 - (1 - t) ** 3;
      position = {
        x: blend.x + (target.x - blend.x) * eased,
        y: blend.y + (target.y - blend.y) * eased,
      };
      if (t === 1) blend = null;
    } else {
      blend = null;
      position = target;
    }
    cursor.dataset.pointerType = pointerType;
    cursor.dataset.state = active ? 'petting' : 'idle';
    cursor.dataset.petting = String(active);
    cursor.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
    cursor.hidden = false;
  }

  function dispose() {
    disposed = true;
    cursor.remove();
  }
  // Sample the glove's actual filled silhouette, including fingertips and palm.
  // Its screen matrix includes responsive size, cursor position, and SVG rotation.
  const contactSamples = [[58,32],[40,52],[59,53],[76,55],[29,77],[45,80],[65,79],
    [16,103],[26,102],[39,113],[48,108],[60,106],[70,97],[84,63],[104,70]];
  function getContactPoints() {
    if (disposed || cursor.hidden) return [];
    const matrix = cursor.querySelector('g').getScreenCTM();
    if (!matrix) return [];
    return contactSamples.map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
  }

  return { update, hide, dispose, getContactPoints };
}
