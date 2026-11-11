import { afterEach, expect, test, vi } from 'vitest';
import { createAudio, MAX_VOICES, SOUND_NAMES, VOLUME_KEY, ATTACK_FAMILIES } from '../src/audio';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type Node = {
  kind: string;
  outs: Node[];
  connect: (n: Node) => void;
  disconnect: () => void;
  [k: string]: unknown;
};
const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(function (this: { value: number }, v: number) {
    this.value = v;
  }),
});

/** A minimal AudioContext that records nodes and connections. */
function mockContext() {
  const created: Node[] = [];
  const contexts: MockContext[] = [];
  const node = (kind: string, extra: Record<string, unknown> = {}): Node => {
    const n: Node = {
      kind,
      outs: [],
      connect(to: Node) {
        n.outs.push(to);
      },
      disconnect: vi.fn(() => {
        n.outs = [];
      }),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
      ...extra,
    };
    created.push(n);
    return n;
  };
  class MockContext {
    state = 'running';
    currentTime = 1;
    sampleRate = 8000;
    destination = node('destination');
    resume = vi.fn(() => Promise.resolve());
    suspend = vi.fn(() => Promise.resolve());
    close = vi.fn(() => Promise.resolve());
    constructor() {
      contexts.push(this);
    }
    createGain() {
      return node('gain', { gain: param() });
    }
    createOscillator() {
      return node('osc', { frequency: param(), detune: param(), type: '' });
    }
    createBiquadFilter() {
      return node('filter', { frequency: param(), Q: param(), type: '' });
    }
    createBufferSource() {
      return node('buffer', { buffer: null, loop: false });
    }
    createStereoPanner() {
      return node('pan', { pan: param() });
    }
    createDynamicsCompressor() {
      return node('comp', {
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
      });
    }
    createBuffer(_c: number, length: number) {
      const data = new Float32Array(length);
      return { duration: length / 8000, getChannelData: () => data };
    }
  }
  return { MockContext, created, contexts };
}

function setup(stored: Record<string, string> = {}) {
  const store = { ...stored };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: vi.fn((k: string, v: string) => (store[k] = v)),
  });
  const mock = mockContext();
  vi.stubGlobal('AudioContext', mock.MockContext);
  return { ...mock, store };
}

/** Follows connections from a node to see whether it reaches `target`. */
const reaches = (from: Node, target: Node, seen = new Set<Node>()): boolean =>
  from === target ||
  (!seen.has(from) && (seen.add(from), from.outs.some((n) => reaches(n, target, seen))));

test('audio unlocks lazily and routes buses through compressors to the destination', () => {
  const { created, contexts } = setup();
  const audio = createAudio();
  expect(audio.play('wave')).toBe(false);
  expect(contexts).toHaveLength(0);
  audio.unlock();
  audio.unlock();
  expect(contexts).toHaveLength(1);
  const destination = contexts[0].destination as unknown as Node;
  const comps = created.filter((n) => n.kind === 'comp');
  expect(comps).toHaveLength(2);
  expect(reaches(comps[0], destination)).toBe(true);
  const before = created.length;
  expect(audio.play('combine')).toBe(true);
  const voice = created.slice(before);
  const sources = voice.filter((n) => n.kind === 'osc' || n.kind === 'buffer');
  expect(sources.length).toBeGreaterThan(0);
  for (const s of sources) expect(reaches(s, comps[0])).toBe(true);
  audio.dispose();
});

test('every named sound and every attack family builds a node graph without throwing', () => {
  const { created, contexts } = setup();
  const audio = createAudio();
  audio.unlock();
  let t = 1;
  const setTime = (time: number) => (contexts[0].currentTime = time);
  for (const name of SOUND_NAMES) {
    for (const tier of [1, 6]) {
      const before = created.length;
      t += 5;
      setTime(t);
      expect(() => audio.play(name, { tier, pan: 0.5 })).not.toThrow();
      expect(created.length).toBeGreaterThan(before);
    }
  }
  for (const family of ATTACK_FAMILIES) {
    t += 5;
    setTime(t);
    expect(audio.play('attack', { family, tier: 3 })).toBe(true);
  }
  audio.dispose();
});

test('volumes persist, clamp, and the mute toggle silences the master bus', () => {
  const { store, created } = setup();
  const audio = createAudio();
  audio.unlock();
  audio.setVolume('effects', 0.3);
  audio.setVolume('music', 7);
  audio.setMusicOn(false);
  expect(audio.getVolume('effects')).toBe(0.3);
  expect(audio.getVolume('music')).toBe(1);
  expect(JSON.parse(store[VOLUME_KEY])).toMatchObject({ effects: 0.3, music: 1, musicOn: false });
  const master = created.find((n) => n.kind === 'gain')!;
  audio.toggle();
  expect(audio.isMuted()).toBe(true);
  expect(audio.enabled.value).toBe(false);
  expect((master.gain as { value: number }).value).toBe(0);
  expect(audio.play('won')).toBe(false);
  audio.toggle();
  expect((master.gain as { value: number }).value).toBeGreaterThan(0);
  audio.dispose();

  setup({ [VOLUME_KEY]: store[VOLUME_KEY] });
  const again = createAudio();
  expect(again.getVolume('effects')).toBe(0.3);
  expect(again.isMusicOn()).toBe(false);
  setup({ 'facet-sound': 'off' });
  expect(createAudio().isMuted()).toBe(true);
  setup({ [VOLUME_KEY]: '{not json' });
  expect(createAudio().getVolume('master')).toBe(0.8);
});

test('rate and voice limits cap a flood of attacks while stingers still play', () => {
  const { created, contexts } = setup();
  const audio = createAudio();
  audio.unlock();
  const ctx = contexts[0];
  const before = created.length;
  // 40 towers at 10x speed: 400 attack requests inside 0.1 s of audio time.
  let played = 0;
  for (let i = 0; i < 400; i++) {
    ctx.currentTime = 1 + i * 0.00025;
    if (audio.play('attack', { family: ATTACK_FAMILIES[i % 8], tier: 1 + (i % 6) })) played++;
  }
  expect(played).toBeLessThanOrEqual(8 * 3);
  expect(played).toBeLessThanOrEqual(MAX_VOICES);
  expect(created.length - before).toBeLessThan(played * 12 + 1);
  expect(audio.stats.dropped).toBe(400 - played);
  expect(audio.play('boss-wave')).toBe(true);
  audio.dispose();
});

test('sim steps map events to sounds, ambience mood and finished voices disconnect', () => {
  const { created } = setup();
  const audio = createAudio();
  audio.unlock();
  const game = new Sim(loadData('classic'), 1).game;
  const play = vi.spyOn(audio, 'play');
  audio.step(game, undefined);
  game.phase = 'wave';
  game.events = [{ type: 'kill', id: 99, gold: 3 }];
  audio.step(game, 'wave');
  expect(play.mock.calls.map((c) => c[0])).toEqual(['kill', 'gold', 'wave']);
  play.mockClear();
  game.phase = 'build';
  game.events = [];
  audio.step(game, 'clear');
  expect(play.mock.calls.map((c) => c[0])).toEqual(['perfect']);
  play.mockClear();
  game.castleHp = 1;
  audio.step(game, 'leak');
  expect(play.mock.calls.map((c) => c[0])).toContain('castle-low');
  const ended = created.find((n) => typeof n.onended === 'function');
  expect(ended).toBeDefined();
  (ended!.onended as () => void)();
  expect(ended!.disconnect).toHaveBeenCalled();
  audio.dispose();
});

test('hidden tabs suspend and visible tabs resume the context', () => {
  const listeners: Record<string, () => void> = {};
  const doc = {
    visibilityState: 'visible',
    addEventListener: (k: string, f: () => void) => (listeners[k] = f),
  };
  vi.stubGlobal('document', doc);
  const { contexts } = setup();
  const audio = createAudio();
  audio.unlock();
  doc.visibilityState = 'hidden';
  listeners.visibilitychange();
  expect(contexts[0].suspend).toHaveBeenCalled();
  doc.visibilityState = 'visible';
  listeners.visibilitychange();
  expect(contexts[0].resume).toHaveBeenCalledTimes(2);
  audio.dispose();
});

test('unavailable audio and blocked storage do not prevent playing the game', () => {
  vi.stubGlobal('AudioContext', undefined);
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  });
  const audio = createAudio();
  expect(audio.available.value).toBe(false);
  expect(() => {
    audio.unlock();
    audio.toggle();
    audio.setVolume('master', 0.2);
    audio.play('wave');
  }).not.toThrow();
});

test('a transient resume rejection allows another player gesture to retry', async () => {
  const { contexts } = setup();
  const audio = createAudio();
  audio.unlock();
  contexts[0].resume.mockImplementationOnce(() => Promise.reject(new Error('gesture refused')));
  audio.unlock();
  await Promise.resolve();
  expect(audio.available.value).toBe(true);
  audio.unlock();
  expect(contexts[0].resume).toHaveBeenCalledTimes(3);
  audio.dispose();
});
