/**
 * 95% Wilson score interval for a binomial proportion k/n.
 *
 * Preferred over the textbook normal ("Wald") interval because BlunderLab's
 * proportions are often near 0 or 1 with small n (detector precision on a
 * few dozen labels, mistake rates per bucket). There the Wald interval
 * collapses to zero width or leaves [0, 1]; Wilson stays inside [0, 1] and
 * keeps sensible coverage. Returns null for n = 0.
 */
export function wilsonInterval(k: number, n: number, z = 1.959964): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
