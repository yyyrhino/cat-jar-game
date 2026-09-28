import * as T from './vendor/three.module.js';
import { createPeekGame } from './gameplay.js';
import { createHandCursor } from './hand.js';

// The scene deliberately keeps the approved cat and the enlarged jar opening.
// Colors are unlit, so these values remain the visual identity of the game.
const PALETTE = {
  background: '#000000',
  ceramic: '#38BAEB',
  cavity: '#123B64',
  outline: '#5C33FD',
  cat: '#000000',
  eyes: '#C0F1FC',
};

export async function createGameScene(container, { onReady, onInteract, onAffection } = {}) {
  const { PI } = Math;
  const clamp = T.MathUtils.clamp;
  const lerp = T.MathUtils.lerp;
  const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const scene = new T.Scene();
  scene.background = new T.Color(PALETTE.background);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'default' });
  canvas.setAttribute('aria-label', '小猫会从三个蓝色罐子中探头，按住露出的猫头可以抚摸。');
  canvas.setAttribute('role', 'img');
  container.appendChild(canvas);
  const hand = createHandCursor(container);

  const camera = new T.OrthographicCamera(-6.9, 6.9, 2.6, -2.6, 0.1, 40);
  const pitch = 0.105;
  const geometries = new Set();
  const materials = new Set();
  const outlines = [];
  const geometry = (value) => { geometries.add(value); return value; };
  const material = (value) => { materials.add(value); return value; };
  const basic = (color, options = {}) => material(new T.MeshBasicMaterial({ color, toneMapped: false, ...options }));
  let outlineWidth = 0.05;
  let width = 1;
  let height = 1;
  let worldHeight = 5.2;
  let alive = true;
  let disposed = false;
  let dirty = true;
  let animationFrame = 0;

  const rimY = 2.365;
  const catBase = 0.90;
  const wallGap = 0.052;
  const cavity = [];
  const jarCurves = [
    [[.17, .49], [.35, .67], [.67, .98], [1.05, 1.06]],
    [[1.05, 1.06], [1.43, 1.14], [1.78, 1.03], [1.98, .91]],
    [[1.98, .91], [2.08, .85], [2.14, .82], [2.22, .82]],
    [[2.22, .82], [2.255, .82], [2.30, .82], [2.33, .82]],
    [[2.33, .82], [2.35, .82], [rimY, .835], [rimY, .845]],
  ];
  for (const curve of jarCurves) for (let j = 0; j < 40; j++) {
    const t = j / 40;
    const u = 1 - t;
    cavity.push([0, 1].map((k) => u ** 3 * curve[0][k] + 3 * u * u * t * curve[1][k] + 3 * u * t * t * curve[2][k] + t ** 3 * curve[3][k]));
  }
  cavity.push([rimY, .845]);
  function cavityRadius(y) {
    if (y <= cavity[0][0]) return cavity[0][1];
    if (y >= rimY) return cavity.at(-1)[1];
    let lo = 0;
    let hi = cavity.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cavity[mid][0] > y) hi = mid; else lo = mid; }
    return lerp(cavity[lo][1], cavity[hi][1], (y - cavity[lo][0]) / (cavity[hi][0] - cavity[lo][0]));
  }
  function constrainedRadius(r, cap) {
    const start = cap * .90;
    if (r <= start) return r;
    const span = cap - start;
    return start + span * (1 - Math.exp(-(r - start) / span));
  }
  function fittedRadius(r, y) {
    if (y <= rimY) return constrainedRadius(r, cavityRadius(y) - wallGap);
    const held = constrainedRadius(r, cavity.at(-1)[1] - wallGap);
    return lerp(held, r, ease((y - rimY - .055) / .65));
  }

  // Back-face hulls create real depth-tested contours, not a flat glow effect.
  // The cat's extrusion fades at the lip, preventing an artificial purple collar.
  function outline(sourceGeometry, { cat = false } = {}) {
    const uniforms = { thickness: { value: outlineWidth }, lipHeight: { value: rimY } };
    const hullMaterial = basic(PALETTE.outline, { side: T.BackSide });
    hullMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.outlineThickness = uniforms.thickness;
      shader.uniforms.lipHeight = uniforms.lipHeight;
      shader.vertexShader = 'uniform float outlineThickness;\nuniform float lipHeight;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float contourWeight = ${cat ? 'smoothstep(lipHeight - 0.025, lipHeight + 0.09, position.y)' : '1.0'};
        transformed += normalize(normal) * outlineThickness * contourWeight;
      `);
    };
    hullMaterial.customProgramCacheKey = () => cat ? 'cat-contour-v1' : 'jar-contour-v1';
    const mesh = new T.Mesh(sourceGeometry, hullMaterial);
    mesh.name = cat ? 'cat-purple-contour' : 'jar-purple-contour';
    mesh.raycast = () => {};
    outlines.push(uniforms);
    return mesh;
  }

  const jarPoints = [new T.Vector2(0, .025), new T.Vector2(.47, .025), new T.Vector2(.51, .04), new T.Vector2(.55, .08)];
  for (const [y, r] of cavity) { if (y > 2.31) break; jarPoints.push(new T.Vector2(r + .074, y)); }
  jarPoints.push(new T.Vector2(.900, 2.32), new T.Vector2(.905, 2.338), new T.Vector2(.892, 2.36), new T.Vector2(.870, rimY));
  const exteriorPoints = jarPoints.map((p) => p.clone());
  const innerStart = jarPoints.length;
  for (const [y, r] of [...cavity].reverse()) jarPoints.push(new T.Vector2(r, y));
  jarPoints.push(new T.Vector2(0, .17), new T.Vector2(0, .025));
  const jarGeometry = geometry(new T.LatheGeometry(jarPoints, 128));
  const exteriorGeometry = geometry(new T.LatheGeometry(exteriorPoints, 128));
  const jarColors = [];
  const blue = new T.Color(PALETTE.ceramic);
  const darkBlue = new T.Color(PALETTE.cavity);
  for (let segment = 0; segment <= 128; segment++) for (let j = 0; j < jarPoints.length; j++) {
    const point = jarPoints[j];
    const color = j >= innerStart ? darkBlue.clone().lerp(blue, .11 * ease((point.y - 1.90) / .46)) : blue;
    jarColors.push(color.r, color.g, color.b);
  }
  jarGeometry.setAttribute('color', new T.Float32BufferAttribute(jarColors, 3));
  const jarMaterial = basic('#ffffff', { vertexColors: true });
  const rimMaterial = basic(PALETTE.outline);
  const rimGeometry = geometry(new T.TorusGeometry(.878, 1, 10, 128));
  // Torus tube thickness is rebuilt on resize because its world thickness tracks pixels.
  const jars = [];
  const rimLines = [];
  for (const x of [-3.7, 0, 3.7]) {
    const group = new T.Group();
    group.position.x = x;
    scene.add(group);
    const jar = new T.Mesh(jarGeometry, jarMaterial);
    jar.name = x === 0 ? 'center-jar' : x < 0 ? 'left-jar' : 'right-jar';
    group.add(jar, outline(exteriorGeometry));
    const rim = new T.Mesh(rimGeometry, rimMaterial);
    rim.name = 'purple-mouth-line';
    rim.rotation.x = PI / 2;
    rim.position.y = rimY + .008;
    group.add(rim);
    rimLines.push(rim);
    jars.push(jar);
  }

  const cat = new T.Group();
  cat.name = 'jelly-cat';
  scene.add(cat);
  const parts = [];
  const black = basic(PALETTE.cat);
  const eyeMaterial = basic(PALETTE.eyes);
  const profile = [[0, .39], [.04, .50], [.13, .64], [.32, .77], [.60, .83], [.87, .82], [1.15, .77], [1.44, .69], [1.72, .65], [1.97, .65], [2.13, .60], [2.25, .49], [2.34, .32], [2.39, .12], [2.40, 0]];
  function radiusAt(y) {
    if (y <= 0) return profile[0][1];
    if (y >= 2.4) return 0;
    let i = 0;
    while (profile[i + 1][0] < y) i++;
    const a = profile[i], b = profile[i + 1], p = profile[Math.max(0, i - 1)], n = profile[Math.min(profile.length - 1, i + 2)];
    const h = b[0] - a[0], t = (y - a[0]) / h;
    const m0 = (b[1] - p[1]) / (b[0] - p[0]), m1 = (n[1] - a[1]) / (n[0] - a[0]);
    return Math.max(0, (2 * t ** 3 - 3 * t * t + 1) * a[1] + (t ** 3 - 2 * t * t + t) * h * m0 + (-2 * t ** 3 + 3 * t * t) * b[1] + (t ** 3 - t * t) * h * m1);
  }
  function earRise(x, y, z) {
    const g = clamp((y - 1.98) / .25, 0, 1);
    return .43 * g * g * (3 - 2 * g) * Math.exp(-((z / .31) ** 2)) * (Math.exp(-(((x - .47) / .16) ** 2)) + Math.exp(-(((x + .47) / .16) ** 2)));
  }
  function addPart(name, points, indices, partMaterial) {
    const partGeometry = geometry(new T.BufferGeometry());
    partGeometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    partGeometry.setIndex(indices);
    partGeometry.computeVertexNormals();
    const mesh = new T.Mesh(partGeometry, partMaterial);
    mesh.name = name;
    cat.add(mesh);
    const part = { mesh, geometry: partGeometry, rest: new Float32Array(points) };
    parts.push(part);
    return part;
  }
  const bodyPoints = [], bodyIndices = [];
  const rings = 120, sides = 96;
  for (let i = 0; i < rings; i++) {
    const y = 2.4 * i / rings, r = radiusAt(y);
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * PI * 2, x = r * Math.cos(angle), z = r * .8 * Math.sin(angle);
      bodyPoints.push(x, y + earRise(x, y, z), z);
    }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
    bodyIndices.push(a, c, b, b, c, d);
  }
  const bottom = bodyPoints.length / 3;
  bodyPoints.push(0, 0, 0);
  const top = bodyPoints.length / 3;
  bodyPoints.push(0, 2.4, 0);
  for (let j = 0; j < sides; j++) {
    const next = (j + 1) % sides;
    bodyIndices.push(bottom, j, next, top, (rings - 1) * sides + next, (rings - 1) * sides + j);
  }
  const body = addPart('black-cat-body', bodyPoints, bodyIndices, black);
  const catOutline = outline(body.geometry, { cat: true });
  cat.add(catOutline);

  function surfacePoint(x, y, offset) {
    let lo = Math.max(0, y - .55), hi = Math.min(2.399, y);
    for (let i = 0; i < 18; i++) {
      const q = (lo + hi) / 2, r = radiusAt(q), z = .8 * Math.sqrt(Math.max(.0001, r * r - x * x));
      if (q + earRise(x, q, z) > y) hi = q; else lo = q;
    }
    const q = (lo + hi) / 2, r = radiusAt(q);
    return [x, y, .8 * Math.sqrt(Math.max(.0001, r * r - x * x)) + offset];
  }
  function eye(side, pupil) {
    const points = [], closed = [], indices = [], radialSteps = 16, segments = 64;
    const cx = side * .294 + (pupil ? .007 : 0), cy = 1.925 + (pupil ? .02 : 0);
    const rx = pupil ? .197 : .246, ry = pupil ? .286 : .346;
    const vertex = (u, v) => {
      points.push(...surfacePoint(cx + rx * u, cy + ry * v, pupil ? .020 : .012));
      const ex = side * .294 + (pupil ? .18 : .235) * u;
      const ey = 1.925 + .105 * (1 - u * u) + (pupil ? .002 : .022) * v;
      closed.push(...surfacePoint(ex, ey, pupil ? .020 : .016));
    };
    vertex(0, 0);
    for (let ring = 1; ring <= radialSteps; ring++) for (let j = 0; j < segments; j++) {
      const angle = j / segments * PI * 2;
      vertex(ring / radialSteps * Math.cos(angle), ring / radialSteps * Math.sin(angle));
    }
    for (let j = 0; j < segments; j++) indices.push(0, 1 + j, 1 + (j + 1) % segments);
    for (let ring = 0; ring < radialSteps - 1; ring++) for (let j = 0; j < segments; j++) {
      const a = 1 + ring * segments + j, b = 1 + ring * segments + (j + 1) % segments, c = a + segments, d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
    const part = addPart(`${pupil ? 'pupil' : 'eye'}-${side}`, points, indices, pupil ? black : eyeMaterial);
    part.closed = new Float32Array(closed);
    part.pupil = pupil;
  }
  for (const side of [-1, 1]) { eye(side, false); eye(side, true); }

  const gameplay = createPeekGame({ onAffection });
  let peek = gameplay.inspect();
  let pointerId = null;
  let pointerPosition = null;
  let enjoy = 0;
  let visibleCompression = 0;
  let wallExcess = -Infinity;
  let last = performance.now();
  let paused = document.hidden;

  function deform() {
    visibleCompression = 0;
    wallExcess = -Infinity;
    cat.visible = peek.phase !== 'hidden';
    cat.position.x = [-3.7, 0, 3.7][Math.max(0, peek.jar)];
    for (const part of parts) {
      const positions = part.geometry.attributes.position;
      if (part.pupil) part.mesh.visible = enjoy < .72;
      for (let i = 0; i < part.rest.length; i += 3) {
        const blend = (offset) => part.closed ? lerp(part.rest[i + offset], part.closed[i + offset], enjoy) : part.rest[i + offset];
        let px = blend(0), pz = blend(2);
        const y = blend(1) + catBase;
        // A soft vertical compression keeps the entire hidden cat above the floor.
        // Collision fitting happens in jar-local space, before moving between jars.
        const py = .22 + (y - .22) * lerp(.54, 1, peek.progress);
        const radius = Math.hypot(px, pz), fitted = fittedRadius(radius, py), factor = radius > 0 ? fitted / radius : 1;
        px *= factor; pz *= factor;
        positions.array[i] = px;
        positions.array[i + 1] = py;
        positions.array[i + 2] = pz;
        if (py <= rimY) wallExcess = Math.max(wallExcess, Math.hypot(px, pz) - cavityRadius(py));
        else visibleCompression = Math.max(visibleCompression, radius - fitted);
      }
      positions.needsUpdate = true;
      part.geometry.computeVertexNormals();
      part.geometry.computeBoundingSphere();
    }
    container.dataset.wallExcess = Number.isFinite(wallExcess) ? wallExcess.toFixed(5) : 'clear';
  }

  const raycaster = new T.Raycaster(), pointer = new T.Vector2();
  function visibleCatHit(event) {
    if (peek.phase !== 'waiting' || !cat.visible) return null;
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    scene.updateMatrixWorld();
    const hitMeshes = [...jars, ...rimLines, ...parts.filter((part) => part.mesh.visible).map((part) => part.mesh)];
    const hits = raycaster.intersectObjects(hitMeshes, false);
    return hits.length && parts.some((part) => part.mesh === hits[0].object) ? hits[0] : null;
  }
  function clearCapture() {
    const previous = pointerId;
    pointerId = null;
    if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
  }
  function syncHand() {
    const rect = canvas.getBoundingClientRect();
    const visible = Boolean(pointerPosition && alive && !disposed && !paused
      && pointerPosition.clientX >= rect.left && pointerPosition.clientX <= rect.right
      && pointerPosition.clientY >= rect.top && pointerPosition.clientY <= rect.bottom);
    const crown = new T.Vector3([-3.7, 0, 3.7][Math.max(0, peek.jar)], catBase + 2.40, .16).project(camera);
    hand.update({
      x: pointerPosition?.clientX ?? 0, y: pointerPosition?.clientY ?? 0,
      headX: rect.left + (crown.x + 1) * rect.width / 2,
      headY: rect.top + (1 - crown.y) * rect.height / 2,
      visible, petting: peek.petting, canPet: peek.phase === 'waiting', pointerType: pointerPosition?.pointerType ?? 'mouse',
    });
    canvas.style.cursor = visible ? 'none' : 'default';
  }
  // Flush elapsed time before an input changes contact, avoiding backdated credit.
  function update(now = performance.now()) {
    // An input can run after the timestamp of an already queued animation frame.
    now = Math.max(now, last);
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    if (paused || disposed || !alive) { hand.hide(); return; }
    const previous = peek;
    gameplay.advance(dt);
    peek = gameplay.inspect();
    if (!peek.holding && pointerId !== null) clearCapture();
    if (pointerId !== null && pointerPosition) gameplay.setContact(Boolean(visibleCatHit(pointerPosition)));
    peek = gameplay.inspect();
    const target = peek.petting ? 1 : 0;
    const previousEnjoy = enjoy;
    enjoy += (target - enjoy) * (1 - Math.exp(-dt * 24));
    if (Math.abs(enjoy - target) < .001) enjoy = target;
    if (previous.progress !== peek.progress || previous.jar !== peek.jar || previous.phase !== peek.phase || previousEnjoy !== enjoy) dirty = true;
    container.dataset.phase = peek.phase;
    container.dataset.jar = String(peek.jar);
    container.dataset.interaction = peek.petting ? 'petting' : 'idle';
    syncHand();
  }
  function pointerDown(event) {
    if (!alive || paused || pointerId !== null || event.button !== 0) return;
    update();
    pointerPosition = { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType };
    if (!visibleCatHit(event) || !gameplay.beginPet()) { syncHand(); return; }
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    peek = gameplay.inspect();
    syncHand();
    onInteract?.({ type: 'pet' });
    event.preventDefault();
  }
  function pointerMove(event) {
    if (pointerId !== null && event.pointerId !== pointerId) return;
    update();
    pointerPosition = { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType };
    if (pointerId !== null) gameplay.setContact(Boolean(visibleCatHit(event)));
    peek = gameplay.inspect();
    syncHand();
  }
  function release(event) {
    if (event?.pointerId !== undefined && pointerId !== null && event.pointerId !== pointerId) return;
    update();
    gameplay.endPet();
    clearCapture();
    peek = gameplay.inspect();
    container.dataset.interaction = 'idle';
    if (event?.pointerType === 'touch' || event?.type === 'pointercancel') pointerPosition = null;
    syncHand();
  }
  function pointerLeave() {
    update();
    pointerPosition = null;
    gameplay.setContact(false);
    peek = gameplay.inspect();
    syncHand();
  }
  function loseFocus() {
    release();
    pointerPosition = null;
    syncHand();
  }
  function visibilityChanged() {
    release();
    paused = document.hidden;
    if (paused) pointerPosition = null;
    last = performance.now();
    syncHand();
  }
  canvas.addEventListener('pointerenter', pointerMove);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerleave', pointerLeave);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', loseFocus);
  document.addEventListener('visibilitychange', visibilityChanged);

  let currentRimGeometry = rimGeometry;
  function resize() {
    if (disposed) return;
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    worldHeight = Math.max(5.2, (width < 600 ? 11.0 : 13.8) / aspect);
    const worldWidth = worldHeight * aspect;
    renderer.setSize(width, height, false);
    camera.left = -worldWidth / 2; camera.right = worldWidth / 2;
    camera.top = worldHeight / 2; camera.bottom = -worldHeight / 2;
    const targetY = worldHeight * .40 / Math.cos(pitch);
    camera.position.set(0, targetY + Math.sin(pitch) * 12, Math.cos(pitch) * 12);
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const pixels = width < 600 ? 2.4 : 4.6;
    outlineWidth = Math.min(.080, pixels * worldWidth / width);
    for (const uniforms of outlines) uniforms.thickness.value = outlineWidth;
    const nextRim = geometry(new T.TorusGeometry(.878, outlineWidth * .48, 10, 128));
    for (const rim of rimLines) rim.geometry = nextRim;
    geometries.delete(currentRimGeometry);
    currentRimGeometry.dispose();
    currentRimGeometry = nextRim;
    dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  deform();
  renderer.render(scene, camera);
  container.dataset.ready = 'true';
  container.dataset.interaction = 'idle';

  function frame(now) {
    if (!alive || disposed) return;
    update(now);
    if (dirty) { deform(); renderer.render(scene, camera); dirty = false; }
    animationFrame = requestAnimationFrame(frame);
  }
  function contextLost(event) {
    event.preventDefault();
    alive = false;
    cancelAnimationFrame(animationFrame);
    release();
    container.dataset.ready = 'false';
    container.dataset.error = 'webgl-context-lost';
    onInteract?.({ type: 'error', reason: 'webgl-context-lost' });
  }
  canvas.addEventListener('webglcontextlost', contextLost);
  animationFrame = requestAnimationFrame(frame);

  function reset() {
    if (disposed) return;
    release();
    gameplay.reset();
    peek = gameplay.inspect();
    enjoy = 0;
    pointerPosition = null;
    hand.hide();
    last = performance.now();
    container.dataset.phase = 'hidden';
    container.dataset.jar = '-1';
    deform();
    renderer.render(scene, camera);
    container.dataset.interaction = 'idle';
    dirty = false;
  }
  function inspectFit() {
    let excess = -Infinity, lowest = Infinity, highest = -Infinity, samples = 0;
    function sample(x, y, z) {
      lowest = Math.min(lowest, y); highest = Math.max(highest, y);
      if (y >= .17 && y <= rimY) { excess = Math.max(excess, Math.hypot(x, z) - cavityRadius(y)); samples++; }
    }
    for (const part of parts) {
      const points = part.geometry.attributes.position.array, indices = part.geometry.index.array;
      for (let i = 0; i < points.length; i += 3) sample(points[i], points[i + 1], points[i + 2]);
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        sample((points[a] + points[b] + points[c]) / 3, (points[a + 1] + points[b + 1] + points[c + 1]) / 3, (points[a + 2] + points[b + 2] + points[c + 2]) / 3);
        for (const [v, w] of [[a, b], [b, c], [c, a]]) {
          sample((points[v] + points[w]) / 2, (points[v + 1] + points[w + 1]) / 2, (points[v + 2] + points[w + 2]) / 2);
          if ((points[v + 1] - rimY) * (points[w + 1] - rimY) < 0) {
            const t = (rimY - points[v + 1]) / (points[w + 1] - points[v + 1]);
            sample(lerp(points[v], points[w], t), rimY, lerp(points[v + 2], points[w + 2], t));
          }
        }
      }
    }
    const screenCenter = new T.Vector3(cat.position.x, .22 + (catBase + 1.95 - .22) * lerp(.54, 1, peek.progress), .5).project(camera);
    return {
      wallExcess: Number.isFinite(excess) ? excess : null,
      visibleCompression, lowest, highest, samples, rimHeight: rimY,
      jarCount: jars.length, palette: { ...PALETTE }, petting: peek.petting,
      progress: peek.progress,
      catScreenPoint: { x: (screenCenter.x + 1) * width / 2, y: (1 - screenCenter.y) * height / 2 },
      outlineWorldWidth: outlineWidth,
    };
  }
  function dispose() {
    if (disposed) return;
    release();
    disposed = true;
    alive = false;
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointerenter', pointerMove);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerleave', pointerLeave);
    document.removeEventListener('visibilitychange', visibilityChanged);
    canvas.removeEventListener('pointerup', release);
    canvas.removeEventListener('pointercancel', release);
    canvas.removeEventListener('lostpointercapture', release);
    canvas.removeEventListener('webglcontextlost', contextLost);
    window.removeEventListener('blur', loseFocus);
    hand.dispose();
    for (const value of geometries) value.dispose();
    for (const value of materials) value.dispose();
    renderer.dispose();
    canvas.remove();
    container.dataset.ready = 'false';
  }
  const api = { reset, dispose, inspectFit, inspectGame: () => ({ ...gameplay.inspect(), enjoy, paused }) };
  container.dataset.phase = peek.phase;
  container.dataset.jar = String(peek.jar);
  onReady?.({ jarCount: 3, palette: { ...PALETTE } });
  return api;
}
