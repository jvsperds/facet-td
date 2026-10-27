const coefficients = new Map<number, number>();
/** Solve the increasing-per-failure distribution for the requested long-run proc chance. */
export function procCoefficient(percent: number) {
  if (percent >= 100) return 1;
  if (percent <= 0) return 0;
  if (coefficients.has(percent)) return coefficients.get(percent)!;
  const target = percent / 100;
  let low = 0,
    high = target;
  for (let iteration = 0; iteration < 48; iteration++) {
    const c = (low + high) / 2;
    let survival = 1,
      mean = 0;
    for (let n = 1; survival > 1e-15; n++) {
      mean += survival;
      survival *= 1 - Math.min(1, n * c);
    }
    if (1 / mean > target) high = c;
    else low = c;
  }
  const c = (low + high) / 2;
  coefficients.set(percent, c);
  return c;
}
