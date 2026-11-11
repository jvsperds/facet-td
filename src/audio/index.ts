import { signal } from '@preact/signals';
import type { Cue } from '../hud/feedback';
import { BOARD_SIZE } from '../sim/board';
import { isBasicGem, qualityOf, type Game } from '../sim/game';
import { attackOf, shotStyle } from '../world/effects';
import { createAmbience, type Mood } from './ambience';
import {
  ATTACK_FAMILIES,
  buildSound,
  createMasterChain,
  createNoise,
  SOUND_NAMES,
  type AttackFamily,
  type PlayOptions,
  type SoundName,
} from './engine';

export { ATTACK_FAMILIES, SOUND_NAMES };
export type { AttackFamily, Mood, PlayOptions, SoundName };

export const VOLUME_KEY = 'facet-td:volume';
export type Bus = 'master' | 'music' | 'ambience' | 'effects';
export interface VolumeSettings {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  muted: boolean;
  /** The generative music layer, independent of the ambience bed. */
  musicOn: boolean;
}
export const DEFAULT_VOLUME: VolumeSettings = {
  master: 0.8,
  music: 0.5,
  ambience: 0.6,
  effects: 0.8,
  muted: false,
  musicOn: true,
};
/** Master headroom so the bus sum sits under the compressor most of the time. */
const MASTER_SCALE = 0.6;
/** Voices alive at once before combat sounds are dropped (stingers always play). */
export const MAX_VOICES = 28;
/** Per-sound limits: minimum gap in seconds and voices at once (per family for attacks). */
const LIMITS: Partial<Record<SoundName, readonly [gap: number, max: number]>> = {
  attack: [0.035, 3],
  impact: [0.05, 3],
  kill: [0.05, 3],
  'kill-elite': [0.1, 2],
  gold: [0.07, 2],
  'count-up': [0.05, 2],
  'count-down': [0.05, 2],
  leak: [0.12, 2],
  'ui-click': [0.03, 2],
  build: [0.05, 2],
  stone: [0.05, 2],
};
const COMBAT = new Set<SoundName>(['attack', 'impact', 'kill', 'gold', 'count-up', 'count-down']);
/** Combat sounds vary a little in pitch and sit a bit lower in the mix. */
const COMBAT_GAIN: Partial<Record<SoundName, number>> = {
  attack: 0.45,
  impact: 0.4,
  kill: 0.6,
  gold: 0.5,
};

const clamp = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function loadVolume(): VolumeSettings {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<VolumeSettings>;
      return {
        master: clamp(v.master ?? DEFAULT_VOLUME.master),
        music: clamp(v.music ?? DEFAULT_VOLUME.music),
        ambience: clamp(v.ambience ?? DEFAULT_VOLUME.ambience),
        effects: clamp(v.effects ?? DEFAULT_VOLUME.effects),
        muted: v.muted === true,
        musicOn: v.musicOn !== false,
      };
    }
    // The older on/off setting.
    if (localStorage.getItem('facet-sound') === 'off') return { ...DEFAULT_VOLUME, muted: true };
  } catch {
    /* Storage can be disabled or hold junk. */
  }
  return { ...DEFAULT_VOLUME };
}

export type Audio = ReturnType<typeof createAudio>;

export function createAudio() {
  const volume = signal(loadVolume());
  const enabled = signal(!volume.value.muted);
  const available = signal(typeof AudioContext !== 'undefined');
  let context: AudioContext | undefined;
  let noise: AudioBuffer | undefined;
  const buses = {} as Record<Bus, GainNode>;
  let ambience: ReturnType<typeof createAmbience> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

  // Voice bookkeeping: end times in fixed arrays, so playing allocates only the nodes.
  const voices = new Float64Array(MAX_VOICES);
  const slots = new Map<string, Float64Array>();
  const lastPlayed = new Map<string, number>();
  const attackKeys = Object.fromEntries(ATTACK_FAMILIES.map((f) => [f, `attack:${f}`])) as Record<
    AttackFamily,
    string
  >;
  for (const name of SOUND_NAMES) {
    const limit = LIMITS[name];
    if (!limit) continue;
    if (name === 'attack')
      for (const f of ATTACK_FAMILIES) slots.set(attackKeys[f], new Float64Array(limit[1]));
    else slots.set(name, new Float64Array(limit[1]));
  }
  const stats = { played: 0, dropped: 0 };

  const level = (bus: Bus) =>
    bus === 'master'
      ? volume.value.muted
        ? 0
        : volume.value.master * MASTER_SCALE
      : volume.value[bus];
  const applyVolume = () => {
    if (!context) return;
    for (const bus of ['master', 'music', 'ambience', 'effects'] as const)
      buses[bus].gain.setTargetAtTime(level(bus), context.currentTime, 0.03);
    ambience?.setMusic(volume.value.musicOn);
  };
  const save = () => {
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify(volume.value));
    } catch {
      /* Keep the session preference. */
    }
  };
  const shouldRun = () => !volume.value.muted && !hidden;
  const sync = () => {
    if (!context) return;
    if (shouldRun()) void context.resume().catch(() => undefined);
    else if (typeof context.suspend === 'function') void context.suspend().catch(() => undefined);
  };
  const update = (patch: Partial<VolumeSettings>) => {
    volume.value = { ...volume.value, ...patch };
    enabled.value = !volume.value.muted;
    applyVolume();
    save();
  };
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', () => {
      hidden = document.visibilityState === 'hidden';
      sync();
    });

  // Game observation state.
  const families = new Map<string, AttackFamily>();
  const creepKind = new Map<number, 'kill' | 'kill-elite' | 'kill-boss'>();
  let castleMax = 0;
  let castleWarned = false;
  let waveLeaked = false;
  let bossAnnounced = false;
  let draft = -1;
  let stones = -1;

  const api = {
    enabled,
    available,
    /** Current volumes; read-only, change through the setters. */
    volume,
    stats,
    unlock() {
      if (!available.value || volume.value.muted) return;
      try {
        if (!context) {
          context = new AudioContext();
          noise = createNoise(context);
          buses.master = createMasterChain(context);
          for (const bus of ['music', 'ambience', 'effects'] as const) {
            buses[bus] = context.createGain();
            buses[bus].connect(buses.master);
          }
          for (const bus of ['master', 'music', 'ambience', 'effects'] as const)
            buses[bus].gain.value = level(bus);
          ambience = createAmbience(context, noise, buses.ambience, buses.music, Date.now());
          ambience.setMusic(volume.value.musicOn);
          timer = setInterval(() => {
            if (context?.state === 'running') ambience?.schedule(context.currentTime + 0.6);
          }, 250);
        }
        if (!hidden)
          void context.resume().catch(() => {
            /* Retry on the next gesture if the browser refused this one. */
          });
      } catch {
        available.value = false;
      }
    },
    getVolume(bus: Bus) {
      return volume.value[bus];
    },
    setVolume(bus: Bus, value: number) {
      update({ [bus]: clamp(value) });
    },
    isMuted() {
      return volume.value.muted;
    },
    setMuted(muted: boolean) {
      update({ muted });
      if (!muted) api.unlock();
      sync();
    },
    /** Mute toggle (the HUD's Sound button). */
    toggle() {
      api.setMuted(!volume.value.muted);
    },
    isMusicOn() {
      return volume.value.musicOn;
    },
    setMusicOn(on: boolean) {
      update({ musicOn: on });
    },
    /** Ambience tension: calm in build, tenser in waves and on boss waves. */
    setMood(mood: Mood) {
      ambience?.setMood(mood);
    },
    /** Play a named sound. Returns false when it was muted, locked or rate/voice limited. */
    play(name: SoundName | Cue | undefined, options: PlayOptions = {}): boolean {
      if (!name || !context || !noise || context.state !== 'running' || volume.value.muted)
        return false;
      const now = context.currentTime;
      const limit = LIMITS[name];
      const key = name === 'attack' ? attackKeys[options.family ?? 'shard'] : name;
      let slot = -1;
      let busy = 0;
      for (let i = 0; i < MAX_VOICES; i++)
        if (voices[i] > now) busy++;
        else if (slot < 0) slot = i;
      const combat = COMBAT.has(name);
      if (combat && slot < 0) {
        stats.dropped++;
        return false;
      }
      let own: Float64Array | undefined;
      let ownSlot = -1;
      if (limit) {
        if (now - (lastPlayed.get(key) ?? -1) < limit[0]) {
          stats.dropped++;
          return false;
        }
        own = slots.get(key)!;
        for (let i = 0; i < own.length; i++) if (own[i] <= now) ownSlot = i;
        if (ownSlot < 0) {
          stats.dropped++;
          return false;
        }
      }
      // Under load, combat sounds get quieter so the mix stays readable.
      const crowd = combat ? 1 - (busy / MAX_VOICES) * 0.5 : 1;
      const opts: PlayOptions = {
        ...options,
        gain: (options.gain ?? 1) * (COMBAT_GAIN[name] ?? 1) * crowd,
        pitch: (options.pitch ?? 1) * (combat ? 0.96 + Math.random() * 0.08 : 1),
      };
      const length = buildSound(context, noise, buses.effects, name, now + 0.005, opts);
      const end = now + length;
      if (slot >= 0) voices[slot] = end;
      if (own) own[ownSlot] = end;
      lastPlayed.set(key, now);
      stats.played++;
      return true;
    },
    /** Sounds for one sim step: the feedback cue plus detail read from the step's events. */
    step(game: Game, cue: Cue | undefined) {
      if (!context || context.state !== 'running') {
        draft = game.draft.length;
        stones = game.stones.size;
        return;
      }
      castleMax = Math.max(castleMax, game.castleHp);
      if (cue === 'wave') {
        waveLeaked = false;
        bossAnnounced = false;
      }
      for (const c of game.creeps)
        if (!creepKind.has(c.id)) {
          creepKind.set(c.id, c.boss ? 'kill-boss' : c.elite ? 'kill-elite' : 'kill');
          if (c.boss && !bossAnnounced) bossAnnounced = api.play('boss-wave');
        }
      for (const e of game.events) {
        if (e.type === 'attack') {
          if (e.via === 'attack' || e.via === 'split') {
            const gem = game.gems.find((g) => g.id === e.from);
            if (!gem) continue;
            let family = families.get(gem.name);
            if (!family) {
              family = attackOf(gem.name)?.[0] ?? shotStyle(game.abilities(gem.name));
              families.set(gem.name, family);
            }
            const tier = isBasicGem(gem.name) ? qualityOf(gem.name) : 5;
            api.play('attack', { family, tier, pan: ((2 * e.x) / BOARD_SIZE - 1) * 0.6 });
          } else if (e.via === 'splash')
            api.play('impact', { pan: ((2 * e.x) / BOARD_SIZE - 1) * 0.6 });
        } else if (e.type === 'kill') {
          api.play(creepKind.get(e.id) ?? 'kill');
          creepKind.delete(e.id);
          if (e.gold > 0) api.play('gold');
        } else if (e.type === 'leak') {
          creepKind.delete(e.id);
          waveLeaked = true;
        }
      }
      if (draft >= 0 && game.draft.length === 0 && draft > 0 && game.phase === 'wave')
        api.play('keep');
      draft = game.draft.length;
      if (stones >= 0 && game.stones.size > stones && cue !== 'build') api.play('stone');
      stones = game.stones.size;
      const low = castleMax > 0 && game.castleHp > 0 && game.castleHp <= castleMax * 0.25;
      if (low && !castleWarned) api.play('castle-low');
      castleWarned = low;
      const boss = game.phase === 'wave' && game.creeps.some((c) => c.boss);
      api.setMood(game.phase === 'wave' ? (boss ? 'boss' : 'wave') : 'build');
      if (cue === 'clear' && !waveLeaked) api.play('perfect');
      // Attack and kill detail came from the events above.
      else if (cue && cue !== 'attack' && cue !== 'kill') api.play(cue);
    },
    /** Stop everything (tests and teardown). */
    dispose() {
      if (timer) clearInterval(timer);
      ambience?.stop();
      void context?.close?.();
      context = undefined;
    },
  };
  return api;
}
