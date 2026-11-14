/**
 * Jensen-Shannon divergence between two distributions over numbers, in bits:
 * 0 means identical, 1 means nothing in common. Inputs are counts or
 * weights; they are normalised here.
 */
export function jensenShannon(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): number {
  const sum = (m: ReadonlyMap<number, number>) => [...m.values()].reduce((s, x) => s + x, 0);
  const ta = sum(a);
  const tb = sum(b);
  if (ta <= 0 || tb <= 0) return ta <= 0 && tb <= 0 ? 0 : 1;
  const keys = new Set([...a.keys(), ...b.keys()]);
  let js = 0;
  for (const k of keys) {
    const p = (a.get(k) ?? 0) / ta;
    const q = (b.get(k) ?? 0) / tb;
    const m = (p + q) / 2;
    if (p > 0) js += 0.5 * p * Math.log2(p / m);
    if (q > 0) js += 0.5 * q * Math.log2(q / m);
  }
  return Math.min(1, Math.max(0, js));
}
