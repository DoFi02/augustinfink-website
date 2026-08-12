// Kreisverkehr + Schleppkurven-Animation (Sattelzug)
// Proportionen aus der Referenz: Insel 0.538 R, Schraffurring bis 0.726 R, Kreisfahrbahn 0.274 R
const fs = require('fs');

// ---------- Entwurfsparameter (Meter) ----------
const R_ICD   = 26.0;
const R_APRON = 0.726 * R_ICD;
const R_ISL   = 0.538 * R_ICD;
const W_ENT   = 4.85;                 // +10 %
const W_EXT   = 5.50;                 // +10 %
const D_ENT   = -8.0;
const D_EXT   = +8.0;
const R_ENT   = 9.0;
const R_EXT   = 14.0;
const S_NOSE  = R_ICD + 1.2;
const S_MERGE = R_ICD + 42;

// Sattelzug
const TR_W = 2.55;                    // Breite
const TR_FRONT = 5.8;                 // Kupplung -> Front Zugmaschine
const TR_BACK = 0.7;                  // Kupplung -> Heck Zugmaschine
const TL_LEN = 11.8;                  // Kupplung -> Heck Auflieger
const TL_AXLE = 9.0;                  // Kupplung -> Achse Auflieger (Tractrix)

// Animation: Takt = Zeit, die ein LKW hell leuchtet (bestimmt die Fahrgeschwindigkeit)
const STEP = 0.80;
const SP_CURVE = 18.5;                // LKW-Abstand in Kurven (m) – knapp über Fahrzeuglänge 17.6
const SP_LINE  = 30;                  // LKW-Abstand auf Geraden (m)

// ---------- Darstellung ----------
const S = 6.6, CX = 1105, CY = 450, W = 1600, H = 900;
const X = m => CX + m * S, Y = m => CY + m * S, f = n => n.toFixed(1);
const rot = d => d * Math.PI / 180;
const frame = th => ({ u: { x: Math.cos(th), y: Math.sin(th) }, p: { x: -Math.sin(th), y: Math.cos(th) } });

const LEGS = [
  { th: rot(-45),  zebra: true },
  { th: rot(45)   },                                            // Einfahrt LKW (unten rechts)
  { th: rot(-135) },
  { th: rot(135),  zebra: true, bend: -1, L1: 45, Rc: 120, turn: 28 }, // Ausfahrt LKW (unten links)
];

function axis(leg, s) {
  const { u, p } = frame(leg.th);
  if (!leg.bend || s <= leg.L1) return { x: u.x * s, y: u.y * s, tx: u.x, ty: u.y };
  const A = { x: u.x * leg.L1, y: u.y * leg.L1 };
  const Q = { x: A.x + p.x * leg.bend * leg.Rc, y: A.y + p.y * leg.bend * leg.Rc };
  const maxPhi = rot(leg.turn);
  const phi = Math.min((s - leg.L1) / leg.Rc, maxPhi) * leg.bend;
  const c = Math.cos(phi), sn = Math.sin(phi);
  const vx = A.x - Q.x, vy = A.y - Q.y;
  let px = Q.x + vx * c - vy * sn, py = Q.y + vx * sn + vy * c;
  const tx = u.x * c - u.y * sn, ty = u.x * sn + u.y * c;
  const over = (s - leg.L1) - maxPhi * leg.Rc;
  if (over > 0) { px += tx * over; py += ty * over; }
  return { x: px, y: py, tx, ty };
}
const at = (leg, s, d) => { const a = axis(leg, s); return { x: a.x - a.ty * d, y: a.y + a.tx * d }; };

function fillet(leg, d, r) {
  const { u, p } = frame(leg.th);
  const beta = d + Math.sign(d) * r;
  const alpha = Math.sqrt((R_ICD + r) ** 2 - beta ** 2);
  const g = (a, b) => ({ x: u.x * a + p.x * b, y: u.y * a + p.y * b });
  const k = R_ICD / (R_ICD + r), P = g(alpha, beta);
  return { P, r, d, beta, alpha, Tc: { x: P.x * k, y: P.y * k }, Tl: g(alpha, d),
           thetaC: Math.atan2(P.y * k, P.x * k) };
}
const smoothstep = t => t * t * (3 - 2 * t);
function curbOff(fl, s, wLane) {
  const final = Math.sign(fl.d) * wLane;
  if (s <= fl.alpha) return fl.beta - Math.sign(fl.d) * Math.sqrt(Math.max(0, fl.r ** 2 - (s - fl.alpha) ** 2));
  const t = Math.min(1, (s - fl.alpha) / (S_MERGE - fl.alpha));
  return fl.d + (final - fl.d) * smoothstep(t);
}
function arc(P, r, A, B) {
  const a0 = Math.atan2(A.y - P.y, A.x - P.x), a1 = Math.atan2(B.y - P.y, B.x - P.x);
  let d = a1 - a0;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  return `A ${f(r * S)} ${f(r * S)} 0 ${Math.abs(d) > Math.PI ? 1 : 0} ${d > 0 ? 1 : 0} ${f(X(B.x))} ${f(Y(B.y))}`;
}
const poly = pts => pts.map((q, i) => `${i ? 'L' : 'M'} ${f(X(q.x))} ${f(Y(q.y))}`).join(' ');

const out = [], defs = [];
const push = (cls, d) => out.push(`<path class="${cls}" d="${d}"/>`);
const S_MAX = 320;
const F = LEGS.map(leg => ({ leg, ent: fillet(leg, D_ENT, R_ENT), ext: fillet(leg, D_EXT, R_EXT) }));

// ---- Fahrbahnränder ----
for (const g of F) {
  for (const [key, wl] of [['ent', W_ENT], ['ext', W_EXT]]) {
    const fl = g[key], pts = [];
    for (let s = fl.alpha; s <= S_MAX; s += 0.7) pts.push(at(g.leg, s, curbOff(fl, s, wl)));
    push('curb', `M ${f(X(fl.Tc.x))} ${f(Y(fl.Tc.y))} ${arc(fl.P, fl.r, fl.Tc, fl.Tl)} ${poly(pts).replace(/^M/, 'L')}`);
  }
}
// ---- Kreisfahrbahn ----
const marks = [];
F.forEach(g => { marks.push({ a: g.ext.thetaC, t: 'ext' }); marks.push({ a: g.ent.thetaC, t: 'ent' }); });
marks.sort((a, b) => a.a - b.a);
for (let i = 0; i < marks.length; i++) {
  const A = marks[i], B = marks[(i + 1) % marks.length];
  if (!(A.t === 'ext' && B.t === 'ent')) continue;
  const pa = { x: R_ICD * Math.cos(A.a), y: R_ICD * Math.sin(A.a) };
  const pb = { x: R_ICD * Math.cos(B.a), y: R_ICD * Math.sin(B.a) };
  push('curb', `M ${f(X(pa.x))} ${f(Y(pa.y))} ${arc({ x: 0, y: 0 }, R_ICD, pa, pb)}`);
}
// ---- Insel + Schraffurring ----
const ringPath =
  `M ${f(X(-R_APRON))} ${f(Y(0))} A ${f(R_APRON*S)} ${f(R_APRON*S)} 0 1 0 ${f(X(R_APRON))} ${f(Y(0))} ` +
  `A ${f(R_APRON*S)} ${f(R_APRON*S)} 0 1 0 ${f(X(-R_APRON))} ${f(Y(0))} Z ` +
  `M ${f(X(-R_ISL))} ${f(Y(0))} A ${f(R_ISL*S)} ${f(R_ISL*S)} 0 1 0 ${f(X(R_ISL))} ${f(Y(0))} ` +
  `A ${f(R_ISL*S)} ${f(R_ISL*S)} 0 1 0 ${f(X(-R_ISL))} ${f(Y(0))} Z`;
defs.push(`<clipPath id="ring" clipPathUnits="userSpaceOnUse"><path d="${ringPath}" clip-rule="evenodd"/></clipPath>`);
const hr = R_APRON * S;
let hatch = '';
for (let y = CY - hr; y <= CY + hr; y += 7) hatch += `<line x1="${f(CX-hr)}" y1="${f(y)}" x2="${f(CX+hr)}" y2="${f(y)}"/>`;
out.push(`<g class="hatch" clip-path="url(#ring)">${hatch}</g>`);
out.push(`<circle class="curb"  cx="${CX}" cy="${CY}" r="${f(R_APRON * S)}"/>`);
out.push(`<circle class="apron" cx="${CX}" cy="${CY}" r="${f(R_ISL * S)}"/>`);

// ---- Sperrflächen-Keile ----
F.forEach((g, gi) => {
  const L = [], R = [];
  for (let s = S_NOSE; s <= S_MERGE; s += 0.7) {
    L.push(at(g.leg, s, curbOff(g.ent, s, W_ENT) + W_ENT));
    R.push(at(g.leg, s, curbOff(g.ext, s, W_EXT) - W_EXT));
  }
  const tip = at(g.leg, S_MERGE, 0);
  const rNose = (Math.hypot(L[0].x, L[0].y) + Math.hypot(R[0].x, R[0].y)) / 2;
  const d = `${poly(L)} L ${f(X(tip.x))} ${f(Y(tip.y))} ${poly(R.slice().reverse()).replace(/^M[^L]*L/, 'L')} ${arc({x:0,y:0}, rNose, R[0], L[0])} Z`;
  push('island', d);
  defs.push(`<clipPath id="gore${gi}" clipPathUnits="userSpaceOnUse"><path d="${d}"/></clipPath>`);
  let gh = '';
  for (let k = -460; k <= 460; k += 9) gh += `<line x1="${f(CX+k)}" y1="${f(CY-480)}" x2="${f(CX+k+480)}" y2="${f(CY+480)}"/>`;
  out.push(`<g class="gorehatch" clip-path="url(#gore${gi})">${gh}</g>`);
});
// ---- Wartelinien ----
for (const g of F) {
  const sY = R_ICD + 1.9, o = curbOff(g.ent, sY, W_ENT);
  push('yield', `M ${f(X(at(g.leg, sY, o + W_ENT).x))} ${f(Y(at(g.leg, sY, o + W_ENT).y))} L ${f(X(at(g.leg, sY, o + 0.2).x))} ${f(Y(at(g.leg, sY, o + 0.2).y))}`);
}
// ---- Fußgängerüberwege (zwei Zufahrten) ----
for (const g of F) {
  if (!g.leg.zebra) continue;
  const sz = R_ICD + 15, half = 2.4;
  for (const [key, wl] of [['ent', W_ENT], ['ext', W_EXT]]) {
    const outer = curbOff(g[key], sz, wl), inner = outer + (outer < 0 ? wl : -wl);
    const lo = Math.min(outer, inner) + 0.2, hi = Math.max(outer, inner) - 0.2, n = 5;
    push('crossbed', `${poly([at(g.leg, sz-half, lo), at(g.leg, sz-half, hi), at(g.leg, sz+half, hi), at(g.leg, sz+half, lo)])} Z`);
    for (let i = 0; i < n; i++) {
      const o1 = lo + (hi - lo) * (i / n), o2 = o1 + ((hi - lo) / n) * 0.58;
      push('zebra', `${poly([at(g.leg, sz-half, o1), at(g.leg, sz-half, o2), at(g.leg, sz+half, o2), at(g.leg, sz+half, o1)])} Z`);
    }
  }
}
// ---- Mittellinien ----
for (const g of F) {
  const pts = [];
  for (let s = S_MERGE + 2; s <= S_MAX; s += 0.9) pts.push(axis(g.leg, s));
  push('centre', poly(pts));
}

// ============================================================
//  SCHLEPPKURVE: Fahrweg unten rechts -> um die Insel -> unten links
// ============================================================
const IN = F[1], OUT = F[3];
const Rmid = (R_ICD + R_APRON) / 2;
let raw = [];
for (let s = 105; s >= R_ICD + 1.0; s -= 0.5) raw.push(at(IN.leg, s, curbOff(IN.ent, s, W_ENT) + W_ENT / 2));
let a0 = IN.ent.thetaC, a1 = OUT.ext.thetaC;
while (a1 > a0) a1 -= 2 * Math.PI;                       // Fahrtrichtung: SVG-Winkel nimmt ab
for (let a = a0; a >= a1; a -= 0.012) raw.push({ x: Rmid * Math.cos(a), y: Rmid * Math.sin(a) });
for (let s = R_ICD + 1.0; s <= 105; s += 0.5) raw.push(at(OUT.leg, s, curbOff(OUT.ext, s, W_EXT) - W_EXT / 2));

// Knicke an den Übergängen glätten
for (let it = 0; it < 90; it++)
  for (let i = 1; i < raw.length - 1; i++)
    raw[i] = { x: raw[i].x * 0.5 + (raw[i-1].x + raw[i+1].x) * 0.25,
               y: raw[i].y * 0.5 + (raw[i-1].y + raw[i+1].y) * 0.25 };

// gleichmäßig nach Bogenlänge neu abtasten
const DS = 0.2, path = [raw[0]];
let carry = 0;
for (let i = 1; i < raw.length; i++) {
  let dx = raw[i].x - raw[i-1].x, dy = raw[i].y - raw[i-1].y;
  let seg = Math.hypot(dx, dy);
  if (seg < 1e-9) continue;
  let t = (DS - carry) / seg;
  while (t <= 1) { path.push({ x: raw[i-1].x + dx * t, y: raw[i-1].y + dy * t }); t += DS / seg; }
  carry = (1 - (t - DS / seg)) * seg;
}
// Kurs + Krümmung
const head = path.map((p, i) => {
  const a = path[Math.max(0, i-1)], b = path[Math.min(path.length-1, i+1)];
  const L = Math.hypot(b.x-a.x, b.y-a.y) || 1;
  return { x: (b.x-a.x)/L, y: (b.y-a.y)/L };
});
const curv = head.map((h, i) => {
  if (i === 0) return 0;
  let d = Math.atan2(h.y, h.x) - Math.atan2(head[i-1].y, head[i-1].x);
  while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI;
  return Math.abs(d) / DS;
});
// Auflieger per Tractrix
const trail = [];
let T = { x: path[0].x - head[0].x * TL_AXLE, y: path[0].y - head[0].y * TL_AXLE };
for (let i = 0; i < path.length; i++) {
  const K = path[i];
  let dx = K.x - T.x, dy = K.y - T.y, L = Math.hypot(dx, dy) || 1;
  dx /= L; dy /= L;
  T = { x: K.x - dx * TL_AXLE, y: K.y - dy * TL_AXLE };
  trail.push({ x: dx, y: dy });
}

// Schleppkurven-Hüllkurven (Führungslinien)
const corners = [[], [], [], []];
for (let i = 0; i < path.length; i++) {
  const K = path[i], h = head[i], t = trail[i];
  const nh = { x: -h.y, y: h.x }, nt = { x: -t.y, y: t.x };
  corners[0].push({ x: K.x + h.x*TR_FRONT + nh.x*TR_W/2, y: K.y + h.y*TR_FRONT + nh.y*TR_W/2 });
  corners[1].push({ x: K.x + h.x*TR_FRONT - nh.x*TR_W/2, y: K.y + h.y*TR_FRONT - nh.y*TR_W/2 });
  corners[2].push({ x: K.x - t.x*TL_LEN + nt.x*TR_W/2, y: K.y - t.y*TL_LEN + nt.y*TR_W/2 });
  corners[3].push({ x: K.x - t.x*TL_LEN - nt.x*TR_W/2, y: K.y - t.y*TL_LEN - nt.y*TR_W/2 });
}
corners.forEach(c => push('swept', poly(c.filter((_, i) => i % 5 === 0))));
push('trajectory', poly(path.filter((_, i) => i % 5 === 0)));

// LKW-Positionen: enge Abstände in Kurven, weite auf Geraden
const slots = [];
let acc = 1e9;
for (let i = 0; i < path.length; i++) {
  const r = curv[i] > 1e-6 ? 1 / curv[i] : 1e9;
  const sp = r < 30 ? SP_CURVE : r > 200 ? SP_LINE : SP_CURVE + (SP_LINE - SP_CURVE) * ((r - 30) / 170);
  acc += DS;
  if (acc >= sp) { slots.push(i); acc = 0; }
}

// LKW zeichnen
const rect = (P, d, back, front, hw) => {
  const n = { x: -d.y, y: d.x };
  return poly([
    { x: P.x + d.x*front + n.x*hw, y: P.y + d.y*front + n.y*hw },
    { x: P.x + d.x*front - n.x*hw, y: P.y + d.y*front - n.y*hw },
    { x: P.x - d.x*back  - n.x*hw, y: P.y - d.y*back  - n.y*hw },
    { x: P.x - d.x*back  + n.x*hw, y: P.y - d.y*back  + n.y*hw }]) + ' Z';
};
const N = slots.length, stepPct = 100 / N;
slots.forEach((idx, k) => {
  const K = path[idx], h = head[idx], t = trail[idx];
  const nt = { x: -t.y, y: t.x };
  const axleA = { x: K.x - t.x*TL_AXLE, y: K.y - t.y*TL_AXLE };
  const g = [
    `<path class="tb" d="${rect(K, t, TL_LEN, 0.5, TR_W/2)}"/>`,                       // Auflieger
    `<path class="tb" d="${rect(K, h, TR_BACK, TR_FRONT, TR_W/2)}"/>`,                 // Zugmaschine
    `<path class="td" d="${rect({x:K.x+h.x*4.5,y:K.y+h.y*4.5}, h, 1.5, 1.2, TR_W/2-0.15)}"/>`, // Kabine
    `<path class="td" d="M ${f(X(axleA.x - nt.x*TR_W/2))} ${f(Y(axleA.y - nt.y*TR_W/2))} L ${f(X(axleA.x + nt.x*TR_W/2))} ${f(Y(axleA.y + nt.y*TR_W/2))}"/>`,
  ].join('');
  out.push(`<g class="truck" style="animation-delay:${(k * STEP).toFixed(2)}s">${g}</g>`);
});

const keyframes = `@keyframes pass{
0%{opacity:1} ${(stepPct).toFixed(2)}%{opacity:.5} ${(2*stepPct).toFixed(2)}%{opacity:.2}
${(3*stepPct).toFixed(2)}%{opacity:0} 100%{opacity:0}}`;

// ---------- Ausgabe ----------
const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${defs.join('')}</defs>
<rect x="0" y="0" width="${W}" height="${H}" fill="#000"/>
${out.join('\n')}
</svg>`;

const css = `
html,body{margin:0;height:100%;background:#0a0a0a}
.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center}
svg{width:min(96vw,1600px);height:auto;background:#000;display:block;border:1px solid #262626}
path,circle,line{vector-effect:non-scaling-stroke}
.curb  {fill:none;stroke:#fff;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
.apron {fill:none;stroke:#fff;stroke-width:1.6}
.hatch line{stroke:#fff;stroke-width:.9;opacity:.4}
.island{fill:none;stroke:#fff;stroke-width:1.5;stroke-linejoin:round}
.gorehatch line{stroke:#fff;stroke-width:.8;opacity:.3}
.yield {fill:none;stroke:#fff;stroke-width:1.6;stroke-dasharray:4 3.5;opacity:.85}
.crossbed{fill:#fff;opacity:.10;stroke:#fff;stroke-width:.9;stroke-opacity:.45}
.zebra {fill:#fff;stroke:none;opacity:1}
.centre{fill:none;stroke:#fff;stroke-width:1.2;opacity:.5;stroke-dasharray:14 11}
.swept {fill:none;stroke:#4d7cff;stroke-width:1;opacity:.22}
.trajectory{fill:none;stroke:#4d7cff;stroke-width:1.1;opacity:.35;stroke-dasharray:9 7}
.truck {opacity:0;animation:pass ${(N*STEP).toFixed(2)}s linear infinite;
        filter:drop-shadow(0 0 3px rgba(90,140,255,.7))}
.tb {fill:rgba(45,85,225,.30);stroke:#8fb0ff;stroke-width:1.5;stroke-linejoin:round}
.td {fill:none;stroke:#8fb0ff;stroke-width:1;opacity:.85}
${keyframes}`;

fs.writeFileSync('/private/tmp/claude-501/-Users-dominikfink-Documents-Claude/f6aaf0d0-9a8f-4ebf-ad78-7b0eaa4e1f18/scratchpad/kvp.html',
`<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kreisverkehr – Schleppkurve</title><style>${css}</style></head>
<body><div class="wrap">${svg}</div></body></html>`);
console.log('ok | LKW:', N, '| Umlauf', ((a0 - a1) * 180 / Math.PI).toFixed(0) + '°',
            '| Weg', (path.length * DS).toFixed(0) + ' m | Zyklus', (N * STEP).toFixed(1) + 's',
            '| sichtbar/LKW', (3 * STEP).toFixed(1) + 's',
            '| Tempo', ((path.length * DS) / (N * STEP) * 3.6).toFixed(0) + ' km/h');
