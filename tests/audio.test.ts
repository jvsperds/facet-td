import { afterEach, expect, test, vi } from 'vitest';
import { createAudio } from '../src/audio';

afterEach(() => vi.unstubAllGlobals());

test('audio unlocks lazily, caps busy combat cues, prioritizes warnings, and mutes immediately', () => {
  const parameter = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const gains: {
    gain: ReturnType<typeof parameter>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const tones: {
    onended: (() => void) | null;
    type: string;
    frequency: ReturnType<typeof parameter>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  const resume = vi.fn(() => Promise.resolve());
  const constructor = vi.fn();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      currentTime = 1;
      destination = {};
      resume = resume;
      constructor() {
        constructor();
      }
      createGain() {
        const node = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
        gains.push(node);
        return node;
      }
      createOscillator() {
        const node = {
          onended: null,
          type: '',
          frequency: parameter(),
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        tones.push(node);
        return node;
      }
    },
  );
  const audio = createAudio();
  audio.play('wave');
  expect(constructor).not.toHaveBeenCalled();
  audio.unlock();
  audio.play('attack');
  audio.play('attack');
  expect(tones).toHaveLength(1);
  audio.play('leak');
  expect(tones).toHaveLength(3);
  expect(tones[1].frequency.setValueAtTime).toHaveBeenCalledWith(180, 1);
  audio.toggle();
  expect(gains[0].gain.value).toBe(0);
  audio.play('won');
  expect(tones).toHaveLength(3);
  tones[0].onended!();
  expect(tones[0].disconnect).toHaveBeenCalled();
  audio.toggle();
  expect(constructor).toHaveBeenCalledTimes(1);
  expect(gains[0].gain.value).toBe(0.12);
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
    audio.play('wave');
  }).not.toThrow();
});

test('a transient resume rejection allows another player gesture to retry', async () => {
  const resume = vi
    .fn()
    .mockRejectedValueOnce(new Error('gesture refused'))
    .mockResolvedValue(undefined);
  vi.stubGlobal(
    'AudioContext',
    class {
      destination = {};
      resume = resume;
      createGain() {
        return { gain: { value: 0 }, connect() {} };
      }
    },
  );
  const audio = createAudio();
  audio.unlock();
  await Promise.resolve();
  expect(audio.available.value).toBe(true);
  audio.unlock();
  expect(resume).toHaveBeenCalledTimes(2);
});
