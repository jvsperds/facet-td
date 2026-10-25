import type { GameData } from '../data';
import { hash } from '../data';
import { Rng } from './rng';

/** Fixed sim rate; the view interpolates between ticks. */
export const TICK_HZ = 30;

/** Player action. Grows as rules are ported; every state change goes through one of these. */
export type Cmd = { type: 'noop' };
export type LogEntry = { tick: number; player: number; cmd: Cmd };

export interface Player {
  id: number;
}

/**
 * Pure game state. No DOM, no three.js, no wall clock, no Math.random (lint-enforced):
 * same data + seed + command log = same game, which gives replays, saves, and lockstep co-op.
 */
export class Sim {
  tick = 0;
  readonly rng: Rng;
  readonly players: Player[];
  readonly log: LogEntry[] = [];
  private queue: LogEntry[] = [];

  constructor(
    readonly data: GameData,
    readonly seed: number,
    playerCount = 1,
  ) {
    this.rng = new Rng(seed);
    this.players = Array.from({ length: playerCount }, (_, id) => ({ id }));
  }

  /** Queue a command for the next tick. */
  send(player: number, cmd: Cmd) {
    this.queue.push({ tick: this.tick, player, cmd });
  }

  step() {
    for (const e of this.queue) this.apply(e);
    this.log.push(...this.queue);
    this.queue = [];
    this.tick++;
  }

  private apply(e: LogEntry) {
    switch (e.cmd.type) {
      case 'noop':
        return;
    }
  }

  /** Hash of everything that defines the game state; equal hashes = identical games. */
  stateHash() {
    return hash(JSON.stringify([this.data.version, this.tick, this.rng.state, this.players]));
  }
}
