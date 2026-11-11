// Procedural sound recipes. Everything is synthesised with the Web Audio API (no files: the game
// ships as one offline HTML page). Recipes take any BaseAudioContext so the same code renders in
// the live mixer and in an OfflineAudioContext for measurement.

/** Every sound the game can trigger by name. Later UI work can call `play()` with any of these. */
export const SOUND_NAMES = [
  // Combat
  'attack',
  'impact',
  'kill',
  'kill-elite',
  'kill-boss',
  'leak',
  'castle-low',
  // Building
  'build',
  'stone',
  'keep',
  'combine',
  'upgrade',
  'downgrade',
  'error',
  // Interface
  'ui-click',
  'panel-open',
  'panel-close',
  'count-up',
  'count-down',
  'gold',
  'shell',
  // Waves and outcome
  'wave',
  'boss-wave',
  'clear',
  'clear-leak',
  'perfect',
  'won',
  'lost',
  // Hero
  'cast',
  'cast-heal',
  'cast-buff',
  'cast-whirlwind',
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

/**
 * Attack timbre families: the basic-gem projectile families and the combined-tower attack styles
 * of src/world/effects.ts, plus the field families.
 */
export const ATTACK_FAMILIES = [
  'shard',
  'frost',
  'venom',
  'heavy',
  'arrow',
  'shred',
  'bolt',
  'burn',
  'line',
  'beam',
  'zap',
  'laguna',
  'finger',
  'orb',
  'glob',
  'ray',
] as const;
export type AttackFamily = (typeof ATTACK_FAMILIES)[number];

export interface PlayOptions {
  /** Attack timbre (attack and impact only). */
  family?: AttackFamily;
  /** Tower tier 1..6: higher tiers sound slightly fuller and lower. */
  tier?: number;
  /** Stereo position -1..1. */
  pan?: number;
  /** Extra gain multiplier (default 1). */
  gain?: number;
  /** Pitch multiplier (default 1, plus a little random variation on combat sounds). */
  pitch?: number;
}

/** White noise, created once per context and shared by every voice. */
export function createNoise(ctx: BaseAudioContext, seconds = 2) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  return buffer;
}

/** Builds one voice: sources feed `out`, which goes through an optional panner to the bus. */
export class Voice {
  readonly out: GainNode;
  private nodes: AudioNode[] = [];
  private lastSource: AudioScheduledSourceNode | undefined;
  private lastStop = 0;
  constructor(
    readonly ctx: BaseAudioContext,
    readonly noise: AudioBuffer,
    bus: AudioNode,
    readonly t: number,
    gain: number,
    pan: number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = gain;
    let tail: AudioNode = this.out;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      this.out.connect(p);
      tail = p;
      this.nodes.push(p);
    }
    tail.connect(bus);
  }
  private track(src: AudioScheduledSourceNode, start: number, stop: number) {
    src.start(start);
    src.stop(stop);
    if (stop >= this.lastStop) {
      this.lastStop = stop;
      this.lastSource = src;
    }
  }
  private env(g: GainNode, start: number, attack: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  }
  /** An enveloped oscillator; `to` glides the pitch exponentially over the decay. */
  tone(
    type: OscillatorType,
    freq: number,
    at: number,
    decay: number,
    peak: number,
    opts: { to?: number; attack?: number; detune?: number; dest?: AudioNode } = {},
  ) {
    const start = this.t + at;
    const attack = opts.attack ?? 0.004;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, start + attack + decay);
    if (opts.detune) o.detune.value = opts.detune;
    this.env(g, start, attack, peak, decay);
    o.connect(g);
    g.connect(opts.dest ?? this.out);
    this.nodes.push(o, g);
    this.track(o, start, start + attack + decay + 0.02);
    return o;
  }
  /** A burst of filtered noise. */
  hiss(
    filter: BiquadFilterType,
    freq: number,
    at: number,
    decay: number,
    peak: number,
    opts: { q?: number; to?: number; attack?: number } = {},
  ) {
    const start = this.t + at;
    const attack = opts.attack ?? 0.002;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, start);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, start + attack + decay);
    f.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    this.env(g, start, attack, peak, decay);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    this.nodes.push(src, f, g);
    // Start at a random offset so repeated bursts don't share a waveform.
    src.start(start, Math.random() * (this.noise.duration - 0.5));
    const stop = start + attack + decay + 0.02;
    src.stop(stop);
    if (stop >= this.lastStop) {
      this.lastStop = stop;
      this.lastSource = src;
    }
  }
  /** A small arpeggio of tones. */
  notes(type: OscillatorType, freqs: readonly number[], step: number, decay: number, peak: number) {
    freqs.forEach((f, i) => this.tone(type, f, i * step, decay, peak));
  }
  /** Seconds from now until the voice is silent; disconnects every node then. */
  finish() {
    const nodes = this.nodes;
    const out = this.out;
    if (this.lastSource)
      this.lastSource.onended = () => {
        for (const n of nodes) n.disconnect();
        out.disconnect();
      };
    return this.lastStop - this.t;
  }
}

// Minor pentatonic in A, used by stingers and the music layer.
export const PENTA = [220, 261.63, 293.66, 329.63, 392];
const n = (i: number) => PENTA[((i % 5) + 5) % 5] * 2 ** Math.floor(i / 5);

type Recipe = (v: Voice, o: Required<Pick<PlayOptions, 'tier' | 'pitch'>> & PlayOptions) => void;

/** Attack timbres by family. `p` is pitch, `k` tier fullness 0..1. */
function attack(v: Voice, family: AttackFamily, p: number, k: number) {
  const body = 0.55 + k * 0.45;
  switch (family) {
    case 'shard': // bright glassy ping
      v.tone('triangle', 1700 * p, 0, 0.07, 0.3 * body, { to: 1300 * p });
      v.tone('sine', 3400 * p, 0, 0.04, 0.08);
      break;
    case 'frost': // crystalline, airy
      v.tone('sine', 2200 * p, 0, 0.1, 0.22, { to: 2500 * p });
      v.hiss('highpass', 6000, 0, 0.08, 0.12 * body);
      break;
    case 'venom': // wet blip
      v.tone('sine', 500 * p, 0, 0.09, 0.32 * body, { to: 260 * p });
      v.hiss('bandpass', 1200 * p, 0, 0.05, 0.12, { q: 4 });
      break;
    case 'heavy': // thump
      v.tone('sine', 160 * p * (1 - k * 0.2), 0, 0.12, 0.5 * body, { to: 60 });
      v.hiss('lowpass', 900, 0, 0.06, 0.25);
      break;
    case 'arrow': // quick twang
      v.tone('sawtooth', 900 * p, 0, 0.05, 0.22 * body, { to: 500 * p });
      v.hiss('bandpass', 3000, 0, 0.04, 0.22, { q: 2 });
      break;
    case 'shred': // grinding scrape
      v.hiss('bandpass', 2400 * p, 0, 0.09, 0.55 * body, { q: 3, to: 1200 });
      v.tone('square', 220 * p, 0, 0.05, 0.05);
      break;
    case 'bolt':
    case 'zap': // electric crackle
      v.tone('square', 1200 * p, 0, 0.06, 0.08 * body, { to: 300 * p });
      v.hiss('highpass', 3500, 0, 0.07, 0.28 * body);
      break;
    case 'burn': // fiery whoosh
      v.hiss('bandpass', 700 * p, 0, 0.14, 0.3 * body, { q: 1.2, to: 2200, attack: 0.02 });
      break;
    case 'line': // thin laser tick
      v.tone('sine', 2600 * p, 0, 0.05, 0.3 * body, { to: 1800 * p });
      break;
    case 'beam': // sustained hum
      v.tone('sawtooth', 330 * p, 0, 0.16, 0.08 * body, { attack: 0.02 });
      v.tone('sine', 660 * p, 0, 0.16, 0.12 * body, { attack: 0.02 });
      break;
    case 'laguna':
    case 'finger': // dark magical sweep
      v.tone('sawtooth', 120 * p, 0, 0.26, 0.12 * body, { to: 480 * p, attack: 0.03 });
      v.hiss('bandpass', 900, 0, 0.22, 0.18, { q: 6, to: 3000, attack: 0.03 });
      break;
    case 'orb': // round bubble
      v.tone('sine', 520 * p, 0, 0.12, 0.3 * body, { to: 820 * p });
      v.tone('triangle', 1040 * p, 0, 0.06, 0.06);
      break;
    case 'glob': // lobbed splat
      v.tone('sine', 300 * p, 0, 0.1, 0.32 * body, { to: 180 * p });
      v.hiss('lowpass', 1400, 0, 0.08, 0.15);
      break;
    case 'ray': // descending zip
      v.tone('triangle', 3000 * p, 0, 0.12, 0.32 * body, { to: 700 * p });
      break;
  }
  // Higher tiers add a quiet sub so they feel weightier without getting louder.
  if (k > 0.5) v.tone('sine', 110 * p, 0, 0.08, 0.1 * (k - 0.5));
}

export const RECIPES: Record<SoundName, Recipe> = {
  attack: (v, o) => attack(v, o.family ?? 'shard', o.pitch, (o.tier - 1) / 5),
  impact: (v, o) => {
    v.hiss('bandpass', 1800 * o.pitch, 0, 0.05, 0.25, { q: 1.5 });
    v.tone('sine', 240 * o.pitch, 0, 0.05, 0.15, { to: 120 });
  },
  kill: (v, o) => {
    v.tone('triangle', 880 * o.pitch, 0, 0.07, 0.22, { to: 1320 * o.pitch });
    v.hiss('highpass', 4000, 0, 0.05, 0.08);
  },
  'kill-elite': (v, o) => {
    v.notes('triangle', [880 * o.pitch, 1320 * o.pitch, 1760 * o.pitch], 0.05, 0.12, 0.2);
    v.hiss('bandpass', 2500, 0, 0.18, 0.12, { q: 2 });
  },
  'kill-boss': (v) => {
    v.tone('sine', 90, 0, 1.2, 0.5, { to: 35 });
    v.hiss('lowpass', 800, 0, 1.0, 0.4, { to: 120 });
    v.notes('triangle', [n(5), n(7), n(9), n(10)], 0.12, 0.5, 0.16);
  },
  leak: (v) => {
    v.tone('sine', 70, 0, 0.35, 0.55, { to: 40 });
    v.hiss('lowpass', 500, 0, 0.3, 0.35);
    v.tone('triangle', 180, 0.02, 0.25, 0.18, { to: 120 });
  },
  'castle-low': (v) => {
    for (let i = 0; i < 3; i++) v.tone('square', i % 2 ? 392 : 466, i * 0.2, 0.16, 0.09);
  },
  build: (v) => {
    v.tone('triangle', 1320, 0, 0.12, 0.2, { to: 1500 });
    v.tone('sine', 660, 0, 0.1, 0.18);
  },
  stone: (v) => {
    v.tone('sine', 110, 0, 0.18, 0.45, { to: 60 });
    v.hiss('lowpass', 600, 0, 0.16, 0.35, { to: 200 });
  },
  keep: (v) => {
    v.notes('sine', [n(5), n(7), n(10)], 0.06, 0.3, 0.2);
    v.hiss('highpass', 5000, 0.05, 0.3, 0.05, { attack: 0.05 });
  },
  combine: (v) => {
    v.tone('sine', 300, 0, 0.35, 0.25, { to: 1200, attack: 0.05 });
    v.notes('triangle', [n(10), n(12), n(15)], 0.07, 0.35, 0.16);
    v.hiss('bandpass', 3000, 0, 0.35, 0.08, { q: 3, to: 8000 });
  },
  upgrade: (v) => v.notes('triangle', [n(7), n(9), n(12)], 0.07, 0.25, 0.2),
  downgrade: (v) => v.notes('triangle', [n(12), n(9), n(6)], 0.08, 0.25, 0.18),
  error: (v) => {
    v.tone('square', 150, 0, 0.1, 0.12);
    v.tone('square', 112, 0.1, 0.14, 0.12);
  },
  'ui-click': (v) => {
    v.hiss('bandpass', 3500, 0, 0.02, 0.6, { q: 4 });
    v.tone('sine', 1800, 0, 0.025, 0.15);
  },
  'panel-open': (v) => {
    v.hiss('bandpass', 1200, 0, 0.12, 0.3, { q: 2, to: 3500, attack: 0.03 });
    v.tone('sine', 660, 0, 0.08, 0.08, { to: 990 });
  },
  'panel-close': (v) => {
    v.hiss('bandpass', 3500, 0, 0.1, 0.3, { q: 2, to: 1200, attack: 0.02 });
    v.tone('sine', 990, 0, 0.08, 0.08, { to: 660 });
  },
  'count-up': (v, o) => v.tone('sine', 1400 * o.pitch, 0, 0.04, 0.25),
  'count-down': (v, o) => v.tone('sine', 1000 * o.pitch, 0, 0.04, 0.25),
  gold: (v, o) => {
    v.tone('triangle', 2093 * o.pitch, 0, 0.05, 0.18);
    v.tone('triangle', 2637 * o.pitch, 0.03, 0.06, 0.14);
  },
  shell: (v) => {
    v.notes('triangle', [n(10), n(12), n(14), n(15)], 0.07, 0.3, 0.16);
    v.hiss('highpass', 7000, 0, 0.5, 0.04, { attack: 0.1 });
  },
  wave: (v) => {
    v.tone('sawtooth', 110, 0, 0.6, 0.12, { attack: 0.08 });
    v.notes('triangle', [n(0), n(2), n(5)], 0.12, 0.3, 0.2);
  },
  'boss-wave': (v) => {
    v.tone('sawtooth', 55, 0, 1.4, 0.2, { attack: 0.1 });
    v.tone('sawtooth', 58.3, 0, 1.4, 0.16, { attack: 0.1 });
    v.tone('sine', 110, 0, 0.9, 0.3, { to: 55 });
    v.hiss('lowpass', 300, 0, 1.2, 0.25, { attack: 0.3 });
  },
  clear: (v) => v.notes('sine', [n(5), n(7), n(10)], 0.09, 0.3, 0.22),
  'clear-leak': (v) => {
    v.tone('sine', 70, 0, 0.3, 0.45, { to: 40 });
    v.notes('sine', [n(5), n(7), n(10)], 0.09, 0.3, 0.2);
  },
  perfect: (v) => {
    v.notes('sine', [n(5), n(7), n(10), n(12), n(15)], 0.08, 0.45, 0.2);
    v.hiss('highpass', 6000, 0.1, 0.6, 0.05, { attack: 0.1 });
  },
  won: (v) => {
    v.notes('triangle', [n(5), n(7), n(10), n(12), n(15)], 0.14, 0.6, 0.2);
    v.tone('sine', 110, 0, 1.6, 0.2, { attack: 0.2 });
  },
  lost: (v) => {
    v.notes('triangle', [n(7), n(4), n(2), n(0)], 0.22, 0.6, 0.2);
    v.tone('sine', 55, 0, 1.8, 0.3, { attack: 0.2 });
  },
  cast: (v) => {
    v.hiss('bandpass', 600, 0, 0.3, 0.5, { q: 3, to: 3000, attack: 0.05 });
    v.tone('triangle', 440, 0, 0.3, 0.25, { to: 880 });
  },
  'cast-heal': (v) => {
    v.notes('sine', [n(10), n(12), n(14)], 0.08, 0.5, 0.18);
    v.hiss('highpass', 5000, 0, 0.6, 0.05, { attack: 0.2 });
  },
  'cast-buff': (v) => {
    v.tone('sawtooth', 220, 0, 0.4, 0.08, { to: 440, attack: 0.05 });
    v.notes('triangle', [n(5), n(9)], 0.1, 0.3, 0.18);
  },
  'cast-whirlwind': (v) => {
    v.hiss('bandpass', 400, 0, 0.7, 0.35, { q: 4, to: 2500, attack: 0.15 });
    v.hiss('bandpass', 1600, 0.2, 0.5, 0.2, { q: 4, to: 500 });
  },
};

/** Build one sound into `bus` at time `t`. Returns its length in seconds. */
export function buildSound(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  bus: AudioNode,
  name: SoundName,
  t: number,
  options: PlayOptions = {},
) {
  const v = new Voice(ctx, noise, bus, t, options.gain ?? 1, options.pan ?? 0);
  RECIPES[name](v, { ...options, tier: options.tier ?? 1, pitch: options.pitch ?? 1 });
  return v.finish();
}

/** Master chain: gain -> compressor -> limiter-style compressor -> destination. */
export function createMasterChain(ctx: BaseAudioContext) {
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  master.connect(comp);
  comp.connect(limiter);
  limiter.connect(ctx.destination);
  return master;
}
