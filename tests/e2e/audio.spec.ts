import { expect, test } from '@playwright/test';

// Headless browsers play no sound, so render each sound through the real master chain in an
// OfflineAudioContext and check it is audible but never clips. This proves level, not taste.
test('every sound and the ambience render non-silent and unclipped offline', async ({ page }) => {
  test.setTimeout(120_000);
  // A bare same-origin page: the game itself would compete for CPU with the renders.
  await page.goto('/src/audio/engine.ts');
  const rows = await page.evaluate(async () => {
    // Served by the Vite dev server; the paths are variables so tsc doesn't resolve them.
    const load = (path: string) => import(/* @vite-ignore */ path);
    const engine = (await load('/src/audio/engine.ts')) as typeof import('../../src/audio/engine');
    const amb = (await load('/src/audio/ambience.ts')) as typeof import('../../src/audio/ambience');
    const rate = 22050;
    const measure = (buf: AudioBuffer) => {
      let peak = 0;
      let sum = 0;
      let n = 0;
      for (let c = 0; c < buf.numberOfChannels; c++)
        for (const x of buf.getChannelData(c)) {
          peak = Math.max(peak, Math.abs(x));
          sum += x * x;
          n++;
        }
      return { peak, rms: Math.sqrt(sum / n) };
    };
    const out: { name: string; peak: number; rms: number; seconds: number }[] = [];
    const render = async (
      name: string,
      seconds: number,
      build: (ctx: OfflineAudioContext, bus: AudioNode, noise: AudioBuffer) => number | void,
    ) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
      const master = engine.createMasterChain(ctx);
      master.gain.value = 0.8 * 0.6; // default master volume x headroom
      const bus = ctx.createGain();
      bus.gain.value = 0.8; // default effects volume
      bus.connect(master);
      const length = build(ctx, bus, engine.createNoise(ctx)) ?? seconds;
      out.push({ name, seconds: length, ...measure(await ctx.startRendering()) });
    };
    for (const name of engine.SOUND_NAMES)
      await render(name, 3, (ctx, bus, noise) => engine.buildSound(ctx, noise, bus, name, 0.01));
    for (const family of engine.ATTACK_FAMILIES)
      for (const tier of [1, 6])
        await render(`attack ${family} t${tier}`, 1, (ctx, bus, noise) =>
          engine.buildSound(ctx, noise, bus, 'attack', 0.01, { family, tier }),
        );
    // Worst case: 60 attacks inside 0.2 s with no limiter in front, to show the master chain holds.
    await render('stress: 60 stacked attacks', 1, (ctx, bus, noise) => {
      for (let i = 0; i < 60; i++)
        engine.buildSound(ctx, noise, bus, 'attack', 0.01 + i * 0.003, {
          family: engine.ATTACK_FAMILIES[i % 16],
          tier: 6,
        });
    });
    for (const mood of ['build', 'wave', 'boss'] as const)
      await render(`ambience+music ${mood}`, 12, (ctx, bus, noise) => {
        const music = ctx.createGain();
        music.gain.value = 0.5;
        music.connect(bus);
        const a = amb.createAmbience(ctx, noise, bus, music, 3);
        a.setMood(mood);
        a.schedule(12);
      });
    return out;
  });
  const db = (x: number) => (20 * Math.log10(x)).toFixed(1);
  console.log(
    'AUDIO_TABLE\n' +
      rows
        .map(
          (r) =>
            `| ${r.name} | ${r.seconds.toFixed(2)} | ${r.peak.toFixed(3)} (${db(r.peak)} dBFS) | ${r.rms.toFixed(4)} (${db(r.rms)} dBFS) |`,
        )
        .join('\n'),
  );
  for (const r of rows) {
    expect(r.peak, r.name).toBeGreaterThan(0.01);
    expect(r.peak, r.name).toBeLessThan(1);
    expect(r.rms, r.name).toBeGreaterThan(0.0005);
  }
});
