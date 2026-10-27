import { signal } from '@preact/signals';
import type { Cue } from './hud/feedback';

const NOTES: Record<Cue, number[]> = {
  attack: [660],
  kill: [880, 1175],
  leak: [180, 120],
  wave: [330, 440, 660],
  clear: [523, 659, 784],
  'clear-leak': [180, 120, 523, 659, 784],
  won: [523, 659, 784, 1047],
  lost: [330, 220, 110],
  build: [440],
};

export type Audio = ReturnType<typeof createAudio>;

export function createAudio() {
  const enabled = signal(true);
  const available = signal(typeof AudioContext !== 'undefined');
  try {
    enabled.value = localStorage.getItem('facet-sound') !== 'off';
  } catch {
    /* Storage can be disabled. */
  }
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let nextCue = 0;
  return {
    enabled,
    available,
    unlock() {
      if (!enabled.value || !available.value) return;
      try {
        if (!context) {
          context = new AudioContext();
          master = context.createGain();
          master.gain.value = 0.12;
          master.connect(context.destination);
        }
        void context.resume().catch(() => {
          /* Retry on the next gesture if the browser refused this one. */
        });
      } catch {
        available.value = false;
      }
    },
    toggle() {
      enabled.value = !enabled.value;
      if (master) master.gain.value = enabled.value ? 0.12 : 0;
      try {
        localStorage.setItem('facet-sound', enabled.value ? 'on' : 'off');
      } catch {
        /* Keep the session preference. */
      }
      this.unlock();
    },
    play(cue: Cue | undefined) {
      if (!cue || !enabled.value || !context || context.state !== 'running' || !available.value)
        return;
      const now = context.currentTime;
      if ((cue === 'attack' || cue === 'kill') && now < nextCue) return;
      nextCue = now + 0.08;
      const short = cue === 'attack' || cue === 'build';
      NOTES[cue].forEach((frequency, i) => {
        const start = now + i * 0.09;
        const oscillator = context!.createOscillator();
        const gain = context!.createGain();
        oscillator.type =
          cue === 'leak' || cue === 'lost' || (cue === 'clear-leak' && i < 2) ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(short ? 0.25 : 0.5, start + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, start + (short ? 0.06 : 0.16));
        oscillator.connect(gain);
        gain.connect(master!);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + 0.18);
      });
    },
  };
}
