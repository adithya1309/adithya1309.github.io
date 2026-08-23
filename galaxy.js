/* -- galaxy generator ----------------------------------------
   Three.js's galaxy demo, in 2D canvas. The effect is polar maths
   plus additive blending, neither of which needs WebGL.
   ponytail: no three.js - 'lighter' composite IS additive blending.  */

const CFG = {
  branches: 3,
  spin: 0.85,          // radians of twist per unit radius
  randomness: 0.34,
  randomPower: 3,      // clusters particles toward the arm centre-line
  thickness: 0.16,     // disc height as a fraction of radius
  focal: 5.2,
  color: '#e39bf3'     // fixed lilac; additive blending does the rest
};

/* One camera pose per section, grouped by track. ox pushes the disc
   into the half the slab does NOT occupy; centred sections use ox 0
   and a bigger dolly so the galaxy glows through the panel instead. */
const HERO_POSE  = { yaw: 0.00, tilt: 0.62, dolly: 1.00, ox: 0.00, oy: 0.00 };
const TRACK_POSES = {
  about: [
    { yaw: 1.30, tilt: 0.08, dolly: 1.25, ox: 0.27, oy:-0.05 },  // bio       slab L
    { yaw: 2.60, tilt:-0.55, dolly: 0.85, ox:-0.28, oy: 0.08 },  // studying  slab R
    { yaw: 3.90, tilt: 1.15, dolly: 1.10, ox: 0.29, oy: 0.07 }   // interests slab L
  ],
  experience: [
    { yaw: 1.60, tilt:-0.40, dolly: 1.30, ox: 0.00, oy:-0.06 },  // work      centred
    { yaw: 3.20, tilt: 0.85, dolly: 1.50, ox: 0.00, oy: 0.06 }   // research  centred
  ],
  projects: [
    { yaw: 1.10, tilt: 0.30, dolly: 1.35, ox: 0.00, oy:-0.05 },
    { yaw: 2.90, tilt:-0.75, dolly: 1.20, ox: 0.00, oy: 0.05 },
    { yaw: 4.70, tilt: 1.05, dolly: 1.55, ox: 0.00, oy: 0.00 }
  ],
  glass: [
    { yaw: 2.20, tilt: 0.20, dolly: 1.00, ox: 0.27, oy:-0.04 },  // overview     slab L
    { yaw: 3.60, tilt:-0.45, dolly: 1.35, ox: 0.00, oy:-0.05 },  // mission      centred
    { yaw: 5.05, tilt: 0.95, dolly: 1.15, ox: 0.00, oy: 0.06 },  // goals + focus centred
    { yaw: 6.60, tilt:-0.20, dolly: 0.95, ox: 0.00, oy: 0.00 }   // five windows  centred
  ]
};
let camViews = [], poses = [];

const cv = document.getElementById('field');
const ctx = cv.getContext('2d', { alpha: true });
const sprite = new Image();
sprite.src = 'assets/star-particle.png';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let W, H, cx, cy, zoom, dpr, ps = [], glow = null, running = true;

/* Tint the sprite once. drawImage cannot colourise, and doing it per
   particle per frame would be fatal at these counts. */
function makeGlow(){
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.drawImage(sprite, 0, 0, 64, 64);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = CFG.color;
  g.fillRect(0, 0, 64, 64);
  glow = c;
}

function build(){
  W = innerWidth; H = innerHeight;
  // Additive blending is fill-rate bound, so cap DPR harder than usual.
  dpr = Math.min(devicePixelRatio || 1, W * H > 1600000 ? 1.25 : 1.6);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = W / 2; cy = H / 2;
  zoom = Math.min(W, H) / 11;

  // Small particles cost little fill each, so the count can go high.
  const count = Math.round(Math.min(6000, Math.max(1400, (W * H) / 420)));
  ps = new Array(count);
  for (let i = 0; i < count; i++){
    const r = Math.pow(Math.random(), 1.4) * 5;              // denser inward
    const branch = (i % CFG.branches) / CFG.branches * Math.PI * 2;
    const spin = r * CFG.spin;
    const rnd = () => Math.pow(Math.random(), CFG.randomPower)
                    * (Math.random() < 0.5 ? 1 : -1) * CFG.randomness * (r + 0.4);
    ps[i] = {
      x: Math.cos(branch + spin) * r + rnd(),
      y: rnd() * CFG.thickness * 6,
      z: Math.sin(branch + spin) * r + rnd(),
      s: 0.45 + Math.random() * 1.15,
      a: 0.16 + Math.random() * 0.42
    };
  }
}

const lerp = (a, b, k) => a + (b - a) * k;

/* Where the viewport centre sits between section centres, as a float.
   Ties the camera to the actual sections rather than raw page height,
   so the notes block at the bottom does not skew the mapping. */
function camera(){
  if (poses.length < 2) return HERO_POSE;
  const mid = scrollY + H / 2;
  let f = camViews.length - 1;
  for (let i = 0; i < camViews.length - 1; i++){
    const a = camViews[i].offsetTop + camViews[i].offsetHeight / 2;
    const b = camViews[i + 1].offsetTop + camViews[i + 1].offsetHeight / 2;
    if (mid <= a){ f = i; break; }
    if (mid < b){ f = i + (mid - a) / (b - a); break; }
  }
  const i = Math.max(0, Math.min(poses.length - 2, Math.floor(f)));
  const raw = Math.max(0, Math.min(1, f - i));
  const k = raw * raw * (3 - 2 * raw);                        // smoothstep
  const A = poses[i], B = poses[i + 1];
  return {
    yaw:   lerp(A.yaw,   B.yaw,   k),
    tilt:  lerp(A.tilt,  B.tilt,  k),
    dolly: lerp(A.dolly, B.dolly, k),
    ox:    lerp(A.ox,    B.ox,    k),
    oy:    lerp(A.oy,    B.oy,    k)
  };
}

function frame(t){
  if (!running) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';   // the additive blend

  const c = camera();
  const yaw = c.yaw + (reduce ? 0 : t * 0.00003);   // always drifting
  const ct = Math.cos(c.tilt), st = Math.sin(c.tilt);
  const ca = Math.cos(yaw),    sa = Math.sin(yaw);
  const m  = Math.min(W, H);
  const px = cx + c.ox * m, py = cy + c.oy * m;
  const sc = zoom * c.dolly;
  const rs = (zoom / 26) * c.dolly;

  for (let i = 0; i < ps.length; i++){
    const p = ps[i];
    const x1 =  p.x * ca + p.z * sa;          // rotate about the galactic axis
    const z1 = -p.x * sa + p.z * ca;
    const y2 =  p.y * ct - z1 * st;           // tilt toward the viewer
    const z2 =  p.y * st + z1 * ct;

    const persp = CFG.focal / (CFG.focal + z2);
    if (persp <= 0) continue;                 // behind the camera

    const sx = px + x1 * sc * persp;
    const sy = py + y2 * sc * persp;
    const r  = p.s * persp * rs;
    if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;

    ctx.globalAlpha = p.a * persp;
    ctx.drawImage(glow, sx - r, sy - r, r * 2, r * 2);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // ponytail: additive blending is order-independent, so no depth sort.
  if (!reduce) requestAnimationFrame(frame);
}

sprite.onload = () => { makeGlow(); build(); requestAnimationFrame(frame); };
addEventListener('resize', () => { build(); if (reduce) requestAnimationFrame(frame); });
// Under reduced motion there is no loop, so scrolling has to repaint.
addEventListener('scroll', () => { if (reduce) requestAnimationFrame(frame); }, { passive: true });
// Stop burning frames on a tab nobody is looking at.
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running && !reduce) requestAnimationFrame(frame);
});

/* -- tracks: each tab owns the whole scrollable page below ---- */
const tabs   = [...document.querySelectorAll('.tabs button')];
const tracks = [...document.querySelectorAll('.track')];
const hero   = document.getElementById('home');

function setTrack(name, jump){
  tracks.forEach(t => t.hidden = t.dataset.track !== name);
  tabs.forEach(b => b.setAttribute('aria-current', String(b.dataset.track === name)));
  const active = tracks.find(t => t.dataset.track === name);
  // Camera list and pose list are rebuilt together so they stay the same length.
  camViews = [hero, ...active.querySelectorAll('section.view')];
  poses    = [HERO_POSE, ...TRACK_POSES[name]];
  if (jump) active.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (reduce) requestAnimationFrame(frame);
}

tabs.forEach(b => b.addEventListener('click', () => setTrack(b.dataset.track, true)));
setTrack('about', false);
