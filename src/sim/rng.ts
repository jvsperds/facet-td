/** Seeded PRNG (mulberry32). Integer math only, so every engine produces the same stream. */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }
  /** Uniform 32-bit unsigned integer. */
  u32() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** Integer in [lo, hi], like Dota's RandomInt. */
  int(lo: number, hi: number) {
    return lo + (this.u32() % (hi - lo + 1));
  }
}
