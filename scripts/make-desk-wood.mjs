// Draws public/desk-wood.svg: the desk the sheet lies on, as a cartoon of a
// pale laminate desk (fine straight grain, a few broad lighter and darker
// streaks, and the odd patch of arched "cathedral" grain).
//
// The tile repeats both ways. Every grain line is a sum of sine waves with a
// whole number of periods across the tile, so it meets itself at the side
// edges; nothing crosses the top or bottom edge.
//
//   node scripts/make-desk-wood.mjs

import { writeFileSync } from 'node:fs';

const W = 1600;
const H = 1000;

// A small seeded generator so the file comes out the same every time.
let seed = 20261116;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);
const TAU = Math.PI * 2;

// The colours, sampled from the photo and pushed a little towards cartoon.
const BASE = '#cdbfa8';
const LIGHT = '#d9cdb8';
const DARK = '#bfae95';
const GRAIN = '#a6937a';
const GRAIN_DARK = '#94806a';

// The way the whole board flows: a gentle wave every line follows.
const flowA = between(0, TAU);
const flowB = between(0, TAU);
const flow = (x) => 16 * Math.sin((TAU * x) / W + flowA) + 7 * Math.sin((2 * TAU * x) / W + flowB);

/** A tiling wave: y0 plus the flow plus a little wobble of its own. */
function wave(y0, wobble = 3) {
  const p = between(0, TAU);
  const k = 2 + Math.floor(rand() * 3);
  return (x) => y0 + flow(x) + wobble * Math.sin((k * TAU * x) / W + p);
}

/** A smooth path through f(x) from 0 to W (Catmull-Rom turned into cubic Béziers). */
function smooth(f, step = 80, from = 0, to = W) {
  const pts = [];
  const dir = to >= from ? 1 : -1;
  for (let x = from; dir * (to - x) > -0.1; x += dir * step) pts.push([x, f(x)]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const parts = [];

// Broad streaks of lighter and darker wood, as flat bands.
const bands = [
  [110, 70, LIGHT],
  [300, 110, DARK],
  [470, 60, LIGHT],
  [650, 90, DARK],
  [840, 70, LIGHT],
];
for (const [y, h, colour] of bands) {
  const top = wave(y, 10);
  const bottom = wave(y + h, 12);
  // Run the bottom edge backwards to close the shape.
  const back = smooth(bottom, 80, W, 0).replace(/^M/, 'L');
  parts.push(`<path d="${smooth(top)} ${back} Z" fill="${colour}"/>`);
}

// The fine grain: long lines with breaks in them, drawn like ink on a cartoon.
const lines = [];
for (let y = 22; y < H - 22; y += between(11, 19)) lines.push(y);

// Two patches of arched grain. Straight grain stops short of them.
const arches = [
  { x: 520, y: 400, n: 7 },
  { x: 1050, y: 820, n: 6 },
];
const inArch = (x, y) =>
  arches.some((a) => {
    const fy = a.y + flow(a.x);
    return x > a.x - a.n * 26 - 30 && x < a.x + 470 && Math.abs(y - fy) < a.n * 11 + 8;
  });

for (const y0 of lines) {
  const f = wave(y0);
  const width = between(1.2, 2.4).toFixed(2);
  const colour = rand() < 0.2 ? GRAIN_DARK : GRAIN;
  const opacity = between(0.35, 0.62).toFixed(2);
  // Split the line into dashes: long runs with short gaps, skipping the arch patches.
  let x = 0;
  while (x < W) {
    const run = between(120, 520);
    const end = Math.min(W, x + run);
    // Trim the run where it enters an arch patch.
    let a = x;
    while (a < end) {
      while (a < end && inArch(a, f(a))) a += 10;
      let b = a;
      while (b < end && !inArch(b, f(b))) b += 10;
      if (b - a > 30) {
        parts.push(
          `<path d="${smooth(f, 40, a, Math.min(b, W))}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`,
        );
      }
      a = b;
    }
    x = end + between(8, 40);
  }
}

// The arches: nested curves pointing left, opening out to the right.
for (const a of arches) {
  const cy = a.y + flow(a.x);
  for (let j = 1; j <= a.n; j++) {
    const tipX = a.x - j * 26;
    const spread = j * 11;
    const endX = a.x + 440 - j * 10;
    const d =
      `M${endX} ${(cy - spread).toFixed(1)} ` +
      `C${a.x + 120} ${(cy - spread).toFixed(1)} ${tipX + 10} ${(cy - spread * 0.85).toFixed(1)} ${tipX} ${cy.toFixed(1)} ` +
      `C${tipX + 10} ${(cy + spread * 0.85).toFixed(1)} ${a.x + 120} ${(cy + spread).toFixed(1)} ${endX} ${(cy + spread).toFixed(1)}`;
    parts.push(
      `<path d="${d}" fill="none" stroke="${j % 3 === 0 ? GRAIN_DARK : GRAIN}" stroke-width="${(j % 2 ? 2 : 1.5).toFixed(1)}" stroke-linecap="round" opacity="0.7"/>`,
    );
  }
}

// A few specks, like the little dents in the photo.
for (let i = 0; i < 6; i++) {
  parts.push(
    `<ellipse cx="${between(60, W - 60).toFixed(0)}" cy="${between(60, H - 60).toFixed(0)}" rx="${between(1.6, 2.6).toFixed(1)}" ry="${between(1, 1.6).toFixed(1)}" fill="${GRAIN_DARK}" opacity="0.6"/>`,
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${BASE}"/>${parts.join('')}</svg>\n`;
writeFileSync(new URL('../public/desk-wood.svg', import.meta.url), svg);
console.log(`public/desk-wood.svg: ${(svg.length / 1024).toFixed(0)} KB, ${parts.length} shapes`);
