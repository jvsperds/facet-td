import { PENTA, Voice } from './engine';

// Cave ambience and a sparse generative music layer. Both run on their own buses and are driven by
// `schedule(until)`, called a few times a second with a look-ahead, so nothing runs per frame.

export type Mood = 'build' | 'wave' | 'boss';

/** Small seeded generator (view-side only; the sim never sees it). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOOD = {
  build: { air: 0.018, cutoff: 380, drone: 0.018, tense: 0, beat: 1.6, density: 0.3 },
  wave: { air: 0.022, cutoff: 520, drone: 0.025, tense: 0.006, beat: 1.2, density: 0.4 },
  boss: { air: 0.026, cutoff: 700, drone: 0.032, tense: 0.016, beat: 0.9, density: 0.5 },
} as const;

export function createAmbience(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  ambienceBus: AudioNode,
  musicBus: AudioNode,
  seed = 7,
) {
  const random = rng(seed);
  // Air: looped noise through a slowly wandering low-pass.
  const air = ctx.createBufferSource();
  air.buffer = noise;
  air.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = 'lowpass';
  airFilter.frequency.value = MOOD.build.cutoff;
  const airGain = ctx.createGain();
  airGain.gain.value = MOOD.build.air;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 140;
  lfo.connect(lfoDepth);
  lfoDepth.connect(airFilter.frequency);
  air.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(ambienceBus);
  // Drone: a root and a fifth, plus a minor second that fades in as tension rises.
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 240;
  const droneGain = ctx.createGain();
  droneGain.gain.value = MOOD.build.drone;
  const tenseGain = ctx.createGain();
  tenseGain.gain.value = 0;
  const oscs = [55, 82.41, 55.2].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 1 ? 'sine' : 'triangle';
    o.frequency.value = f;
    o.connect(droneFilter);
    return o;
  });
  const tense = ctx.createOscillator();
  tense.type = 'sawtooth';
  tense.frequency.value = 58.27;
  tense.connect(tenseGain);
  tenseGain.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(ambienceBus);
  const sources = [air, lfo, tense, ...oscs];
  for (const s of sources) s.start(ctx.currentTime);

  let mood: Mood = 'build';
  let musicOn = true;
  let nextDrip = ctx.currentTime + 1;
  let nextChime = ctx.currentTime + 6;
  let nextBeat = ctx.currentTime + 2;
  let step = 0;

  const drip = (t: number) => {
    const v = new Voice(ctx, noise, ambienceBus, t, 0.5, random() * 1.4 - 0.7);
    const f = 900 + random() * 1400;
    v.tone('sine', f, 0, 0.05, 0.12, { to: f * 1.8 });
    if (random() < 0.5) v.tone('sine', f * 1.3, 0.11, 0.04, 0.05, { to: f * 2.2 });
    v.finish();
  };
  const chime = (t: number) => {
    const v = new Voice(ctx, noise, ambienceBus, t, 0.35, random() * 1.6 - 0.8);
    const base = PENTA[Math.floor(random() * 5)] * 4;
    v.tone('sine', base, 0, 2.2, 0.06, { attack: 0.01 });
    v.tone('sine', base * 2.76, 0, 1.2, 0.025);
    v.finish();
  };
  const note = (t: number) => {
    const m = MOOD[mood];
    if (random() > m.density) return;
    const v = new Voice(ctx, noise, musicBus, t, 0.4, random() * 0.8 - 0.4);
    const deg = Math.floor(random() * 7);
    const f = PENTA[deg % 5] * (deg >= 5 ? 2 : 1);
    if (random() < 0.2) {
      // Pad: two detuned triangles, slow swell.
      v.tone('triangle', f / 2, 0, 3, 0.08, { attack: 0.8, detune: -6 });
      v.tone('triangle', f / 2, 0, 3, 0.08, { attack: 0.8, detune: 6 });
    } else {
      // Mallet: sine with a soft inharmonic overtone.
      v.tone('sine', f, 0, 1.1, 0.16);
      v.tone('sine', f * 4, 0, 0.15, 0.03);
    }
    v.finish();
  };

  return {
    get mood() {
      return mood;
    },
    setMood(next: Mood) {
      if (next === mood) return;
      mood = next;
      const m = MOOD[next];
      const t = ctx.currentTime;
      airGain.gain.setTargetAtTime(m.air, t, 2);
      airFilter.frequency.setTargetAtTime(m.cutoff, t, 2);
      droneGain.gain.setTargetAtTime(m.drone, t, 2);
      tenseGain.gain.setTargetAtTime(m.tense, t, 3);
    },
    setMusic(on: boolean) {
      musicOn = on;
    },
    /** Schedule drips, chimes and music notes up to context time `until`. */
    schedule(until: number) {
      const now = ctx.currentTime;
      // After a suspension, skip ahead instead of firing a backlog.
      if (nextDrip < now) nextDrip = now + random();
      if (nextChime < now) nextChime = now + 2 + random() * 4;
      if (nextBeat < now) nextBeat = now + 0.2;
      while (nextDrip < until) {
        drip(nextDrip);
        nextDrip += 1.5 + random() * 5;
      }
      while (nextChime < until) {
        chime(nextChime);
        nextChime += 9 + random() * 14;
      }
      while (nextBeat < until) {
        if (musicOn && step++ % 8 !== 7) note(nextBeat);
        nextBeat += MOOD[mood].beat;
      }
    },
    stop() {
      for (const s of sources) {
        s.stop();
        s.disconnect();
      }
    },
  };
}
